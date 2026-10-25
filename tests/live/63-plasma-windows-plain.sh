#!/usr/bin/env bash
# Window modes without the plugins (docs/spec-window-modes.md, decision 5c): a workspace of
# Plasma windows still opens them floating, and with no effect to keep the floating mark the
# kept-above flag is the mark, so a reload keeps them floating.
source "$(dirname "$0")/lib.sh"
prop() { kjs "workspace.windowList().forEach(function (w) { if (w.caption === \"$1\") log(w.$2); })"; }
prop_is() { [[ "$(prop "$1" "$2")" == "$3" ]]; }
floating() { [[ "$(tree "$2" "${3:-0}")" == *"~$1"* ]]; }
kwriteconfig6 --file kwinrc --group Script-kwin-i3 --key floatingWorkspaces "3"
busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "no effect: adopted without it"       wait_log '^.{9}ADOPTED without the effect'
key "Workspace 3"
client --title p
check "p opens floating on workspace 3"     poll floating p 3
check "  kept above (the mark, no effect)"  prop_is p keepAbove true
check "  its title bar"                     prop_is p noBorder false
busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3 >/dev/null
m=$(mark); load_kwin_i3
check "reloaded"                            wait_log 'kwin-i3 loaded$' "$m"
check "p still floating"                    poll floating p 3 "$m"
check "no invariant failures or errors"     clean_log
finish
