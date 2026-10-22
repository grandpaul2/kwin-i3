#!/usr/bin/env bash
# kwin-i3 loaded into a KWin that already has windows (a reload, or a login where a restored
# window came first): every window must end up managed, tiled or floating, none lost (the
# live-desktop review once saw a window left out).
source "$(dirname "$0")/lib.sh"
client --title a; client --title b
client --title fixed --fixed
client --title main --dialog
# Windows still appearing as kwin-i3 loads: KWin's stackingOrder can leave a new window out, and it
# came before the script, so no windowAdded follows (fault battery: this must not depend on luck).
"$root/tools/testclient.py" --title c >/dev/null 2>&1 &
"$root/tools/testclient.py" --title d >/dev/null 2>&1 &
sleep 0.15
load_kwin_i3
check "loaded"                              wait_log 'kwin-i3 loaded$'
all_in() {
    local t; t=$(tree 1); local w=" ${t//[\[\]*!]/ } "
    for c in a b c d main; do [[ $w == *" $c "* ]] || return 1; done
    [[ $w == *" ~fixed "* && $w == *" ~main_dialog "* ]]
}
check "every window is in the tree (tiled or floating)" poll all_in
tiled_set() { [[ "$(tree 1 | grep -oE '^[HV]\[[^]]*\]' | tr -d '*![]HV' | tr ' ' '\n' | sort | tr '\n' ' ')" == "a b c d main " ]]; }
check "the tiled ones are a, b, c, d, main (in any order)" poll tiled_set
check "no invariant failures or errors"     clean_log
finish
