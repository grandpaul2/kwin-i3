#!/usr/bin/env bash
# The workspace commands with no default key (docs/spec-workspace-commands.md), on the two virtual
# monitors (Virtual-0 at x 0, Virtual-1 at x 1280): back-and-forth, its auto form, next/prev and
# on-output, focus output, move to output (focus stays), move workspace to output (the source
# shows the one it showed before, else an unused one; a floating window goes along).
source "$(dirname "$0")/lib.sh"
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
x_of() { local g; g=$(geom "$1"); echo "${g%%,*}"; }
on_first() { (( $(x_of "$1") < 1280 )); }
on_second() { (( $(x_of "$1") >= 1280 )); }
tree_has() { [[ "$(tree "$1")" == *"$2"* ]]; }
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
reload() { local m; m=$(mark); key "Reload Settings"; wait_log '^.{9}SETTINGS .*workspaceAutoBackAndForth' "$m"; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "login: 1 on the first monitor"       poll shows Virtual-0 1
check "login: 2 on the second"              poll shows Virtual-1 2

# 1. Back-and-forth: a on 1; b, c on 2.
client --title a
check "a on workspace 1"                    wait_tree 1 "H[a*]"
key "Workspace 2"
client --title b
client --title c
check "b, c on workspace 2"                 wait_tree 2 "H[b c*]"
key "Workspace Back and Forth"
check "back and forth: to 1 (a)"            poll active_is a
key "Workspace Back and Forth"
check "and forth: to 2 (c)"                 poll active_is c

# 2. Focus crossing the monitor counts as a workspace change (i3's workspace_show).
key "Focus Left"
check "focus left: b"                       poll active_is b
key "Focus Left"
check "focus left again crosses to a"       poll active_is a
key "Workspace Back and Forth"
check "back and forth: to 2, its focused b" poll active_is b

# 3. Move to back-and-forth: b to 1, the focus stays on 2.
key "Move to Workspace Back and Forth"
check "b went to workspace 1"               poll tree_has 1 b
check "workspace 2 keeps c, focused"        wait_tree 2 "H[c*]"
check "c is active"                         poll active_is c

# 4. workspaceAutoBackAndForth: Meta+N for the focused workspace goes back; Meta+Shift+N sends back.
key "Workspace 2"
sleep 0.5                                   # a switch would have happened by now
check "auto off: Meta+2 on 2 stays"         active_is c
set_key workspaceAutoBackAndForth true
reload
key "Workspace 2"
check "auto on: Meta+2 on 2 goes to 1 (b: a window moved there is focused there, as i3)" poll active_is b
key "Workspace 1"
check "Meta+1 on 1 goes back to 2"          poll active_is c
key "Move to Workspace 2"
check "Meta+Shift+2 on 2 sends c to 1"      poll tree_has 1 c
check "workspace 2 is empty (and focused)"  wait_tree 2 "H[]*"
set_key workspaceAutoBackAndForth false
reload

# 5. Next/prev among the workspaces that exist (windows, or shown), wrapping; on-output.
key "Workspace 5"
check "Meta+5 from the second monitor"      poll shows Virtual-1 5
client --title e
check "e on 5"                              wait_tree 5 "H[e*]"
key "Workspace Next"
check "next from 5 wraps to 1 (2 is gone): its focused c" poll active_is c
check "1 on the first monitor"              poll shows Virtual-0 1
key "Workspace Next"
check "next from 1: 5"                      poll active_is e
key "Workspace Prev"
check "prev from 5: 1"                      poll active_is c
key "Workspace 3"
check "Meta+3 from the first monitor"       poll shows Virtual-0 3
client --title f
check "f on 3"                              wait_tree 3 "H[f*]"
key "Workspace Next on Output"
check "next on output from 3 wraps to 1, skipping 5" poll shows Virtual-0 1
check "c is active"                         poll active_is c
check "the second monitor still shows 5"    shows Virtual-1 5
key "Workspace Prev on Output"
check "prev on output from 1: 3"            poll active_is f
key "Workspace Next"
check "next (all outputs) from 3: 5"        poll active_is e

# 6. Focus output.
key "Focus Output Left"
check "focus output left: f on 3"           poll active_is f
key "Focus Output Right"
check "focus output right: e on 5"          poll active_is e
key "Focus Output Up"
check "no monitor above: nothing"           poll active_is e

# 7. Move to output: the window goes to the target's visible workspace; the focus stays.
client --title g
check "g on 5"                              wait_tree 5 "H[e g*]"
key "Move to Output Left"
check "g went to 3 (shown on the first)"    poll tree_has 3 g
check "g is on the first monitor"           poll on_first g
check "focus stayed on 5: e"                poll active_is e

# 8. Move workspace to output: 5 (e and a floating h) to the first monitor. The second monitor
#    then shows the workspace with windows it showed most recently: 7 (shown after 6). Neither
#    fallback gives 7: the lowest with windows there is 6, the lowest unused 2.
key "Workspace 6"
check "Meta+6 from the second monitor"      poll shows Virtual-1 6
client --title k
check "k on 6"                              wait_tree 6 "H[k*]"
key "Workspace 7"
client --title m
check "m on 7"                              wait_tree 7 "H[m*]"
key "Workspace 5"
check "back to 5 on the second monitor"     poll shows Virtual-1 5
client --title h
key "Floating Toggle"
check "h floats on 5"                       poll tree_has 5 "~"
check "h is on the second monitor"          poll on_second h
key "Move Workspace to Output Left"
check "5 shows on the first monitor"        poll shows Virtual-0 5
check "the second shows 7, its most recent with windows" poll shows Virtual-1 7
check "e moved with it"                     poll on_first e
check "the floating h too"                  poll on_first h
check "5 keeps the focus (h)"               poll active_is h
key "Workspace Back and Forth"
check "the previous is now 7 (i3: the source's workspace was shown in between)" poll active_is m
key "Workspace Back and Forth"
check "and forth to 5"                      poll active_is h

# 9. 7 moves too: the second monitor's history has only 5 (gone to the first) and 6: it shows 6.
key "Focus Output Right"
check "focus on the second monitor (m)"     poll active_is m
key "Move Workspace to Output Left"
check "7 shows on the first monitor"        poll shows Virtual-0 7
check "the second shows 6"                  poll shows Virtual-1 6

# 10. And 6: nothing with windows lives on the second monitor any more, so an unused one (2: empty,
#     its home is the second monitor).
key "Focus Output Right"
check "focus on the second monitor (k)"     poll active_is k
key "Move Workspace to Output Left"
check "6 shows on the first monitor"        poll shows Virtual-0 6
check "the second shows an unused one: 2"   poll shows Virtual-1 2
# No window was activated on 2 (empty): the previous is 2 all the same, set by the move.
screen_is() { [[ "$(kjs 'log(workspace.activeScreen.name)')" == "$1" ]]; }
key "Workspace Back and Forth"
check "back and forth: to 2, on the second monitor" poll screen_is Virtual-1
key "Workspace Back and Forth"
check "and forth to 6 (k)"                  poll active_is k

# 11. A fullscreen window goes with its workspace and stays fullscreen on the other monitor.
key "Fullscreen"
is_fs() { [[ "$(kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "k") log(w.fullScreen); })')" == true ]]; }
check "k is fullscreen on the first monitor" poll geom_is k "0,0 1280x720"
key "Move Workspace to Output Right"
check "6 shows on the second monitor"       poll shows Virtual-1 6
check "k fills the second monitor"          poll geom_is k "1280,0 1280x720"
check "and is still fullscreen"             poll is_fs

# 12. i3's --no-auto-back-and-forth (unbound, redo stage 5): with the auto setting on, Meta+6 on 6
#     would go back, "Workspace 6 (no back-and-forth)" stays; and the outputs by next (KWin's
#     order, wrapping) and primary (the first).
key "Fullscreen"
set_key workspaceAutoBackAndForth true
reload
key "Workspace 6 (no back-and-forth)"
sleep 0.5
check "12. no back-and-forth: still on 6 (k)" active_is k
key "Workspace 6"
check "12. the auto form goes back: k loses the focus" poll eval '[[ "$(active)" != k ]]'
key "Workspace 6"
check "12. and forth to 6 (k)"              poll active_is k
set_key workspaceAutoBackAndForth false
reload
key "Focus Output Next"
check "12. focus output next: from the second monitor wraps to the first (its visible 7: m)" poll active_is m
key "Focus Output Next"
check "12. next again: the second (6: k)"   poll active_is k
key "Focus Output Primary"
check "12. focus output primary: the first (m)" poll active_is m
key "Move to Output Next"
check "12. move to output next: m joins 6 on the second" poll tree_has 6 m
check "12. focus stayed on the first (7, now empty: no window)" poll screen_is Virtual-0

check "no invariant failures or errors"     clean_log
finish
