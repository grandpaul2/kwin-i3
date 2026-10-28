#!/usr/bin/env bash
# timing: alone
# needs: plugin
# The frame's harder cases (docs/spec-window-modes.md, review 1): the hair at the screen edges of
# a nested layout after the root changes (R1-7), a floating window over a frame while the frame
# repaints (R1-1), a client that draws its own title bar (R1-5), release and reload (R4), and a
# monitor at 125 % (R1-6). Pixels from tools/shot.py: the test KWin's background is black.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
ACT=76,120,153; INACT=51,51,51; RED=255,0,0; LIME=0,255,0; BLUE=0,0,255; YELLOW=255,255,0
capture() { "$shot" capture Virtual-0 "$png"; }
px() { "$shot" probe "$png" "$1" "$2"; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 2; }
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
form_set() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }
form_del() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" --delete; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }

# Square corners: these pixel checks are of the square frame (78 has the rounded one).
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key roundedCorners false
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "frame on"                            wait_log '^.{9}FRAME on'

# 1. H[V[a b] c]: a and b both on the left edge, in a nested column. The root changes (an outer
#    gap and back) and every edge is still 1 px of frame, then the app.
client --title a --color red; client --title c --color blue
check "a | c"                               wait_tree 1 "H[a c*]"
key "Focus Left"; key "Split V"
client --title b --color lime
check "H[V[a b] c]"                         wait_tree 1 "H[V[a b*] c]"
form_set gapsOuter 10
check "an outer gap: a inset"               poll eval '[[ "$(geom a)" == 11,11* ]]'
form_set gapsOuter 0       # the test KWin's pinned value (testkwin.sh); deleting it would give the default 3
check "and back: a 1 px from the edge"      poll eval '[[ "$(geom a)" == 1,1* ]]'
check "b likewise, at the left edge"        poll eval '[[ "$(geom b)" == 1,* ]]'
sleep 0.3; capture
echo "    left edge: a $(px 0 180) $(px 1 180)  b $(px 0 540) $(px 1 540)  bottom b $(px 300 719) $(px 300 718)"
check "a: frame at x=0, app at x=1"         eval 'pix 0 180 $INACT && pix 1 180 $RED'
check "b: frame at x=0, app at x=1"         eval 'pix 0 540 $ACT && pix 1 540 $LIME'
check "b: frame at the bottom row"          eval 'pix 300 719 $ACT && pix 300 718 $LIME'
check "c: frame at the right edge"          eval 'pix 1279 360 $INACT && pix 1278 360 $BLUE'

# i3's hide_edge_borders (§7 L6, redo stage 7) with no gaps: `both` leaves out the ring's sides
# at the output's edges (the strip stays empty: the background) and keeps the seam between V[a b]
# and c; `smart` with three windows hides nothing; `none` again.
BG=0,0,0
form_set hideEdgeBorders both
check "both: a's left side gone, the strip empty" poll eval 'capture && pix 0 180 $BG && pix 1 180 $RED'
check "  b's bottom and c's right gone too" eval 'pix 300 719 $BG && pix 1279 360 $BG'
check "  the seam between V[a b] and c stays" eval 'pix 639 180 $INACT && pix 640 360 $INACT'
form_set hideEdgeBorders smart
check "smart, three windows: every side drawn" poll eval 'capture && pix 0 180 $INACT && pix 1279 360 $INACT && pix 300 719 $ACT'
form_del hideEdgeBorders
check "none: as before"                     poll eval 'capture && pix 0 180 $INACT && pix 1 180 $RED'

