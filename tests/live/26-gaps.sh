#!/usr/bin/env bash
# focus: mouse
# Gaps (docs/spec-settings.md): i3's inner gap between windows and inner + outer at the screen's
# edge, by KWin's tile padding (= inner) and an inset root (outer + inner/2). Exact frames on the
# first monitor (1280x720), pixels for the gap itself, and the seams: minimums, fullscreen, a
# resize drag, a reload with gaps set, a hidden workspace, a monitor unplugged, release. No plugin
# here, so title bars: each frame 1 px further in a side, the padding 2 more, for the decoration's
# outline (§6, 2026-10-29), wherever the inner gap isn't 0.
# Not here: a panel's strut (the test KWin has no panel, nor does the author's desktop); the
# inset follows KWin's maximize area, which a strut shrinks.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py; png=$KI3_TMP/gaps.png
BG=0,0,0; RED=255,0,0
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
reload_settings() { local m; m=$(mark); key "Reload Settings"; wait_log '^.{9}SETTINGS ' "$m"; }
pixel_is() { "$shot" capture Virtual-0 "$png" && "$shot" same "$png" "$1" "$2" "$3"; }
root_is() {   # root_is <desktop> <x,y,w,h relative, 3 decimals> <padding>
    [[ "$(kjs "var r = workspace.rootTile(workspace.screens[0], workspace.desktops[$(($1 - 1))]), g = r.relativeGeometry;
               log([g.x, g.y, g.width, g.height].map(function (v) { return v.toFixed(3); }).join(',') + ' ' + r.padding);")" == "$2 $3" ]]
}
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }

set_key gapsInner 10; set_key gapsOuter 20
load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. One window: 30 px (inner + outer) all round.
client --title a --color red
check "a alone: 30 px all round"            geom_is a "31,31 1218x658"
check "the root is inset by 25 (outer + inner/2), padding 12" poll root_is 1 "0.020,0.035,0.961,0.931" 12

# 2. Two: 30 at the edges, 10 between, and the gap is the background.
client --title b
check "a | b: a"                            geom_is a "31,31 603x658"
check "a | b: b"                            geom_is b "646,31 603x658"
check "the 10 px between them is background" poll pixel_is 640 360 $BG
check "inside a is a"                       poll pixel_is 300 360 $RED

# 3. Nested: b over c.
key "Split V"; client --title c
check "H[a V[b c]]"                         wait_tree 1 "H[a V[b c*]]"
check "b, top right"                        geom_is b "646,31 603x323"
check "c, bottom right"                     geom_is c "646,366 603x323"

# 4. A reload of the settings changes the gaps in place: no window opened or dropped, same tree.
m=$(mark)
set_key gapsInner 0; set_key gapsOuter 0
reload_settings
check "no gaps: a"                          geom_is a "0,0 640x720"
check "no gaps: c"                          geom_is c "640,360 640x360"
check "the root is whole again, padding 0"  poll root_is 1 "0.000,0.000,1.000,1.000" 0
check "same tree"                           _tree_is 1 "H[a V[b c*]]" "$m"
check "nothing added or dropped"            bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -qE '^.{9}(ADD|FLOAT) '"

# 4b. The defaults (4 between, 2 more at the edge, since 2026-10-25; testkwin.sh pins 0): with
#     the keys gone, the layout is the one 4 and 2 written out give.
set_key gapsInner 4; set_key gapsOuter 2
reload_settings
want_a=$(geom a); want_c=$(geom c); echo "    4 and 2: a $want_a  c $want_c"
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsInner --delete
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsOuter --delete
set_key gapsInner 0; set_key gapsOuter 0; reload_settings
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsInner --delete
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsOuter --delete
reload_settings
check "defaults: a as with 4 and 2 ($want_a)" geom_is a "$want_a"
check "defaults: c likewise"                geom_is c "$want_c"
check "  (not the no-gap layout)"           test "$want_a" != "0,0 640x720"
set_key gapsInner 0; set_key gapsOuter 0
reload_settings
check "no gaps again"                       geom_is a "0,0 640x720"

