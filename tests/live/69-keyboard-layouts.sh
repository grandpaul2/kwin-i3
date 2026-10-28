#!/usr/bin/env bash
# needs: plugin
# timing: alone
# kwin-i3's keys on other keyboard layouts (docs/spec-keyboard-layouts.md): kwini3helper gives the
# digit row's and the ; key's actions the symbols each layout types there, as KWin matches them.
# Keys are pressed by position (tools/inject.py sends key codes; press names them by the US
# label), and each check is the action that ran. Layouts change through kxkbrc, as System
# Settings writes it (KWin's KConfigWatcher: --notify).
source "$(dirname "$0")/lib.sh"
plan() { busctl --user call org.kde.KWin /kwini3helper net.local.kwini3helper Plan 2>/dev/null; }
plan_has() { plan | grep -qF -- "$1"; }
# A layout change reaches the helper through the keyboard daemon: 20 s, not 5, under the batch's
# load (item 34: "the helper fitted French" missed its 5 s).
fitted() { WAIT=20 poll plan_has "$@"; }
layout() {
    kwriteconfig6 --file kxkbrc --group Layout --key Use true
    kwriteconfig6 --file kxkbrc --group Layout --key LayoutList "$1" --notify
}
runs() {    # runs <keys by position> <action>: the key press runs that kwin-i3 action
    local m; m=$(mark)
    press "$1"
    wait_log "^.{9}ACTION $2\$" "$m"
}
notes() { grep -c '^NOTIFY' "$KI3_TMP/notify.out"; }
keys_of() { busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel shortcutKeys as 4 kwin "$1" KWin "$1"; }
META=$((0x10000000)) ALT=$((0x08000000))

: > "$KI3_TMP/notify.out"                  # there before the first poll reads it
"$root/tools/fakenotify.py" > "$KI3_TMP/notify.out" 2>&1 &
poll grep -q READY "$KI3_TMP/notify.out"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "the helper fitted the US layout"     fitted "layouts us"
check "US: Move to Workspace 2 is Meta+@"   plan_has "kwin-i3 Move to Workspace 2 (symbol) = Meta+@"
client --title a
client --title b
check "a, b on workspace 1"                 wait_tree 1 "H[a b*]"
check "US: Meta+Shift+2 moves to 2"         runs "Meta+Shift+2" "Move to Workspace 2"
check "US: Meta+2 shows 2"                  runs "Meta+2" "Workspace 2"
check "US: Meta+1 shows 1"                  runs "Meta+1" "Workspace 1"

# German: Shift+2 types ", Shift+3 §; the ; key is ö (a letter: Shift stays, Meta+Shift+Ö).
layout de
check "the helper fitted German"            fitted "layouts de"
check "de: Meta+Shift+3 moves to 3"         runs "Meta+Shift+3" "Move to Workspace 3"
check "de: Meta+3 shows 3"                  runs "Meta+3" "Workspace 3"
check "de: Meta+Shift+7 (/) moves to 7"     runs "Meta+Shift+7" "Move to Workspace 7"
check "de: Meta+0 shows 10"                 runs "Meta+0" "Workspace 10"
check "de: Meta+ö (the ; key) focuses right" runs "Meta+;" "Focus Right"
check "de: Meta+Shift+ö moves right"        runs "Meta+Shift+;" "Move Right"
check "de: Meta+Ctrl+ö grows the width"     runs "Meta+Ctrl+;" "Grow Width"
# With the helper, a non-US layout is no reason for a notice (39 is the case without it).
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded on German"                  wait_log 'kwin-i3 loaded$' "$m"
check "logged: fitted by the helper"        wait_log '^.{9}LAYOUTS fitted by the helper$' "$m"
sleep 1
check "and no notification"                 eval '[[ $(notes) == 0 ]]'
check "still fitted after the reload"       runs "Meta+Shift+3" "Move to Workspace 3"

# A key the user set is theirs: Workspace 4 on Meta+Alt+4 survives the next layout.
busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel setForeignShortcutKeys 'asa(ai)' \
    4 kwin "kwin-i3 Workspace 4" KWin "kwin-i3 Workspace 4" 1 4 $((META | ALT | 0x34)) 0 0 0
