#!/usr/bin/env bash
# Desktop changes, the harder cases (docs/spec-desktop-changes.md; the change review's findings
# 2, 3 and its test gaps): a floating window and a layout on the desktops that move, the removed
# desktop shown on the second monitor, two removals back to back, a desktop inserted in the middle.
source "$(dirname "$0")/lib.sh"
on_desk() { kjs "workspace.windowList().forEach(function (w) { if (w.normalWindow && !w.deleted && w.caption.length === 1) log(w.caption + '=' + (workspace.desktops.indexOf(w.desktops[0]) + 1)); });" | sort | tr '\n' ' '; }
shows() { kjs 'workspace.screens.forEach(function (s) { log(s.name + "=" + (workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1)); });' | tr '\n' ' '; }
distinct() { local a b; read -r a b <<<"$(shows)"; [[ ${a#*=} != "${b#*=}" ]] || { echo "    both show ${a#*=}"; return 1; }; }
desk_id() { kjs "log(workspace.desktops[$1 - 1].id)"; }
rm_desk() { busctl --user call org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager removeDesktop s "$(desk_id "$1")"; }
xy() { local g; g=$(geom "$1"); echo "${g%% *}"; }
side_by_side() {   # $1 left of $2, same top, same size
    local g1 g2; g1=$(geom "$1"); g2=$(geom "$2")
    local x1=${g1%%,*} x2=${g2%%,*} r1=${g1#*,} r2=${g2#*,}
    [[ ${r1%% *} == "${r2%% *}" && ${g1#* } == "${g2#* }" && $x1 -lt $x2 ]] || { echo "    $1 at $g1, $2 at $g2"; return 1; }
}
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "Virtual-0 shows 1, Virtual-1 shows 2" poll eval '[[ "$(shows)" == "Virtual-0=1 Virtual-1=2 " ]]'
key "Workspace 3"; client --title b; client --title c
check "b | c on workspace 3"                wait_tree 3 "H[b c*]"
key "Workspace 1"
key "Workspace 2"                           # where it lives: Virtual-1
client --title f --fixed --size 300x200
check "f floats on workspace 2"             poll eval '[[ "$(tree 2)" == *"~f"* ]]'

# 1. Desktop 2 removed while Virtual-1 shows it. KWin gives Virtual-1 the desktop that took its
#    place (the old 3, b | c, whose home is Virtual-0) and moves f there. kwin-i3: f still
#    floating, in workspace 2 with b and c; b | c still side by side; the two monitors not on
#    one desktop.
m=$(mark)
rm_desk 2
check "rebuilt"                             wait_log '^.{9}DESKTOPS adopted again' "$m"
check "f floating in workspace 2"           poll eval '[[ "$(tree 2 "$m")" == *"~f"* ]]'
check "b c in workspace 2, side by side"    poll eval '[[ "$(tree 2 "$m")" == "H[b c"* ]] && side_by_side b c'
check "the monitors show different desktops" poll distinct
check "windows on their workspaces' desktops" poll eval '[[ "$(on_desk)" == "b=2 c=2 f=2 " ]]'

# 2. Two changes back to back (two pager actions), the second while the first rebuild waits for
#    the effect's answer (250 ms here, no plugins): the first rebuild has adopted the tiled
#    windows by the positions after the first change. Desktop 1 removed (b c f: 2 -> 1), then one
#    inserted at the front (b c f: 1 -> 2): a stale rebuild would leave f apart from b and c
#    (the review's finding 2).
m=$(mark)
rm_desk 1
wait_log '^.{9}DESKTOPS removed or moved' "$m"; sleep 0.08
kjs 'workspace.createDesktop(0, "front");' >/dev/null
check "rebuilt"                             wait_log '^.{9}DESKTOPS adopted again' "$m"
sleep 0.5
check "b c f together on workspace 2"       poll eval '[[ "$(tree 2)" == "H[b c"*"~f"* ]]'
check "  on its desktop"                    eval '[[ "$(on_desk)" == "b=2 c=2 f=2 " ]]'
check "the monitors show different desktops" distinct

# 3. A desktop inserted in the middle (position 1): workspace 2 becomes 3, with everything.
m=$(mark)
kjs 'workspace.createDesktop(1, "mid");' >/dev/null
check "rebuilt"                             wait_log '^.{9}DESKTOPS adopted again' "$m"
check "workspace 3: b c, f floating"        poll eval '[[ "$(tree 3 "$m")" == "H[b c"*"~f"* ]]'
check "on desktop 3"                        poll eval '[[ "$(on_desk)" == "b=3 c=3 f=3 " ]]'
check "b | c still side by side"            side_by_side b c
check "no invariant failures or errors"     clean_log
finish
