#!/usr/bin/env bash
# Build, then run every live scenario, each in its own headless KWin, all at once.
#   tests/live/run.sh [scenario...]      default: every NN-*.sh
# Each scenario's output is printed whole, in order, when all are done. A scenario counts as
# passed only if it exits 0 AND printed its "N passed, 0 failed" line (review fault 6).
set -u
cd "$(dirname "$0")"
../../build.sh || exit 1
scenarios=("$@"); [[ ${#scenarios[@]} -gt 0 ]] || scenarios=([0-9][0-9]-*.sh)
# How many test KWins share the GPU: timing checks (53-hold.sh) allow for it.
export KI3_PARALLEL=${#scenarios[@]}
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
# "# needs: plugin" in a scenario: its test KWin loads plugin/ (built by make plugin). The plugins
# are optional: with no build (no kwin-devel), those scenarios are skipped, and the summary says so.
plugins=$(cd ../../plugin/build/bin 2>/dev/null && pwd)
skipped=()
# "# desktops: N" in a scenario: its test KWin starts with N virtual desktops (default 10);
# "# peroutput: false": with per-output desktops off (default on).
# KI3_STOCK=1 (make live-stock, docs/spec-stock-mode.md): Plasma's stock settings, one desktop,
# per-output on, and those two headers ignored; "# focus: mouse" gives the scenario focus follows
# mouse, and "# stock: own" runs it as the default mode does.
for t in "${scenarios[@]}"; do
    plugin="" desktops=$(sed -n 's/^# desktops: \([0-9]*\)$/\1/p' "$t") perout=$(sed -n 's/^# peroutput: \([a-z]*\)$/\1/p' "$t")
    stock="" focus=""
    if [[ ${KI3_STOCK:-} == 1 ]] && ! grep -q '^# stock: own$' "$t"; then
        stock=1 desktops=1 perout=true focus=$(sed -n 's/^# focus: \([a-z]*\)$/\1/p' "$t")
    fi
    if grep -q '^# needs: plugin' "$t"; then
        if [[ -z $plugins ]]; then skipped+=("$t"); continue; fi
        plugin=$plugins
    fi
    ( KI3_STOCK=$stock KI3_FOCUS=$focus KI3_PLUGIN=$plugin KI3_DESKTOPS=${desktops:-10} KI3_PEROUTPUT=${perout:-true} timeout 110 ../../tools/testkwin.sh "./$t" >"$out/$t.log" 2>&1; echo $? >"$out/$t.status" ) &
done
wait
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
[[ ${#skipped[@]} -gt 0 ]] && echo "SKIPPED, no plugin build (make plugin needs kwin-devel): ${skipped[*]}"
exit $status
