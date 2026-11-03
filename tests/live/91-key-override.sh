#!/usr/bin/env bash
# needs: plugin
# Probe (key override): stock Plasma shortcuts, so Quick Tile Left holds Meta+Left as well as
# kwin-i3's Focus Left. A real Meta+Left press: with the helper's override filter, kwin-i3's
# command runs and Plasma's doesn't; without it, Plasma's.
source "$(dirname "$0")/lib.sh"
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$root/package/contents/code/main.js" kwin-i3 >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
wait_log 'kwin-i3 loaded$'
echo "    Meta+Left in kglobalshortcutsrc: $(grep -E '^(Window Quick Tile Left|kwin-i3 Focus Left)=' "$XDG_CONFIG_HOME/kglobalshortcutsrc" | tr '\n' ' ')"
client --title a; client --title b --color blue
check "a | b, b focused"                   wait_tree 1 "H[a b*]"
before=$(geom b); echo "    b before: $before"
press "Meta+Left"
sleep 1
echo "    tree: $(tree 1)   b after: $(geom b)   override lines: $(grep -c 'PROBE override' "$KI3_TMP/kwin.out")"
check "kwin-i3's Focus Left ran: a focused" wait_tree 1 "H[a* b]"
check "Plasma's Quick Tile Left didn't: b where it was" eval '[[ "$(geom b)" == "$before" ]]'
finish