check "Workspace 4 rebound by the user"     poll eval '[[ "$(keys_of "kwin-i3 Workspace 4")" == *" $((META | ALT | 0x34)) "* ]]'

# French (AZERTY): the top row types &é"'(-è_çà, Shift the digits. Meta+Shift+1 must move, not
# show 1 (Meta+1 is Move to Workspace 1's now).
layout fr
check "the helper fitted French"            fitted "layouts fr"
check "fr: Meta+(the 1 key) shows 1"        runs "Meta+1" "Workspace 1"
check "fr: Meta+Shift+(the 1 key) moves to 1" runs "Meta+Shift+1" "Move to Workspace 1"
check "fr: Meta+(the 5 key) shows 5"        runs "Meta+5" "Workspace 5"
check "fr: Meta+Shift+(the 5 key) moves to 5" runs "Meta+Shift+5" "Move to Workspace 5"
check "the user's Workspace 4 key is kept"  eval '[[ "$(keys_of "kwin-i3 Workspace 4")" == *" $((META | ALT | 0x34)) "* ]]'
check "and Workspace 5's was fitted: Meta+( (the 5 key on AZERTY)" eval '[[ "$(keys_of "kwin-i3 Workspace 5")" == *" $((META | 0x28)) "* ]]'

# Two layouts, switched with a key: KWin matches the current layout's symbol, so the keys follow
# the switch (US & is Shift+7, German & is Shift+6: one symbol, a different action in each).
layout us,de
check "the helper fitted us,de, on US"      fitted "layouts us,de, current us"
check "us,de on US: Meta+Shift+2 moves to 2" runs "Meta+Shift+2" "Move to Workspace 2"
check "us,de on US: Meta+Shift+7 (&) moves to 7" runs "Meta+Shift+7" "Move to Workspace 7"
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 1 >/dev/null
check "switched to German: refitted"        fitted "current de"
check "us,de on German: Meta+Shift+2 moves to 2" runs "Meta+Shift+2" "Move to Workspace 2"
check "us,de on German: Meta+Shift+6 (&) moves to 6" runs "Meta+Shift+6" "Move to Workspace 6"
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 0 >/dev/null
check "back on US: refitted"                fitted "current us"
check "us,de on US again: Meta+Shift+7 moves to 7" runs "Meta+Shift+7" "Move to Workspace 7"
# A quick flip, German and straight back: two fits asked for at once end on US's keys.
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 1 >/dev/null
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 0 >/dev/null
sleep 1
check "quick flip: on US, the plan is US's" fitted "current us"
check "quick flip: Meta+Shift+7 (&) moves to 7, not German's 6" runs "Meta+Shift+7" "Move to Workspace 7"
check "quick flip: Meta+Shift+2 moves to 2" runs "Meta+Shift+2" "Move to Workspace 2"

# US and French: Meta+1 moves between Workspace 1 (US) and Move to Workspace 1 (AZERTY) at each
# switch, emptied before it is set.
layout us,fr
check "the helper fitted us,fr, on US"      fitted "layouts us,fr, current us"
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 1 >/dev/null
check "switched to French: refitted"        fitted "current fr"
check "us,fr on French: Meta+Shift+1 moves to 1" runs "Meta+Shift+1" "Move to Workspace 1"
check "us,fr on French: Meta+1 shows 1"     runs "Meta+1" "Workspace 1"
busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 0 >/dev/null
check "back on US: refitted"                fitted "current us"
check "us,fr on US: Meta+1 shows 1"         runs "Meta+1" "Workspace 1"
check "us,fr on US: Meta+Shift+1 moves to 1" runs "Meta+Shift+1" "Move to Workspace 1"

layout us
check "back to US alone: refitted"          fitted "layouts us, current us"
check "Move to Workspace 2 is Meta+@ again" plan_has "kwin-i3 Move to Workspace 2 (symbol) = Meta+@"
check "US: Meta+Shift+2 moves to 2"         runs "Meta+Shift+2" "Move to Workspace 2"

check "no invariant failures or errors"     clean_log
finish
