#!/usr/bin/env bash
# Without the plugins kwin-i3's keys stay US symbols: on another keyboard layout the load
# notification says so (docs/records/spec-keyboard-layouts.md). On US, nothing; with warnTakenKeys off,
# nothing. No "# needs: plugin": the helper is not loaded here.
source "$(dirname "$0")/lib.sh"
notes() { grep -c '^NOTIFY' "$KI3_TMP/notify.out"; }
notes_are() { [[ $(notes) == "$1" ]]; }
has_layout() { [[ "$(busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts getLayoutsList)" == *"\"$1\""* ]]; }
layout() {   # a check: a layout KWin never got would fail two steps later, as a missing log line
    set_layouts "$1"
    WAIT=20 poll has_layout "${1%%,*}"
}
reload() {
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
    local m; m=$(mark); load_kwin_i3; wait_log 'kwin-i3 loaded$' "$m"
}
: > "$KI3_TMP/notify.out"                  # there before the first poll reads it
"$root/tools/fakenotify.py" > "$KI3_TMP/notify.out" 2>&1 &
poll grep -q READY "$KI3_TMP/notify.out"

# 1. US: logged, nothing to say about the layout. (Without the helper the load report has one
#    part all the same since redo stage 5: what goes without the plugins, refinement stage 3.)
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "US: logged, no notice"               wait_log '^.{9}LAYOUTS us$'
check "one notification, the missing plugins" poll notes_are 1
check "  which says so"                     grep -q "Without the helper: no tiling drag" "$KI3_TMP/notify.out"
check "  and nothing about the layout"      bash -c "! grep -qi 'may not fit the keyboard layout' '$KI3_TMP/notify.out'"

# 2. German, at the next load: one notification naming the layout and the fix.
check "de: KWin has the layout"             layout de
m=$(mark); reload
slow_log() { WAIT=20 wait_log "$@"; }   # a prefix assignment inside check would be run as a command
check "de: logged as not fitted"            slow_log '^.{9}LAYOUTS de, not fitted \(no helper\)$' "$m"
check "a second notification"               poll notes_are 2
check "it names the layout"                 grep -q "Its keys may not fit the keyboard layout (de)" "$KI3_TMP/notify.out"
check "and the fix"                         grep -q "make plugin-install" "$KI3_TMP/notify.out"

# 3. warnTakenKeys off: no check, no notification.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key warnTakenKeys false
m=$(mark); reload
sleep 1
check "off: no LAYOUTS line"                bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -q 'LAYOUTS'"
check "and no new notification"             notes_are 2

check "no invariant failures or errors"     clean_log
finish
