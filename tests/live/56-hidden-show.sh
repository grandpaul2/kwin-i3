#!/usr/bin/env bash
# Paul's capture, 2026-10-24 19:10: a terminal sent to a hidden workspace (Meta+Shift+3) showed,
# when that workspace was next shown (Meta+3), as a small box for a moment, then at its tile.
# Every frame it shows on the way must be its tile.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
if [[ ${KI3_ALACRITTY:-} ]]; then alacritty --title t >/dev/null 2>&1 & poll _has_window t; else client --title t --size 300x200; fi
check "t tiles on workspace 1"              geom_is t "0,0 1280x720"

# Every frame t reports from here on, logged by a script that stays loaded.
f=$KI3_TMP/watch.js
cat > "$f" <<'EOF'
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "watch: " + s); }
workspace.windowList().forEach(function (w) {
    if (w.caption !== "t") return;
    w.frameGeometryChanged.connect(function () {
        var g = w.frameGeometry;
        log(Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height));
    });
    log("ready");
});
EOF
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting loadScript ss "$f" watch >/dev/null
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting start
check "watching t"                          wait_log '^.{9}watch: ready$'
w=$(mark)
key "Move to Workspace 3"
check "t sent to hidden workspace 3"        wait_tree 3 "H[t]"
key "Workspace 3"
check "Meta+3: t at its tile"               geom_is t "0,0 1280x720"
sleep 0.5                                   # any late frame lands in the log
frames=$(after "$w" | grep -E '^.{9}watch: ' | cut -c17-)
only_tile() { [[ -z "$(grep -v '^0,0 1280x720$' <<<"$frames")" ]] || { echo "    frames: $(tr '\n' ';' <<<"$frames")"; return 1; }; }
check "every frame on the way was its tile" only_tile

# Round 2: to a hidden workspace on the other monitor (sendClientToScreen too). t's frames may be
# its old tile, moved over, and then its new one; never its size from before it was tiled.
key "Focus Right"
key "Workspace 4"
client --title v
check "v on workspace 4, second monitor"    geom_is v "1280,0 1280x720"
key "Workspace 2"
check "workspace 4 hidden there"            wait_tree 4 "H[v]"
key "Focus Left"
check "back on t"                           wait_tree 3 "H[t*]"
w=$(mark)
key "Move to Workspace 4"
check "t sent to hidden workspace 4"        wait_tree 4 "H[v t]"
key "Workspace 4"
check "Meta+4: t has the right half of the second monitor" geom_is t "1920,0 640x720"
sleep 0.5
frames=$(after "$w" | grep -E '^.{9}watch: ' | cut -c17-)
no_small() { [[ -z "$(grep -vE ' (1280x720|640x720)$' <<<"$frames")" ]] || { echo "    frames: $(tr '\n' ';' <<<"$frames")"; return 1; }; }
check "every frame on the way was a tile's" no_small
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s watch >/dev/null
check "no invariant failures or errors"     clean_log
finish
