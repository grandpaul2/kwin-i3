#!/usr/bin/env bash
# Workspaces created on demand, as i3 creates them: a stock Plasma has one virtual desktop, and
# kwin-i3 adds KWin's desktops up to the one a key or a monitor needs, never removing any
# (docs/records/spec-desktops-on-demand.md).
# desktops: 1
source "$(dirname "$0")/lib.sh"
count_is() { [[ "$(kjs 'log(workspace.desktops.length)')" == "$1" ]]; }
shows() { [[ "$(kjs "log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(workspace.screens[$1])) + 1)")" == "$2" ]]; }
on_ws() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(workspace.desktops.indexOf(w.desktops[0]) + 1); });")" == "$2" ]]; }
saved_number() { grep -qx "Number=$1" "$XDG_CONFIG_HOME/kwinrc"; }
check "the test KWin starts with one desktop" count_is 1
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. At login each monitor gets its own workspace: 2 is created for the second.
check "at load: two desktops"               poll count_is 2
check "screen 0 shows workspace 1"          poll shows 0 1
check "screen 1 shows workspace 2"          poll shows 1 2

# 2. Meta+5 creates 3..5 and shows 5 on the current monitor.
press Meta+5
check "Meta+5: five desktops"               poll count_is 5
check "screen 0 shows workspace 5"          poll shows 0 5
check "screen 1 still shows workspace 2"    shows 1 2

# 3. Meta+Shift+7 creates 6..7 and sends the window there.
client --title W
check "W opened on workspace 5"             poll on_ws W 5
press Meta+Shift+7
check "Meta+Shift+7: seven desktops"        poll count_is 7
check "W is on workspace 7"                 poll on_ws W 7

# 4. An existing workspace creates nothing.
press Meta+3
check "Meta+3 shows workspace 3"            poll shows 0 3
check "still seven desktops"                count_is 7

# 5. KWin saved the count, as for a desktop added anywhere else.
check "kwinrc says Number=7"                poll saved_number 7
check "no invariant failures or errors"     clean_log
finish
