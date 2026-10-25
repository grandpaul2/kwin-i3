#!/usr/bin/env bash
# focus: mouse
# needs: plugin
# The i3 frame (docs/spec-window-modes.md): tiled windows have no decoration and kwini3hold draws
# the frame in the tiles' padding, outside the window; kwini3helper makes it part of its window for
# focus and clicks (review R1-12). Floating windows keep Breeze. Real input through inject.py.
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
stats() { busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin)["data"][0]; print("\n".join("%s=%s"%(k,v["data"]) for k,v in sorted(d.items())))'; }
stat() { stats | grep "^$1=" | cut -d= -f2; }
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "the effect is there: frame on"       wait_log '^.{9}FRAME on'
point 640 360
client --title a --clicks "$clicks"; client --title b
check "a | b"                               wait_tree 1 "H[a b*]"
check "a: 1 px from the edges, borderless"  geom_is a "1,1 638x718"
check "b likewise"                          geom_is b "641,1 638x718"
check "a has no title bar"                  prop_is a noBorder true

# 1. Pixels: b is active (opened last). The frame is outside the windows: a's at x=0 and 639,
#    b's at 640 and 1279, top and bottom rows.
check "a's frame: left, top, right, bottom, grey" eval 'poll pixel_is 0 360 $INACTIVE && pixel_is 300 0 $INACTIVE && pixel_is 639 360 $INACTIVE && pixel_is 300 719 $INACTIVE'
check "b's frame, active: blue all round"   eval 'pixel_is 640 360 $ACTIVE && pixel_is 1279 360 $ACTIVE && pixel_is 900 0 $ACTIVE && pixel_is 900 719 $ACTIVE'
check "  corners (outer)"                   eval 'pixel_is 0 0 $INACTIVE && pixel_is 1279 719 $ACTIVE'
key "Focus Left"
check "a active: its frame turns blue"      poll pixel_is 639 360 $ACTIVE
check "b's turns grey"                      pixel_is 640 360 $INACTIVE

# 2. Idle: nothing changes, nothing is painted (review R1-2).
sleep 0.5; f0=$(stat frames); sleep 1; f1=$(stat frames)
check "idle: no frames painted ($f0 -> $f1)" [ "$f0" == "$f1" ]

# 3. A floating window is a Plasma window: its title bar back, no frame of ours.
key "Focus Right"
key "Floating Toggle"
check "b floats"                            wait_tree 1 "H[a] ~b*"
check "floating b has its title bar again"  poll prop_is b noBorder false
key "Floating Toggle"
check "b tiles again"                       wait_tree 1 "H[a b*]"
check "and loses it again"                  poll prop_is b noBorder true

# 4. The frame is part of its window for the pointer (focus follows mouse here). b active; the
#    pointer jumps onto a's left frame (x=0), never entering a: a active. A click on a's frame
#    activates a and reaches nobody; so do a right click and a drag (the desktop would take them
#    otherwise).
point 900 360
check "b active"                            poll active_is b
point 0 180
check "hover on a's frame focuses a"        poll active_is a
point 900 360
check "into b: b active"                    poll active_is b
# The click without a move: the pointer parked on a's frame (hover focuses a), b activated by a
# script, then a click where the pointer already is, so only the click can activate a.
point 639 360
check "hover on a's right frame: a"         poll active_is a
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "b") workspace.activeWindow = w; });' >/dev/null
check "b active by script"                  poll active_is b
: > "$clicks"
click 639 360
check "a click on a's right frame activates a" poll active_is a
check "  and a's client saw nothing"        saw ""
m=$(mark)
sdrag "" right 639 360 639 360
sdrag "" left 639 360 739 360
check "right click, drag on the frame: nothing" no_drag "$m"
check "  a unchanged"                       geom_is a "1,1 638x718"
check "  a's client saw none of it"         saw ""
# (A scroll on the frame is taken too, framefocus.cpp; tools/ei-send can't scroll yet: untested.)

# 5. The settings: frameWidth leaves room for a wider frame, colours change live.
form_set() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }
form_del() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" --delete; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }
form_set frameWidth 3
check "frameWidth 3: 3 px of room"          geom_is a "3,3 634x714"
check "  and 6 between: b"                  geom_is b "643,3 634x714"
check "  the frame fills it"                eval 'poll pixel_is 0 360 $ACTIVE && pixel_is 2 360 $ACTIVE && pixel_is 637 360 $ACTIVE && pixel_is 640 360 $INACTIVE && pixel_is 642 360 $INACTIVE'
form_set frameActive "#ff0000"
check "frameActive: red"                    poll pixel_is 0 360 255,0,0
form_del frameActive; form_del frameWidth
check "deleted: 1 px again"                 geom_is a "1,1 638x718"
form_set holdEnabled false
check "holdEnabled off: the frame stays"    poll pixel_is 0 360 $ACTIVE
form_del holdEnabled

# 6. The effect goes: tiled windows get their title bars back, no padding; it comes back: frames.
eid=$(busctl --user get-property org.kde.KWin /Effects org.kde.kwin.Effects loadedEffects | grep -o '"kwini3hold[^"]*"' | tr -d '"')
m=$(mark)
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s "$eid" >/dev/null
check "effect unloaded: frame off"          wait_log '^.{9}FRAME off' "$m"
check "  a has its title bar back"          poll prop_is a noBorder false
check "  and the whole half again"          geom_is a "0,0 640x720"
m=$(mark)
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s "$eid" >/dev/null
check "loaded again: frame on"              wait_log '^.{9}FRAME on' "$m"
check "  a borderless in its padded tile"   geom_is a "1,1 638x718"
check "no invariant failures or errors"     clean_log
finish
