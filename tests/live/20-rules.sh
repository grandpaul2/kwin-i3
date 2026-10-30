#!/usr/bin/env bash
# needs: xwayland
# Phase 2, one monitor: which windows float, and the states i3 doesn't have. Redo stage 3 (docs/
# spec-redo-3-kinds-rules.md): the rules in i3's syntax (forWindow, assign), an X11 dialog floats,
# a rule runs once per window.
source "$(dirname "$0")/lib.sh"
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
reload_with() { local m; m=$(mark); set_key "$1" "$2"; key "Reload Settings"; wait_log "^.{9}SETTINGS $1\$" "$m"; }
floating() { [[ "$(tree "$2")" == *"~$1"* ]]; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a
client --title fixed --fixed
check "a fixed-size window floats"          wait_tree 1 "H[a] ~fixed*"
client --title main --dialog
check "a dialog floats, its parent tiles"   wait_tree 1 "H[a main] ~fixed ~main_dialog*"
kclose "main dialog"; kclose fixed
client --title before --retitle "1:STAGE (streamed)"
check "retitled to a floatingTitle word: floats" wait_tree 1 "H[a main] ~STAGE_(streamed)*"
kclose "STAGE (streamed)"
check "back to two"                         wait_tree 1 "H[a main*]"
# i3's rules run at most once per window, only to apply them (§3 X2): a window that opened matching
# the title rule and is retitled away stays floating.
client --title "STAGE (streamed)" --retitle "1:plain again"
check "opened matching the title rule: floats" wait_tree 1 "H[a main] ~STAGE_(streamed)*"
check "retitled away"                       poll _has_window "plain again"
sleep 0.3
# Nothing changes, so no tree line is logged with the new name: read the window itself.
floating_win() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.keepAbove && w.tile === null); })")" == "true" ]]; }
check "still floating: the rule ran once (i3)" floating_win "plain again"
kclose "plain again"
# An X11 dialog floats (§3 R2, as i3; KWin types it Dialog, not Normal).
python3 -I "$root/tools/popupclient.py" --title xdlg --type dialog --geometry 300x200+400+300 >/dev/null 2>&1 & xd=$!
check "an X11 dialog floats in the tree"    poll floating xdlg 1
kill "$xd"; poll _no_window xdlg
# A forWindow rule with floating disable tiles a dialog; assign opens a window on a hidden workspace
# without switching to it or focusing it (§11 N12).
check "forWindow: dialogs tile"             reload_with forWindow '[title="dialog$"] floating disable'
client --title td --dialog
check "td and its dialog both tile"         wait_tree 1 "H[a main td_dialog* td]"   # GTK maps the dialog first
kclose "td dialog"; kclose td
check "assign: ki3.assigned to workspace 4" reload_with assign '[class="^ki3\.assigned$"] → 4'
m=$(mark)
client --title as --app-id ki3.assigned
check "it opened on the hidden workspace 4" wait_tree 4 "H[as]" "$m"
check "the monitor still shows 1"           poll eval '[[ "$(kjs "log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(workspace.screens[0])) + 1)")" == 1 ]]'
check "main keeps the focus"                poll eval '[[ "$(kjs "log(workspace.activeWindow ? workspace.activeWindow.caption : \"\")")" == main ]]'
check "and the log says why"                wait_log 'ADD as tiling ws 4 \(assign, no focus\)' "$m"
kclose as
set_key forWindow --delete; set_key assign --delete; key "Reload Settings"
# A window floated by hand stays floating through a caption change: the rules act when their
# verdict changes (a floatingTitle word appearing, above), not whenever it differs from what
# Paul set (docs/records/spec-reload-keepabove.md; review finding 1: Firefox retitles in seconds).
client --title hand --retitle "1.5:hand2"
check "hand tiles"                          wait_tree 1 "H[a main hand*]"
key "Floating Toggle"
check "floated by hand"                     wait_tree 1 "H[a main] ~hand*"
# Nothing changes, so no tree line is logged with the new name: read the window itself.
floating_win() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.keepAbove && w.tile === null); })")" == "true" ]]; }
check "retitled"                            poll _has_window hand2
sleep 0.3
check "still floating after the retitle"    floating_win hand2
kclose hand2
check "back to two again"                   wait_tree 1 "H[a main*]"

# fullscreen keeps its tile and comes back to it
on a 'workspace.activeWindow = w; w.fullScreen = true;'
check "fullscreen covers the screen"        geom_is a "0,0 1280x720"
check "the tree marks it"                   wait_tree 1 "H[a*! main]"
on a 'w.fullScreen = false;'
check "back in its tile"                    geom_is a "0,0 640x720"

# maximize is undone
m=$(mark)
on main 'w.setMaximize(true, true);'
wait_log '^.{9}TREE 1 ' "$m"
check "maximize is undone: back in its tile" geom_is main "640,0 640x720"
check "maximize is undone: not maximized"   poll prop_is main maximizeMode 0

# minimize: its space goes to the others, and it comes back in place. The pointer goes well inside
# main first: at the start-up centre (x=640) it is on a's border, and a would take the focus.
point 960 360
on a 'w.minimized = true;'
check "minimized: main fills the screen"    geom_is main "0,0 1280x720"
on a 'w.minimized = false;'
check "unminimized: back on the left"       geom_is a "0,0 640x720"

# a reload keeps the layout (decision 5). Focus main first: after the unminimize KWin may hand
# a the focus late, and under load c then opened beside a (seen 2026-10-22 with the fuzzer running).
on main 'workspace.activeWindow = w;'
check "main focused"                        wait_tree 1 "H[a main*]"
client --title c
key "Split V"; client --title d
check "before reload"                       wait_tree 1 "H[a main V[c d*]]"
m=$(mark)       # everything below must be logged by the reloaded script (review fault 4)
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "after reload, same tree"             wait_tree 1 "H[a main V[c d*]]" "$m"
check "d still bottom right"                geom_is d "853,360 427x360"

# release
key "Release"
check "release logs"                        wait_log '^.{9}RELEASED$'
tiled_count_is() { [[ "$(kjs 'var n = 0; workspace.windowList().forEach(function (w) { if (w.tile) n++; }); log(n)')" == "$1" ]]; }
check "no window is left in a tile"         poll tiled_count_is 0
own_size() {   # a real geometry (review fault 2: empty must not pass), and not a tile's
    local g; g=$(geom a)
    [[ $g =~ ^-?[0-9]+,-?[0-9]+\ [0-9]+x[0-9]+$ && $g != "0,0 427x720" && $g != "0,0 1280x720" ]]
}
check "released windows get their own size back" poll own_size

check "no invariant failures or errors"     clean_log
finish
