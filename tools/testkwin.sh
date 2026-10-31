#!/usr/bin/env bash
# A private, headless KWin for tests: its own D-Bus session, its own config dirs, its own Wayland
# socket, two virtual 1280x720 outputs side by side. Nothing appears on the live screens and nothing
# reads the live config. Several can run at once (tests/live/run.sh runs scenarios in parallel).
#   tools/testkwin.sh <command...>       runs the command inside it, then tears it all down
#   KI3_XWAYLAND=1                       also start Xwayland, for X11 clients (DISPLAY is set);
#                                        its display search runs under a lock, one at a time
#   KI3_SHOW_KWIN=1                      print the test KWin's own output at the end
#   KI3_DESKTOPS=<n>                     the test KWin's virtual desktops (default 10; stock is 1)
#   KI3_PEROUTPUT=true|false             per-output desktops (default true; stock is false)
#   KI3_OUTPUTS=<n>                      the number of outputs (default 2; 1 is a laptop's screen)
#   KI3_SCALE=<s>                        each output's scale (default 1; 2 or 1.5 for HiDPI): the
#                                        pixels grow, each output stays 1280x720 logical, so the
#                                        scenarios' geometry holds (OPEN.md item 50)
#   KI3_STOCK=1                          Plasma's stock settings instead of the author's: stock
#                                        shortcuts and focus; the caller
#                                        sets KI3_DESKTOPS and KI3_PEROUTPUT (run.sh: 1, true)
#   KI3_FOCUS=mouse                      with KI3_STOCK=1: focus follows mouse after all
#   KI3_TIMEOUT=<s>                      the whole run's limit (default 120; the fuzzer sets its own)
#   KI3_PACKAGE=1                        kwin-i3 installed as a package (off), as KWin Scripts sees it
#   KI3_KEEP_LOG=<file>                  kwin-i3's log copied there at teardown (run.sh: a red
#                                        scenario's log is kept)
#   KI3_PLUGIN=<dir>                     a Qt plugin dir holding kwin/plugins/kwini3helper.so and
#                                        kwin/effects/plugins/kwini3hold.so (make plugin:
#                                        plugin/build/bin) for the test KWin to load
# Inside the command: WAYLAND_DISPLAY is the test KWin, the session bus is private (so busctl
# --user reaches the test KWin), and KI3_LOG is the file tools/logsink.py writes.
#
# History, so it isn't undone:
# - The environment is set BEFORE the private bus starts: dbus-daemon hands its environment to
#   whatever it starts. The first version (2026-10-21) set it after, and the portals and ksecretd
#   the test bus started pointed at the live display and config.
# - The private bus starts NO services (a bus config with no service directories). With them, every
#   test window started xdg-desktop-portal-kde on the test bus, which aborted when the test KWin
#   went away: 22 core dumps in a night, each a "Service Crash" notification on the live desktop
#   (2026-10-22). KWin and the GTK test client run fine without a portal.
# - Teardown stops the clients first, then KWin (waiting for it), then anything left on the bus.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)

