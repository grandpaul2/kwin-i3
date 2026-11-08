#!/usr/bin/env bash
# needs: xwayland
# Probe (never merged): a tiled X11 window goes fullscreen, a newcomer's rebuild takes its tile,
# then it moves itself to the other output.
source "$(dirname "$0")/lib.sh"; source "$(dirname "$0")/fsprobe.inc"
load_kwin_i3; wait_log 'kwin-i3 loaded$'
fsx_start 0
check "tiled on 1" wait_tree 1 "H[fsx*]"
key "Fullscreen"
check "fullscreen" wait_tree 1 "H[fsx*!]"
client --title b
check "b opens behind it" wait_tree 1 "H[fsx*! b]"
check "fsx lost its tile" eval '[[ "$(info)" == *tile=false* ]]'
fsx_go
check "stays on 1" wait_tree 1 "H[fsx*! b]"
check "on Virtual-0" eval '[[ "$(info)" == Virtual-0* ]]'
finish
