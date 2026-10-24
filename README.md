# kwin-i3

i3's window management as one KWin script, for Plasma 6.7+ on Wayland: i3's window tree,
workspaces that live on a monitor, i3's keys, and the 1 px frame, inside an ordinary Plasma
session. The script is the whole window manager; three small KWin plugins, optional, finish the
i3 feel where a script cannot: the 1 px frame, focus on that frame, and atomic layout changes.

**Status: feature complete (v1.0.0, 2026-10-23), the author's window manager since 2026-10-22.**
Everything of i3 the author used is here; what is left out is deliberate (tabbed and stacked
layouts, `focus parent`, urgency, marks, the scratchpad). The goal is i3's feel inside Plasma,
not all of i3: from here the work is making it configurable and reliable, not adding more of i3
(the scope and its reasons are in `docs/plan.md`, "Scope"). `CHANGELOG.md` says what changed,
`OPEN.md` what is open.

Why one script rather than a tiling script plus a workspace script: i3's tree has to be the single
truth, so that windows move *among each other* instead of being contents of fixed divisions.
`docs/plan.md` has the decisions and the behaviour table; `docs/spike-kwin-tiles.md` is why it
builds on KWin's own tile tree.

## Keys

The defaults are i3's with `$mod` = Meta, registered as KWin global shortcuts named
`kwin-i3 <verb>`, so System Settings > Shortcuts can rebind any of them.

