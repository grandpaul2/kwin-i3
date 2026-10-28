#!/usr/bin/env bash
# workspaceOutputs, i3's "workspace N output X" (docs/spec-settings.md), on the two virtual
# monitors (Virtual-0 at x 0, Virtual-1 at x 1280): at login each monitor shows the lowest
# workspace free and not assigned elsewhere; an empty assigned workspace opens on its monitor;
# a monitor that appears takes its workspaces back; a reload moves no existing workspace.
source "$(dirname "$0")/lib.sh"
shows() { [[ "$(kjs "workspace.screens.forEach(function (s) { if (s.name === \"$1\") log(workspace.desktops.indexOf(workspace.currentDesktopForScreen(s)) + 1); })")" == "$2" ]]; }
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
x_of() { local g; g=$(geom "$1"); echo "${g%%,*}"; }
on_second() { (( $(x_of "$1") >= 1280 )); }
on_first() { (( $(x_of "$1") < 1280 )); }
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }

# 1. At login: 1 on the second monitor, 2 on the first (the first monitor's lowest free and not
#    assigned elsewhere is 2).
set_key workspaceOutputs "1=Virtual-1, 2=Virtual-0, 3=Virtual-1"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "login: the first monitor shows 2"    poll shows Virtual-0 2
check "login: the second shows 1"           poll shows Virtual-1 1

# 2. Meta+3 from the first monitor: 3 is assigned to the second, and opens there.
key "Workspace 2"
client --title a
check "a on workspace 2, first monitor"     wait_tree 2 "H[a*]"
key "Workspace 3"
check "Meta+3 shows 3 on the second monitor" poll shows Virtual-1 3
check "and the first still shows 2"         poll shows Virtual-0 2
client --title b
check "b opens on 3, on the second monitor" wait_tree 3 "H[b*]"
check "b is on the second monitor"          poll on_second b

# 3. Meta+Shift+1 from a (first monitor): 1 is assigned to the second; a goes there.
key "Focus Left"
key "Move to Workspace 1"
check "a went to workspace 1"               wait_tree 1 "H[a]"
key "Workspace 1"
check "Meta+1 shows 1 on the second monitor" poll shows Virtual-1 1
check "a is on the second monitor"          poll on_second a

# 4. A reload with a changed assignment moves nothing that exists (i3 assigns at creation).
m=$(mark)
set_key workspaceOutputs "1=Virtual-0, 2=Virtual-0, 3=Virtual-1"
key "Reload Settings"
check "reload: workspaceOutputs changed"    wait_log '^.{9}SETTINGS workspaceOutputs$' "$m"
sleep 0.5
check "1 still on the second monitor"       poll shows Virtual-1 1
check "a still there"                       on_second a

# 5. A monitor that appears takes the workspaces assigned to it (i3, randr.c init_ws_for_output):
#    5 is used on the first monitor with no assignment; then assigned to the second by a reload,
#    which moves nothing; when the second monitor is unplugged and comes back, 5 goes to it.
key "Focus Left"
key "Workspace 5"
check "Meta+5 (no assignment) on the first"  poll shows Virtual-0 5
client --title e
check "e on workspace 5, first monitor"     wait_tree 5 "H[e*]"
check "e on the first monitor"              poll on_first e
m=$(mark)
set_key workspaceOutputs "1=Virtual-1, 3=Virtual-1, 5=Virtual-1"
key "Reload Settings"
check "reload: 5 assigned to the second"    wait_log '^.{9}SETTINGS workspaceOutputs$' "$m"
sleep 0.5
check "nothing moved: e still on the first" on_first e
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone"          poll screens_are 1
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "the second monitor is back"          poll screens_are 2
key "Workspace 5"
check "Meta+5 now shows 5 on the second"    poll shows Virtual-1 5
check "e went with it"                      poll on_second e

# 6. A returning monitor shows its lowest workspace (i3's init_ws_for_output, redo stage 4): 1, 3
#    and 5 are its; while it is away a window is sent to 6, unassigned, which then lives on the
#    first monitor and stays there (i3: only assignment brings a workspace back).
m=$(mark)
set_key workspaceOutputs "1=Virtual-1, 3=Virtual-1, 5=Virtual-1, 4=Virtual-0"
key "Reload Settings"
check "reload: 4 assigned to the first"     wait_log '^.{9}SETTINGS workspaceOutputs$' "$m"
key "Workspace 6"
check "Meta+6 from the second: 6 there"     poll shows Virtual-1 6
key "Workspace 2"
check "back on the first (2)"               poll shows Virtual-0 2
client --title f
check "f on workspace 2"                    wait_tree 2 "H[f*]"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone again"    poll screens_are 1
key "Move to Workspace 6"
check "f went to 6"                         wait_tree 6 "H[f]"
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "the second monitor is back again"    poll screens_are 2
check "it shows 1, its lowest workspace"    poll shows Virtual-1 1
check "6, unassigned, stayed on the first with f" poll on_first f
key "Workspace 6"
check "Meta+6 shows 6 on the first"         poll shows Virtual-0 6

# 7. A list of outputs per workspace (i3's "workspace N output A B"): 6 assigned to Virtual-9 (absent)
#    then Virtual-1, so it goes to Virtual-1 when that monitor appears.
m=$(mark)
set_key workspaceOutputs "1=Virtual-1, 3=Virtual-1, 5=Virtual-1, 4=Virtual-0, 6=Virtual-9 Virtual-1"
key "Reload Settings"
check "reload: 6 assigned to Virtual-9, then Virtual-1" wait_log '^.{9}SETTINGS workspaceOutputs$' "$m"
check "nothing moved yet: f still on the first" on_first f
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone"          poll screens_are 1
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "the second monitor is back"          poll screens_are 2
key "Workspace 6"
check "6 went to the second monitor, the first connected of its list" poll shows Virtual-1 6
check "f with it"                           poll on_second f

check "no invariant failures or errors"     clean_log
finish
