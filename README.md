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
| Meta+R, then J/K/L/; or the arrows | i3's **resize mode** (plugins): Meta+R enters, a banner on the focused window says so; J/Left shrink the width, ;/Right grow it, L/Up shrink the height, K/Down grow it, by 10 % (holding a key repeats); every other key goes to the window; Return, Escape or Meta+R leave. The four resize actions have no flat key; bind one on the Keys page if you want |
| Meta+Return, Meta+D | the default terminal (System Settings ▸ Default Applications; plugins), KRunner |
| Meta+Shift+E | exit: Plasma's logout prompt |
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
`workspace_auto_back_and_forth`. And **move to workspace next / prev** (and on output): the
focused window to that workspace; the focus stays.

A new window opens on the workspace you are on when it appears. i3 sends a program it started
itself back to the workspace it was launched from; kwin-i3 doesn't (a window another program
starts, such as a game from its launcher, opened where you were in i3 too).

Mouse:
- **Meta+left-drag on a tiled window** is i3's tiling drag (needs the helper plugin): the window
  stays put while a highlight shows where it would land, under a move cursor. Near another
  window's edge it goes beside that window; in the thin strip at an edge it goes beside the whole
  row or column that shares that edge; in the middle **the two swap**, unlike i3, which moves it after the target.
  Escape or another button cancels. With tiled windows showing their own title bars (`tiledLook`), dragging a tiled window's title
  bar does the same.
- **Meta+Shift+left-drag on a tiled window** pulls it out at its floating size and floats it where
  it is dropped, the mouse twin of Meta+Shift+Space (also beyond i3, which has no mouse way to
  float). Without the helper plugin, Meta+left-drag does this.
- **Meta+right-drag on a tiled window**, or in the gap beside one, is i3's tiling resize (helper
  plugin): the pointer jumps onto the nearest edge that has a neighbour, a bar follows it, and the
  two sizes change on release. Without the helper it is KWin's own resize, kept in the tree.
- **Meta+left-drag and Meta+right-drag on a floating window** move and resize it: KWin's own.

With the plugins, the 1 px frame starts nothing from the pointer (no resize cursor, no edge drag,
no title-bar move), and hover and a click on it focus the window, as i3's border does.

## Requirements

- Plasma 6.7 or later, Wayland. Tested on Fedora 44 / Plasma 6.7.5, one activity, two monitors.
- For the plugins (optional, below): `cmake`, `extra-cmake-modules`, `kwin-devel`, a C++23
  compiler.
- For the tests: `libei-devel` (real input), `python3-gobject` + `gtk4` (the test client),
  `python3-dbus`, `python3-pillow` (screenshots), `node` (unit tests).

## Install

1. Link the script and enable it: `ln -s ~/kwin-i3/package ~/.local/share/kwin/scripts/kwin-i3`,
   then `kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled true`, then log out and
   in (KWin reads the scripts' packages at login: one linked while it runs can't be turned on
   before that).
   **Never alongside another tiling script** (Krohnkite, i3ws, …): two scripts would place the
   same windows.
