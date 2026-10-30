#!/usr/bin/env bash
# needs: plugin
# The mouse with the kwini3helper plugin loaded (plugin/framefocus.cpp; its frame focus is tested in
# 54-frame.sh), driven by real input. Window move and resize are KWin's own, stock: Meta+left-drag
# moves, Meta+right-drag resizes; a tiled window's Meta+left-drag is the helper's tiling drag. The plugin's mouse chords (Meta+Shift+drag moved) were dropped on
# 2026-10-24 (docs/plan.md, Scope); a [kwin-i3-mouse] entry left in kwinrc does nothing.
source "$(dirname "$0")/lib.sh"
clicks=$KI3_TMP/clicks
plugin_loaded() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins | grep -q '"kwini3helper"'; }
saw() { [[ "$(tr "\n" " " 2>/dev/null < "$clicks")" == "$1" ]]; }      # the client's clicks, in order
saw_nothing() { [[ ! -s $clicks ]]; }
centre() { local g; g=$(geom "$1"); local x=${g%%,*} r=${g#*,}; local y=${r%% *} s=${r#* }; echo "$((x + ${s%x*} / 2)) $((y + ${s#*x} / 2))"; }
moved_by() {   # moved_by <caption> <x,y before> <dx> <dy>: the frame's top left moved by exactly that
    local g; g=$(geom "$1"); local x=${g%%,*} r=${g#*,}; local y=${r%% *}
    [[ "$x,$y" == "$((${2%,*} + $3)),$((${2#*,} + $4))" ]]
}
# A slow drag, 20 ms between events: lib.sh's sdrag sends them back to back, and then GTK never
# reports the release (seen 2026-10-22), which the pass-through checks below need.
sdrag() {   # sdrag <mods> <button> x1 y1 x2 y2
    local -a mods cmds; local k s
    IFS=+ read -ra mods <<<"$1"
    local b=$2 x1=$3 y1=$4 x2=$5 y2=$6
    cmds+=("abs $x1 $y1" "wait 30")
    for k in "${mods[@]}"; do cmds+=("key ${EVDEV[$k]} down" "wait 20"); done
    cmds+=("btn $b down" "wait 20")
    for s in 1 2 3 4; do cmds+=("abs $((x1 + (x2 - x1) * s / 4)) $((y1 + (y2 - y1) * s / 4))" "wait 20"); done
    cmds+=("btn $b up" "wait 20")
    for ((k = ${#mods[@]} - 1; k >= 0; k--)); do cmds+=("key ${EVDEV[${mods[k]}]} up" "wait 20"); done
    "$INJECT" "${cmds[@]}"
}
pos() { local g; g=$(geom "$1"); echo "${g%% *}"; }
size() { local g; g=$(geom "$1"); echo "${g#* }"; }

kwriteconfig6 --file kwinrc --group kwin-i3-mouse --key 'Meta+Shift+Left' Move   # a leftover, ignored
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
check "the plugin is loaded"                plugin_loaded

# 1. Meta+left-drag (KWin's own) moves a window by exactly the drag; the window never sees the click.
client --title w --size 600x400 --clicks "$clicks"
read -r cx cy < <(centre w); p0=$(pos w); s0=$(size w)
sdrag Meta left "$cx" "$cy" $((cx + 100)) $((cy + 60))
check "Meta+drag moved w by (100,60)"       poll moved_by w "$p0" 100 60
check "w kept its size"                     [ "$(size w)" == "$s0" ]
check "w saw no click"                      saw_nothing

# 2. Meta+Shift+left-drag no longer moves, the leftover chord entry notwithstanding: the click
#    reaches the window.
read -r cx cy < <(centre w); p0=$(pos w)
sdrag Meta+Shift left "$cx" "$cy" $((cx + 100)) $((cy + 60))
check "w saw that press and release"        poll saw "press 1 release 1 "
check "Meta+Shift+drag did not move w"      [ "$(pos w)" == "$p0" ]

# 3. Meta+right-drag resizes (KWin's own).
: > "$clicks"
read -r cx cy < <(centre w); s0=$(size w)
sdrag Meta right $((cx + 200)) "$cy" $((cx + 280)) "$cy"
resized() { [[ "$(size w)" != "$s0" ]]; }
check "Meta+right-drag resized w"           poll resized

# 4. A plain click and a Ctrl+Shift click in the client reach it (the plugin takes no press).
: > "$clicks"
read -r cx cy < <(centre w)
sdrag "" left "$cx" "$cy" "$cx" "$cy"
check "a plain click reached w"             poll saw "press 1 release 1 "
: > "$clicks"
sdrag Ctrl+Shift left "$cx" "$cy" "$cx" "$cy"
check "Ctrl+Shift+click reached w"          poll saw "press 1 release 1 "

# 5. A Meta+drag that starts on the title bar (the test KWin has Breeze's) moves too.
read -r cx cy < <(centre w); p0=$(pos w); ty=${p0#*,}
sdrag Meta left "$cx" $((ty + 10)) $((cx - 50)) $((ty + 40))
check "a title-bar Meta+drag moved w"       poll moved_by w "$p0" -50 30
kclose w

# 6. With kwin-i3: a tiled window Meta+dragged is i3's tiling drag (decision C,
#    docs/records/spec-tiled-look.md; 86-tiling-drag.sh): dropped on a's left side, it goes before a and
#    stays tiled.
load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 640 360
client --title a; client --title b --clicks "$clicks"
check "a | b"                               wait_tree 1 "H[a b*]"
: > "$clicks"
m=$(mark)
sdrag Meta left 960 360 60 360
check "Meta+drag of tiled b: a tiling drag" wait_log '^.{9}DRAG dropped sibling left' "$m"
check "b before a, still tiled"             wait_tree 1 "H[b* a]" "$m"
check "b saw nothing"                       saw_nothing

check "no invariant failures or errors"     clean_log
finish
