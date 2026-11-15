#!/usr/bin/env bash
# The fuzzer's I1 (138 steps). Workspace 2, two windows that each have a modal dialog, lives on
# the second monitor. The monitor goes away, 2 is shown on the first, the monitor comes back; over
# and over, with the gap before the return varied, because the failure is a race. When the monitor
# returns KWin may put a window and its dialog back on it itself, into that monitor's tile, while
# kwin-i3's record still says the first monitor's tile (INVARIANT "window w3 not in its tile").
# Placing a window the tile already lists takes that tile as the one it is in.
source "$(dirname "$0")/lib.sh"
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
settle() { sleep 1; }
# A lost monitor's workspaces move to the first one for good, as in i3; only an
# assignment brings 2 back to the returning monitor, which this scenario's geometry checks rely on.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key workspaceOutputs "2=Virtual-1"
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
