#!/usr/bin/env bash
# Phase 2, one monitor (Virtual-0, 1280x720 at 0,0): windows tile as the i3 tree says.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a
check "one window fills the screen"         geom_is a "0,0 1280x720"
client --title b
check "two windows: H[a b*]"                wait_tree 1 "H[a b*]"
check "a takes the left half"               geom_is a "0,0 640x720"
check "b takes the right half"              geom_is b "640,0 640x720"

key "Split V"
client --title c
check "split v then open: H[a V[b c*]]"     wait_tree 1 "H[a V[b c*]]"
check "b top right"                         geom_is b "640,0 640x360"
check "c bottom right"                      geom_is c "640,360 640x360"

key "Move Left"
check "move left out of the split"          wait_tree 1 "H[a c* V[b]]"
check "three equal columns: a"              geom_is a "0,0 427x720"
check "three equal columns: c"              geom_is c "427,0 426x720"
check "three equal columns: b"              geom_is b "853,0 427x720"
# Neighbours share an exact edge: no 1 px hole (wallpaper showed through on Paul's 2560 px monitor,
# 2026-10-22: thirds of 853.33 px rounded separately) and no overlap.
edges_meet() {
    local ga gc gb; ga=$(geom a); gc=$(geom c); gb=$(geom b)
    [[ $ga =~ ^([0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1; local e1=$((BASH_REMATCH[1] + BASH_REMATCH[2]))
    [[ $gc =~ ^([0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1; local s2=${BASH_REMATCH[1]} e2=$((BASH_REMATCH[1] + BASH_REMATCH[2]))
    [[ $gb =~ ^([0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1; local s3=${BASH_REMATCH[1]} e3=$((BASH_REMATCH[1] + BASH_REMATCH[2]))
    (( e1 == s2 && e2 == s3 && e3 == 1280 ))
}
check "three columns: neighbours meet exactly, no gap, no overlap" poll edges_meet

key "Focus Right"
check "focus right reaches b"               wait_tree 1 "H[a c V[b*]]"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
check "KWin's active window follows"        poll active_is b

kclose c
check "close c: H[a V[b*]]"                 wait_tree 1 "H[a V[b*]]"
check "a back to half"                      geom_is a "0,0 640x720"

key "Floating Toggle"
check "b floats"                            wait_tree 1 "H[a] ~b*"
check "a fills the screen"                  geom_is a "0,0 1280x720"
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
check "a floating window is kept above"     poll prop_is b keepAbove true
key "Floating Toggle"
check "b tiles again"                       wait_tree 1 "H[a b*]"

key "Toggle Split"
check "toggle split: stacked"               wait_tree 1 "H[V[a b*]]"
check "a on top"                            geom_is a "0,0 1280x360"
key "Toggle Split"
check "toggle again: same-direction nest"   wait_tree 1 "H[H[a b*]]"
check "projected flat: a left half"         geom_is a "0,0 640x720"

# A same-direction nest *with siblings* must be merged into its parent: H[H[a d] b] -> 3 columns.
kclose a; kclose b
check "all closed: an empty workspace"      wait_tree 1 "H[]*"
client --title a
client --title b
client --title c
check "three windows side by side"          wait_tree 1 "H[a b c*]"
key "Focus Left"; key "Focus Left"
key "Split H"
client --title d
check "a nested split of the same direction" wait_tree 1 "H[H[a d*] b c]"
check "projected flat: a is a sixth"        geom_is a "0,0 213x720"
check "projected flat: d is the next sixth" geom_is d "213,0 214x720"
check "projected flat: b is a third"        geom_is b "427,0 426x720"

key "Focus Right"
key "Grow Width"
check "grow width: b gains 10% of the screen" geom_is b "363,0 554x720"
key "Shrink Width"
check "shrink width: back"                  geom_is b "427,0 426x720"

check "no invariant failures or errors"     clean_log
finish
