# kwin-i3

i3's window management as one KWin script and two small KWin plugins, for Plasma 6.7+ on
Wayland: i3's window tree, workspaces that live on an output, i3's keys, and the 1 px frame,
inside an ordinary Plasma session. The script runs the tree, the workspaces, the keys and
floating; the plugins do what a script cannot: the frame around tiling windows (drawn outside
them, with floating windows keeping your own decoration), the mouse (i3's tiling drag and
resize, focus on the frame), the resize mode, keys for your keyboard layout, and atomic layout
changes. The script runs without them, and the settings page says at its top when they aren't loaded.

**Status: in beta**: public but unannounced, used daily by a few people; report bugs with a
capture (Install, step 9). Feature complete (v1.0.0, 2026-10-23), in daily use since 2026-10-22.
The core of i3 is here; what is left out is deliberate (tabbed and stacked
layouts, `focus parent`, urgency, marks, the scratchpad). The goal is i3's feel inside Plasma,
not all of i3: from here the work is making it configurable and reliable, not adding more of i3
(the scope and its reasons are in `docs/plan.md`, "Scope"). `CHANGELOG.md` says what changed,
`OPEN.md` what is open.

Why one script rather than a tiling script plus a workspace script: i3's tree has to be the single
truth, so that windows move *among each other* instead of being contents of fixed divisions.
`docs/plan.md` has the scope and the decisions, `docs/behaviour.md` what it does, row by row; `docs/kwin-tiles.md` is why it
builds on KWin's own tile tree.

## Keys

The defaults are i3's with `$mod` = Meta, registered as KWin global shortcuts named
`kwin-i3 <verb>`, so System Settings > Shortcuts can rebind any of them.

| keys | does |
|---|---|
| Meta+1 … Meta+0 | show workspace N (on the output it lives on). Workspace N is virtual desktop N; one that doesn't exist yet is created, as i3 creates workspaces, and kept (KWin saves the count) |
| Meta+Shift+1 … 0, and the shifted symbols | move the window to workspace N |
| Meta+arrows, Meta+J/K/L/; | focus left/down/up/right, i3's tree-based focus, across outputs at the edge (the pointer follows to the other output, as i3's `mouse_warping output`; only a key moves it, never a window closing) |
| Meta+Shift+arrows, Meta+Shift+J/K/L/; (or Meta+:) | move the window left/down/up/right, i3's `tree_move`, to the next output at the edge |
| Meta+H / Meta+V | split horizontal / vertical |
| Meta+E | toggle the split's orientation |
| Meta+Shift+Space | floating toggle |
| Meta+Space | focus mode toggle (tiling / floating) |
| Meta+R, then J/K/L/; or the arrows | i3's **resize mode** (plugins): Meta+R enters, a banner on the focused window says so; J/Left shrink the width, ;/Right grow it, L/Up shrink the height, K/Down grow it, by 10 % (holding a key repeats); kwin-i3's other keys do nothing, Plasma's own shortcuts (volume, screenshot) still run; Return, Escape or Meta+R leave. The four resize actions have no flat key; bind one on the Keys page if you want |
| Meta+Return, Meta+D | the default terminal (System Settings ▸ Default Applications; plugins), KRunner |
| Meta+Shift+E | end session: log out (Plasma asks first), or sleep, shut down or Plasma's logout screen, as set on the Keys page |
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
that output's visible workspace; the focus stays) and **move workspace to output** (the whole
workspace; the output it leaves shows the one it showed before). The setting
`workspaceAutoBackAndForth` makes Meta+N for the workspace you are on go back, as i3's
`workspace_auto_back_and_forth`. And **move to workspace next / prev** (and on output): the
focused window to that workspace; the focus stays.

A new window opens on the workspace you are on when it appears. i3 sends a program it started
itself back to the workspace it was launched from; kwin-i3 doesn't (a window another program
starts, such as a game from its launcher, opened where you were in i3 too).

