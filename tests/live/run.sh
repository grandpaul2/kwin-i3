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
for t in "${scenarios[@]}"; do
    # "# needs: plugin" in a scenario: its test KWin loads plugin/ (built by make plugin)
    plugin=""; grep -q '^# needs: plugin' "$t" && plugin=$(cd ../../plugin/build/bin 2>/dev/null && pwd)
    ( KI3_PLUGIN=$plugin timeout 110 ../../tools/testkwin.sh "./$t" >"$out/$t.log" 2>&1; echo $? >"$out/$t.status" ) &
done
wait
status=0
for t in "${scenarios[@]}"; do
    echo "$t"
    grep -vE 'Gdk-Message|Gtk-WARNING' "$out/$t.log"
    s=$(cat "$out/$t.status")
    if [[ $s != 0 ]] || ! grep -qE '^  [0-9]+ passed, 0 failed$' "$out/$t.log"; then
        [[ $s == 124 ]] && echo "  FAIL timed out"
        [[ $s != 0 && $s != 124 && $s != 1 ]] && echo "  FAIL exited $s"
        status=1
    fi
done
exit $status
