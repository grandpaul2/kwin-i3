#!/usr/bin/env bash
# make plugin-install: put the built kwini3helper (a plugin) and kwini3hold (an effect, which also
# draws the frame) into a user plugin dir and (re)load them in the running KWin, without a relog.
# The kwini3frame decoration (until 2026-10-24) is removed, and if it
# was the selected decoration, Plasma's default (Breeze) is selected again.
#   KI3_PLUGIN_ROOT   the Qt plugin dir (default ~/.local/lib/kwin-i3/qt6plugins); KWin finds it
#                     through QT_PLUGIN_PATH, which a systemd drop-in gives KWin's unit only. The
#                     drop-in is written here; it takes effect at the next login, once. Set
#                     (tests): no drop-in.
# Each install is a new file (kwini3helper-<hash>.so, renamed in): KWin's plugin loader never
# unloads a library, so loading the same path again would bring back the old code, and writing
# over a mapped .so can crash KWin. The old file is unlinked (safe while mapped), the old id is
# unloaded and the new one loaded (the id is the file name). KWin refuses a build for another KWin version (the IID carries major.minor.patch).
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
built=${KI3_PLUGIN_SO:-$here/plugin/build/bin/kwin/plugins/kwini3helper.so}   # (tests: another build)
effect=${KI3_EFFECT_SO:-$here/plugin/build/bin/kwin/effects/plugins/kwini3hold.so}
root=${KI3_PLUGIN_ROOT:-$HOME/.local/lib/kwin-i3/qt6plugins}
dir=$root/kwin/plugins
edir=$root/kwin/effects/plugins
fdir=$root/org.kde.kdecoration3
[[ -f $built ]] || { echo "plugin-install: no $built (make plugin)" >&2; exit 1; }
[[ -f $effect ]] || { echo "plugin-install: no $effect (make plugin)" >&2; exit 1; }

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
id=$(place "$built" "$dir" kwini3helper)
rm -f "$dir"/kwini3mouse*.so          # its name until 2026-10-24
eid=$(place "$effect" "$edir" kwini3hold)

[[ -z ${KI3_PLUGIN_ROOT:-} ]] && "$here/tools/kwin-dropin.sh"

prop() { busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins "$1" 2>/dev/null; }
busctl --user status org.kde.KWin >/dev/null 2>&1 || { echo "no KWin on this bus: installed only"; exit 0; }
# A plugin's id is its file name (Qt ignores an "Id" in the metadata), so each build has its own.
# kwini3mouse: the same plugin under its name until 2026-10-24.
for old in $(prop LoadedPlugins | grep -oE '"kwini3(helper|mouse)[^"]*"' | tr -d '"'); do
    # not fatal: the new one must still load (review, 2026-10-24)
    [[ $old == "$id" ]] || busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins UnloadPlugin s "$old" || true
done
prop LoadedPlugins | grep -q "\"$id\"" ||
    busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins LoadPlugin s "$id" >/dev/null || true
if prop LoadedPlugins | grep -q "\"$id\""; then
    echo "loaded in KWin as $id"
elif prop AvailablePlugins | grep -q "\"$id\""; then
    echo "KWin sees $id but did not load it: built for another KWin version? (journalctl --user -b | grep kwini3helper)" >&2
    exit 1
else
    echo "KWin doesn't see $root yet: log out and in once (the drop-in), then it loads by itself"
fi

# The effect, through KWin's effects interface. Enabled by default (its id changes per build, so
# KWin's own <id>Enabled key can't be set once); the kill switch is kwinrc [Script-kwin-i3] holdEnabled.
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

# The retired decoration (kwini3frame, until 2026-10-24): if it is selected, Plasma's default
# decoration again (the key removed: KWin's default is Breeze), and a reconfigure re-decorates
# every window at once (DecorationBridge::reconfigure); then its files go. Not for a test root.
[[ -n ${KI3_PLUGIN_ROOT:-} ]] && exit 0
deco() { kreadconfig6 --file kwinrc --group org.kde.kdecoration2 --key library; }
if [[ "$(deco)" == kwini3frame* ]]; then
    kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library --delete
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
    echo "the kwini3frame decoration is retired: Plasma's default decoration is selected again"
fi
rm -f "$fdir"/kwini3frame*.so "$fdir"/kwini3frame.version
