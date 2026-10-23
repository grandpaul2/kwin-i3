#!/usr/bin/env bash
# The kwini3frame decoration has no version check (docs/spec-decoration.md): a build against one
# kdecoration loads under another without complaint and can crash KWin at the first window, every
# login. So, before every KWin start (ExecStartPre in the systemd drop-in plugin-install.sh writes)
# and at install: if kwinrc selects our frame and the version it was built against is not the
# installed kdecoration, select Breeze instead and say so in the journal. Rebuilding
# (make plugin-install) selects the frame again.
#   frame-guard.sh                  guard: fix kwinrc if needed (never fails the unit: "-" prefix)
#   frame-guard.sh --check <dir>    just check <dir>/kwini3frame.version against the library; 1 if not
set -uo pipefail
root=${KI3_PLUGIN_ROOT:-$HOME/.local/lib/kwin-i3/qt6plugins}
fdir=$root/org.kde.kdecoration3
[[ ${1:-} == --check ]] && fdir=$2

# The installed library's version is its real file name: libkdecorations3.so.6 -> ....so.6.7.5
installed() {
    local lib
    for lib in /usr/lib64/libkdecorations3.so.6 /usr/lib/libkdecorations3.so.6; do
        [[ -e $lib ]] || continue
        readlink -f "$lib" | sed -n 's/.*\.so\.\([0-9][0-9.]*\)$/\1/p'
        return
    done
}
built=$(cat "$fdir/kwini3frame.version" 2>/dev/null || true)
have=$(installed)
if [[ ${1:-} == --check ]]; then
    [[ -n $built && $built == "$have" ]]
    exit
fi

lib=$(kreadconfig6 --file kwinrc --group org.kde.kdecoration2 --key library 2>/dev/null || true)
[[ $lib == kwini3frame* ]] || exit 0
if [[ -z $built || $built != "$have" || ! -f $fdir/$lib.so ]]; then
    echo "kwin-i3 frame-guard: kwini3frame built for kdecoration '${built:-?}', installed '${have:-?}', file $fdir/$lib.so: selecting Breeze (cd ~/kwin-i3 && make plugin-install to rebuild)" >&2
    kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library org.kde.breeze
fi
exit 0
