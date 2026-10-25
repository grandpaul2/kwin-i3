# kwin-i3

i3's window management as one KWin script, for Plasma 6.7+ on Wayland: i3's window tree,
workspaces that live on a monitor, i3's keys, and the 1 px frame, inside an ordinary Plasma
session. The script is the whole window manager; two small KWin plugins, optional, finish the
i3 feel where a script cannot: the 1 px frame around tiled windows (drawn outside them, with
floating windows keeping your own decoration), focus on that frame, and atomic layout changes.

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
| Meta+1 … Meta+0 | show workspace N (on the monitor it lives on). Workspace N is virtual desktop N; one that doesn't exist yet is created, as i3 creates workspaces, and kept (KWin saves the count) |
| Meta+Shift+1 … 0, and the shifted symbols | move the window to workspace N |
| Meta+arrows, Meta+J/K/L/; | focus left/down/up/right, i3's tree-based focus, across monitors at the edge (the pointer follows to the other monitor, as i3's `mouse_warping output`; only a key moves it, never a window closing) |
| Meta+Shift+arrows, Meta+Shift+J/K/L/; (or Meta+:) | move the window left/down/up/right, i3's `tree_move`, to the next monitor at the edge |
| Meta+H / Meta+V | split horizontal / vertical |
| Meta+E | toggle the split's orientation |
| Meta+Shift+Space | floating toggle |
| Meta+Space | focus mode toggle (tiled / floating) |
| Meta+Ctrl+arrows, Meta+Ctrl+J/K/L/; | resize by 10 % (i3's resize mode, without the mode: a script can't have mode-only keys) |
| Meta+F | fullscreen (per output, as i3; runs KWin's own action, on any window) |
| Meta+Shift+Q | close (KWin's own action, on any window; Alt+F4 still works) |
| Meta+Shift+C | **reload settings** (i3's reload): KWin reconfigures and kwin-i3 takes the new values, re-tiling nothing that didn't change |
| Meta+Ctrl+Shift+Q | **release**: hand every window back to KWin and stop, the safety valve |

The digit row and the `;` key mean a key position, as i3's default config does: on a layout that
isn't US they need the helper plugin (below), or setting by hand.

With no key, as in i3 (bind them in System Settings > Shortcuts > KWin, "kwin-i3: …", or on the
settings page): **workspace back and forth** (the workspace focused before) and **move to
workspace back and forth**; **workspace next / prev** (among those in use, wrapping) and their
**on output** forms; and for each direction, **focus output**, **move to output** (the window to
that monitor's visible workspace; the focus stays) and **move workspace to output** (the whole
workspace; the monitor it leaves shows the one it showed before). The setting
`workspaceAutoBackAndForth` makes Meta+N for the workspace you are on go back, as i3's
`workspace_auto_back_and_forth`.

Mouse, KWin's own: **Meta+left-drag** moves a window (a tiled one floats where it is dropped),
**Meta+right-drag** resizes (the new size is kept in the tree). With the plugins, the 1 px frame
starts nothing from the pointer (no resize cursor, no edge drag, no title-bar move), and hover
and a click on it focus the window, as i3's border does.

## Requirements

- Plasma 6.7 or later, Wayland. Tested on Fedora 44 / Plasma 6.7.5, one activity, two monitors.
- For the plugins (optional, below): `cmake`, `extra-cmake-modules`, `kwin-devel`, a C++23
  compiler.
- For the tests: `libei-devel` (real input), `python3-gobject` + `gtk4` (the test client),
  `python3-dbus`, `python3-pillow` (screenshots), `node` (unit tests).

## Install

1. Link the script and enable it: `ln -s ~/kwin-i3/package ~/.local/share/kwin/scripts/kwin-i3`,
   then `kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled true` and a logout, or
   `busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure`.
   **Never alongside another tiling script** (Krohnkite, i3ws, …): two scripts would place the
   same windows.
2. Plasma's own keys that collide with i3's: Meta+arrows (quick tiling), Meta+Ctrl+arrows
   (desktop switching), Meta+Shift+Left/Right (window to previous/next screen), Meta+E (Dolphin),
   Meta+L (lock), Meta+0 and Meta+plus/minus (zoom), Meta+1..9 if the task manager uses them. A
   key another shortcut holds fires that one, not kwin-i3's, so at load kwin-i3 names every such
   key in one notification (`warnTakenKeys` turns it off). **`make take-keys`** frees them: it
   removes just that key from each holder and saves what it removed;
   **`make restore-keys`** puts them back. Free them by hand in System Settings > Shortcuts if
   you'd rather. The check runs at load: an app that registers a clashing key later is seen at
   the next login.
3. **With more than one monitor**: System Settings > Virtual Desktops > "Switch desktops
   independently for each screen" on (off by default). With it off, a desktop switch changes every
   monitor and windows tile on the wrong one; kwin-i3 says so in a notification at load, or when
   a second monitor arrives. Turned on, it takes effect at once: each monitor shows its own
   workspace again.
4. The author's launcher for bug captures, Meta+Shift+B running `tools/capture`, lives in the
   dotfiles too (a `.desktop` file with a `_launch` shortcut).

That is all kwin-i3 needs. Windows keep Plasma's decoration (Breeze, title bars and all), and
everything above works.

### Optional: the plugins

They are for locking in the i3 feel completely; kwin-i3 works fine without them.

| plugin | adds | without it |
|---|---|---|
| `kwini3hold` (an effect) | i3's 1 px frame around tiled windows (width and colours in the settings), blue on the active one: tiled windows lose their title bars and the frame is drawn in the room the tiles leave, outside the window, so none of the app is covered. Floating windows keep your decoration (Breeze or any theme). And atomic layout changes: windows that move together land in the same frame | tiled windows keep their title bars; on a fast monitor, a frame or two of wallpaper where a window is about to land |
| `kwini3helper` (a KWin plugin) | focus on the frame: hover on it focuses its window, a click on it activates and raises, as on i3's border (and nothing reaches the desktop beneath); **Apply applies**: a save in the Configure form takes effect at once; **panel popups forgive a stray pointer**: while one has the focus, focus follows mouse waits 1.5 s, so crossing the gap of a floating panel doesn't close it (every other focus change stays as you set it); and **keys for your keyboard layout**: Meta+1 … 0, Meta+Shift+1 … 0 and the `;` keys follow the key position on any layout (KWin matches the symbol a key types, so on German Meta+Shift+2 is Meta+"), refitted when you switch layouts; keys you set yourself are left alone | after Apply, press Meta+Shift+C; with focus follows mouse and no delay, a floating panel's popups close when the pointer crosses the gap (turn off the panel's floating); on a layout that isn't US, set those keys on the settings page (the load notification says so) |

`make plugin-install` builds both, puts them under `~/.local/lib/kwin-i3/qt6plugins` (a hash in
each file name: KWin never unloads a library), loads them into the running KWin, and writes a
systemd drop-in for KWin's unit (`QT_PLUGIN_PATH`). The drop-in takes effect at the next login,
once. Loading the effect re-tiles every window once (the frame's room). An install from before
2026-10-24 had a third plugin, the `kwini3frame` decoration: `make plugin-install` removes it and
selects Plasma's default decoration again (every window is re-decorated once).

**The upkeep**: both plugins are refused by any KWin version other than the one they were built
against, so after every Plasma update they are off until `make plugin-install` runs again; until
then tiled windows have their title bars.

**Plain GTK 4 apps** (GTK 4 without libadwaita, with Plasma's title bar) learn their largest size
from KWin only when they first appear, with the title bar counted; kwin-i3 asks KWin to tell them
again once the title bar is gone, so they fill their tile.

To reload the script after a change: `busctl --user call org.kde.KWin /Scripting
org.kde.kwin.Scripting unloadScript s kwin-i3`, then the `reconfigure` above. It re-tiles every
window once.

### Optional: the settings page

kwin-i3's own page in System Settings > Window Management: every setting, laid out as Plasma's
pages are, and **Keys…**, where kwin-i3's keys are rebound in one list instead of KWin's. A key
another shortcut holds is named in its row and taken from it on Apply (`make restore-keys` gives
it back). Apply takes effect at once, with or without the plugins.

`make kcm-install` builds it (needs `kf6-kcmutils-devel` and `kf6-ki18n-devel`) and puts it in
`~/.local/lib/kwin-i3/kcm-plugins`, with `~/.config/environment.d/kwin-i3.conf` adding that to the
session's `QT_PLUGIN_PATH`: it shows in System Settings after the next login, once. It links no
KWin library, so a Plasma update doesn't turn it off.

### Optional: the workspace widget

Plasma's pager draws every desktop as all your monitors side by side, and every desktop, used or
not; with per-monitor desktops a workspace lives on one monitor, so half of each thumbnail is
empty. kwin-i3's widget, **kwin-i3 Workspaces**, shows every workspace in use (windows on it, or a
monitor showing it, as i3bar does), each at its own monitor's shape with its windows, the shown
ones marked (more strongly on the monitor with focus); a click is Meta+N, a scroll goes to the
next or previous one. `make widget-install` (QML only: nothing to build, nothing to redo after a
Plasma update), then on the panel: right-click the pager, *Show Alternatives*, *kwin-i3
Workspaces* (or *Add Widgets*). Its settings: *Numbers only*, for a small panel. A workspace's
name is its desktop's, set in System Settings > Virtual Desktops: a named one is labelled
"2 mail" (kwin-i3 never renames a desktop).

## Configuration

kwin-i3's page in System Settings > Window Management (above), or System Settings > Window
Management > KWin Scripts > kwin-i3 > Configure, or by hand in
`~/.config/kwinrc`, all in `[Script-kwin-i3]`. On the page, Apply applies at once. In the
Configure form, with the plugins, a save applies at once
(`kwini3helper` watches the file and has KWin reconfigure). Without them, press **Meta+Shift+C**
after a save, or log in again: KWin 6.7.5's generic script form saves without telling KWin, and
the reload key asks KWin to reconfigure, as i3's reload does. Everything, the script and the
two plugins, takes its new values on that reconfigure; a `kwriteconfig6 --notify` write still
reaches the plugins directly. The plugins' old groups (`[kwin-i3-frame]`, `[kwin-i3-hold]`, before
2026-10-24) are still read where a key below is missing.

| group and key | default | meaning |
|---|---|---|
| `[Script-kwin-i3] ignoreClass` | krunner, yakuake, spectacle, plasmashell, polkit agent, kruler, … (Krohnkite's list) | window classes kwin-i3 never manages |
| `[Script-kwin-i3] ignoreRole` | `quake` | window roles never managed |
| `[Script-kwin-i3] floatingClass` | empty | classes that float instead of tiling |
| `[Script-kwin-i3] floatingTitle` | empty | words; a window whose caption contains one floats |
| `[Script-kwin-i3] gapsInner` | `4` | px between two tiled windows (i3's `gaps inner`; i3's default is 0), 0-100, even: the pickers step by 2 and an odd value counts as the even one below (half a gap on each window would put windows on half pixels) |
| `[Script-kwin-i3] gapsOuter` | `2` | px added at the screen's edge (i3's `gaps outer`: the edge gap is inner + outer), 0-200 |
| `[Script-kwin-i3] resizeStep` | `10` | % per Meta+Ctrl+arrow, 1-50 (i3's `resize ... 10 ppt`) |
| `[Script-kwin-i3] defaultOrientation` | `auto` | how a new workspace splits: `auto` (side by side unless the monitor is taller than wide), `horizontal`, `vertical` (i3's `default_orientation`; workspaces that exist keep theirs) |
| `[Script-kwin-i3] focusWrapping` | `yes` | i3's `focus_wrapping`: `yes` (at the edge, to the next monitor, else wrap), `no` (never wrap, still cross monitors), `force` (always wrap inside the container), `workspace` (wrap, never leave the workspace) |
| `[Script-kwin-i3] workspaceOutputs` | empty | i3's `workspace N output X`: `1=DP-4, 2=DP-6` (connector names, `kscreen-doctor -o`). At login each monitor shows the lowest workspace free and not assigned elsewhere; an empty assigned workspace opens on its monitor; a monitor that appears takes its workspaces. A reload moves no workspace that exists |
| `[Script-kwin-i3] workspaceAutoBackAndForth` | false | i3's `workspace_auto_back_and_forth`: Meta+N for the focused workspace shows the one focused before; Meta+Shift+N for it sends the window there |
| `[Script-kwin-i3] warnTakenKeys` | `true` | at load, one notification naming each of kwin-i3's keys another shortcut holds (that one fires, kwin-i3's doesn't); `make take-keys` frees them |
| `[Script-kwin-i3] debugLog` | `false` | log every action and tree over D-Bus to `tools/logsink.py` (the tests' log); off, an in-memory log feeds `Dump State` |
| `[Script-kwin-i3] holdEnabled` | `true` | the atomic-layout effect's kill switch (plugins) |
| `[Script-kwin-i3] holdTimeoutMs` | `100` | how long the old layout may be held for a slow window, 10-2000 ms (Sway: 200) |
| `[Script-kwin-i3] frameWidth` | `1` | the frame's width, 1-10 px (i3's `default_border pixel N`; plugins): the tiles leave that much room on each side of a window |
| `[Script-kwin-i3] frameActive` | `#4c7899` | the frame's colour on the active tiled window |
| `[Script-kwin-i3] frameInactive` | `#333333` | on an inactive tiled window |
| `[Script-kwin-i3] roundedCorners` | `true` | tiled windows' corners rounded 5 px, as Breeze's, the frame following them (plugins: without them tiled windows keep their title bars, and with them their theme's corners). Floating windows keep their theme's corners either way |
| `[Script-kwin-i3] floatingWorkspaces` | empty | workspaces of Plasma windows: `3, 7`. A window that opens there floats, with its own title bar, as in plain Plasma (Meta+Shift+Space tiles it); it keeps its mode when moved. With the plugins, floating windows there aren't kept above the tiled ones; elsewhere they are, as in i3 (`docs/spec-window-modes.md`) |
| `[Script-kwin-i3] frameOnFloating` | `false` | floating windows lose their title bar too and get the frame in the floating colours (plugins; not a window that draws its own title bar) |
| `[Script-kwin-i3] frameFloatingActive` | `#4d7254` | the frame on the active floating window, with `frameOnFloating` (a muted green, to tell it apart; i3 has no such colour) |
| `[Script-kwin-i3] frameFloatingInactive` | `#333333` | on an inactive floating window, likewise. How kwin-i3 remembers a floating window across a reload: with the plugins, the effect keeps the set; without them, KWin's keep-above flag, which kwin-i3 sets on every floating window and treats as its own (a window you keep above yourself, in no tile when kwin-i3 loads, is adopted as floating) |

Transients and modals, non-resizable windows and `skipPager` windows float; `onAllDesktops`,
`skipTaskbar` and other activities' windows are never managed (`docs/plan.md`, policies).

## Working on it

```
make test        # unit tests (node) + live tests (each in its own headless KWin)
make build       # src/ -> package/contents/code/main.js (edit src/, never the built file)
make plugin      # the two plugins, into plugin/build
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
