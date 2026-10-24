# Spec: kwin-i3's own fullscreen and close keys (OPEN.md item 4 (d))

Paul's go 2026-10-24; built the same day. Part of "no dependence on Paul's dotfiles".

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
   They do **not** go through `act()`, only through `guard()` and the `ACTION` log line. Found by
   the new scenario: `act()` asks for kwin-i3's focus afterwards, the flush activated kwin-i3's
   focused window before KWin's queued action ran (`invokeShortcut` is asynchronous), and
   Meta+Shift+Q on a window kwin-i3 doesn't manage closed a tiled one instead. Nothing needs
   rescheduling: fullscreen is handled on `fullScreenChanged`, a close on `windowRemoved`.
3. Alt+F4 stays KWin's, untouched.

## Paul's desktop (the migration)

On Paul's desktop KWin's actions already hold both keys, and kglobalaccel gives a taken key to
whoever holds it, silently. So in the dotfiles:
- `setup.sh`: "Window Close" back to Alt+F4 only; `kwin|Window Fullscreen` off the keep list,
  so the prune clears it (its stock key is none anyway); the guard on that block keys on Meta+W
  (Overview), the one binding left in it.
- `README.md` rows 95-96 (the "Plasma" table): the two keys are kwin-i3's now, not
  `setForeignShortcutKeys`. The hotkeys cheat sheet is unchanged (same keys, same meaning).

**The premise, probed** in the test KWin (2026-10-24): a script that registers a key KWin's
action already holds is *given* it too: `shortcutKeys` reports the key on both. A press runs only
the first holder's action, KWin's, and the script's does nothing. Cleared from KWin's action,
the key runs the script's at once, in the same session, and it stays after a reload. So the order
on the live desktop doesn't matter; the smooth one: reload kwin-i3 (KWin's still wins, nothing
changes), then clear KWin's two bindings. **For (c)**: `shortcutKeys` can't tell which keys
kwin-i3 really got; the load-time check has to compare against the other holders.

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
