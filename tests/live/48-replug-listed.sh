#!/usr/bin/env bash
# The fuzzer's I1 (seed 2 of the 2026-10-23 run, 138 steps). Workspace 2, two windows that each
# have a modal dialog, lives on the second monitor. The monitor goes away, 2 is shown on the first,
# the monitor comes back; over and over, with the gap before the return varied, because the failure
# is a race (it showed in about one run of four). When the monitor returns KWin may put a window
# and its dialog back on it itself, into that monitor's tile; kwin-i3 had the first monitor's tile
# as "the tile we put it in". The INVARIANT line "window w3 not in its tile" came from that stale
# record. Placing a window the tile already lists now takes that tile as the one it is in.
source "$(dirname "$0")/lib.sh"
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
settle() { sleep 1; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
key "Workspace 2"; settle
client --title w3 --dialog; settle
client --title w12 --dialog; settle
check "workspace 2 is w3 | w12"             poll eval '[[ "$(tree 2)" == "H[w3 w12"* ]]'
for gap in 0 0.1 0.2 0.3 0.5 0.8 0 0.1 0.2 0.3 0.5 0.8; do
    timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
    poll screens_are 1 || break
    settle
    key "Workspace 2"; sleep "$gap"
    timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
    poll screens_are 2 || break
    settle
    clean_log || break
done
check "w3 is on the second monitor"         geom_is w3 "1280,0 640x720"
check "no invariant failures or errors"     clean_log
finish
