#!/usr/bin/env bash
# needs: plugin
# i3's tiling drag: a tiled window's title bar dragged, or
# Meta+drag anywhere in it, drops by tiling_drag.c's zones while the window stays put: sibling
# beside the target, parent out to the workspace's edge, the centre's bottom band swapped with it
# (beyond i3's move; its top and middle bands make a group, §9 G11), an empty workspace on the other monitor (moved there). Escape cancels; a press without movement only
# focuses; the indicator shows the drop mid-drag. Breeze title bars (tiledLook titlebars).
# Meta+right is i3's resize of the boundary: the bar shows mid-drag
# and the shares change at the release only; Escape leaves it; a press in the gap takes it too;
# a floating window's Meta+right stays KWin's resize.
# Not covered (docs/testing.md P3.5, only saves work or restores unreadable state):
# - hold.cpp paintScreen: GL_BLEND put back as it was; nothing reads GL state.
# - hold.cpp paintScreen: no draw when no vertex is in the repainted region (an empty draw).
# - hold.cpp SetDropIndicator: an unchanged rect asks no repaint.
# - kwin.js indicate: an unchanged rect isn't sent again over D-Bus.
# - kwin.js pollDrag: no second State() call while one is in flight.
source "$(dirname "$0")/lib.sh"
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height); } });"; }
# No user config (alacritty falls back to ~/.config/alacritty, whose padding and colours
# differ per machine), and the cursor in the window's colour: its block sits on the corner pixels.
term() { alacritty --config-file /dev/null --title "$1" -o "colors.primary.background=\"$2\"" -o "colors.cursor={cursor=\"$2\",text=\"$2\"}" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
set_key() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5; }
active() { kjs "log(workspace.activeWindow ? workspace.activeWindow.caption : 'none')"; }
dropped() { wait_log "^.{9}DRAG (dropped|no drop|cancelled|not started)" "$1" && after "$1" | grep -E '^.{9}DRAG ' | tail -1 | cut -c10-; }
wid() { fc "$1" | cut -d" " -f2 | cut -dx -f1; }
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
drag Meta left 1100 400 213 440
echo "    $(dropped $m)"
check "Meta+drag a onto b's centre, bottom band: swapped" wait_tree 1 "H[a* c b]" "$m"

# Within the parent zone (50 px; 28 px from the edge) of a's bottom edge, which
# is the workspace's too: out of the row, under everything (tree_move down). The press focused
# c, so c keeps it.
m=$(mark)
tdrag 640 14 213 692
check "c to a's bottom edge: parent, under the row" wait_tree 1 "V[H[a b] c*]" "$m"
echo "    $(dropped $m)"
poll eval '[[ "$(fc a)" == "0,0 640x360" && "$(fc c)" == "0,360 1280x360" ]]'

# Mid-drag: the window stays put and the indicator shows the band of c's centre under the pointer
# (the centre inset by 30 % of its smaller side, 108 px, at most 1.25 times as wide as tall, so
# 180 px in the middle, then cut in three: the middle one, stacked): then Escape, nothing changes.
m=$(mark)
"$INJECT" "abs 200 14" "wait 30" "btn left down" "abs 300 200" "wait 40" "abs 640 540" "wait 1200" \
    "key 1 down" "key 1 up" "wait 40" "abs 1000 300" "wait 40" "btn left up" &
held=$!
check "mid-drag: the indicator on c's centre, middle band" poll eval '[[ "$(indicator)" == "550,516 180x48" ]]' || echo "    indicator: $(indicator)"
check "  a still in its place"              eval '[[ "$(fc a)" == "0,0 640x360" ]]'
"$root/tools/shot.py" capture Virtual-0 "$KI3_TMP/shot.png"
# Inside the third, left of its icon and name (which sit at its centre): the highlight itself.
check "  drawn: frameActive at half over c's blue" eval '"$root/tools/shot.py" same "$KI3_TMP/shot.png" 565 540 38,60,204 10'
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
# of 358) and outside the parent zone (50 px; 59 px from the edge): beside b, before it.
set_key tiledLook frame
poll eval '[[ "$(fc b)" == "1,1 1278x358" ]]'
m=$(mark)
drag Meta left 640 540 60 180
check "frame: Meta+drag c to b's left side"  wait_tree 1 "V[H[c* b]]" "$m"
echo "    $(dropped $m)"

