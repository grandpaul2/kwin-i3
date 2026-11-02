#!/usr/bin/env bash
# needs: plugin
# A tabbed or stacked group floated whole (88's container, a group): its bar on the shown tab's
# top window, from the float on and through a resize, and its size from its windows all the way
# down (behaviour.md T16, F1a, L10a).
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME on'
xywh() { geom "$1" | tr ',x' '  '; }
point 20 20     # off the windows: focus follows mouse would focus what is under the pointer
client --title a; client --title d
wait_tree 1 "H[a d*]" >/dev/null
key "Split V"
client --title e
check "a | V[d e]"                          wait_tree 1 "H[a V[d e*]]"

# A tabbed group floated whole: its bar on the shown window's top edge, ring and all, from the
# float on (a capture: drawn mid-window until the next pass, the frame not landed when told), and
# after a Meta+right resize, as wide as the window (a capture: left behind at the old width, the
# container creeping a few pixels each time).
key "Layout Tabbed"
check "d e tabbed"                          wait_tree 1 "H[a T[d e*]]"
key "Focus Parent"
key "Floating Toggle"
check "T[d e] floated whole"                wait_tree 1 "H[a] ~T[d e]*"
barrect() { busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -o '"barRects" as [0-9]* "[^"]*"' | cut -d'"' -f4 | tr ',x' '  '; }
onbar() {   # the bar 24 px tall, right above e's ring, its width e's and both rings
    local x y w h ex ey ew eh
    read -r x y w h < <(barrect); read -r ex ey ew eh < <(xywh e)
    [[ -n $x && $h == 24 && $((y + 25)) == "$ey" && $((x + 1)) == "$ex" && $w == $((ew + 2)) ]]
}
check "  its bar on e's top edge"           poll onbar || echo "    bar $(barrect) / e $(xywh e)"
read -r ex ey ew eh < <(xywh e)
drag Meta right $((ex + ew - 5)) $((ey + eh - 5)) $((ex + ew - 85)) $((ey + eh - 55))
check "Meta+right: e 80 px narrower"        poll eval 'read -r _ _ w _ < <(xywh e); (( w == ew - 80 ))'
check "  its bar with it"                   poll onbar || echo "    bar $(barrect) / e $(xywh e)"
check "  the top edge where it was"         poll eval 'read -r _ y _ _ < <(xywh e); (( y == ey ))'

# A tabbed group of two splits, the focus on the lower window of the shown one (a capture): sized
# from its windows all the way down, not the size floor (i3's split child counts 0; T16), and
# its bar drawn against the shown tab's top window, so it stays on the container's top while a
# resize is still under way (read with the button held).
kclose d; kclose e
check "a alone"                             wait_tree 1 "H[a*]"
point 20 20     # off the group: focus follows mouse would focus what is under the pointer
client --title f
key "Split V"
client --title g
key "Layout Tabbed"
key "Split V"
client --title h
check "T[f V[g h]]"                         wait_tree 1 "H[a T[f V[g h*]]]"
key "Focus Left"
check "  f shown"                           wait_tree 1 "H[a T[f* V[g h]]]"
key "Split V"
client --title i
check "T[V[f i] V[g h]]"                    wait_tree 1 "H[a T[V[f i*] V[g h]]]"
key "Focus Parent"
check "  V focused"                         wait_tree 1 "H[a T[V[f i]* V[g h]]]"
key "Focus Parent"
check "  T focused"                         wait_tree 1 "H[a T[V[f i] V[g h]]*]"
key "Floating Toggle"
check "floated whole"                       wait_tree 1 "H[a] ~T[V[f i] V[g h]]*"
check "  its windows' own sizes, not the floor" poll eval 'read -r _ _ w _ < <(xywh f); (( w >= 300 ))'
near() { local d=$(( $1 - $2 )); (( d >= -1 && d <= 1 )); }
onbarof() {   # the bar right above window $1's ring, as wide as it and both rings
    local x y w h ex ey ew eh
    read -r x y w h < <(barrect); read -r ex ey ew eh < <(xywh "$1")
    [[ -n $x && $h == 24 ]] && near $((y + 25)) "$ey" && near $((x + 1)) "$ex" && near "$w" $((ew + 2))
}
check "  its bar on f, the tab's top window"  poll onbarof f || echo "    bar $(barrect) / f $(xywh f)"
# Meta+right near i's bottom-right corner, up and left, held for a moment.
read -r ix iy iw ih < <(xywh i)
"$INJECT" "abs $((ix + iw - 5)) $((iy + ih - 5))" "wait 30" "key ${EVDEV[Meta]} down" "btn right down" \
    "abs $((ix + iw - 35)) $((iy + ih - 45))" "wait 20" "abs $((ix + iw - 65)) $((iy + ih - 85))" "wait 1500" \
    "btn right up" "key ${EVDEV[Meta]} up" &
held=$!
sleep 0.9
check "  mid-resize: the bar still on f"    onbarof f || echo "    bar $(barrect) / f $(xywh f)"
wait "$held"
check "  and after"                         poll onbarof f || echo "    bar $(barrect) / f $(xywh f)"
finish
