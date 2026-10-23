#!/usr/bin/env bash
# make plugin-install: put the built kwini3mouse (a plugin), kwini3hold (an effect) and
# kwini3frame (a decoration) into a user plugin dir and (re)load them in the running KWin, without
# a relog (docs/mouse-plugin-design.md, "Building, installing, upkeep"; docs/spec-atomic-layout.md;
# docs/spec-decoration.md).
#   KI3_PLUGIN_ROOT   the Qt plugin dir (default ~/.local/lib/kwin-i3/qt6plugins); KWin finds it
#                     through QT_PLUGIN_PATH, which a systemd drop-in gives KWin's unit only. The
#                     drop-in is written here; it takes effect at the next login, once. Set
#                     (tests): no drop-in.
# Each install is a new file (kwini3mouse-<hash>.so, renamed in): KWin's plugin loader never
# unloads a library, so loading the same path again would bring back the old code, and writing
# over a mapped .so can crash KWin. The old file is unlinked (safe while mapped), the old id is
# unloaded and the new one loaded (the id is the file name). KWin refuses a build for another KWin version (the IID carries major.minor.patch).
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
built=${KI3_PLUGIN_SO:-$here/plugin/build/bin/kwin/plugins/kwini3mouse.so}   # (tests: another build)
effect=${KI3_EFFECT_SO:-$here/plugin/build/bin/kwin/effects/plugins/kwini3hold.so}
frame=${KI3_FRAME_SO:-$here/plugin/build/bin/org.kde.kdecoration3/kwini3frame.so}
frameversion=${KI3_FRAME_VERSION:-$here/plugin/build/kdecoration.version}
root=${KI3_PLUGIN_ROOT:-$HOME/.local/lib/kwin-i3/qt6plugins}
dir=$root/kwin/plugins
edir=$root/kwin/effects/plugins
fdir=$root/org.kde.kdecoration3
[[ -f $built ]] || { echo "plugin-install: no $built (make plugin)" >&2; exit 1; }
[[ -f $effect ]] || { echo "plugin-install: no $effect (make plugin)" >&2; exit 1; }
[[ -f $frame ]] || { echo "plugin-install: no $frame (make plugin)" >&2; exit 1; }

# place <built .so> <dir> <base>: a new file per build, the old ones gone; prints the new id.
place() {
    local built=$1 dir=$2 base=$3 name
    mkdir -p "$dir"
    name=$base-$(sha1sum "$built" | cut -c1-12).so
    if [[ ! -f $dir/$name ]]; then
        install -m 644 "$built" "$dir/.$name.tmp"
        mv "$dir/.$name.tmp" "$dir/$name"
    fi
    for f in "$dir/$base"*.so; do [[ $f == "$dir/$name" ]] || rm -f "$f"; done
    echo "installed $dir/$name" >&2
    echo "${name%.so}"
}
id=$(place "$built" "$dir" kwini3mouse)
eid=$(place "$effect" "$edir" kwini3hold)
fid=$(place "$frame" "$fdir" kwini3frame)
# The decoration has no version check of its own (its plugin interface carries no version), and
# a build against another kdecoration can crash KWin at every login. The kdecoration version it
# was built against sits next to it, for tools/frame-guard.sh (run before every KWin start, the
# drop-in below) and for the check here.
install -m 644 "$frameversion" "$fdir/kwini3frame.version"

if [[ -z ${KI3_PLUGIN_ROOT:-} ]]; then
    dropin=$HOME/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf
    want="[Service]
Environment=QT_PLUGIN_PATH=$root
ExecStartPre=-$here/tools/frame-guard.sh"
    if [[ "$(cat "$dropin" 2>/dev/null)" != "$want" ]]; then
        mkdir -p "$(dirname "$dropin")"
        printf '%s\n' "$want" > "$dropin"
        systemctl --user daemon-reload
        echo "wrote $dropin (KWin reads it at the next login)"
    fi
fi

prop() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins "$1" 2>/dev/null; }
busctl --user status org.kde.KWin >/dev/null 2>&1 || { echo "no KWin on this bus: installed only"; exit 0; }
# A plugin's id is its file name (Qt ignores an "Id" in the metadata), so each build has its own.
for old in $(prop LoadedPlugins | grep -o '"kwini3mouse[^"]*"' | tr -d '"'); do
    [[ $old == "$id" ]] || busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins UnloadPlugin s "$old"
done
prop LoadedPlugins | grep -q "\"$id\"" ||
    busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins LoadPlugin s "$id" >/dev/null || true
if prop LoadedPlugins | grep -q "\"$id\""; then
    echo "loaded in KWin as $id"
elif prop AvailablePlugins | grep -q "\"$id\""; then
    echo "KWin sees $id but did not load it: built for another KWin version? (journalctl --user -b | grep kwini3mouse)" >&2
    exit 1
else
    echo "KWin doesn't see $root yet: log out and in once (the drop-in), then it loads by itself"
fi

# The effect, through KWin's effects interface. Enabled by default (its id changes per build, so
# KWin's own <id>Enabled key can't be set once); the kill switch is kwinrc [kwin-i3-hold] Enabled.
eff() { busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects "$@"; }
for old in $(busctl --user get-property org.kde.KWin /Effects org.kde.kwin.Effects loadedEffects | grep -o '"kwini3hold[^"]*"' | tr -d '"'); do
    [[ $old == "$eid" ]] || eff unloadEffect s "$old" >/dev/null
done
if [[ "$(eff isEffectLoaded s "$eid")" != "b true" ]]; then
    eff loadEffect s "$eid" >/dev/null 2>&1 || true
fi
if [[ "$(eff isEffectLoaded s "$eid")" == "b true" ]]; then
    echo "effect loaded in KWin as $eid"
else
    echo "KWin did not load the effect $eid (not seen yet, or built for another KWin version?)" >&2
fi

# The decoration: kwinrc [org.kde.kdecoration2] library=<id>, then a reconfigure, and KWin
# re-decorates every window at once (DecorationBridge::reconfigure). Only when the version the
# frame was built against is the installed kdecoration (frame-guard.sh is the same check at every
# login). The reconfigure is a 200 ms timer in KWin, so the result is polled. Not for a test root.
[[ -n ${KI3_PLUGIN_ROOT:-} ]] && exit 0
if ! "$here/tools/frame-guard.sh" --check "$fdir"; then
    echo "plugin-install: the frame is installed but NOT selected (kdecoration version mismatch: rebuild)" >&2
    exit 1
fi
deco() { kreadconfig6 --file kwinrc --group org.kde.kdecoration2 --key library; }
support() { busctl --user call org.kde.KWin /KWin org.kde.KWin supportInformation 2>/dev/null | grep -qF "Plugin: $1"; }
if [[ "$(deco)" != "$fid" ]]; then
    kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library "$fid"
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
fi
for _ in $(seq 50); do support "$fid" && break; sleep 0.1; done
if support "$fid"; then
    echo "decoration loaded in KWin as $fid"
else
    echo "KWin did not load the decoration $fid (journalctl --user -b | grep -i decoration); library= is set to it" >&2
    exit 1
fi
