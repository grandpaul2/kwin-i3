#!/usr/bin/env bash
# needs: kcm
# stock: own
# timing: alone
# The settings page's Workspaces, Window Rules and Tiling tabs,
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
# open_tab <tab>: a tab clicked (a tab takes no keyboard focus from the accessibility tool, so a
# Space after it went to the window that had the keyboard).
open_tab() { click_named kwin-i3 "$1"; sleep 0.7; }
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
open_tab "Workspaces"
$A11Y focus kcmshell6 Workspaces "Workspace 2 screen"; press Down; press Down; sleep 0.3
shot workspaces
$A11Y focus kcmshell6 Workspaces "Workspace 3 new windows"; press Down; sleep 0.3
m=$(mark); click_named - Apply
check "kwinrc: workspaceOutputs=2=Virtual-1, 4=DP-9" poll conf_is workspaceOutputs "2=Virtual-1, 4=DP-9"
check "kwinrc: forWindow has workspace 3's floating rule" poll eval '[[ $(conf forWindow) == *\[workspace=\"^3\$\"\]\ floating\ enable* ]]'
check "kwin-i3 re-read both"                wait_log '^.{9}SETTINGS .*(forWindow.*workspaceOutputs|workspaceOutputs.*forWindow)' "$m"

# 2. Window Rules (i3's rules): Pick a Window on a test client adds a floating
#    rule for its class; after Apply a new window of that class floats.
client --title pickme --app-id net.local.pickme --color red
check "pickme tiles beside the page"        poll eval '[[ "$(tree 1)" == *pickme* ]]'
read -r px py pw ph <<<"$(geom pickme | tr ',x' '  ')"
# The page gets the keyboard back from the test client first (a click at the button's box missed
# it: the page is half as wide now, and the box's scroll left the button out of view).
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "kwin-i3") workspace.activeWindow = w; });' >/dev/null; sleep 0.3
open_tab "Window Rules"
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
#     Tiling tab (from "same", then 0 and 1: a workspace's gap replaces the one above, as i3's,
#     2026-10-29), reaches workspaceGaps on Apply. The test clients go first: the floating one sat
#     over the page, and they held the keyboard.
kclose pickme2; kclose pickme; sleep 0.3
open_tab "Tiling"
check "the Tiling tab: each workspace's row" named Tiling "Workspace 2 gap between windows"
$A11Y focus kcmshell6 Tiling "Workspace 2 gap between windows"; press Up; press Up; press Up; sleep 0.3
shot gaps
m=$(mark); click_named - Apply
check "kwinrc: workspaceGaps=2 gaps inner 2" poll conf_is workspaceGaps "2 gaps inner 2"
check "kwin-i3 re-read it"                  wait_log '^.{9}SETTINGS .*workspaceGaps' "$m"

# 3. Defaults resets the tab shown, and only it. Tiling: its gaps; the rules stay.
click_named - Defaults
click_named - Apply
check "Tiling: no workspaceGaps"            poll conf_is workspaceGaps ""
check "  the rules untouched"               eval '[[ $(conf forWindow) == *pickme* ]]'
check "  workspace 2's screen untouched"    conf_is workspaceOutputs "2=Virtual-1, 4=DP-9"
# Window Rules: the shipped rules back; workspace 3's floating rule is the Workspaces tab's.
open_tab "Window Rules"
click_named - Defaults
click_named - Apply
check "Window Rules: the picked rule gone"  poll eval '[[ $(conf forWindow) != *pickme* ]]'
check "  workspace 3's rule kept"           eval '[[ $(conf forWindow) == *\[workspace=\"^3\$\"\]\ floating\ enable* ]]'
# Workspaces: no screens set, no floating workspace; with the shipped rules, forWindow leaves kwinrc.
open_tab "Workspaces"
click_named - Defaults
click_named - Apply
check "Workspaces: no workspaceOutputs"     poll conf_is workspaceOutputs ""
check "  no forWindow (the default)"        conf_is forWindow ""
check "no floatingWorkspaces"               conf_is floatingWorkspaces ""
check "no invariant failures or errors"     clean_log
finish