Mouse:
- **Meta+left-drag on a tiling window** is i3's tiling drag (needs the helper plugin): the window
  stays put while a highlight shows where it would land, under a move cursor. Near another
  window's edge it goes beside that window; in the thin strip at an edge it goes beside the whole
  row or column that shares that edge; in the middle **the two swap**, unlike i3, which moves it after the target.
  Any button's release drops it there; any key cancels. With tiling windows showing their own title bars (`tiledLook`), dragging a tiling window's title
  bar does the same.
- **Meta+Shift+left-drag on a tiling window** pulls it out at its floating size and floats it where
  it is dropped, the mouse twin of Meta+Shift+Space: Shift is a float modifier here, where i3's
  Shift swaps (the middle drop swaps anyway). Without the helper plugin, Meta+left-drag does this.
- **Meta+right-drag on a tiling window**, or in the gap beside one, is i3's tiling resize (helper
  plugin): the pointer jumps onto the nearest edge, a bar follows it, and the sizes change on
  release, against the nearest container with a neighbour on that side, as in i3 (nothing if
  there is none). A plain press in a gap does the same: the gaps are kwin-i3's. Without the helper it is KWin's own resize, kept in the tree.
- **Meta+left-drag and Meta+right-drag on a floating window** move and resize it: KWin's own.

With the plugins, the 1 px frame starts nothing from the pointer (no resize cursor, no edge drag,
no title-bar move), and hover and a click on it focus the window, as i3's border does.

## Requirements

