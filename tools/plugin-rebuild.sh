#!/usr/bin/env bash
# The plugins kept built (docs/plan.md, "Scope"): run by the user unit kwin-i3-plugins.service,
# which the path unit starts when KWin's development files change and kwin-i3 starts at load when
# KWin lacks a plugin. KWin loads a plugin only into the KWin version it was built for, so after an
# update this rebuilds the plugins as the user and installs them: loaded at once into a running
# KWin of that version, else staged for KWin's next start (tools/plugin-install.sh).
# Nothing to do, or a wait for the rest of a package transaction: silent. A failure: one
# notification with its cause and the command, said once per pair of KWin and development-file
# versions (the record below; a person's make plugin-install clears it), so installing the missing
# or lagging development files is tried again by itself.
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd -P)
state=${XDG_STATE_HOME:-$HOME/.local/state}/kwin-i3
failed=$state/rebuild-failed
root=$HOME/.local/lib/kwin-i3/qt6plugins

# notify SUMMARY BODY TIMEOUT: through D-Bus typed, which a shell can send and a KWin script can't.
notify() {
    busctl --user call org.freedesktop.Notifications /org/freedesktop/Notifications \
        org.freedesktop.Notifications Notify 'susssasa{sv}i' \
        kwin-i3 0 preferences-system-windows "$1" "$2" 0 0 "$3" >/dev/null 2>&1 || true
}
fail() {
    mkdir -p "$state"
    printf '%s\n%s\n' "$installed $headers" "$1" >"$failed"
    echo "plugin-rebuild: $1" >&2
    notify "kwin-i3's plugins weren't rebuilt for KWin $installed" \
        "$1 Until then there is no frame, no mouse dragging, and Plasma's shortcuts win kwin-i3's shared keys (Meta+1…0). Then run: cd $here && make plugin-install" 0
    exit 1
}
# the KWin version a built plugin is for: its IID's tail
built_for() { grep -aoE "$2[0-9]+\.[0-9]+\.[0-9]+" "$1" 2>/dev/null | head -1 | sed "s/^$2//"; }
headers_version() {
    local f
    f=$(cat "$here/plugin/build/kwin-version-file" 2>/dev/null)
    [[ -f $f ]] || f=$(compgen -G '/usr/lib*/cmake/KWin/KWinConfigVersion.cmake' || compgen -G '/usr/lib/*/cmake/KWin/KWinConfigVersion.cmake') || return 0
    sed -n 's/^set(PACKAGE_VERSION "\([0-9.]*\)").*/\1/p' "${f%%$'\n'*}"
}

installed=$(kwin_wayland --version 2>/dev/null | awk '{print $2}')
[[ -n $installed ]] || exit 0
helper=$(compgen -G "$root/kwin/plugins/kwini3helper-*.so" | head -1)
effect=$(compgen -G "$root/kwin/effects/plugins/kwini3hold-*.so" | head -1)
if [[ -n $helper && -n $effect &&
    $(built_for "$helper" PluginFactoryInterface) == "$installed" &&
    $(built_for "$effect" EffectPluginFactory) == "$installed" ]]; then
    rm -f "$failed"
    exit 0
fi
headers=$(headers_version)
[[ $(head -1 "$failed" 2>/dev/null) == "$installed $headers" ]] && exit 0 # said already
if [[ -z $headers ]]; then
    # No development files: never built here, nothing to say; built before, it can't be now.
    [[ -n $helper || -n $effect ]] || exit 0
    fail "KWin's development files aren't installed (kwin-devel on Fedora, kwin on Arch, kwin-dev on Debian)."
fi
# A package transaction lands KWin and its development files one after the other: wait for both.
for _ in $(seq 24); do
    [[ $headers == "$installed" ]] && break
    sleep 5
    installed=$(kwin_wayland --version 2>/dev/null | awk '{print $2}')
    headers=$(headers_version)
done
[[ $headers == "$installed" ]] ||
    fail "KWin is $installed and its development files $headers: update them to $installed."
# Only what is committed builds by itself: a checkout with plugin changes of its own is built by hand.
[[ -z $(git -C "$here" status --porcelain -- plugin 2>/dev/null) ]] ||
    fail "$here/plugin has changes of its own, so it is built by hand."

mkdir -p "$state"
make -C "$here" plugin >"$state/rebuild.log" 2>&1 ||
    fail "The build failed: $(grep -m1 -E 'error|Error' "$state/rebuild.log" || tail -1 "$state/rebuild.log") (all of it: $state/rebuild.log)."
# An update landed during the build (its path event was dropped while this ran): start over.
[[ $(kwin_wayland --version 2>/dev/null | awk '{print $2}') == "$installed" ]] || exec "$0"
[[ $(built_for "$here/plugin/build/bin/kwin/plugins/kwini3helper.so" PluginFactoryInterface) == "$installed" ]] ||
    fail "The build is for another KWin than $installed."
out=$("$here/tools/plugin-install.sh" 2>&1) || fail "$(tail -1 <<<"$out")"
echo "$out"
rm -f "$failed"
if grep -q '^loaded in KWin' <<<"$out"; then
    notify "kwin-i3's plugins are back" "Rebuilt for KWin $installed: the frame, the mouse and kwin-i3's keys work again." -1
fi
