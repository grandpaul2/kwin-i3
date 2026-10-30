#!/usr/bin/env bash
# A fullscreen window stays in the tree (docs/records/spec-fullscreen-tree.md, from Paul's capture of
# 2026-10-23 23:25: Firefox fullscreen, a terminal opened there, "nothing happened"). KWin refuses
# to tile a fullscreen window, and the rebuild of the tiles for the newcomer lost it its tile, so
# kwin-i3 floated it, monitor-sized and above the tiles. Now (A) it stays in the tree, out of the
# tiles until fullscreen ends; (B) the rules judge a fullscreen window by its size limits, not by
# KWin's "not resizeable", which a caption change read as "float"; (C) as in i3, the newcomer
# gets no focus and opens behind: KWin activated it, kwin-i3 hands the focus back, which keeps
# the fullscreen window on top (Window::isActiveFullScreen). Its own dialog is the exception.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/fs.png
pixel_is() { "$shot" capture Virtual-0 "$png" && "$shot" same "$png" "$1" "$2" "$3"; }
on() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { $2 } })" >/dev/null; }
no_float() { ! after "$1" | grep -qE '^.{9}FLOAT '; }
active() { kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "-")'; }
active_is() { [[ "$(active)" == "$1" ]]; }
top_is() { [[ "$(kjs 'var o = workspace.stackingOrder.filter(function (w) { return w.normalWindow && w.output.name === "Virtual-0"; }); log(o.length ? o[o.length - 1].caption : "-")')" == "$1" ]]; }
no_tile() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.tile === null); })")" == "true" ]]; }
trees_since() { [[ "$(after "$1" | grep -cE '^.{9}TREE 1 ')" == "$2" ]]; }
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
# The frame's verdict (no effect here) comes a second after the load, with a pass of its own:
# before it, or the pass counts below include it (they did, 2026-10-25, once the setup got faster).
wait_log '^.{9}FRAME '

# A + C. b fullscreen; c opens: tiled behind it, no focus; b still fills the monitor and is on top.
client --title a; client --title b --color blue
check "two windows"                         wait_tree 1 "H[a b*]"
on b 'w.fullScreen = true;'
check "b is fullscreen"                     wait_tree 1 "H[a b*!]"
check "b fills the monitor"                 geom_is b "0,0 1280x720"
# b is stopped (SIGSTOP) while c opens, so it acknowledges nothing: KWin clears a window's tile
# only on the client's acknowledgement (window.cpp commitTile), so w.tile stays set and a second
# pass deciding from it would see b in its old tile, rebuild, be refused and schedule again, for
# ever (review finding 1). kwin-i3 keeps its own record of a window out of the tiles. The count
# is read once after a pause, not polled: a loop passes through 2 (review of the change).
bpid=$(pgrep -f "testclient.py --title b" | head -1)
kill -STOP "$bpid"
m=$(mark)
client --title c --color red
check "c opens tiled; b stays in the tree and keeps the focus" wait_tree 1 "H[a b*! c]" "$m"
check "nothing was floated"                 no_float "$m"
sleep 0.7
check "two reconcile passes, no spin"       trees_since "$m" 2
check "b still fills the monitor"           geom_is b "0,0 1280x720"
check "KWin's active window is b"           poll active_is b
check "b is on top of c (pixel)"            poll pixel_is 640 360 0,0,255
check "b is on top of c (stacking)"         top_is b
kill -CONT "$bpid"
check "b is out of the tiles (once it answers)" poll no_tile b
# Exit: focus stays on b (i3); the tree lays out in thirds, b at its tree position.
on b 'w.fullScreen = false;'
check "out of fullscreen: H[a b* c]"        wait_tree 1 "H[a b* c]" "$m"
check "a is the left third"                 geom_is a "0,0 427x720"
check "b is the middle third"               geom_is b "427,0 426x720"
check "c is the right third"                geom_is c "853,0 427x720"
check "nothing was floated"                 no_float "$m"

# Closing the fullscreen window with the newcomer behind it: the newcomer gets the workspace.
kclose a
check "H[b* c]"                             wait_tree 1 "H[b* c]"
on b 'w.fullScreen = true;'
check "b fullscreen again"                  wait_tree 1 "H[b*! c]"
kclose b
check "c alone"                             wait_tree 1 "H[c*]"
check "c fills the monitor"                 geom_is c "0,0 1280x720"
check "c is active"                         poll active_is c

