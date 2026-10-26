#!/usr/bin/env bash
# needs: plugin
# i3's tiling drag (docs/spec-tiled-look.md, part B): a tiled window's title bar dragged, or
# Meta+drag anywhere in it, drops by tiling_drag.c's zones while the window stays put: sibling
# beside the target, parent out to the workspace's edge, center moved after it (Meta+Shift: the
# swap), an empty workspace on the other monitor. Escape cancels; a press without movement only
# focuses; the indicator shows the drop mid-drag. Breeze title bars (tiledLook titlebars).
# Not covered (docs/testing.md P3.5, only saves work or restores unreadable state):
# - hold.cpp paintScreen: GL_BLEND put back as it was; nothing reads GL state.
# - hold.cpp paintScreen: no draw when no vertex is in the repainted region (an empty draw).
# - hold.cpp SetDropIndicator: an unchanged rect asks no repaint.
# - kwin.js indicate: an unchanged rect isn't sent again over D-Bus.
# - kwin.js pollDrag: no second State() call while one is in flight.
source "$(dirname "$0")/lib.sh"
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height); } });"; }
term() { alacritty --title "$1" -o "colors.primary.background=\"$2\"" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
set_key() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5; }
active() { kjs "log(workspace.activeWindow ? workspace.activeWindow.caption : 'none')"; }
dropped() { wait_log "^.{9}DRAG (dropped|no drop|cancelled|not started)" "$1" && after "$1" | grep -E '^.{9}DRAG ' | tail -1 | cut -c10-; }
indicator() { busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -o '"drop" s "[^"]*"' | cut -d'"' -f4; }
# A title-bar drag in steps, as a hand would (past the start-drag distance).
tdrag() {
    local x1=$1 y1=$2 x2=$3 y2=$4 s; local -a c=("abs $x1 $y1" "wait 30" "btn left down")
    for s in 1 2 3 4 5 6; do c+=("abs $((x1 + (x2 - x1) * s / 6)) $((y1 + (y2 - y1) * s / 6))" "wait 40"); done
    "$INJECT" "${c[@]}" "wait 60" "btn left up"
}

load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME on'
set_key tiledLook titlebars
term a "#ff0000"; term b "#00ff00"; term c "#0000ff"
check "a | b | c"                           wait_tree 1 "H[a b c*]"
poll eval '[[ "$(fc a)" == 0,0* ]]'
echo "    a $(fc a)  b $(fc b)  c $(fc c)"

m=$(mark)
"$INJECT" "abs 200 14" "wait 30" "btn left down" "wait 30" "btn left up"
check "a title-bar click: a focused, nothing moved" poll eval '[[ "$(active)" == a && "$(fc a)" == "0,0 427x720" ]]'
check "  no drag"                           eval '! after $m | grep -q "^.\{9\}DRAG"'

# A button still clicks: the decoration takes its press first (minimize, 62 px from a's right).
"$INJECT" "abs 365 14" "wait 30" "btn left down" "wait 30" "btn left up"
check "a's minimize button"                 poll eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"a\") log(w.minimized); })")" == true ]]'
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") { w.minimized = false; workspace.activeWindow = w; } });'
poll eval '[[ "$(fc a)" == "0,0 427x720" && "$(active)" == a ]]'

m=$(mark)
tdrag 200 14 1180 360
echo "    $(dropped $m)"
check "a to c's right side: sibling"        wait_tree 1 "H[b c a*]" "$m"

m=$(mark)
drag Meta+Shift left 1100 400 213 360
echo "    $(dropped $m)"
check "Meta+Shift a onto b's centre: swapped" wait_tree 1 "H[a* c b]" "$m"

# Within the parent zone (title bar + 5 px: 33; 28 px from the edge) of a's bottom edge, which
# is the workspace's too: out of the row, under everything (tree_move down). The press focused
# c, so c keeps it.
m=$(mark)
tdrag 640 14 213 692
check "c to a's bottom edge: parent, under the row" wait_tree 1 "V[H[a b] c*]" "$m"
echo "    $(dropped $m)"
poll eval '[[ "$(fc a)" == "0,0 640x360" && "$(fc c)" == "0,360 1280x360" ]]'