if [[ "${KI3_INNER:-}" != 1 ]]; then
    tmp=$(mktemp -d /tmp/kwin-i3-test.XXXXXX)
    trap 'rm -rf "$tmp"' EXIT
    export KI3_TMP=$tmp KI3_INNER=1
    # A Plasma session's own variables, whoever starts the test: without them Qt loads no KDE
    # platform theme, and KWin and the apps get Qt's fonts and style (over ssh on the Arch laptop,
    # 2026-10-29: Breeze's title bar 36 px, not 28, and the settings page's spin boxes took no
    # typing). The desktop's tests had them only by inheriting the desktop session's.
    export XDG_CURRENT_DESKTOP=KDE KDE_FULL_SESSION=true KDE_SESSION_VERSION=6
    export XDG_CONFIG_HOME=$tmp/config XDG_DATA_HOME=$tmp/data XDG_STATE_HOME=$tmp/state XDG_CACHE_HOME=$tmp/cache
    export WAYLAND_DISPLAY=ki3test-${tmp##*.}
    unset DISPLAY XAUTHORITY
    # Only the plugin a test asks for, never one from the caller's environment.
    if [[ -n ${KI3_PLUGIN:-} ]]; then export QT_PLUGIN_PATH=$KI3_PLUGIN; else unset QT_PLUGIN_PATH; fi
    # No system bus: the test KWin read the live session's lock state through it, and while that
    # screen was locked nothing tiled and input was swallowed (input-test review, 2026-10-22).
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
    [[ -n ${KI3_KEEP_LOG:-} && -f ${KI3_LOG:-} ]] && cp "$KI3_LOG" "$KI3_KEEP_LOG"
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

# Stock mode (KI3_STOCK=1) leaves out the author's focus settings and Meta-alone line, unless the
# scenario asks for focus follows mouse (KI3_FOCUS=mouse).
focus="FocusPolicy=FocusFollowsMouse
NextFocusPrefersMouse=true
DelayFocusInterval=0" meta="[ModifierOnlyShortcuts]
Meta="
if [[ ${KI3_STOCK:-} == 1 ]]; then
    meta=""
    [[ ${KI3_FOCUS:-} == mouse ]] || focus=""
fi
cat > "$XDG_CONFIG_HOME/kwinrc" <<RC
[Desktops]
Number=${KI3_DESKTOPS:-10}
Rows=1

[Windows]
PerOutputVirtualDesktops=${KI3_PEROUTPUT:-true}
$focus

$meta

[Script-kwin-i3]
debugLog=true
gapsInner=0
gapsOuter=0
RC
# Gaps pinned at 0, kwin-i3's default until 2026-10-25 (now 2 and 0): the scenarios' geometry is
# written for no gaps. 26-gaps deletes the keys to check the defaults.
# The decoration is Breeze, KWin's default; with the plugins the effect draws the frame around
# tiled windows.
# The author's desktop unbinds these stock shortcuts (its setup.sh keeps only its own list);
# the stock test KWin kept them, and they took kwin-i3's keys (Meta+arrows quick-tiled, Meta+L
# locked the test KWin, Meta+E launched Dolphin, Meta+0 reset the zoom). The focus settings above are that desktop's too.
# Stock mode keeps Plasma's shortcuts and frees the keys as the README does, by make take-keys
# (tests/live/lib.sh, load_kwin_i3).
[[ ${KI3_STOCK:-} == 1 ]] || cat > "$XDG_CONFIG_HOME/kglobalshortcutsrc" <<'SC'
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
Show Desktop=none,Meta+D,Peek at Desktop

[ksmserver]
Lock Session=none,Meta+L,Lock Session

[services][org.kde.dolphin.desktop]
_launch=none

[services][org.kde.spectacle.desktop]
RecordRegion=none
SC
export KI3_LOG=$tmp/ki3.log
# Screenshots (tools/shot.py) without KWin's per-caller permission check: a test is not a
# desktop app with a .desktop file.
export KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1
"$here/logsink.py" "$KI3_LOG" &
sink=$!
# KI3_PACKAGE=1: kwin-i3 installed as a package, where KWin Scripts finds it (off, as
# metadata.json's EnabledByDefault has it). Before KWin starts: KPackage caches the list of
# packages at KWin's first look, so one linked later is never seen, and turning it on does nothing
# (found by 37-settings-page.sh, 2026-10-24). Only when asked: KWin unloads a listed package that
# isn't turned on whenever it rescans (every kjs), and the other scenarios load main.js by
# loadScript under the same name, without turning it on.
if [[ ${KI3_PACKAGE:-} == 1 ]]; then
    mkdir -p "$XDG_DATA_HOME/kwin/scripts"
    ln -s "$(dirname "$here")/package" "$XDG_DATA_HOME/kwin/scripts/kwin-i3"
fi
# The display is found as the X socket that appears while this KWin starts (below), so two test
# KWins with Xwayland starting at once could each take the other's: one at a time, from the list
# before to the socket found. The lock goes with this shell's fd 9 (OPEN.md item 34 (a)).
if [[ -n "${KI3_XWAYLAND:-}" ]]; then
    exec 9>/tmp/kwin-i3-test-xwayland.lock
    flock 9
fi
xbefore=$(ls /tmp/.X11-unix/)
kwin_wayland --virtual ${KI3_XWAYLAND:+--xwayland} --output-count "${KI3_OUTPUTS:-2}" --scale "${KI3_SCALE:-1}" \
    --width 1280 --height 720 --socket "$WAYLAND_DISPLAY" >"$tmp/kwin.out" 2>&1 9>&- &
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
# KI3_SCALE: --scale alone doesn't stick (KWin 6.7.5: its output config store sets a virtual
# output, which has no physical size, back to scale 1 with the pixels kept), so kscreen-doctor sets
# it, its backend in-process (the private bus starts no kscreen service), and places the outputs
# side by side again (they kept their pixel positions: Virtual-1 at x=1920 for 1.5).
if [[ ${KI3_SCALE:-1} != 1 ]]; then
    for o in $(seq 0 $((${KI3_OUTPUTS:-2} - 1))); do args+=(output.Virtual-$o.scale.$KI3_SCALE output.Virtual-$o.position.$((o * 1280)),0); done
    KSCREEN_BACKEND_INPROCESS=1 kscreen-doctor "${args[@]}" >/dev/null 2>&1 ||
        { echo "testkwin: kscreen-doctor could not set scale $KI3_SCALE" >&2; exit 1; }
fi
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
    exec 9>&-
fi
status=0
"$@" || status=$?
[[ -n "${KI3_SHOW_KWIN:-}" ]] && cat "$tmp/kwin.out"
exit $status
