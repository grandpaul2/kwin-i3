#!/usr/bin/env bash
# The fuzzer's I10 (seed 14 of 2026-10-23's run, shrunk to 7 actions): a tiled window's frame is
# not its tile. a is half the first monitor while the second is plugged in; the second goes away,
# and meanwhile the layout changes so that a's tile is a third. When the monitor returns, KWin
# (PlacementTracker, workspace.cpp updateOutputs) puts a back to the half it had in the two-monitor
# layout, after kwin-i3 has reconciled: the restore is a pending resize that frameGeometry does not
# show until the client commits it, so refit saw a fitting window. kwin-i3 now refits a tiled window
# whenever its frame changes and no longer matches its tile.
source "$(dirname "$0")/lib.sh"
screens_are() { [[ "$(kjs 'log(workspace.screens.length)')" == "$1" ]]; }
# The fuzzer settles about a second after each action; without that the failure didn't show.
settle() { sleep 1; }
load_kwin_i3
wait_log 'kwin-i3 loaded$'
client --title a; settle
client --title b; settle
check "a is the left half"                  geom_is a "0,0 640x720"
timeout 10 kscreen-doctor output.Virtual-1.disable >/dev/null 2>&1
check "the second monitor is gone"          poll screens_are 1
settle
client --title c; settle
kclose b; settle
client --title d; settle
check "a is a third now"                    geom_is a "0,0 427x720"
timeout 10 kscreen-doctor output.Virtual-1.enable >/dev/null 2>&1
check "it is back"                          poll screens_are 2
settle
check "a is still a third"                  geom_is a "0,0 427x720"
check "c is the middle third"               geom_is c "427,0 426x720"
check "d is the last third"                 geom_is d "853,0 427x720"
check "no invariant failures or errors"     clean_log
finish
