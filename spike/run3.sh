#!/usr/bin/env bash
set -u
run() { busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$PWD/$1" "$1" >/dev/null
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start; sleep "${2:-1}"
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "$1" >/dev/null; }
LIBGL_ALWAYS_SOFTWARE=1 alacritty --title a -e sleep 100 >/dev/null 2>&1 & sleep 1
echo "DISPLAY=$DISPLAY" >> "$KI3_LOG"
xmessage -title xmsg "x11 test window" >/dev/null 2>&1 & sleep 1.5
run round3.js; run dump.js
run round3b.js; run round3c.js; run dump.js
grep -E 'windows:|DISPLAY|set tiles|fullscreen|maximized|^.{9}win ' "$KI3_LOG"
