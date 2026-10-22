#!/usr/bin/env bash
# Phase 2, one monitor: which windows float, and the states i3 doesn't have.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a; sleep 1
client --title fixed --fixed; sleep 1
check "a fixed-size window floats"          wait_tree 1 "H[a] ~fixed*"
client --title main --dialog; sleep 1.5
check "a dialog floats, its parent tiles"   wait_tree 1 "H[a main] ~fixed ~main_dialog*"
kclose "main dialog"; kclose fixed
client --title before --retitle "1:STAGE (streamed)"; sleep 2.5
check "retitled to the stage's title: floats" wait_tree 1 "H[a main] ~STAGE_(streamed)*"
kclose "STAGE (streamed)"
check "back to two"                         wait_tree 1 "H[a main*]"

# fullscreen keeps its tile and comes back to it
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") { workspace.activeWindow = w; w.fullScreen = true; } })' >/dev/null; sleep 0.6
check "fullscreen covers the screen"        geom_is a "0,0 1280x720"
check "the tree marks it"                   wait_tree 1 "H[a*! main]"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.fullScreen = false; })' >/dev/null; sleep 0.6
check "back in its tile"                    geom_is a "0,0 640x720"

# maximize is undone
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "main") w.setMaximize(true, true); })' >/dev/null; sleep 0.8
check "maximize is undone"                  geom_is main "640,0 640x720"

# minimize: its space goes to the others, and it comes back in place
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.minimized = true; })' >/dev/null; sleep 0.8
check "minimized: main fills the screen"    geom_is main "0,0 1280x720"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.minimized = false; })' >/dev/null; sleep 0.8
check "unminimized: back on the left"       geom_is a "0,0 640x720"

# a reload keeps the layout (decision 5)
client --title c; sleep 1
key "Split V"; client --title d; sleep 1
check "before reload"                       wait_tree 1 "H[a main V[c d*]]"
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null; sleep 0.5
before=$(grep -c 'kwin-i3 loaded' "$KI3_LOG")
load_kwin_i3
for _ in $(seq 50); do [[ $(grep -c 'kwin-i3 loaded' "$KI3_LOG") -gt $before ]] && break; sleep 0.1; done
sleep 0.5
check "after reload, same tree"             wait_tree 1 "H[a main V[c d*]]"
check "d still bottom right"                geom_is d "853,360 427x360"

# release
key "Release"
check "release logs"                        wait_log '^.{9}RELEASED$'
kjs 'var n = 0; workspace.windowList().forEach(function (w) { if (w.tile) n++; }); log(n)' | grep -qx 0
check "no window is left in a tile"         test $? -eq 0

check "no invariant failures or errors"     clean_log
finish