- Plasma 6.7 or later, in a Wayland session. Tested on Fedora 44 / Plasma 6.7.5 (NVIDIA, two
  outputs) and Arch / Plasma 6.8.2 (AMD, a laptop's one output); built and tested headless on
  PikaOS / Plasma 6.7.4. One activity.
- `git`, `make`, and the packages to build the plugins and the settings page:

| distribution | packages |
|---|---|
| Fedora | `make gcc-c++ cmake extra-cmake-modules kwin-devel vulkan-headers kf6-kcmutils-devel kf6-ki18n-devel kdialog` |
| Arch, CachyOS | `base-devel cmake extra-cmake-modules vulkan-headers kdialog` (KWin's headers come with `kwin` itself) |
| PikaOS, Debian | `build-essential cmake extra-cmake-modules pkg-config kwin-dev libvulkan-dev libdrm-dev libkdecorations3-dev libxkbcommon-dev libkf6kcmutils-dev libkf6i18n-dev libkf6service-dev kdialog` (`kwin-dev` doesn't pull in `libdrm-dev`, `libkdecorations3-dev` or `libxkbcommon-dev`, though KWin's cmake files need them) |

- For the tests only: `libei-devel` (real input), `python3-gobject` + `gtk4` (the test client),
  `python3-dbus`, `python3-xlib`, `python3-pillow` (screenshots), `node` (unit tests). On Arch:
  `libei`, `python-gobject`, `gtk4`, `python-dbus`, `python-xlib`, `python-pillow`, `nodejs`.

## Install

About ten minutes in a terminal, with one log-out in the middle. **Never alongside another tiling
script** (Krohnkite, Polonium, …): two scripts would place the same windows, so turn the other one
off first (System Settings > Window Management > KWin Scripts).

1. **Get it**, into `~/kwin-i3` (the steps below assume that path):
   `git clone https://github.com/grandpaul2/kwin-i3 ~/kwin-i3 && cd ~/kwin-i3`
2. **The script**: `mkdir -p ~/.local/share/kwin/scripts`, then
   `ln -s ~/kwin-i3/package ~/.local/share/kwin/scripts/kwin-i3`, then
   `kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled true`.
3. **The plugins**: `make plugin-install`. They draw the frame and run the mouse (the table
   below). The first time it may say KWin didn't load them yet: they load at the next login.
4. **The settings page**: `make kcm-install`. It shows in System Settings > Window Management
   after the next login.
5. **Log out and in.** KWin reads a newly linked script, and the plugins' and settings page's
   paths, only at login. kwin-i3 is running when your windows tile.
6. **Your keys**: `make take-keys`. Some of i3's keys are Plasma's too (Meta+arrows for quick
   tiling, Meta+D, Meta+V, Meta+R, Meta+E, Meta+L, Meta+0, Meta+Shift+Left/Right, Meta+1…9 if the
   task manager uses them), and a key two shortcuts share runs Plasma's, not kwin-i3's. This
   takes each one that clashes from its Plasma shortcut and **prints the list of what it took**.
   To give them back: `make restore-keys`, or Defaults in System Settings > Shortcuts. Rather keep
   some of Plasma's? Skip this step and take keys one by one on kwin-i3's Keys page (a key Plasma
   holds is named in its row and moved on Apply).
7. **For i3's feel**: Plasma's own settings that kwin-i3 is designed around. These are **Plasma's
   settings, not kwin-i3's**: kwin-i3 never changes them, and you change them back in the same
   place.
   - **Focus follows mouse**: System Settings > Window Management > Window Behavior > Focus,
     *Window activation policy*: "Focus follows mouse (mouse precedence)", and *Delay focus by*:
     0 ms. Under click to focus, the frame moves only when you click.
   - **More than one monitor**: System Settings > Virtual Desktops, "Switch desktops independently
     for each screen" on (off by default). With it off, a workspace switch changes every monitor
     and windows tile on the wrong one. It takes effect at once.
   - **Animations off** (optional; i3 has none): System Settings > Quick Settings, *Animation
     speed* to "Instant".
8. **A terminal on Meta+Return**: kwin-i3 opens your default terminal (System Settings > Default
   Applications > Terminal emulator).
9. **A key for bug reports**: System Settings > Shortcuts > Add New > Command or Script,
   `~/kwin-i3/tools/capture`, on a key you don't use (Meta+Shift+B is free on a stock Plasma). Press it
   right after something goes wrong: it asks for a note and saves what kwin-i3 saw in the seconds
   before to `~/.local/state/kwin-i3/captures/<time>/`. Send that folder (zipped) with your report.

**After a Plasma update**: the plugins work only with the KWin version they were built against,
so after each Plasma update tiling windows have their title bars back until you run
`cd ~/kwin-i3 && make plugin-install` (the settings page and the script need nothing). **To
update kwin-i3**: `cd ~/kwin-i3 && git pull && make plugin-install kcm-install`, then the reload
below.

**On a laptop that docks**: when an output goes away, its workspaces move to the first output for
good, as in i3. To keep a workspace on the external output, give it a workspace output (the
settings page's Workspaces, or `workspaceOutputs` below); it goes back when that output returns.

**To stop it**: Meta+Ctrl+Shift+Q releases every window until kwin-i3 is loaded again. **To remove
it**: `make restore-keys` (if you ran `make take-keys`), then
`kwriteconfig6 --file kwinrc --group Plugins --key kwin-i3Enabled false`, log out, and delete
`~/.local/share/kwin/scripts/kwin-i3`, `~/.local/lib/kwin-i3/`, the drop-in
`~/.config/systemd/user/plasma-kwin_wayland.service.d/kwin-i3-plugin.conf` and
`~/.config/environment.d/kwin-i3.conf`.

With the script alone (no plugins), windows keep Plasma's decoration (Breeze, title bars and all),
and the keys, the tree, the workspaces and floating work; the settings page says at its top when
the plugins aren't loaded.

### The plugins

| plugin | adds | without it |
|---|---|---|
| `kwini3hold` (an effect) | the tiling drag's highlight and move cursor; i3's 1 px frame around tiling windows (width and colours in the settings), blue on the active one: tiling windows lose their title bars and the frame is drawn in the room the tiles leave, outside the window, so none of the app is covered. Floating windows keep your decoration (Breeze or any theme). And atomic layout changes: windows that move together land in the same frame | tiling windows keep their title bars; on a fast output, a frame or two of wallpaper where a window is about to land |
| `kwini3helper` (a KWin plugin) | **the tiling drag and resize** (Meta+drag, a title-bar drag, Meta+right-drag; see "Mouse" above); focus on the frame: hover on it focuses its window, a click on it activates and raises, as on i3's border (and nothing reaches the desktop beneath); **Apply applies**: a save in the Configure form takes effect at once; **panel popups forgive a stray pointer**: while one has the focus, focus follows mouse waits 1.5 s, so crossing the gap of a floating panel doesn't close it (every other focus change stays as you set it); and **keys for your keyboard layout**: Meta+1 … 0, Meta+Shift+1 … 0 and the `;` keys follow the key position on any layout (KWin matches the symbol a key types, so on German Meta+Shift+2 is Meta+"), refitted when you switch layouts; keys you set yourself are left alone | after Apply, press Meta+Shift+C; with focus follows mouse and no delay, a floating panel's popups close when the pointer crosses the gap (turn off the panel's floating); on a layout that isn't US, set those keys on the settings page |

`make plugin-install` builds both, puts them under `~/.local/lib/kwin-i3/qt6plugins` (a hash in
each file name: KWin never unloads a library), loads them into the running KWin, and writes a
systemd drop-in for KWin's unit (`QT_PLUGIN_PATH`). The drop-in takes effect at the next login,
once. Loading the effect re-tiles every window once (the frame's room). The first install can
also print "KWin did not load the effect … (not seen yet, or built for another KWin version?)":
KWin finds the effect only through the drop-in, so it loads at that next login. If `cmake` fails to configure (a missing package), delete
`plugin/build` before trying again: it keeps what it found, Qt 5 included.

**The upkeep**: both plugins are refused by any KWin version other than the one they were built
against, so after every Plasma update they are off until `make plugin-install` runs again; until
then tiling windows have their title bars. One source builds against 6.7 and 6.8 (6.8 changed the
effects' paint calls), so the update needs only that.

**Plain GTK 4 apps** (GTK 4 without libadwaita, with Plasma's title bar) learn their largest size
from KWin only when they first appear, with the title bar counted; kwin-i3 asks KWin to tell them
again once the title bar is gone, so they fill their tile.

To reload the script after a change: `busctl --user call org.kde.KWin /Scripting
org.kde.kwin.Scripting unloadScript s kwin-i3`, then the `reconfigure` above. It re-tiles every
window once.

### The settings page

kwin-i3's own page in System Settings > Window Management: every setting, laid out as Plasma's
pages are, and **Keys…**, where kwin-i3's keys are rebound in one list instead of KWin's. A key
another shortcut holds is named in its row and taken from it on Apply (`make restore-keys` gives
it back). Apply takes effect at once, with or without the plugins.

`make kcm-install` builds it (needs `kf6-kcmutils-devel` and `kf6-ki18n-devel`) and puts it in
`~/.local/lib/kwin-i3/kcm-plugins`, with `~/.config/environment.d/kwin-i3.conf` adding that to the
session's `QT_PLUGIN_PATH`: it shows in System Settings after the next login, once. It links no
KWin library, so a Plasma update doesn't turn it off.

### Optional: the workspace widget

Plasma's pager draws every desktop as all your outputs side by side, and every desktop, used or
not; with per-output desktops a workspace lives on one output, so half of each thumbnail is
empty. kwin-i3's widget, **kwin-i3 Workspaces**, shows every workspace in use (windows on it, or a
output showing it, as i3bar does), each at its own output's shape with its windows, the shown
ones marked (more strongly on the output with focus); a click is Meta+N, a scroll goes to the
next or previous one. `make widget-install` (QML only: nothing to build, nothing to redo after a
Plasma update), then on the panel: right-click the pager, *Show Alternatives*, *kwin-i3
Workspaces* (or *Add Widgets*). Its settings: *Numbers only*, for a small panel. A workspace's
name is its desktop's, set in System Settings > Virtual Desktops: a named one is labelled
"2 mail" (kwin-i3 never renames a desktop). The widget is kwin-i3's: without kwin-i3 running, a
click does nothing (use Plasma's pager there).

## Configuration

kwin-i3 is the window manager: its workspaces, outputs and keyboard focus apply to every window
in its tree. A window has one of i3's kinds. **Tiling**: the tree places it. **Floating**: you
place it, with its own title bar, as a Plasma window; kwin-i3 keeps it on its workspace and above
the tiling windows, and moves it by key. **Dock**: Plasma's panels. **Override-redirect**: popups,
menus, notifications, KRunner and Plasma's system windows, which no window manager places;
kwin-i3 never tiles, floats, moves or resizes them, as i3 doesn't.

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
| `[Script-kwin-i3] forWindow` | Spectacle, the password prompt, KRuler, plasmashell's ordinary windows and the desktop portal's dialogs (a screen-share picker, a file chooser) float | i3's `for_window` rules, one per line (or `;`-separated): `[criteria] floating enable` or `floating disable`. Criteria: `class`, `instance`, `title`, `window_role`, `window_type` (`normal`, `dialog`, `utility`, `toolbar`, `splash`, `notification`), `workspace` (its number), `floating`, `tiling`, `all`. A value is a regular expression, quoted or bare as in i3 (`[class=Firefox]`); `window_type` takes one of its words, and `floating`, `tiling` and `all` take none. All in one rule must match. A rule runs at most once per window, when it opens or changes title or class (`docs/behaviour.md` §3) |
| `[Script-kwin-i3] assign` | empty | i3's `assign` rules: `[criteria] → 5` opens matching windows on workspace 5 (shown or not, without switching a output); `[criteria] output DP-6` on that output's visible workspace |
| `[Script-kwin-i3] floatingMinimumSize`, `floatingMaximumSize` | `75x50`, `0x0` | i3's `floating_minimum_size`/`floating_maximum_size`: a window becoming floating is sized within them; `0x0` means i3's default (75x50; all outputs together), `-1x-1` no limit |
| `[Script-kwin-i3] gapsInner` | `2` | px between two tiling windows (i3's `gaps inner`; i3's default is 0), 0-100, even: the pickers step by 2 and an odd value counts as the even one below (half a gap on each window would put windows on half pixels) |
| `[Script-kwin-i3] gapsOuter` | `0` | px added at the output's edge (i3's `gaps outer`: the edge gap is inner + outer), -100-200; below 0 takes from the edge, down to half the inner gap (KWin's limit) |
| `[Script-kwin-i3] gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` | `-1` | that edge's outer gap instead of `gapsOuter` (i3's `gaps top` …), 0-200; -1 means `gapsOuter` |
| `[Script-kwin-i3] workspaceGaps` | empty | i3's `workspace N gaps …` lines, in place of the gaps above on that workspace (as i3): `3 gaps inner 10, 5 gaps outer 0` (one per line, or `;`- or `,`-separated; `inner`, `outer`, `horizontal`, `vertical`, `top`, `right`, `bottom`, `left`) |
| `[Script-kwin-i3] smartGaps` | `off` | i3's `smart_gaps`: `on` (no gaps on a workspace with one tiling window), `inverse_outer` (the edge gaps only on such a workspace), `off` |
| `[Script-kwin-i3] hideEdgeBorders` | `none` | i3's `hide_edge_borders`: `smart` (no frame on a window alone on its workspace), `smart_no_gaps` (the same, only with no edge gap there), `vertical`, `horizontal`, `both` (no frame on those sides of a window at the output's edge, with no gap between windows; the frame's width stays empty there), `none` |
| `[Script-kwin-i3] resizeStep` | `10` | % per resize key in the mode, 1-50 (i3's `resize ... 10 ppt`) |
| `[Script-kwin-i3] floatingStep` | `10` | px a floating window moves (Meta+Shift+arrow) or resizes (the mode's keys), 1-200 (i3's `move left 10 px`) |
| `[Script-kwin-i3] defaultOrientation` | `auto` | how a new workspace splits: `auto` (side by side unless the output is taller than wide), `horizontal`, `vertical` (i3's `default_orientation`; workspaces that exist keep theirs) |
| `[Script-kwin-i3] focusWrapping` | `yes` | i3's `focus_wrapping`: `yes` (at the edge, to the next output, else wrap), `no` (never wrap, still cross outputs), `force` (always wrap inside the container), `workspace` (wrap, never leave the workspace) |
| `[Script-kwin-i3] tilingDrag` | `modifier titlebar` | i3's `tiling_drag`: which presses drag a tiling window to a new place in the layout (plugins): `modifier` (Meta+left anywhere in it), `titlebar` (a left press on its title bar), both, or `off` (a tiling window stays put) |
| `[Script-kwin-i3] popupDuringFullscreen` | `smart` | i3's `popup_during_fullscreen`: with a fullscreen window on the workspace, a new window opens behind it and the fullscreen window keeps the focus, except (`smart`) the fullscreen window's own dialogs; `ignore`, no exception (save a modal dialog of the fullscreen window itself, which KWin activates in its place); `leave_fullscreen`, any dialog ends the fullscreen instead; `all`, any floating window shows over it. A window that opens fullscreen itself always takes over |
| `[Script-kwin-i3] mouseWarping` | `output` | i3's `mouse_warping`: `output` (when the focus moves to another output by a key, a workspace switch or an activation, the pointer goes to the focused window's centre, unless it is on that output already), `none` (the pointer never moves by itself) |
| `[Script-kwin-i3] endSession` | `logout` | what Meta+Shift+E (i3's exit) does: `logout` (Plasma's log out prompt), `sleep` (at once), `shutdown` (Plasma's shut down prompt), `ask` (Plasma's logout screen, every choice). The prompts go ahead after 30 seconds unless cancelled |
| `[Script-kwin-i3] workspaceOutputs` | empty | i3's `workspace N output A B …`: `1=DP-4 HDMI-A-1, 2=DP-6` (connector names, `kscreen-doctor -o`; a list per workspace, the first connected output wins). At login each output shows the lowest workspace free and not set to another output; an empty workspace with a workspace output opens on its output; a output that appears takes the workspaces set to it and shows its lowest, else a free one. An output that goes away leaves its workspaces on the first output for good: only a workspace output brings one back, as in i3. A reload moves no workspace that exists |
| `[Script-kwin-i3] workspaceAutoBackAndForth` | false | i3's `workspace_auto_back_and_forth`: Meta+N for the focused workspace shows the one focused before; Meta+Shift+N for it sends the window there |
| `[Script-kwin-i3] warnTakenKeys` | `true` | at load, check which of kwin-i3's keys another shortcut holds (that one fires, kwin-i3's doesn't), for a notification naming them; Plasma doesn't show kwin-i3's notifications yet (`LATER.md` item 56), so for now `make take-keys` is the list |
| `[Script-kwin-i3] debugLog` | `false` | also send every log line over D-Bus to `tools/logsink.py` as it happens (the test KWin's log; nothing listens on a desktop). Either way the last 2000 lines are kept in memory for `Dump State` and `tools/capture` (`docs/debugging.md`) |
| `[Script-kwin-i3] holdEnabled` | `true` | the atomic-layout effect's kill switch (plugins) |
| `[Script-kwin-i3] holdTimeoutMs` | `200` | how long the old layout may be held for a slow window, 10-2000 ms (Sway's too) |
| `[Script-kwin-i3] frameWidth` | `1` | the frame's width, 1-10 px (i3's `default_border pixel N`; plugins): the tiles leave that much room on each side of a window |
| `[Script-kwin-i3] frameActive` | `#4c7899` | the frame's colour on the focused window (i3's `client.focused`) |
| `[Script-kwin-i3] frameInactive` | `#333333` | on every other window, the other output's focused one included (i3's `client.unfocused`; its `focused_inactive` is left out) |
| `[Script-kwin-i3] frameIndicatorActive`, `frameIndicatorInactive` | `#3daee9`, empty | on a window alone in its split (or on its workspace), the side where the next window opens, right or bottom, in this colour per class (i3's `indicator`); empty: the class's frame colour |
| `[Script-kwin-i3] tiledLook` | `frame` | how tiling windows look: `frame` (i3's frame, no title bar), `titlebars` (each keeps its own title bar, as a Plasma window; the maximize button does nothing, as in sway), `bare` (neither; nothing marks the focused window, KWin's Dim Inactive effect can). Plugins: without them, `titlebars` whatever this says |
| `[Script-kwin-i3] roundedCorners` | `true` | tiling windows' corners rounded 5 px, as Breeze's, the frame following them, in `frame` and `bare` (plugins: without them tiling windows keep their title bars, and with them their theme's corners). Floating windows keep their theme's corners either way |
| `[Script-kwin-i3] floatingWorkspaces` | empty | workspaces where new windows float: `3, 7`. A window that opens there floats, with its own title bar, as a Plasma window (Meta+Shift+Space tiles it); it keeps its mode when moved. With the plugins, floating windows there aren't kept above the tiled ones; elsewhere they are, as in i3 |
| `[Script-kwin-i3] frameOnFloating` | `false` | floating windows lose their title bar too and get the frame in the same colours (plugins; not a window that draws its own title bar). How kwin-i3 remembers a floating window across a reload: with the plugins, the effect keeps the set; without them, KWin's keep-above flag, which kwin-i3 sets on every floating window and treats as its own (a window you keep above yourself, in no tile when kwin-i3 loads, is adopted as floating) |

**An app that floats at its old tiled size**: a floated window comes back at the size it opened
with, as in i3, but an app that saves its own size (most KDE apps) and last closed tiled opens
asking for that tiled size. i3's answer is a `for_window … resize set` line; here it is a Plasma
window rule, which KWin applies before the window shows: System Settings > Window Management >
Window Rules > Add New…, *Window class* the app's (Detect Window Properties finds it), then Add
Properties: *Size* and *Position*, each "Apply Initially" with the values you want. Tiling ignores
it (the window still fills its tile); floated, the window comes back at that size and place. Not
"Force": that would fight the tiles.

Dialogs, transients, modals, splash and utility windows and non-resizable windows float; a
window on all desktops is i3's sticky floating: it floats and follows the workspace its output shows (`docs/behaviour.md` §3; the unbound action Sticky Toggle, as i3's `sticky toggle`); panels, the desktop,
popups and Plasma's system windows are never in it (i3's dock, root and override-redirect kinds). kwin-i3 assumes one activity: windows on other activities aren't
handled yet (`LATER.md` item 5).

Plasma's panels: the common setups work as they are (any edge, floating or not, any visibility,
a panel on each output); windows tile in the space a panel leaves. If something looks off after
you change a panel's settings, adjust the panel, or log in again.

## Working on it

```
make test        # unit tests (node) + live tests (each in its own headless KWin)
make build       # src/ -> package/contents/code/main.js (edit src/, never the built file)
make plugin      # the two plugins, into plugin/build
make fuzz        # 5 min of random actions with pixel invariants (docs/fuzz-design.md; held during the Stage)
make mutate      # the unit tests against deliberate faults; mutate-live from a worktree
make tools       # tools/bin/ei-send, the input tool (make test builds it; tests/live/run.sh alone doesn't)
```

The live tests never touch the running desktop: `tools/testkwin.sh` starts a private KWin with two
virtual 1280x720 outputs, its own D-Bus session and its own config. `tools/testclient.py` opens the
awkward windows (fixed size, large minimum, dialog, slow to appear, retitled); `tools/inject.py`
sends real input through libei; `tools/shot.py` reads pixels. A bug seen on the desktop becomes a
file with `tools/capture` (the recent log and kwini3hold's events, the state, a screenshot, a
note; read with `tools/capture-read`, `docs/debugging.md`), then a live test, watched red, then a fix.
A red scenario leaves its output and kwin-i3's log in `tests/live/out/`. `CONTRIBUTING.md` is how
to start and how a change lands (pull requests); `AGENTS.md` has the working rules in full.

Docs: `docs/README.md` is the map. `docs/philosophy.md` (what it is for), `docs/plan.md` (scope
and decisions), `docs/behaviour.md` (what it does, exactly), `docs/kwin-tiles.md` (why KWin's own tiles)
and the test tools' designs (`docs/fuzz-design.md`, `docs/input-tests-design.md`).

## License

GPL-2.0-or-later (`LICENSE`). `src/tree.js` ports i3's tree code, which is BSD-licensed; `NOTICE`
carries its notice and the other credits.
