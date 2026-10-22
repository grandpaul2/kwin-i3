# kwin-i3: review of the switch-over onto Paul's real session (2026-10-22)

Scope: what happens on his desktop (Fedora 44, Plasma 6.7.5 Wayland, two 2560x1440 monitors), not
code style. Method: read `README.md`, `CLAUDE.md`, `docs/plan.md`, `src/*.js`, his `kwinrc`,
`kglobalshortcutsrc`, `setup.sh`, README "Plasma" table; plus throwaway scenarios in the isolated
headless harness (scratch scripts outside the repo; nothing loaded into his KWin, no repo file
changed). Time-boxed to 15 minutes, so findings say what was observed and what was only read.

## Verdict

**GO for a supervised switch-over, with S1-S3 fixed or consciously accepted first.** Key ownership is
clean, the release key works in the harness, debug logging is off, and no notification path exists.
The real risks are a script that cannot load (S1, no way to release), windows that do not fit
(S2), and the missing install step in the plan (S3).

## Findings, ranked

### S1 (high): `start()` is not inside any guard, so a throw leaves a half-started script with no release key

Evidence: `src/kwin.js` `start()` (lines 661-712). Every handler is wrapped by `guard()`, but
`start()` itself is called bare from `main.js`. `registerKeys()` is the second-to-last statement. If
anything earlier throws, the signal handlers and every key, including `Meta+Ctrl+Shift+Q`, are
never registered. Concrete throw sites on a real session:

- line 677-680: `workspace.windowList().forEach(... w = x)`, then `expected[leaf.win] = w.tile` and
  `connectWindow(w)`. If a tile read back from KWin holds a window id the loop does not find (a
  window that closes between `specOf` and the lookup) `w` is `null` and `w.tile` throws.
- `specOf` calls `Rules.classify`, and `classify` reads `w.windowRole`, `w.resourceName`: an X11
  window mid-creation could throw there too.

Consequence: tiles and windows already adopted stay as they are, nothing reacts to later events, and
the only way back is the D-Bus `invokeShortcut` route (which does not exist, since `Release` was
never registered) or `unloadScript` plus manual untiling.

Fix: register the release key and the release function first, then run the rest of `start()` in
`try { ... } catch (e) { log(...); release(); }`, so a failed start degrades to "kwin-i3 off". Guard
the per-window lookup (`if (!w) return;`). Add a live test that starts with a window that vanishes
mid-start, or a mutation that throws inside `start()`, and assert the release key still works.

### S2 (high): a window whose minimum width does not fit pushes its neighbours and itself off the monitor

Evidence (harness, two 1280x720 outputs, windows already open, then kwin-i3 loaded; client `--min
900x500` among two normal windows):

```
H[A C* Big]      A 0,0 427x720    C 427,0 533x720    Big 960,0 900x720
log: WARN sizes did not settle after 4 passes
```

`Big` spans x=960..1860 on a 1280 px screen: 580 px of it is off the monitor. In a second run (two
windows, one with `--min 900x500`) `Big` sat at x=640, width 900, 260 px off screen. The plan's
policy table says "a window that can't fit floats"; the code only copies `minSize` into the tile's
`minimumSize` (`prepareTiles`) and never floats anything. On his 2560 px monitors the same happens
when the sum of the minimums exceeds 2560: Prism Launcher, KeePassXC, Discord and Firefox each
have a minimum in the 400-800 px range, so four or five in one workspace (a normal day on ws 1)
gets close, and Discord/Firefox at a 1/6 split would exceed their minimum.

Fix: in `reconcile`, before `project`, sum the minimum extents along each split direction; when
they exceed the screen, float the window with the largest minimum (the new one) and say so in the
log. Add a live test with three `--min` windows whose minimums sum above the screen, assert every
frame lies inside the output and that `INVARIANT`/`WARN` stay clean.

Also seen in the same scratch run, not isolated within the time box: one scenario with a fixed-size
window, a dialog and a plain window (`A`, `Big --min 900x500`, `Fixed --fixed`, `D --dialog`, `C`)
loaded mid-session ended with `C` absent from the tree and sitting unmanaged at 593,326. Worth a
live test of "load with N windows already open" asserting `tree` mentions every window.

### S3 (high, procedure): the plan never installs the script

Evidence: `docs/plan.md` phase 5 lists the kwinrc keys and the logout, but the package is not under
`~/.local/share/kwin/scripts/`; linking it is in phase 6, after Paul has used it. Also, `kwin-i3`
reads its options from `[Script-kwin-i3]`, but the plan and `rules.js` comment say it "reads
Krohnkite's `floatingTitle`". It does not (the group is its own); the default
`STAGE (streamed)` happens to match, so nothing breaks, but the comment misleads.

