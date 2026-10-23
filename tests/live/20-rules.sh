#!/usr/bin/env bash
# Phase 2, one monitor: which windows float, and the states i3 doesn't have.
source "$(dirname "$0")/lib.sh"
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
check "retitled to the stage's title: floats" wait_tree 1 "H[a main] ~STAGE_(streamed)*"
kclose "STAGE (streamed)"
check "back to two"                         wait_tree 1 "H[a main*]"

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
