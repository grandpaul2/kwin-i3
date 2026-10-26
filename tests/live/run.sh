#!/usr/bin/env bash
# Build, then run every live scenario, each in its own headless KWin, all at once; then the ones
# marked "# timing: alone", one by one, so their timing checks measure the code, not ~30 KWins
# sharing one GPU (53-hold's 240 Hz snapshot: 1.2 ms alone, 70-112 ms in the batch, 2026-10-24).
#   tests/live/run.sh [scenario...]      default: every NN-*.sh
# Each scenario's output is printed whole, in order, when all are done. A scenario counts as
# passed only if it exits 0 AND printed its "N passed, 0 failed" line (review fault 6).
set -u
LC_NUMERIC=C        # $EPOCHREALTIME with a point, whatever the locale (the timings, below)
cd "$(dirname "$0")"
../../build.sh || exit 1
scenarios=("$@"); [[ ${#scenarios[@]} -gt 0 ]] || scenarios=([0-9][0-9]-*.sh)
batch=() alone=()
for t in "${scenarios[@]}"; do
    # "# needs: xwayland": its test KWin starts Xwayland (KI3_XWAYLAND), whose display search is
    # not parallel-safe (tools/testkwin.sh): alone, like the timing scenarios.
    if grep -qE '^# (timing: alone|needs: xwayland)$' "$t"; then alone+=("$t"); else batch+=("$t"); fi
done
# At most KI3_JOBS test KWins at once (default: one per core), the rest queued: with all 44 at once
# on 16 cores, some missed testkwin's 15 s start (2026-10-25: 1, then 6, all green when rerun).
maxjobs=${KI3_JOBS:-$(nproc)}
# How many test KWins share the GPU: timing checks (53-hold.sh) allow for it; 1 for those alone.
export KI3_PARALLEL=$(( ${#batch[@]} < maxjobs ? ${#batch[@]} : maxjobs ))
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
# "# needs: plugin" in a scenario: its test KWin loads plugin/ (built by make plugin). The plugins
# are optional: with no build (no kwin-devel), those scenarios are skipped, and the summary says so.
plugins=$(cd ../../plugin/build/bin 2>/dev/null && pwd)
# "# needs: kcm": the scenario runs the settings page (kcm/, make kcm, which needs
# kf6-kcmutils-devel), with kwin-i3 installed as a package (KI3_PACKAGE, tools/testkwin.sh); with
# no build, skipped and said so, as the plugins are.
kcm=$(cd ../../kcm/build/bin 2>/dev/null && [[ -f plasma/kcms/systemsettings/kcm_kwin_i3.so ]] && pwd)
skipped=()
# "# desktops: N" in a scenario: its test KWin starts with N virtual desktops (default 10);
# "# peroutput: false": with per-output desktops off (default on).
# KI3_STOCK=1 (make live-stock, docs/spec-stock-mode.md): Plasma's stock settings, one desktop,
# per-output on, and those two headers ignored; "# focus: mouse" gives the scenario focus follows
# mouse, and "# stock: own" runs it as the default mode does.
launch() {
    local t=$1 plugin="" desktops perout stock="" focus=""
    desktops=$(sed -n 's/^# desktops: \([0-9]*\)$/\1/p' "$t") perout=$(sed -n 's/^# peroutput: \([a-z]*\)$/\1/p' "$t")
    if [[ ${KI3_STOCK:-} == 1 ]] && ! grep -q '^# stock: own$' "$t"; then
        stock=1 desktops=1 perout=true focus=$(sed -n 's/^# focus: \([a-z]*\)$/\1/p' "$t")
    fi
    grep -q '^# needs: plugin' "$t" && plugin=$plugins
    local package=""; grep -q '^# needs: kcm' "$t" && package=1
    local xwayland=""; grep -q '^# needs: xwayland' "$t" && xwayland=1
    local t0=$EPOCHREALTIME
    KI3_XWAYLAND=$xwayland KI3_PACKAGE=$package KI3_STOCK=$stock KI3_FOCUS=$focus KI3_PLUGIN=$plugin KI3_DESKTOPS=${desktops:-10} KI3_PEROUTPUT=${perout:-true} timeout 110 ../../tools/testkwin.sh "./$t" >"$out/$t.log" 2>&1; echo $? >"$out/$t.status"
    echo "$t0 $EPOCHREALTIME" >"$out/$t.time"
}
needs_missing() {
    { grep -q '^# needs: plugin' "$1" && [[ -z $plugins ]]; } || { grep -q '^# needs: kcm' "$1" && [[ -z $kcm ]]; } ||
        { grep -q '^# needs: xwayland' "$1" && ! command -v Xwayland >/dev/null; }
}
start=$EPOCHREALTIME
for t in "${batch[@]}"; do
    if needs_missing "$t"; then skipped+=("$t"); continue; fi
    while (( $(jobs -rp | wc -l) >= maxjobs )); do wait -n; done
    launch "$t" &
done
wait
batched=$EPOCHREALTIME
for t in "${alone[@]}"; do
    if needs_missing "$t"; then skipped+=("$t"); continue; fi
    KI3_PARALLEL=1 launch "$t"
done
status=0
for t in "${scenarios[@]}"; do
    [[ " ${skipped[*]} " == *" $t "* ]] && continue
    echo "$t"
    grep -vE 'Gdk-Message|Gtk-WARNING' "$out/$t.log"
    s=$(cat "$out/$t.status")
    if [[ $s != 0 ]] || ! grep -qE '^  [0-9]+ passed, 0 failed$' "$out/$t.log"; then
        [[ $s == 124 ]] && echo "  FAIL timed out"
        [[ $s != 0 && $s != 124 && $s != 1 ]] && echo "  FAIL exited $s"
        status=1
    fi
done
# Where the time went (docs: the alone tail usually dominates): the batch and the tail's wall
# time, and the ten slowest scenarios (alone ones marked).
end=$EPOCHREALTIME
awk -v s="$start" -v b="$batched" -v e="$end" 'BEGIN { printf "TIME batch %.1f s, alone %.1f s, total %.1f s; slowest:\n", b - s, e - b, e - s }'
for t in "${scenarios[@]}"; do
    [[ -f $out/$t.time ]] || continue
    awk -v t="$t" -v al="$([[ " ${alone[*]} " == *" $t "* ]] && echo "  (alone)")" '{ printf "%7.1f s  %s%s\n", $2 - $1, t, al }' "$out/$t.time"
done | sort -rn | head -10
[[ ${#skipped[@]} -gt 0 ]] && echo "SKIPPED, no plugin or page build (make plugin needs kwin-devel, make kcm kf6-kcmutils-devel): ${skipped[*]}"
exit $status
