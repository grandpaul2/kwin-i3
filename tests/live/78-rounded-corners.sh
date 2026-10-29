#!/usr/bin/env bash
# timing: alone
# needs: plugin
# Rounded corners on tiled windows (docs/spec-rounded-corners.md): kwini3hold gives each tiled
# window KWin's 5 px radius and draws the frame along it; floating windows keep Breeze's; square
# when fullscreen and with roundedCorners off. Pixels from tools/shot.py.
# At scale 1, a window at 1,1 with r=5 and a 1 px frame: the arc's centre is 6,6, its inner edge
# radius 5, its outer 6. So the window's own corner pixel 1,1 (6.4 from the centre) is outside the
# frame too, background; 3,1 is on the arc; 7,0 the frame's straight top; 5,5 the app.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
RED=255,0,0; LIME=0,255,0; ACT=76,120,153; INACT=51,51,51; FACT=77,114,84
capture() { sleep 0.3; "$shot" capture Virtual-0 "$png"; }
px() { "$shot" probe "$png" "$1" "$2"; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 8; }
# row <y> <x...>: the colours along a row, for the log, in one probe
row() { local y=$1 xy=() c i; shift; for i in "$@"; do xy+=("$i" "$y"); done; read -ra c < <("$shot" probe "$png" "${xy[@]}"); for i in "${!c[@]}"; do echo -n "${@:$((i + 1)):1}:${c[i]} "; done; }
# near <x> <y> <frame> <app>: an antialiased arc pixel, nearer the frame's colour than the app's
# or the background's (black)
near() {
    python3 -c 'import sys
p, f, a = (tuple(map(int, v.split(","))) for v in sys.argv[1:4])
d = lambda c: sum((x - y) ** 2 for x, y in zip(p, c))
sys.exit(0 if d(f) < min(d(a), d((0, 0, 0))) else 1)' "$(px "$1" "$2")" "$3" "$4"
}
notpix() { ! pix "$@" >/dev/null 2>&1; }
# corner <x> <y>: the 8x8 pixels from x,y, one row each, for the log
# (one probe for all 64: tools/shot.py)
corner() {
    local j i xy=() c
    for ((j = 0; j < 8; j++)); do for ((i = 0; i < 8; i++)); do xy+=($(($1 + i)) $(($2 + j))); done; done
    read -ra c < <("$shot" probe "$png" "${xy[@]}")
    for ((j = 0; j < 8; j++)); do echo "      ${c[*]:$((j * 8)):8} "; done
}
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height); } });"; }
# No user config (alacritty falls back to ~/.config/alacritty, whose padding and colours
# differ per machine), and the cursor in the window's colour: its block sits on the corner pixels.
term() { alacritty --config-file /dev/null --title "$1" -o "colors.primary.background=\"$2\"" -o "colors.cursor={cursor=\"$2\",text=\"$2\"}" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
set_key() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5; }
# rounded <x> <y> <frame> <app> [dx dy]: the window's corner pixel x,y (dx,dy point into the
# window: 1 1 for a top left, -1 -1 for a bottom right) is rounded off, the frame along the arc.
rounded() {
    local x=$1 y=$2 f=$3 a=$4 dx=${5:-1} dy=${6:-1}
    notpix "$x" "$y" "$a" && notpix "$x" "$y" "$f" && near $((x + 2 * dx)) "$y" "$f" "$a" \
        && pix $((x + 6 * dx)) $((y - dy)) "$f" && pix $((x + 4 * dx)) $((y + 4 * dy)) "$a"
}
# square <x> <y> <app> <frame>: the window's own pixel in its top-left corner, the frame's beyond
square() { pix "$1" "$2" "$3" && { [[ -z ${4:-} ]] || pix $(($1 - 1)) $(($2 - 1)) "$4"; }; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "frame on"                            wait_log '^.{9}FRAME on'
term a "#ff0000"; term b "#00ff00"
check "a | b"                               wait_tree 1 "H[a b*]"
check "a at 1,1"                            poll eval '[[ "$(fc a)" == "1,1 638x718" ]]'
capture
echo "    a's top left:"; corner 0 0
echo "    b's top left:"; corner 640 0
check "a rounded, the frame (inactive) along it" rounded 1 1 $INACT $RED
check "  its other corners"                 eval 'rounded 638 1 $INACT $RED -1 1 && rounded 1 718 $INACT $RED 1 -1 && rounded 638 718 $INACT $RED -1 -1'
check "  its sides square"                  eval 'pix 300 0 $INACT && pix 0 360 $INACT && pix 300 1 $RED && pix 1 360 $RED'
check "b rounded, the frame (active) along it" rounded 641 1 $ACT $LIME
check "  its far corner, at the screen's"   rounded 1278 718 $ACT $LIME -1 -1

key "Focus Left"; capture
check "focus moved: the arcs recoloured"    eval 'rounded 1 1 $ACT $RED && rounded 638 718 $ACT $RED -1 -1 && rounded 641 1 $INACT $LIME && rounded 1278 718 $INACT $LIME -1 -1'

# Floated: Breeze's corners (the probe, 2026-10-25: its bottom corner pixel is not the app's).
key "Focus Right"; key "Floating Toggle"
check "b floats"                            poll eval '[[ "$(tree 1)" == *"~b"* ]]'
sleep 0.5; read -r bxy bwh <<<"$(fc b)"; bx=${bxy%,*}; by=${bxy#*,}; bw=${bwh%x*}; bh=${bwh#*x}
echo "    b floating: $bx,$by ${bw}x$bh"
capture; echo "    b's bottom left:"; corner "$bx" $((by + bh - 8))
breeze() { notpix "$bx" $((by + bh - 1)) $LIME && pix $((bx + 6)) $((by + bh - 7)) $LIME; }
check "floating b: Breeze's rounded corners" breeze
check "a alone, rounded"                    eval 'rounded 1 1 $INACT $RED && rounded 1278 718 $INACT $RED -1 -1'
key "Floating Toggle"
check "b tiled again"                       wait_tree 1 "H[a b*]"
capture
check "  and rounded again"                 rounded 641 1 $ACT $LIME

# The setting, off and on, with a Breeze window floating beside: only kwin-i3's own reset.
key "Floating Toggle"; poll eval '[[ "$(tree 1)" == *"~b"* ]]'; sleep 0.5
set_key roundedCorners false; capture
echo "    off, a's top left:"; corner 0 0
check "off: a square, the frame square"     eval 'square 1 1 $RED $INACT && pix 638 1 $RED && pix 639 0 $INACT'
check "off: floating b keeps Breeze's corners" breeze
set_key roundedCorners true; capture
check "on again: a rounded"                 rounded 1 1 $INACT $RED
check "  floating b unchanged"              breeze

# frameOnFloating: a floating window kwin-i3 took the decoration of stays square, its frame too.
set_key frameOnFloating true
check "b borderless, floating"              poll eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"b\") log(w.noBorder); })")" == true ]]'
sleep 0.5; read -r bxy bwh <<<"$(fc b)"; bx=${bxy%,*}; by=${bxy#*,}
capture; echo "    b framed floating at $bx,$by:"; corner $((bx - 1)) $((by - 1))
check "frameOnFloating: b square, its frame square (focused: the tiled colour, L11)" square "$bx" "$by" $LIME $ACT
set_key frameOnFloating false
key "Floating Toggle"; wait_tree 1 "H[a b*]"

# Fullscreen with no other tiled window: the effect goes inactive, the reset is the signal's.
kclose b; sleep 0.3
check "a fills the screen"                  poll eval '[[ "$(fc a)" == "1,1 1278x718" ]]'
key "Fullscreen"
check "a fullscreen"                        poll eval '[[ "$(fc a)" == "0,0 1280x720" ]]'
capture; echo "    fullscreen a's top left:"; corner 0 0
check "fullscreen: square, no frame"        eval 'pix 0 0 $RED && pix 1279 719 $RED'
key "Fullscreen"
check "a back in its tile"                  poll eval '[[ "$(fc a)" == "1,1 1278x718" ]]'
capture
check "  rounded again"                     rounded 1 1 $ACT $RED

# A wider frame: the outer arc (radius r + 3), and two neighbours' frames meeting.
set_key frameWidth 3
term b "#00ff00"
check "a | b, 3 px frames"                  poll eval '[[ "$(fc a)" == "3,3 634x714" ]]' || echo "    a: $(fc a)  b: $(fc b)"
capture; echo "    a's top left, 3 px:"; corner 0 0
echo "    row 360: $(row 360 635 636 637 638 639 640 641 642 643 644)"
# 3 px: the arc's centre 8,8, inner radius 5, outer 8: 3,3 (6.4 out) is in the frame, 1,1 (9.2) not.
check "3 px: the arc, 3 px wide"            eval 'pix 3 3 $INACT && notpix 1 1 $INACT && notpix 0 0 $INACT && pix 9 1 $INACT && pix 7 7 $RED'
check "3 px: the neighbours meet at 640"    eval 'pix 636 360 $RED && pix 637 360 $INACT && pix 639 360 $INACT && pix 640 360 $ACT && pix 642 360 $ACT && pix 643 360 $LIME'
set_key frameWidth 1
check "1 px again"                          poll eval '[[ "$(fc a)" == "1,1 638x718" ]]'

# The GTK 4 test client (a client with its own decoration handling): rounded likewise.
kclose b
client --title g --color blue
check "a | g"                               wait_tree 1 "H[a g*]"
sleep 0.5; read -r gxy _ <<<"$(fc g)"; gx=${gxy%,*}; gy=${gxy#*,}
capture; echo "    g at $gxy:"; corner $((gx - 1)) $((gy - 1))
check "g rounded, the frame along it"       rounded "$gx" "$gy" $ACT 0,0,255

# Mid-hold (a slow client, as in 57): the held layout keeps its corners.
kwriteconfig6 --notify --file kwinrc --group kwin-i3-hold --key TimeoutMs 400; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
kclose g; sleep 0.3
client --title c --color blue --resize-delay 0.4
check "a | c"                               wait_tree 1 "H[a c*]"
sleep 1; key "Grow Width"; "$shot" capture Virtual-0 "$png"
echo "    mid-hold, a's top left:"; corner 0 0
check "mid-hold: a's corner still rounded"  rounded 1 1 $INACT $RED
sleep 1

# The effect unloaded: kwin-i3 gives the tiled windows their decoration back (and with it the
# theme's radius, from setDecoration), so the reset at unload can't be seen on screen; it is
# there for a window left undecorated. Unloaded and loaded without trouble, then rounded again.
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s kwini3hold >/dev/null
check "frame off"                           wait_log '^.{9}FRAME off'
check "a decorated again"                   poll eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"a\") log(w.noBorder); })")" == false ]]'
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s kwini3hold >/dev/null
check "frame on again"                      wait_log '^.{9}FRAME on' "$(($(mark) - 1))"
sleep 1; capture
check "  rounded again"                     rounded 1 1 $INACT $RED

# Gaps 5 and 3 with the frame: 5 counts as 4, the padding 4 + 2 is even, so a sits on whole
# pixels at 3 + 2 + 3 (an odd one put every window half a pixel off; Paul, 2026-10-25), and
# stays rounded there.
rawg() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var g = w.frameGeometry; log(g.x + \",\" + g.y + \" \" + g.width + \"x\" + g.height); } });"; }
set_key gapsInner 5; set_key gapsOuter 3
check "gaps 5, 3: a at 8,8 on whole pixels" poll eval '[[ "$(rawg a)" == "8,8 "* && "$(rawg a)" != *.* ]]' || echo "    a: $(rawg a)"
# Its bottom-left corner: Alacritty draws its unfocused (hollow) cursor in the top-left one.
read -r _ awh <<<"$(rawg a)"; ab=$((8 + ${awh#*x} - 1))
sleep 0.5; capture; echo "    a's bottom left, at 8,$ab:"; corner 7 $((ab - 6))
check "  rounded there"                    rounded 8 "$ab" $INACT $RED 1 -1
set_key gapsInner 0; set_key gapsOuter 0
check "no gaps again"                       poll eval '[[ "$(fc a)" == 1,1\ * ]]'

# 125 %: the radius 6 device px (5 x 1.25, as KWin rounds it), the frame 1, still along the arc;
# a's corner at device 1,1 (logical 1 x 1.25, rounded), so the same pixel offsets hold.
timeout 10 kscreen-doctor output.Virtual-0.scale.1.25 >/dev/null 2>&1
check "Virtual-0 at 125 %"                  poll eval '[[ "$(kjs "log(workspace.screens[0].geometry.width)")" == 1024 ]]'
check "a at 1,1"                            poll eval '[[ "$(fc a)" == 1,1\ * ]]' || echo "    a: $(fc a)"
sleep 1; capture; echo "    125 %, a's top left:"; corner 0 0
check "125 %: a rounded, the frame along it" rounded 1 1 $INACT $RED
check "no invariant failures or errors"     clean_log
finish