Fix: add to the checklist below (symlink `package/` to `~/.local/share/kwin/scripts/kwin-i3` and
verify `kpackagetool6`/`metadata.json` `Id` equals the directory name). Fix the `rules.js` comment.

### S4 (medium): the release key does not undo everything, and shortcut inhibition can hide it

Observed in the harness: `Meta+Ctrl+Shift+Q` pressed with real input logs `RELEASED`, tiled windows
untile and return to floating geometry (`A 440,196 400x328` etc.). Good. Gaps:

- `release()` only clears roots of workspaces the model has touched (`model.workspaces`), so empty
  desktops keep KWin's saved 3-column template. His `kwinrc` has 20 `[Tiling]` groups (10 desktops
  x 2 monitors), and desktop 1 has two non-template layouts (50/50 and 59/41). These are harmless
  until he Meta+drags a window and sees KWin's tile overlay, or uses KWin's quick-tile.
- Release is one-way until the script is reloaded (`released = true`); it does not unregister the
  keys, so `Meta+1..0` stay grabbed by a dead script: **workspace switching is gone after release**
  (the i3ws stale entries are also gone with it). Nothing in the plan says what he presses next. He
  should expect to log out, or `unloadScript kwin-i3` (which frees the keys) and re-enable
  `i3ws`/Krohnkite at the next login.
- A client holding a keyboard shortcuts inhibitor (an Xwayland client with a keyboard grab, i.e.
  the Xephyr stage window; some VM/remote windows) blocks all global shortcuts, release included,
  except KWin's own `Meta+Shift+Esc` escape, which his config keeps. Document it: first
  `Meta+Shift+Esc`, then release.
- A hang is a different failure: a script in an infinite loop freezes the compositor. The loops in
  `build()` (`while (tile.tiles.length < p.kids.length)`) and `reconcile` (`while (root.tiles.length)
  ... remove()`) have no iteration bound. I could not make either spin (12 windows in a row on
  1280 px produced the S5 sizes, not a hang), but a bound (e.g. 64 iterations then `release()`) turns
  a frozen desktop into a logged failure.

Fix: bound those two loops and call `release()` on overrun; make `release` also remove template tiles
from every desktop/output root; write the "after release" expectations into the checklist. Recovery
for a frozen compositor is a TTY (Ctrl+Alt+F3): edit `~/.config/kwinrc` (`kwin-i3Enabled=false`,
`i3wsEnabled=true`, `krohnkiteEnabled=true`) then `systemctl --user restart plasma-kwin_wayland` or
just log out. Put that in the checklist as a printed card, since the clipboard dies with the session.

### S5 (medium): rows of 12+ windows degrade badly (not a hang)

Harness, 1280 px: 5 to 8 windows tile evenly (256, 213, 183, 160 px). With 12 windows in one row,
`WARN sizes did not settle after 4 passes` and the widths become 640, 320, 160, 80, 40, 21, 21...
KWin's per-tile minimum apparently stops the split. On 2560 px the same cliff is at roughly 24
windows, so this only matters if everything lands on one workspace (e.g. after a monitor unplug moves
all workspaces to one). Low probability, but the result is unrecoverable by hand. Fix with S2's
"float what does not fit" rule (floating the 9th+ window instead of tiling it).

### S6 (medium): first load and numbering

- Login detection (`start()`, line 664) is "no normal windows exist". If KWin loads the script after
  an autostarted or session-restored window already exists, `login` is false: monitors are not
  numbered and the one-shot renumber on `currentActivityChanged` is not connected, so workspace
  1 may land on the left monitor instead of the primary. `i3ws` did not depend on this (it numbered
  on every load). Safer: always connect the activity hook; number at start if `login`; and have the
  hook number only when the model has no window on the screens yet.
- Mid-session load (not the plan, but the `unloadScript`/reload path the README advertises):
  windows present in KWin's tiles are adopted and the rest are tiled after focus order from
  `stackingOrder`; minimized windows lose their place (documented). A fullscreen Minecraft at load:
  `adoptWindow` calls `w.setMaximize(false, false)` if `maximizeMode !== 0`; I did not test whether
  that leaves a fullscreen window fullscreen (the test client has no fullscreen flag). Guard it with
  `if (!w.fullScreen && w.maximizeMode !== 0)`, since cost is zero.
- His saved `[Tiling]` layouts hold no windows, so `specOf` returns null and discards them (decision
  5), correct. Reconcile then rewrites the roots of any workspace that has windows, so the 59/41 and
  50/50 layouts on desktop 1 vanish. They were Krohnkite-era or hand-made leftovers; nothing to do,
  but expect desktop 1 to look different from yesterday.

