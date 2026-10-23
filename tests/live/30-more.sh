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

# A window whose minimum can't fit beside the others floats instead of hanging off the screen
# (the plan's rule; the live-desktop review saw 580 px off a 1280 px screen).
for c in a c b f; do kclose "$c"; done
client --title p; client --title q
client --title big --min 900x500
check "big floats, p and q tile"            wait_tree 1 "V[p q] ~big*"
inside() {
    local g; g=$(geom "$1")
    [[ $g =~ ^(-?[0-9]+),(-?[0-9]+)\ ([0-9]+)x([0-9]+)$ ]] || return 1
    (( BASH_REMATCH[1] >= 0 && BASH_REMATCH[1] + BASH_REMATCH[3] <= 1280 ))
}
check "every window inside the screen: p"   poll inside p
check "q"                                   poll inside q
check "big"                                 poll inside big
check "logged why"                          wait_log '^.{9}FLOAT big: '

# Minimums that fit in total but not in i3's shares: they get the space from neighbours with
# room to spare (seen live, 2026-10-22: KeePassXC, minimum 800 px, in a 640 px quarter, hung
# 162 px onto the other monitor). 1280 px: p | V-less row of p, wide1, wide2 at 1/3 = 427 each.
kclose big; kclose p; kclose q; kclose r
key "Workspace 3"                          # a fresh, horizontal workspace
client --title s1
client --title w1 --min 500x300
client --title w2 --min 500x300
has_tiled_row() { [[ "$(tree 3)" == "H[s1 w1 w2*]" ]]; }
check "three in a row, all tiled"           poll has_tiled_row
min_ok() {
    local g x w; for c in w1 w2; do
        g=$(geom $c); [[ $g =~ ^(-?[0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1
        x=${BASH_REMATCH[1]} w=${BASH_REMATCH[2]}
        (( w >= 500 && x >= 0 && x + w <= 1280 )) || return 1
    done
}
check "each wide window gets its minimum, inside the screen" poll min_ok
row_meets() {
    local g; g=$(geom s1); [[ $g =~ ^0,[0-9]+\ ([0-9]+)x ]] || return 1; local e=${BASH_REMATCH[1]}
    g=$(geom w1); [[ $g =~ ^([0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1; (( BASH_REMATCH[1] == e )) || return 1; e=$((BASH_REMATCH[1] + BASH_REMATCH[2]))
    g=$(geom w2); [[ $g =~ ^([0-9]+),[0-9]+\ ([0-9]+)x ]] || return 1; (( BASH_REMATCH[1] == e && BASH_REMATCH[1] + BASH_REMATCH[2] == 1280 ))
}
check "and the row still meets edge to edge" poll row_meets
kclose s1; kclose w1; kclose w2
key "Workspace 1"

# A reconcile that throws every time: three retries 250 ms apart, then it waits for an event
# (it used to retry at once for ever, spinning KWin). Then it recovers on the next event.
client --title p; client --title q; client --title big --min 900x500
m=$(mark)
busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 Selftest Break Reconcile"
check "it gives up after 3 retries"         wait_log '^.{9}WARN giving up after 3 errors' "$m"
sleep 1
errors=$(after "$m" | grep -c 'ERROR in reconcile')
check "a bounded number of errors ($errors)" test "$errors" -ge 4 -a "$errors" -le 8
busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 Selftest Break Reconcile"
m=$(mark)
client --title r
check "and it recovers on the next event"   wait_tree 1 "V[p q r*] ~big" "$m"

# clean_log would see the deliberate ERRORs above: look for anything else
others_clean() { ! grep -E '^.{9}(INVARIANT|ERROR|WARN)' "$KI3_LOG" | grep -vE 'Selftest Throw|selftest reconcile|giving up after 3' | grep -q .; }
check "no other invariant failures or errors" others_clean
finish
