#!/usr/bin/env bash
# Inside tools/testkwin.sh: open four windows, run the write spike, dump, remove a tile, dump.
set -u
run() { busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$PWD/$1" "$1" >/dev/null
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start; sleep "${2:-1}"
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "$1" >/dev/null; }
for n in a b c d; do LIBGL_ALWAYS_SOFTWARE=1 alacritty --title "$n" -e sleep 100 >/dev/null 2>&1 & sleep 0.7; done
sleep 1.5
run dump.js
run probe-write.js
run dump.js
run remove-c.js
run dump.js
cat "$KI3_LOG"
