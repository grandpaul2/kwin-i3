#!/usr/bin/env bash
# needs: plugin
# timing: alone
# Probe (OPEN.md item 120): the helper tests the committed quickTileMode, which a Wayland client
# takes only on its ack. A window tiled by kwin-i3 while its client is stopped: does a Meta press
# on it still start the tiling drag (G1), or does it fall to KWin's own move?
source "$(dirname "$0")/lib.sh"
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })"; }
frame() { on "$1" 'var g = w.frameGeometry; log(Math.round(g.x + g.width / 2) + " " + Math.round(g.y + g.height / 2) + " " + g.x + "," + g.y + " " + g.width + "x" + g.height + " tile=" + (w.tile !== null));'; }
tiles() { busctl --user call org.kde.KWin /kwini3helper/pointer net.local.kwini3helper.Pointer Windows | python3 -c 'import sys,json,ast; t=sys.stdin.read().split(" ",1)[1]; [print("    probe", w["caption"], "committed", w["tiled"], "requested", w["requested"], w["frame"]) for w in json.loads(ast.literal_eval(t)) if w["caption"] in ("a","b")]'; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME '
client --title a
client --title b --color blue
check "a, b side by side" wait_tree 1 "H[a b*]"

# Control: b floated and tiled again, answering: a Meta drag of b onto a's left drops it there.
key "Floating Toggle"
check "b floats" wait_tree 1 "H[a] ~b*"
key "Floating Toggle"
check "b tiles again" wait_tree 1 "H[a b*]"
sleep 0.5
echo "    control b: $(frame b)"
tiles
m=$(mark)
read -r cx cy _ <<<"$(frame b)"
drag Meta left "$cx" "$cy" 100 360
sleep 1
echo "    control tree: $(tree 1)"
after "$m" | grep -E '^.{9}(TREE|FLOAT|DROP|DRAG)' | head -5 | sed 's/^/    /'
check "control: the tiling drag moved b left of a" wait_tree 1 "H[b* a]"

# The case: b floated, stopped, then tiled by the key: requested Custom, committed not yet.
key "Floating Toggle"
check "b floats" wait_tree 1 "H[a] ~b*"
echo "    floated tree: $(tree 1)"
sleep 0.5
bpid=$(pgrep -f "testclient.py --title b" | head -1)
kill -STOP "$bpid"
key "Floating Toggle"
sleep 0.5
echo "    stopped tree: $(tree 1)"
echo "    stopped b: $(frame b)"
tiles
m=$(mark)
read -r cx cy _ <<<"$(frame b)"
drag Meta left "$cx" "$cy" 100 360
sleep 1
echo "    after drag tree: $(tree 1)"
echo "    after drag b: $(frame b)"
after "$m" | grep -E '^.{9}(TREE|FLOAT|DROP|DRAG|MOVE)' | head -8 | sed 's/^/    /'
check "stopped: the tiling drag moved b left of a" wait_tree 1 "H[b* a]"
check "stopped: nothing floated" eval "! after $m | grep -qE '^.{9}FLOAT '"
kill -CONT "$bpid"
finish
