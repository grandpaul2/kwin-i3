#!/usr/bin/env bash
# tools/capture (Meta+Shift+B on the desktop): kwin-i3's "Dump State" reaches the capture's own
# sink, with the tree, the windows and the in-memory log, even though the dump goes to a different
# bus name from the test log.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title a; client --title b
wait_tree 1 "H[a b*]" >/dev/null
export KI3_CAPTURE_DIR=$KI3_TMP/captures
"$root/tools/capture"
state=$(ls -d "$KI3_CAPTURE_DIR"/*/ 2>/dev/null | head -1)state.txt
has() { grep -qE -- "$1" "$state"; }
check "a capture directory with state.txt"  test -s "$state"
check "it is complete (BEGIN .. END)"       eval 'has "DUMP BEGIN" && has "DUMP END$"'
check "both outputs, one active"            eval 'has "Virtual-0 0,0 1280x720 shows 1" && has "Virtual-1 .* shows 2" && has " active$"'
check "the tree, with focus"                has "TREE 1 H\[a b\*\]"
check "tree detail: shares"                 has "^.{9}    a percent=0.5000"
check "window facts"                        has '"b" .* managed rule=tile frame=640,0 640x720 .* desktops=1 .*ACTIVE'
check "the in-memory log came too"          has "kwin-i3 loaded$"
check "no errors in the dump"               eval '! has "ERROR in dump"'
check "no errors.txt"                       test ! -e "$(dirname "$state")/errors.txt"
check "no invariant failures or errors"     clean_log

# Paul's desktop runs with debugLog off: the in-memory log must fill all the same.
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
kwriteconfig6 --file "$XDG_CONFIG_HOME/kwinrc" --group Script-kwin-i3 --key debugLog false
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
m=$(mark)
load_kwin_i3
sleep 1
"$root/tools/capture"
state2=$(ls -d "$KI3_CAPTURE_DIR"/*/ | tail -1)state.txt
check "a second capture"                    test "$state2" != "$state"
check "debugLog off: nothing went to the test log" eval '! after "$m" | grep -q "kwin-i3 loaded"'
check "debugLog off: the dump says so"      grep -q "DUMP BEGIN released=false debugLog=false" "$state2"
check "debugLog off: the in-memory log still has the load" grep -qE "^.{9}[0-9:]{8} kwin-i3 loaded$" "$state2"

# A second press while one is running does nothing (the lock), rather than fight for the name.
n_before=$(ls -d "$KI3_CAPTURE_DIR"/*/ | wc -l)
flock "$KI3_CAPTURE_DIR/.lock" sleep 2 & holder=$!; sleep 0.3
"$root/tools/capture"
check "a capture while one runs is skipped" test "$(ls -d "$KI3_CAPTURE_DIR"/*/ | wc -l)" = "$n_before"
check "the capture directory is private"   test "$(stat -c %a "$(dirname "$state2")")" = 700
wait "$holder"     # not a bare wait: the test clients never exit
finish
