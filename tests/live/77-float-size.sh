#!/usr/bin/env bash
# A floated window comes back at the geometry it opened with, as i3's con->geometry
#. Clients open at 400x300: 400x328 framed with the title bar.
source "$(dirname "$0")/lib.sh"
SIZE=400x328
act() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") workspace.activeWindow = w; });" >/dev/null; }
_size_is() { [[ "$(geom "$1")" == *" $2" ]]; }
size_is() { poll _size_is "$1" "$2" && return 0; echo "    $1 is at $(geom "$1"), wanted size $2"; return 1; }
floating() { [[ "$(tree "$2")" == *"~$1"* ]]; }
tiled() { ! floating "$1" "$2"; }

load_kwin_i3
wait_log 'kwin-i3 loaded$'

# 1. Fresh, beside another window: back at its own size, where KWin first put it.
key "Workspace 1"
client --title a --size 400x300 --color red
check "a opens alone, at its size"          poll _size_is a 1280x720
client --title b --size 300x200 --color blue
check "a and b tile"                        wait_tree 1 "H[a b*]"
act a; key "Floating Toggle"
check "a floats"                            poll floating a 1
check "  at its size"                       size_is a $SIZE
first=$(geom a)
key "Floating Toggle"
check "a tiles again"                       poll tiled a 1

# 2. Moved to a hidden workspace, shown there, floated: its size, not its old tiled half.
act a; key "Move to Workspace 3"
key "Workspace 3"
check "a tiled alone on 3"                  wait_tree 3 "H[a*]"
key "Floating Toggle"
check "after a hidden move: its size"       size_is a $SIZE
check "  where it first was"                wait_geom a "$first"
key "Floating Toggle"

# 3. Moved to the other monitor's workspace: its size, at the same relative place there.
key "Move to Workspace 2"
key "Workspace 2"
check "a tiled on 2 (the other monitor)"    wait_tree 2 "H[a*]"
key "Floating Toggle"
x=${first%%,*}; rest=${first#*,}
check "on the other monitor: same place"    wait_geom a "$((x + 1280)),$rest"
key "Floating Toggle"

# 4. Resized while floating, tiled, floated again: back at the size it opened with (i3).
key "Floating Toggle"
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "a") w.frameGeometry = { x: 1400, y: 100, width: 600, height: 400 }; });' >/dev/null
check "a resized while floating"            size_is a 600x400
key "Floating Toggle"
check "a tiles"                             poll tiled a 2
key "Floating Toggle"
check "floated again: its opening size"     size_is a $SIZE

# 5. A rule change floats a tiled window: at its size (after a hidden move, so KWin's own
#    restore is the tiled half and only the record gives the size).
key "Workspace 1"
client --title c --size 400x300 --app-id ki3.probe --color green
check "c tiles beside b"                    wait_tree 1 "H[b c*]"
key "Move to Workspace 3"
key "Workspace 3"
check "c tiled alone on 3"                  wait_tree 3 "H[c*]"
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key forWindow '[class="^ki3\.probe$"] floating enable'
m=$(mark); key "Reload Settings"
check "the rule floats c"                   wait_tree 3 "H[] ~c*" "$m"
check "  at its size"                       size_is c $SIZE

# 6. Already tiled at a reload (no record): KWin's own restore, as before.
client --title d --size 400x300 --color blue
check "d tiles"                             poll eval '[[ "$(tree 3)" == *"d*"* ]]'
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
# 7's window opens while kwin-i3 is away, off-centre, so its record shows i3's relative rule.
client --title e --size 400x300 --color red
kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "e") w.frameGeometry = { x: 100, y: 100, width: 400, height: 328 }; });' >/dev/null
check "e open untiled, at 100,100"          wait_geom e "100,100 $SIZE"
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log '^.{9}ADOPTED' "$m"
act d; key "Floating Toggle"
check "d floats at KWin's restore, its size" size_is d $SIZE

# 7. Open before the load (recorded then), moved to the other monitor, floated: the centre's
#    fraction of its old monitor, on the new one (i3's floating_fix_coordinates), not centred.
act e
check "e tiled at the load"                 poll eval '[[ "$(geom e)" != *" $SIZE" ]]'
key "Move to Workspace 2"
key "Workspace 2"
act e; key "Floating Toggle"
check "e on the other monitor, same place"  wait_geom e "1380,100 $SIZE"

check "no invariant failures or errors"     clean_log
finish
