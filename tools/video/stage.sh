#!/usr/bin/env bash
# Inside tools/testkwin.sh (tools/video/record starts it): a Plasma desktop with kwin-i3, recorded
# while tools/video/play.py plays the script. Writes master.mkv and timeline.tsv to $KI3_VIDEO_OUT.
#
# - kactivitymanagerd is started by hand: the test bus starts no services, and without it
#   plasmashell runs but draws nothing.
# - Breeze Dark through plasma-apply-lookandfeel: the private config has no colour scheme, which
#   leaves app text dark on dark.
# - The recording's clock: GStreamer's master starts at its first frame, which KWin sends as the
#   stream starts; T0 is when the pipeline reports PLAYING, and play.py counts from it.
set -u
here=$(cd "$(dirname "$0")" && pwd)
here_live=$here/../../tests/live
source "$here_live/lib.sh"
out=$KI3_VIDEO_OUT
size=${KI3_SIZE:-1280x720}
pids=()
fail() { echo "stage: $*" >&2; status=1; }
status=0

# kwin-i3 at its defaults but one: the gap between windows 2 px wider (4), so each window's frame
# reads clearly on video. Read when the script loads.
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key gapsInner 4
load_kwin_i3
wait_log 'kwin-i3 loaded$' || fail "kwin-i3 did not load"

/usr/libexec/kactivitymanagerd >/dev/null 2>&1 & pids+=($!)
# kwin-i3's workspace widget, from this tree: the test KWin's data dir is its own.
mkdir -p "$XDG_DATA_HOME/plasma/plasmoids"
ln -sfn "$here/../../widget" "$XDG_DATA_HOME/plasma/plasmoids/net.local.kwini3.workspaces"
plasmashell --no-respawn >"$out/plasmashell.log" 2>&1 & pids+=($!)
panel() { kjs 'workspace.windowList().forEach(function (w) { if (w.resourceClass == "plasmashell" && w.dock) log(1); });' | grep -q 1; }
for _ in $(seq 40); do panel && break; sleep 0.5; done
panel || fail "plasmashell drew no panel"
plasma-apply-lookandfeel -a org.kde.breezedark.desktop >/dev/null 2>&1 || fail "Breeze Dark not applied"
# Milky Way, not Breeze Dark's blue: the focused window's blue frame would vanish against it.
plasma-apply-wallpaperimage /usr/share/wallpapers/MilkyWay >/dev/null 2>&1 || fail "wallpaper not applied"
# The panel as kwin-i3's own desktop has it, rebuilt by Plasma's desktop scripting rather than a
# copied appletsrc (which carries one machine's activity and screen ids): along the bottom, solid,
# 40 px; the launcher, the workspace widget, the task manager with no pinned apps, the tray, the
# clock, show desktop.
layout=$(busctl --user call org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell evaluateScript s '
panels().forEach(function (p) { p.remove(); });
var p = new Panel;
p.location = "bottom"; p.height = 40; p.floating = false;
var k = p.addWidget("org.kde.plasma.kickoff");
k.currentConfigGroup = ["General"]; k.writeConfig("icon", "plasma-symbolic");
p.addWidget("net.local.kwini3.workspaces");
var t = p.addWidget("org.kde.plasma.icontasks");
t.currentConfigGroup = ["General"]; t.writeConfig("launchers", "");
p.addWidget("org.kde.plasma.marginsseparator");
p.addWidget("org.kde.plasma.systemtray");
p.addWidget("org.kde.plasma.digitalclock");
p.addWidget("org.kde.plasma.showdesktop");
print("panel " + p.widgets().length);
' 2>&1)
[[ $layout == *"panel 7"* ]] || fail "the panel was not built: $layout"
for _ in $(seq 40); do panel && break; sleep 0.5; done
krunner --daemon >/dev/null 2>&1 & pids+=($!)
sleep 3                                     # the wallpaper's fade-in and the theme's repaint

# The pointer rests over the panel's empty middle, off the windows, until a step moves it.
export KI3_VIDEO_PARK="$(( ${size%x*} * 55 / 100 )),$(( ${size#*x} - 20 ))"
"$here/../inject.py" "abs ${KI3_VIDEO_PARK/,/ }" || fail "the pointer could not be parked"

if [[ $status == 0 ]]; then
    "$here/../bin/screencast" 0 0 "${size%x*}" "${size#*x}" --pointer >"$KI3_TMP/node" 2>"$out/screencast.log" &
    cast=$!
    for _ in $(seq 50); do [[ -s $KI3_TMP/node ]] && break; sleep 0.1; done
    [[ -s $KI3_TMP/node ]] || fail "no stream from KWin ($(cat "$out/screencast.log"))"
fi
if [[ $status == 0 ]]; then
    gst-launch-1.0 -e pipewiresrc path="$(cat "$KI3_TMP/node")" do-timestamp=true ! videoconvert ! \
        avenc_ffv1 ! matroskamux ! filesink location="$out/master.mkv" \
        > >(while IFS= read -r l; do printf '%s %s\n' "$EPOCHREALTIME" "$l"; done >"$out/gst.log") 2>&1 &
    gst=$!
    t0=""
    for _ in $(seq 100); do
        t0=$(awk '/Setting pipeline to PLAYING/ { print $1; exit }' "$out/gst.log" 2>/dev/null)
        [[ -n $t0 ]] && break; sleep 0.05
    done
    [[ -n $t0 ]] || fail "GStreamer never started"
fi
if [[ $status == 0 ]]; then
    python3 "$here/play.py" "$KI3_VIDEO_SCRIPT" "$out/timeline.tsv" "$t0" || fail "the script stopped"
fi

# Stop the recording (SIGINT: GStreamer finishes the file; any other signal leaves it unreadable).
if [[ -n ${gst:-} ]]; then
    kill -INT "$gst" 2>/dev/null
    for _ in $(seq 100); do kill -0 "$gst" 2>/dev/null || break; sleep 0.1; done
    kill -0 "$gst" 2>/dev/null && { kill "$gst"; fail "GStreamer did not finish the file"; }
fi
[[ -n ${cast:-} ]] && kill "$cast" 2>/dev/null
kill "${pids[@]}" 2>/dev/null
clean_log || fail "kwin-i3 logged a warning or error: the video would show a bug"
exit $status
