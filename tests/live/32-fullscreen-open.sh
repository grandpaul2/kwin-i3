#!/usr/bin/env bash
# A fullscreen window stays in the tree (docs/spec-fullscreen-tree.md, from Paul's capture of
# 2026-10-23 23:25: Firefox fullscreen, a terminal opened there, "nothing happened"). KWin refuses
# to tile a fullscreen window, and the rebuild of the tiles for the newcomer lost it its tile, so
# kwin-i3 floated it, monitor-sized and above the tiles. Now (A) it stays in the tree, out of the
# tiles until fullscreen ends; (B) the rules judge a fullscreen window by its size limits, not by
# KWin's "not resizeable", which a caption change read as "float"; (C) as in i3, the newcomer
# gets no focus and opens behind: KWin activated it, kwin-i3 hands the focus back, which keeps
# the fullscreen window on top (Window::isActiveFullScreen). Its own dialog is the exception.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/fs.png
pixel_is() { "$shot" capture Virtual-0 "$png" && "$shot" same "$png" "$1" "$2" "$3"; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
no_float() { ! after "$1" | grep -qE '^.{9}FLOAT '; }
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "-")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
top_is() { [[ "$(kjs 'var o = workspace.stackingOrder.filter(function (w) { return w.normalWindow && w.output.name === "Virtual-0"; }); log(o.length ? o[o.length - 1].caption : "-")')" == "$1" ]]; }
no_tile() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.tile === null); })")" == "true" ]]; }
trees_since() { [[ "$(after "$1" | grep -cE '^.{9}TREE 1 ')" == "$2" ]]; }
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# A + C. b fullscreen; c opens: tiled behind it, no focus; b still fills the monitor and is on top.
client --title a; client --title b --color blue
check "two windows"                         wait_tree 1 "H[a b*]"
on b 'w.fullScreen = true;'
check "b is fullscreen"                     wait_tree 1 "H[a b*!]"
check "b fills the monitor"                 geom_is b "0,0 1280x720"
# b is stopped (SIGSTOP) while c opens, so it acknowledges nothing: KWin clears a window's tile
# only on the client's acknowledgement (window.cpp commitTile), so w.tile stays set and a second
# pass deciding from it would see b in its old tile, rebuild, be refused and schedule again, for
# ever (review finding 1). kwin-i3 keeps its own record of a window out of the tiles. The count
# is read once after a pause, not polled: a loop passes through 2 (review of the change).
bpid=$(pgrep -f "testclient.py --title b" | head -1)
kill -STOP "$bpid"
m=$(mark)
client --title c --color red
check "c opens tiled; b stays in the tree and keeps the focus" wait_tree 1 "H[a b*! c]" "$m"
check "nothing was floated"                 no_float "$m"
sleep 0.7
check "two reconcile passes, no spin"       trees_since "$m" 2
check "b still fills the monitor"           geom_is b "0,0 1280x720"
check "KWin's active window is b"           poll active_is b
check "b is on top of c (pixel)"            poll pixel_is 640 360 0,0,255
check "b is on top of c (stacking)"         top_is b
kill -CONT "$bpid"
check "b is out of the tiles (once it answers)" poll no_tile b
# Exit: focus stays on b (i3); the tree lays out in thirds, b at its tree position.
on b 'w.fullScreen = false;'
check "out of fullscreen: H[a b* c]"        wait_tree 1 "H[a b* c]" "$m"
check "a is the left third"                 geom_is a "0,0 427x720"
check "b is the middle third"               geom_is b "427,0 426x720"
check "c is the right third"                geom_is c "853,0 427x720"
check "nothing was floated"                 no_float "$m"

# Closing the fullscreen window with the newcomer behind it: the newcomer gets the workspace.
kclose a
check "H[b* c]"                             wait_tree 1 "H[b* c]"
on b 'w.fullScreen = true;'
check "b fullscreen again"                  wait_tree 1 "H[b*! c]"
kclose b
check "c alone"                             wait_tree 1 "H[c*]"
check "c fills the monitor"                 geom_is c "0,0 1280x720"
check "c is active"                         poll active_is c

# B. The caption changes while fullscreen (a browser, a video ending): still tiled.
client --title r --retitle 2:rr
check "r tiled beside c"                    wait_tree 1 "H[c r*]"
m=$(mark)
on r 'w.fullScreen = true;'
check "r is fullscreen"                     wait_tree 1 "H[c r*!]" "$m"
check "retitled while fullscreen"           poll _has_window rr
check "nothing was floated"                 no_float "$m"
on rr 'w.fullScreen = false;'
# A reclassify that floats logs no FLOAT line: this is the check that sees it.
check "out of fullscreen: still tiled, two halves" wait_tree 1 "H[c rr*]" "$m"
check "rr is the right half"                geom_is rr "640,0 640x720"
kclose rr

# Decision 2: the fullscreen window's own dialog, opened during fullscreen, is shown and focused.
client --title p --color green --dialog --dialog-delay 1.5
check "p tiled beside c"                    wait_tree 1 "H[c p*]"
m=$(mark)
on p 'w.fullScreen = true;'
check "p is fullscreen"                     wait_tree 1 "H[c p*!]" "$m"
check "its dialog floats"                   wait_tree 1 "H[c p!] ~p_dialog*" "$m"
check "the dialog is active"                poll active_is "p dialog"
check "the dialog is on top"                top_is "p dialog"
check "p was not floated"                   no_float "$m"
kclose "p dialog"
check "p focused again"                     poll active_is p
check "p still fullscreen, full size"       geom_is p "0,0 1280x720"

# A workspace switch and back: the tree is unchanged, p keeps the focus.
key "Workspace 3"
check "the monitor shows 3"                 poll shows Virtual-0 3
key "Workspace 1"
check "back on 1: unchanged"                wait_tree 1 "H[c p*!]"
check "p active"                            poll active_is p

# A newcomer sent to the hidden fullscreen workspace: no focus stolen, no desktop switched.
key "Workspace 3"
client --title e
check "e on 3"                              wait_tree 3 "H[e*]"
m=$(mark)
key "Move to Workspace 1"
check "e behind p on 1"                     wait_tree 1 "H[c p! e]" "$m"
check "the monitor still shows 3"           shows Virtual-0 3
# A hidden window never acknowledges a configure, so KWin never clears p's w.tile here; a second
# pass deciding from w.tile would see p in its old tile, rebuild, be refused and schedule again,
# for ever (review finding 1). kwin-i3 keeps its own record of a window out of the tiles.
sleep 0.5
trees_at_most() { (( $(after "$1" | grep -cE '^.{9}TREE 1 ') <= $2 )); }
check "a few passes, no spin on the hidden workspace" trees_at_most "$m" 4
key "Workspace 1"
check "p active again on 1"                 poll active_is p
check "p on top"                            top_is p

# A reload with a fullscreen window and an unrelated active window: focus untouched.
key "Workspace 2"
client --title z
check "z on 2, active"                      poll active_is z
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "after the reload z is still active"  active_is z
# The reload rebuilds the tree from KWin's tiles, which p is out of, so p comes back at the end
# of the row (still in the tree, still fullscreen; it joins the tiles there when it ends).
check "1 is as it was, p last"              wait_tree 1 "H[c e p!]"

check "no invariant failures or errors"     clean_log
finish
