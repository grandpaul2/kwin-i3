# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-27, session end** (done: items 35, 29; to `LATER.md`: 30, 28; removed: 25, accepted in `docs/plan.md`; the window words and `docs/philosophy.md` written). Since then, 2026-10-27: item 38 done (the standing docs against `docs/behaviour.md`); 39 added.

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work, release prep and anything upstream wait in **`LATER.md`** (Paul, 2026-10-25),
with the settings page's finishing; it is added to as we go.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope"; the audience and the lines drawn: `docs/philosophy.md`. When the Stage ends: `LATER.md`, in the order its header suggests.

## Open

Work for now.

**39. A floating fullscreen window, as in i3** (2026-10-27). Since today a floating window keeps
its fullscreen flag, but only a tiled one blocks the focus keys and keeps its workspace's focus
(`src/tree.js` `fullscreenOn` searches tiled windows only). In i3 a fullscreen window does both
whether floating or tiled (`con_get_fullscreen_con` walks `floating_head` too; `render.c` skips
other floating windows under it). Related known limit: focus keys over a fullscreen window are
judged per workspace, where i3 judges from the focused window (`behaviour.md` §10). Paul's
direction: follow i3, as an item with a test. Next: a spec (what changes for a game that runs
floating fullscreen, the focus and move rules, KWin's own stacking), then a unit test watched red,
the change, and a live check.

**34. Test speed, the rest of the study** (2026-10-25; the study's report was not kept, its
findings are here). Done: per-scenario timings in `run.sh`, many pixels per probe (78: 64 s to 29 s).
First timings: batch 46 s, alone tail 176 s, total 222 s. Proposed, each for Paul's go: (a) the
Xwayland scenarios (71-74) into the batch, with a lock around testkwin.sh's display search
(~40-70 s; 71 may stay alone for its 1.5 s focus timing); (b) the alone scenarios without
millisecond timings (37, 57, 58, 59, 76, 78) two or three at a time (~30-60 s; five repeat runs
first); (c) polls in place of the fixed sleeps before screenshots in 78, 57, 58 (~10 s).

**The flakes**, each passing alone every time it was rerun:
- **39-layout-notice and 69-keyboard-layouts, likely one layout race.** 39's same 5 checks ("de:
  logged as not fitted", the notification's) failed in a full batch twice on 2026-10-25 and once
  on 2026-10-26; late 2026-10-25 69 failed beside it ("the helper fitted French", Workspace 5's
  AZERTY key), and 69 failed again in the batch on 2026-10-27 (48 of 48 alone). A batch-load
  race in the layout checks, not traced. Next: the log around "not fitted" from a failing batch
  run (keep the run's output), or both moved alone.
- **70 or 80, `capture-read: the press, last`**: failed twice in `make mutate-live`'s baseline
  (2026-10-26, branch `tiled-look`); green 3 of 3 alone.
- **57, "mid-hold: the old layout's frames"**: failed once in `run.sh` (2026-10-26), its screenshot
  taken after the 400 ms hold had ended; green 3 of 3 alone.
- Watched, closed unless it comes back: 53-hold's kill switch, its `--notify` not taking (once,
  early 2026-10-24; not in ~15 full runs since). 53 runs alone after the batch (`# timing: alone`)
  so its timing checks are strict.

One flake per full run blocks the fault battery's baseline. Since the testing policy
(CLAUDE.md, "Testing", 2026-10-26) the flakes come first, as they are what makes a session's one
`make test` and the fortnightly battery expensive: (d) the flakes above, each made deterministic
or moved alone; (e) `make mutate-live` baselines only the scenarios its faults name
(KI3_ONLY), not the whole suite. Next: Paul's choice among (a)-(e); (d) and (e) recommended first.

**21. Wallpaper flashes** (Paul, 2026-10-25, three times; captures 15:44, 17:57 and 18:51, all
kept in `~/.local/state/kwin-i3/captures/` until this is worked on). The first was Firefox shown
again on a workspace switch 4 to 2. **The other two followed a close of the window beside it**:
at 17:57 a terminal beside Firefox, at 18:51 one of two Alacritty on workspace 3 (DP-4; its
`state.txt` log: `18:51:17 ACTION Close`, `TREE 3 H[Alacritty*]`, the press 7 s later). kwin-i3's
side checked for the Firefox ones: the trees were right, and kwini3hold kept the closing window and
released on Firefox's new size with no timeout (66 holds, max 69 ms). With no Firefox at 18:51,
the guess that Firefox acknowledges a size before drawing into it no longer covers every case; a
cause in kwini3hold, the frame effect or KWin is as likely. From 2026-10-25 late a capture holds the
flight recorder (`docs/debugging.md`): kwin-i3's TILE and GEOM lines and kwini3hold's hold, close
and release events, to the millisecond, read with `tools/capture-read`. Next: the next flash's
capture says whether it falls after kwini3hold's release (then the client or KWin drew late) or
inside the hold (then the effect); meanwhile, reproduce in the test KWin (two tiled, close one,
screenshots every few ms, background inside the survivor's rect), Alacritty and the test client
first, real Firefox with a throwaway profile second. If timelines can't settle it: the screen
replay buffer (`docs/debugging.md`, "What none of these show"), its own proposal.
