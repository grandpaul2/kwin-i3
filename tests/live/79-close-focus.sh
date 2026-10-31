#!/usr/bin/env bash
# needs: plugin
# timing: alone
# (f floats where KWin first placed it, which shifts under load: in PikaOS's batch it covered the
# point that hovers b; green alone)
# Closing the focused window focuses the one used before it, as i3 (con_next_focused, con.c:1651).
# Found from a capture, where closing a window always focused the leftmost one: H[A V[A A*]], the pointer over the left one and back (focus follows
# mouse: both activated), Meta+Shift+Q: KWin activates the left one, the most recent in its
# one-list focus chain (focuschain.cpp:252), and kwin-i3 followed. i3 looks in the closed
# window's own container first: the one above.
source "$(dirname "$0")/lib.sh"
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "none")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
term() { alacritty --title "$1" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
term a; term b; term c
check "a | b | c"                           wait_tree 1 "H[a b c*]"
point 1100 360
key "Close"
check "c closed: b"                         wait_tree 1 "H[a b*]"
key "Split V"
term d
check "a | V[b d]"                          wait_tree 1 "H[a V[b d*]]"
point 960 540; sleep 0.2; point 300 360; sleep 0.3; point 960 540   # over a and back to d
check "d focused again, a used before it"   poll active_is d
m=$(mark); key "Close"; sleep 0.5
echo "    after closing d: tree $(tree 1)  KWin active $(active)"; after "$m" | grep -E "CLOSE|ACTIVE" | cut -c10- | sed "s/^/      /"
check "closing d focuses b, the one above"  wait_tree 1 "H[a V[b*]]"
check "  and KWin agrees"                   poll active_is b

# i3's next focus for every close (§5 C7): a top-level window, and a floating one,
# with the pointer resting on another window, which KWin's NextFocusPrefersMouse would pick.
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
activate a
check "a focused"                           poll active_is a
term e                                       # after the focused a, at the top level
check "a | e | V[b]"                        wait_tree 1 "H[a e* V[b]]"
point 1066 360                               # over b: it takes the focus (focus follows mouse)
check "hovering b"                          poll active_is b
activate a; activate e                       # the order used: e, then a, then b
check "e focused, a used before it"         poll active_is e
m=$(mark); key "Close"
check "closing e at the top level focuses a, not b under the pointer" wait_tree 1 "H[a* V[b]]" "$m"
check "  and KWin agrees"                   poll active_is a
term f
check "f tiles after a"                     wait_tree 1 "H[a f* V[b]]"
key "Floating Toggle"
check "f floats"                            wait_tree 1 "H[a V[b]] ~f*"
point 1000 300; point 1066 360               # a motion onto b again
check "hovering b again"                    poll active_is b
activate a; activate f
check "f focused, a used before it"         poll active_is f
m=$(mark); key "Close"
check "closing the floating f focuses a, not b under the pointer" wait_tree 1 "H[a* V[b]]" "$m"
check "  and KWin agrees"                   poll active_is a
check "no invariant failures or errors"     clean_log
finish
