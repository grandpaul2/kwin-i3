#!/usr/bin/env bash
# make install: every step that needs no choice (docs/plan.md, "Install and first run"): the
# script linked and enabled, the plugins, the settings page. Safe to run again: an update is
# git pull, then make install, which reloads a running kwin-i3. The choices (the keys other
# shortcuts hold, Plasma's settings) wait for the first run, after the log-out; this changes none.
#   KI3_SCRIPTS_DIR   KWin's user script dir (default $XDG_DATA_HOME/kwin/scripts; tests)
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd -P)   # physical, as readlink -f below gives the link's target
scripts=${KI3_SCRIPTS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/kwin/scripts}
link=$scripts/kwin-i3

# Another tiling script places the same windows. Turning it off is the user's: say so, change nothing.
for other in krohnkite polonium bismuth; do
    if [[ $(kreadconfig6 --file kwinrc --group Plugins --key "${other}Enabled") == true ]]; then
        echo "install: the tiling script '$other' is on, and two scripts would place the same windows." >&2
        echo "  Turn it off in System Settings > Window Management > KWin Scripts, then run make install again." >&2
        exit 1
    fi
done

# The script: a link to this checkout's package/, so git pull updates what KWin loads.
if [[ -L $link && $(readlink -f "$link") == "$here/package" ]]; then
    :
elif [[ -e $link || -L $link ]]; then
    echo "install: $link is already there, and isn't a link to $here/package." >&2
    echo "  Another copy of kwin-i3? Run make uninstall from that one first, or remove $link." >&2
    exit 1
else
    mkdir -p "$scripts"
    ln -s "$here/package" "$link"
    echo "linked $link"
fi
kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled true

"$here/tools/plugin-install.sh"
"$here/tools/kcm-install.sh"

loaded() { [[ $(busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting isScriptLoaded s kwin-i3 2>/dev/null) == "b true" ]]; }
if loaded; then
    # An update: the new script in place of the old (it re-tiles the windows once).
    busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
    busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
    for _ in 1 2 3 4 5 6 7 8 9 10; do loaded && break; sleep 0.2; done
    if loaded; then echo "install: kwin-i3 reloaded"; else echo "install: kwin-i3 didn't load again: journalctl --user -b | grep kwin-i3" >&2; exit 1; fi
else
    echo
    echo "install: done. Log out and in once: KWin finds a new script and its plugins only at login."
    echo "  Then open System Settings > Window Management > kwin-i3: Configure Plasma Settings… lists the"
    echo "  Plasma settings and keys kwin-i3 needs, changes the ones you tick, and gives each back."
    echo "  make uninstall takes all of it out again."
fi
