#!/usr/bin/env bash
# The fuzzer's I1, shrunk: windows sent between hidden workspaces. On a hidden desktop KWin lists
# a window in a tile without placing it (no w.tile); rebuilding that root unmanaged by w.tile, so
# the window stayed listed, rode into a child tile when the root split, and was never managed
# again: kwin-i3's own check said "not in its tile". It must be clean, and right when shown.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
key "Workspace 2"
client --title a
key "Move to Workspace 3"
check "a on hidden workspace 3"             wait_tree 3 "H[a]"
client --title b
key "Move to Workspace 4"
check "b on hidden workspace 4"             wait_tree 4 "H[b]"
key "Focus Left"
key "Workspace 4"
check "Meta+4: b"                           wait_tree 4 "H[b*]"
key "Move to Workspace 3"
check "b joins a on hidden workspace 3"     wait_tree 3 "H[a b]"
check "no invariant failures or errors"     clean_log
key "Workspace 3"
check "Meta+3: both, side by side, on the second monitor" eval 'geom_is a "1280,0 640x720" && geom_is b "1920,0 640x720"'
check "still no invariant failures"         clean_log
finish