# 4c. i3's per-side and per-workspace gaps (§11 N2, redo stage 7): gaps left 20 insets the root
#     on that side only; workspace 1 gaps top 10 adds to the top on this workspace only.
set_key gapsLeft 20
reload_settings
check "gaps left 20: a from 20, the rest whole" geom_is a "20,0 630x720"
check "  c likewise"                        geom_is c "650,360 630x360"
set_key workspaceGaps "1 gaps top 10"
reload_settings
check "workspace 1 gaps top 10: a from 20,10" geom_is a "20,10 630x710"
key "Workspace 3"; client --title w
check "workspace 3: the left gap, not the top one" geom_is w "20,0 1260x720"
kclose w; key "Workspace 1"
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsLeft --delete   # -1 reads as an option
set_key workspaceGaps ""
reload_settings
check "both off: no gaps again"             geom_is a "0,0 640x720"

# 5. An odd inner gap (half pixels): within a pixel of i3's numbers. inner 5, outer 0: the edge
#    is 5, between is 5.
set_key gapsInner 5
reload_settings
near() {   # near <caption> <x> <y> <w> <h>: each within 1 px
    local g; g=$(geom "$1"); [[ $g =~ ^(-?[0-9]+),(-?[0-9]+)\ ([0-9]+)x([0-9]+)$ ]] || return 1
    local v=("${BASH_REMATCH[@]:1}") want=("$2" "$3" "$4" "$5") i
    for i in 0 1 2 3; do (( ${v[i]} - ${want[i]} <= 1 && ${want[i]} - ${v[i]} <= 1 )) || return 1; done
}
# An odd inner gap counts as the even one below (the pickers step by 2): 4 between and at the
# edges, every window on whole pixels (KWin's own numbers, unrounded: an odd padding put them
# half a pixel off, Paul, 2026-10-25).
raw() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var g = w.frameGeometry; log(g.x + \",\" + g.y + \" \" + g.width + \"x\" + g.height); } });"; }
echo "    inner 5: a $(raw a)  b $(raw b)"
check "inner 5 as 4: a, 4 from the edges"   poll eval '[[ "$(raw a)" == "5,5 632x710" ]]'
check "inner 5 as 4: b, 4 from a"           poll eval '[[ "$(raw b)" == "643,5 632x352" ]]'
check "inner 5 as 4: c, 4 below b"          poll eval '[[ "$(raw c)" == "643,363 632x352" ]]' || echo "    c: $(raw c)"

# 6. Fullscreen fills the monitor, gaps or not; and comes back to its gapped tile.
set_key gapsInner 10; set_key gapsOuter 20
reload_settings
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") { workspace.activeWindow = w; w.fullScreen = true; } })' >/dev/null
check "fullscreen a fills the monitor"      geom_is a "0,0 1280x720"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.fullScreen = false; })' >/dev/null
check "and comes back to its tile"          geom_is a "31,31 603x658"

