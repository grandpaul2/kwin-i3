#!/usr/bin/env bash
# timing: alone
# needs: plugin
# Probe (docs/testing.md P4, Paul's go 2026-10-29): does focus follow the mouse across two tiled
# windows with title bars and gaps? Paul's capture 2026-10-29_013145.657: the pointer entered
# System Settings six times beside Firefox and KWin never activated it. As there: title bars,
# gaps 4 and 2, a client drawing its own frame on the right (its input margin past its frame, as
# Firefox's), crossings both ways, and a Move Right under a pointer that stays.
source "$(dirname "$0")/lib.sh"
term() { alacritty --title "$1" -o "colors.primary.background=\"$2\"" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
set_key() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5; }
active() { kjs "log(workspace.activeWindow ? workspace.activeWindow.caption : 'none')"; }
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry; log(Math.round(f.x)+','+Math.round(f.y)+' '+Math.round(f.width)+'x'+Math.round(f.height)); } });"; }
# glide x1 x2 y: the pointer in 4 px steps, as a hand.
glide() {
    local x=$1 to=$2 y=$3 s; local -a c=()
    s=$(( to > x ? 4 : -4 ))
    while (( (s > 0 && x < to) || (s < 0 && x > to) )); do c+=("abs $x $y" "wait 8"); x=$((x + s)); done
    "$INJECT" "${c[@]}" "abs $to $y" "wait 300"
}
trace() { echo "    active $(active); A $(fc A)  R $(fc R)"; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
set_key tiledLook titlebars
set_key gapsInner 4
set_key gapsOuter 2
term A "#ff0000"
client --title R --csd
check "A | R"                               poll eval '[[ "$(tree 1)" == *"A R"* ]]'
trace

events() { busctl --user --json=short call org.kde.KWin /kwini3helper/pointer net.local.kwini3helper.Pointer Events | python3 -c 'import json,sys; [print(e) for e in json.load(sys.stdin)["data"][0][-int(sys.argv[1]):]]' "${1:-30}"; }

# 1. From R's middle into A's, a plain crossing; then where KWin's focus went, step by step.
point 960 360; sleep 0.3
m=$(mark)
glide 960 320 360
check "1. R -> A: A focused"                poll eval '[[ "$(active)" == A ]]'
echo "    active: $(active)"
echo "    activations: $(after "$m" | grep -E '^.{9}ACTIVE' | cut -c10- | tr '\n' '|')"
events 30 | sed 's/^/    ev /'
# 2. Back into R through its margin.
m=$(mark)
glide 320 960 360
check "2. A -> R: R focused"                poll eval '[[ "$(active)" == R ]]'
events 30 | sed 's/^/    ev /'
finish
