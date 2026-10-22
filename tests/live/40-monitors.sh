#!/usr/bin/env bash
# Phase 3: workspaces on two monitors (Virtual-0 at x 0, Virtual-1 at x 1280, 1280x720 each).
source "$(dirname "$0")/lib.sh"
screen_is() { [[ "$(kjs 'log(workspace.activeScreen.name)')" == "$1" ]]; }
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
cursor_on() {   # the pointer is on that screen
    local x; x=$(kjs 'log(Math.round(workspace.cursorPos.x))')
    if [[ $1 == Virtual-0 ]]; then (( x < 1280 )); else (( x >= 1280 )); fi
}
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

check "login numbering: 1 on the first monitor" poll shows Virtual-0 1
check "login numbering: 2 on the second"    poll shows Virtual-1 2

client --title a
check "a on workspace 1, first monitor"     geom_is a "0,0 1280x720"
key "Workspace 2"
check "Meta+2: the second monitor is active" poll screen_is Virtual-1
check "the pointer went with it"            poll cursor_on Virtual-1
client --title b
check "b opens on workspace 2"              wait_tree 2 "H[b*]"
check "b fills the second monitor"          geom_is b "1280,0 1280x720"

key "Focus Left"
check "focus left crosses to a"             poll active_is a
check "the pointer followed"                poll cursor_on Virtual-0

key "Move Right"
check "a lone window moves to the other monitor's workspace" wait_tree 2 "H[a* b]"
check "entering from the left, it goes first" geom_is a "1280,0 640x720"
check "workspace 1 is empty"                wait_tree 1 "H[]"

key "Move to Workspace 3"
check "Meta+Shift+3: a goes to workspace 3" wait_tree 3 "H[a]"
check "focus stays on workspace 2"          wait_tree 2 "H[b*]"
check "b fills the second monitor again"    geom_is b "1280,0 1280x720"
key "Workspace 3"
check "Meta+3: workspace 3 shows where a went (second monitor)" poll shows Virtual-1 3
check "a fills it"                          geom_is a "1280,0 1280x720"
check "and has the focus"                   poll active_is a
key "Workspace 2"
check "Meta+2: back to b, same monitor"     poll shows Virtual-1 2
check "the first monitor still shows 1"     poll shows Virtual-0 1
key "Focus Left"
key "Workspace 4"
check "Meta+4 (empty, hidden) opens on the current, first monitor" poll shows Virtual-0 4
check "and the second keeps 2"              poll shows Virtual-1 2
key "Workspace 2"
key "Workspace 5"
check "Meta+5 from the second monitor opens there" poll shows Virtual-1 5
key "Workspace 2"
key "Focus Left"

# The monitor-wake bug of 2026-10-21: a monitor drops out and comes back. Its windows must
# come back with it, on their own workspaces.
key "Workspace 1"
client --title c
check "c on workspace 1"                    wait_tree 1 "H[c*]"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
one_screen() { [[ "$(kjs 'log(workspace.screens.length)')" == 1 ]]; }
check "the second monitor is gone"          poll one_screen
check "b keeps its workspace"               wait_tree 2 "H[b]"
output_of() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name); })"; }
on_output() { [[ "$(output_of "$1")" == "$2" ]]; }
check "meanwhile b is on the remaining monitor (so the replug test means something)" poll on_output b Virtual-0
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
two_screens() { [[ "$(kjs 'log(workspace.screens.length)')" == 2 ]]; }
check "it is back"                          poll two_screens
check "b goes back to it by itself, before any key is pressed" poll on_output b Virtual-1
key "Workspace 2"
check "workspace 2 is on the second monitor again" poll shows Virtual-1 2
check "b is back on the second monitor"     geom_is b "1280,0 1280x720"
check "c stayed on the first"               geom_is c "0,0 1280x720"
check "and workspace 1 still holds only c"  wait_tree 1 "H[c]"

check "no invariant failures or errors"     clean_log
finish