# i3's resize from a border (§9 Z3, redo stage 6): a left drag on c's left ring resizes c against
# V[a b] on that side; the shares change at the release. (A ring scroll focusing, F4, isn't driven
# here: tools/ei-send sends no scroll; a verb for it is a tool proposal.)
wid() { local g; g=$(geom "$1"); g=${g#* }; echo "${g%x*}"; }
cx=$(geom c); cx=${cx%%,*}; cw=$(wid c)
"$INJECT" "abs $((cx - 1)) 360" "wait 40" "btn left down" "wait 40" "abs $((cx + 100)) 360" "wait 40" "abs $((cx + 200)) 360" "wait 40" "btn left up"
check "a drag on c's left ring narrows c by about 200" poll eval 'w=$(wid c); (( w <= cw - 170 && w >= cw - 230 ))' || echo "    c was $cw wide, is $(wid c)"
check "  a and b widened"                   poll eval '[[ "$(geom a)" == 1,1* ]] && (( $(wid a) > 640 ))'
"$INJECT" "abs $(( $(geom c | cut -d, -f1) - 1 )) 360" "wait 40" "btn left down" "wait 40" "abs $((cx + 100)) 360" "wait 40" "abs $((cx)) 360" "wait 40" "btn left up"
check "and back"                            poll eval 'w=$(wid c); (( w >= cw - 30 && w <= cw + 30 ))' || echo "    c is $(wid c)"

# 2. A floating window over a frame: the frame repaints (b loses focus, a gains it) and must not
#    paint over it. f is fixed-size, so it floats.
client --title f --color yellow --fixed --size 300x200
check "f floats"                            poll eval '[[ "$(tree 1)" == *"~f"* ]]'
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "f") w.frameGeometry = { x: 540, y: 260, width: 300, height: 228 }; });' >/dev/null
sleep 0.3
fx=$((540 + 150)); fy=$((260 + 120))
seam=$(geom c); seam=${seam%%,*}; seam=$((seam - 1))   # c's left frame column, under f
key "Focus Left"; key "Focus Right"; sleep 0.3; capture
echo "    under f at the seam: $(px "$seam" "$fy")  f elsewhere: $(px "$fx" "$fy")"
check "the frame column under f is f's"     pix "$seam" "$fy" $YELLOW
kclose f

# 3. A client that draws its own title bar (a GTK header bar, as GNOME apps): no server
#    decoration to take, framed when tiled, and floating it keeps its own look, no frame.
client --title z --csd --color red
check "z (CSD) tiles"                       poll eval '[[ "$(tree 1)" == *z* && "$(tree 1)" != *"~z"* ]]'
sleep 0.5; capture
zg=$(geom z); zx=${zg%%,*}; zr=${zg#*,}; zy=${zr%% *}; zs=${zg#* }; zh=${zs#*x}
echo "    z at $zg: left of it $(px $((zx - 1)) $((zy + zh / 2)))"
check "z has the frame on its left"         pix $((zx - 1)) $((zy + zh / 2)) $ACT
key "Floating Toggle"
check "z floats"                            poll eval '[[ "$(tree 1)" == *"~z"* ]]'
sleep 0.5; capture
zg=$(geom z); zx=${zg%%,*}; zr=${zg#*,}; zy=${zr%% *}; zs=${zg#* }; zh=${zs#*x}
echo "    floating z at $zg: left of it $(px $((zx - 1)) $((zy + zh / 2)))"
check "floating z: no frame of ours"        eval '! pix $((zx - 1)) $((zy + zh / 2)) $ACT && ! pix $((zx - 1)) $((zy + zh / 2)) $INACT'
kclose z

# 4. Release gives every border back; a reload keeps tiled windows borderless.
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "  frame on again"                    wait_log '^.{9}FRAME on' "$m"
check "  a still borderless"                poll prop_is a noBorder true
check "  a still 1 px from the edge"        poll eval '[[ "$(geom a)" == 1,1* ]]'
key "Release"
check "release: a's border back"            poll prop_is a noBorder false
check "  b's and c's too"                   eval 'prop_is b noBorder false && prop_is c noBorder false'
m=$(mark); busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null; load_kwin_i3
check "loaded once more"                    wait_log 'kwin-i3 loaded$' "$m"
check "  borderless again"                  poll prop_is a noBorder true

# 5. 125 %: the gaps between windows and at the edges are frame, never background (black),
#    anywhere on the screen: tiled windows and their frames cover all of it. A gap rounds to 2 or
#    3 device pixels by where its edge falls, so more windows, more edges (R1-6).
timeout 10 kscreen-doctor output.Virtual-0.scale.1.25 >/dev/null 2>&1
check "Virtual-0 at 125 % (1024x576 logical)" poll eval '[[ "$(kjs "log(workspace.screens[0].geometry.width)")" == 1024 ]]'
key "Focus Right"
client --title d --color red; client --title e --color lime
check "five windows"                        poll eval '[[ "$(tree 1)" == *d* && "$(tree 1)" == *e* ]]'
sleep 1; capture
blacks() { python3 -c "
from PIL import Image; im = Image.open('$png').convert('RGB'); w, h = im.size
bad = [(x, y) for y in range(h) for x in range(w) if im.getpixel((x, y)) == (0, 0, 0)]
print(len(bad), bad[:5])"; }
b=$(blacks); echo "    black pixels on the screen: $b ($(tree 1))"
check "no background anywhere"              [ "${b%% *}" == 0 ]
check "no invariant failures or errors"     clean_log
finish
