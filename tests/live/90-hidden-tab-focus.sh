#!/usr/bin/env bash
# Probe (OPEN.md item 82): which KWin mechanism activates a hidden tab right after kwin-i3 focuses
# a new window opened into T[f V[g]]'s V, with the pointer over the group.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
wait_log '^.{9}FRAME on'
point 20 20
client --title a
[[ -z ${PROBE_EARLY:-} ]] || point $PROBE_EARLY   # the pointer set before the group exists, then never moved
wait_tree 1 "H[a*]" >/dev/null
client --title f
key "Split V"
client --title g
key "Layout Tabbed"
key "Split V"
check "T[f V[g]]"                           wait_tree 1 "H[a T[f V[g*]]]"
read -r gx gy gw gh < <(geom g | tr ',x' '  ')
if [[ -n ${PROBE_EARLY:-} ]]; then :; elif [[ -n ${PROBE_PT:-} ]]; then point $PROBE_PT; else point $((gx + gw / 2)) $((gy + gh * ${PROBE_FY:-50} / 100)); fi
snap() {   # stacking order (bottom to top), each window's tile and geometry
    kjs 'var s = workspace.stackingOrder.filter(function (w) { return w.normalWindow; }).map(function (w) { return w.caption + (w.tile ? "[T" + Math.round(w.tile.absoluteGeometry.x) + "," + Math.round(w.tile.absoluteGeometry.y) + "]" : "[-]") + (w.active ? "*" : ""); }); log("STACK '$1' " + s.join(" "));' >/dev/null
}
m=$(mark)
snap pre
client --title h
check "T[f V[g h]]"                         wait_tree 1 "H[a T[f V[g h*]]]" "$m"
sleep 1
snap post
after "$m" | grep -E 'ACTIVE|STACK|STACK' | sed 's/^/    /'
key "Focus Left"
after "$m" | grep -E 'ACTIVE' | tail -3 | sed 's/^/    /'
finish
