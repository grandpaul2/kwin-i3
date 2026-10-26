#!/usr/bin/env bash
# A tiled window that resizes itself goes back in its tile, as i3 refuses a tiled window's own
# resize (docs/spec-self-resize.md; Firefox's session restore, Paul's capture 2026-10-25).
# A well-behaved client can't do what Firefox did (GTK 3 and 4 keep the size KWin last
# configured: tried), so the resize is written from outside
# kwin-i3: to kwin-i3 it is the same, a frame change it didn't ask for.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
resize() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === '$1') w.frameGeometry = { x: w.x, y: w.y, width: $2, height: $3 }; });" >/dev/null; }
refits() { after "${2:-0}" | grep -cE "^.{9}REFIT $1:"; }

client --title a --color red; client --title b --color lime
wait_tree 1 "H[a b*]" >/dev/null
sleep 0.5
ta=$(geom a); tb=$(geom b)

# b changes size within its monitor. (Past the monitor's edge, as Firefox's second window
# went, it changes monitor, which puts it back even without this: not what is tested here.)
m=$(mark); resize b 600 500
check "b resized itself: asked back into its tile"   wait_geom b "$tb"
check "logged once"                                  test "$(refits b "$m")" == 1
check "a untouched"                                  test "$(geom a)" == "$ta"

# a, focused and on top, grows over b, as the first did; the screenshot shows each colour in
# its own half only.
key "Focus Left"; wait_tree 1 "H[a* b]" >/dev/null
sleep 1.1; resize a 1200 700
check "a resized itself: back in its tile"           wait_geom a "$ta"
"$root/tools/shot.py" capture Virtual-0 "$KI3_TMP/shot.png"
check "a's half is red"                              "$root/tools/shot.py" same "$KI3_TMP/shot.png" 300 360 255,0,0
check "b's half is lime"                             "$root/tools/shot.py" same "$KI3_TMP/shot.png" 960 360 0,255,0

# Twice within a second (session restore comes in bursts): asked at once, then again when the
# second is up, so a client that flips back each time is asked about once a second, never dropped.
key "Focus Right"; wait_tree 1 "H[a b*]" >/dev/null
sleep 1.1; m=$(mark); resize b 500 600; sleep 0.1; resize b 450 550
sleep 0.4
check "twice within a second: asked once so far"     test "$(refits b "$m")" == 1
check "the second resize waits out the second"       wait_geom b "$tb"
check "then asked again"                             test "$(refits b "$m")" == 2

# A floating window keeps the size it picks.
key "Floating Toggle"
wait_tree 1 "H[a] ~b*" >/dev/null
sleep 0.5; m=$(mark); resize b 500 400
sleep 0.5
check "floating: keeps its own size"                 eval '[[ "$(geom b)" == *" 500x400" ]]'
check "and no REFIT"                                 test "$(refits b "$m")" == 0
finish
