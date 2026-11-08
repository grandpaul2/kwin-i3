#!/usr/bin/env bash
# needs: xwayland
# Probe (never merged): an X11 window opened fullscreen moves itself to the other output.
source "$(dirname "$0")/lib.sh"; source "$(dirname "$0")/fsprobe.inc"
load_kwin_i3; wait_log 'kwin-i3 loaded$'
fsx_start 1
check "fullscreen on 1" wait_tree 1 "H[fsx*!]"
fsx_go
check "stays on 1" wait_tree 1 "H[fsx*!]"
check "on Virtual-0" eval '[[ "$(info)" == Virtual-0* ]]'
finish
