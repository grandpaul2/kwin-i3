#!/usr/bin/env bash
# needs: xwayland
# Probe (never merged): an X11 window fullscreen in its tile on the second monitor; the monitor
# is unplugged and plugged back. Does KWin's tile teardown give it its pre-tile size?
source "$(dirname "$0")/lib.sh"
info() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name + \" fs=\" + w.fullScreen + \" tile=\" + (w.tile !== null) + \" \" + w.frameGeometry.x + \",\" + w.frameGeometry.y + \" \" + w.frameGeometry.width + \"x\" + w.frameGeometry.height); })"; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key workspaceOutputs "2=Virtual-1"
load_kwin_i3; wait_log 'kwin-i3 loaded$'
key "Workspace 2"
GDK_BACKEND=x11 "$root/tools/testclient.py" --title x >/dev/null 2>&1 & poll _has_window x
check "x tiled on 2" wait_tree 2 "H[x*]"
on x 'w.fullScreen = true;'
check "x fullscreen" wait_tree 2 "H[x*!]"
sleep 1; echo "    before: $(info x)"
check "x in its tile, covering Virtual-1" eval '[[ "$(info x)" == "Virtual-1 fs=true tile=true 1280,0 1280x720" ]]'
mark0=$(mark)
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "unplugged" poll screens_are 1
sleep 2; echo "    unplugged: $(info x)"
check "x covers Virtual-0" eval '[[ "$(info x)" == *" 0,0 1280x720" ]]'
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "back" poll screens_are 2
sleep 3; echo "    replugged: $(info x)"
check "x covers an output" eval '[[ "$(info x)" == *" 0,0 1280x720" || "$(info x)" == *" 1280,0 1280x720" ]]'
after "$mark0" | grep -E 'GEOM x |REFIT x|FULLSCREEN x|TILE x' | sed 's/^/    log: /'
check "no invariant failures or errors" clean_log
finish
