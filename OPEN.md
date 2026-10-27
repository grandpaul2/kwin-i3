# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-27, third session** (item 39 done, live and checked by Paul; item 21 accepted as a known limit in `behaviour.md` §10, Paul: extremely rare now; the 04:35 capture was xwaylandvideobridge's invisible window, left as Fedora ships it, Paul's call).

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
