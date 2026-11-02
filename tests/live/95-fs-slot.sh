#!/usr/bin/env bash
# Probe (OPEN.md item 83): a fullscreen tiled window out of KWin's tiles keeps its place, as i3
# renders a fullscreen con alone and leaves its siblings' rects (render.c:127-144). H[a b], b
# fullscreen, c opens (the tiles rebuilt): with b's place kept, a and c are thirds; without, halves.
source "$(dirname "$0")/lib.sh"
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
no_tile() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.tile === null); })")" == "true" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME '
client --title a; client --title b --color blue
check "two windows"                         wait_tree 1 "H[a b*]"
on b 'w.fullScreen = true;'
check "b is fullscreen"                     wait_tree 1 "H[a b*!]"
m=$(mark)
client --title c --color red
check "c opens behind"                      wait_tree 1 "H[a b*! c]" "$m"
check "b is out of the tiles"               poll no_tile b
sleep 0.7
echo "  a: $(geom a)  c: $(geom c)"
check "a keeps the left third"              geom_is a "0,0 427x720"
check "c is the right third"                geom_is c "853,0 427x720"
check "b still fills the monitor"           geom_is b "0,0 1280x720"
on b 'w.fullScreen = false;'
check "out of fullscreen"                   wait_tree 1 "H[a b* c]"
check "b is the middle third"               geom_is b "427,0 426x720"
check "no invariant failures or errors"     clean_log
finish
