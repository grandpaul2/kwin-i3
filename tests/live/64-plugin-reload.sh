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
finish
