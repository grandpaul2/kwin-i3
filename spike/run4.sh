#!/usr/bin/env bash
set -u
run() { busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$PWD/$1" "$1" >/dev/null
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start; sleep "${2:-1}"
        busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s "$1" >/dev/null; }
for n in a b c d; do LIBGL_ALWAYS_SOFTWARE=1 alacritty --title "$n" -e sleep 100 >/dev/null 2>&1 & sleep 0.7; done
sleep 1.5
run round4.js; run round4b.js; run round4c.js; run round4d.js
cat "$KI3_LOG"
echo "--- kwin output mentioning tile/deprecated:"
grep -iE 'deprecat|tile' "$KI3_TMP/kwin.out" | head -5
