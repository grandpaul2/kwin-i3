#!/usr/bin/env bash
# Paul's capture of 2026-10-23 23:25: Firefox fullscreen on a workspace, a terminal opened there,
# "nothing happened". The reconcile rebuilt the tiles for the new window, and KWin refused to
# manage the fullscreen window again (Tile::manage: a fullscreen window is not resizable), so
# kwin-i3 floated it, monitor-sized and above the tiles; the new terminals opened behind it,
# and leaving fullscreen changed nothing. i3 keeps a fullscreen window in the tree. A caption
# change while fullscreen was the same hole by another door: Rules.classify read "not
# resizeable" as "float", and reclassify floats a tiled window the rules say floats.
source "$(dirname "$0")/lib.sh"
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
no_float() { ! after "$1" | grep -qE '^.{9}FLOAT '; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a; client --title b
check "two windows"                         wait_tree 1 "H[a b*]"
on b 'w.fullScreen = true;'
check "b is fullscreen"                     wait_tree 1 "H[a b*!]"
check "b fills the monitor"                 geom_is b "0,0 1280x720"

m=$(mark)
client --title c
check "c opens tiled, b stays in the tree"  wait_tree 1 "H[a b! c*]" "$m"
check "nothing was floated"                 no_float "$m"
check "b still fills the monitor"           geom_is b "0,0 1280x720"
on b 'w.fullScreen = false;'
check "out of fullscreen: three columns"    wait_tree 1 "H[a b c*]" "$m"
check "a is the left third"                 geom_is a "0,0 427x720"
check "b is the middle third"               geom_is b "427,0 426x720"
check "c is the right third"                geom_is c "853,0 427x720"
check "nothing was floated"                 no_float "$m"

# The caption changes while fullscreen (a browser, a video ending): still tiled.
kclose a; kclose c
client --title r --retitle 2:rr
check "r tiled beside b"                    wait_tree 1 "H[b r*]"
m=$(mark)
on r 'w.fullScreen = true;'
check "r is fullscreen"                     wait_tree 1 "H[b r*!]" "$m"
check "retitled while fullscreen"           poll _has_window rr
check "nothing was floated"                 no_float "$m"
on rr 'w.fullScreen = false;'
# A reclassify that floats logs no FLOAT line: this is the check that sees it.
check "out of fullscreen: still tiled, two halves" wait_tree 1 "H[b rr*]" "$m"
check "rr is the right half"                geom_is rr "640,0 640x720"

check "no invariant failures or errors"     clean_log
finish
