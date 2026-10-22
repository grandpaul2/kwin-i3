#!/usr/bin/env bash
# The fuzzer's I2, shrunk: while the second monitor is away, a window is sent to the workspace it
# showed (2). Workspace 2 now lives on the first monitor (an empty hidden workspace comes to the
# window, as in i3). When the monitor returns it must not show 2 again, empty, while 2's window
# is placed out of sight on the first: it gets an unused workspace, as i3 gives a returning
# output a new one.
source "$(dirname "$0")/lib.sh"
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title a
check "a on workspace 1"                    wait_tree 1 "H[a*]"
check "the second monitor shows 2"          poll shows Virtual-1 2
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone"          poll screens_are 1
key "Move to Workspace 2"
check "a went to workspace 2"               wait_tree 2 "H[a]"
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "it is back"                          poll screens_are 2
not_2() { ! shows Virtual-1 2; }
check "the returned monitor doesn't show 2" poll not_2
check "it shows an unused workspace, 3"     poll shows Virtual-1 3
key "Workspace 2"
check "Meta+2 shows 2 on the first monitor, where it lives now" poll shows Virtual-0 2
check "a fills it"                          geom_is a "0,0 1280x720"
check "no invariant failures or errors"     clean_log
finish
