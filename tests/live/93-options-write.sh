#!/usr/bin/env bash
# Probe (Plasma's settings overridden at runtime): can a KWin script write KWin's live options
# (focus policy, focus delay, next focus under the pointer, focus stealing prevention, screen-edge
# tiling and maximizing)? Does a reconfigure reset them to kwinrc's, with configChanged a moment
# to write them again? Is kwinrc left untouched?
source "$(dirname "$0")/lib.sh"
rc="$XDG_CONFIG_HOME/kwinrc"
before=$(md5sum < "$rc")
cat > "$KI3_TMP/opts.js" <<'JS'
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function show(tag) {
    log("PROBE " + tag + " fp=" + options.focusPolicy + " delay=" + options.delayFocusInterval
        + " nfpm=" + options.nextFocusPrefersMouse + " fsp=" + options.focusStealingPreventionLevel
        + " et=" + options.electricBorderTiling + " em=" + options.electricBorderMaximize);
}
function apply() {
    options.focusPolicy = 0;                    // ClickToFocus; kwinrc says FocusFollowsMouse
    options.delayFocusInterval = 250;           // kwinrc says 0
    options.nextFocusPrefersMouse = false;      // kwinrc says true
    options.focusStealingPreventionLevel = 2;   // kwinrc: none, the stock Low (1)
    options.electricBorderTiling = false;       // stock true
    options.electricBorderMaximize = false;     // stock true
}
show("loaded");
apply();
show("written");
options.configChanged.connect(function () { show("reset"); apply(); show("reapplied"); });
// The delay is forced to 0 under click to focus (options.cpp:221-224): written under follow mouse.
options.focusPolicy = 1; options.delayFocusInterval = 250; show("ffmdelay"); apply();
JS
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$KI3_TMP/opts.js" probe-opts >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
wait_log 'PROBE written'
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
wait_log 'PROBE reapplied'
sleep 0.5
grep 'PROBE' "$KI3_LOG" | sed 's/^/    /'
line() { grep "PROBE $1 " "$KI3_LOG" | tail -1 | sed 's/.*PROBE [a-z]* //'; }
want="fp=0 delay=0 nfpm=false fsp=2 et=false em=false"
check "loaded: kwinrc's values"            [ "$(line loaded)" == "fp=1 delay=0 nfpm=true fsp=1 et=true em=true" ]
check "written: every write holds"         [ "$(line written)" == "$want" ]
check "reconfigure: reset to kwinrc's"     [ "$(line reset)" == "$(line loaded)" ]
check "configChanged: written again"       [ "$(line reapplied)" == "$want" ]
check "follow mouse: a delay write holds"  [ "$(line ffmdelay)" == "fp=1 delay=250 nfpm=false fsp=2 et=false em=false" ]
check "kwinrc untouched"                   [ "$(md5sum < "$rc")" == "$before" ]
finish
