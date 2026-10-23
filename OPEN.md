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
- **Fuzz I1, seed 2: "window w3 not in its tile; window w12 not in its tile" on workspace 2**
  (138 steps, reproduces on every replay; the shrinker reached only 123 in its 20 minutes). Next:
  replay with a trace in a worktree to find the step where the two leave their tiles (also
  `tests/fuzz/out.run3/2/shrunk.json`, 2026-10-23).
- **Fuzzer, further speed-ups** (efficiency review, 2026-10-23; the three safe ones are done:
  shrinking out of the campaign, known signatures skipped, the shrinker's no-op loop). Left, each
  with a risk to the timing bugs the fuzzer finds: shorter fixed waits in `fuzz.py` (0.45 s per
  step; polling the log for 100 ms of quiet instead of a 250 ms sleep is the safe form), more
  `--jobs` than 4 (compare steps per seed first: fewer means contention), and a known signature
  still ending its seed early (`--skip` on the invariant is the way past). Next: try `--jobs 6`
  once and compare steps per seed with the 58-seed run of 2026-10-23.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
