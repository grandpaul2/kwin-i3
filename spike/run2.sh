#!/usr/bin/env bash
set -u
run() { busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$PWD/$1" "$1" >/dev/null
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start; sleep "${2:-1}"
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "$1" >/dev/null; }
for n in a b c d; do LIBGL_ALWAYS_SOFTWARE=1 alacritty --title "$n" -e sleep 100 >/dev/null 2>&1 & sleep 0.7; done
sleep 1.5
run round2.js
run dump.js
run close-b.js 2
run dump.js
grep -vE 'Desktop [23]$|^.{9}       leaf \[(0|320|960|1280|1600|2240),0 (320|640)x720\] windows=$|layout dir=1 \[1280' "$KI3_LOG"
