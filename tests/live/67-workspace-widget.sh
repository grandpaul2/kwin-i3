#!/usr/bin/env bash
# The workspace widget (widget/, docs/spec-workspace-widget.md) in plasmawindowed inside the test
# KWin: every workspace in use, each at its own monitor's shape (1280x720 here, not both monitors'
# 2560), the shown ones marked; a click is kwin-i3's Meta+N. The widget reports what it computed
# on Qt's debug log (qml.debug on), which the checks read.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
spaces() { grep -o 'kwin-i3 workspaces: .*' "$KI3_TMP/pw.log" | tail -1 | cut -d' ' -f3-; }
spaces_are() { [[ "$(spaces)" == "$1" ]]; }
click() { "$INJECT" "abs $1 $2" "wait 30" "btn left down" "wait 20" "btn left up" "wait 20"; }
check "the widget installs"                 eval 'kpackagetool6 -t Plasma/Applet -i "$root/widget" >/dev/null 2>&1'
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title a --color red
key "Workspace 3"; client --title b --color blue; client --title c --color lime
key "Focus Right"; key "Workspace 4"; client --title d --color yellow
key "Focus Left"
check "b | c on 3 (Virtual-0), d on 4 (Virtual-1), a on 1" eval 'wait_tree 3 "H[b c*]" >/dev/null && wait_tree 4 "H[d]" >/dev/null && wait_tree 1 "H[a]" >/dev/null'
# The widget's window tiled alone on workspace 5, on Virtual-1: a fixed place (1281,1 1278x718).
key "Focus Right"; key "Workspace 5"
QT_FORCE_STDERR_LOGGING=1 QT_LOGGING_RULES="qml.debug=true" plasmawindowed net.local.kwini3.workspaces > "$KI3_TMP/pw.log" 2>&1 &
check "the widget tiles on workspace 5"     poll eval '[[ "$(tree 5)" == "H[kwin-i3_Workspaces"* ]]'
check "the widget reports"                  poll eval '[ -n "$(spaces)" ]'
# [num, monitor, width, height, windows, shown, focused]: 1, 3, 4, 5 (2 and 6-10 unused), each
# one monitor's 1280x720; 3 (Virtual-0) and 5 (Virtual-1) shown, 5 focused (the widget is active).
check "1, 3, 4, 5, each one monitor, 3 and 5 shown, 5 focused" poll spaces_are '[[1,"Virtual-0",1280,720,1,false,false],[3,"Virtual-0",1280,720,2,true,false],[4,"Virtual-1",1280,720,1,false,false],[5,"Virtual-1",1280,720,1,true,true]]' || echo "    $(spaces)"
# The task manager's frame read from the theme (left right top bottom, then the lead): margins
# found, and no lead outside a panel, so 1's thumbnail starts at the widget's edge.
frame() { grep -o 'kwin-i3 workspaces frame: .*' "$KI3_TMP/pw.log" | tail -1 | cut -d' ' -f4-; }
check "the theme's task frame has side margins; no lead off a panel" poll eval 'read -r l r t b lead <<<"$(frame)"; (( l + r > 0 )) && [[ $lead == 0 ]]' || echo "    $(frame)"
# A click on 1's thumbnail, the first: Meta+1.
g=$(kjs 'workspace.windowList().forEach(function (w) { if (w.resourceClass.indexOf("plasmawindowed") >= 0) { var c = w.clientGeometry; log(Math.round(c.x) + " " + Math.round(c.y) + " " + Math.round(c.height)); } });')
read -r cx cy ch <<<"$g"
x1=$(( cx + ch * 16 / 9 / 2 )); y1=$(( cy + ch / 2 ))
echo "    widget client at $cx,$cy height $ch: 1's thumbnail centre near $x1,$y1"
m=$(mark)
click "$x1" "$y1"
check "a click on 1's thumbnail runs kwin-i3's Workspace 1" wait_log '^.{9}ACTION Workspace 1$' "$m"
check "no invariant failures or errors"     clean_log
finish
