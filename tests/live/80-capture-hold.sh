#!/usr/bin/env bash
# needs: plugin
# tools/capture with kwini3hold loaded: its events (hold.txt) are saved beside kwin-i3's log, and
# tools/capture-read merges the two around the press (docs/debugging.md). A close of one of two
# tiled windows is OPEN.md item 21's case: the kept close, the survivor's snapshot, the release.
source "$(dirname "$0")/lib.sh"
load_kwin_i3
wait_log 'kwin-i3 loaded$'
check "the effect is loaded" eval '[[ "$(busctl --user call org.kde.KWin /Effects org.kde.kwin.Effects isEffectLoaded s kwini3hold)" == "b true" ]]'
client --title a; client --title b
wait_tree 1 "H[a b*]" >/dev/null
sleep 0.3          # b shown (its hold released): a close before that is "never shown"
key "Close"
wait_tree 1 "H[a*]" >/dev/null
sleep 0.5
export KI3_CAPTURE_DIR=$KI3_TMP/captures
"$root/tools/capture"
dir=$(ls -d "$KI3_CAPTURE_DIR"/*/ | head -1)
hold=${dir}hold.txt
ev() { grep -qE "^[0-9:]{8}\.[0-9]{3} f[0-9]+ $1" "$hold"; }
check "hold.txt saved"                      test -s "$hold"
check "b's close kept"                      ev "close b: kept"
check "a snapshotted as it grew (the frame: 1 px in)"            ev "snapshot a at 1,1 638x718$"
check "a release, not timed out"            eval 'ev "release after [0-9.]+ ms, [0-9]+ held$"'
out=$("$root/tools/capture-read" "$dir")
# "kept" or "chose": the pointer rests in the gap between a and b, over a strip of kwini3helper's
# (gapstrips.h), so KWin's own pick after the close is none and kwin-i3 makes i3's choice
# (Paul, 2026-10-28: either; this checks the merge, not the focus).
check "capture-read: both sources"          eval 'grep -qE " hold f[0-9]+ close b: kept" <<<"$out" && grep -qE " i3   CLOSE b (kept|chose) a" <<<"$out"'
# Not "last": capture-read prints the few lines logged after the press too, and under load
# one lands there (item 34). The press is in the timeline, and the timeline is in time order.
check "capture-read: the press, in time order" eval 'grep -q " ---- PRESS" <<<"$out" && grep -E "^[0-9]{2}:" <<<"$out" | cut -c1-12 | sort -c'
check "capture-read: a's GEOM after its snapshot" eval 'grep -E " (hold f[0-9]+ snapshot a|i3   GEOM a 1,1 638x718 -> 1,1 1278x718)" <<<"$out" | head -1 | grep -q snapshot'
check "no invariant failures or errors"     clean_log
finish
