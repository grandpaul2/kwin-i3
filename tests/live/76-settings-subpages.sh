#!/usr/bin/env bash
# needs: kcm
# stock: own
# timing: alone
# The settings page's Workspaces and Window Rules sub-pages,
# driven as a person would, controls found by their accessible names (tools/a11y.py) as in
# 37-settings-page. Alone, as 37: kcmshell6 is slow to show in the parallel batch.
source "$(dirname "$0")/lib.sh"
conf() { kreadconfig6 --file kwinrc --group Script-kwin-i3 --key "$1"; }
conf_is() { [[ $(conf "$1") == "$2" ]]; }
click() { "$INJECT" "abs $1 $2" "wait 50" "btn left down" "wait 30" "btn left up" "wait 100"; }
click_named() {   # click_named <page title, or - for anywhere> <accessible name>
    local xy cx cy; xy=$($A11Y box kcmshell6 "$1" "$2") || return 1
    read -r cx cy <<<"$xy"
    click $((wx + cx)) $((wy + cy))
}
named() { $A11Y names kcmshell6 "$1" | grep -qxF "$2"; }
# open_named <page> <button>: a sub-page button pressed by keyboard (focus, then Space): a click
# at its box can land under the footer when the page scrolls it to the bottom edge, or on a test
# window floating over it (the main page grew).
open_named() { $A11Y focus kcmshell6 "$1" "$2"; press Space; sleep 0.7; }
n_shot=0
shot() {   # a screenshot kept with KI3_SHOTS=<dir>, for the style guide's screenshot pass
    [[ -n ${KI3_SHOTS:-} ]] || return 0
    python3 "$root/tools/shot.py" capture Virtual-0 "$KI3_SHOTS/76-$((++n_shot))-$1.png"
}
# A workspace set to a monitor that isn't connected, from before: the page keeps it.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key workspaceOutputs "4=DP-9"

check "an accessibility bus of the test's own" a11y_start
QT_PLUGIN_PATH=$root/kcm/build/bin QT_QPA_PLATFORM=wayland kcmshell6 kcm_kwin_i3 >"$KI3_TMP/kcm.log" 2>&1 &
opens() { WAIT=30 poll _has_window kwin-i3; }
check "the page opens"                      opens
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") w.setMaximize(true, true); });' >/dev/null
check "maximized"                           wait_geom kwin-i3 "0,0 1280x720"
read -r wx wy <<<"$(kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") { var c = w.clientGeometry; log(Math.round(c.x) + " " + Math.round(c.y)); } });')"
click_named kwin-i3 "Turn On"
check "Turn On: kwin-i3 loads"              wait_log 'kwin-i3 loaded$'
check "kwin-i3 tiles the page"              wait_geom kwin-i3 "0,0 1280x720"

# 1. Workspaces: 2 on Virtual-1 (Any monitor, Virtual-0, Virtual-1: two down), 3 for Plasma
#    windows, by keyboard: a closed combo box steps its choice with Down (its open list didn't
#    take arrow keys from injected input). One Apply writes both strings (the floating workspace
#    as a rule in forWindow), and 4's unconnected DP-9 is kept.
open_named kwin-i3 "Configure Workspaces…"
$A11Y focus kcmshell6 Workspaces "Workspace 2 screen"; press Down; press Down; sleep 0.3
shot workspaces
$A11Y focus kcmshell6 Workspaces "Workspace 3 new windows"; press Down; sleep 0.3
m=$(mark); click_named - Apply
check "kwinrc: workspaceOutputs=2=Virtual-1, 4=DP-9" poll conf_is workspaceOutputs "2=Virtual-1, 4=DP-9"
check "kwinrc: forWindow has workspace 3's floating rule" poll eval '[[ $(conf forWindow) == *\[workspace=\"^3\$\"\]\ floating\ enable* ]]'
check "kwin-i3 re-read both"                wait_log '^.{9}SETTINGS .*(forWindow.*workspaceOutputs|workspaceOutputs.*forWindow)' "$m"
click_named - "Navigate Back"; sleep 0.5
check "the main page sums it up"            named kwin-i3 "Configure Workspaces…"

# 2. Window Rules (i3's rules): Pick a Window on a test client adds a floating
#    rule for its class; after Apply a new window of that class floats.
client --title pickme --app-id net.local.pickme --color red
check "pickme tiles beside the page"        poll eval '[[ "$(tree 1)" == *pickme* ]]'
read -r px py pw ph <<<"$(geom pickme | tr ',x' '  ')"
# The page gets the keyboard back from the test client first (a click at the button's box missed
# it: the page is half as wide now, and the box's scroll left the button out of view).
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") workspace.activeWindow = w; });' >/dev/null; sleep 0.3
open_named kwin-i3 "Configure Window Rules…"
shot window-rules
check "the rules are there to edit, one row each" eval 'named "Window Rules" "Rule 1: application" && named "Window Rules" "Add a rule"'
check "  the shipped rules a group of their own" eval '$A11Y dump kcmshell6 | grep -q "Your rules"'
# KWin starts its window selection when the D-Bus call arrives; a click before that only focuses
# the window, and nothing says when it has started.
click_named "Window Rules" "Pick a window: add a rule for its application"; sleep 1
click $((px + pw / 2)) $((py + ph / 2))
check "the page says the rule was added"    poll eval '$A11Y dump kcmshell6 | grep -q "net.local.pickme float"'
check "and nothing is written before Apply" eval '[[ $(conf forWindow) != *pickme* ]]'
m=$(mark); click_named - Apply
check "kwinrc: forWindow ends with the rule" poll eval '[[ $(conf forWindow) == *\[class=\"^net\\.local\\.pickme\$\"\]\ floating\ enable ]]'
check "kwin-i3 re-read it"                  wait_log '^.{9}SETTINGS .*forWindow' "$m"
client --title pickme2 --app-id net.local.pickme --color blue
check "pickme2 floats by the rule"          poll eval '[[ "$(tree 1)" == *"~pickme2"* ]]'

# 2b. Gaps (item 68): workspace 2's own gap between windows, three steps up on the
#     sub-page (from "same", then 0 and 1: a workspace's gap replaces the main page's, as i3's,
#     2026-10-29), reaches workspaceGaps on Apply. The test clients go first: the floating one sat
#     over the page, and they held the keyboard.
kclose pickme2; kclose pickme; sleep 0.3
click_named - "Navigate Back"; sleep 0.5
open_named kwin-i3 "Configure Gaps…"
check "the Gaps page: each workspace's row" named Gaps "Workspace 2 gap between windows"
$A11Y focus kcmshell6 Gaps "Workspace 2 gap between windows"; press Up; press Up; press Up; sleep 0.3
shot gaps
m=$(mark); click_named - Apply
check "kwinrc: workspaceGaps=2 gaps inner 2" poll conf_is workspaceGaps "2 gaps inner 2"
check "kwin-i3 re-read it"                  wait_log '^.{9}SETTINGS .*workspaceGaps' "$m"

# 3. Defaults: the rule is gone, and kwinrc holds none of the page's keys.
click_named - Defaults
click_named - Apply
check "kwinrc: no forWindow (the default)"  poll conf_is forWindow ""
check "no workspaceOutputs"                 conf_is workspaceOutputs ""
check "no floatingWorkspaces"               conf_is floatingWorkspaces ""
check "no workspaceGaps"                    conf_is workspaceGaps ""
check "no invariant failures or errors"     clean_log
finish
