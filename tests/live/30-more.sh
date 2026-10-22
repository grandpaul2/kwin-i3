#!/usr/bin/env bash
# Phase 2, one monitor: the ignore rules, up/down, the error guard, and a reload with floating
# and minimized windows (the gaps the test review listed, 2026-10-22).
source "$(dirname "$0")/lib.sh"
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# ignore rules: a class on Krohnkite's ignore list is never managed
client --title a
client --title ruler --app-id org.kde.kruler
client --title b
check "an ignored class stays out of the tree" wait_tree 1 "H[a b*]"
check "and keeps its own size"              geom_is ruler "440,196 400x328"
# a managed window made sticky (on all desktops) leaves the tree; back on one desktop, it returns
on b 'w.onAllDesktops = true;'
check "made sticky: out of the tree"        wait_tree 1 "H[a*]"
check "a fills the screen"                  geom_is a "0,0 1280x720"
on b 'w.desktops = [workspace.desktops[0]];'
check "on one desktop again: back, focused" wait_tree 1 "H[a b*]"

# up and down
on b 'workspace.activeWindow = w;'
key "Split V"
client --title c
check "H[a V[b c*]]"                        wait_tree 1 "H[a V[b c*]]"
key "Focus Up"
check "focus up"                            wait_tree 1 "H[a V[b* c]]"
key "Focus Down"
check "focus down"                          wait_tree 1 "H[a V[b c*]]"
key "Move Up"
check "move up"                             wait_tree 1 "H[a V[c* b]]"
check "c on top now"                        geom_is c "640,0 640x360"
key "Move Down"
check "move down"                           wait_tree 1 "H[a V[b c*]]"
key "Grow Height"
check "grow height: c gains 10%"            geom_is c "640,288 640x432"

# the guard: an exception in an action is logged and kwin-i3 carries on
m=$(mark)
busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 Selftest Throw"
check "an exception is logged"              wait_log '^.{9}ERROR in Selftest Throw: Error: selftest' "$m"
key "Move Up"
check "and the next action still works"     wait_tree 1 "H[a V[c* b]]" "$m"

# reload with a floating and a minimized window
client --title f --fixed
on a 'w.minimized = true;'
check "a minimized, f floating"             wait_tree 1 "H[a V[c b]] ~f*"
check "minimized a gives up its space"      geom_is c "0,0 1280x432"
m=$(mark)
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "floating stays floating"             wait_log '^.{9}TREE 1 .*~f' "$m"
check "the tiled layout is kept"            geom_is c "0,0 1280x432"
on a 'w.minimized = false;'
# Known limit (plan, policies): while a is minimized KWin's tiles hold only V[c b], so a reload
# can't know a's old place; it comes back after the focus.
back_in_tree() {
    local t; t=$(tree 1 "$m")
    local words=" ${t//[\[\]*!]/ } "
    [[ $words == *" a "* && $words == *" ~f "* ]]
}
check "the minimized window comes back into the tree" poll back_in_tree

# clean_log would see the deliberate ERROR above: look for anything else
others_clean() { ! grep -E '^.{9}(INVARIANT|ERROR|WARN)' "$KI3_LOG" | grep -v 'Selftest Throw' | grep -q .; }
check "no other invariant failures or errors" others_clean
finish
