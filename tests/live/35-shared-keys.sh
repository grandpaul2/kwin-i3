#!/usr/bin/env bash
# needs: plugin
# Shared keys: a key another action holds is shown on kwin-i3's action too, but only the first
# holder's fires, unless the key override (keysOverride, on by default; the helper) runs
# kwin-i3's, with every holder's keys left as they are.
source "$(dirname "$0")/lib.sh"
kga() { busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel "$@"; }
keys_of() { kga shortcutKeys as 4 "$1" "$2" x "$2"; }
setk() { local c=$1 a=$2; shift 2; kga setForeignShortcutKeys 'asa(ai)' 4 "$c" "$a" x "$a" "$@" >/dev/null; }

# Holders before kwin-i3 loads: KWin's own Quick Tile Left has its stock Meta+Left; a stand-in
# app holds Meta+E, plus Meta+Shift+F11 to show a holder keeps its other keys, registered as a
# running app registers (doRegister, then setShortcutKeys with SetPresent: active).
ME=$((0x10000045)) MSF11=$((0x1300003A))
kga doRegister as 4 fakeapp Launch "Fake App" "Launch Fake App" >/dev/null
kga setShortcutKeys 'asa(ai)u' 4 fakeapp Launch "Fake App" "Launch Fake App" 2 4 $ME 0 0 0 4 $MSF11 0 0 0 2 >/dev/null
check "the stand-in app is active"          test "$(busctl --user call org.kde.kglobalaccel /component/fakeapp org.kde.kglobalaccel.Component isActive)" == "b true"
before_tile=$(keys_of kwin "Window Quick Tile Left") before_fake=$(keys_of fakeapp Launch)
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. The key override on, by default: both run kwin-i3's action; no holder's keys change.
plan() { busctl --user call org.kde.KWin /kwini3helper net.local.kwini3helper OverridePlan; }
plan_on() { [[ "$(plan)" == "s \"on"* && "$(plan)" == *"Meta+Left = kwin-i3 Focus Left"* ]]; }
plan_off() { [[ "$(plan)" == "s \"off"* ]]; }
check "the override is on, with Meta+Left"  poll plan_on
m=$(mark); press Meta+Left
check "Meta+Left: kwin-i3's Focus Left"     wait_log '^.{9}ACTION Focus Left$' "$m"
m=$(mark); press Meta+E
check "Meta+E: kwin-i3's Toggle Split"      wait_log '^.{9}ACTION Toggle Split$' "$m"
check "Quick Tile Left keeps its keys"      test "$(keys_of kwin "Window Quick Tile Left")" == "$before_tile"
check "the stand-in keeps its keys"         test "$(keys_of fakeapp Launch)" == "$before_fake"

# 2. Off: the holders' run, kwin-i3's doesn't.
kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key keysOverride false
check "the override is off"                 poll plan_off
m=$(mark); press Meta+E
sleep 0.5
check "Meta+E: not kwin-i3's"               eval '! after "$m" | grep -qE "^.{9}ACTION Toggle Split$"'

check "no invariant failures or errors"     clean_log
finish
