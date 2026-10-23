#!/usr/bin/env bash
# The fuzzer's I2 (seed 7 of 2026-10-23's campaign, shrunk from 51 actions to this): the second
# monitor goes away; its workspace (2) holds a fixed-size window that is made fullscreen on the
# first monitor meanwhile (a fullscreen request such a window cannot apply). When the monitor
# returns, kwin-i3 shows 1 and 2 again and moves 2's windows to the second monitor, but KWin
# leaves that window's output at the first. Then kwin-i3 activates it (it is the focus), and
# activating a window on a hidden desktop switches the current desktop of ITS output: the first
# monitor was switched to 2. Both showed 2, and workspace 2's tiled windows (not in this
# reduction) stood outside the first monitor. kwin-i3 now puts back what that monitor showed.
source "$(dirname "$0")/lib.sh"
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
settle() { sleep 1; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title b --fixed --size 770x230; settle
key "Move to Workspace 2"; settle
check "b went to workspace 2"               wait_tree 2 "H[] ~b"
key "Workspace 2"; settle
check "the second monitor shows 2"          poll shows Virtual-1 2
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1; settle
check "the second monitor is gone"          poll screens_are 1
busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "Window Fullscreen" >/dev/null; settle
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "it is back"                          poll screens_are 2
settle; settle
check "the first monitor shows 1 again"     poll shows Virtual-0 1
check "the second monitor shows 2 again"    poll shows Virtual-1 2
check "no invariant failures or errors"     clean_log
finish
