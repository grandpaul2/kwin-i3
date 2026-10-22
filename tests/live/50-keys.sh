#!/usr/bin/env bash
# Real input, part 1: every default key pressed for real. Its own scenario (and KWin): pressing
# Meta+1..0 for real moves workspaces between monitors, which would skew any test after it.
# The rest of the real-input tests are 51-input.sh. Designed in
# docs/input-tests-design.md, revised by its review (docs/input-tests-review-2026-10-22.md).
source "$(dirname "$0")/lib.sh"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
output_is() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.output.name); })")" == "$2" ]]; }
tile_share() {   # share of the n-th child tile of workspace 1's root on screen 0, x1000
    kjs "var r = workspace.rootTile(workspace.screens[0], workspace.desktops[0]); var t = r.tiles[$1]; log(Math.round((r.layoutDirection === 2 ? t.relativeGeometry.height : t.relativeGeometry.width) * 1000));"
}
words_of() { local t; t=$(tree "$1" "${2:-0}"); echo " ${t//[\[\]*!]/ } "; }
has_word() { [[ "$(words_of "$1" "$3")" == *" $2 "* ]]; }
close_all() { local c; for c in "$@"; do kclose "$c"; done; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. Every default key, pressed for real, fires exactly its action. No windows yet (the actions
#    are no-ops but still log). The ':' chord is physically Meta+Shift+;, already in the list;
#    a symbol variant (Meta+!) is the same physical chord as Meta+Shift+1 and can't be told apart
#    here: tests/unit/keys.test.js checks the table for those.
# The chords come from tests/keys.json (the spec, from Paul's old i3 config), never from kwin.js:
# reading the table under test let a typo or a dropped key pass (fault battery, 2026-10-22).
mapfile -t chords < <(node -e '
const K = require(process.argv[1]);
const seen = new Set();
for (const [a, keys] of Object.entries(K)) for (let k of keys) {
    if (k === "Meta+:") k = "Meta+Shift+;";
    if (!seen.has(k)) { seen.add(k); console.log(a + "|" + k); }
}
for (let n = 1; n <= 10; n++) { const d = String(n % 10);
    console.log("Workspace " + n + "|Meta+" + d); console.log("Move to Workspace " + n + "|Meta+Shift+" + d); }' "$root/tests/keys.json")
one_action() {   # exactly one ACTION after mark $2, and it is $1
    local lines; lines=$(after "$2" | grep -E '^.{9}ACTION ' | cut -c17-)
    [[ $lines == "$1" ]]
}
missed=()
w=$WAIT   # the first key gets the full wait: with every scenario's KWin starting at once it can
          # take over 2 s (seen 2026-10-22, 15 scenarios); the rest 2 s each
for c in "${chords[@]}"; do
    action=${c%%|*} chord=${c#*|}
    m=$(mark); press "$chord"
    WAIT=$w poll one_action "$action" "$m" || missed+=("$chord -> wanted '$action', got '$(after "$m" | grep -E '^.{9}ACTION ' | cut -c17- | tr '\n' ',')'")
    w=2
done
check "all ${#chords[@]} default keys fire exactly their action" test ${#missed[@]} -eq 0
for x in "${missed[@]}"; do echo "    $x"; done
m=$(mark); press "Meta+O"; sleep 0.4
check "negative control: an unbound chord fires nothing" test -z "$(after "$m" | grep -E '^.{9}ACTION ')"
check "no invariant failures or errors"     clean_log
finish
