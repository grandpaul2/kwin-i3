#!/usr/bin/env bash
# A private, headless KWin for tests: its own D-Bus session, its own config dirs, two virtual
# 1280x720 outputs side by side. Nothing appears on Paul's screens and nothing reads his config.
#   tools/testkwin.sh <command...>       runs the command inside it, then tears it all down
#   KI3_XWAYLAND=1                       also start Xwayland, for X11 clients (DISPLAY is set)
#   KI3_SHOW_KWIN=1                      print the test KWin's own output at the end
# Inside the command: WAYLAND_DISPLAY is the test KWin, the session bus is private (so busctl
# --user reaches the test KWin), and KI3_LOG is the file tools/logsink.py writes.
#
# The environment is set BEFORE the private bus starts, because dbus-daemon hands its own
# environment to every service it activates. On 2026-10-21 the first version set it after: the
# portals and ksecretd that the test bus activated pointed at Paul's real display and config,
# and outlived the test. Teardown now also stops everything attached to the test bus, and the
# command's own background children, so a client left running can't hold the test open.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)

if [[ "${KI3_INNER:-}" != 1 ]]; then
    tmp=$(mktemp -d /tmp/kwin-i3-test.XXXXXX)
    trap 'rm -rf "$tmp"' EXIT
    export KI3_TMP=$tmp KI3_INNER=1
    export XDG_CONFIG_HOME=$tmp/config XDG_DATA_HOME=$tmp/data XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache
    export WAYLAND_DISPLAY=ki3test
    unset DISPLAY XAUTHORITY
    mkdir -p "$XDG_CONFIG_HOME"
    status=0
    timeout 120 dbus-run-session -- "$0" "$@" 2> >(grep -vE 'dbus-daemon\[|dbind-WARNING|AT-SPI' >&2) || status=$?
    exit $status
fi

tmp=$KI3_TMP
bus=$DBUS_SESSION_BUS_ADDRESS
teardown() {
    kill $(jobs -p) 2>/dev/null || true
    # Everything else on the test bus: the command's clients, and what the bus activated
    # (portals, ksecretd, ...). Found by bus address, so nothing of the real session matches.
    for p in $(pgrep -u "$(id -u)" .); do
        [[ $p == $$ ]] && continue
        { tr '\0' '\n' < /proc/$p/environ; } 2>/dev/null | grep -qxF "DBUS_SESSION_BUS_ADDRESS=$bus" && kill $p 2>/dev/null
    done
    wait 2>/dev/null || true
}
trap teardown EXIT

cat > "$XDG_CONFIG_HOME/kwinrc" <<'RC'
[Desktops]
Number=4
Rows=1

[Windows]
PerOutputVirtualDesktops=true
RC
export KI3_LOG=$tmp/ki3.log
"$here/logsink.py" "$KI3_LOG" &
xbefore=$(ls /tmp/.X11-unix/)
kwin_wayland --virtual ${KI3_XWAYLAND:+--xwayland} --output-count 2 \
    --width 1280 --height 720 --socket ki3test >"$tmp/kwin.out" 2>&1 &
for _ in $(seq 50); do
    [[ -S "$XDG_RUNTIME_DIR/ki3test" ]] && busctl --user status org.kde.KWin >/dev/null 2>&1 && break
    sleep 0.2
done
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
