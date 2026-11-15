#!/usr/bin/env bash
# The fuzzer's I2 (shrunk from 99 actions to these 4): a modal dialog Meta+dragged to the other
# monitor, its parent sharing workspace 1 with another window. The drag's own moves reconcile
# workspace 1 mid-drag, and the reconcile's relocate() must leave alone the dialog KWin is moving.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
drag Meta left 960 180 691 697        # the shrinker kept this one (on the empty desktop)
client --title m --dialog
check "m and its dialog on workspace 1"     poll eval '[[ "$(tree 1)" == "H[m] ~m_dialog"* ]]'
client --title late --map-delay 1.0
check "late beside m"                       poll eval '[[ "$(tree 1)" == "H[m late"* ]]'
m=$(mark)
drag Meta left 640 360 1528 664       # from the dialog, centred on m, onto the second monitor
check "the drag moved the dialog"           wait_log '^.{9}DRAG end move m dialog' "$m"
# Dropped on the second monitor: the dialog joins workspace 2, and m with it (KWin moves a modal
# dialog's parent along). Two ways it can go wrong: the dialog snaps back mid-drag, or m joins
# workspace 2 but stands in its old tile on the first monitor.
check "m and its dialog went to workspace 2" wait_tree 2 "H[m] ~m_dialog*"
check "late stays alone on workspace 1"     wait_tree 1 "H[late]"
check "m fills the second monitor"          geom_is m "1280,0 1280x720"
check "no invariant failures or errors"     clean_log
finish
