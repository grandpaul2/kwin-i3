#!/usr/bin/env bash
# timing: alone
# needs: plugin
# Atomic layout changes: the kwini3hold KWin effect (plugin/hold.cpp, docs/records/spec-atomic-layout.md).
# A slow test client (--resize-delay) makes the gap between windows landing long enough to
# screenshot: without the effect the spot where a window is about to land shows the background
# (black in the headless KWin); with it, the old layout stays until every window has landed.
# Pixels come from tools/shot.py; the effect's own counters from its Stats D-Bus call.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
BG=0,0,0; RED=255,0,0; LIME=0,255,0; BLUE=0,0,255
# Timing checks: strict alone, which is how run.sh runs this ("# timing: alone", after the
# batch). Run inside a parallel batch by hand (KI3_PARALLEL test KWins on one GPU), a snapshot
# measured at 0.9 ms alone took 20-112 ms, so they get slack there. The strict numbers are the
# ones that matter for the desktop.
slack=1; (( ${KI3_PARALLEL:-1} > 1 )) && slack=15

stats() { busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin)["data"][0]; print("\n".join("%s=%s"%(k,v["data"]) for k,v in sorted(d.items())))'; }
stat() { stats | grep "^$1=" | cut -d= -f2; }
# The watcher's notification is slow under the parallel suite; KWin's reconfigure is immediate.
hold_set() { kwriteconfig6 --notify --file kwinrc --group kwin-i3-hold --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; }
_stat_is() { [[ "$(stat "$1")" == "$2" ]]; }
wait_stat() { poll _stat_is "$1" "$2" && return 0; echo "    $1 is $(stat "$1"), wanted $2"; return 1; }
# The first config read under the full parallel suite (17 KWins starting at once) took more than
# the 5 s a wait allows (2026-10-23, three runs): the effect's reconfigure is a KWin timer plus a
# KConfigWatcher notification, both slow then. Only the first wait gets the slack.
wait_stat_slow() { WAIT=$((5 + slack)) wait_stat "$@"; }
capture() { "$shot" capture Virtual-0 "$png"; }
pixel() { "$shot" same "$png" "$1" "$2" "$3"; }     # pixel x y r,g,b (prints what it saw on a miss)
# shot_after <action> <x> <y> <colour>: do the action, capture at once (mid-hold), check the pixel
shot_after() { local a=$1; shift; key "$a"; capture; pixel "$@"; }
effect_loaded() { [[ "$(busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects isEffectLoaded s kwini3hold)" == "b $1" ]]; }
lt() { python3 -c "import sys; sys.exit(0 if float('$1') < float('$2') else 1)"; }
between() { python3 -c "import sys; sys.exit(0 if float('$2') <= float('$1') <= float('$3') else 1)"; }

check "the effect is loaded"                effect_loaded true
check "and supported (OpenGL)"              _stat_is supported True
# The config form's keys ([Script-kwin-i3]), written plainly as the form does: kwini3helper has
# KWin reconfigure, and the effect hears Workspace::configChanged (no --notify, no reload key).
form_set() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
form_set holdEnabled false
check "holdEnabled false (form key, plain write): off" wait_stat enabled False
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key holdEnabled --delete
check "deleted: on again (the old key's default)" wait_stat enabled True
hold_set Enabled true
hold_set TimeoutMs 400                      # room for a screenshot mid-hold (the default is 100)
check "the config reached it"               wait_stat_slow timeoutMs 400
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 0. New windows: hidden until their tile places them, a few ms (dialogs and transients never).
client --title a --color red; client --title b --color lime
check "a | b"                               wait_tree 1 "H[a b*]"
wait_stat open False
h=$(stat newHidden)
client --title f --color yellow
check "f opened"                            wait_tree 1 "H[a b f*]"
wait_stat open False
check "f was hidden until placed"           _stat_is newHidden $((h + 1))
check "for a few ms only"                   lt "$(stat lastHiddenMs)" $((60 * slack))
check "fast windows: no timeout"            _stat_is timeouts 0
kclose f
h=$(stat newHidden)
client --title g --dialog
check "g and its dialog opened"             wait_tree 1 "H[a b g] ~g_dialog*"
sleep 0.1
check "the dialog was not hidden (only g)"  _stat_is newHidden $((h + 1))
kclose "g dialog"; kclose g
check "a | b again"                         wait_tree 1 "H[a b*]"

