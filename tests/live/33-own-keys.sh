#!/usr/bin/env bash
# Meta+F and Meta+Shift+Q are kwin-i3's own keys, running KWin's own actions: a stock Plasma
# binds neither, and the test KWin's config doesn't either (docs/spec-own-keys.md).
source "$(dirname "$0")/lib.sh"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. Meta+F toggles fullscreen on the focused window; out of it, the window is back in its tile.
client --title A
client --title B
check "A and B tiled, B focused"            wait_tree 1 "H[A B*]"
check "B in the right half"                 geom_is B "640,0 640x720"
press Meta+F
check "Meta+F: B is fullscreen"             wait_tree 1 "H[A B*!]"
check "B fills the monitor"                 geom_is B "0,0 1280x720"
press Meta+F
check "Meta+F again: B is not"              wait_tree 1 "H[A B*]"
check "B back in its tile"                  geom_is B "640,0 640x720"

# 2. Meta+Shift+Q closes the focused window, and its neighbour takes the space.
press Meta+Shift+Q
check "Meta+Shift+Q: B is gone"             poll _no_window B
check "A alone, focused"                    wait_tree 1 "H[A*]"
check "A fills the monitor"                 geom_is A "0,0 1280x720"

# 3. KWin's action works on a window kwin-i3 doesn't manage (an ignored class) too.
client --title Y --app-id yakuake
check "Y is active"                         poll active_is Y
press Meta+Shift+Q
check "Meta+Shift+Q closes unmanaged Y"     poll _no_window Y
check "A is still there"                    _has_window A
check "no invariant failures or errors"     clean_log
finish
