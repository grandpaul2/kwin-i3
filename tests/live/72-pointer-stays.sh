#!/usr/bin/env bash
# needs: xwayland
# The pointer follows focus only when focus changes monitor (i3's mouse_warping output), never
# because a window closed on the monitor the pointer is on (Paul, 2026-10-25: closing the start
# menu sent the pointer to the middle of the left monitor). Virtual-0 at x 0, Virtual-1 at x 1280.
# The panel popup is a stand-in (tools/popupclient.py: the test KWins have no Plasma panel).
source "$(dirname "$0")/lib.sh"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
cursor_x() { kjs 'log(Math.round(workspace.cursorPos.x))'; }
cursor_right() { (( $(cursor_x) >= 1280 )); }
cursor_left() { (( $(cursor_x) < 1280 )); }
steady_right() { local i; for i in 1 2 3 4; do cursor_right || return 1; sleep 0.2; done; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 300 300
client --title a
client --title b
check "a, b on the left monitor"            wait_tree 1 "H[a b*]"

# 1. The pointer parked on the right monitor (empty: nothing to focus there); a panel popup opens
#    and closes there. Focus never left b: the pointer stays.
point 1900 600
sleep 0.3
check "b keeps the focus (nothing under the pointer)" active_is b
python3 -I "$root/tools/popupclient.py" --title pop --geometry 300x200+1700+400 >/dev/null 2>&1 & pid=$!
poll _has_window pop
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "pop") workspace.activeWindow = w; });' >/dev/null
check "the popup is active"                 poll active_is pop
kill "$pid"; poll _no_window pop
check "closed: b has the focus again"       poll active_is b
check "the pointer stayed on the right monitor" steady_right

# 2. The focused window closed by its key, the pointer still on the right: focus goes to a, on the
#    same monitor as before, so the pointer stays (i3 compares the monitors, not the pointer's).
m=$(mark)
key "Close"
check "b closed: a has the focus"           wait_tree 1 "H[a*]" "$m"
check "the pointer stayed again"            steady_right

# 3. Focus that does change monitor still brings the pointer: Meta+2 (workspace 2, right), then
#    Meta+1 back to the left.
point 1000 300
check "hovering a"                          poll active_is a
key "Workspace 2"
check "Meta+2: the pointer goes to the right monitor" poll cursor_right
key "Workspace 1"
check "Meta+1: and back to the left"        poll cursor_left
check "a has the focus"                     poll active_is a

# 4. Focus moved by the mouse is where the pointer is: hover a window on the right, then a window
#    closes there; nothing jumps.
key "Workspace 2"
client --title c
check "c on the right monitor"              wait_tree 2 "H[c*]"
client --title d
check "c, d on the right"                   wait_tree 2 "H[c d*]"
point 1500 300
check "hovering c focuses it"               poll active_is c
point 300 300
check "hovering a (left) focuses it"        poll active_is a
point 1500 300
check "back on c"                           poll active_is c
kclose d
check "d closed: c keeps the focus"         poll active_is c
check "the pointer stayed on the right"     steady_right

check "no invariant failures or errors"     clean_log
finish