# 1. The case that prompted the effect: a big window on the left, two stacked on the right, the bottom one slow (c).
#    Moving c left makes three columns; without the effect its new column shows black until it
#    has redrawn, while a and b have already moved.
key "Split V"
client --title c --color blue --resize-delay 0.8
check "a | b over c"                        wait_tree 1 "H[a V[b c*]]"
wait_stat open False
capture
check "before: a is where c will go"        pixel 530 180 $RED
t=$(stat transactions)
check "mid-move: the old layout stays (a, not black)"   shot_after "Move Left" 530 180 $RED
check "a transaction opened"                _stat_is transactions $((t + 1))
sleep 1.2
capture
check "after: c has landed there"           pixel 530 180 $BLUE
check "three columns"                       wait_tree 1 "H[a c* V[b]]"
ms=$(stat lastMs)
check "it ran to the timeout (c is slower): ${ms%.*} ms"   between "$ms" 350 600

# 2. The kill switch, and the test's own teeth: with the effect off the hole is visible.
hold_set Enabled false
check "disabled"                            wait_stat enabled False
t=$(stat transactions)
check "mid-move, effect off: black where c will land"   shot_after "Move Right" 1100 540 $BG
check "no transaction"                      _stat_is transactions $t
sleep 1.2
check "a | b over c again"                  wait_tree 1 "H[a V[b c*]]"
hold_set Enabled true
check "enabled again"                       wait_stat enabled True
check "mid-move, effect on: a stays"        shot_after "Move Left" 530 180 $RED
sleep 1.2
check "three columns again"                 wait_tree 1 "H[a c* V[b]]"
check "mid-move back: b's old full column stays (not black)"   shot_after "Move Right" 1100 540 $LIME
sleep 1.2
capture
check "after: c is back at the bottom right" pixel 1100 540 $BLUE

# 3. A change that changes nothing ends at once, not at the timeout (KWin says "about to
#    change" even then).
t=$(stat transactions); to=$(stat timeouts)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.frameGeometry = w.frameGeometry; });' >/dev/null
check "a no-op change opened a transaction" wait_stat transactions $((t + 1))
check "and released without a timeout"      wait_stat timeouts $to
check "within 40 ms"                        lt "$(stat lastMs)" $((40 * slack))

# 4. Snapshot cost: every window of a five-window reflow, in one call.
client --title d --color yellow; client --title e --color cyan
check "five windows"                        wait_tree 1 "H[a V[b c d e*]]"
wait_stat open False
ms=$(stat maxSnapshotMs)
check "a snapshot takes under a frame at 240 Hz (4.2 ms): ${ms:0:4} ms"   lt "$ms" $(python3 -c "print(4.2 * $slack)")
kclose d; kclose e
check "a | b over c"                        wait_tree 1 "H[a V[b c*]]"

# 6. Closing a window: it stays on screen while its slow neighbour grows into its space.
sleep 1.2
wait_stat open False
k=$(stat closeHoldsKept)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "b") w.closeWindow(); });' >/dev/null
wait_stat closeHoldsKept $((k + 1))
capture
check "mid-close: b still shows where c will grow"   pixel 960 180 $LIME
check "b was kept"                          wait_stat closeHoldsKept $((k + 1))
sleep 1.2
capture
check "after: c filled b's space"           pixel 960 180 $BLUE

# i3 keeps c in its one-window stack; a fresh c (still slow) for a plain a | c.
kclose c
client --title c --color blue --resize-delay 0.8

# 7. Sending a window to a hidden workspace (Meta+Shift+3): it is hidden at once, and its
#    snapshot stays on screen while its slow neighbour grows (a visible ref keeps it drawn).
check "a | c"                               wait_tree 1 "H[a c*]"
# Settled at its tile first: a plain GTK 4 window's bounds are asked for again once its border
# goes (spec-window-modes "why" 5), one more of this slow client's 0.8 s resizes.
check "c settled at its tile"               geom_is c "641,1 638x718"
key "Focus Left"
check "a focused"                           wait_tree 1 "H[a* c]"
wait_stat open False
check "mid-send: a's snapshot stays (not black)"   shot_after "Move to Workspace 3" 320 360 $RED
sleep 1.2
capture
check "after: c fills the screen"           pixel 320 360 $BLUE
check "ws 1: c alone"                       wait_tree 1 "H[c*]"

