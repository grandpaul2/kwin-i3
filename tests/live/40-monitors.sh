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
point 1900 600                        # the pointer on the second monitor before kwin-i3 starts
load_kwin_i3
wait_log 'kwin-i3 loaded$'

check "login numbering: 1 on the first monitor" poll shows Virtual-0 1
check "login numbering: 2 on the second"    poll shows Virtual-1 2
# i3's start: the focus on the output under the pointer (§12 P2, redo stage 2): an empty, hidden
# workspace opens on the focused output.
key "Workspace 3"
check "login: the focus is on the monitor under the pointer (Meta+3 opens there)" poll shows Virtual-1 3
key "Workspace 2"
check "Meta+2: 2 is back on the second monitor" poll shows Virtual-1 2
key "Workspace 1"
check "Meta+1: the pointer comes to the first monitor" poll cursor_on Virtual-0

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
check "Meta+4 (empty, hidden) opens on the focused, first monitor" poll shows Virtual-0 4
check "and the second keeps 2"              poll shows Virtual-1 2
key "Workspace 2"
key "Workspace 5"
check "Meta+5 from the second monitor opens there" poll shows Virtual-1 5
key "Workspace 2"
key "Focus Left"

# A monitor drops out and comes back (the monitor-wake bug of 2026-10-21, 2026-10-28's i3 rule,
# redo stage 4): its workspaces move to the first monitor for good; the returning monitor shows a
# free workspace, not the one it showed; an assignment (workspaceOutputs) is what brings a workspace
# back. The focus goes to the first monitor's workspace after either change (§5 D5).
key "Workspace 1"
client --title c
check "c on workspace 1"                    wait_tree 1 "H[c*]"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
one_screen() { [[ "$(kjs 'log(workspace.screens.length)')" == 1 ]]; }
check "the second monitor is gone"          poll one_screen
check "b keeps its workspace"               wait_tree 2 "H[b]"
output_of() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name); })"; }
on_output() { [[ "$(output_of "$1")" == "$2" ]]; }
check "b is on the remaining monitor"       poll on_output b Virtual-0
check "the first monitor keeps showing 1, with the focus" poll active_is c
m=$(mark)
# A plain enable gives the returning output priority 1 (it becomes KWin's primary, screenOrder's
# first); Plasma's display daemon puts the saved priorities back on a real replug, so do that here (on Virtual-1: setting Virtual-0 to the 1 it already has is a no-op).
timeout 10 kscreen-doctor output.Virtual-1.enable output.Virtual-1.priority.2 >/dev/null 2>&1
two_screens() { [[ "$(kjs 'log(workspace.screens.length)')" == 2 ]]; }
check "it is back"                          poll two_screens
check "the returning monitor shows a free workspace (4), not 2" poll shows Virtual-1 4
# After kwin-i3 has reconciled: KWin itself briefly puts b back on its old monitor.
check "reconciled after the replug"         wait_log '^.{9}TREE 2 ' "$m"
check "b stays on the first monitor (its workspace moved for good)" poll on_output b Virtual-0
sleep 0.3
check "still there"                         on_output b Virtual-0
check "the focus is on the first monitor's workspace (c)" poll active_is c
key "Workspace 2"
check "Meta+2 shows 2 on the first monitor, where it lives now" poll shows Virtual-0 2
check "b fills the first monitor"           geom_is b "0,0 1280x720"

