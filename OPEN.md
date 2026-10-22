# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. The dotfiles' `OPEN.md` keeps only what touches the system (phase 6).

Last reconciled: **2026-10-22**.

## Open

- **Fuzz finding I9: a floating window off its monitor after an unplug + replug** (seed 214; KWin
  briefly refuses to tile a window and kwin-i3 floats it). 2/3 reproducible, 138-step trace in
  `tests/fuzz/out/214/`. Next: `tests/fuzz/run.py --reshrink 214` for a short repro, then a live test
  and the fix. Plausible in real use (his Dell drops its link when asleep).
- **Fuzz finding I2: a modal dialog Meta+dragged to the other monitor leaves its parent outside its
  monitor** (seed 215, 99-step trace in `tests/fuzz/out/215/`, 2/3). Next: `--reshrink 215`, then a
  test and the fix. Rare in real use.
- **The shrinker rework is only partly verified** (`tests/fuzz/run.py` `shrink()`): taking the first
  failing candidate at once was seen working (99 → 90 actions in 2 min); counting tries when a replay
  starts, and skipping confirmation on `--reshrink`, have not run yet. Next: the two reshrinks above
  are its test; fix whichever phase misbehaves.

- **Mouse chords plugin: first live load waits for Paul's next login** (installed 2026-10-22 by
  `make plugin-install`; the drop-in giving KWin `QT_PLUGIN_PATH` only applies to a new KWin). Until
  then Meta+drag still moves (`CommandAll1=Nothing` is written, not applied). Next, after the login:
  `busctl --user get-property org.kde.KWin /Plugins org.kde.KWin.Plugins LoadedPlugins` lists
  `kwini3mouse-…` (health-check says so too), then Paul tries Meta+Shift+drag. The fuzzer still
  drives moves with KWin's Meta+drag, not the plugin; worth a plugin action there if the plugin grows.

`tests/fuzz/out/` is gitignored: those traces live only on this disk.