# 8. Not held: a window on a hidden workspace; a window going fullscreen; a drag.
t=$(stat transactions)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") { var g = w.frameGeometry; w.frameGeometry = { x: g.x + 10, y: g.y, width: g.width - 10, height: g.height }; } });' >/dev/null
sleep 0.1
check "a hidden workspace's window: no transaction"   _stat_is transactions $t
client --title h --color yellow
check "c | h"                               wait_tree 1 "H[c h*]"
wait_stat open False
# Fullscreen. Going: KWin only records the request (the window counts as fullscreen once the
# app acknowledges), so c is held with its tiled picture until its fullscreen frame is there.
# Leaving: KWin's own restore isn't held (c still counts as fullscreen then), and nothing else
# changes: kwin-i3 keeps a tiled fullscreen window in its layout, so h never moves.
t=$(stat transactions)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") w.fullScreen = true; });' >/dev/null
wait_tree 1 "H[c! h*]"                       # h keeps the focus: fullscreen by property moves none
wait_stat open False
n=$(( $(stat transactions) - t ))
check "going fullscreen beside h: held ($n transactions)"   between "$n" 1 2
t=$(stat transactions)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") w.fullScreen = false; });' >/dev/null
wait_tree 1 "H[c h*]"
wait_stat open False
n=$(( $(stat transactions) - t ))
check "leaving fullscreen: KWin's restore alone, not held ($n transactions)"   between "$n" 0 1
# A newcomer under the fullscreen window (docs/records/spec-fullscreen-tree.md): the rebuild for it
# loses c its tile (KWin refuses a fullscreen window), a second pass lays out without c: the
# newcomer's placement and up to two rebuilds, held. Leaving: KWin's restore, then the rebuild
# that takes c back in beside h and i (bounds measured 2026-10-24).
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") w.fullScreen = true; });' >/dev/null
wait_tree 1 "H[c! h*]"
wait_stat open False
t=$(stat transactions)
client --title i --color blue
wait_tree 1 "H[c*! h i]"                     # i beside the focused h; the focus handed back to c
wait_stat open False
n=$(( $(stat transactions) - t ))
check "a newcomer under fullscreen c: held ($n transactions)"   between "$n" 1 3
t=$(stat transactions)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "c") w.fullScreen = false; });' >/dev/null
wait_tree 1 "H[c* h i]"
wait_stat open False
n=$(( $(stat transactions) - t ))
check "leaving with the newcomer: restore, then the rebuild ($n transactions)"   between "$n" 1 2
check "c is the left third again"           geom_is c "1,1 425x718"
kclose i
wait_tree 1 "H[c* h]"
wait_stat open False
check "c is half the screen again"          geom_is c "1,1 638x718"   # the drag below starts in c
t=$(stat transactions)
m=$(mark)
drag Meta right 600 360 500 360
check "a resize drag happened"              wait_log '^.{9}RESIZE resized width' "$m"
sleep 0.2
# Meta+right is kwin-i3's own resize (docs/records/spec-tiling-resize.md): the drag holds nothing, its release
# re-tiles the two neighbours, which is one ordinary transaction at most.
check "at most the drag's end re-tile was held"   between "$(( $(stat transactions) - t ))" 0 1

# 9. Closing the last window on a screen: kept for a moment, then let go.
kclose h
d=$(stat closeHoldsDropped)
kclose c
check "empty"                               wait_tree 1 "H[]*"
check "the lone closed window was let go"   wait_stat closeHoldsDropped $((d + 1))

