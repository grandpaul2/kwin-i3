#!/usr/bin/env bash
# Phase 2, one monitor (Virtual-0, 1280x720 at 0,0): windows tile as the i3 tree says.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a; sleep 1
check "one window fills the screen"         geom_is a "0,0 1280x720"
client --title b; sleep 1
check "two windows: H[a b*]"                wait_tree 1 "H[a b*]"
check "a takes the left half"               geom_is a "0,0 640x720"
check "b takes the right half"              geom_is b "640,0 640x720"

key "Split V"
client --title c; sleep 1
check "split v then open: H[a V[b c*]]"     wait_tree 1 "H[a V[b c*]]"
check "b top right"                         geom_is b "640,0 640x360"
check "c bottom right"                      geom_is c "640,360 640x360"

key "Move Left"
check "move left out of the split"          wait_tree 1 "H[a c* V[b]]"
check "three equal columns: a"              geom_is a "0,0 427x720"
check "three equal columns: c"              geom_is c "427,0 427x720"
check "three equal columns: b"              geom_is b "853,0 427x720"

key "Focus Right"
check "focus right reaches b"               wait_tree 1 "H[a c V[b*]]"
kjs 'log(workspace.activeWindow.caption)' | grep -qx b; check "KWin's active window follows" test $? -eq 0

kclose c
check "close c: H[a V[b*]]"                 wait_tree 1 "H[a V[b*]]"
check "a back to half"                      geom_is a "0,0 640x720"

key "Floating Toggle"
check "b floats"                            wait_tree 1 "H[a] ~b*"
check "a fills the screen"                  geom_is a "0,0 1280x720"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "b") log(w.keepAbove); })' | grep -qx true
check "a floating window is kept above"     test $? -eq 0
key "Floating Toggle"
check "b tiles again"                       wait_tree 1 "H[a b*]"

key "Toggle Split"
check "toggle split: stacked"               wait_tree 1 "H[V[a b*]]"
check "a on top"                            geom_is a "0,0 1280x360"

check "no invariant failures or errors"     clean_log
finish
