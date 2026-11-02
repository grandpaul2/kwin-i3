#!/usr/bin/env bash
# needs: plugin
# The helper plugin unloaded and loaded again in a running KWin, as make plugin-install does:
# KWin keeps the old library, and nothing of the unloaded instance may outlive it. On
# 2026-10-24 the frame-click filter's settings subscription did (KDE's config watcher is shared
# by everyone watching kwinrc, so it lived on): the next config change called the unloaded
# instance and KWin crashed, taking every app with it.
source "$(dirname "$0")/lib.sh"
alive() { busctl --user call org.kde.KWin /KWin org.kde.KWin currentDesktop >/dev/null 2>&1; }
helper() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins | grep -o '"kwini3helper[^"]*"' | tr -d '"'; }
notify() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key frameWidth "$1"; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
id=$(helper)
check "the helper is loaded ($id)"          [ -n "$id" ]
busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins UnloadPlugin s "$id" >/dev/null
check "unloaded"                            poll eval '[ -z "$(helper)" ]'
notify 2; sleep 0.5
check "a config change: KWin is still there" alive
busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins LoadPlugin s "$id" >/dev/null
check "loaded again"                        poll eval '[ -n "$(helper)" ]'
notify 1; sleep 0.5
check "another config change: still there"  alive
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5
check "and KWin's reconfigure: still there" alive

# The tree kwin-i3 keeps with the effect outlives a new effect (an install swaps it): told again
# to the new one, so the script's next load restores i3's tree, not what the tiles hold. A
# tabbed group with a window beside it, which the tiles alone give back otherwise.
client --title a; client --title b
wait_tree 1 "H[a b*]" >/dev/null
key "Split V"
client --title c
check "a | V[b c]"                          wait_tree 1 "H[a V[b c*]]"
key "Layout Tabbed"
check "a | T[b c]"                          wait_tree 1 "H[a T[b c*]]"
eid=$(busctl --user get-property org.kde.KWin /Effects org.kde.kwin.Effects loadedEffects | grep -o '"kwini3hold[^"]*"' | tr -d '"')
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s "$eid" >/dev/null
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s "$eid" >/dev/null
check "the effect reloaded, told the tree again" poll eval 'busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -q "\"memo\" a{sv} [1-9]"'
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark)
load_kwin_i3
check "the script reloaded"                 wait_log 'kwin-i3 loaded$' "$m"
check "  the tree whole, from the memo"     wait_log '^.{9}MEMO 1 ' "$m"
check "  H[a T[b c]]"                       wait_tree 1 "H[a T[b c*]]" "$m"

# A container floated whole outlives a new effect too: its windows told again as floated (the
# effect's load asks a reconfigure, whose tellDrag tells every one anew), their frame and the
# hold the effect's only while it knows them.
key "Focus Parent"
key "Floating Toggle"
check "T[b c] floated whole"                wait_tree 1 "H[a] ~T[b c]*"
floated() { busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -q '"floated" as 2 '; }
check "  the effect knows b and c"          poll floated
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s "$eid" >/dev/null
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s "$eid" >/dev/null
check "the effect reloaded, told them again" poll floated
finish
