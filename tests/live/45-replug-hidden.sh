#!/usr/bin/env bash
# The fuzzer's I2 (seed 1 of 2026-10-22's campaign, shrunk from 46 actions to these 10): the
# second monitor goes away and comes back. Its workspace (2) is hidden on the first meanwhile, and
# taking 2's window off its tile made KWin give it back its size from before it was tiled; a hidden
# window never acknowledges a new size, and KWin applies no geometry to it until it does, so when
# the monitor returned the window stayed out of sight on the first monitor at 400x328, tiled on 2
# but not in its tile. kwin-i3 now keeps a hidden window's geometry when it takes it off a tile.
source "$(dirname "$0")/lib.sh"
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
# The fuzzer settles about a second after each action; without that the failure didn't show.
settle() { sleep 1; }
# Since redo stage 4 a lost monitor's workspaces move to the first one for good, as in i3; only an
# assignment brings 2 back to the returning monitor, which this scenario's geometry checks rely on.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key workspaceOutputs "2=Virtual-1"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title w3 --retitle 0.5:w3r; settle
client --title w4 --retitle 0.5:w4r; settle
key "Move to Workspace 2"; settle
check "w4 sent to workspace 2, on the second monitor" poll eval '[[ "$(tree 2)" == "H[w4"* ]]'
client --title w5 --retitle 0.5:w5r; settle
client --title w6 --min 900x530; settle
client --title w7; settle
client --title w8 --retitle 0.5:w8r; settle
client --title w9 --dialog; settle
check "w9's dialog is up"                   poll eval '[[ "$(tree 1)" == *"~w9_dialog"* ]]'
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1; settle
check "the second monitor is gone"          poll screens_are 1
# A plain enable gives the returning output priority 1 (it becomes KWin's primary, screenOrder's
# first); Plasma's display daemon puts the saved priorities back on a real replug, so do that here (on Virtual-1: setting Virtual-0 to the 1 it already has is a no-op).
timeout 10 kscreen-doctor output.Virtual-1.enable output.Virtual-1.priority.2 >/dev/null 2>&1
check "it is back"                          poll screens_are 2
check "workspace 2 is w4r alone"            wait_tree 2 "H[w4r]"
check "w4r fills the second monitor again"  geom_is w4r "1280,0 1280x720"
check "no invariant failures or errors"     clean_log
finish
