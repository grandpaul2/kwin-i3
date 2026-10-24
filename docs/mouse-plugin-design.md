# Mouse chords — a small KWin plugin (design, reviewed and built 2026-10-22)

**Dropped 2026-10-24** (Paul: one chord was ever used, and KWin's own Meta+drag does it;
`docs/plan.md`, Scope). The plugin `kwini3mouse` stays for focus on the frame alone
(`plugin/framefocus.cpp`, `docs/spec-decoration.md`). What follows is the chords' design, kept as
the record; the input-filter findings in it still hold.

Paul wants window move on **Meta+Shift+left-drag** instead of KWin's Meta+left-drag, to match his
Meta+Shift keys (move left/right, move to workspace). *"Handling two keys and a mouse click is
something a WM needs to do. I will be adding features more in the future."* Built in `plugin/`,
tested by `tests/live/52-mouse.sh`; reviewed before building (findings folded in below, marked
*review*) and changed by what the headless KWin showed (*found*).

## Why a plugin

KWin's window actions (`[MouseBindings] CommandAll1..3`) take one modifier, Meta or Alt
(`options.cpp:681`), and fire only when the held modifiers equal it exactly (`input.cpp:1299`).
Probed in the headless KWin: Meta+left-drag moved a window 240,46 -> 340,106; Meta+Shift+drag and
Shift+Meta+drag left it where it was. KWin scripts get no pointer buttons. A binary KWin plugin
can: it installs an `InputEventFilter` and sees every press before KWin acts on it. KWin ships
plugins of this kind (`buttonsrebind.so`, `MouseKeysPlugin.so` in `/usr/lib64/qt6/plugins/kwin/plugins/`);
`src/plugins/buttonrebinds/` is the pattern (main.cpp factory, metadata.json, CMake).

## What it does

`plugin/` in this repo, plugin id `kwini3mouse`, ~150 lines of C++.

- *Found*: **Shift held during a KWin interactive move is KWin's "drop into a custom tile"**
  (`window.cpp:1245` shows the outline, `:1108` tiles on release): Meta+Shift+drag came back
  636x712, and Alacritty (winit 0.30.13) panicked in that sequence. So a second filter,
  `ChordMoveFilter`, sits just before KWin's `MoveResizeFilter` (weight `InteractiveMoveResize`) and,
  only during a move/resize a chord started, does what that filter does with Shift taken out of the
  modifiers. Watched red: without it the move test fails.
- An `InputEventFilter` at `InputFilterOrder::Decoration`. `installInputEventFilter` inserts with
  `lower_bound` on weight, so it runs before KWin's decoration and window-action filters and after
  lock screen, tab box, global shortcuts, effects, an interactive move/resize in progress and popups
  (`input.h:356`). A press on a frame or inside a window both reach it.
- On a button **press**: take `event->modifiersRelevantForShortcuts` (KWin's own notion, same as its
  window actions) and the button; look the chord up. No match: return false, nothing changes.
