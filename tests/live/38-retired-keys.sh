#!/usr/bin/env bash
# The dead Shift+symbol registrations (2026-10-24): a Shift+key that types a symbol arrives as the
# symbol, so Meta+Shift+; never fired and Meta+: did; likewise Meta+Shift+1 and Meta+!. kwin-i3
# registers only the symbol forms now, and unregisters the old actions an install still holds.
source "$(dirname "$0")/lib.sh"
kga() { busctl --user call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel "$@"; }
names() { busctl --user --json=short call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component shortcutNames; }
has() { names | grep -qF "\"$1\""; }

# An install from before: the old actions, with their keys, as kglobalaccel kept them.
MS_SEMI=$((0x1200003B)) MS_1=$((0x12000031))
for a in "kwin-i3 Move Right (;)|$MS_SEMI" "kwin-i3 Move to Workspace 1|$MS_1"; do
    kga doRegister as 4 kwin "${a%|*}" KWin "${a%|*}" >/dev/null
    kga setForeignShortcutKeys 'asa(ai)' 4 kwin "${a%|*}" KWin "${a%|*}" 1 4 "${a#*|}" 0 0 0 >/dev/null
done
check "the old actions are there before"    has "kwin-i3 Move Right (;)"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "Move Right (;) unregistered"         poll eval '! has "kwin-i3 Move Right (;)"'
check "Move to Workspace 1 unregistered"    poll eval '! has "kwin-i3 Move to Workspace 1"'
check "Move to Workspace 1 (symbol) stays"  has "kwin-i3 Move to Workspace 1 (symbol)"

# The physical keys still do their work, through the symbol forms.
client --title A
m=$(mark); press "Meta+Shift+;"
check "Meta+Shift+; moves right"            wait_log '^.{9}ACTION Move Right$' "$m"
m=$(mark); press "Meta+Shift+1"
check "Meta+Shift+1 moves to workspace 1"   wait_log '^.{9}ACTION Move to Workspace 1$' "$m"
check "no invariant failures or errors"     clean_log
finish
