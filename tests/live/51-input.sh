#!/usr/bin/env bash
# focus: mouse
# Real input, part 2: the pointer moved and dragged, focus by mouse, through libei. Designed in
# docs/input-tests-design.md, revised by its review (docs/input-tests-review-2026-10-22.md).
source "$(dirname "$0")/lib.sh"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
output_is() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name); })")" == "$2" ]]; }
tile_share() {   # share of the n-th child tile of workspace 1's root on screen 0, x1000
    kjs "var r = workspace.rootTile(workspace.screens[0], workspace.desktops[0]); var t = r.tiles[$1]; log(Math.round((r.layoutDirection === 2 ? t.relativeGeometry.height : t.relativeGeometry.width) * 1000));"
}
words_of() { local t; t=$(tree "$1" "${2:-0}"); echo " ${t//[\[\]*!]/ } "; }
has_word() { [[ "$(words_of "$1" "$3")" == *" $2 "* ]]; }
close_all() { local c; for c in "$@"; do kclose "$c"; done; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. Resizing an edge with no neighbour (here a lone window) changes no share, so it changes no
#    tile either: the window must still go back to filling its tile, as in i3 (fuzzer I10,
#    shrunk to: open a window, Meta+right-drag it).
#    A resize drag with the client's answer to its last step still in flight at the release: kwin-i3
#    puts the window back in its tile at each step, so at the end the frame fits and nothing is
#    written, then the late answer lands (make test, 2026-10-24: 1176 wide, 2 runs in 7). A slow
#    client (20 ms a resize) and steps 30 ms apart, the last one with the release: stuck 10 of 10.
slow_drag() {
    "$INJECT" "abs 960 360" "wait 30" "key ${EVDEV[Meta]} down" "btn right down" \
        "abs 934 381" "wait 30" "abs 908 402" "wait 30" "abs 882 423" "wait 30" "abs 856 445" "wait 0" \
        "btn right up" "key ${EVDEV[Meta]} up"
}
for i in 1 2 3; do
    client --title slow$i --resize-delay 0.02
    m=$(mark); slow_drag
    wait_log "^.{9}DRAG end resize slow$i" "$m" >/dev/null
    check "a late answer to the drag ($i): refitted" geom_is slow$i "0,0 1280x720"
    kclose slow$i
done
client --title solo
check "solo fills the monitor"              geom_is solo "0,0 1280x720"
m=$(mark)
drag Meta right 960 360 856 445
check "a resize drag happened"              wait_log '^.{9}DRAG end resize solo' "$m"
check "solo fills the monitor again"        geom_is solo "0,0 1280x720"

#    A fullscreen window Meta+dragged to the other monitor goes to the workspace shown there and
#    stays fullscreen on it. KWin refuses to tile a window that is already fullscreen, and that
#    refusal used to float it, small, on the old monitor (fuzzer I9). Leaving fullscreen tiles it.
fs() { busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "Window Fullscreen"; }
fs
check "solo is fullscreen"                  wait_tree 1 "H[solo*!]"
m=$(mark)
drag Meta left 256 360 1855 349
check "a move drag happened"                wait_log '^.{9}DRAG end move solo' "$m"
check "solo moved to workspace 2, still tiled and fullscreen" wait_tree 2 "H[solo*!]" "$m"
check "it fills the second monitor"         geom_is solo "1280,0 1280x720"
fs
check "out of fullscreen it tiles there"    wait_tree 2 "H[solo*]"
check "filling the second monitor"          geom_is solo "1280,0 1280x720"
kclose solo
key "Workspace 1"

# 2. Dragging the border resizes, and the model keeps it: the check comes after the reconcile
#    that follows the drag (without the read-back it snaps back to half).
client --title a; client --title b
check "a | b"                               wait_tree 1 "H[a b*]"
m=$(mark)
drag Meta right 600 360 760 360
check "a resize drag happened"              wait_log '^.{9}DRAG end resize a' "$m"
check "and was reconciled"                  wait_log '^.{9}TREE 1 ' "$(grep -nE '^.{9}DRAG end' "$KI3_LOG" | tail -1 | cut -d: -f1)"
share_is() { local s; s=$(tile_share "$1"); (( s >= $2 - 5 && s <= $2 + 5 )); }
check "the model keeps a at 760 px (tile share ~0.594)" poll share_is 0 594
check "a is 760 wide"                       geom_is a "0,0 760x720"

# Nested: three columns, drag the b|c border; then a horizontal border inside a vertical split.
# The drag began inside a, so a has the focus (focus follows the mouse at once). It ended inside b,
# but an enter during the drag doesn't count: cross back into b, so c opens after it.
point 300 360
point 1000 360
client --title c
check "H[a b c*]"                           wait_tree 1 "H[a b c*]"
point 640 360
a_before=$(tile_share 0)
m=$(mark)
drag Meta right 800 360 900 360
check "b's right border dragged"            wait_log '^.{9}DRAG end resize b' "$m"
check "b grew to the pointer (900 px): c ~0.297" poll share_is 2 297
check "a untouched by the b|c drag"         poll share_is 0 "$a_before"

close_all a b c
check "empty again"                         wait_tree 1 "H[]*"

# 3. Dragging a tiled window out of its tile floats it near the drop; a takes the screen.
point 640 360
client --title a; client --title b
check "a | b again"                         wait_tree 1 "H[a b*]"
m=$(mark)
drag Meta left 960 360 760 360
check "a move drag happened"                wait_log '^.{9}DRAG end move b' "$m"
check "b floats, a tiles"                   wait_tree 1 "H[a] ~b*" "$m"
check "a fills the screen"                  geom_is a "0,0 1280x720"
drop_ok() {
    local g; g=$(geom b)
    [[ $g =~ ^(-?[0-9]+),(-?[0-9]+)\ ([0-9]+)x([0-9]+)$ ]] || return 1
    local x=${BASH_REMATCH[1]} y=${BASH_REMATCH[2]} w=${BASH_REMATCH[3]} h=${BASH_REMATCH[4]}
    [[ $g != "640,0 640x720" ]] && (( x <= 760 && 760 < x + w && y <= 360 && 360 < y + h && x >= 0 && x + w <= 1280 ))
}
check "b is under the drop point, not in its old tile" poll drop_ok

# 4. Dragging it onto the other monitor: it joins the workspace shown there; and back again.
m=$(mark)
drag Meta left 760 360 1700 360
check "dragged to the second monitor"       wait_log '^.{9}DRAG end move b' "$m"
check "b joins workspace 2, floating"       poll has_word 2 "~b" "$m"
check "workspace 1 keeps only a"            poll has_word 1 "a" "$m"
only_a() { [[ "$(words_of 1 "$m" | tr -s ' ')" == " H a " ]]; }
check "and nothing else"                    poll only_a
check "b is on the second monitor"          poll output_is b Virtual-1
check "and still has the focus"             poll active_is b
m=$(mark)
drag Meta left 1700 360 700 360
check "a floating window dragged back"      wait_log '^.{9}DRAG end move b' "$m"
check "b joins workspace 1 again"           poll has_word 1 "~b" "$m"
check "b is on the first monitor"           poll output_is b Virtual-0
close_all a b
check "empty again"                         wait_tree 1 "H[]*"

# 5. Focus follows the mouse, and the model follows KWin: hover a, then close b by other means
#    than a key (a key would re-sync focus first and hide a missing windowActivated handler).
point 640 360
client --title a; client --title b; client --title c
check "H[a b c*]"                           wait_tree 1 "H[a b c*]"
point 213 360
check "hovering a focuses it"               poll active_is a
m=$(mark)
kclose b
check "the model followed: a keeps the focus after b closes" wait_tree 1 "H[a* c]" "$m"
check "and KWin agrees"                     poll active_is a
close_all a c

# 6. The pointer follows focus across monitors, and focus doesn't bounce back to what was under it.
point 640 360
client --title a
press "Meta+2"
client --title x
check "x on the second monitor"             wait_tree 2 "H[x*]"
point 1920 360
check "hovering x"                          poll active_is x
press "Meta+Left"
cursor_on_a() { (( $(kjs 'log(Math.round(workspace.cursorPos.x))') < 1280 )); }
check "focus left warps the pointer to a"   poll cursor_on_a
steady_a() { local i; for i in 1 2 3; do active_is a || return 1; sleep 0.15; done; }
check "and a keeps the focus (no bounce)"   steady_a

check "no invariant failures or errors"     clean_log
finish
