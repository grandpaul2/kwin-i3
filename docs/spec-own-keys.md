# Spec: kwin-i3's own fullscreen and close keys (OPEN.md item 4 (d))

Draft 2026-10-24, waiting on Paul's go. Part of "no dependence on Paul's dotfiles".

## The gap

Meta+F (fullscreen) and Meta+Shift+Q (close) are in kwin-i3's key table in the README and
`docs/plan.md`, but kwin-i3 doesn't register them. The dotfiles' `setup.sh` binds them to KWin's
own actions (`kwin` "Window Fullscreen" and "Window Close", by `setForeignShortcutKeys`). On a
stock Plasma 6.7.5 neither key does anything: in `src/useractions.cpp`, "Window Fullscreen" has
no default key and "Window Close" has only Alt+F4. KWin binds neither Meta+F nor Meta+Shift+Q
anywhere. Other components are checked by the (c) probe, in the stock test mode.

## The change

1. **Two keys in `KEYS`** (`src/kwin.js`), as i3's `fullscreen toggle` and `kill`:
   `"Fullscreen": ["Meta+F"]` and `"Close": ["Meta+Shift+Q"]`. They register as
   "kwin-i3 Fullscreen" and "kwin-i3 Close", like every other kwin-i3 key.
2. **Each one invokes KWin's own action** through the existing `invoke()` (kglobalaccel
   `invokeShortcut`, already used for "Switch to Screen N" and "MoveMouseToCenter"):
   `invoke("Window Fullscreen")` and `invoke("Window Close")`. Reasons:
   - The behaviour stays exactly what is verified live today (`docs/plan.md` "Meta+F": the
     window returns to its tile, focus is held per output, and the rest). It's the same KWin
     slot, so the same code path runs.
   - KWin's slot acts on any active window except the desktop and docks: a window kwin-i3
     doesn't manage (an ignored class, a dialog) still fullscreens and closes, as it does now.
     Acting on kwin-i3's focused con would miss those.
   - `invokeShortcut` works on an action with no key: tests 46 and 51 already rely on it in the
     test KWin, where "Window Fullscreen" has none.
   They go through `act()` like the other keys, for the guard and the `ACTION` log line. The
   rescheduling they cause is harmless: reconcile is idempotent, and fullscreen is handled on
   `fullScreenChanged` as it is now.
3. Alt+F4 stays KWin's, untouched.

## Paul's desktop (the migration)

On Paul's desktop KWin's actions already hold both keys, and kglobalaccel gives a taken key to
whoever holds it, silently. So in the dotfiles:
- `setup.sh`: "Window Close" back to Alt+F4 only; `kwin|Window Fullscreen` off the keep list,
  so the prune clears it (its stock key is none anyway); the guard on that block keys on Meta+W
  (Overview), the one binding left in it.
- `README.md` rows 95-96 (the "Plasma" table): the two keys are kwin-i3's now, not
  `setForeignShortcutKeys`. The hotkeys cheat sheet is unchanged (same keys, same meaning).

**First, the premise to check** in the test KWin (it has its own kglobalaccel), before any of
the above: when kwin-i3 registers a key another action holds, does kwin-i3's action get no key
and *keep* none (written to `kglobalshortcutsrc`) after the other one lets go? If so, the
order matters on the live desktop: clear KWin's two bindings first, then reload kwin-i3, then
check with `shortcutKeys` that "kwin-i3 Fullscreen" / "kwin-i3 Close" have their keys. If they
still have none, set them once with `setForeignShortcutKeys`. The probe decides; the deploy
steps go to Paul with its result.

## Docs

- kwin-i3 `README.md` lines 36-37: "fullscreen (per output, as i3)", "close"; dropping
  "KWin's own". Install step 2: nothing to add, the keys are kwin-i3's.
- `docs/plan.md` rows 136-137: "kwin-i3's key, running KWin's own action".

## Tests

- **New live scenario** (`tests/live/`, with injected keys through `tools/inject.py`): two
  tiled windows. Meta+F: the active one is fullscreen (`fullScreen`, its frame equals the
  output's); Meta+F again: back in its tile, at its old geometry. Meta+Shift+Q: that window
  closes, and the other fills the workspace. Then a window kwin-i3 doesn't manage (an ignored
  class): Meta+Shift+Q closes it too.
- Tests 46 and 51 keep invoking KWin's action directly; they test the fullscreen handling, not
  the key.
- **Watched red**: with the `KEYS` entries removed (a `make mutate` mutant), the new scenario
  fails at the first Meta+F.
- The test KWin's `kglobalshortcutsrc` gets no new line: on a stock config these keys are free,
  so the scenario also checks that there's nothing to unbind.
