#!/usr/bin/env bash
# Floating windows move and resize by key, floatingStep px (docs/spec-float-keys.md, i3's
# cmd_move_direction / cmd_resize_floating): Move shifts the frame, Grow/Shrink change its right or
# bottom edge, a centre crossing onto the other monitor joins that monitor's workspace, a move that
# would leave every monitor is refused. Tiled windows keep the tree's moves (10-tiling).
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title t; client --title f
wait_tree 1 "H[t f*]" >/dev/null
key "Floating Toggle"
check "f floats"                            wait_tree 1 "H[t] ~f*"
sleep 0.3
read -r x y w h < <(geom f | tr ',x' '  ')
at() { echo "$1,$2 $3x$4"; }

key "Move Right"
check "Move Right: 10 px right"             wait_geom f "$(at $((x + 10)) "$y" "$w" "$h")"
key "Move Up"
check "Move Up: 10 px up"                   wait_geom f "$(at $((x + 10)) $((y - 10)) "$w" "$h")"
check "the tree unchanged"                  wait_tree 1 "H[t] ~f*"
key "Grow Width"
check "Grow Width: 10 px on the right"      wait_geom f "$(at $((x + 10)) $((y - 10)) $((w + 10)) "$h")"
key "Shrink Height"
check "Shrink Height: 10 px off the bottom" wait_geom f "$(at $((x + 10)) $((y - 10)) $((w + 10)) $((h - 10)))"

# floatingStep, read at each press.
kwriteconfig6 --file "$XDG_CONFIG_HOME/kwinrc" --group Script-kwin-i3 --key floatingStep 50
m=$(mark); busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
wait_log '^.{9}SETTINGS .*floatingStep' "$m" >/dev/null
key "Move Left"
check "floatingStep 50: Move Left 50 px"    wait_geom f "$(at $((x - 40)) $((y - 10)) $((w + 10)) $((h - 10)))"
kwriteconfig6 --file "$XDG_CONFIG_HOME/kwinrc" --group Script-kwin-i3 --key floatingStep --delete
m=$(mark); busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
wait_log '^.{9}SETTINGS .*floatingStep' "$m" >/dev/null

# Its centre 5 px short of Virtual-1 (x 1280): one press takes it over, onto workspace 2.
kjs "workspace.windowList().forEach(function (w) { if (w.caption === 'f') w.frameGeometry = { x: 1275 - w.width / 2, y: 100, width: w.width, height: w.height }; });" >/dev/null
sleep 0.3
key "Move Right"
check "crossing: f joins workspace 2"       wait_tree 2 "H[] ~f*"
check "and leaves workspace 1"              wait_tree 1 "H[t]"
check "still focused"                       eval '[[ "$(kjs "log(workspace.activeWindow ? workspace.activeWindow.caption : \"none\")")" == f ]]'

# 5 px left on Virtual-1's right edge (x 2560): a press would leave every monitor.
kjs "workspace.windowList().forEach(function (w) { if (w.caption === 'f') w.frameGeometry = { x: 2555, y: 100, width: w.width, height: w.height }; });" >/dev/null
sleep 0.3
before=$(geom f)
key "Move Right"
sleep 0.3
check "off every monitor: refused"          test "$(geom f)" == "$before"

# A fixed-size window floats by itself; Grow Width changes nothing.
client --title fixed --fixed
sleep 0.5
before=$(geom fixed)
key "Grow Width"
sleep 0.3
check "a fixed-size window: Grow Width does nothing" test "$(geom fixed)" == "$before"

# A tiled window still moves in the tree: u opens on workspace 2 (the focus is on Virtual-1 after
# the crossing), and Move Left takes it across to workspace 1, beside t.
kclose fixed; kclose f
client --title u
wait_tree 2 "H[u*]" >/dev/null
sleep 0.3; key "Move Left"
check "tiled: Move Left is the tree's"      wait_tree 1 "H[t u*]"
check "no invariant failures or errors"     clean_log
finish
