#!/usr/bin/env bash
# needs: xwayland
# Paul, 2026-10-25: "Show Panel Configuration" in the panel's menu did nothing
# (docs/bug-panel-config.md). Plasma turns Show Desktop on for its edit mode as the menu closes.
# The menu closing is a window removed, so kwin-i3 ran a passive focus pass; the pass found the
# desktop active, which it took for "nothing has the focus", and gave the focus back to the tile.
# Activating a window hidden by Show Desktop turns Show Desktop off (kwin activation.cpp), which
# ends Plasma's edit mode, and the configuration window went with it. While Show Desktop is on,
# the desktop holds the focus on purpose: a window going away must not move it.
# Stand-ins (tools/popupclient.py): a desktop window like Plasma's, a panel popup like the menu.
source "$(dirname "$0")/lib.sh"
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "none")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
showing() { busctl --user get-property org.kde.KWin /KWin org.kde.KWin showingDesktop | cut -d' ' -f2; }
showing_is() { [[ "$(showing)" == "$1" ]]; }
# KWin's D-Bus showDesktop(bool) lasts only while the caller stays on the bus (dbusinterface.cpp
# watches the service), and busctl leaves at once; the Show Desktop shortcut (a toggle) holds.
show_desktop() { showing_is "$1" || busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "Show Desktop"; poll showing_is "$1"; }
stand_in() {    # stand_in <title> <type> <geometry>: open one; its pid in $sid
    python3 -I "$root/tools/popupclient.py" --title "$1" --type "$2" --geometry "$3" >/dev/null 2>&1 & sid=$!
    poll _has_window "$1"
}
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
# The load settles first: its frame check answers a second after a load without the effect, and
# that answer activated the tile hidden by Show Desktop in case 1 (a load-time step, not the pass
# under test; traced 2026-10-25, OPEN.md).
wait_log '^.{9}FRAME '
stand_in desk desktop 1280x720+0+0; desk=$sid
point 300 300
client --title a
check "a tiles on the left"                 wait_tree 1 "H[a*]"

# 1. A popup has the focus (the panel's menu) and Show Desktop goes on; then the popup closes.
#    Show Desktop stays on and the desktop keeps the focus.
stand_in pop popup 300x200+100+400; pop=$sid
activate pop
check "1. the popup is active"              poll active_is pop
show_desktop true
check "1. Show Desktop on: the desktop is active" poll active_is desk
kill "$pop"; poll _no_window pop; sleep 0.5
check "1. the popup closed: Show Desktop is still on" showing_is true
check "1. the desktop still has the focus"  active_is desk
show_desktop false
check "1. Show Desktop off: a has the focus back" poll active_is a

# 2. Plasma's order: the popup closes, and Show Desktop goes on right after. Ten times, as the
#    two land either side of kwin-i3's pass (Paul saw it work twice in nine tries).
off=0
for i in 1 2 3 4 5 6 7 8 9 10; do
    stand_in pop popup 300x200+100+400; pop=$sid
    activate pop; poll active_is pop
    kill "$pop"; show_desktop true
    poll _no_window pop; sleep 0.3
    showing_is true || off=$((off + 1))
    show_desktop false; poll active_is a
done
check "2. popup closed then Show Desktop on, ten times: stayed on each time (went off $off times)" test "$off" -eq 0

# 3. A tile closing while Show Desktop is on: it stays on, and the other tile gets the focus
#    when it ends.
client --title b
check "3. b beside a"                       wait_tree 1 "H[a b*]"
show_desktop true
check "3. Show Desktop on: the desktop is active" poll active_is desk
kclose b; sleep 0.5
check "3. b closed: Show Desktop is still on" showing_is true
show_desktop false
check "3. Show Desktop off: a has the focus" poll active_is a

# 4. A click on the desktop with Show Desktop off (i3's root click, §5 B4, redo stage 2): the focus
#    goes to that output's workspace at once; the desktop doesn't keep the keyboard.
activate desk
check "4. the desktop clicked: a has the focus back" poll active_is a

kill "$desk"; poll _no_window desk
check "no invariant failures or errors"     clean_log
finish
