#!/usr/bin/env bash
# A private, headless KWin for tests: its own D-Bus session, its own config dirs, its own Wayland
# socket, two virtual 1280x720 outputs side by side. Nothing appears on Paul's screens and nothing
# reads his config. Several can run at once (tests/live/run.sh runs scenarios in parallel).
#   tools/testkwin.sh <command...>       runs the command inside it, then tears it all down
#   KI3_XWAYLAND=1                       also start Xwayland, for X11 clients (DISPLAY is set);
#                                        finding its display is not parallel-safe
#   KI3_SHOW_KWIN=1                      print the test KWin's own output at the end
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
    timeout 120 dbus-run-session --config-file="$tmp/bus.conf" -- "$0" "$@" \
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

[Script-kwin-i3]
debugLog=true
RC
export KI3_LOG=$tmp/ki3.log
"$here/logsink.py" "$KI3_LOG" &
sink=$!
xbefore=$(ls /tmp/.X11-unix/)
kwin_wayland --virtual ${KI3_XWAYLAND:+--xwayland} --output-count 2 \
    --width 1280 --height 720 --socket "$WAYLAND_DISPLAY" >"$tmp/kwin.out" 2>&1 &
kwin=$!
up=""
for _ in $(seq 50); do
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
