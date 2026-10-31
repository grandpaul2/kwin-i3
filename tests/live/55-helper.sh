#!/usr/bin/env bash
# needs: plugin
# kwini3helper's settings watch (plugin/settingswatch.cpp): a save of
# kwinrc [Script-kwin-i3] (the config form's Apply: a plain write, no --notify) has KWin
# reconfigure once, and kwin-i3 takes the new value without Meta+Shift+C. A write elsewhere in
# kwinrc, KWin's own included, reconfigures nothing. A probe script counts the reconfigures.
source "$(dirname "$0")/lib.sh"
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
plugin_loaded() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins | grep -q '"kwini3helper"'; }
probe=$KI3_TMP/probe.js
cat > "$probe" <<'JS'
var n = 0;
options.configChanged.connect(function () {
    n++;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "probe: reconfigure " + n);
});
JS
reconfigures() { grep -cE '^.{9}probe: reconfigure' "$KI3_LOG"; }
count_is() { [[ "$(reconfigures)" == "$1" ]]; }

check "the helper is loaded"                plugin_loaded
load_kwin_i3
wait_log 'kwin-i3 loaded$'
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$probe" probe >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
sleep 1.5                                   # the test KWin's own start-up reconfigure, if any, first
base=$(reconfigures)

# 1. Apply, as the form saves: kwin-i3 takes it with no key pressed, and KWin reconfigured once.
client --title a; client --title b
check "a | b"                               wait_tree 1 "H[a b*]"
m=$(mark)
set_key resizeStep 25
check "kwin-i3 took it: SETTINGS resizeStep" wait_log '^.{9}SETTINGS resizeStep$' "$m"
sleep 1
check "exactly one reconfigure"             count_is $((base + 1))
key "Grow Width"
check "and it acts: b is 958 wide (the frame)" geom_is b "321,1 958x718"

# 2. A write to another group of kwinrc, and one that leaves kwin-i3's group as it is: nothing.
kwriteconfig6 --file kwinrc --group kwin-i3-test --key unrelated 1
set_key resizeStep 25
sleep 1.5
check "no reconfigure for either"           count_is $((base + 1))

# 3. KWin's own writes to kwinrc (its tiles, saved on a timer after a layout change): nothing.
client --title c
check "a | b | c"                           wait_tree 1 "H[a b c*]"
sleep 2.5
check "no reconfigure from KWin's tile save" count_is $((base + 1))

# 4. Several keys in one save (the form writes them together): one reconfigure.
m=$(mark)
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsInner 4 --key gapsOuter 6 2>/dev/null ||
    { set_key gapsInner 4; set_key gapsOuter 6; }
check "kwin-i3 took both"                   wait_log '^.{9}SETTINGS .*gaps' "$m"
sleep 1
check "one or two reconfigures, no storm"   bash -c "(( \$(grep -cE '^.{9}probe: reconfigure' '$KI3_LOG') <= $((base + 3)) ))"

# 5. A change and its undo inside one debounce, with another reconfigure between them: KWin
#    loads the changed value from that reconfigure, so the undo must reach it too. The helper
#    compared with what it last saw itself, the group as before, and sent nothing (53-hold's
#    "deleted: on again" under load, 2026-10-24). KWin's reconfigure is a 200 ms timer, so 170-190
#    ms after one, the write lands just before KWin reparses; the undo 40 ms later. The hold
#    effect's timeoutMs is what KWin last loaded.
timeout_ms() { busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["timeoutMs"]["data"])'; }
for d in 0.17 0.18 0.19; do
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
    sleep "$d"
    set_key holdTimeoutMs 300
    sleep 0.04
    kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key holdTimeoutMs --delete
    sleep 1.5
    check "undone within the debounce ($d s after a reconfigure): back to 200" test "$(timeout_ms)" = 200
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5   # put it right for the next
done

# 6. i3's resize mode (plugin/resizemode.cpp): Meta+R
#    enters it and the effect shows its banner; J shrinks the width (the helper runs kwin-i3's
#    action by key code); Meta+1 is kglobalaccel's but kwin-i3 ignores it in the mode; a plain
#    letter fires no kwin-i3 action (it reaches the window); Escape leaves.
mode_is() { [[ "$(busctl --user call org.kde.KWin /kwini3mode net.local.kwini3mode Mode)" == "s \"$1\"" ]]; }
width_of() { local g; g=$(geom "$1"); g=${g#* }; echo "${g%x*}"; }
m=$(mark)
press Meta+R
check "6. Meta+R: the mode is on"           poll mode_is resize
check "6. kwin-i3 heard it"                 wait_log '^.{9}MODE resize$' "$m"
check "6. the effect shows the banner (its log says so)" poll eval 'busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Events | grep -q "mode: resize"'
w0=$(width_of c)
m=$(mark)
press J
check "6. J: Shrink Width ran"              wait_log '^.{9}ACTION Shrink Width$' "$m"
check "6. c got narrower"                   poll eval '(( $(width_of c) < w0 ))'
m=$(mark)
press Meta+1
check "6. Meta+1 in the mode: kwin-i3 ignores it" wait_log '^.{9}KEY Workspace 1 ignored: the resize mode is on$' "$m"
m=$(mark)
press X
sleep 0.3
check "6. a plain letter: no kwin-i3 action (it went to the window)" eval '! after "$m" | grep -qE "^.{9}ACTION "'
press Escape
check "6. Escape: the mode is off"          poll mode_is ""
check "6. kwin-i3 heard that too"           wait_log '^.{9}MODE off$' "$m"
m=$(mark)
press Meta+1
check "6. Meta+1 works again"               wait_log '^.{9}ACTION Workspace 1$' "$m"

check "no invariant failures or errors"     clean_log
finish