# Assigned, a workspace goes back: 2=Virtual-1, the monitor away and back; meanwhile Meta+2 shows 2
# on the remaining monitor, which then shows the workspace it showed before (1, c).
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
m=$(mark)
set_key workspaceOutputs "2=Virtual-1"
key "Reload Settings"
check "reload: 2 assigned to the second monitor" wait_log '^.{9}SETTINGS workspaceOutputs$' "$m"
key "Workspace 1"
check "Meta+1: c has the focus"             poll active_is c
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "unplugged again"                     poll one_screen
key "Workspace 2"
check "Meta+2 shows 2 on the remaining monitor" poll shows Virtual-0 2
m=$(mark)
# A plain enable gives the returning output priority 1 (it becomes KWin's primary, screenOrder's
# first); Plasma's display daemon puts the saved priorities back on a real replug, so do that here (on Virtual-1: setting Virtual-0 to the 1 it already has is a no-op).
timeout 10 kscreen-doctor output.Virtual-1.enable output.Virtual-1.priority.2 >/dev/null 2>&1
check "replugged"                           poll two_screens
# After kwin-i3 has reconciled, not the first moment: KWin itself briefly puts b back on its old
# monitor, and a wrong home moves it away again a moment later (fault battery, 2026-10-22).
check "reconciled after the replug"         wait_log '^.{9}TREE 2 ' "$m"
check "b goes home to its assigned monitor, and stays: it fills the second monitor" geom_is b "1280,0 1280x720"
sleep 0.3
check "still there"                         geom_is b "1280,0 1280x720"
check "its monitor shows 2 again"           poll shows Virtual-1 2
check "and the first monitor shows 1 again, not 2 as well" poll shows Virtual-0 1
check "the focus is on the first monitor (c)" poll active_is c
check "and the pointer came with it"        poll cursor_on Virtual-0
set_key workspaceOutputs --delete
key "Reload Settings"

# The fuzzer's first find (I8, shrunk to 2 steps): moving the only window away leaves its
# workspace empty and focused, as in i3. KWin kept the moved window active, hidden on the other
# workspace, so typing went into a window nobody could see.
check "c is active"                         poll active_is c
key "Move to Workspace 6"
check "c went to workspace 6"               wait_tree 6 "H[c]"
check "workspace 1 is empty and focused"    wait_tree 1 "H[]*"
check "no window is active (not the hidden c)" poll active_is ""
key "Workspace 6"
check "Meta+6: c is active again"           poll active_is c

# i3's sticky floating (§3 R3, X4; redo stage 9; approved by Paul, 2026-10-28): a window put on
# all desktops floats and follows Meta+N on its monitor, with the focus if it had it; one taken
# off all desktops stays on the workspace shown; tiling a sticky window takes it off all desktops.
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
key "Workspace 1"
client --title s; client --title t
check "s | t on 1"                          wait_tree 1 "H[s t*]"
m=$(mark)
on t 'w.onAllDesktops = true;'
check "t on all desktops: floating, sticky" wait_log '^.{9}STICKY t on' "$m"
check "  the tree: t floats"                wait_tree 1 "H[s] ~t*"
key "Workspace 3"
check "Meta+3: t follows, with the focus"   wait_tree 3 "H[a] ~t*"
check "  and left 1"                        wait_tree 1 "H[s]"
check "  on the first monitor still"        poll eval '[[ "$(prop t output.name)" == Virtual-0 ]]'
key "Workspace 2"
check "Meta+2 (the second monitor): t stays on the first's workspace 3" wait_tree 3 "H[a] ~t"
check "  the focus went to 2"               poll shows Virtual-1 2
key "Workspace 1"
check "Meta+1: t joins 1 without the focus (s has it)" wait_tree 1 "H[s*] ~t"
on t 'w.desktops = [workspace.currentDesktopForScreen(w.output)];'
check "t off all desktops: stays on 1, floating" wait_tree 1 "H[s*] ~t"
key "Workspace 3"
check "  and no longer follows"             wait_tree 3 "H[a*]"
key "Workspace 1"
# (Back on 1, KWin's own desktop-switch activation picked t: a desktops change puts a window
# first in KWin's focus chain, window.cpp setDesktops; the model follows KWin's choice there.)
on t 'w.onAllDesktops = true;'
check "t sticky again"                      poll eval '[[ "$(tree 1)" == *"~t"* ]]'
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "t") workspace.activeWindow = w; });' >/dev/null
check "t focused"                           wait_tree 1 "H[s] ~t*"
key "Floating Toggle"
check "tiled: t off all desktops (one desktop)" poll eval '[[ "$(prop t onAllDesktops)" == false && "$(prop t desktops.length)" == 1 ]]'
check "  in the layout beside s"            wait_tree 1 "H[s t*]"
kclose t; kclose s

check "no invariant failures or errors"     clean_log
finish
