#!/usr/bin/env bash
# timing: alone
# needs: plugin
# PROTOTYPE (OPEN.md item 10): tiled windows without a decoration, the 1 px frame drawn by
# kwini3hold in the tile's padding; floating windows keep Breeze. Pixels from tools/shot.py.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
RED=255,0,0; LIME=0,255,0; ACT=76,120,153; INACT=51,51,51
capture() { "$shot" capture Virtual-0 "$png"; }
px() { "$shot" probe "$png" "$1" "$2"; }
# row <y> <x...>: the colours along a row, for the log
row() { local y=$1 out="" x; shift; for x in "$@"; do out+="$x:$(px "$x" "$y") "; done; echo "$out"; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 8; }
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry, c = w.clientGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height+' client '+c.x+','+c.y+' '+c.width+'x'+c.height); } });"; }
# Alacritty, solid colour (the GTK 4 test client stops short of a tiled height without a border).
term() { alacritty --title "$1" -o "colors.primary.background=\"$2\"" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
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

kclose b; sleep 0.3
check "b closed: a fills the screen"        poll eval '[[ "$(fc a)" == "1,1 1278x718 client 1,1 1278x718" ]]'
sleep 0.5; capture
echo "    row 360: $(row 360 0 1 639 640 641 1278 1279)"
check "no stale frame where a and b met"    eval 'pix 639 360 $RED && pix 640 360 $RED'
check "a's frame at the right edge now"     pix 1279 360 $ACT

term b "#00ff00"
check "b again"                             wait_tree 1 "H[a b*]"
key "Floating Toggle"
check "b floats"                            poll eval '[[ "$(tree 1)" == *"~b"* ]]'
sleep 0.5
echo "    b floating: $(fc b)"
check "floating b has its title bar back"   eval 'f=$(fc b); [[ ${f%% client*} != "${f##*client }" ]]'

# Mid-hold: a slow client keeps the old layout on screen (kwini3hold); its frames stay with it.
kclose b; sleep 0.3
kwriteconfig6 --notify --file kwinrc --group kwin-i3-hold --key TimeoutMs 400; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
sleep 0.5
client --title c --color blue --resize-delay 0.4
check "a | c"                               wait_tree 1 "H[a c*]"
sleep 1; capture
echo "    before: $(row 360 638 639 640 641)"
key "Move Left"; capture
echo "    mid-hold: $(row 360 638 639 640 641)"
check "mid-hold: the old layout's frames (a's at 639, c's at 640)" eval 'pix 639 360 $INACT && pix 640 360 $ACT && pix 638 360 $RED'
sleep 1; capture
echo "    after: $(row 360 638 639 640 641)"
check "after: the new layout's (c's at 639, a's at 640)" eval 'pix 639 360 $ACT && pix 640 360 $INACT && pix 641 360 $RED'
check "no invariant failures or errors"     clean_log
finish
