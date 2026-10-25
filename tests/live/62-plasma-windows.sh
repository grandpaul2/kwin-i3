#!/usr/bin/env bash
# needs: plugin
# Window modes, pieces (iii)+(iv) (docs/spec-window-modes.md): a workspace of Plasma windows
# (floatingWorkspaces), the floating mark kept by the effect (decision 5c), the frame on floating
# windows (frameOnFloating).
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
FLOAT_ACT=77,114,84
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
floating() { [[ "$(tree "$2")" == *"~$1"* ]]; }
form_set() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }
uuid() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(String(w.internalId)); })"; }
effect_floats() { local u; u=$(uuid "$1"); [[ -n $u ]] && busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -qF "$u"; }
pixel_is() { "$shot" capture Virtual-0 "$png" && "$shot" same "$png" "$1" "$2" "$3" 2; }

form_set floatingWorkspaces "3"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "frame on"                            wait_log '^.{9}FRAME on'

# 1. Workspace 3 opens Plasma windows: floating, its title bar, not kept above.
key "Workspace 3"
client --title p --color red
check "p opens floating on workspace 3"     poll floating p 3
check "  with its title bar"                prop_is p noBorder false
check "  not kept above (a Plasma window)"  prop_is p keepAbove false
check "  the effect knows it floats"        poll effect_floats p

# 2. Meta+Shift+Space: i3's mode, and back.
key "Floating Toggle"
check "p tiles"                             poll eval '! floating p 3'
check "  borderless"                        poll prop_is p noBorder true
key "Floating Toggle"
check "p floats again, its title bar"       poll prop_is p noBorder false

# 3. Moved to an i3 workspace it stays floating, and floats above as in i3; back, not above.
key "Move to Workspace 1"
check "p on workspace 1, floating"          poll floating p 1
check "  kept above there"                  poll prop_is p keepAbove true
key "Workspace 1"
key "Move to Workspace 3"
check "back on 3: not kept above"           poll prop_is p keepAbove false
key "Workspace 3"

# 4. A reload: p is still floating, by the effect's mark (it isn't kept above).
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded, with the effect's set"     wait_log '^.{9}ADOPTED with the effect' "$m"
check "p still floating"                    poll floating p 3 "$m"

# 5. A window opened on an i3 workspace tiles, as before.
key "Workspace 1"
client --title t --color blue
check "t tiles on workspace 1"              wait_tree 1 "H[t*]"

# 6. The frame on floating windows: p loses its title bar, the frame in the floating colours.
key "Workspace 3"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "p") workspace.activeWindow = w; });' >/dev/null
form_set frameOnFloating true
check "frameOnFloating: p borderless"       poll prop_is p noBorder true
g=$(geom p); px=${g%%,*}; r=${g#*,}; py=${r%% *}; s=${g#* }; ph=${s#*x}
check "  its frame, green, just left of it" poll pixel_is $((px - 1)) $((py + ph / 2)) $FLOAT_ACT
form_set frameOnFloating false
check "off: its title bar back"             poll prop_is p noBorder false
check "no invariant failures or errors"     clean_log
finish
