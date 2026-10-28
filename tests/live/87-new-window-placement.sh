#!/usr/bin/env bash
# needs: plugin
# timing: alone
# Where a new window opens, and desktop switches made from outside (docs/spec-redo-1-new-windows.md;
# approved by Paul, 2026-10-28). From his capture of 2026-10-27 17:05: Prism Launcher's modal dialog
# opened while the focus was on the other monitor's empty workspace, KWin gave it that workspace,
# switched Prism's monitor to it, and kwin-i3 took Prism along. As i3 (manage.c, workspace_show):
# (1) a new window opens on the focused workspace, wherever the pointer is (§5 C1); (2) a modal
# dialog opens on its parent's workspace, nothing moves, no output switches, the focus stays (C2,
# C3); (3) a desktop switched from outside on any output is `workspace N`: N shows on its own
# output and takes the focus (D2, D3); (4) another app's dialog over a fullscreen window opens
# behind it (C5). Virtual-0 at x 0, Virtual-1 at x 1280; login numbering: 1 left, 2 right. Focus
# follows the mouse (the test KWin's policy), and since stage 2 a crossing moves the focus with the
# pointer, so part 1 turns the warp off to pull the two apart. The effect's frame insets every
# tiled window by 1 px.
source "$(dirname "$0")/lib.sh"
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
screen_is() { [[ "$(kjs 'log(workspace.activeScreen.name)')" == "$1" ]]; }
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "none")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
cursor_on() { local x; x=$(kjs 'log(Math.round(workspace.cursorPos.x))'); if [[ $1 == Virtual-0 ]]; then (( x < 1280 )); else (( x >= 1280 )); fi; }
output_of() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name); })"; }
on_output() { [[ "$(output_of "$1")" == "$2" ]]; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } });" >/dev/null; }
switch_outside() { kjs "workspace.setCurrentDesktopForScreen(workspace.desktops[$(($1 - 1))], workspace.screens[$2]);" >/dev/null; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# (1) C1: the focus on the right monitor's empty workspace 2, KWin's active output (the pointer's)
# the left one. With mouseWarping output (and stage 2's crossing) focus and pointer never come
# apart, so mouseWarping none for this part: Meta+2 moves the focus without the pointer, and a
# motion on the left makes KWin's active output the left one again (Switch to Screen had moved it).
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
reload_with() { local m; m=$(mark); set_key "$1" "$2"; key "Reload Settings"; wait_log "^.{9}SETTINGS $1\$" "$m"; }
check "mouseWarping none, for this part"    reload_with mouseWarping none
point 640 360
key "Workspace 2"
check "Meta+2: the empty 2 on the right has the focus" poll screen_is Virtual-1
sleep 0.3
check "the pointer stayed on the left (mouseWarping none)" cursor_on Virtual-0
point 600 300
m=$(mark)
client --title a
check "a opens on the focused workspace 2"  wait_tree 2 "H[a*]"
check "on the right monitor"                geom_is a "1281,1 1278x718"
check "not on the left monitor, where KWin opened it" poll on_output a Virtual-1
check "the left monitor still shows 1"      poll shows Virtual-0 1
check "the right still shows 2"             poll shows Virtual-1 2
check "a has the focus"                     poll active_is a
check "it was moved as a newcomer (the log says why)" wait_log 'ADD a tile ws 2 \(focused\)' "$m"
check "mouseWarping output again"           reload_with mouseWarping output

# (2) C2, C3, the capture: m with a modal dialog on the left; the focus (and the pointer) on the
# right monitor's workspace when the dialog opens. KWin gives the dialog the right monitor's
# desktop and switches the left monitor to it: undone, the dialog goes with m, the focus stays.
key "Workspace 1"
check "Meta+1: the empty 1 on the left has the focus" poll screen_is Virtual-0
check "the pointer went with it"            poll cursor_on Virtual-0
client --title m --dialog --dialog-delay 2
check "m fills workspace 1"                 wait_tree 1 "H[m*]"
m=$(mark)
key "Workspace 2"
check "Meta+2: a has the focus"             poll active_is a
check "the pointer is on the right monitor" poll cursor_on Virtual-1
check "the dialog opens"                    poll _has_window "m dialog"
check "the left monitor still shows 1 (KWin's switch undone)" poll shows Virtual-0 1
check "the right still shows 2"             poll shows Virtual-1 2
check "the dialog is on m's workspace, floating" poll eval '[[ "$(tree 1)" == "H[m] ~m_dialog"* ]]'
check "the dialog is on m's monitor"        poll on_output "m dialog" Virtual-0
check "m stayed in its tile"                geom_is m "1,1 1278x718"
check "workspace 2 still holds only a"      wait_tree 2 "H[a*]"
check "the focus stayed with a (i3: not the focused output)" poll active_is a
check "KWin's switch was undone"            wait_log 'SHOWN Virtual-0 1 again: a new window.s switch, undone' "$m"
kclose "m dialog"

# (3) D3: the unfocused left monitor switched from outside to the empty 3: it shows 3 and the
# focus goes there, as `workspace 3`. Then D2: that monitor switched to 2, which lives on the
# right with a: it shows 3 again, the right keeps 2, and a has the focus.
switch_outside 3 0
check "the left monitor shows 3"            poll shows Virtual-0 3
check "the empty 3 has the focus"           poll screen_is Virtual-0
check "no window is active"                 poll active_is none
check "the pointer followed the focus"      poll cursor_on Virtual-0
switch_outside 2 0
check "2 lives on the right: the left shows 3 again" poll shows Virtual-0 3
check "the right shows 2"                   poll shows Virtual-1 2
check "a has the focus"                     poll active_is a
check "the pointer followed"                poll cursor_on Virtual-1
# D3 with windows: the unfocused left monitor switched to 1 (m): it shows 1, m gets the focus.
switch_outside 1 0
check "the left monitor shows 1"            poll shows Virtual-0 1
check "m, its last focus, has the focus"    poll active_is m
check "the pointer followed"                poll cursor_on Virtual-0

# (4) C5: m fullscreen; another app opens with a modal dialog on the same workspace: both open
# behind, m keeps the focus (popup_during_fullscreen smart: only m's own transients take it).
on m 'w.fullScreen = true;'
check "m is fullscreen"                     geom_is m "0,0 1280x720"
m=$(mark)
client --title o --dialog
check "o's dialog is there"                 poll _has_window "o dialog"
echo "    since o: $(after "$m" | grep -E 'ACTIVE|ADD|FULLSCREEN' | cut -c10- | tr '\n' '|')"
check "m kept the focus over o"             wait_log 'FULLSCREEN m: keeps the focus over o$' "$m"
check "and over o's dialog"                 wait_log 'FULLSCREEN m: keeps the focus over o dialog' "$m"
check "m is active"                         poll active_is m
check "m still fills the monitor"           geom_is m "0,0 1280x720"
on m 'w.fullScreen = false;'
check "o tiled behind it meanwhile"         wait_tree 1 "H[m* o] ~o_dialog"

check "no invariant failures or errors"     clean_log
finish
