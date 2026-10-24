#!/usr/bin/env bash
# Per-output desktops off (Plasma's default), with two monitors: kwin-i3 says so, once at load
# and once more if it becomes a problem later; never sets it (docs/spec-per-output-desktops.md).
# peroutput: false
# stock: own
source "$(dirname "$0")/lib.sh"
notes() { grep -c '^NOTIFY' "$KI3_TMP/notify.out"; }
notes_are() { [[ $(notes) == "$1" ]]; }
peroutput() {   # set Plasma's setting as System Settings does, and wait for KWin to have it
    kwriteconfig6 --file kwinrc --group Windows --key PerOutputVirtualDesktops "$1"
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
    poll _peroutput_is "$1"
}
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
_peroutput_is() { [[ "$(kjs 'log(options.perOutputVirtualDesktops)')" == "$1" ]]; }
shows() { [[ "$(kjs "log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(workspace.screens[$1])) + 1)")" == "$2" ]]; }
"$root/tools/fakenotify.py" > "$KI3_TMP/notify.out" 2>&1 &
poll grep -q READY "$KI3_TMP/notify.out"
check "the test KWin has it off"            _peroutput_is false
# A taken key too (as 35), so the load notification has both parts.
busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel setForeignShortcutKeys 'asa(ai)' \
    4 kwin "Window Quick Tile Left" x "Window Quick Tile Left" 1 4 $((0x11000012)) 0 0 0
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. At load: the report says so, in the one notification, with the taken key.
check "logged: off, 2 screens"              wait_log '^.{9}PEROUTPUT off, 2 screens$'
check "one notification"                    poll notes_are 1
check "it names the setting"                grep -q 'Switch desktops independently for each screen' "$KI3_TMP/notify.out"
check "two parts: '2 things to fix'"        grep -q "'kwin-i3: 2 things to fix in this setup'" "$KI3_TMP/notify.out"
check "and the taken key"                   grep -q 'Meta+Left: Quick Tile Window to the Left' "$KI3_TMP/notify.out"

# 2. Turned on: nothing more to say, and it takes effect there. While it was off, login
#    numbering left both monitors on workspace 2; each gets its own again, with no reload.
both_two() { shows 0 2 && shows 1 2; }
check "while off: both monitors show 2"     both_two
m=$(mark); peroutput true
check "turned on: logged ok"                wait_log '^.{9}PEROUTPUT ok$' "$m"
check "screen 0 shows workspace 1 again"    poll shows 0 1
check "screen 1 still shows workspace 2"    shows 1 2
sleep 0.5
check "no new notification"                 notes_are 1

# 3. Off again: one more notification; off a second time, no third (once per load).
peroutput false
check "off again: a second notification"    poll notes_are 2
peroutput true; m=$(mark); peroutput false
check "logged off again"                    wait_log '^.{9}PEROUTPUT off, 2 screens$' "$m"
sleep 0.5
check "but no third"                        notes_are 2

# 4. One monitor: nothing to say. Reloaded (a new load) with one output, the taken-keys part off.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key warnTakenKeys false
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "one output"                          poll screens_are 1
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "one monitor: ok"                     wait_log '^.{9}PEROUTPUT ok$' "$m"
sleep 0.5
check "no notification"                     notes_are 2

# 5. The second monitor comes back: now it's a problem, said once.
m=$(mark); timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "two again: off, 2 screens"           wait_log '^.{9}PEROUTPUT off, 2 screens$' "$m"
check "a notification for it"               poll notes_are 3
check "no invariant failures or errors"     clean_log
finish
