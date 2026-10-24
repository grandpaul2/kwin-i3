#!/usr/bin/env bash
# focus: mouse
# The fuzzer's I4, shrunk: the monitor holding the focused workspace is unplugged. Its workspace
# is reconciled on the remaining monitor while that still shows another one, so KWin lists the
# window in a tile without placing it (Tile::manage only places on a current desktop); then focus
# shows the workspace there. The window must fill the monitor, not sit untiled beside a hole.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
key "Workspace 2"
client --title a; client --title b
check "a | b on workspace 2"                wait_tree 2 "H[a b*]"
m=$(mark)
drag Meta left 1600 360 1343 275
check "a dragged out: it floats"            wait_tree 2 "H[b] ~a*" "$m"   # focused: it is under the pointer
point 1920 360
check "b fills the second monitor"          geom_is b "1280,0 1280x720"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
one_screen() { [[ "$(kjs 'log(workspace.screens.length)')" == 1 ]]; }
check "the second monitor is gone"          poll one_screen
shows2() { [[ "$(kjs 'log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(workspace.screens[0])) + 1)')" == 2 ]]; }
check "the remaining monitor shows the focused workspace, 2" poll shows2
check "b fills it"                          geom_is b "0,0 1280x720"
check "no invariant failures or errors"     clean_log
finish
