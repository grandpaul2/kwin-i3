#!/usr/bin/env bash
# needs: xwayland
# Probe (never merged): a floating X11 window goes fullscreen, then moves itself to the other output.
source "$(dirname "$0")/lib.sh"; source "$(dirname "$0")/fsprobe.inc"
load_kwin_i3; wait_log 'kwin-i3 loaded$'
fsx_start 0
check "tiled on 1" wait_tree 1 "H[fsx*]"
key "Floating Toggle"
check "floats" wait_tree 1 "H[] ~fsx*"
key "Fullscreen"
check "fullscreen" eval '[[ "$(info)" == *fs=true* ]]'
fsx_go
check "stays on 1" eval '[[ "$(tree 1)" == *fsx* ]]'
check "on Virtual-0" eval '[[ "$(info)" == Virtual-0* ]]'
finish
