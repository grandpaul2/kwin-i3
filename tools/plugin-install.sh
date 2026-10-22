#!/usr/bin/env bash
# make plugin-install: put the built kwini3mouse into a user plugin dir and (re)load it in the
# running KWin, without a relog (docs/mouse-plugin-design.md, "Building, installing, upkeep").
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
root=${KI3_PLUGIN_ROOT:-$HOME/.local/lib/kwin-i3/qt6plugins}
dir=$root/kwin/plugins
[[ -f $built ]] || { echo "plugin-install: no $built (make plugin)" >&2; exit 1; }

mkdir -p "$dir"
name=kwini3mouse-$(sha1sum "$built" | cut -c1-12).so
if [[ ! -f $dir/$name ]]; then
    install -m 644 "$built" "$dir/.$name.tmp"
    mv "$dir/.$name.tmp" "$dir/$name"
fi
for f in "$dir"/kwini3mouse*.so; do [[ $f == "$dir/$name" ]] || rm -f "$f"; done
echo "installed $dir/$name"

if [[ -z ${KI3_PLUGIN_ROOT:-} ]]; then
    dropin=$HOME/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf
    want="[Service]
Environment=QT_PLUGIN_PATH=$root"
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
id=${name%.so}
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
