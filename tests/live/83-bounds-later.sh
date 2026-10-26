#!/usr/bin/env bash
# needs: plugin
# Plain GTK 4 (the test client) keeps within the bounds KWin sent in its first configure, sized
# for the title bar it had then (spec-window-modes "why" 5). A first tile inside those bounds fits,
# so the bounds are stale only when a later tile is bigger: here a vertical split's lower half,
# then the whole monitor once its neighbour closes. It stayed 26 px short (OPEN.md item 32,
# fuzzer I10, seed 4).
source "$(dirname "$0")/lib.sh"
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry, c = w.clientGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height+' client '+c.x+','+c.y+' '+c.width+'x'+c.height); } });"; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a --color red
wait_tree 1 "H[a*]" >/dev/null
key "Split V"
client --title g --color blue
check "a over g"                            wait_tree 1 "V[a g*]"
check "g fits its half at once"             poll eval '[[ "$(fc g)" == "1,361 1278x358 client 1,361 1278x358" ]]' || echo "    g: $(fc g)"
check "  (inside the bounds: none asked)"   bash -c "! grep -qE '^.{9}BOUNDS g' '$KI3_LOG'"

kclose a
check "a closed: g fills the monitor"       poll eval '[[ "$(fc g)" == "1,1 1278x718 client 1,1 1278x718" ]]' || echo "    g: $(fc g)"
echo "    g now: $(fc g)"; grep -E "CLOSE a|TILE g|GEOM g|BOUNDS" "$KI3_LOG" | tail -6 | cut -c10- | cut -c1-200
check "  (by the bounds, logged)"           wait_log '^.{9}BOUNDS g'
check "no invariant failures or errors"     clean_log
finish