- Match, with the window under the pointer (`input()->pointer()->hover()`: *review*, on a title bar
  or border `focus()` is null; the `DecoratedWindowImpl` header isn't in kwin-devel): run the
  action, consume the press, and remember the button so its **release** is consumed too (the client
  never saw the press). Not for a move/resize that started: the move filter, before ours, takes that
  release (*review*). A remembered button no longer held at the next press is forgotten, in case an
  earlier filter ate its release (*review*). Skipped like KWin's own window actions when the pointer
  is constrained or global shortcuts are inhibited (*review*); `KeypadModifier` is masked out.
- Actions:
  - a KWin mouse command by KWin's own name, parsed with `Options::mouseCommand(name, false)`
    (`options.cpp:794`: "Move", "Resize", "Toggle raise and lower", "Close", ...) and run with
    `window->performMousePressCommand(cmd, event->position)`, exactly what KWin's window actions do;
  - `shortcut:<name>`: a global shortcut by its kglobalaccel name, e.g. `shortcut:kwin-i3 Floating
    Toggle`, invoked over D-Bus (`org.kde.kglobalaccel /component/kwin invokeShortcut`, as
    `tools/capture` does) **asynchronously** (kglobalaccel lives in KWin's process). This is how
    future mouse features get written in kwin-i3's JS: the plugin only supplies the click. The
    window under the pointer is focused first (focus-follows-mouse has normally done it already), so
    the shortcut acts on it.
- Config: `kwinrc [kwin-i3-mouse]`, one entry per chord, e.g. `Meta+Shift+Left=Move`. Chord =
  modifiers (Meta, Shift, Ctrl, Alt) + Left/Middle/Right. Read at load and on change (a
  `KConfigWatcher`, as buttonsrebind does). Empty group = the plugin does nothing.
- Paul's setup (dotfiles `setup.sh`): `[kwin-i3-mouse] Meta+Shift+Left=Move`, and
  `[MouseBindings] CommandAll1=Nothing` so plain Meta+left-drag no longer moves (Meta+click then
  reaches the app). Meta+right-drag resize stays KWin's (`CommandAll3`). A tiled window dragged out
  floats where it is dropped, as with Meta+drag today (plan, policies).

## Building, installing, upkeep

- `make plugin`: CMake against `kwin-devel` (Fedora, same version as `kwin`, not installed yet:
  `sudo dnf install kwin-devel`), out of `src/`'s build so `make test` stays as it is.
- Where KWin finds it: `KPluginMetaData::findPlugins("kwin/plugins")` searches Qt's plugin paths.
  First choice: a user directory (`~/.local/lib/qt6/plugins/kwin/plugins/`) added to
  `QT_PLUGIN_PATH` for the session (`~/.config/plasma-workspace/env/`), so nothing goes into `/usr`
  outside rpm. To verify: that KWin's systemd unit gets that environment. Fallback: install into
  `/usr/lib64/qt6/plugins/kwin/plugins/` with sudo.
- **Version guard is KWin's own**: the factory IID embeds `KWIN_PLUGIN_VERSION_STRING`
  (major.minor.patch, `config-kwin.h.cmake:4`), and `PluginManager::loadPlugin` compares it from
  the metadata before loading the library (`pluginmanager.cpp`): after a Plasma update a stale
  build is refused with "mismatching plugin version", never run. The feature is then off until
  rebuilt; `health-check.sh` says so (loaded plugins vs `rpm -q kwin`), and `make plugin` rebuilds.
- Reload without a relog: KWin's `org.kde.KWin.Plugins` at `/Plugins` has `LoadPlugin` /
  `UnloadPlugin` (`dbusinterface.cpp:468`). *Review*: `QPluginLoader` never unloads, so loading the
  same path again re-instantiates the old code, and overwriting a mapped `.so` can SIGBUS KWin. So
  each install is a new file name (`kwini3mouse-<hash>.so`, written beside and renamed in), the old
  file is removed (unlinking a mapped file is safe), the old id unloaded and the new one loaded.
  *Found*: the plugin id **is** the file name (Qt ignores an `Id` in the metadata and warns), so the
  id changes with each build; `tools/plugin-install.sh` handles that. *Checked* headless: install,
  install a faulty build (its fault showed live), install the good one again (good again), unload.
- Installed (Paul's choice, 2026-10-22): `make plugin-install` -> `~/.local/lib/kwin-i3/qt6plugins/`,
  and a drop-in `~/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf`
  (`QT_PLUGIN_PATH` for KWin's unit only). One relog for the drop-in; after that no sudo and no relog.
- *Checked*: a copy of the build with its IID patched to 6.7.4 is refused in the headless KWin
  ("kwini3mouse" has mismatching plugin version) and KWin carries on without it.

## Tests (headless, `tools/testkwin.sh` + `tools/inject.py`)

As built: `tools/testkwin.sh` takes `KI3_PLUGIN=<dir>` (the test KWin's `QT_PLUGIN_PATH`; otherwise
unset); `tests/live/run.sh` sets it to `plugin/build/bin` for a scenario with `# needs: plugin`;
`make live` builds the plugin first. `tools/testclient.py --clicks FILE` logs the presses, releases
and unpaired releases the window gets. `tests/live/52-mouse.sh` (22 checks) was watched red against
four faults: no plugin (11 FAIL), Shift not stripped (4), release not swallowed (1), `focus()` for
`hover()` (2). Its drags are slow (20 ms between events): with lib.sh's back-to-back drag, GTK never
reports the release. The list it was designed from:

1. Meta+Shift+left-drag on a floating window moves it by the drag.
2. Meta+left-drag with `CommandAll1=Nothing` does not move it.
3. Meta+right-drag still resizes (KWin's, untouched).
4. Meta+Shift+left-drag of a tiled window: it floats where dropped (kwin-i3 policy).
5. An unbound chord (Ctrl+Shift+left click) reaches the client: the client sees press and release.
6. `shortcut:` action: Meta+Shift+middle bound to `shortcut:kwin-i3 Floating Toggle` toggles the
   window under the pointer; the client sees neither press nor release.
7. Config change at runtime (kwriteconfig6 + the watcher) takes effect without reloading.
8. Load guard: the plugin's IID with a wrong version is refused and KWin keeps running (by building
   once with a patched IID string in a worktree).

Test client: `tools/testclient.py` — to check (5) and (6) it needs to log the button events it
receives; to be added if it doesn't.

## Open questions (answered by the review)

- Is `InputFilterOrder::Decoration` the right slot, or should it be before `GlobalShortcut`
  (kglobalaccel also has pointer shortcuts) or after `Popup`?
- Consuming the press of a `shortcut:` chord: does focus change happen anyway (KWin activates on
  click in `WindowAction`/`Forward`), and does it matter?
- Pointer constraints (games, `isConstrained()`): KWin skips global window actions while the pointer
  is constrained; the plugin should too.
- Touch and tablet: out of scope (pointer only).
