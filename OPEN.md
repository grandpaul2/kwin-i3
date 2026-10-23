# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-23**.

## Open

- **Next session: the i3frame decoration as a KDecoration3 plugin** (Paul, 2026-10-23: "we can
  build it here next session"). Goal: no resize cursor at window edges and no edge drag; the same
  1 px blue/grey frame, borders Tiny, no resize-only strips, an empty title bar, every pointer
  event accepted so the section never changes. Meta+left/right-drag are global window actions,
  handled before the decoration, so the mouse chords and Meta+right-drag resize (and its
  read-back) stay. A third target in `plugin/`, installed by `tools/plugin-install.sh` (a
  `org.kde.kdecoration3/` dir under the plugin root; `kwinrc [org.kde.kdecoration2] library=`
  must name the installed file, so each install rewrites it); dotfiles' setup.sh then retires the
  Aurorae theme. **`docs/spec-decoration.md` is at revision 2** (written against the 6.7.5
  sources, reviewed twice, every finding folded in (revision 3); Paul's
  answers in; focus on the frame follows i3 through kwini3mouse). Next: `sudo dnf install
  kdecoration-devel`, then code from revision 3 (or a third review first if Paul wants one).

- **Atomic layout effect, live since 2026-10-23 03:20: watch for flashes.** Paul saw a few in the
  first minute or two, then none; the effect's counters showed 4 of 89 holds hitting the 100 ms
  timeout by 03:50, and 6 of 125 (max 112 ms) later that day, when Paul had seen no more flashes
  (a timed-out hold shows the flash it was meant to hide). Sway's default is 200 ms. **Every
  session until Paul closes this: ask whether he has noticed any**, and read the counters
  (`busctl --user --json=short call org.kde.KWin /kwini3hold net.local.kwini3hold Stats`:
  `timeouts` against `transactions`, `maxMs`). If timeouts keep coming in normal use, raise
  `kwinrc [kwin-i3-hold] TimeoutMs` to 150-200 and reconfigure. Counters reset when KWin restarts.
- **Fuzzer, further speed-ups** (efficiency review, 2026-10-23; the three safe ones are done:
  shrinking out of the campaign, known signatures skipped, the shrinker's no-op loop). Left, each
  with a risk to the timing bugs the fuzzer finds: shorter fixed waits in `fuzz.py` (0.45 s per
  step; polling the log for 100 ms of quiet instead of a 250 ms sleep is the safe form), more
  `--jobs` than 4 (compare steps per seed first: fewer means contention), and a known signature
  still ending its seed early (`--skip` on the invariant is the way past). Next: try `--jobs 6`
  once and compare steps per seed with the 58-seed run of 2026-10-23.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
