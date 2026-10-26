#!/usr/bin/env bash
# The fuzzer's I8 (seed 30, OPEN.md item 33): the focused monitor shows an empty workspace and is
# unplugged. As in i3 (randr.c move_content), that workspace moves to the remaining monitor, is
# shown there and keeps the focus; KWin then activated a window of the workspace it replaced,
# which stayed hidden: the active window on a desktop no monitor showed. This plain case KWin gets
# right by itself (the long trace's trigger was not pinned down; that trace, in git at 1a9e32d,
# is the red one): it guards that kwin-i3 keeps the empty workspace focused.
source "$(dirname "$0")/lib.sh"
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
active() { kjs 'var a = workspace.activeWindow; log(a ? a.caption : "none");'; }
shows() { kjs 'var s = workspace.screens[0]; log(s.name + " " + workspace.currentDesktopForScreen(s).x11DesktopNumber);'; }
settle() { sleep 1; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title a; settle
key "Split V"; settle
client --title b; settle
check "a over b on workspace 1"                wait_tree 1 "V[a b*]"
key "Focus Right"; settle
client --title c; settle
key "Workspace 4"; settle
point 1466 360; settle
client --title d; settle
key "Close"; settle
key "Workspace 4"; settle
check "workspace 4, empty, focused on the second monitor" wait_tree 4 "H[]*"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1; settle
check "the second monitor is gone"          poll screens_are 1
check "workspace 4 shown on the first"      poll eval '[[ "$(shows)" == "Virtual-0 4" ]]' || echo "    $(shows)"
sleep 1
echo "    active: $(active)"; grep -E "ACTIVE|SHOWN" "$KI3_LOG" | tail -4 | cut -c10-
check "  and keeps the focus: no window active" eval '[[ "$(active)" == "none" ]]'
check "still shown, a minute later too"     eval '[[ "$(shows)" == "Virtual-0 4" ]]'
check "no invariant failures or errors"     clean_log
finish
