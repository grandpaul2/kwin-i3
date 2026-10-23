#!/usr/bin/env bash
# A private, headless KWin for tests: its own D-Bus session, its own config dirs, its own Wayland
# socket, two virtual 1280x720 outputs side by side. Nothing appears on Paul's screens and nothing
# reads his config. Several can run at once (tests/live/run.sh runs scenarios in parallel).
#   tools/testkwin.sh <command...>       runs the command inside it, then tears it all down
#   KI3_XWAYLAND=1                       also start Xwayland, for X11 clients (DISPLAY is set);
#                                        finding its display is not parallel-safe
#   KI3_SHOW_KWIN=1                      print the test KWin's own output at the end
#   KI3_TIMEOUT=<s>                      the whole run's limit (default 120; the fuzzer sets its own)
#   KI3_PLUGIN=<dir>                     a Qt plugin dir holding kwin/plugins/kwini3mouse.so and
#                                        kwin/effects/plugins/kwini3hold.so (make plugin:
#                                        plugin/build/bin) for the test KWin to load
# Inside the command: WAYLAND_DISPLAY is the test KWin, the session bus is private (so busctl
# --user reaches the test KWin), and KI3_LOG is the file tools/logsink.py writes.
#
# History, so it isn't undone:
# - The environment is set BEFORE the private bus starts: dbus-daemon hands its environment to
#   whatever it starts. The first version (2026-10-21) set it after, and the portals and ksecretd
#   the test bus started pointed at Paul's real display and config.
# - The private bus starts NO services (a bus config with no service directories). With them, every
#   test window started xdg-desktop-portal-kde on the test bus, which aborted when the test KWin
#   went away: 22 core dumps in a night, each a "Service Crash" notification on Paul's desktop
#   (2026-10-22). KWin and the GTK test client run fine without a portal.
# - Teardown stops the clients first, then KWin (waiting for it), then anything left on the bus.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)

