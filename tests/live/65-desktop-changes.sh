#!/usr/bin/env bash
# Desktops removed or moved mid-session (docs/spec-desktop-changes.md, (a)): workspace N is
# desktop N by position, so kwin-i3 rebuilds its model from KWin's state and the workspaces follow
# KWin's new order; desktops only appended change nothing.
source "$(dirname "$0")/lib.sh"
# Every managed window's workspace (its tree) is its desktop's number: "caption=N ..." per window.
on_desk() { kjs "workspace.windowList().forEach(function (w) { if (w.normalWindow && !w.deleted && w.caption.length === 1) log(w.caption + '=' + (workspace.desktops.indexOf(w.desktops[0]) + 1)); });" | sort | tr '\n' ' '; }
in_tree() { [[ "$(tree "$2" "${3:-0}")" == *"$1"* ]]; }
desk_id() { kjs "log(workspace.desktops[$1 - 1].id)"; }
nobody_twice() {   # each one-letter caption in exactly one workspace's last tree
    local c n t
    for c in "$@"; do
        n=0
        for t in 1 2 3 4 5 6 7 8 9 10; do [[ "$(tree $t "${m:-0}")" == *"$c"* ]] && n=$((n + 1)); done
        [[ $n == 1 ]] || { echo "    $c is in $n trees"; return 1; }
    done
}
load_kwin_i3
wait_log 'kwin-i3 loaded$'
key "Workspace 2"; client --title a
key "Workspace 3"; client --title b; client --title c
key "Workspace 4"; client --title d
key "Workspace 3"
check "2: a, 3: b c, 4: d"                  poll eval 'in_tree a 2 && in_tree "b c" 3 && in_tree d 4'
check "on their desktops"                   eval '[[ "$(on_desk)" == "a=2 b=3 c=3 d=4 " ]]'

# 1. Desktop 2 removed: 3 and 4 move down. b c are workspace 2 (side by side, as before), d is
#    workspace 3; a went with KWin to the desktop that took its place (the old 3, now 2).
m=$(mark)
busctl --user call org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager removeDesktop s "$(desk_id 2)"
check "the rebuild logged"                  wait_log '^.{9}DESKTOPS removed or moved' "$m"
check "  and done"                          wait_log '^.{9}DESKTOPS adopted again' "$m"
check "workspace 2: b c, and a with them"   poll eval 'in_tree b 2 "$m" && in_tree c 2 "$m" && in_tree a 2 "$m"'
check "workspace 3: d"                      poll eval 'in_tree d 3 "$m"'
check "nobody in two workspaces"            nobody_twice a b c d
check "every window on its workspace's desktop" poll eval '[[ "$(on_desk)" == "a=2 b=2 c=2 d=3 " ]]'
sleep 0.5
check "still so after the next passes"      eval '[[ "$(on_desk)" == "a=2 b=2 c=2 d=3 " ]]'
key "Workspace 3"
check "Meta+3 shows d"                      wait_tree 3 "H[d*]"

# 2. A desktop moved: desktop 3 (d) to the front. d is workspace 1; 1 and 2 move up one.
m=$(mark)
kjs 'workspace.moveDesktop(workspace.desktops[2], 0);' >/dev/null
check "the rebuild logged"                  wait_log '^.{9}DESKTOPS adopted again' "$m"
check "d is workspace 1"                    poll eval 'in_tree d 1 "$m"'
check "a b c are workspace 3"               poll eval 'in_tree a 3 "$m" && in_tree b 3 "$m" && in_tree c 3 "$m"'
check "every window on its workspace's desktop" poll eval '[[ "$(on_desk)" == "a=3 b=3 c=3 d=1 " ]]'
check "nobody in two workspaces"            nobody_twice a b c d

# 3. A desktop appended: nothing rebuilt, nothing moves.
m=$(mark)
busctl --user call org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager createDesktop us 99 "extra"
sleep 1
check "appended: no rebuild"                eval '! after "$m" | grep -qE "^.{9}DESKTOPS"'
check "  nothing moved"                     eval '[[ "$(on_desk)" == "a=3 b=3 c=3 d=1 " ]]'
check "no invariant failures or errors"     clean_log
finish
