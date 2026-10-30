#!/usr/bin/env bash
# timing: alone
# needs: plugin
# Window modes (docs/records/spec-window-modes.md): tiled windows without a decoration, the 1 px frame drawn by
# kwini3hold in the tile's padding; floating windows keep Breeze. Pixels from tools/shot.py.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
RED=255,0,0; LIME=0,255,0; ACT=76,120,153; INACT=51,51,51; IND=61,174,233   # focused, unfocused, the focused indicator
capture() { "$shot" capture Virtual-0 "$png"; }
px() { "$shot" probe "$png" "$1" "$2"; }
# row <y> <x...>: the colours along a row, for the log
row() { local y=$1 xy=() c i; shift; for i in "$@"; do xy+=("$i" "$y"); done; read -ra c < <("$shot" probe "$png" "${xy[@]}"); for i in "${!c[@]}"; do echo -n "${@:$((i + 1)):1}:${c[i]} "; done; echo; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 8; }
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry, c = w.clientGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height+' client '+c.x+','+c.y+' '+c.width+'x'+c.height); } });"; }
# Alacritty, solid colour (the GTK 4 test client stops short of a tiled height without a border).
# No user config (alacritty falls back to ~/.config/alacritty, whose padding and colours
# differ per machine), and the cursor in the window's colour: its block sits on the corner pixels.
term() { alacritty --config-file /dev/null --title "$1" -o "colors.primary.background=\"$2\"" -o "colors.cursor={cursor=\"$2\",text=\"$2\"}" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
term a "#ff0000"; term b "#00ff00"
check "a | b"                               wait_tree 1 "H[a b*]"
check "a: 1 px from the edges, no title bar" poll eval '[[ "$(fc a)" == "1,1 638x718 client 1,1 638x718" ]]'
check "b: likewise"                         poll eval '[[ "$(fc b)" == "641,1 638x718 client 641,1 638x718" ]]'
kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"a\") log(\"a tile \" + (w.tile ? JSON.stringify(w.tile.absoluteGeometry) : \"none\") + \" noBorder \" + w.noBorder + \" min \" + JSON.stringify(w.minSize) + \" max \" + JSON.stringify(w.maxSize) + \" dec \" + w.hasDecoration); });"
echo "    a: $(fc a)   b: $(fc b)"; kjs "var s = workspace.screens[0], r = workspace.rootTile(s, workspace.currentDesktopForScreen(s)); log(JSON.stringify(r.relativeGeometry) + \" pad \" + r.padding + \" kids \" + r.tiles.map(function (t) { return JSON.stringify(t.relativeGeometry) + \" p\" + t.padding; }).join(\" \"))"; sleep 0.3; capture
echo "    row 360: $(row 360 0 1 2 637 638 639 640 641 642 1278 1279)"
echo "    col 300: top $(px 300 0) $(px 300 1)  bottom $(px 300 718) $(px 300 719)"
check "a's frame, inactive: left edge, top, its right side" eval 'pix 0 360 $INACT && pix 300 0 $INACT && pix 639 360 $INACT && pix 300 719 $INACT'
check "a's app untouched at its edges"      eval 'pix 1 360 $RED && pix 638 360 $RED && pix 300 1 $RED && pix 300 718 $RED'
check "b's frame, active: its left, right edge, top, bottom" eval 'pix 640 360 $ACT && pix 1279 360 $ACT && pix 900 0 $ACT && pix 900 719 $ACT'
check "b's app untouched at its edges"      eval 'pix 641 360 $LIME && pix 1278 360 $LIME'

key "Focus Left"
echo "    a: $(fc a)   b: $(fc b)"; kjs "var s = workspace.screens[0], r = workspace.rootTile(s, workspace.currentDesktopForScreen(s)); log(JSON.stringify(r.relativeGeometry) + \" pad \" + r.padding + \" kids \" + r.tiles.map(function (t) { return JSON.stringify(t.relativeGeometry) + \" p\" + t.padding; }).join(\" \"))"; sleep 0.3; capture
check "focus moved: a active, b inactive"   eval 'pix 0 360 $ACT && pix 639 360 $ACT && pix 640 360 $INACT && pix 1279 360 $INACT'
# A focus change kwin-i3 didn't make (focus follows mouse, a click, Alt+Tab): no pass follows,
# the ring follows all the same (Paul's capture 2026-10-28_060215).
kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"b\") workspace.activeWindow = w; });"
# No pass follows, so no TREE line: KWin's activation, as logged.
check "b activated from outside"            wait_log '^.{9}ACTIVE b \(KWin\)$'
sleep 0.3; capture
check "the ring follows: b active, a inactive" eval 'pix 640 360 $ACT && pix 1279 360 $ACT && pix 0 360 $INACT && pix 639 360 $INACT'
key "Focus Left"
check "a again by key"                      wait_tree 1 "H[a* b]"

kclose b; sleep 0.3
check "b closed: a fills the screen"        poll eval '[[ "$(fc a)" == "1,1 1278x718 client 1,1 1278x718" ]]'
sleep 0.5; capture
echo "    row 360: $(row 360 0 1 639 640 641 1278 1279)"
check "no stale frame where a and b met"    eval 'pix 639 360 $RED && pix 640 360 $RED'
# i3's indicator (§7 L4): a alone in a horizontal workspace, its right side in the focused
# indicator colour, only after a split key (Paul, 2026-10-28), until the focus leaves a.
check "a alone, no split key: no indicator"  pix 1279 360 $ACT
key "Split H"; sleep 0.3; capture
check "Split H: the indicator at a's right"  pix 1279 360 $IND
check "  its other sides in the focused colour" eval 'pix 0 360 $ACT && pix 300 0 $ACT && pix 300 719 $ACT'
sleep 2; capture
check "  still there 2 s later (no timer)"   pix 1279 360 $IND

# The colour classes (§7 L3, redo stage 7): the second monitor's focused window is unfocused
# from the first's point of view (i3's focused_inactive left out, Paul 2026-10-28), as is the rest.
key "Workspace 2"
term s "#0000ff"
check "s alone on the second monitor"       wait_tree 2 "H[s*]"
term t "#ffff00"
check "s | t there"                         wait_tree 2 "H[s t*]"
sleep 0.5; "$shot" capture Virtual-1 "$png"
echo "    second monitor, row 360: $(row 360 0 1 639 640 641 1278 1279)"
check "t focused: its left and right sides" eval 'pix 640 360 $ACT && pix 1279 360 $ACT'
check "s unfocused"                         eval 'pix 0 360 $INACT && pix 639 360 $INACT'
capture
echo "    first monitor, row 360: $(row 360 0 1 1278 1279)"
check "a, the first monitor's focus, unfocused" eval 'pix 0 360 $INACT && pix 300 0 $INACT'
check "  its indicator in that class's colour (the frame's)" pix 1279 360 $INACT
key "Workspace 1"
check "focus back on a"                     wait_tree 1 "H[a*]"
sleep 0.5; "$shot" capture Virtual-1 "$png"
check "t, the second monitor's focus, unfocused now" pix 1279 360 $INACT
capture
check "a focused again"                     pix 0 360 $ACT
check "  no indicator back: the focus left a (Split H's is gone)" pix 1279 360 $ACT
kclose s; kclose t
check "the second monitor empty"            wait_tree 2 "H[]"

term b "#00ff00"
check "b again"                             wait_tree 1 "H[a b*]"
key "Floating Toggle"
check "b floats"                            poll eval '[[ "$(tree 1)" == *"~b"* ]]'
sleep 0.5
echo "    b floating: $(fc b)"
check "floating b has its title bar back"   eval 'f=$(fc b); [[ ${f%% client*} != "${f##*client }" ]]'

# Mid-hold: a slow client keeps the old layout on screen (kwini3hold); its frames stay with it.
kclose b; sleep 0.3
kwriteconfig6 --notify --file kwinrc --group kwin-i3-hold --key TimeoutMs 2000; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
sleep 0.5
# 2 s, not 0.4: the screenshot after the key must land inside the hold, under load too (item 34).
client --title c --color blue --resize-delay 2
check "a | c"                               wait_tree 1 "H[a c*]"
# c on screen in its tile (its own resizes take 2 s each): the frames where the hold will keep them.
settled() { capture && pix 639 360 $INACT && pix 640 360 $ACT && pix 638 360 $RED; }
WAIT=20 poll settled
echo "    before: $(row 360 638 639 640 641)"
key "Grow Width"; capture
echo "    mid-hold: $(row 360 638 639 640 641)"
check "mid-hold: the old layout's frames (a's at 639, c's at 640)" eval 'pix 639 360 $INACT && pix 640 360 $ACT && pix 638 360 $RED'
grown() { capture && pix 639 360 0,0,255 && pix 640 360 0,0,255; }
slow_poll() { WAIT=20 poll "$@"; }        # a prefix assignment inside check would be run as a command
check "after: c grown, its app where the frames were" slow_poll grown
echo "    after: $(row 360 638 639 640 641)"

# Plain GTK 4 (the test client): KWin's bounds from its first configure, with the title bar,
# kept it 28 px short of its tile; the bounds are asked for again once the border is gone.
kclose c; kclose a; sleep 0.3
client --title g --color blue
check "g, plain GTK 4, fills its tile"      poll eval '[[ "$(fc g)" == "1,1 1278x718 client 1,1 1278x718" ]]' || echo "    g: $(fc g)"
echo "    g now: $(fc g)"; grep -E "ADD g|BOUNDS|TRACE" "$KI3_LOG" | tail -8 | cut -c10- | cut -c1-200
check "  (by the bounds, logged)"           wait_log '^.{9}BOUNDS g'
check "no invariant failures or errors"     clean_log
finish