# B. The caption changes while fullscreen (a browser, a video ending): still tiled.
client --title r --retitle 2:rr
check "r tiled beside c"                    wait_tree 1 "H[c r*]"
m=$(mark)
on r 'w.fullScreen = true;'
check "r is fullscreen"                     wait_tree 1 "H[c r*!]" "$m"
check "retitled while fullscreen"           poll _has_window rr
check "nothing was floated"                 no_float "$m"
on rr 'w.fullScreen = false;'
# A reclassify that floats logs no FLOAT line: this is the check that sees it.
check "out of fullscreen: still tiled, two halves" wait_tree 1 "H[c rr*]" "$m"
check "rr is the right half"                geom_is rr "640,0 640x720"
kclose rr

# Decision 2: the fullscreen window's own dialog, opened during fullscreen, is shown and focused.
client --title p --color green --dialog --dialog-delay 1.5
check "p tiled beside c"                    wait_tree 1 "H[c p*]"
m=$(mark)
on p 'w.fullScreen = true;'
check "p is fullscreen"                     wait_tree 1 "H[c p*!]" "$m"
check "its dialog floats"                   wait_tree 1 "H[c p!] ~p_dialog*" "$m"
check "the dialog is active"                poll active_is "p dialog"
check "the dialog is on top"                top_is "p dialog"
check "p was not floated"                   no_float "$m"
kclose "p dialog"
check "p focused again"                     poll active_is p
check "p still fullscreen, full size"       geom_is p "0,0 1280x720"

# A workspace switch and back: the tree is unchanged, p keeps the focus.
key "Workspace 3"
check "the monitor shows 3"                 poll shows Virtual-0 3
key "Workspace 1"
check "back on 1: unchanged"                wait_tree 1 "H[c p*!]"
check "p active"                            poll active_is p

# A newcomer sent to the hidden fullscreen workspace: no focus stolen, no desktop switched.
key "Workspace 3"
client --title e
check "e on 3"                              wait_tree 3 "H[e*]"
m=$(mark)
key "Move to Workspace 1"
check "e behind p on 1"                     wait_tree 1 "H[c p! e]" "$m"
check "the monitor still shows 3"           shows Virtual-0 3
# A hidden window never acknowledges a configure, so KWin never clears p's w.tile here; a second
# pass deciding from w.tile would see p in its old tile, rebuild, be refused and schedule again,
# for ever (review finding 1). kwin-i3 keeps its own record of a window out of the tiles.
sleep 0.5
trees_at_most() { (( $(after "$1" | grep -cE '^.{9}TREE 1 ') <= $2 )); }
check "a few passes, no spin on the hidden workspace" trees_at_most "$m" 4
key "Workspace 1"
check "p active again on 1"                 poll active_is p
check "p on top"                            top_is p

# A reload with a fullscreen window and an unrelated active window: focus untouched.
key "Workspace 2"
client --title z
check "z on 2, active"                      poll active_is z
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "after the reload z is still active"  active_is z
# The reload rebuilds the tree from KWin's tiles, which p is out of, so p comes back at the end
# of the row (still in the tree, still fullscreen; it joins the tiles there when it ends).
check "1 is as it was, p last"              wait_tree 1 "H[c e p!]"

