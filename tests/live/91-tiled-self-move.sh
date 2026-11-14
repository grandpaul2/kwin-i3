#!/usr/bin/env bash
# needs: xwayland
# needs: plugin
# Probe (item 96 (e), never merged): a tiling window KWin moves to the other output after its
# first pass stays on its workspace, as i3 ignores a tiling window's placement from outside.
# A: a borderless X11 window (Motif hints) moving itself. B: a decorated X11 window on a hidden
# workspace moving itself. C: KWin's Move to Screen of a tiling window. D: Move to Screen of a
# tiling parent with a modal dialog. E: Move to Screen of a floating window (followed).
source "$(dirname "$0")/lib.sh"
xc=$KI3_TMP/xc.py
cat >"$xc" <<'PY'
import os, sys, time
from Xlib import X, display
d = display.Display(); s = d.screen()
name, borderless, go, tx = sys.argv[1], sys.argv[2] == "1", sys.argv[3], int(sys.argv[4])
win = s.root.create_window(100, 100, 400, 300, 0, s.root_depth, X.InputOutput, X.CopyFromParent,
                           background_pixel=s.white_pixel, event_mask=X.StructureNotifyMask)
win.set_wm_name(name); win.set_wm_class(name, name)
win.change_property(d.intern_atom("_NET_WM_NAME"), d.intern_atom("UTF8_STRING"), 8, name.encode())
if borderless:
    hints = d.intern_atom("_MOTIF_WM_HINTS")
    win.change_property(hints, hints, 32, [2, 0, 0, 0, 0])      # MWM_HINTS_DECORATIONS, none
win.map(); d.flush()
while not os.path.exists(go): time.sleep(0.05)
win.configure(x=tx, y=100); d.flush()
while True: d.next_event()
PY
info() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name + \" desks=\" + w.desktops.map(function (k) { return workspace.desktops.indexOf(k) + 1; }).join(\",\") + \" tile=\" + (w.tile !== null) + \" \" + w.frameGeometry.x + \",\" + w.frameGeometry.y + \" \" + w.frameGeometry.width + \"x\" + w.frameGeometry.height); })"; }
start() { python3 "$xc" "$1" "$2" "$KI3_TMP/go-$1" "$3" >/dev/null 2>&1 & poll _has_window "$1"; }
go() { echo "    before: $1 $(info $1)"; touch "$KI3_TMP/go-$1"; sleep 2; echo "    after:  $1 $(info $1)"; }
mts() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.sendClientToScreen(w, workspace.screens[w.output === workspace.screens[0] ? 1 : 0]); })" >/dev/null; }
load_kwin_i3; wait_log 'kwin-i3 loaded$'

# A: borderless, shown, tiled beside another
key "Workspace 1"
client --title oa --size 300x200 --color blue; poll _has_window oa
start sa 1 1480
check "A: tiled beside oa" wait_tree 1 "H[oa sa*]"
go sa
check "A: still on workspace 1" eval '[[ "$(tree 1)" == *sa* ]]'
check "A: back on Virtual-0, desktop 1" poll eval '[[ "$(info sa)" == "Virtual-0 desks=1 "* ]]'

# B: decorated, its workspace hidden
key "Workspace 3"
client --title ob --size 300x200 --color blue; poll _has_window ob
start sb 0 200
check "B: tiled beside ob" wait_tree 3 "H[ob sb*]"
key "Workspace 4"
check "B: 3 hidden" wait_tree 4 "H[]*"
go sb
check "B: still on workspace 3" eval '[[ "$(tree 3)" == *sb* ]]'
check "B: on desktop 3 alone" poll eval '[[ "$(info sb)" == *" desks=3 "* ]]'

# B2: decorated, tiled while its workspace is hidden (moved there), then moving itself
key "Workspace 4"
start sb2 0 200
check "B2: on 4" wait_tree 4 "H[sb2*]"
key "Move to Workspace 3"
check "B2: moved to hidden 3" wait_tree 3 "H[ob sb sb2]"
sleep 1
go sb2
echo "    B2 trees: 3 $(tree 3) | 4 $(tree 4)"
check "B2: still on workspace 3" eval '[[ "$(tree 3)" == *sb2* ]]'
check "B2: on desktop 3 alone" poll eval '[[ "$(info sb2)" == *" desks=3 "* ]]'

# C: Move to Screen of a tiling window
key "Workspace 5"
client --title oc --size 300x200 --color blue; poll _has_window oc
client --title sc --size 300x200 --color red; poll _has_window sc
check "C: tiled beside oc" wait_tree 5 "H[oc sc*]"
echo "    C before: sc $(info sc)"
mts sc; sleep 2; echo "    C after:  sc $(info sc)"
check "C: Move to Screen put back: on workspace 5" eval '[[ "$(tree 5)" == *sc* ]]'
check "C: on desktop 5 alone" poll eval '[[ "$(info sc)" == *" desks=5 "* ]]'

# D: a tiling parent with a modal dialog
key "Workspace 6"
client --title pd --size 400x300 --color red --dialog; poll _has_window "pd dialog"
sleep 1; echo "    D: tree 6 $(tree 6)"
mts pd; sleep 2
echo "    D: pd $(info pd) | dialog $(info 'pd dialog')"
check "D: parent on workspace 6" eval '[[ "$(tree 6)" == *pd* ]]'
check "D: dialog with its parent" eval '[[ "$(tree 6)" == *pd_dialog* ]]'

# E: a floating window is KWin's
key "Workspace 7"
client --title fe --size 300x200 --color green; poll _has_window fe
key "Floating Toggle"; sleep 1
echo "    E before: fe $(info fe)"
mts fe; sleep 2; echo "    E after:  fe $(info fe)"
check "E: floating Move to Screen followed" eval '[[ "$(tree 7)" != *fe* ]]'

grep -E 'DESKTOP|OUTPUT|CROSSING|DROP|CLOSE' "$KI3_LOG" | sed 's/^/    log: /'
check "no invariant failures or errors" clean_log
finish
