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

# Round 3: Meta+Shift+3 with a modal dialog up (focus is always on the dialog), to a hidden
# workspace with windows on the other monitor. KWin moves the parent along with its dialog and,
# for a moment, gives both two desktops: kwin-i3 took that for "made sticky", dropped and
# re-adopted them, and dropping by w.tile (null on a hidden desktop) left the parent listed but
# never placed: "not in its tile", and an untiled window, on the wrong monitor, when shown.
key "Workspace 6"
check "Meta+6 (from the second monitor): 3 is hidden there now" wait_tree 6 "H[]*"
key "Workspace 1"
client --title m --dialog
check "m and its dialog on workspace 1"     poll eval '[[ "$(tree 1)" == "H[m] ~m_dialog"* ]]'
key "Move to Workspace 3"
check "m joined hidden workspace 3"         poll eval '[[ "$(tree 3)" == "H[a b m]"* ]]'
check "no invariant failures (modal parent moved)" clean_log
key "Workspace 3"
check "Meta+3: m has the right third of the second monitor" geom_is m "2133,0 427x720"
check "and still none"                      clean_log
finish