# 10. A snapshot taken while a hold is already open, with the effect in KWin's paint chain,
#     must still capture the live window (else it draws its own empty texture into itself).
#     A hold opened on the first monitor; then a swap on the second monitor's workspace.
client --title i --color red; client --title j --color lime
key "Split V"
client --title k --color blue --resize-delay 0.8
check "i | j over k"                        wait_tree 1 "H[i V[j k*]]"
key "Workspace 2"
client --title x --color red; client --title y --color lime
check "x | y on workspace 2"                wait_tree 2 "H[x y*]"
key "Workspace 1"
sleep 1.2
wait_stat open False
key "Move Left"
check "a hold is open (k is slow)"          wait_stat open True
key "Workspace 2"
sleep 0.05                                  # a paint or two: the chain now includes the effect
key "Move Left"
"$shot" capture Virtual-1 "$png"
check "mid-hold: x's snapshot shows x, not an empty texture"   pixel 320 360 $RED
sleep 1.2
"$shot" capture Virtual-1 "$png"
check "after: y is on the left of workspace 2"   pixel 320 360 $LIME
kclose x; kclose y
key "Workspace 1"
kclose i; kclose j; kclose k
check "empty again"                         wait_tree 1 "H[]*"

# 11. One change, two kinds of move: a same-size move (applied at once, inside the call) and a
#     resize of a slow window. One transaction, not a release between them.
client --title p --color red; client --title q --color lime --resize-delay 0.8
check "p | q"                               wait_tree 1 "H[p q*]"
# Settled at its tile first: this slow client's resizes, and its bounds asked again once its
# border went (spec-window-modes "why" 5), take ~2.5 s; a fixed 1.2 s wait failed 4 of 4 runs.
check "q settled at its tile"               geom_is q "641,1 638x718"
wait_stat open False
t=$(stat transactions)
kjs 'var p, q; workspace.windowList().forEach(function (w) { if (w.caption === "p") p = w; if (w.caption === "q") q = w; });
     var g = p.frameGeometry; p.frameGeometry = { x: g.x + 20, y: g.y, width: g.width, height: g.height };
     var h = q.frameGeometry; q.frameGeometry = { x: h.x, y: h.y, width: h.width - 100, height: h.height };' >/dev/null
sleep 1.2
wait_stat open False
# kwin-i3 puts both back (docs/records/spec-self-resize.md: to it, a frame changed from outside is a
# window resizing itself): p inside the same call, q once its slow answer lands, a transaction of
# its own. A release between p and q would make it three.
check "one transaction for both, one for q put back" _stat_is transactions $((t + 2))
check "and q's put-back the other"          eval '[[ "$(after 0 | grep -cE "^.{9}REFIT q:")" == 1 ]]'
kclose p; kclose q
check "empty once more"                     wait_tree 1 "H[]*"

# 12. A window asked for a size under its minimum answers with its current size: KWin changes
#     no geometry and emits nothing. The hold must still end at once (a check per frame), not at
#     the timeout. (kwin-i3 never asks for that itself: fitMinimums; this asks KWin directly.)
client --title m --color red --min 900x200; client --title n --color lime
check "m | n (m at its minimum)"            wait_tree 1 "H[m n*]"
sleep 0.3
wait_stat open False
to=$(stat timeouts); t=$(stat transactions)
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "m") { var g = w.frameGeometry; w.frameGeometry = { x: g.x, y: g.y, width: g.width - 60, height: g.height }; } });' >/dev/null
check "asking under the minimum opened a hold"   wait_stat transactions $((t + 1))
wait_stat open False
check "the app kept its size: no timeout"   _stat_is timeouts $to
check "and quick"                           lt "$(stat lastMs)" $((40 * slack))
kclose m; kclose n
check "empty yet again"                     wait_tree 1 "H[]*"

# 13. Unloading the effect in the middle of a hold: nothing breaks, and it loads again.
#     The action must change j's size: a swap of two halves only moves them, KWin sends no
#     configure for an unchanged size, and the hold lasted ~4 ms, open to a poll by luck
#     (2026-10-24). Toggle Split makes both 1280x360, so the slow j holds it ~1.5 s.
hold_set TimeoutMs 2000
client --title i --color red; client --title j --color lime --resize-delay 1.5
check "i | j"                               wait_tree 1 "H[i j*]"
wait_stat open False
key "Toggle Split"
check "a hold is open"                      wait_stat open True
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s kwini3hold >/dev/null
check "unloaded mid-hold"                   effect_loaded false
sleep 1.8
check "KWin and the windows are fine"       wait_tree 1 "H[V[i j*]]"
check "j is where it should be"             geom_is j "0,360 1280x360"
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s kwini3hold >/dev/null
check "loaded again"                        effect_loaded true
check "counters start afresh"               _stat_is transactions 0

check "no invariant failures or errors"     clean_log
finish
