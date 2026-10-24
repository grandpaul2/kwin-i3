#!/usr/bin/env bash
# focus: mouse
# needs: plugin
# The i3 frame: kwini3frame, a KDecoration3 plugin (plugin/frame.cpp, docs/spec-decoration.md),
# with kwini3helper's focus-on-the-frame. The test KWin runs Breeze; this scenario selects the frame
# by kwinrc library= and a reconfigure, as a live install does. Real input through inject.py.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/frame.png
clicks=$KI3_TMP/clicks
support() { busctl --user call org.kde.KWin /KWin org.kde.KWin supportInformation 2>/dev/null | grep -qF "Plugin: $1"; }
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "-")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
# pixel_is <x> <y> <r,g,b>: a fresh capture each time (poll calls it until it holds)
pixel_is() { "$shot" capture Virtual-0 "$png" && "$shot" same "$png" "$1" "$2" "$3"; }
saw() { [[ "$(tr "\n" " " 2>/dev/null < "$clicks")" == "$1" ]]; }
sdrag() {   # sdrag <mods> <button> x1 y1 x2 y2, 20 ms apart (as 52-mouse: GTK needs the gaps)
    local -a mods cmds; local k s
    IFS=+ read -ra mods <<<"$1"
    local b=$2 x1=$3 y1=$4 x2=$5 y2=$6
    cmds+=("abs $x1 $y1" "wait 30")
    for k in "${mods[@]}"; do cmds+=("key ${EVDEV[$k]} down" "wait 20"); done
    cmds+=("btn $b down" "wait 20")
    for s in 1 2 3 4; do cmds+=("abs $((x1 + (x2 - x1) * s / 4)) $((y1 + (y2 - y1) * s / 4))" "wait 20"); done
    cmds+=("btn $b up" "wait 20")
    for ((k = ${#mods[@]} - 1; k >= 0; k--)); do cmds+=("key ${EVDEV[${mods[k]}]} up" "wait 20"); done
    "$INJECT" "${cmds[@]}"
}
click() { "$INJECT" "abs $1 $2" "wait 30" "btn left down" "wait 20" "btn left up" "wait 20"; }
no_drag() { sleep 0.3; ! after "$1" | grep -qE '^.{9}DRAG start'; }   # nothing started by then
ACTIVE=76,120,153; INACTIVE=51,51,51

kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library kwini3frame
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
# 0. The switch took (a load failure falls back to Breeze silently; the reconfigure is a timer).
check "the frame is KWin's decoration"      poll support kwini3frame

load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 640 360
client --title a --clicks "$clicks"; client --title b
check "a | b"                               wait_tree 1 "H[a b*]"
check "a is the left half"                  geom_is a "0,0 640x720"

# 1. The frame is 1 px on each side (so frameMin in kwin.js sees 2 px).
frame_of() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry, c = w.clientGeometry; log([c.x - f.x, c.y - f.y, f.width - c.width, f.height - c.height].join(\",\")); } });"; }
check "a's frame is 1 px each side"         [ "$(frame_of a)" == "1,1,2,2" ]

# 2. Pixels: b is active (opened last); corners and a side each; then focus a and they swap.
check "a's corners are inactive grey"       poll pixel_is 0 0 $INACTIVE
check "  (bottom right)"                    pixel_is 639 719 $INACTIVE
check "  (top right, left side)"            pixel_is 639 0 $INACTIVE
check "  (left side)"                       pixel_is 0 360 $INACTIVE
check "b's corners are active blue"         pixel_is 640 0 $ACTIVE
check "  (bottom right)"                    pixel_is 1279 719 $ACTIVE
check "  (bottom left)"                     pixel_is 640 719 $ACTIVE
key "Focus Left"
check "a active: its frame turns blue"      poll pixel_is 0 0 $ACTIVE
check "  (bottom right)"                    pixel_is 639 719 $ACTIVE
check "b's frame turns grey"                pixel_is 1279 719 $INACTIVE

# 2b. A floating window's frame is green while active and i3's grey while not
#     (docs/spec-frame-colours.md); the colours are kwinrc keys in [kwin-i3-frame], changed live
#     with --notify. The frame reads "floating" from the keep-above flag kwin-i3 sets.
FLOAT_ACTIVE=77,114,84
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
corner() { local g; g=$(geom "$1"); [[ $g =~ ^([0-9]+),([0-9]+)\ ([0-9]+)x([0-9]+)$ ]] && echo "$((BASH_REMATCH[1] + BASH_REMATCH[3] - 1)) $((BASH_REMATCH[2] + BASH_REMATCH[4] - 1))"; }
corner_is() { local c; c=$(corner "$1"); [[ -n $c ]] && pixel_is ${c% *} ${c#* } "$2"; }
key "Focus Right"
# The signal alone: keep-above set by hand on a tiled window, which moves nothing, so only the
# keepAboveChanged repaint can show it (a floating toggle also resizes, which repaints anyway).
# This is also the README's trap: a window kept above by hand paints as floating.
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
on b 'w.keepAbove = true;'
check "keep-above by hand, no move: green"  poll pixel_is 1279 719 $FLOAT_ACTIVE
on b 'w.keepAbove = false;'
check "cleared: blue"                       poll pixel_is 1279 719 $ACTIVE
key "Floating Toggle"
check "b floats"                            wait_tree 1 "H[a] ~b*"
check "floating b, active: green"           poll corner_is b $FLOAT_ACTIVE
check "a, tiled and inactive: grey"         pixel_is 0 0 $INACTIVE
activate a
check "b unfocused: grey, as i3"            poll corner_is b $INACTIVE
# The colour keys. The write is plain and the change signal is sent by hand (gdbus, the same
# signal on the same path kwriteconfig6 --notify sends): kwriteconfig6 exits right after sending
# and under load its signal is sometimes lost (1 of 100 on a private bus with 8 busy loops,
# 2026-10-24; the full suite is 23 KWins). The watcher does not check the sender.
notify_frame() { gdbus emit --session --object-path /kwinrc --signal org.kde.kconfig.notify.ConfigChanged "{'kwin-i3-frame': [b'$1']}"; }
frame_set() { kwriteconfig6 --file kwinrc --group kwin-i3-frame --key "$1" "$2"; notify_frame "$1"; }
frame_del() { kwriteconfig6 --file kwinrc --group kwin-i3-frame --key "$1" --delete; notify_frame "$1"; }
frame_set FloatingInactive '#ff0000'
check "FloatingInactive key, live: red"     poll corner_is b 255,0,0
frame_del FloatingInactive
check "key deleted: the default, grey"      poll corner_is b $INACTIVE
frame_set FloatingInactive '#80ff0000'
check "an alpha value: painted opaque"      poll corner_is b 255,0,0
frame_set FloatingInactive notacolour
check "not a colour: the default"           poll corner_is b $INACTIVE
frame_del FloatingInactive
activate b
key "Floating Toggle"
check "b tiles again"                       wait_tree 1 "H[a b*]"
check "tiled b, active: blue again"         poll pixel_is 1279 719 $ACTIVE
key "Focus Left"
check "a active again"                      poll active_is a

# 3. Nothing from the pointer: a is active; drags from a's lines, a right click, a double click.
m=$(mark)
sdrag "" left 639 360 739 360
check "a left drag on a's right line: no drag" no_drag "$m"
check "a unchanged"                         geom_is a "0,0 640x720"
check "b unchanged"                         geom_is b "640,0 640x720"
sdrag "" left 320 0 320 100
check "a drag from a's top line: no move"   no_drag "$m"
check "a still in place"                    geom_is a "0,0 640x720"
sdrag "" right 639 360 639 360
check "a right click on the line: no drag"  no_drag "$m"
check "a still active"                      active_is a
"$INJECT" "abs 639 360" "wait 30" "btn left down" "btn left up" "wait 60" "btn left down" "btn left up" "wait 20"
check "a double click on the line: nothing" geom_is a "0,0 640x720"
check "no window appeared (no menu)"        wait_tree 1 "H[a* b]"

# 4. KWin's own chords work from the line: Meta+right-drag resizes and reads back; Meta+drag
#    moves, floating the window.
m=$(mark)
sdrag Meta right 639 360 700 360
check "Meta+right-drag from the line: resize" wait_log '^.{9}DRAG end resize a' "$m"
resized() { [[ "$(geom a)" != "0,0 640x720" ]]; }
check "a resized"                           poll resized
key "Focus Right"; key "Focus Left"            # a reconcile: the read-back keeps the size
check "the resize is kept"                  resized
m=$(mark)
"$INJECT" "abs 639 360" "wait 30" "btn left down" "wait 20" "btn left up" "wait 20"
check "a click on the line after it: nothing" no_drag "$m"
m=$(mark)
sdrag Meta left 1279 360 1100 300
check "Meta+drag from b's line: move"       wait_log '^.{9}DRAG end move b' "$m"
check "b floats"                            wait_log '^.{9}TREE 1 .*~b' "$m"
kclose b

# 5. Nothing invisible above a window (Aurorae's 8 px strip): a click 4 px above the seam of two
#    stacked windows reaches the upper window's client.
key "Split V"
client --title c
check "a over c"                            wait_tree 1 "V[a c*]"
: > "$clicks"
click 320 356
check "the click above the seam reached a"  poll saw "press 1 release 1 "

# 6. Focus follows i3 on the frame. c active (opened last); the pointer jumps straight onto a's
#    screen-edge line, never entering a's client: a active. Then from a's line straight into c's
#    client: c active (no cancel on leaving the frame). Then a click on the line while the pointer
#    is parked there and the focus was moved away by a key.
point 640 500
check "c is active"                         poll active_is c
point 0 180
check "hover on a's left line focuses a"    poll active_is a
point 640 500
check "straight into c's client: c active"  poll active_is c
point 0 180
check "a active again"                      poll active_is a
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") workspace.activeWindow = w; });'
check "c active by script"                  poll active_is c
click 0 180
check "a click on a's line activates a"     poll active_is a

# 7. Re-decoration without a restart: Breeze and back, windows open.
kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library org.kde.breeze
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
check "Breeze again"                        poll support org.kde.breeze
kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library kwini3frame
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
check "and the frame again"                 poll support kwini3frame
check "a is back at its tile"               geom_is a "0,0 1280x360"
check "c is back at its tile"               geom_is c "0,360 1280x360"

# 8. The config form's keys ([Script-kwin-i3], docs/spec-settings.md), written plainly as the form
#    does: kwini3helper has KWin reconfigure, and the frame reads them on DecorationSettings::
#    reconfigured. No --notify, no reload key here.
form_set() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
form_del() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" --delete; }
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") workspace.activeWindow = w; });' >/dev/null
check "a active"                            poll active_is a
form_set frameWidth 3
frame_is() { [[ "$(frame_of "$1")" == "$2" ]]; }
check "frameWidth 3: a's frame is 3 px each side" poll frame_is a "3,3,6,6"
check "c's too (one shared setting)"        poll frame_is c "3,3,6,6"
check "a keeps its tile"                    geom_is a "0,0 1280x360"
form_set frameActive "#ff0000"
check "frameActive: a's line is red"        poll pixel_is 1 1 255,0,0
form_del frameActive; form_del frameWidth
check "deleted: 1 px again"                 poll frame_is a "1,1,2,2"
check "and the colour from [kwin-i3-frame] or the default" poll pixel_is 0 0 $ACTIVE
check "no invariant failures or errors"     clean_log
finish