if [[ "${KI3_INNER:-}" != 1 ]]; then
    tmp=$(mktemp -d /tmp/kwin-i3-test.XXXXXX)
    trap 'rm -rf "$tmp"' EXIT
    export KI3_TMP=$tmp KI3_INNER=1
    export XDG_CONFIG_HOME=$tmp/config XDG_DATA_HOME=$tmp/data XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache
    export WAYLAND_DISPLAY=ki3test-${tmp##*.}
    unset DISPLAY XAUTHORITY
    # Only the plugin a test asks for, never one from the caller's environment.
    if [[ -n ${KI3_PLUGIN:-} ]]; then export QT_PLUGIN_PATH=$KI3_PLUGIN; else unset QT_PLUGIN_PATH; fi
    # No system bus: the test KWin read Paul's session lock state through it, and while his screen
    # was locked nothing tiled and input was swallowed (input-test review, 2026-10-22).
    export DBUS_SYSTEM_BUS_ADDRESS=unix:path=/nonexistent/none
    mkdir -p "$XDG_CONFIG_HOME"
    cat > "$tmp/bus.conf" <<'CONF'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
CONF
    status=0
    timeout "${KI3_TIMEOUT:-120}" dbus-run-session --config-file="$tmp/bus.conf" -- "$0" "$@" \
        2> >(grep -vE 'dbus-daemon\[|dbind-WARNING|AT-SPI' >&2) || status=$?
    exit $status
fi

tmp=$KI3_TMP
bus=$DBUS_SESSION_BUS_ADDRESS
kwin=""
on_bus() {   # pids attached to the test bus, except this script
    for p in $(pgrep -u "$(id -u)" .); do
        [[ $p == $$ ]] && continue
        { tr '\0' '\n' < /proc/$p/environ; } 2>/dev/null | grep -qxF "DBUS_SESSION_BUS_ADDRESS=$bus" && echo "$p"
    done
}
teardown() {
    # 1: the command's clients (everything on the bus but KWin and the log sink)
    for p in $(on_bus); do [[ $p == "$kwin" || $p == "${sink:-}" ]] || kill "$p" 2>/dev/null || true; done
    # 2: KWin itself, and wait for it to finish
    if [[ -n $kwin ]]; then
        kill "$kwin" 2>/dev/null || true
        for _ in $(seq 30); do kill -0 "$kwin" 2>/dev/null || break; sleep 0.1; done
    fi
    # 3: anything still there
    for p in $(on_bus); do kill "$p" 2>/dev/null || true; done
    wait 2>/dev/null || true
}
trap teardown EXIT

cat > "$XDG_CONFIG_HOME/kwinrc" <<'RC'
[Desktops]
Number=10
Rows=1

[Windows]
PerOutputVirtualDesktops=true
FocusPolicy=FocusFollowsMouse
NextFocusPrefersMouse=true
DelayFocusInterval=0

[ModifierOnlyShortcuts]
Meta=

[Script-kwin-i3]
debugLog=true
RC
# Paul's desktop unbinds these stock shortcuts (~/.dotfiles setup.sh keeps only its own list);
# the stock test KWin kept them, and they took kwin-i3's keys (Meta+arrows quick-tiled, Meta+L
# locked the test KWin, Meta+E launched Dolphin, Meta+0 reset the zoom). Focus settings above are his too.
cat > "$XDG_CONFIG_HOME/kglobalshortcutsrc" <<'SC'
[kwin]
Window Quick Tile Left=none,Meta+Left,Quick Tile Window to the Left
Window Quick Tile Right=none,Meta+Right,Quick Tile Window to the Right
Window Quick Tile Top=none,Meta+Up,Quick Tile Window to the Top
Window Quick Tile Bottom=none,Meta+Down,Quick Tile Window to the Bottom
Switch One Desktop to the Left=none,Meta+Ctrl+Left,Switch One Desktop to the Left
Switch One Desktop to the Right=none,Meta+Ctrl+Right,Switch One Desktop to the Right
Switch One Desktop Up=none,Meta+Ctrl+Up,Switch One Desktop Up
Switch One Desktop Down=none,Meta+Ctrl+Down,Switch One Desktop Down
Window to Previous Screen=none,Meta+Shift+Left,Move Window to Previous Screen
Window to Next Screen=none,Meta+Shift+Right,Move Window to Next Screen
view_actual_size=none,Meta+0,Zoom to Actual Size
view_zoom_in=none,Meta++,Zoom In
view_zoom_out=none,Meta+-,Zoom Out

[ksmserver]
Lock Session=none,Meta+L,Lock Session

[services][org.kde.dolphin.desktop]
_launch=none
SC
export KI3_LOG=$tmp/ki3.log
# Screenshots (tools/shot.py) without KWin's per-caller permission check: a test is not a
# desktop app with a .desktop file (docs/spec-atomic-layout.md, test 1).
export KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1
"$here/logsink.py" "$KI3_LOG" &
sink=$!
xbefore=$(ls /tmp/.X11-unix/)
kwin_wayland --virtual ${KI3_XWAYLAND:+--xwayland} --output-count 2 \
    --width 1280 --height 720 --socket "$WAYLAND_DISPLAY" >"$tmp/kwin.out" 2>&1 &
kwin=$!
up=""
# Up to 15 s: with every live scenario starting a KWin at once (15 since 2026-10-22), 5 s was
# too short for some (testkwin: KWin or the log sink did not start).
for _ in $(seq 150); do
    if [[ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ]] && busctl --user status org.kde.KWin >/dev/null 2>&1 &&
       busctl --user status net.local.kwini3.log >/dev/null 2>&1; then up=1; break; fi
    sleep 0.1
done
[[ -n $up ]] || { echo "testkwin: KWin or the log sink did not start" >&2; cat "$tmp/kwin.out" >&2; exit 1; }
if [[ -n "${KI3_XWAYLAND:-}" ]]; then
    # KWin picks the display number itself and starts Xwayland on the first connection, so
    # the display is the X socket that appeared after the test KWin started.
    for _ in $(seq 50); do
        new=$(comm -13 <(printf '%s\n' $xbefore | sort) <(ls /tmp/.X11-unix/ | sort) | head -1)
        [[ -n "$new" ]] && break
        sleep 0.2
    done
    [[ -n "$new" ]] || { echo "testkwin: no Xwayland socket appeared" >&2; exit 1; }
    export DISPLAY=:${new#X}
fi
status=0
"$@" || status=$?
[[ -n "${KI3_SHOW_KWIN:-}" ]] && cat "$tmp/kwin.out"
exit $status
