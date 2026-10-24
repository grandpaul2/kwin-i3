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

# A reload (docs/spec-reload-keepabove.md): a window floated by hand stays floating (the keep-above
# flag kwin-i3 set is the one durable mark of a floating window), the new instance owns the flags
# the old one set, so un-floating clears them, and release leaves nothing kept above.
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
floating_is() { [[ "$(tree 1 "${2:-0}")" == *"~$1"* ]]; }
tiled_is() { local t; t=$(tree 1 "${2:-0}"); [[ $t != *"~$1"* && " ${t//[\[\]*!]/ } " == *" $1 "* ]]; }
none_above() { [[ -z "$(kjs 'workspace.windowList().forEach(function (w) { if (w.normalWindow && w.keepAbove) log(w.caption); })')" ]]; }
activate a
key "Floating Toggle"
check "a floats by hand, kept above"        poll prop_is a keepAbove true
check "  (in the tree as floating)"         poll floating_is a
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark)
load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "a is still floating after the reload" poll floating_is a "$m"
activate a
key "Floating Toggle"
check "un-floated: a tiles"                 poll tiled_is a "$m"
check "and its keep-above is off"           poll prop_is a keepAbove false
check "fixed is still floating, kept above" prop_is fixed keepAbove true
key "Release"
check "release: nothing kept above"         poll none_above

check "no invariant failures or errors"     clean_log
finish
