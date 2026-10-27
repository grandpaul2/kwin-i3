# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives). Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-26, late** (item 35 done: Paul tested both parts live, "everything works really nice"; spec `docs/spec-tiled-look.md`; item 25 removed, accepted in `docs/plan.md`, "Focus"; item 29 done, live and confirmed by Paul; items 30 and 28 to `LATER.md`).

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work, release prep and anything upstream wait in **`LATER.md`** (Paul, 2026-10-25),
with the settings page's finishing; it is added to as we go.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope"; the audience and the lines drawn: `docs/philosophy.md`. When the Stage ends: `LATER.md`, in its suggested order (1, 3 and 7 are done; 7,
kwin-i3's own settings page, live 2026-10-24: `docs/spec-settings-page.md`; 15, the panel
configuration bug, fixed 2026-10-25: `docs/bug-panel-config.md`; 19 and 20, a floated window's
size and rounded corners, live 2026-10-25: `docs/spec-float-size.md`, `docs/spec-rounded-corners.md`).

## Open

Work for now.

**34. Test speed, the rest of the study** (2026-10-25; the study's report was not kept, its
findings are here). Done: per-scenario timings in `run.sh`, many pixels per probe (78: 64 s to 29 s).
First timings: batch 46 s, alone tail 176 s, total 222 s. Proposed, each for Paul's go: (a) the
Xwayland scenarios (71-74) into the batch, with a lock around testkwin.sh's display search
(~40-70 s; 71 may stay alone for its 1.5 s focus timing); (b) the alone scenarios without
millisecond timings (37, 57, 58, 59, 76, 78) two or three at a time (~30-60 s; five repeat runs
first); (c) polls in place of the fixed sleeps before screenshots in 78, 57, 58 (~10 s).
`39-layout-notice` failed 5 checks once in the batch and passed alone (2026-10-26): if it flakes
again, it goes alone. Also 2026-10-26, full runs on branch `tiled-look`: `capture-read: the press,
last` (70 or 80) failed twice in `make mutate-live`'s baseline, and 57's "mid-hold: the old
layout's frames" once in `run.sh` (its screenshot after the 400 ms hold had ended); each green 3
of 3 alone. One flake per full run blocks the fault battery's baseline. Since the testing policy
(CLAUDE.md, "Testing", 2026-10-26) the flakes come first, as they are what makes a session's one
`make test` and the fortnightly battery expensive: (d) the three flakes above and 39, each made
deterministic or moved alone; (e) `make mutate-live` baselines only the scenarios its faults name
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
