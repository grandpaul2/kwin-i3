#!/usr/bin/env bash
# needs: plugin
# Mouse chords: the kwini3mouse KWin plugin (plugin/, docs/mouse-plugin-design.md), driven by real
# input. Paul's setup: Meta+Shift+left-sdrag moves, KWin's own Meta+left-sdrag move is off, KWin's
# Meta+right-sdrag resize stays.
source "$(dirname "$0")/lib.sh"
clicks=$KI3_TMP/clicks
plugin_loaded() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins | grep -q '"kwini3mouse"'; }
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

kwriteconfig6 --file kwinrc --group kwin-i3-mouse --key 'Meta+Shift+Left' Move
kwriteconfig6 --file kwinrc --group MouseBindings --key CommandAll1 Nothing
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
check "the plugin is loaded"                plugin_loaded

# 1. Meta+Shift+left-sdrag moves a window by exactly the drag, and the window never sees the click.
#    Shift is held all through: KWin's own move would drop the window into a custom tile on
#    release (seen 2026-10-22: a GTK window came back 636x712), and Alacritty crashed on it.
client --title w --size 600x400 --clicks "$clicks"
read -r cx cy < <(centre w); p0=$(pos w); s0=$(size w)
sdrag Meta+Shift left "$cx" "$cy" $((cx + 100)) $((cy + 60))
check "Meta+Shift+drag moved w by (100,60)" poll moved_by w "$p0" 100 60
check "w kept its size (no custom tile)"    [ "$(size w)" == "$s0" ]
check "w saw no click"                      saw_nothing

# 2. Plain Meta+left-sdrag no longer moves (CommandAll1=Nothing); the click reaches the window.
read -r cx cy < <(centre w); p0=$(pos w)
sdrag Meta left "$cx" "$cy" $((cx + 100)) $((cy + 60))
check "w saw that press and release"        poll saw "press 1 release 1 "
check "Meta+drag did not move w"            [ "$(pos w)" == "$p0" ]

# 3. Meta+right-sdrag still resizes (KWin's own, untouched).
: > "$clicks"
read -r cx cy < <(centre w); s0=$(size w)
sdrag Meta right $((cx + 200)) "$cy" $((cx + 280)) "$cy"
resized() { [[ "$(size w)" != "$s0" ]]; }
check "Meta+right-drag resized w"           poll resized

# 4. Chords that aren't bound pass through: Ctrl+Shift+click, and Meta+Shift+Ctrl+sdrag (extra
#    modifiers are a different chord).
: > "$clicks"
read -r cx cy < <(centre w); p0=$(pos w)
sdrag Ctrl+Shift left "$cx" "$cy" "$cx" "$cy"
check "Ctrl+Shift+click reached w"          poll saw "press 1 release 1 "
: > "$clicks"
sdrag Meta+Shift+Ctrl left "$cx" "$cy" $((cx + 100)) $((cy + 60))
check "Meta+Shift+Ctrl+drag reached w"      poll saw "press 1 release 1 "
check "and did not move it"                 [ "$(pos w)" == "$p0" ]

# 5. A sdrag that starts on the title bar (the test KWin has Breeze's) moves too.
read -r cx cy < <(centre w); p0=$(pos w); ty=${p0#*,}
sdrag Meta+Shift left "$cx" $((ty + 10)) $((cx - 50)) $((ty + 40))
check "a title-bar Meta+Shift+drag moved w" poll moved_by w "$p0" -50 30

# 6. A config change applies at once (KConfigWatcher, kwriteconfig6 --notify, no reconfigure).
kwriteconfig6 --notify --file kwinrc --group kwin-i3-mouse --key 'Meta+Shift+Left' --delete
kwriteconfig6 --notify --file kwinrc --group kwin-i3-mouse --key 'Meta+Alt+Left' Move
: > "$clicks"
read -r cx cy < <(centre w); p0=$(pos w)
sleep 0.3   # the watcher is asynchronous and has nothing to poll
sdrag Meta+Shift left "$cx" "$cy" $((cx + 40)) "$cy"
check "unbound now: Meta+Shift+click reached w" poll saw "press 1 release 1 "
sdrag Meta+Alt left "$cx" "$cy" $((cx + 40)) "$cy"
check "and Meta+Alt+drag moves instead"     poll moved_by w "$p0" 40 0
kwriteconfig6 --notify --file kwinrc --group kwin-i3-mouse --key 'Meta+Alt+Left' --delete
kwriteconfig6 --notify --file kwinrc --group kwin-i3-mouse --key 'Meta+Shift+Left' Move
kclose w

# 7. With kwin-i3: a tiled window Meta+Shift+dragged floats where it is dropped (plan, policies),
#    and a shortcut: chord runs a kwin-i3 action on the window under the pointer, which sees
#    neither the press nor the release.
load_kwin_i3
wait_log 'kwin-i3 loaded$'
point 640 360
client --title a --clicks "$clicks.a"; client --title b --clicks "$clicks"
check "a | b"                               wait_tree 1 "H[a b*]"
kwriteconfig6 --notify --file kwinrc --group kwin-i3-mouse --key 'Meta+Shift+Middle' 'shortcut:kwin-i3 Floating Toggle'
sleep 0.3
: > "$clicks"
point 213 360
m=$(mark)
sdrag Meta+Shift middle 213 360 213 360
check "Meta+Shift+middle on a floats a"     wait_log '^.{9}ACTION Floating Toggle' "$m"
check "a is floating"                       wait_log '^.{9}TREE 1 H\[b\*?\] ~a' "$m"
check "a saw neither press nor release"     [ ! -s "$clicks.a" ]
check "b saw nothing"                       saw_nothing
m=$(mark)
sdrag Meta+Shift left 960 360 860 300
check "Meta+Shift+drag of tiled b: a move"  wait_log '^.{9}DRAG end move b' "$m"
check "b floats"                            wait_log '^.{9}TREE 1 .*~b' "$m"
check "b saw nothing"                       saw_nothing

check "no invariant failures or errors"     clean_log
finish