# Mid-drag: the window stays put and the indicator shows the centre of c, inset by 30 % of its
# smaller side (108 px): then Escape, and nothing changes.
m=$(mark)
"$INJECT" "abs 200 14" "wait 30" "btn left down" "abs 300 200" "wait 40" "abs 640 540" "wait 1200" \
    "key 1 down" "key 1 up" "wait 40" "abs 1000 300" "wait 40" "btn left up" &
held=$!
check "mid-drag: the indicator on c's centre" poll eval '[[ "$(indicator)" == "108,468 1064x144" ]]' || echo "    indicator: $(indicator)"
check "  a still in its place"              eval '[[ "$(fc a)" == "0,0 640x360" ]]'
"$root/tools/shot.py" capture Virtual-0 "$KI3_TMP/shot.png"
check "  drawn: frameActive at half over c's blue" eval '"$root/tools/shot.py" same "$KI3_TMP/shot.png" 640 540 38,60,204 10'
wait $held
check "Escape: cancelled, the indicator gone" eval '[[ "$(dropped $m)" == "DRAG cancelled" && -z "$(indicator)" ]]'
check "  the tree as it was"                eval '[[ "$(tree 1)" == "V[H[a b] c*]" ]]'

# A drag's motions go nowhere: resting on c's own close button mid-drag doesn't hover it (Breeze's
# pink circle). KWin's decoration filter would hover it: while a button is held the pointer stays
# on the pressed decoration (input.cpp, focusUpdatesBlocked). c, not a: over a's title the parent
# zone's indicator would cover the button. Over itself and off the workspace's edge: no drop.
"$INJECT" "abs 640 374" "wait 30" "btn left down" "abs 700 500" "wait 40" "abs 1266 374" "wait 1200" \
    "key 1 down" "key 1 up" "wait 40" "btn left up" &
held=$!
poll eval '[[ "$(kjs "log(workspace.cursorPos.x + \",\" + workspace.cursorPos.y)")" == 1266,374 ]]'
sleep 0.2
"$root/tools/shot.py" capture Virtual-0 "$KI3_TMP/shot.png"
echo "    c's close button's edge: $("$root/tools/shot.py" probe "$KI3_TMP/shot.png" 1259 374)"
check "mid-drag over c's own close button: no drop shown" eval '[[ -z "$(indicator)" ]]'
check "  and no hover"                      eval '! "$root/tools/shot.py" same "$KI3_TMP/shot.png" 1259 374 255,152,162 20'
wait $held

# Onto the other monitor, over its empty workspace: moved there (i3 keeps the one-child split).
m=$(mark)
tdrag 200 14 1900 360
check "a onto the empty workspace on Virtual-1" wait_tree 2 "H[a*]" "$m"
check "  ws 1 without it"                   wait_tree 1 "V[H[b] c]" "$m"

# i3's frame (no title bars): Meta+drag only. c onto b's left side, inside the sibling zone (30 %
# of 358) and outside the parent zone (20 + 5 px with no title bar): beside b, before it.
set_key tiledLook frame
poll eval '[[ "$(fc b)" == "1,1 1278x358" ]]'
m=$(mark)
drag Meta left 640 540 60 180
check "frame: Meta+drag c to b's left side"  wait_tree 1 "V[H[c* b]]" "$m"
echo "    $(dropped $m)"

# A floating window's Meta+drag stays KWin's move: it goes where it is dropped, still floating.
key "Floating Toggle"
check "c floats"                            wait_tree 1 "V[H[b]] ~c*" 
g0=$(fc c)
drag Meta left 640 360 700 400
check "  Meta+drag moved it, still floating" poll eval '[[ "$(fc c)" != "$g0" && "$(tree 1)" == "V[H[b]] ~c*" ]]'
echo "    c $g0 -> $(fc c)"

check "no invariant failures or errors"     clean_log
finish
