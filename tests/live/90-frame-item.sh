#!/usr/bin/env bash
# timing: alone
# needs: plugin
# Probe (OPEN.md item 89): the frame as a child item of the window's scene item
# (OutlinedBorderItem, 4 px magenta), under Glide. Run with KWIN_EFFECTS_FORCE_ANIMATIONS=1.
# Questions: does the item draw at all; does it widen expandedGeometry; does Glide tilt it with
# the window (screenshots mid-animation, read by eye); does the hold's snapshot carry it.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
out=${KI3_PROBE_OUT:-/tmp}
term() { alacritty --config-file /dev/null --title "$1" -o "colors.primary.background=\"$2\"" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & }
eff() { busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects "$1" s "$2"; }
# Slow every animation 20x, so a screenshot lands mid-Glide.
kwriteconfig6 --file kwinrc --group Effect-glide --key Duration 4000
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
eff unloadEffect scale; eff loadEffect glide
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects isEffectLoaded s glide
load_kwin_i3
wait_log 'kwin-i3 loaded$'
term a "#ff0000"
sleep 3; kjs "workspace.windowList().forEach(function (w) { log(w.caption + ' ' + w.resourceClass); })"; cp "$KI3_TMP/kwin.out" "$out/kwin-early.out"
check "a alone"                             wait_tree 1 "H[a*]"
sleep 6
"$shot" capture Virtual-0 "$out/90-a-still.png"
echo "    still: x 0,4,10,14 at y 360: $("$shot" probe "$out/90-a-still.png" 0 360 4 360 10 360 14 360)"
term b "#00ff00"
for i in 01 02 03 04 05 06 07 08 09 10 11 12; do "$shot" capture Virtual-0 "$out/90-b-open-$i.png"; done
check "a | b"                               wait_tree 1 "H[a b*]"
sleep 6
"$shot" capture Virtual-0 "$out/90-ab-still.png"
kclose b
for i in 1 2 3 4; do sleep 0.4; "$shot" capture Virtual-0 "$out/90-b-close-$i.png"; done
cp "$KI3_TMP/kwin.out" "$out/kwin.out"; cp "$KI3_TMP/probe.txt" "$out/" 2>/dev/null
finish