# i3's popup_during_fullscreen (§10 V6, redo stage 8), on workspace 5: for each value, f goes
# fullscreen (its own dialog 3 s after it opens), o opens behind it (its dialog 1 s after).
# o's dialog: smart and ignore leave the focus with f; leave_fullscreen ends f's fullscreen
# (the dialog opens without the focus); all gives the dialog (floating) the focus. Then f's own
# dialog: smart and all focus it; ignore would not, but it is modal, and KWin activates a
# window's modal dialog in its place (activation.cpp:373, findModal: kept, ≠ i3, §5 C5); under
# leave_fullscreen f is no longer fullscreen by then, so it opens as any dialog.
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }
reload_settings() { local m; m=$(mark); key "Reload Settings"; wait_log '^.{9}SETTINGS ' "$m"; }
slow_poll() { WAIT=10 poll "$@"; }
fs_is() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.fullScreen); })")" == "$2" ]]; }
key "Workspace 5"
for v in smart ignore leave_fullscreen all; do
    set_key popupDuringFullscreen $v; reload_settings
    client --title "f$v" --color blue --dialog --dialog-delay 6
    check "$v: f opens on 5"                wait_tree 5 "H[f$v*]"
    on "f$v" 'w.fullScreen = true;'
    check "  f fullscreen"                  wait_tree 5 "H[f$v*!]"
    client --title "o$v" --dialog --dialog-delay 1
    check "  o opens behind f, f keeps the focus" poll eval '[[ "$(tree 5)" == *"o$v"* ]] && active_is "f$v"'
    check "  o's dialog opens"              poll _has_window "o$v dialog"
    sleep 0.3
    case $v in
        smart|ignore) check "  $v: f keeps the focus over it" poll active_is "f$v"
                      check "    f still fullscreen"  fs_is "f$v" true ;;
        # kwin-i3 hands the focus back to f (i3: the dialog opens without it); then the GTK dialog's
        # own activation request (xdg-activation, as GTK presents a dialog) is honoured by KWin now
        # that no fullscreen window protects the focus (activation.cpp allowWindowActivation), as
        # i3's focus_on_window_activation smart would honour it: the dialog ends up focused.
        leave_fullscreen) check "  leave_fullscreen: f leaves fullscreen" poll fs_is "f$v" false
                      check "    f got the focus back, then the dialog's own request took it" wait_log "^.{9}FULLSCREEN f$v: keeps the focus over o$v dialog"
                      check "    the dialog focused"  poll active_is "o$v dialog" ;;
        all)          check "  all: the dialog (floating) takes the focus" poll active_is "o$v dialog"
                      check "    f still fullscreen"  fs_is "f$v" true ;;
    esac
    kclose "o$v dialog"
    check "  f's own dialog opens"          slow_poll _has_window "f$v dialog"
    sleep 0.3
    case $v in
        smart|all)    check "  $v: f's own dialog takes the focus" poll active_is "f$v dialog" ;;
        ignore)       check "  ignore: f's own modal dialog takes it all the same (KWin's modal rule)" poll active_is "f$v dialog" ;;
        leave_fullscreen) check "  (f not fullscreen: its dialog focused as any)" poll active_is "f$v dialog" ;;
    esac
    kclose "f$v dialog"; kclose "o$v"; kclose "f$v"
    check "  5 empty again"                 wait_tree 5 "H[]*"
done
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key popupDuringFullscreen --delete; reload_settings
key "Workspace 1"

# A fullscreen window KWin keeps in its tile (no rebuild since, as Firefox alone on its
# workspace) and a padding change: KWin's Tile::setPadding resizes every window in the tile,
# fullscreen or not, and the refit skipped fullscreen windows, so it stayed fullscreen at its
# tile's size, the wallpaper around it (Paul's capture 2026-10-27 03:45, after a reload: the new
# instance wrote padding 4, then 6 once the effect answered). A gap or frame-width change that
# keeps the inset does the same.
fills_output() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry, o = w.output.geometry; log(f.x === o.x && f.y === o.y && f.width === o.width && f.height === o.height); } })")" == "true" ]]; }
in_tile() { [[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.tile !== null); })")" == "true" ]]; }
# The padding goes on the root tile of f2's own monitor: KWin resizes only the windows of a tile
# on a shown desktop (Tile::isActive), so the wrong monitor's tile tested nothing.
pad_f2_root() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"f2\") workspace.rootTile(w.output, workspace.desktops[3]).padding = $1; })" >/dev/null; }
key "Workspace 4"
client --title f1; client --title f2
check "two windows on 4"                    wait_tree 4 "H[f1 f2*]"
on f2 'w.fullScreen = true;'
check "f2 is fullscreen"                    wait_tree 4 "H[f1 f2*!]"
check "f2 fills its monitor"                poll fills_output f2
check "f2 is still in its tile"             in_tile f2
# What the reloaded instance did: another padding on the tiles (it wrote 4 over 6, KWin resizing
# every window in them), then a pass of kwin-i3's that writes its own back.
pad_f2_root 10
m=$(mark); key "Focus Mode Toggle"; wait_log '^.{9}TREE 4 ' "$m"; sleep 0.5
check "kwin-i3's padding back: f2 still fills its monitor" fills_output f2
# The same with f2 answering after the pass, as Firefox did on a reload (Paul's capture
# 2026-10-28 20:06): KWin changes the frame only when the client answers, so the pass saw the
# monitor-sized frame, and f2 reached its tile's size afterwards. Stopped, it answers only at -CONT.
f2pid=$(pgrep -f "testclient.py --title f2" | head -1)
kill -STOP "$f2pid"
pad_f2_root 10
m=$(mark); key "Focus Mode Toggle"; wait_log '^.{9}TREE 4 ' "$m"; sleep 0.3
kill -CONT "$f2pid"
sleep 0.5
check "answering after the pass: f2 still fills its monitor" poll fills_output f2
on f2 'w.fullScreen = false;'
check "out of fullscreen: two halves again" wait_tree 4 "H[f1 f2*]"

check "no invariant failures or errors"     clean_log
finish