### S7 (low-medium): every floating window is forced `keepAbove`

`setFloatingLook` sets `keepAbove = true` on every float: dialogs, the stage Xephyr window (1280x720
on a 2560 monitor), anything with a fixed size, including a fixed-size launcher or splash window.
Krohnkite did not do that. Consequences on his session: the stage always covers tiled windows
(probably wanted), a Prism Launcher or KeePassXC dialog stays above Minecraft's windowed mode, and
a float that belongs to another workspace's app stays above in its own workspace only (fine). It is
undone on release. Accept, or restrict to transients (floats that are not user-toggled). Note it in
the checklist so a "why is this window on top" is not a mystery.

### S8 (low): shortcut ownership, checked and clean

Read `kglobalshortcutsrc` and loaded kwin-i3 with a copy of it in the harness (the harness's own
config is a stripped one, so this was untested before). Results:

- None of kwin-i3's default keys is held by a live action: the stock KWin quick-tile, desktop-switch,
  `Meta+0` zoom and `Meta+L` lock entries are all `none` for him; `Meta+V` (klipper) and
  `Meta+1..9` (task manager entries) are `none`; `Meta+D`, `Meta+Return`, `Meta+N`, `Meta+B` are
  launchers on other keys; `Meta+W`, `Meta+F`, `Meta+Shift+Q` (kwin) are not in kwin-i3's table.
- His file still holds 47 `i3ws ...` entries bound to the same keys. When kwin-i3 registered, it got
  the keys anyway: `shortcutKeys` for `kwin-i3 Workspace 1` is `Meta+1`, and pressing `Meta+1`,
  `Meta+2`, `Meta+J`, `Meta+Left`, `Meta+Shift+3`, `Meta+H`, `Meta+Ctrl+Left` and the release chord for
  real (libei injection) fired exactly the kwin-i3 actions. Both the dead `i3ws` entry and the
  new one report the same key afterwards; harmless because the old script isn't loaded, but it
  means `setup.sh` (which skips `i3ws*` when pruning, line 228) and `health-check` should not treat
  "two actions on one key" as an error after the switch-over.
- `setup.sh` is absent-only for `krohnkiteEnabled`/`i3wsEnabled`, so after the kwinrc edit a re-run
  will not turn them back on, unless the keys are deleted rather than set to false. Set them
  `false`, never delete them. Its step at lines 243-251 waits for Krohnkite/i3ws names and will
  print "not loaded after 20 s" if run after the switch; expected and harmless until phase 6.

### S9 (info): performance, debug log, notifications

- **Reconcile cost.** Every handler schedules a zero-interval coalesced pass. `act()` calls
  `scheduleAll()`, so a key press reconciles all 10 workspaces, but a reconcile on an unchanged
  workspace only reads tile properties (in-process) and writes nothing (`prepareTiles` and
  `setSizes` write only on difference). 12 windows opened in 5.8 s wall time including KWin start-up
  and client creation in the harness. Focus-follows-mouse only calls `model.focusWin` (no reconcile),
  so nothing scales with the 240 Hz refresh. No timers, no polling. Fine for ~15 windows.
  Minor waste: `log("TREE " + named(model.describe(...)))` and `checkInvariants` build their strings
  on every reconcile even when `DEBUG_LOG` is false (the argument is evaluated before `log` returns
  early). Optional: `if (DEBUG_LOG)` around them.
- **Debug log.** Off by default: `DEBUG_LOG` is true only if `[Script-kwin-i3] debugLog=true`; his
  `kwinrc` has no such group, so `callDBus` is never issued and the `Selftest Throw` shortcut is not
  registered. Verify at switch-over that no `[Script-kwin-i3]` group exists.
- **Dialogs/notifications.** The script contains no `notify`, `showOSD`, `print`-to-UI or dialog
  call. A script exception goes to the journal only. The `callDBus` target
  `net.local.kwini3.log` is silent when nobody owns it. Plasma's own desktop-switch OSD, which he
  keeps by decision, will appear exactly as it does under `i3ws`.

### S10 (info): app behaviour read from the rules

- **Xephyr stage** ("STAGE (streamed)", fixed 1280x720 with no `-resizeable`): `!w.resizeable`
  floats it at once, and the title rule also catches it. Good. Under the harness a `--fixed` client
  stayed at its size and floated (`~Fixed`).
- **Games/fullscreen:** `fullScreenChanged` records the state, `tileChanged` for a fullscreen
  window is ignored. Minecraft fullscreen on ws 5 should be untouched; not tested with a real game.
  Workspace switching away from a fullscreen window leaves it in its tile (plan, verified).
