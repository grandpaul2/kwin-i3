#!/usr/bin/env bash
# needs: plugin
# A split floated whole (i3's floating_enable on a container; behaviour.md T16, L10a; plan.md
# "The mouse"). Focus Parent, then Floating Toggle: one floating container, centred on the
# workspace, its windows one rect with no gaps inside (gaps.c:57), kept above the tiled window.
# Meta+drag moves it whole and Meta+right resizes it whole (the helper; the release's rect read
# back and laid out again); Floating Toggle tiles it whole; its windows closing close it.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME on'
client --title a; client --title b
wait_tree 1 "H[a b*]" >/dev/null
key "Split V"
client --title c
check "a | V[b c]"                          wait_tree 1 "H[a V[b c*]]"
key "Focus Parent"
key "Floating Toggle"
check "V[b c] floated whole"                wait_tree 1 "H[a] ~V[b c]*"

xywh() { geom "$1" | tr ',x' '  '; }
# b over c, one column, no gap between: only their two rings (1 px each, inside each window's
# share as i3's border is inside its con); the two together centred on the workspace.
stacked() {
    local bx by bw bh cx cy cw ch
    read -r bx by bw bh < <(xywh b); read -r cx cy cw ch < <(xywh c)
    [[ $bx == "$cx" && $bw == "$cw" && $((by + bh + 2)) == "$cy" ]]
}
check "b over c, no gap"                    poll stacked
read -r bx by bw bh < <(xywh b); read -r cx cy cw ch < <(xywh c)
area=$(kjs "var a = workspace.clientArea(KWin.PlacementArea, workspace.activeScreen, workspace.currentDesktop); log(a.x + ' ' + a.y + ' ' + a.width + ' ' + a.height)")
read -r ax ay aw ah <<<"$area"
mid() { local d=$(( $1 - $2 )); (( d >= -1 && d <= 1 )); }
check "centred on the workspace"            eval 'mid $((bx + bw / 2)) $((ax + aw / 2)) && mid $(((by + cy + ch) / 2)) $((ay + ah / 2))'
check "kept above the tiled a"              eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"b\" || w.caption === \"c\") log(w.keepAbove && !w.tile); })" | sort -u)" == true ]]'

# Meta+drag on c: both move, in step, and stay there after the release's read-back.
m=$(mark)
drag Meta left $((cx + cw / 2)) $((cy + ch / 2)) $((cx + cw / 2 + 100)) $((cy + ch / 2 + 40))
check "Meta+drag: b moved 100,40"           wait_geom b "$((bx + 100)),$((by + 40)) ${bw}x${bh}"
check "  and c with it"                     wait_geom c "$((cx + 100)),$((cy + 40)) ${cw}x${ch}"
check "  read back"                         wait_log '^.{9}FLOAT a container moved by the mouse' "$m"
sleep 0.5
check "  still there after the pass"        geom_is b "$((bx + 100)),$((by + 40)) ${bw}x${bh}"
check "  no tiling drag"                    eval '! after "$m" | grep -qE "^.{9}DRAG "'

# Meta+right near c's bottom-right corner: the whole grows from that corner, laid out again.
read -r bx by bw bh < <(xywh b); read -r cx cy cw ch < <(xywh c)
m=$(mark)
drag Meta right $((cx + cw - 5)) $((cy + ch - 5)) $((cx + cw + 55)) $((cy + ch + 35))
check "Meta+right: 60 px wider, b and c"    poll eval '[[ "$(xywh b | cut -d" " -f3)" == $((bw + 60)) && "$(xywh c | cut -d" " -f3)" == $((cw + 60)) ]]'
check "  40 px taller together"             poll eval 'read -r _ y1 _ _ < <(xywh b); read -r _ y2 _ h2 < <(xywh c); (( y2 + h2 - y1 == ch + cy + 40 - by ))'
check "  still one column"                  poll stacked

# A plain press on the ring between b and c (b's bottom side): a tiling resize inside the
# container, b taller and c shorter by as much (route_click, step 6: tiling_resize first).
read -r bx by bw bh < <(xywh b); read -r cx cy cw ch < <(xywh c)
"$INJECT" "abs $((bx + bw / 2)) $((by + bh))" "wait 30" "btn left down" "abs $((bx + bw / 2)) $((by + bh + 15))" "wait 40" \
    "abs $((bx + bw / 2)) $((by + bh + 30))" "wait 60" "btn left up"
check "ring between them: b 30 px taller"   poll eval 'read -r _ _ _ h < <(xywh b); (( h >= bh + 28 && h <= bh + 32 ))'
check "  c as much shorter, same bottom"    poll eval 'read -r _ y _ h < <(xywh c); (( y + h == cy + ch && h <= ch - 28 ))'
# Its outer ring (c's bottom side, no neighbour there): the whole container resized.
read -r bx by bw bh < <(xywh b); read -r cx cy cw ch < <(xywh c)
"$INJECT" "abs $((cx + cw / 2)) $((cy + ch))" "wait 30" "btn left down" "abs $((cx + cw / 2)) $((cy + ch + 15))" "wait 40" \
    "abs $((cx + cw / 2)) $((cy + ch + 30))" "wait 60" "btn left up"
check "outer ring: 30 px taller whole"      poll eval 'read -r _ y _ h < <(xywh c); read -r _ y1 _ _ < <(xywh b); (( y + h >= cy + ch + 28 && y + h <= cy + ch + 32 && y1 == by ))'
check "  still one column"                  poll stacked

# Back into the tiles, whole: the ring presses focused c, so Focus Parent first.
check "the ring press focused c"            wait_tree 1 "H[a] ~V[b c*]"
key "Focus Parent"
key "Floating Toggle"
check "tiled again: H[a V[b c]]"            wait_tree 1 "H[a V[b c]*]"
check "  not kept above"                    poll eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"b\") log(w.keepAbove); })")" == false ]]'

# Floated again; its windows closing close it.
key "Floating Toggle"
check "floated again"                       wait_tree 1 "H[a] ~V[b c]*"
# Down to one window: KWin's, as any floating window alone (plan.md "The mouse"), i3's split
# staying around it; then closed, it closes the container.
kclose b
check "c alone, in its split"               wait_tree 1 "H[a] ~V[c]*"
check "  not floated any more"              poll eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"c\") log(w.noBorder); })")" == false ]]'
kclose c
check "closed with its windows"             wait_tree 1 "H[a*]"
finish