# 7. Minimums with gaps. Two windows side by side need their frame minimums plus one inner gap
#    each (half on each side) within the root's 1230 px (1280 - 2 x 25). So minimums of 612 px
#    (frame included) can't fit (2 x 622 = 1244), though they would without the gaps or against
#    the whole 1280; 600 px can (2 x 610 = 1220). The frame's border width is measured, not assumed.
kclose b; kclose c
check "a alone again"                       wait_tree 1 "H[a*]"
# 6b. i3's smart_gaps (§6, redo stage 7): `on`, a window alone on its workspace has no gaps at
#     all; `inverse_outer`, the outer gaps only; `off`, its 30 px again.
set_key smartGaps on
reload_settings
check "smart_gaps on, a alone: no gaps"     geom_is a "0,0 1280x720"
set_key smartGaps inverse_outer
reload_settings
# i3 insets a lone window by its inner gap as well (gaps.c gaps_should_inset_con, render.c): 30.
check "inverse_outer, a alone: the outer gaps stay (30 with the inner)" geom_is a "31,31 1218x658"
set_key smartGaps off
reload_settings
check "off: 30 px all round again"          geom_is a "31,31 1218x658"
bw=$(kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") log(w.frameGeometry.width - w.clientGeometry.width); })')
kclose a                                     # only the two under test on the workspace
m=$(mark)
client --title m1 --min $((612 - bw))x100; client --title m2 --min $((612 - bw))x100
check "612 + 612 with gaps: one floats"     wait_log '^.{9}FLOAT m[12]: its minimum size' "$m"
kclose m1; kclose m2
check "empty again"                         wait_tree 1 "H[]*"
m=$(mark)
client --title n1 --min $((600 - bw))x100; client --title n2 --min $((600 - bw))x100
check "600 + 600 with gaps: both tile"      wait_tree 1 "H[n1 n2*]" "$m"
check "and none floated"                    bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -qE '^.{9}FLOAT '"
kclose n1; kclose n2
client --title a --color red

# 8. A resize drag with gaps. KWin puts a tile's edge where the pointer is, plus the padding
#    (Tile::resizeFromGravity): a Meta+right-drag on a's right third ending at x 800 puts the a|b
#    edge at 812 (padding 12 with title bars), a's window ending 6 short of it. Read back into the model and kept through the
#    next reconcile.
client --title b
check "a | b again"                         geom_is a "31,31 603x658"
m=$(mark)
drag Meta right 500 360 800 360
check "the drag ended as a resize"          wait_log '^.{9}DRAG end resize a' "$m"
check "a reaches 806"                       poll near a 31 31 775 658 || echo "    a $(geom a)"
key "Focus Right"; key "Focus Left"          # a reconcile: the read-back keeps the size
sleep 0.3
check "and keeps it, gaps intact"           poll near a 31 31 775 658 || echo "    a $(geom a)"
check "b beside it, 10 px on"               poll near b 818 31 431 658 || echo "    b $(geom b)"

# 8b. A drag on a's outer side: with gaps no tile edge is at the screen's border, so KWin lets the
#     outer edge be dragged; it would pin the edge to the border (CustomTile::setRelativeGeometry).
#     The outer edges are not shares: after the drag a is back at 30 px from the edge.
m=$(mark)
drag Meta right 60 360 10 360
check "a drag on the outer side ended"      wait_log '^.{9}DRAG end resize a' "$m"
key "Focus Right"; key "Focus Left"
check "a back at 30 from the edge"          poll near a 31 31 775 658 || echo "    a $(geom a)"
check "the root still inset"                poll root_is 1 "0.020,0.035,0.961,0.931" 12

# 9. A gaps change while a workspace is hidden: right when it is shown.
key "Workspace 3"
client --title h
check "h alone on 3"                        geom_is h "31,31 1218x658"
key "Workspace 1"
set_key gapsOuter 0
reload_settings
key "Workspace 3"
check "shown again: h with the new gaps"    geom_is h "11,11 1258x698"
key "Workspace 1"
set_key gapsOuter 20
reload_settings

# 10. A monitor unplugged and back, with gaps: workspace 2 comes to the first monitor gapped,
#     and stays there, gapped (§4 W3, redo stage 4: a lost output's workspaces move for good,
#     as i3's; only an assignment brings one back. Found red here 2026-10-28, redo stage 7).
key "Workspace 2"
client --title s
check "s alone on the second monitor"       geom_is s "1311,31 1218x658"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone"          poll screens_are 1
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "it is back"                          poll screens_are 2
key "Workspace 2"
check "s on the first monitor for good, gapped" geom_is s "31,31 1218x658"
key "Workspace 1"

# 11. A script reload with gaps set: the inset root is found as it is, the tree kept.
m=$(mark)
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "same tree after the reload"          wait_tree 1 "H[a* b]" "$m"
check "b in its gapped tile"                poll near b "$(geom b | sed 's/,.*//')" 31 "$(geom b | sed 's/.* //; s/x.*//')" 658

# 12. Release: every root whole and unpadded again, the reloaded script's and the old one's.
key "Release"
check "release logs"                        wait_log '^.{9}RELEASED$'
check "workspace 1's root whole, padding 0" poll root_is 1 "0.000,0.000,1.000,1.000" 0
check "workspace 3's too"                   poll root_is 3 "0.000,0.000,1.000,1.000" 0

check "no invariant failures or errors"     clean_log
finish
