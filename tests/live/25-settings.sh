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

# 4. The rule removed: c's verdict changes back and it tiles; b, by hand, stays floating.
m=$(mark)
del_key floatingClass
key "Reload Settings"
check "reload: floatingClass changed back"  wait_log '^.{9}SETTINGS floatingClass$' "$m"
check "c tiles again, b still floats"       wait_tree 1 "H[a c] ~b*" "$m"

# 5. ignoreClass: c is let go, then taken back.
m=$(mark)
set_key ignoreClass "krunner,ki3.probe"
key "Reload Settings"
check "ignored: c leaves the tree"          wait_tree 1 "H[a] ~b*" "$m"
m=$(mark)
del_key ignoreClass
key "Reload Settings"
check "the default list again: c is back"   wait_tree 1 "H[a c] ~b*" "$m"

# 6. A reload with nothing changed logs nothing and touches nothing.
m=$(mark)
key "Reload Settings"
sleep 0.5
check "nothing changed: no SETTINGS line"   bash -c "! tail -n +$((m + 1)) '$KI3_LOG' | grep -qE '^.{9}(SETTINGS|UNTILE|ADD)'"

check "no invariant failures or errors"     clean_log
finish
