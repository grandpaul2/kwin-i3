#!/usr/bin/env bash
# needs: plugin
# needs: xwayland
# Probe (item 101): a window floated by a rule (a title change) while its workspace is hidden
# floats at its own recorded size, as i3's floating_enable (con->geometry), not at its tile's.
source "$(dirname "$0")/lib.sh"
x11() { GDK_BACKEND=x11 "$root/tools/testclient.py" "$@" >/dev/null 2>&1 & }
act() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
floating() { [[ "$(tree "$2")" == *"~$1"* ]]; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key forWindow '[title="^renamed.$"] floating enable'
key "Reload Settings"

run() {   # run <name> <launcher> <home ws> <other ws>
    local n=$1 launch=$2 h=$3 o=$4 r=renamed$1
    key "Workspace $h"
    $launch --title "o$n" --size 500x300 --color blue
    poll _has_window "o$n"
    $launch --title "$n" --size 400x300 --color red --retitle "4:$r"
    poll _has_window "$n"
    check "$n tiled beside o$n"        wait_tree $h "H[o$n $n*]"
    local tile; tile=$(geom $n); echo "    $n tile: $tile"
    key "Workspace $o"
    check "ws $h hidden, $o shown"     wait_tree $o "H[]*"
    WAIT=12 check "rule floated $n while hidden" poll floating $r $h
    echo "    $n after float, hidden: $(geom $r)"
    check "$n given no new size while hidden" eval '[[ "$(geom $r)" == "$tile" ]]'
    key "Workspace $h"
    sleep 0.5
    echo "    $n after show: $(geom $r)  tree: $(tree $h)"
    check "$n shown: its own size, not its tile's" poll eval '[[ "$(geom $r)" == *" 400x328" ]]'
}
run x x11 1 3
run w client 4 5
check "no invariant failures or errors" clean_log
finish
