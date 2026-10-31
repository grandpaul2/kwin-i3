#!/usr/bin/env bash
# needs: xwayland
# timing: alone
# (its focus checks allow 1 s: in the batch, ~30 KWins share the GPU)
# needs: plugin
# Panel popups forgive a stray pointer: with focus follows mouse and no
# delay (the author's settings, as the test KWin has them), kwini3helper raises KWin's focus delay
# to 1.5 s while a panel popup has the focus, and puts the user's 0 back otherwise. The popup is
# a stand-in (tools/popupclient.py, an X11 window KWin classes as an applet popup: the test KWins
# have no Plasma panel); the pointer is moved with real input (tools/inject.py).
source "$(dirname "$0")/lib.sh"
active_is() { [[ "$(kjs 'log(workspace.activeWindow ? workspace.activeWindow.caption : "")')" == "$1" ]]; }
delay_is() { [[ "$(kjs 'log(options.delayFocusInterval)')" == "$1" ]]; }
activate() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
popup() { python3 -I "$root/tools/popupclient.py" --title "$1" --geometry 300x200+100+400 >/dev/null 2>&1 & pop_pid=$!; poll _has_window "$1"; }
click_at() { "$INJECT" "abs $1 $2" "wait 30" "btn left down" "wait 30" "btn left up" "wait 50"; }
since() { echo $(( $(date +%s%N) / 1000000 - $1 )); }      # ms since a mark
now() { echo $(( $(date +%s%N) / 1000000 )); }
# A prefix assignment can't go inside check (it would run as a command): the waits, named.
within() { local s=$1; shift; WAIT=$s poll "$@"; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "focus follows mouse, no delay"       eval '[[ "$(kjs "log(options.focusPolicy)")" == 1 ]] && delay_is 0'
client --title a
check "a tiles the first monitor (inside the frame)" wait_geom a "1,1 1278x718"

# 1. The popup has the focus: the delay is the grace.
point 250 500
popup pop
activate pop
point 260 510                               # it opened under a still pointer: now KWin has it over the popup
check "the stand-in popup is active"        poll active_is pop
check "the delay is 1.5 s while it is"      poll delay_is 1500

# 2. The pointer strays onto a and comes back within the grace: the popup keeps the focus.
point 900 300
sleep 0.5
check "0.5 s on a: the popup still has it"  active_is pop
point 250 500
sleep 1.5
check "back on the popup: it kept the focus" active_is pop

# 3. Left on a: a takes the focus after the grace, not before.
point 900 300; t=$(now)
check "left on a: a takes the focus"        within 4 active_is a
ms=$(since "$t")
check "after about 1.5 s (took ${ms} ms)"   test "$ms" -ge 1300 -a "$ms" -le 2500
check "a has it: the user's 0 is back"      poll delay_is 0

# 4. A click is deliberate: at once, grace or not.
point 250 500
check "onto the popup: it takes the focus at once (delay 0)" within 1 active_is pop
check "and the grace again"                 poll delay_is 1500
t=$(now); click_at 900 300
check "a click on a: a at once"             within 1 active_is a
check "in under 0.5 s (took $(since "$t") ms)" test "$(since "$t")" -le 500

# 5. With no popup open, focus follows the mouse at once, as before: b beside a.
kill "$pop_pid"; poll _no_window pop
client --title b
check "a, b side by side"                   wait_geom b "641,1 638x718"
# b opened under a still pointer, which KWin still counts as over a: hover b first.
point 1000 300
check "hovering b: b"                       within 1 active_is b
point 300 300; t=$(now)
check "onto a: at once"                     within 1 active_is a
' ' ')"
check "in under 0.3 s (took $(since "$t") ms)" test "$(since "$t")" -le 300

# 6. The plugin unloaded while a popup has the focus: the user's value is put back.
popup pop2
activate pop2
check "pop2 active, the grace on"           poll delay_is 1500
for p in $(busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins | grep -oE '"kwini3helper[^"]*"' | tr -d '"'); do
    busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins UnloadPlugin s "$p" >/dev/null
done
check "unloaded: the delay is the user's 0" poll delay_is 0

check "no invariant failures or errors"     clean_log
finish