| keys | does |
|---|---|
| Meta+1 … Meta+0 | show workspace N (on the monitor it lives on) |
| Meta+Shift+1 … 0, and the shifted symbols | move the window to workspace N |
| Meta+arrows, Meta+J/K/L/; | focus left/down/up/right, i3's tree-based focus, across monitors at the edge |
| Meta+Shift+arrows, Meta+Shift+J/K/L/; (or Meta+:) | move the window left/down/up/right, i3's `tree_move`, to the next monitor at the edge |
| Meta+H / Meta+V | split horizontal / vertical |
| Meta+E | toggle the split's orientation |
| Meta+Shift+Space | floating toggle |
| Meta+Space | focus mode toggle (tiled / floating) |
| Meta+Ctrl+arrows, Meta+Ctrl+J/K/L/; | resize by 10 % (i3's resize mode, without the mode: a script can't have mode-only keys) |
| Meta+F | fullscreen (KWin's own; per output, as i3) |
| Meta+Shift+Q | close (KWin's own) |
| Meta+Shift+C | **reload settings** (i3's reload): KWin reconfigures and kwin-i3 takes the new values, re-tiling nothing that didn't change |
| Meta+Ctrl+Shift+Q | **release**: hand every window back to KWin and stop, the safety valve |

Mouse, KWin's own: **Meta+left-drag** moves a window (a tiled one floats where it is dropped),
**Meta+right-drag** resizes (the new size is kept in the tree). With the plugins, the 1 px frame
starts nothing from the pointer (no resize cursor, no edge drag, no title-bar move), and hover
and a click on it focus the window, as i3's border does.

## Requirements

- Plasma 6.7 or later, Wayland. Tested on Fedora 44 / Plasma 6.7.5, one activity, two monitors.
- For the plugins (optional, below): `cmake`, `extra-cmake-modules`, `kwin-devel`,
  `kdecoration-devel`, a C++23 compiler.
- For the tests: `libei-devel` (real input), `python3-gobject` + `gtk4` (the test client),
  `python3-dbus`, `python3-pillow` (screenshots), `node` (unit tests).

## Install

1. Link the script and enable it: `ln -s ~/kwin-i3/package ~/.local/share/kwin/scripts/kwin-i3`,
   then `kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled true` and a logout, or
   `busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure`.
   **Never alongside another tiling script** (Krohnkite, i3ws, …): two scripts would place the
   same windows.
2. Plasma's own keys that collide with i3's: unbind Meta+arrows (quick tiling), Meta+Ctrl+arrows
   (desktop switching), Meta+Shift+Left/Right (window to previous/next screen), Meta+E (Dolphin),
   Meta+L (lock), Meta+0 and Meta+plus/minus (zoom), Meta+1..9 if the task manager uses them. KWin
   loses a shortcut conflict silently. The author's dotfiles `setup.sh` does this and the rest
   (focus follows mouse with no delay, per-output virtual desktops, border size Tiny).
3. The author's launcher for bug captures, Meta+Shift+B running `tools/capture`, lives in the
   dotfiles too (a `.desktop` file with a `_launch` shortcut).

That is all kwin-i3 needs. Windows keep Plasma's decoration (Breeze, title bars and all), and
everything above works.

### Optional: the plugins

They are for locking in the i3 feel completely; kwin-i3 works fine without them.

| plugin | adds | without it |
|---|---|---|
| `kwini3frame` (a decoration) | i3's 1 px frame, blue on the active window, green on the active floating one, and nothing from the pointer on it | Breeze (or any decoration), with title bars |
| `kwini3mouse` (a KWin plugin) | focus on the frame: hover on the line focuses its window, a click on it activates and raises, as on i3's border | focus changes 1 px later, inside the window; a click on the line does nothing |
| `kwini3hold` (an effect) | atomic layout changes: windows that move together land in the same frame | on a fast monitor, a frame or two of wallpaper where a window is about to land |

`make plugin-install` builds all three, puts them under `~/.local/lib/kwin-i3/qt6plugins` (a hash
in each file name: KWin never unloads a library), loads them into the running KWin, selects the
frame (`kwinrc [org.kde.kdecoration2] library=`), and writes a systemd drop-in for KWin's unit
(`QT_PLUGIN_PATH`, and `ExecStartPre=tools/frame-guard.sh`). The drop-in takes effect at the next
login, once. **Selecting the frame re-decorates every window at once.**

**The upkeep**: the two KWin plugins are refused by any KWin version other than the one they were
built against, so after every Plasma update they are off until `make plugin-install` runs again.
The decoration is not refused, and would load into a KWin it no longer matches, so
`tools/frame-guard.sh` checks it before every KWin start and falls back to Breeze.

To reload the script after a change: `busctl --user call org.kde.KWin /Scripting
org.kde.kwin.Scripting unloadScript s kwin-i3`, then the `reconfigure` above. It re-tiles every
window once.

## Configuration

System Settings > Window Management > KWin Scripts > kwin-i3 > Configure, or by hand in
`~/.config/kwinrc`. The script's keys (`[Script-kwin-i3]`) apply at **Meta+Shift+C** or the next
login: the Configure dialog saves without telling KWin (KWin 6.7.5's generic script config does
nothing after a save), so the reload key asks KWin to reparse, as i3's reload does. The
plugins' keys are watched: **change them with `kwriteconfig6 --notify`, and nothing else** (a
plain write followed by KWin's `reconfigure` leaves the plugin on the old value and the watcher
then ignores a later notification of the same value, seen 2026-10-23). Under heavy load
`kwriteconfig6` can exit before its notification is out (1 in 100 measured, 2026-10-24): if a
change did not take, write it again.

| group and key | default | meaning |
|---|---|---|
| `[Script-kwin-i3] ignoreClass` | krunner, yakuake, spectacle, plasmashell, polkit agent, kruler, … (Krohnkite's list) | window classes kwin-i3 never manages |
| `[Script-kwin-i3] ignoreRole` | `quake` | window roles never managed |
| `[Script-kwin-i3] floatingClass` | empty | classes that float instead of tiling |
| `[Script-kwin-i3] floatingTitle` | empty | words; a window whose caption contains one floats |
| `[Script-kwin-i3] debugLog` | `false` | log every action and tree over D-Bus to `tools/logsink.py` (the tests' log); off, an in-memory log feeds `Dump State` |
| `[kwin-i3-hold] Enabled` | `true` | the atomic-layout effect's kill switch |
| `[kwin-i3-hold] TimeoutMs` | `100` | how long the old layout may be held for a slow window (Sway: 200) |
| `[kwin-i3-frame] Active` | `#4c7899` | the frame's colour on the active tiled window |
| `[kwin-i3-frame] Inactive` | `#333333` | on an inactive tiled window |
| `[kwin-i3-frame] FloatingActive` | `#4c995a` | on the active floating window (green, to tell it apart; i3 has no such colour) |
| `[kwin-i3-frame] FloatingInactive` | `#333333` | on an inactive floating window (i3's grey by default). "Floating" is KWin's keep-above flag, which kwin-i3 sets on every floating window and treats as its own: a window you keep above yourself paints the same and, if it is in no tile when kwin-i3 loads, is adopted as floating; a floating window whose keep-above you clear paints as tiled. A window KWin's session restore brings back kept above after kwin-i3 loaded is tiled with the flag on (no app here does that) |
| `[org.kde.kdecoration2] library` | written by `make plugin-install` | the frame: `kwini3frame-<hash>`; `org.kde.breeze` to go back to Breeze |
| `[org.kde.kdecoration2] BorderSize` | `Tiny` | ignored by the frame (always 1 px); keeps Breeze tolerable as the fallback |

Transients and modals, non-resizable windows and `skipPager` windows float; `onAllDesktops`,
`skipTaskbar` and other activities' windows are never managed (`docs/plan.md`, policies).

## Working on it

```
make test        # unit tests (node) + live tests (each in its own headless KWin)
make build       # src/ -> package/contents/code/main.js (edit src/, never the built file)
make plugin      # the three plugins, into plugin/build
make fuzz        # 20 min of random actions with pixel invariants (docs/fuzz-design.md)
make mutate      # the unit tests against deliberate faults; mutate-live from a worktree
```

The live tests never touch the running desktop: `tools/testkwin.sh` starts a private KWin with two
virtual 1280x720 monitors, its own D-Bus session and its own config. `tools/testclient.py` opens the
awkward windows (fixed size, large minimum, dialog, slow to appear, retitled); `tools/inject.py`
sends real input through libei; `tools/shot.py` reads pixels. A bug seen on the desktop becomes a
file with `tools/capture` (state, journal, screenshot), then a live test, watched red, then a fix.
`CLAUDE.md` has the working rules.

Docs: `docs/plan.md` (decisions, behaviour, policies), the specs (`docs/spec-*.md`), the designs
(`docs/fuzz-design.md`, `docs/mouse-plugin-design.md`, `docs/input-tests-design.md`) and the
reviews they went through.

## License

GPL-2.0-or-later (`LICENSE`). `src/tree.js` ports i3's tree code, which is BSD-licensed; `NOTICE`
carries its notice and the other credits.
