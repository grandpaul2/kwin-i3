#!/usr/bin/env bash
# needs: xwayland
# Windows kwin-i3 doesn't manage (tooltips, notifications, OSDs, panel popups, dialogs) coming and
# going change nothing you can see: not the focus, not the pointer, not what a monitor shows
# (seen: a tray popup closing at once, the pointer jumping after the start menu).
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
# kept_out <title>: a window of kwin-i3's put on two desktops, which leaves the tree until it is on
# one (§3 R13; a sticky one stays in it, floating).
kept_out() {
    client --title "$1"
    kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") w.desktops = [workspace.desktops[0], workspace.desktops[1]]; });" >/dev/null
    poll eval '[[ "$(tree 1)" != *"'"$1"'"* ]]' || echo "    kept_out: $1 still in the tree" >&2
}
unchanged() { local now; now=$(snap); [[ "$now" == "$1" ]] || { echo "    was: $1"; echo "    now: $now"; return 1; }; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 300 300
client --title a
check "a on the left monitor"               wait_tree 1 "H[a*]"

# 1. The pointer parked on the right monitor (empty there): i3's crossing gives the focus to that
#    empty workspace (§5 B2), and each kind comes and goes.
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
check "3. the popup closed: kwin-i3's focus is back (the empty workspace under the pointer, no window)" poll active_is none

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

# 5. A window kept out of the tree has the focus (one on two desktops; a sticky one, Yakuake's kind,
#    is in the tree, and so is an X11 dialog): a notification closing leaves it the focus.
key "Workspace 1"
check "5. back on 1 (a)"                    poll active_is a
kept_out dlg
activate dlg
check "5. the window kept out is active"      poll active_is dlg
before=$(snap)
come_and_go notification 300x100+1700+400 --no-input
check "5. a notification came and went: it keeps the focus" unchanged "$before"
kclose dlg
check "5. it closed: a has the focus"       poll active_is a

# 6. A monitor switched to an empty desktop by something else (the Overview, Plasma's pager): a
#    notification closing doesn't switch it back.
kjs 'workspace.setCurrentDesktopForScreen(workspace.desktops[4], workspace.screens[0]);' >/dev/null
check "6. the left monitor shows 5 (switched outside kwin-i3)" poll eval '[[ "$(shown)" == *"Virtual-0=5"* ]]'
before=$(snap)
come_and_go notification 300x100+1700+400 --no-input
check "6. a notification came and went: the left still shows 5" unchanged "$before"

# 7. Keys with a window kwin-i3 doesn't manage active (one on two desktops standing in;
#    KRunner's kind, override-redirect, holds every key, 33-own-keys): one that leaves
#    kwin-i3's focus where it was takes nothing; one that moves it does, as in i3.
key "Workspace 1"
check "7. back on 1 (a)"                    poll active_is a
point 300 300; sleep 0.3
client --title e
check "7. a, e on 1"                        wait_tree 1 "H[a e*]"
key "Focus Left"
check "7. a focused"                        poll active_is a
# The pointer stays on the left, over a (parked on the right it would focus that monitor).
kept_out dlg2
activate dlg2
check "7. the window kept out is active"      poll active_is dlg2
before=$(snap)
key "Split H"; sleep 0.3
check "7. Split H: it keeps the focus"      unchanged "$before"
key "Grow Width"; sleep 0.3
check "7. Grow Width: it keeps the focus"   unchanged "$before"
key "Focus Right"
check "7. Focus Right moves kwin-i3's focus to e: e has it" poll active_is e
kclose dlg2

check "no invariant failures or errors"     clean_log
finish
