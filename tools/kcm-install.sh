#!/usr/bin/env bash
# make kcm-install: put kwin-i3's System Settings page (kcm/, make kcm) where System Settings finds
# it (docs/spec-settings-page.md, decision B).
#   KI3_KCM_ROOT   the Qt plugin dir (default ~/.local/lib/kwin-i3/kcm-plugins). Its own dir, not
#                  the plugins' one: it goes on the whole session's QT_PLUGIN_PATH (environment.d),
#                  and the plugins' dir holds the frame decoration, which every app that lists
#                  decorations would then load (System Settings' Window Decorations page, unguarded
#                  by tools/frame-guard.sh). Set (tests): no environment.d file, no .desktop file.
# The .so is replaced by renaming a new file over it: a running System Settings may have the old one
# mapped. Its id is the file name, so it can't carry the plugins' hash suffix.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
built=$here/kcm/build/bin/plasma/kcms/systemsettings/kcm_kwin_i3.so
root=${KI3_KCM_ROOT:-$HOME/.local/lib/kwin-i3/kcm-plugins}
dir=$root/plasma/kcms/systemsettings
[[ -f $built ]] || { echo "kcm-install: no $built (make kcm)" >&2; exit 1; }

mkdir -p "$dir"
install -m 644 "$built" "$dir/.kcm_kwin_i3.so.tmp"
mv "$dir/.kcm_kwin_i3.so.tmp" "$dir/kcm_kwin_i3.so"
echo "installed $dir/kcm_kwin_i3.so"
[[ -n ${KI3_KCM_ROOT:-} ]] && exit 0
# KWin's own QT_PLUGIN_PATH (the plugins' drop-in) replaces the session's, and apps KWin launches
# inherit it: the page's dir goes in there too (tools/kwin-dropin.sh).
[[ -f $HOME/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf ]] && "$here/tools/kwin-dropin.sh"

# Its launcher (systemsettings kcm_kwin_i3), as a package would install it.
apps=${XDG_DATA_HOME:-$HOME/.local/share}/applications
mkdir -p "$apps"
install -m 644 "$here/kcm/build/kcm_kwin_i3.desktop" "$apps/kcm_kwin_i3.desktop"

envd=${XDG_CONFIG_HOME:-$HOME/.config}/environment.d/kwin-i3.conf
want="# kwin-i3's System Settings page (kwin-i3/tools/kcm-install.sh)
QT_PLUGIN_PATH=$root\${QT_PLUGIN_PATH:+:\$QT_PLUGIN_PATH}"
if [[ "$(cat "$envd" 2>/dev/null)" != "$want" ]]; then
    mkdir -p "$(dirname "$envd")"
    printf '%s\n' "$want" > "$envd"
    echo "wrote $envd (the session reads it at the next login)"
fi
if [[ ":$(systemctl --user show-environment | sed -n 's/^QT_PLUGIN_PATH=//p'):" != *":$root:"* ]]; then
    echo "System Settings shows kwin-i3 under Window Management after you log out and in once."
    echo "Until then: QT_PLUGIN_PATH=$root systemsettings kcm_kwin_i3"
fi
