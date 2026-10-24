#!/usr/bin/env bash
# The systemd drop-in for KWin's unit, written by make plugin-install and make kcm-install alike:
# QT_PLUGIN_PATH for KWin (the plugins' dir), and tools/frame-guard.sh before every KWin start.
# Environment= replaces the session's QT_PLUGIN_PATH for KWin, and every app KWin launches (an
# app on a global shortcut: kglobalaccel runs in KWin) inherits KWin's, so the settings page's dir
# goes in too when it is installed; without it, such a System Settings lacks the page
# (docs/spec-settings-page.md, 2026-10-24). Takes effect at the next login.
#   HOME, KI3_PLUGIN_ROOT, KI3_KCM_ROOT as the two install scripts have them.
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
plugins=${KI3_PLUGIN_ROOT:-$HOME/.local/lib/kwin-i3/qt6plugins}
kcm=${KI3_KCM_ROOT:-$HOME/.local/lib/kwin-i3/kcm-plugins}
path=""
[[ -d $plugins ]] && path=$plugins
[[ -f $kcm/plasma/kcms/systemsettings/kcm_kwin_i3.so ]] && path=${path:+$path:}$kcm
[[ -n $path ]] || exit 0
dropin=$HOME/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf
want="[Service]
Environment=QT_PLUGIN_PATH=$path
ExecStartPre=-$here/tools/frame-guard.sh"
if [[ "$(cat "$dropin" 2>/dev/null)" != "$want" ]]; then
    mkdir -p "$(dirname "$dropin")"
    printf '%s\n' "$want" > "$dropin"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "wrote $dropin (KWin reads it at the next login)"
fi
