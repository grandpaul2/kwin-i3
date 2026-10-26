#!/usr/bin/env bash
# timing: alone
# needs: plugin
# How tiled windows look (docs/spec-tiled-look.md): tiledLook frame (i3's ring, room for it in the
# tiles), bare (no border, no ring, no room; still rounded), titlebars (each its own decoration,
# no ring, no room). Switched live, back and forth; the maximize button does nothing in
# titlebars (as in sway), and a minimize keeps the window's place. No gaps (testkwin.sh), so the
# frame's room is all the padding there is. Pixels from tools/shot.py, as in 78.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
RED=255,0,0; LIME=0,255,0; ACT=76,120,153; INACT=51,51,51
capture() { sleep 0.3; "$shot" capture Virtual-0 "$png"; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 8; }
notpix() { ! pix "$@" >/dev/null 2>&1; }
fc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.frameGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height); } });"; }
cc() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") { var f = w.clientGeometry; log(f.x+','+f.y+' '+f.width+'x'+f.height); } });"; }
nob() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.noBorder); })"; }
ring() { busctl --user call org.kde.KWin /kwini3hold net.local.kwini3hold Stats | grep -o '"tiledRing" b [a-z]*' | awk '{print $3}'; }
term() { alacritty --title "$1" -o "colors.primary.background=\"$2\"" -o "window.padding={x=0,y=0}" -e sleep 600 >/dev/null 2>&1 & poll _has_window "$1"; }
set_key() { kwriteconfig6 --notify --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure; sleep 0.5; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "frame on"                            wait_log '^.{9}FRAME on'
term a "#ff0000"; term b "#00ff00"
check "a | b"                               wait_tree 1 "H[a b*]"
check "frame: a at 1,1, borderless"         poll eval '[[ "$(fc a)" == "1,1 638x718" && "$(nob a)" == true ]]'
check "  the ring on"                       poll eval '[[ "$(ring)" == true ]]'
capture
check "  a's ring at its left and top"      eval 'pix 0 360 $INACT && pix 300 0 $INACT && pix 1 360 $RED'

set_key tiledLook bare
check "bare: a at 0,0, the frame's room gone" poll eval '[[ "$(fc a)" == "0,0 640x720" && "$(fc b)" == "640,0 640x720" ]]' || echo "    a: $(fc a)  b: $(fc b)"
check "  still borderless"                  eval '[[ "$(nob a)" == true && "$(nob b)" == true ]]'
check "  the ring off"                      poll eval '[[ "$(ring)" == false ]]'
capture
check "  no ring: the windows to the edges" eval 'pix 0 360 $RED && pix 300 0 $RED && pix 639 360 $RED && pix 640 360 $LIME'
check "  still rounded"                     eval 'notpix 0 0 $RED && notpix 0 0 $INACT && pix 4 4 $RED'

set_key tiledLook titlebars
check "titlebars: decorated again"          poll eval '[[ "$(nob a)" == false && "$(nob b)" == false ]]'
check "  each frame its tile"               poll eval '[[ "$(fc a)" == "0,0 640x720" && "$(fc b)" == "640,0 640x720" ]]' || echo "    a: $(fc a)  b: $(fc b)"
read -r axy _ <<<"$(cc a)"; ay=${axy#*,}
echo "    a's client at $(cc a)"
check "  a title bar above the client"      eval '(( ${ay%.*} > 10 ))'
capture
check "  no ring, the title bar where it was" eval 'notpix 300 0 $INACT && notpix 300 0 $RED && notpix 300 0 $ACT'

# The maximize button (performWindowOperation's MaximizeOp, as a button or a double-click):
# nothing happens, a stays in its tile and the tree as it was.
key "Focus Left"
check "a focused"                           wait_tree 1 "H[a* b]"
kjs 'workspace.slotWindowMaximize();'
sleep 0.5
check "maximize: a back in its tile"        poll eval '[[ "$(fc a)" == "0,0 640x720" ]]' || echo "    a: $(fc a)"
check "  not maximized, the tree unchanged" eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"a\") log(w.maximizeMode); })")" == 0 && "$(tree 1)" == "H[a* b]" ]]'

# Minimize and restore: b fills the screen meanwhile, a comes back to its place.
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.minimized = true; });'
check "a minimized: b fills"                poll eval '[[ "$(fc b)" == "0,0 1280x720" ]]' || echo "    b: $(fc b)"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.minimized = false; });'
check "restored: a back on the left"        poll eval '[[ "$(fc a)" == "0,0 640x720" && "$(fc b)" == "640,0 640x720" ]]' || echo "    a: $(fc a)  b: $(fc b)"

# A floating window in titlebars keeps its decoration, and frameOnFloating still frames it.
key "Focus Right"
check "b focused"                           wait_tree 1 "H[a b*]"
key "Floating Toggle"
check "b floats, decorated"                 poll eval '[[ "$(tree 1)" == *"~b"* && "$(nob b)" == false ]]'
set_key frameOnFloating true
check "  frameOnFloating: b borderless"     poll eval '[[ "$(nob b)" == true ]]'
check "  tiled a keeps its title bar"       eval '[[ "$(nob a)" == false ]]'
set_key frameOnFloating false
check "  b decorated again"                 poll eval '[[ "$(nob b)" == false ]]'
key "Floating Toggle"
check "b tiled again"                       poll eval '[[ "$(tree 1)" == "H[a b*]" ]]'

set_key tiledLook frame
check "frame again: a at 1,1, borderless"   poll eval '[[ "$(fc a)" == "1,1 638x718" && "$(nob a)" == true && "$(nob b)" == true ]]' || echo "    a: $(fc a)"
check "  the ring on"                       poll eval '[[ "$(ring)" == true ]]'
capture
check "  the ring drawn"                    eval 'pix 0 360 $INACT && pix 1 360 $RED'

# The effect reloaded in bare: it starts with the ring on, and kwin-i3 tells it again.
set_key tiledLook bare
check "bare"                                poll eval '[[ "$(ring)" == false && "$(fc a)" == "0,0 640x720" ]]'
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s kwini3hold >/dev/null
check "frame off"                           wait_log '^.{9}FRAME off'
check "  title bars without the effect"     poll eval '[[ "$(nob a)" == false ]]'
busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects loadEffect s kwini3hold >/dev/null
check "frame on again"                      wait_log '^.{9}FRAME on' "$(($(mark) - 1))"
check "  told: no ring, borderless, no room" poll eval '[[ "$(ring)" == false && "$(nob a)" == true && "$(fc a)" == "0,0 640x720" ]]'
set_key tiledLook frame
check "no invariant failures or errors"     clean_log
finish