2. Plasma's own keys that collide with i3's: Meta+arrows (quick tiling), Meta+D (Peek at
   Desktop), Meta+R (Spectacle's region recording), Meta+Shift+Left/Right (window to previous/next screen), Meta+E (Dolphin),
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
4. Bug captures: bind a key to `tools/capture` (System Settings > Shortcuts, a command); it saves
   what kwin-i3 saw just before (`docs/debugging.md`). The author's is Meta+Shift+B, from his
   dotfiles.

**To stop it**: Meta+Ctrl+Shift+Q releases every window until kwin-i3 is loaded again; to remove
it, `kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled false`, log out, and delete
the link. The optional pieces below leave `~/.local/lib/kwin-i3/`, the drop-in
`~/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf` and
`~/.config/environment.d/kwin-i3.conf`; `make restore-keys` gives back keys `make take-keys` took.

That is all kwin-i3 needs. Windows keep Plasma's decoration (Breeze, title bars and all), and
everything above works.

### Optional: the plugins

They are for locking in the i3 feel completely; kwin-i3 works fine without them.

| plugin | adds | without it |
|---|---|---|
| `kwini3hold` (an effect) | the tiling drag's highlight and move cursor; i3's 1 px frame around tiled windows (width and colours in the settings), blue on the active one: tiled windows lose their title bars and the frame is drawn in the room the tiles leave, outside the window, so none of the app is covered. Floating windows keep your decoration (Breeze or any theme). And atomic layout changes: windows that move together land in the same frame | tiled windows keep their title bars; on a fast monitor, a frame or two of wallpaper where a window is about to land |
| `kwini3helper` (a KWin plugin) | **the tiling drag and resize** (Meta+drag, a title-bar drag, Meta+right-drag; see "Mouse" above); focus on the frame: hover on it focuses its window, a click on it activates and raises, as on i3's border (and nothing reaches the desktop beneath); **Apply applies**: a save in the Configure form takes effect at once; **panel popups forgive a stray pointer**: while one has the focus, focus follows mouse waits 1.5 s, so crossing the gap of a floating panel doesn't close it (every other focus change stays as you set it); and **keys for your keyboard layout**: Meta+1 … 0, Meta+Shift+1 … 0 and the `;` keys follow the key position on any layout (KWin matches the symbol a key types, so on German Meta+Shift+2 is Meta+"), refitted when you switch layouts; keys you set yourself are left alone | after Apply, press Meta+Shift+C; with focus follows mouse and no delay, a floating panel's popups close when the pointer crosses the gap (turn off the panel's floating); on a layout that isn't US, set those keys on the settings page (the load notification says so) |

`make plugin-install` builds both, puts them under `~/.local/lib/kwin-i3/qt6plugins` (a hash in
each file name: KWin never unloads a library), loads them into the running KWin, and writes a
systemd drop-in for KWin's unit (`QT_PLUGIN_PATH`). The drop-in takes effect at the next login,
once. Loading the effect re-tiles every window once (the frame's room).

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
"2 mail" (kwin-i3 never renames a desktop). The widget is kwin-i3's: without kwin-i3 running, a
click does nothing (use Plasma's pager there).

## Configuration

kwin-i3 is the window manager: its workspaces, monitors and keyboard focus apply to every window.
Each window has one arranger. **Tiled**: the tree places it. **Floating**: you place it, with its
own title bar, as a Plasma window; kwin-i3 keeps it on its workspace and above the tiled windows,
and moves it by key. **Places itself**: the app or Plasma places it (KRunner, panel popups,
Yakuake); kwin-i3 never tiles, floats, moves or resizes it. i3 has no third kind (it manages every
window but docks and popups); it exists here because KWin is the layer underneath, and some of
Plasma's windows must place themselves.

kwin-i3's page in System Settings > Window Management (above), or System Settings > Window
Management > KWin Scripts > kwin-i3 > Configure, or by hand in
`~/.config/kwinrc`, all in `[Script-kwin-i3]`. On the page, Apply applies at once. In the
Configure form, with the plugins, a save applies at once
(`kwini3helper` watches the file and has KWin reconfigure). Without them, press **Meta+Shift+C**
after a save, or log in again: KWin 6.7.5's generic script form saves without telling KWin, and
the reload key asks KWin to reconfigure, as i3's reload does. Everything, the script and the
two plugins, takes its new values on that reconfigure; a `kwriteconfig6 --notify` write still
reaches the plugins directly. The effect's old group (`[kwin-i3-hold]` `Enabled` and `TimeoutMs`, before
2026-10-24) is still read where `holdEnabled` or `holdTimeoutMs` is missing.

| group and key | default | meaning |
|---|---|---|
| `[Script-kwin-i3] forWindow` | Spectacle, the password prompt, KRuler and plasmashell's ordinary windows float | i3's `for_window` rules, one per line (or `;`-separated): `[criteria] floating enable` or `floating disable`. Criteria: `class`, `instance`, `title`, `window_role`, `window_type` (`normal`, `dialog`, `utility`, `toolbar`, `splash`, `notification`), `workspace` (its number), `floating`, `tiling`, `all`; each a regular expression in quotes, all in one rule must match. A rule runs at most once per window, when it opens or changes title or class (`docs/behaviour.md` §3) |
| `[Script-kwin-i3] assign` | empty | i3's `assign` rules: `[criteria] → 5` opens matching windows on workspace 5 (shown or not, without switching a monitor); `[criteria] output DP-6` on that monitor's visible workspace |
| `[Script-kwin-i3] floatingMinimumSize`, `floatingMaximumSize` | `75x50`, `0x0` | i3's `floating_minimum_size`/`floating_maximum_size`: a window becoming floating is sized within them; `0x0` means i3's default (75x50; all monitors together), `-1x-1` no limit |
| `[Script-kwin-i3] floatingClass`, `floatingTitle`, `ignoreClass`, `ignoreRole` | empty | the old lists, still read as rules (a class or title entry floats those windows; the ignore lists no longer keep windows out: Plasma's system windows are built in, and a user's own entries float). The settings page writes rules |
| `[Script-kwin-i3] gapsInner` | `4` | px between two tiled windows (i3's `gaps inner`; i3's default is 0), 0-100, even: the pickers step by 2 and an odd value counts as the even one below (half a gap on each window would put windows on half pixels) |
| `[Script-kwin-i3] gapsOuter` | `2` | px added at the screen's edge (i3's `gaps outer`: the edge gap is inner + outer), 0-200 |
| `[Script-kwin-i3] gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` | `-1` | that edge's outer gap instead of `gapsOuter` (i3's `gaps top` …), 0-200; -1 means `gapsOuter` |
| `[Script-kwin-i3] workspaceGaps` | empty | i3's `workspace N gaps …` lines, added to the gaps above on that workspace: `3 gaps inner 10, 5 gaps outer 0` (one per line, or `;`- or `,`-separated; `inner`, `outer`, `horizontal`, `vertical`, `top`, `right`, `bottom`, `left`; a negative number takes from the global gap, down to 0) |
| `[Script-kwin-i3] smartGaps` | `off` | i3's `smart_gaps`: `on` (no gaps on a workspace with one tiled window), `inverse_outer` (the edge gaps only on such a workspace), `off` |
| `[Script-kwin-i3] hideEdgeBorders` | `none` | i3's `hide_edge_borders`: `smart` (no frame on a window alone on its workspace), `smart_no_gaps` (the same, only with no edge gap there), `vertical`, `horizontal`, `both` (no frame on those sides of a window at the screen's edge, with no gap between windows; the frame's width stays empty there), `none` |
| `[Script-kwin-i3] resizeStep` | `10` | % per resize key in the mode, 1-50 (i3's `resize ... 10 ppt`) |
| `[Script-kwin-i3] floatingStep` | `10` | px a floating window moves (Meta+Shift+arrow) or resizes (the mode's keys), 1-200 (i3's `move left 10 px`) |
| `[Script-kwin-i3] defaultOrientation` | `auto` | how a new workspace splits: `auto` (side by side unless the monitor is taller than wide), `horizontal`, `vertical` (i3's `default_orientation`; workspaces that exist keep theirs) |
| `[Script-kwin-i3] focusWrapping` | `yes` | i3's `focus_wrapping`: `yes` (at the edge, to the next monitor, else wrap), `no` (never wrap, still cross monitors), `force` (always wrap inside the container), `workspace` (wrap, never leave the workspace) |
| `[Script-kwin-i3] tilingDrag` | `modifier titlebar` | i3's `tiling_drag`: which presses drag a tiled window to a new place in the layout (plugins): `modifier` (Meta+left anywhere in it), `titlebar` (a left press on its title bar), both, or `off` (a tiled window stays put) |
| `[Script-kwin-i3] mouseWarping` | `output` | i3's `mouse_warping`: `output` (when the focus moves to another monitor by a key, a workspace switch or an activation, the pointer goes to the focused window's centre, unless it is on that monitor already), `none` (the pointer never moves by itself) |
| `[Script-kwin-i3] workspaceOutputs` | empty | i3's `workspace N output A B …`: `1=DP-4 HDMI-A-1, 2=DP-6` (connector names, `kscreen-doctor -o`; a list per workspace, the first connected monitor wins). At login each monitor shows the lowest workspace free and not assigned elsewhere; an empty assigned workspace opens on its monitor; a monitor that appears takes its assigned workspaces and shows its lowest, else a free one. A monitor that goes away leaves its workspaces on the first monitor for good: only an assignment brings one back, as in i3. A reload moves no workspace that exists |
| `[Script-kwin-i3] workspaceAutoBackAndForth` | false | i3's `workspace_auto_back_and_forth`: Meta+N for the focused workspace shows the one focused before; Meta+Shift+N for it sends the window there |
| `[Script-kwin-i3] warnTakenKeys` | `true` | at load, one notification naming each of kwin-i3's keys another shortcut holds (that one fires, kwin-i3's doesn't); `make take-keys` frees them |
| `[Script-kwin-i3] debugLog` | `false` | also send every log line over D-Bus to `tools/logsink.py` as it happens (the test KWin's log; nothing listens on a desktop). Either way the last 2000 lines are kept in memory for `Dump State` and `tools/capture` (`docs/debugging.md`) |
| `[Script-kwin-i3] holdEnabled` | `true` | the atomic-layout effect's kill switch (plugins) |
| `[Script-kwin-i3] holdTimeoutMs` | `100` | how long the old layout may be held for a slow window, 10-2000 ms (Sway: 200) |
| `[Script-kwin-i3] frameWidth` | `1` | the frame's width, 1-10 px (i3's `default_border pixel N`; plugins): the tiles leave that much room on each side of a window |
| `[Script-kwin-i3] frameActive` | `#4c7899` | the frame's colour on the focused window (i3's `client.focused`) |
| `[Script-kwin-i3] frameFocusedInactive` | `#5f6b78` | on the window that has the focus on another monitor, or had it last in a split the focus has left, and on floating windows that aren't focused (i3's `client.focused_inactive`) |
| `[Script-kwin-i3] frameInactive` | `#333333` | on every other window (i3's `client.unfocused`) |
| `[Script-kwin-i3] frameIndicatorActive`, `frameIndicatorFocusedInactive`, `frameIndicatorInactive` | `#3daee9`, empty, empty | on a window alone in its split (or on its workspace), the side where the next window opens, right or bottom, in this colour per class (i3's `indicator`); empty: the class's frame colour |
| `[Script-kwin-i3] tiledLook` | `frame` | how tiled windows look: `frame` (i3's frame, no title bar), `titlebars` (each keeps its own title bar, as a Plasma window; the maximize button does nothing, as in sway), `bare` (neither; nothing marks the focused window, KWin's Dim Inactive effect can). Plugins: without them, `titlebars` whatever this says (`docs/spec-tiled-look.md`) |
| `[Script-kwin-i3] roundedCorners` | `true` | tiled windows' corners rounded 5 px, as Breeze's, the frame following them, in `frame` and `bare` (plugins: without them tiled windows keep their title bars, and with them their theme's corners). Floating windows keep their theme's corners either way |
| `[Script-kwin-i3] floatingWorkspaces` | empty | workspaces where new windows float: `3, 7`. A window that opens there floats, with its own title bar, as a Plasma window (Meta+Shift+Space tiles it); it keeps its mode when moved. With the plugins, floating windows there aren't kept above the tiled ones; elsewhere they are, as in i3 (`docs/spec-window-modes.md`) |
| `[Script-kwin-i3] frameOnFloating` | `false` | floating windows lose their title bar too and get the frame in the same colours (plugins; not a window that draws its own title bar). How kwin-i3 remembers a floating window across a reload: with the plugins, the effect keeps the set; without them, KWin's keep-above flag, which kwin-i3 sets on every floating window and treats as its own (a window you keep above yourself, in no tile when kwin-i3 loads, is adopted as floating) |

Dialogs, transients, modals, splash and utility windows and non-resizable windows float; a
window on all desktops is kept out of the tree for now (sticky, `docs/behaviour.md` §3); panels, the desktop,
popups and Plasma's system windows are never in it (i3's dock, root and override-redirect kinds). kwin-i3 assumes one activity: windows on other activities aren't
handled yet (`LATER.md` item 5).

## Working on it

```
make test        # unit tests (node) + live tests (each in its own headless KWin)
make build       # src/ -> package/contents/code/main.js (edit src/, never the built file)
make plugin      # the two plugins, into plugin/build
make fuzz        # 5 min of random actions with pixel invariants (docs/fuzz-design.md; held during the Stage)
make mutate      # the unit tests against deliberate faults; mutate-live from a worktree
```

The live tests never touch the running desktop: `tools/testkwin.sh` starts a private KWin with two
virtual 1280x720 monitors, its own D-Bus session and its own config. `tools/testclient.py` opens the
awkward windows (fixed size, large minimum, dialog, slow to appear, retitled); `tools/inject.py`
sends real input through libei; `tools/shot.py` reads pixels. A bug seen on the desktop becomes a
file with `tools/capture` (the recent log and kwini3hold's events, the state, a screenshot, a
note; read with `tools/capture-read`, `docs/debugging.md`), then a live test, watched red, then a fix.
`CLAUDE.md` has the working rules.

Docs: `docs/README.md` is the map. `docs/philosophy.md` (what it is for), `docs/plan.md` (scope
and decisions), `docs/behaviour.md` (what it does, exactly), the specs (`docs/spec-*.md`, one
decision each) and the test tools' designs (`docs/fuzz-design.md`, `docs/input-tests-design.md`).

## License

GPL-2.0-or-later (`LICENSE`). `src/tree.js` ports i3's tree code, which is BSD-licensed; `NOTICE`
carries its notice and the other credits.
