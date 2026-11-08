#!/usr/bin/env bash
# needs: xwayland
# Probe (never merged): unmanageFrom's write-back for X11 windows. A: a fullscreen X11 window
# whose tile a newcomer splits keeps covering its output (and the same for Wayland). B: an X11
# window on a hidden workspace whose tiles are rebuilt. C: an X11 window leaving for a workspace
# on the other output.
source "$(dirname "$0")/lib.sh"
info() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name + \" fs=\" + w.fullScreen + \" tile=\" + (w.tile !== null) + \" \" + w.frameGeometry.x + \",\" + w.frameGeometry.y + \" \" + w.frameGeometry.width + \"x\" + w.frameGeometry.height); })"; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
x11() { GDK_BACKEND=x11 "$root/tools/testclient.py" --title "$1" >/dev/null 2>&1 & poll _has_window "$1"; }
tiled_at() { [[ "$(geom "$1")" == "$(after 0 | grep -E "^.{9}TILE $1 -> " | tail -1 | sed 's/.* -> //')" ]]; }
load_kwin_i3; wait_log 'kwin-i3 loaded$'
# A
x11 x
check "A: x tiled" wait_tree 1 "H[x*]"
on x 'w.fullScreen = true;'
check "A: x fullscreen" wait_tree 1 "H[x*!]"
client --title b
check "A: b behind" wait_tree 1 "H[x*! b]"
sleep 1; echo "    A x11: $(info x)"
check "A: x11 x still covers Virtual-0" eval '[[ "$(info x)" == *" 0,0 1280x720" ]]'
key "Workspace 3"
client --title w
check "A: w tiled" wait_tree 3 "H[w*]"
on w 'w.fullScreen = true;'
check "A: w fullscreen" wait_tree 3 "H[w*!]"
client --title c
check "A: c behind" wait_tree 3 "H[w*! c]"
sleep 1; echo "    A wayland: $(info w)"
check "A: wayland w still covers Virtual-0" eval '[[ "$(info w)" == *" 0,0 1280x720" ]]'
# B
key "Workspace 5"
x11 h
check "B: h tiled on 5" wait_tree 5 "H[h*]"
key "Workspace 7"
client --title n
check "B: n on 7" wait_tree 7 "H[n*]"
key "Move to Workspace 5"
check "B: 5 rebuilt while hidden" wait_tree 5 "H[h n]"
echo "    B hidden: $(info h)"
key "Workspace 5"
sleep 1; echo "    B shown:  $(info h)"
check "B: h in its tile when shown" poll tiled_at h
# C
key "Focus Left"
key "Move to Workspace 2"
check "C: h on 2" wait_tree 2 "H[h]"
sleep 1; echo "    C: $(info h)"
check "C: h on Virtual-1 in its tile" eval '[[ "$(info h)" == Virtual-1* ]] && tiled_at h'
grep -E 'GEOM (x|h) ' "$KI3_LOG" | sed 's/^/    log: /'
check "no invariant failures or errors" clean_log
finish
