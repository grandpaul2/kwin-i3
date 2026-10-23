# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-23**.

## Open

- **Atomic layout effect (kwini3hold), live since 2026-10-23 03:20: watch for flashes, and the
  200 ms trial.** Flashes seen: a few in its first minutes, then none until ~06:30, one on closing
  a window while the machine was busy (the suite and a build running). The counters then: 7
  timeouts of 136 transactions (max 112 ms), close holds 41 kept, **1 dropped**, which fits that
  flash: the effect keeps a closed window's pixels only until its neighbours' layout change
  begins and gives up after `s_graceMs` (20 ms, `hold.cpp`); with the machine busy, kwin-i3's
  reconcile came later. Paul: no action yet, documented. If it recurs: measure the
  close-to-reconcile delay on a busy machine and lengthen the grace, or tie it to the timeout.
  **`TimeoutMs` is 200 (Sway's) live since ~06:45** (Paul: "I'd like to see it; if it doesn't
  feel slow we could just leave it"). **Every session: ask Paul** about flashes and whether 200
  feels slow, and read the counters (`busctl --user --json=short call org.kde.KWin /kwini3hold
  net.local.kwini3hold Stats`: `timeouts`/`transactions`, `maxMs`, `closeHoldsDropped`; they
  reset when KWin restarts). If 200 stays: `kset kwinrc kwin-i3-hold TimeoutMs 200` in dotfiles'
  setup.sh and the spec's "100 ms" becomes 200. Change the keys with `kwriteconfig6 --notify`
  alone (README, Configuration).
- **Fuzz once with the frame selected** (`KI3_FRAME=1 make fuzz`, 20 min): the spec's last step
  for kwini3frame, not yet run (a session-end start of it was wrong and was killed, 2026-10-23).
  The suite otherwise runs Breeze, whose 150 px minimum and 28 px frame the normal campaigns
  cover. Next: run it at the start of a working session, in the background with 2-minute checks.
- **Fuzzer, further speed-ups** (efficiency review, 2026-10-23; done: shrinking out of the
  campaign, known signatures skipped, the shrinker's no-op loop, and `--jobs 6` as the default
  since 2026-10-23: 94 seeds in 20 min against 73 with 4 jobs, at the same steps per seed, median
  142 against 141, so no contention; `tests/fuzz/out.run6-jobs6`). Left, each with a risk to the
  timing bugs the fuzzer finds: shorter fixed waits in `fuzz.py` (0.45 s per step; polling the log
  for 100 ms of quiet instead of a 250 ms sleep is the safe form), `--jobs 8` (compare steps per
  seed again), and a known signature still ending its seed early (`--skip` on the invariant is the
  way past). Next: the 100 ms-of-quiet poll, then compare steps per seed.
- **Fuzz I2, seeds 41 and 71 of the 6-job run (2026-10-23): flaky**, `w16 [0, 0, 1461, 720]
  outside Virtual-0 [0, 0, 1280, 720]` (a window wider than its monitor), 0/2 on replay. The three
  fixes of that day (I1, I10, I2 seed 7) did not recur in 94 seeds. Next: if it shows again, replay
  with the 150 ms focus delay the earlier campaigns had (seed 2's I1 only reproduced with it).

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
