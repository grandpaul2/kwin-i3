# Spec: report the keys kwin-i3 didn't get, and an opt-in to take them (OPEN.md item 4 (c))

**Now (2026-10-27):** Built and live 2026-10-24; the settings page's Keys sub-page takes keys too, into the same record. What it does: `behaviour.md` §8, "Taken keys", and §13.

Paul's go 2026-10-24; built the same day. The design was agreed earlier the same day: report, never
take at load; the fix is opt-in, beside `plugin-install`; one notification shared with (b).

## The gap

`registerShortcut` always returns true. When another action already holds a key, kglobalaccel
gives kwin-i3's action the key too (`shortcutKeys` shows it on both), but a press runs only the
first holder's action (probed 2026-10-24, `docs/records/spec-own-keys.md`). On a stock Plasma that is
21 of kwin-i3's keys (Meta+arrows, Meta+Ctrl+arrows, Meta+Shift+Left/Right, Meta+1..9, Meta+0,
Meta+V) plus Meta+E (Dolphin) and Meta+L (lock). Nothing says so: the key just does Plasma's thing.

## What a script can see (probed 2026-10-24 in the test KWin)

- `org.kde.KGlobalAccel.action(i key)` returns `[component, action, componentFriendly,
  actionFriendly]` of the holder whose action **fires**. With KWin's Quick Tile Left and a
  script's action both on Meta+Left, it named Quick Tile Left, the one a press runs.
- `org.kde.kglobalaccel.Component.allShortcutInfos()` on `/component/kwin` returns every KWin
  action, kwin-i3's included, as plain JS arrays: `[name, friendly, component, componentFriendly,
  context, contextFriendly, keys, defaultKeys]`, with keys as Qt key codes. That gives kwin-i3's
  **current** keys, including ones the user has rebound, with no key-name table needed for the check.
- `org.freedesktop.Notifications.Notify` through `callDBus`, with `[]` and `{}` for actions and
  hints, reaches the server and returns its id (a stand-in server on the test bus received it).

## The change

1. **The check, at load** (`src/kwin.js`, after `registerKeys`). `allShortcutInfos` on
   `/component/kwin`, and for each `kwin-i3 …` action, each of its current keys, one
   `action(key)` call. A key whose answer isn't a `kwin-i3 …` action is **taken**, by that
   holder. The replies are counted, and when the last one is in, the result is handed to the
   report (5). No timer: it is complete when the replies are.
2. **Key names for people**: a small Qt-code-to-text function (Meta/Ctrl/Alt/Shift + letters,
   digits, arrows, Space, the symbols kwin-i3 uses), only for the notice's text. Unit-tested in
   node against `tests/keys.json`, so every default key round-trips.
3. **`warnTakenKeys`** (bool, default true) in `[Script-kwin-i3]` and the Configure form: for
   someone who gave a key to something else on purpose. With it off, no check runs.
4. **`make take-keys`** (`tools/take-keys.py`: Python 3 stdlib plus `busctl`, as `setup.sh`
   already uses for JSON). It refuses unless kwin-i3 is loaded (its actions must exist). For each
   kwin-i3 key, `action(key)`; for each one taken, it saves the holder's current keys to
   `~/.local/state/kwin-i3/taken-keys.json` and removes only that key from the holder
   (`setForeignShortcutKeys`), keeping the holder's other keys. kwin-i3's action works at once
   (probed: no reload). It prints what it took. Run again, it takes only what is still taken and
   adds to the file without overwriting an earlier entry.
   **`make restore-keys`**: writes each saved holder's keys back and removes the file. Both
   are listed in the README beside `plugin-install`.
5. **The report: one notification per load**, shared with (b) when it comes (a `Report` list that
   (b) adds a line to). Summary "kwin-i3: N keys are taken by other shortcuts". Body: one line per
   key, "Meta+E: Dolphin (Launch)", then "Free them in System Settings > Shortcuts, or run
   `make take-keys` in kwin-i3's folder; turn this off in kwin-i3's settings". With nothing to
   report, there's no notification. The same lines go to the log (and so to Dump State).
   kwin-i3's first notification; errors stay in the journal.

## Limits, said in the README

- It is checked at load (login, a reload). An app that registers a clashing shortcut later is
  only seen at the next load.
- **An inactive holder doesn't block** (found by the scenario's press-every-key check, 2026-10-24):
  a component registered but not active (`Component.isActive` false: its app not running, and
  not one kglobalaccel launches itself) keeps its key on paper, but kwin-i3's action fires. So
  the check and `take-keys` look up the holder's component (`getComponent`, then `isActive`) and
  skip an inactive one; the check logs it as `TAKEN-INACTIVE`. `KGlobalAccel.action` doesn't
  look at that.

## Paul's desktop

`setup.sh` pruned every Plasma shortcut kwin-i3 uses, so the check should find nothing and show no
notification. That is the live check after the reload: no notification, and `make take-keys`
prints "nothing taken".

## Tests

- **Unit**: the key-name function, every key in `tests/keys.json` round-trips (text → code →
  text, with the code table in the test, not taken from `src/`).
- **`tools/fakenotify.py`**: the stand-in notification server from the probe, on the test bus,
  writing every `Notify` to a file.
- **New live scenario `35-taken-keys.sh`**: before kwin-i3 loads, KWin's Quick Tile Left gets
  its stock Meta+Left back, and a stand-in foreign component (`doRegister`, then
  `setForeignShortcutKeys`) holds Meta+E.
  Plus an inactive stand-in (`doRegister` only) holding Meta+H; the active one is registered
  as a running app is (`doRegister`, then `setShortcutKeys` with SetPresent).
  1. At load: exactly one notification, naming Meta+Left and Meta+E and no other key; Meta+H
     logged as inactive.
  2. **The claim itself**: every default key from `tests/keys.json` pressed (injected), and
     the ones that don't fire kwin-i3's action are exactly the ones reported.
  3. `make take-keys` (with the test's state dir): Meta+Left and Meta+E now fire kwin-i3's
     action; Quick Tile Left keeps its other keys (none here; the stand-in gets a second key to
     show one is kept).
  4. `make restore-keys`: the holders' keys are exactly what they were, and the file is gone.
  5. Reloaded with `warnTakenKeys=false`: no notification.
- **Watched red** (2026-10-24, in a worktree): the check reporting nothing (6 checks fail),
  `take-keys` taking nothing (3), `restore-keys` restoring nothing (2), the active filter removed
  (4: Meta+H reported, and the presses disagree).
- The rest of the suite is unchanged: the test KWin's `kglobalshortcutsrc` frees every key, so
  no other scenario sees a notification. The stock-mode sweep (`OPEN.md`) later covers the stock
  set of 21 + 2.
