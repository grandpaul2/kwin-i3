#!/usr/bin/env bash
# needs: xwayland
# needs: plugin
# Probe (never merged): an X11 window that moves itself onto the other output at open, before
# kwin-i3's first pass. A: assigned to hidden workspace 5, homed on the output it moves onto.
# B: no rule. C: a window opened fullscreen, moved later by Move to Screen (followed).
source "$(dirname "$0")/lib.sh"
xc=$KI3_TMP/xc.py
cat >"$xc" <<'PY'
import sys
from Xlib import X, Xatom, display
d = display.Display(); s = d.screen()
name, fs, move = sys.argv[1], sys.argv[2] == "1", sys.argv[3] == "1"
win = s.root.create_window(100, 100, 400, 300, 0, s.root_depth, X.InputOutput, X.CopyFromParent,
                           background_pixel=s.white_pixel, event_mask=X.StructureNotifyMask)
win.set_wm_name(name); win.set_wm_class(name, name)
win.change_property(d.intern_atom("_NET_WM_NAME"), d.intern_atom("UTF8_STRING"), 8, name.encode())
if fs:
    win.change_property(d.intern_atom("_NET_WM_STATE"), Xatom.ATOM, 32, [d.intern_atom("_NET_WM_STATE_FULLSCREEN")])
win.map(); d.flush()
if move:
    # As a GLFW game: mapped (KWin has adopted it), then centred on the other monitor at once.
    while d.next_event().type != X.MapNotify: pass
    win.configure(x=1280 + 200, y=100); d.flush()
while True: d.next_event()
PY
info() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name + \" desk=\" + (workspace.desktops.indexOf(w.desktops[0]) + 1) + \" fs=\" + w.fullScreen + \" \" + w.frameGeometry.x + \",\" + w.frameGeometry.y); })"; }
start() { python3 "$xc" "$@" >/dev/null 2>&1 & poll _has_window "$1"; sleep 1; }
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key workspaceOutputs "1=Virtual-0, 2=Virtual-1, 5=Virtual-1"
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key assign '[class="^sma$"] → 5'
load_kwin_i3; wait_log 'kwin-i3 loaded$'
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
check "Virtual-1 shows 2 (5 hidden there)" poll shows Virtual-1 2
# A
start sma 0 1
echo "    A: $(info sma) | trees 1 $(tree 1) 2 $(tree 2) 5 $(tree 5)"
check "A: on workspace 5" eval '[[ "$(tree 5)" == *sma* ]]'
check "A: not on workspace 2" eval '[[ "$(tree 2)" != *sma* ]]'
check "A: on desktop 5, Virtual-1" eval '[[ "$(info sma)" == "Virtual-1 desk=5"* ]]'
# B
start smb 0 1
echo "    B: $(info smb) | tree 1 $(tree 1)"
check "B: stays on workspace 1" eval '[[ "$(tree 1)" == *smb* ]]'
check "B: back on Virtual-0" eval '[[ "$(info smb)" == "Virtual-0 desk=1"* ]]'
# C
key "Workspace 3"
start smc 1 0
check "C: fullscreen on 3" wait_tree 3 "H[smc*!]"
sleep 1
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "smc") workspace.sendClientToScreen(w, workspace.screens[1]); })' >/dev/null
sleep 2; echo "    C: $(info smc)"
check "C: Move to Screen followed" eval '[[ "$(info smc)" == Virtual-1* ]] && [[ "$(tree 3)" != *smc* ]]'
grep -E 'DESKTOP|OUTPUT' "$KI3_LOG" | sed 's/^/    log: /'
check "no invariant failures or errors" clean_log
finish
