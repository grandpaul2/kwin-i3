#!/usr/bin/env bash
# Build, then run every live scenario, each in its own headless KWin, all at once.
#   tests/live/run.sh [scenario...]      default: every NN-*.sh
# Each scenario's output is printed whole, in order, when all are done. A scenario counts as
# passed only if it exits 0 AND printed its "N passed, 0 failed" line (review fault 6).
set -u
cd "$(dirname "$0")"
../../build.sh || exit 1
scenarios=("$@"); [[ ${#scenarios[@]} -gt 0 ]] || scenarios=([0-9][0-9]-*.sh)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
for t in "${scenarios[@]}"; do
    ( timeout 110 ../../tools/testkwin.sh "./$t" >"$out/$t.log" 2>&1; echo $? >"$out/$t.status" ) &
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