- **Dialogs and splash windows:** transient/modal/dialog/splash/utility float; a window that is
  not transient but pops up as a launcher (Prism Launcher's first window, Discord's updater) tiles
  until it sets a fixed size and `reclassify` runs on `readyForPainting`/caption/class change.
  Expect one visible re-layout for those.
- **Windows that re-parent (Steam-like):** handled only by `windowClassChanged`/`captionChanged`
  reclassification; no live test exists. Not on his list of apps.

## Proposed switch-over checklist

Do it with Paul present. The clipboard dies at logout, so keep the "way back" on screen or on disk.

0. **Pre-flight (read-only, before logout).**
   - `make test` green; `git status` clean and pushed in both repos.
   - No `[Script-kwin-i3]` group in `~/.config/kwinrc` (debug log off).
   - `kglobalshortcutsrc`: no live action other than `i3ws*` holds a kwin-i3 key (rerun the check in
     S8 with `getGlobalShortcutsByKey` on the real bus if wanted; read-only).
   - Back up: `cp ~/.config/kwinrc ~/.config/kwinrc.pre-kwin-i3` and `cp ~/.config/kglobalshortcutsrc
     ~/.config/kglobalshortcutsrc.pre-kwin-i3`.
   - Write the way-back on disk, e.g. `~/kwin-i3-WAYBACK.txt`: the three kwinrc lines reversed, the
     TTY recovery below, and the release key.
1. **Install (S3).** Make sure S1, S2 are fixed or accepted. `ln -s ~/kwin-i3/package
   ~/.local/share/kwin/scripts/kwin-i3`; check that `metadata.json` `Id` is `kwin-i3`.
2. **kwinrc, with KWin not yet running the new config (nothing reloads it):**
   `kwriteconfig6 --file kwinrc --group Plugins --key i3wsEnabled false`,
   `... --key krohnkiteEnabled false`, `... --key kwin-i3Enabled true`. Do **not** delete the old keys
   (setup.sh is absent-only and would re-enable them). Do not run `reconfigure`: three scripts would
   place the same windows while the old ones are still loaded.
3. **Close** the stage and Minecraft, save work (Krohnkite is QML; a logout is required).
4. **Log out and in.**
5. **Verify live** (read back from the running KWin, per the repo's Plasma procedure):
   `isScriptLoaded kwin-i3` true, `i3ws`/`krohnkite` false; workspace 1 on the right (primary)
   monitor, 2 on the left; `Meta+2` moves to the left monitor; open Alacritty twice, `Meta+H`/`Meta+V`
   split, `Meta+arrows` focus, `Meta+Shift+arrows` move, `Meta+Ctrl+arrows` resize.
6. **Awkward apps, one at a time:** start `stage` (the Xephyr window must float at 1280x720, above
   the tiles); Firefox, Prism Launcher, KeePassXC, Discord (watch for off-screen edges, S2); Minecraft
   fullscreen on ws 5 and back (`Meta+F`), then switch workspaces away and back.
7. **Release test while nothing is at stake:** press `Meta+Ctrl+Shift+Q` with 3 windows open.
   Expect: windows float where they were, keys `Meta+1..0` stop working (S4). Then `unloadScript
   kwin-i3` (`busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s
   kwin-i3`), then a logout restores the old pair after reversing step 2.
8. **If the desktop freezes:** Ctrl+Alt+F3, log in, run step 2 reversed
   (`kwin-i3Enabled false`, `i3wsEnabled true`, `krohnkiteEnabled true`), then `exit` and log out
   of the graphical session (or `systemctl --user restart plasma-kwin_wayland`).
9. **Only after Paul says it is good**, phase 6 (`setup.sh` link, retire `i3ws` and Krohnkite).
   Until then the old scripts stay in the dotfiles repo untouched.

## Disposition

| Finding | Verdict |
|---|---|
| S1 start() unguarded | MUST FIX before switch-over |
| S2 minimum sizes off-screen | MUST FIX or float-on-overflow stub before switch-over |
| S3 install step missing, comment wrong | MUST FIX (checklist step 1, comment) |
| S4 release gaps, unbounded loops | Fix loop bounds; document the rest in the checklist |
| S5 12+ in a row | Falls out of S2's fix |
| S6 login heuristic, fullscreen maximize guard | Fix (cheap) |
| S7 keepAbove on all floats | Accept or restrict; ask Paul |
| S8 key ownership | Clean, no action |
| S9 perf, log, notifications | Clean; optional `DEBUG_LOG` guard around log string building |
| S10 apps | Checked by the checklist steps 5-6 |
