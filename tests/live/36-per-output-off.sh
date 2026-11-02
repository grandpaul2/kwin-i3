#!/usr/bin/env bash
# Per-output desktops off (Plasma's default), with two monitors: kwin-i3 logs it at load and at
# each change, and never sets it; turned on, each monitor gets its own workspace again.
# peroutput: false
# stock: own
source "$(dirname "$0")/lib.sh"
peroutput() {   # set Plasma's setting as System Settings does, and wait for KWin to have it
    kwriteconfig6 --file kwinrc --group Windows --key PerOutputVirtualDesktops "$1"
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
    poll _peroutput_is "$1"
}
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
_peroutput_is() { [[ "$(kjs 'log(options.perOutputVirtualDesktops)')" == "$1" ]]; }
shows() { [[ "$(kjs "log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(workspace.screens[$1])) + 1)")" == "$2" ]]; }
check "the test KWin has it off"            _peroutput_is false
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. At load: logged.
check "logged: off, 2 screens"              wait_log '^.{9}PEROUTPUT off, 2 screens$'

# 2. Turned on: nothing more to say, and it takes effect there. While it was off, login
#    numbering left both monitors on workspace 2; each gets its own again, with no reload.
both_two() { shows 0 2 && shows 1 2; }
check "while off: both monitors show 2"     both_two
m=$(mark); peroutput true
check "turned on: logged ok"                wait_log '^.{9}PEROUTPUT ok$' "$m"
check "screen 0 shows workspace 1 again"    poll shows 0 1
check "screen 1 still shows workspace 2"    shows 1 2

# 3. Off again: logged again.
m=$(mark); peroutput false
check "logged off again"                    wait_log '^.{9}PEROUTPUT off, 2 screens$' "$m"

# 4. One monitor: ok. Reloaded (a new load) with one output.
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "one output"                          poll screens_are 1
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "one monitor: ok"                     wait_log '^.{9}PEROUTPUT ok$' "$m"

# 5. The second monitor comes back: logged off again.
m=$(mark); timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "two again: off, 2 screens"           wait_log '^.{9}PEROUTPUT off, 2 screens$' "$m"
check "no invariant failures or errors"     clean_log
finish
