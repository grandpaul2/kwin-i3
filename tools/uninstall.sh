#!/usr/bin/env bash
# make uninstall (docs/plan.md, "Install and first run"): every change kwin-i3 saved given back,
# then everything the install wrote removed, each named. What the user made stays, named with how
# to remove it: kwin-i3's settings (kwinrc [Script-kwin-i3]) and bug captures, as a package's
# removal leaves ~/.config.
#   KI3_SCRIPTS_DIR   as tools/install.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd -P)
scripts=${KI3_SCRIPTS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/kwin/scripts}

# Another copy's install is that copy's to remove, as tools/install.sh refuses to replace it.
if [[ -L $scripts/kwin-i3 && $(readlink -f "$scripts/kwin-i3") != "$here/package" ]]; then
    echo "uninstall: $scripts/kwin-i3 links to $(readlink -f "$scripts/kwin-i3"), another copy of kwin-i3." >&2
    echo "  Run make uninstall from that one." >&2
    exit 1
fi
state=${XDG_STATE_HOME:-$HOME/.local/state}/kwin-i3
gone() { echo "  removed $1"; }

# 1. What kwin-i3 changed outside its own settings, given back first (each where it is still as
#    kwin-i3 left it). A record that can't be given back now stays, and stops the removal of
#    nothing else: the save is under $state, kept below.
python3 -I "$here/tools/take-keys.py" restore
python3 -I "$here/tools/plasma-settings.py" restore

# 2. The script: off, unloaded from the running KWin (windows keep their places, untiled), and its
#    shortcuts unregistered, so Plasma's Shortcuts page keeps no dead kwin-i3 entries.
kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled --delete
if busctl --user status org.kde.KWin >/dev/null 2>&1; then
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null 2>&1
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure >/dev/null 2>&1
    for p in $(busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins 2>/dev/null | grep -oE '"kwini3[a-z]*-[^"]*"' | tr -d '"'); do
        busctl --user call org.kde.KWin /Plugins org.kde.KWin.Plugins UnloadPlugin s "$p" >/dev/null 2>&1 && echo "  unloaded $p"
    done
    for e in $(busctl --user get-property org.kde.KWin /Effects org.kde.kwin.Effects loadedEffects 2>/dev/null | grep -oE '"kwini3hold[^"]*"' | tr -d '"'); do
        busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects unloadEffect s "$e" >/dev/null 2>&1 && echo "  unloaded $e"
    done
fi
n=0
while IFS= read -r action; do
    busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel unregister ss kwin "$action" >/dev/null 2>&1 && n=$((n + 1))
done < <(busctl --user --json=short call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component allShortcutInfos 2>/dev/null |
    python3 -I -c 'import json,sys; [print(i[0]) for i in json.load(sys.stdin)["data"][0] if i[0].startswith("kwin-i3 ")]')
echo "  unregistered $n kwin-i3 shortcuts"

# 3. The files the install wrote.
[[ -L $scripts/kwin-i3 ]] && rm -f "$scripts/kwin-i3" && gone "$scripts/kwin-i3"
[[ -d $HOME/.local/lib/kwin-i3 ]] && rm -rf "$HOME/.local/lib/kwin-i3" && gone "$HOME/.local/lib/kwin-i3/"
dropin=$HOME/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf
if [[ -f $dropin ]]; then
    rm -f "$dropin" && gone "$dropin"
    rmdir "$(dirname "$dropin")" 2>/dev/null
    systemctl --user daemon-reload 2>/dev/null
fi
for f in "${XDG_CONFIG_HOME:-$HOME/.config}/environment.d/kwin-i3.conf" \
         "${XDG_DATA_HOME:-$HOME/.local/share}/applications/kcm_kwin_i3.desktop"; do
    [[ -f $f ]] && rm -f "$f" && gone "$f"
done
if kpackagetool6 -t Plasma/Applet -s net.local.kwini3.workspaces >/dev/null 2>&1; then
    kpackagetool6 -t Plasma/Applet -r net.local.kwini3.workspaces >/dev/null 2>&1 &&
        gone "the workspace widget (a panel that shows it: right-click, Show Alternatives, Pager)"
fi

# 4. What stays.
echo
echo "uninstall: done. Log out and in once to finish: KWin keeps the plugins' path until then."
grep -qs '^\[Script-kwin-i3\]' "${XDG_CONFIG_HOME:-$HOME/.config}/kwinrc" &&
    echo "  Kept: your kwin-i3 settings, for a later install (the [Script-kwin-i3] group in ~/.config/kwinrc: delete it to remove them)."
[[ -d $state/captures ]] && echo "  Kept: your bug captures in $state/captures (rm -r $state to remove them)."
[[ -f $state/plasma-settings.json ]] && echo "  Kept: Plasma settings that couldn't be given back yet, in $state/plasma-settings.json: run tools/plasma-settings.py restore again later."
[[ -f $state/taken-keys.json ]] && echo "  Kept: keys that couldn't be given back yet, in $state/taken-keys.json: run make restore-keys again later."
[[ -d $state && -z $(ls -A "$state") ]] && rmdir "$state"
echo "  This checkout ($here) is yours to delete."
