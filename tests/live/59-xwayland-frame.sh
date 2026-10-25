#!/usr/bin/env bash
# timing: alone
# needs: plugin
# needs: xwayland
# Xwayland apps get the frame as Wayland ones do (docs/spec-window-modes.md, decision 8): tiled,
# borderless and framed; floating, their decoration back; never the GTK 4 bounds request (X11 has
# no bounds). The X11 client is the GTK test client under GDK_BACKEND=x11.
source "$(dirname "$0")/lib.sh"
shot=$root/tools/shot.py
png=$KI3_TMP/shot.png
ACT=76,120,153; INACT=51,51,51; RED=255,0,0; BLUE=0,0,255
capture() { "$shot" capture Virtual-0 "$png"; }
px() { "$shot" probe "$png" "$1" "$2"; }
pix() { "$shot" same "$png" "$1" "$2" "$3" 2; }
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
x11() { GDK_BACKEND=x11 "$root/tools/testclient.py" "$@" >/dev/null 2>&1 & }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "frame on"                            wait_log '^.{9}FRAME on'
x11 --title x --color red
poll _has_window x
check "x is an X11 window"                  eval '[[ "$(kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"x\") log(String(w)); })")" == *X11Window* ]]'
client --title y --color blue
check "x | y"                               wait_tree 1 "H[x y*]"
check "x borderless"                        poll prop_is x noBorder true
check "x fills its tile, 1 px from the edges" geom_is x "1,1 638x718"
sleep 0.3; capture
echo "    row 360: $(px 0 360) $(px 1 360) | $(px 638 360) $(px 639 360) $(px 640 360)"
check "x's frame and app"                   eval 'pix 0 360 $INACT && pix 1 360 $RED && pix 638 360 $RED && pix 639 360 $INACT && pix 640 360 $ACT'
key "Focus Left"
key "Floating Toggle"
check "x floats"                            wait_tree 1 "H[y] ~x*"
check "floating x has its decoration"       poll prop_is x noBorder false
key "Floating Toggle"
check "x tiles again, borderless"           poll prop_is x noBorder true
before=$(geom x)
key "Fullscreen"
check "x fullscreen: the whole screen"      geom_is x "0,0 1280x720"
key "Fullscreen"
check "and back in its tile ($before)"      geom_is x "$before"
check "never the bounds request for X11"    eval '! grep -qE "^.{9}BOUNDS x" "$KI3_LOG"'
key "Release"
check "release: x's border back"            poll prop_is x noBorder false
check "no invariant failures or errors"     clean_log
finish
