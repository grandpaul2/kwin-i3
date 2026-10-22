#!/usr/bin/env bash
set -u
source ../tests/live/lib.sh
for n in a b; do client --title "$n"; sleep 0.8; done
sleep 1.5
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$PWD/round5.js" r5 >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start; sleep 1
echo "--- kglobalaccel components:"; busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel allComponents 2>&1 | head -3
busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 Probe" 2>&1; sleep 0.5
kjs "$(cat round5b.js)" >/dev/null; sleep 0.5
kjs "$(cat round5c.js)" >/dev/null; sleep 0.5
grep -vE 'KJS|^.{9}kjs: $' "$KI3_LOG" | cut -c10- | sed 's/^kjs: //'