# i3's G1: a Meta-drag of a window that isn't focused leaves the focus where it was
# (the drag starts before any focusing; the dropped window has focus only if it had it): b
# focused, c dragged onto b's right side: after b, and b keeps the focus.
centre() { local g; g=$(fc "$1"); local x=${g%%,*} r=${g#*,}; local y=${r%% *} sz=${r#* }; echo "$((x + ${sz%x*} / 2)) $((y + ${sz#*x} / 2))"; }
key "Focus Right"
check "b focused"                           poll eval '[[ "$(active)" == b ]]'
read -r cx cy <<<"$(centre c)"; read -r bx by <<<"$(centre b)"
m=$(mark)
drag Meta left "$cx" "$cy" $((bx + 250)) "$by"
check "G1: c dropped after b, b keeps the focus" wait_tree 1 "V[H[b* c]]" "$m"
echo "    $(dropped $m)"
# i3's G7: any key press cancels a drag (and the key goes on); another button's release drops.
# The pointer is moved onto c first (focus follows mouse puts the focus there), then a key puts the
# focus back on b, so the press itself moves nothing and b's focus is what the drop must keep.
park_on_c() { read -r cx cy <<<"$(centre c)"; read -r bx by <<<"$(centre b)"; "$INJECT" "abs $cx $cy"; poll eval '[[ "$(active)" == c ]]'; key "Focus Left"; poll eval '[[ "$(active)" == b ]]'; }
park_on_c
check "b focused, the pointer on c"         eval '[[ "$(active)" == b ]]'
m=$(mark)
"$INJECT" "key ${EVDEV[Meta]} down" "btn left down" "abs $((cx - 100)) $cy" "wait 60" "abs $((bx + 200)) $by" "wait 60" \
    "key ${EVDEV[X]} down" "key ${EVDEV[X]} up" "wait 60" "key ${EVDEV[Meta]} up" "wait 40" "btn left up"
check "G7: a key press cancels the drag"    wait_log '^.{9}DRAG cancelled' "$m"
sleep 0.3
check "  the tree as it was, b focused"     eval '[[ "$(tree 1)" == "V[H[b* c]]" && "$(active)" == b ]]'
park_on_c
m=$(mark)
"$INJECT" "key ${EVDEV[Meta]} down" "btn left down" "abs $((cx - 100)) $cy" "wait 60" "abs $((bx - 250)) $by" "wait 60" \
    "btn right down" "wait 30" "btn right up" "wait 60" "key ${EVDEV[Meta]} up" "wait 40" "btn left up"
check "G7: another button's release drops: c before b, b keeps the focus" wait_tree 1 "V[H[c b*]]" "$m"
echo "    $(dropped $m)"

# i3's Meta+right resize, in the frame look (a 2 px gap between c and b): pressed near c's right
# edge, the one with b beyond it (i3's nearest edge, §9 Z1: nearer the screen's edge
# the press would do nothing).
# (Escape after Meta is let go: Meta+Esc is Plasma's System Monitor key, taken before the helper.)
read -r cw bw < <(kjs 'var o = {}; workspace.windowList().forEach(function (w) { o[w.caption] = Math.round(w.frameGeometry.width); }); log(o.c + " " + o.b)')
echo "    c ${cw}px, b ${bw}px"
m=$(mark)
"$INJECT" "abs $((cw - 100)) 180" "wait 30" "key ${EVDEV[Meta]} down" "btn right down" "abs $((cw - 50)) 180" "wait 40" "abs $((cw + 150)) 180" "wait 1000" \
    "key ${EVDEV[Meta]} up" "wait 40" "key 1 down" "key 1 up" "wait 40" "abs 300 180" "wait 40" "btn right up" &
held=$!
check "Meta+right mid-drag: the 2 px bar at the pointer" poll eval '[[ "$(indicator)" == $((cw + 149)),*" 2x"* ]]' || echo "    indicator: $(indicator)"
check "  the windows not resized yet"       eval '[[ "$(wid c)" == "$cw" ]]'
wait $held
echo "    $(after $m | grep -E '^.{9}(RESIZE|ERROR|WARN|INVARIANT)' | cut -c10- | tr '\n' '|')"
check "Escape: cancelled, the bar gone"      eval 'wait_log "^.{9}RESIZE cancelled" "$m" && [[ -z "$(indicator)" ]]'
check "  c as it was"                        eval '[[ "$(wid c)" == "$cw" ]]'
m=$(mark)
drag Meta right $((cw - 100)) 180 $((cw + 150)) 180
check "Meta+right drag in c: resized at the release" wait_log "^.{9}RESIZE resized width" "$m"
m2=$(mark)
drag Meta right 100 180 300 180
check "Meta+right near c's left edge (the screen's): nothing, as i3" wait_log "^.{9}RESIZE not started: nothing to resize against" "$m2"
echo "    $(after $m | grep -E '^.{9}(RESIZE|ERROR|WARN|INVARIANT)' | cut -c10- | tr '\n' '|')"
poll eval '[[ "$(wid c)" -gt $((cw + 120)) ]]'
echo "    c $(fc c)  b $(fc b)"
check "  c grew by about the drag"          eval 'w=$(wid c); (( w >= cw + 125 && w <= cw + 160 ))'
m=$(mark)
read -r gx < <(kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") { var g = w.frameGeometry; log(Math.round(g.x + g.width)); } })')
drag Meta right $((gx + 1)) 180 $((gx - 99)) 180
check "Meta+right in the gap: resized too"   wait_log "^.{9}RESIZE resized width" "$m"
echo "    c $(fc c)  b $(fc b)"
check "  c shrank"                           poll eval '[[ "$(wid c)" -lt $((cw + 100)) ]]'

# A floating window's Meta+drag stays KWin's move: it goes where it is dropped, still floating.
key "Floating Toggle"
check "c floats"                            wait_tree 1 "V[H[b]] ~c*" 
g0=$(fc c)
drag Meta left 640 360 700 400
check "  Meta+drag moved it, still floating" poll eval '[[ "$(fc c)" != "$g0" && "$(tree 1)" == "V[H[b]] ~c*" ]]'
echo "    c $g0 -> $(fc c)"
g0=$(fc c)
drag Meta right 640 360 760 420
check "  Meta+right resized it (KWin's), still floating" poll eval '[[ "$(fc c)" != "$g0" && "$(tree 1)" == "V[H[b]] ~c*" ]]'
echo "    c $g0 -> $(fc c)"

# Meta+Shift+left on a floating window is i3's floating move, Shift ignored (§9 G13): the helper
# starts KWin's move, which KWin's own action (Meta alone) wouldn't. Released over b with Shift
# held, it never reads as KWin's custom-tile drop (an outline window over b, c tiled into b's tile
# at the release; a capture, 2026-10-29): the helper takes Shift out of that move. d keeps two
# windows tiled: a lone window is in the root tile, which KWin's RootTile::pick never picks
# (6.7.5 customtile.cpp:461), so there would be nothing to drop into.
floating_c() { [[ "$(tree 1)" == *"~c"* ]]; }
term d "#ffff00"
check "d tiled beside b"                  poll eval '[[ "$(tree 1)" == *b*d* && "$(fc d)" == *x718 ]]'
read -r cx cy <<<"$(centre c)"; read -r bx by <<<"$(centre b)"
g0=$(fc c); nwin() { kjs 'log(workspace.windowList().filter(function (w) { return w.caption !== "kwin-i3 gap"; }).length)'; }   # the gap strips come and go as c moves
n0=$(nwin)
m=$(mark)
"$INJECT" "abs $cx $cy" "wait 30" "key ${EVDEV[Meta]} down" "key ${EVDEV[Shift]} down" "wait 30" "btn left down" \
    "abs $((cx - 40)) $((cy - 40))" "wait 60" "abs $bx $by" "wait 900" "btn left up" "wait 60" \
    "key ${EVDEV[Shift]} up" "key ${EVDEV[Meta]} up" &
held=$!
sleep 0.7
n1=$(nwin)
wait $held
check "G13: Meta+Shift+drag moved the floating c, still floating" poll eval '[[ "$(fc c)" != "$g0" ]] && floating_c'
check "  no tiling drag"                    eval '! after "$m" | grep -qE "^.{9}DRAG (dropped|cancelled|no drop|not started|c$)"'
check "  no tile outline over b mid-drag"   eval '[[ "$n1" == "$n0" ]]' || echo "    windows: $n0 before, $n1 mid-drag"
check "  released with Shift: c never tiled by KWin" eval '! after "$m" | grep -qE "^.{9}GEOM c .* -> [0-9]+,[0-9]+ [0-9]+x718$"' \
    || after "$m" | grep -E '^.{9}GEOM c ' | cut -c10- | sed 's/^/    /'
kclose d
poll eval '[[ "$(tree 1)" != *d* ]]'

# Meta+Shift+left on a tiling window is the tiling drag of Meta+left (§9 G5): Shift adds nothing
# and never floats it. c tiled again, dragged onto b's left side.
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") workspace.activeWindow = w; })'
poll eval '[[ "$(active)" == *c* ]]'
key "Floating Toggle"
check "c tiled again"                       poll eval '[[ "$(tree 1)" != *"~c"* ]]'
read -r cx cy <<<"$(centre c)"; g=$(fc b); bx=${g%%,*}
m=$(mark)
drag Meta+Shift left "$cx" "$cy" $((bx + 100)) 360
check "G5: Meta+Shift+drag of the tiled c: a tiling drag" wait_log '^.{9}DRAG dropped sibling left' "$m"
echo "    $(dropped $m) / $(tree 1)"
check "  c before b, still tiled"           poll eval '[[ "$(tree 1)" != *"~c"* && "$(tree 1)" == *"c"*"b"* ]]'

# A plain press in the gap is i3's resize too, as on the nearest window's ring (Z3). An app that draws its own frame keeps an invisible resize border past it (a GTK
# header bar here, VS Code live), as KWin reports no tiled edges for a padded tile: a press there
# stays kwin-i3's (OPEN.md item 43), never the app's own resize, which KWin ran as its live tile
# resize.
kclose c; kclose b
set_key gapsInner 16
client --title L --csd
check "L, drawing its own frame"            poll eval '[[ "$(tree 1)" == *L* ]]'
key "Split H"; client --title R
check "L | R"                               poll eval '[[ "$(tree 1)" == *"L R*"* ]]'
# Focus follows the mouse out of L, through its margin, into R (B1; probe 94, a capture
# 2026-10-29): the margin over R's frame raises R, and the raise must not cost R its focus. At a
# 4 px gap, where L's margin reaches R's frame.
set_key gapsInner 4
key "Focus Left"
poll eval '[[ "$(kjs "log(workspace.activeWindow.caption)")" == L ]]'
read -r lx ly <<<"$(centre L)"; read -r rx ry <<<"$(centre R)"
c=(); for ((x = lx; x < rx; x += 4)); do c+=("abs $x $ly" "wait 8"); done
"$INJECT" "${c[@]}" "abs $rx $ly" "wait 300"
check "focus follows the mouse from L across its margin into R" poll eval '[[ "$(kjs "log(workspace.activeWindow.caption)")" == R ]]'
set_key gapsInner 16
sleep 1
lw=$(wid L); g=$(fc L); edge=$(( ${g%%,*} + lw ))   # the first x past L's frame: its right ring
echo "    L $(fc L)  R $(fc R)  ring at x $edge"
m=$(mark)
"$INJECT" "abs $((edge + 4)) 360" "wait 60" "btn left down" "wait 60" "abs $((edge + 50)) 360" "wait 60" "abs $((edge + 100)) 360" "wait 60" "btn left up"
check "a plain drag in the gap over L's margin: i3's resize, L wider" poll eval 'w=$(wid L); (( w >= lw + 70 && w <= lw + 130 ))' || echo "    L was $lw wide, is $(wid L)"
check "  not the app's resize"              eval '! after "$m" | grep -qE "^.{9}DRAG start resize"'
sleep 0.5; lw=$(wid L); g=$(fc L); edge=$(( ${g%%,*} + lw ))
"$INJECT" "abs $edge 360" "wait 60" "btn left down" "wait 60" "abs $((edge - 50)) 360" "wait 60" "abs $((edge - 100)) 360" "wait 60" "btn left up"
check "a plain drag on L's ring over its margin: i3's resize, L narrower" poll eval 'w=$(wid L); (( w >= lw - 130 && w <= lw - 70 ))' || echo "    L was $lw wide, is $(wid L)"
check "  not the app's resize"              eval '! after "$m" | grep -qE "^.{9}DRAG start resize"'
sleep 0.5; rw=$(wid R); g=$(fc R); rx=${g%%,*}
"$INJECT" "abs $((rx - 3)) 360" "wait 60" "btn left down" "wait 60" "abs $((rx + 50)) 360" "wait 60" "abs $((rx + 100)) 360" "wait 60" "btn left up"
check "a plain drag in the gap beside R (no margin): i3's resize, R narrower" poll eval 'w=$(wid R); (( w >= rw - 130 && w <= rw - 70 ))' || echo "    R was $rw wide, is $(wid R)"

check "no invariant failures or errors"     clean_log
finish
