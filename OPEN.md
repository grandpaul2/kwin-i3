# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-23**.

## Open

- **Atomic layout effect, live since 2026-10-23 03:20: watch for flashes.** Paul saw a few in the
  first minute or two, then none; the effect's counters showed 4 of 89 holds hitting the 100 ms
  timeout by 03:50 (a timed-out hold shows the flash it was meant to hide). Sway's default is
  200 ms. **Next session: ask Paul whether he has noticed any more**, and read the counters
  (`busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats`:
  `timeouts` against `transactions`, `maxMs`). If timeouts keep coming in normal use, raise
  `kwinrc [kwin-i3-hold] TimeoutMs` to 150-200 and reconfigure. Counters reset when KWin restarts.
- **Fuzz I10: a tiled window's frame is not its tile** (2026-10-22 campaign: seeds 7, 14, 25, 33,
  each 0/2 on replay). **Now reproducible**: seed 14 of the 2026-10-23 run, shrunk to 27 actions,
  fails 3/3 (`w9 frame [299,0,981,720] is not its tile [199,0,654,720]`), on the code before and
  after the nested-box change alike. Trace: `tests/fuzz/out.run3/14/shrunk.json`. Probably the same
  as `51-input.sh`'s one failure under the full parallel suite (1176 after a resize drag, wanted
  1280; never alone). Seed 3 of the 2026-10-23 run with the kwini3hold effect loaded is the same
  signature and fails 3/3 on the code without the effect too (105 actions, unshrunk:
  `tests/fuzz/out.run4/3/trace.json`). **Shrunk to 7 actions** by the fixed shrinker
  (`tests/fuzz/out.run3/14/shrunk-7.json`, 3/3): open w12, w13; disable the second output; open a
  slow window (map delay 1 s); kill w13; open a window with a dialog; enable the output again.
  Next: replay those 7 with a trace in a worktree.
- **Fuzz I2, seed 7: a tiled window outside its monitor** (2026-10-23 run: `w13 [1280,0,501,720]
  outside Virtual-0 [0,0,1280,720]`), shrunk to 51 actions, 3/3, on the code before and after the
  nested-box change alike. Trace: `tests/fuzz/out.run3/7/shrunk.json`. Next: replay with a trace.
- **Fuzz I1, seed 2: "window w3 not in its tile; window w12 not in its tile" on workspace 2**
  (138 steps, reproduces on every replay; the shrinker reached only 123 in its 20 minutes). Next:
  replay with a trace in a worktree to find the step where the two leave their tiles (also
  `tests/fuzz/out.run3/2/shrunk.json`, 2026-10-23).
- **Fuzz I9, seed 28: a floating dialog (w7 dialog) off its monitor after an unplug and replug**
  (shrunk 73 -> 26 actions, `tests/fuzz/out.run3/28/shrunk.json`, reproduces every replay). Traced: when
  the monitor returns, relocate() sends the parent w7 there; KWin's `sendToOutput` sends its
  transients along (`window.cpp:3918`), and the dialog, hidden, gets a request it never applies
  (its size changes too, 128 -> 178 high; the parent, same size, moved at once). relocate()'s own
  send of the dialog is then a no-op: KWin already counts it as on that monitor
  (`moveResizeOutput() == newOutput`, `window.cpp:3892`). Same family as the accepted I9 limit and
  the seed-1 fix (a hidden window can't apply a size change), but here KWin, not kwin-i3, asks for
  the size. Next: find where the 50 px comes from (KWin's `ensureSpecialStateGeometry` or the
  client), then decide: avoid it, or accept it with the I9 limit.

- **Fuzzer, further speed-ups** (efficiency review, 2026-10-23; the three safe ones are done:
  shrinking out of the campaign, known signatures skipped, the shrinker's no-op loop). Left, each
  with a risk to the timing bugs the fuzzer finds: shorter fixed waits in `fuzz.py` (0.45 s per
  step; polling the log for 100 ms of quiet instead of a 250 ms sleep is the safe form), more
  `--jobs` than 4 (compare steps per seed first: fewer means contention), and a known signature
  still ending its seed early (`--skip` on the invariant is the way past). Next: try `--jobs 6`
  once and compare steps per seed with the 58-seed run of 2026-10-23.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
