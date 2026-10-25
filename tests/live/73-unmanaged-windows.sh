#!/usr/bin/env bash
# needs: xwayland
# Windows kwin-i3 doesn't manage (tooltips, notifications, OSDs, panel popups, dialogs) coming and
# going change nothing you can see: not the focus, not the pointer, not what a monitor shows
# (Paul, 2026-10-25: a tray popup closing at once, the pointer jumping after the start menu).
# Each case takes a snapshot, lets one come and go, and compares. The windows are stand-ins
# (tools/popupclient.py, X11 windows of each type: the test KWins have no Plasma shell).
# Virtual-0 at x 0, Virtual-1 at x 1280.
source "$(dirname "$0")/lib.sh"
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "none")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
shown() { kjs 'log(workspace.screens.map(function (s) { return s.name + "=" + (workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); }).join(" "))'; }
cursor() { kjs 'log(Math.round(workspace.cursorPos.x) + "," + Math.round(workspace.cursorPos.y))'; }
snap() { echo "active=$(active) cursor=$(cursor) shown=$(shown)"; }
stand_in() {    # stand_in <title> <type> <geometry> [--no-input]: open one; its pid in $sid
    python3 -I "$root/tools/popupclient.py" --title "$1" --type "$2" --geometry "$3" "${@:4}" >/dev/null 2>&1 & sid=$!
    poll _has_window "$1"
}
come_and_go() {   # come_and_go <type> <geometry> [--no-input]: one opens, then closes
    stand_in "x-$1" "$1" "$2" "${@:3}"; local p=$sid
    sleep 0.3; kill "$p"; poll _no_window "x-$1"; sleep 0.5
}
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
unchanged() { local now; now=$(snap); [[ "$now" == "$1" ]] || { echo "    was: $1"; echo "    now: $now"; return 1; }; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 300 300
client --title a
check "a on the left monitor"               wait_tree 1 "H[a*]"

# 1. Focus on a, the pointer parked on the right monitor (empty there): each kind comes and goes.
point 1900 600; sleep 0.3
before=$(snap)
for t in tooltip notification osd; do
    come_and_go "$t" 300x100+1700+400 --no-input
    check "1. a $t came and went: nothing changed" unchanged "$before"
done
come_and_go dialog 300x200+1700+300
activate a; point 1900 600; sleep 0.3; before=$(snap)
come_and_go popup 300x200+1700+300
check "1. a popup (not focused) came and went: nothing changed" unchanged "$before"

# 2. A panel popup has the focus: a tooltip, a notification, an OSD closing leave it open.
stand_in pop popup 300x200+1700+300; pop=$sid
activate pop
check "2. the popup is active"              poll active_is pop
before=$(snap)
for t in tooltip notification osd; do
    come_and_go "$t" 200x60+1750+620 --no-input
    check "2. a $t came and went: the popup keeps the focus" unchanged "$before"
done

# 3. The same with a window of kwin-i3's closing on the other monitor meanwhile.
point 300 300; sleep 0.3
client --title z
check "3. z beside a"                       wait_tree 1 "H[a z*]"
point 1900 600; sleep 0.3
activate pop
check "3. the popup is active again"        poll active_is pop
before=$(snap)
kclose z; sleep 0.5
check "3. z closed: the popup keeps the focus" unchanged "$before"
kill "$pop"; poll _no_window pop
check "3. the popup closed: kwin-i3's focus is back (a)" poll active_is a

# 4. An empty workspace has the focus (3 on the left), and a popup on the right: a tooltip closing
#    leaves the popup open. KWin's Switch to Screen would focus the desktop there: Plasma has a
#    desktop window on each monitor, so a stand-in one here (the test KWins have none).
stand_in desk desktop 1280x720+0+0 --no-input; desk=$sid
point 300 300; sleep 0.3
key "Workspace 3"
check "4. workspace 3, empty, on the left"  poll eval '[[ "$(shown)" == *"Virtual-0=3"* ]]'
point 1900 600; sleep 0.3
stand_in pop popup 300x200+1700+300; pop=$sid
activate pop
check "4. the popup is active"              poll active_is pop
before=$(snap)
come_and_go tooltip 200x60+1750+620 --no-input
check "4. a tooltip came and went: the popup keeps the focus" unchanged "$before"
kill "$pop"; poll _no_window pop
kill "$desk"; poll _no_window desk

# 5. A dialog (not kwin-i3's) has the focus: a notification closing leaves it with the focus.
key "Workspace 1"
check "5. back on 1 (a)"                    poll active_is a
stand_in dlg dialog 300x200+400+300; dlg=$sid
activate dlg
check "5. the dialog is active"             poll active_is dlg
before=$(snap)
come_and_go notification 300x100+1700+400 --no-input
check "5. a notification came and went: the dialog keeps the focus" unchanged "$before"
kill "$dlg"; poll _no_window dlg
check "5. the dialog closed: a has the focus" poll active_is a

# 6. A monitor switched to an empty desktop by something else (the Overview, Plasma's pager): a
#    notification closing doesn't switch it back.
kjs 'workspace.setCurrentDesktopForScreen(workspace.desktops[4], workspace.screens[0]);' >/dev/null
check "6. the left monitor shows 5 (switched outside kwin-i3)" poll eval '[[ "$(shown)" == *"Virtual-0=5"* ]]'
before=$(snap)
come_and_go notification 300x100+1700+400 --no-input
check "6. a notification came and went: the left still shows 5" unchanged "$before"

check "no invariant failures or errors"     clean_log
finish
