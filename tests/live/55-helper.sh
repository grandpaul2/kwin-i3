#!/usr/bin/env bash
# needs: plugin
# kwini3helper's settings watch (plugin/settingswatch.cpp, docs/spec-settings.md): a save of
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
check "and it acts: b is 960 wide"          geom_is b "320,0 960x720"

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

check "no invariant failures or errors"     clean_log
finish
