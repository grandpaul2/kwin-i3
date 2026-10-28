#!/usr/bin/env bash
# Settings and the reload (docs/spec-settings.md): a plain write, as the config form makes, changes
# nothing until Reload Settings (Meta+Shift+C, i3's reload) has KWin reconfigure; then the script
# takes the new values and acts only on what changed. The rules: a window follows a changed
# verdict, one floated by hand under an unchanged verdict stays.
source "$(dirname "$0")/lib.sh"
set_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" "$2"; }   # as the form: no --notify
del_key() { kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key "$1" --delete; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'

client --title a; client --title b; client --title c --app-id ki3.probe
check "three tiled"                         wait_tree 1 "H[a b c*]"

# 1. A plain write alone does nothing: the script hears nothing until KWin reconfigures.
m=$(mark)
set_key floatingClass ki3.probe
sleep 1
check "a plain write: no SETTINGS"          bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -qE '^.{9}SETTINGS'"
check "and c still tiles"                   wait_tree 1 "H[a b c*]"

# 2. Reload Settings: the new floatingClass applies to the window already open.
m=$(mark)
key "Reload Settings"
check "reload: floatingClass changed"       wait_log '^.{9}SETTINGS floatingClass$' "$m"
check "c floats now"                        wait_tree 1 "H[a b] ~c*" "$m"

# 3. b floated by hand; an unrelated rule change and a reload leave both floating (b's verdict
#    did not change; c's did not either).
key "Focus Left"; key "Focus Mode Toggle"
m=$(mark)
key "Floating Toggle"
check "b floated by hand"                   wait_tree 1 "H[a] ~b* ~c" "$m"
m=$(mark)
set_key floatingTitle "STAGE (streamed),nothing-has-this-title"
key "Reload Settings"
check "reload: floatingTitle changed"       wait_log '^.{9}SETTINGS floatingTitle$' "$m"
sleep 0.5
check "b stays floating, c too"             _tree_is 1 "H[a] ~b* ~c"

# 4. The rule removed: i3 applies rules and never undoes them (§3 X2, redo stage 3), so c stays
#    floating; a forWindow rule with floating disable tiles it, and b, floated by hand, stays.
m=$(mark)
del_key floatingClass
key "Reload Settings"
check "reload: floatingClass changed back"  wait_log '^.{9}SETTINGS floatingClass$' "$m"
sleep 0.5
check "c stays floating (a rule only applies), b too" _tree_is 1 "H[a] ~b* ~c"
m=$(mark)
set_key forWindow '[class="^ki3\.probe$"] floating disable'
key "Reload Settings"
check "reload: forWindow changed"           wait_log '^.{9}SETTINGS forWindow$' "$m"
check "c tiles by the rule, b still floats" wait_tree 1 "H[a c] ~b*" "$m"

# 5. ignoreClass no longer keeps a window out of the tree: a user's entry reads as a floating rule
#    (§3 R5, Paul's call 43), so c floats; the entry gone and a disable rule back, c tiles.
m=$(mark)
set_key ignoreClass "krunner,ki3.probe"
del_key forWindow
key "Reload Settings"
check "ignoreClass entry: c floats instead" poll eval '[[ "$(tree 1)" == "H[a] ~c ~b*" || "$(tree 1)" == "H[a] ~b* ~c" ]]'
m=$(mark)
del_key ignoreClass
set_key forWindow '[class="^ki3\.probe$"] floating disable'
key "Reload Settings"
check "the entry gone, a disable rule: c tiles" wait_tree 1 "H[a c] ~b*" "$m"
m=$(mark)
del_key forWindow         # the default rules again; no window of theirs is open, nothing changes
key "Reload Settings"
check "reload: forWindow back to the default" wait_log '^.{9}SETTINGS forWindow$' "$m"
check "c still tiles, b still floats"       _tree_is 1 "H[a c] ~b*"

# 6. A reload with nothing changed logs nothing and touches nothing.
m=$(mark)
key "Reload Settings"
sleep 0.5
check "nothing changed: no SETTINGS line"   bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -qE '^.{9}(SETTINGS|UNTILE|ADD)'"

# 7. resizeStep: 25 % instead of 10 at the next key.
kclose b
check "a | c"                               wait_tree 1 "H[a c*]"
key "Focus Left"
m=$(mark)
set_key resizeStep 25
key "Reload Settings"
check "reload: resizeStep changed"          wait_log '^.{9}SETTINGS resizeStep$' "$m"
key "Grow Width"
check "Grow Width by 25 %: a is 960 wide"   geom_is a "0,0 960x720"
key "Shrink Width"
check "and back: 640"                       geom_is a "0,0 640x720"

# 8. focusWrapping: from a, the left edge of the left monitor (no output there), Focus Left
#    wraps to c under "yes" and stays under "no".
m=$(mark)
set_key focusWrapping no
key "Reload Settings"
check "reload: focusWrapping changed"       wait_log '^.{9}SETTINGS focusWrapping$' "$m"
m=$(mark)
key "Focus Left"
sleep 0.3
check "no: Focus Left at the edge stays on a" _tree_is 1 "H[a* c]"
m=$(mark)
del_key focusWrapping
key "Reload Settings"
check "reload: focusWrapping back to yes"   wait_log '^.{9}SETTINGS focusWrapping$' "$m"
m=$(mark)
key "Focus Left"
check "yes again: it wraps to c"            wait_tree 1 "H[a c*]" "$m"

# 9. defaultOrientation: a workspace created after the change splits vertically; workspace 1,
#    which exists, keeps its horizontal split (i3: only at creation).
m=$(mark)
set_key defaultOrientation vertical
key "Reload Settings"
check "reload: defaultOrientation changed"  wait_log '^.{9}SETTINGS defaultOrientation$' "$m"
key "Workspace 3"
client --title x; client --title y
check "workspace 3 is vertical"             wait_tree 3 "V[x y*]"
key "Workspace 1"
client --title z
check "workspace 1 stays horizontal"        wait_tree 1 "H[a c z*]"

check "no invariant failures or errors"     clean_log
finish
