# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-23**.

## Open

- **Atomic layout effect, live since 2026-10-23 03:20: watch for flashes.** Paul saw a few in the
  first minute or two, then none; the effect's counters showed 4 of 89 holds hitting the 100 ms
  timeout by 03:50, and 6 of 125 (max 112 ms) later that day, when Paul had seen no more flashes
  (a timed-out hold shows the flash it was meant to hide). Sway's default is 200 ms. **Every
  session until Paul closes this: ask whether he has noticed any**, and read the counters
  (`busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats`:
  `timeouts` against `transactions`, `maxMs`). If timeouts keep coming in normal use, raise
  `kwinrc [kwin-i3-hold] TimeoutMs` to 150-200 and reconfigure. Counters reset when KWin restarts.
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
