# KWin as found: the traps

What KWin 6.7.5 (and Plasma around it) actually does where it surprised us, read from its source
or probed in the test KWin. Each line cost a session or more to find. Read the section for the
part of KWin you are about to touch before you touch it. kwin-i3's *answer* to each lives in
`behaviour.md` or the spec named; this page is KWin's side only.

Sources: KWin's source for the installed version (`rpm -q kwin` / `pacman -Q kwin`, then
`invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`; `git clone --depth 1 --branch v6.7.5`
works too). Plasma 6.8 dropped the X11 session, not Xwayland's windows (`X11Window` is still in
6.8.2). Add a line when you find one; correct a line in place.

## Tiles (`src/tiles/tile.cpp`, `customtile.cpp`)

- `Tile::manage` lists a window but places it (`requestTile`) only if the tile's desktop is current;
  on a hidden desktop `w.tile` stays null, and a second `manage()` returns early for a listed window.
- `Tile::isActive`: only a tile on its output's **shown** desktop resizes its windows. Pick tiles by
  the window's own output (a scenario padded the other monitor's tile for days and tested nothing).
- `requestTile(nullptr)` (unmanage) restores the window's pre-tile geometry, fullscreen or not.
- `setPadding` / `setRelativeGeometry` moveResize every window listed in the tile, fullscreen or
  not; KWin keeps a fullscreen window listed in its tile until a rebuild.
- `Tile::manage` refuses a fullscreen window (`isResizable` is false while fullscreen is requested).
- A window's scripting `tile` is the **requested** tile (`window.h` `READ requestedTile`), cleared
  by the unmanage itself, not on the client's ack: safe to decide from (probed with a SIGSTOPped client).
- Every tile has a hidden minimum of 15% of the screen (`tile.h` `m_minimumSize`), inherited by
  children. A tile minimum also blocks the in-between steps of moving several edges, so sizes never
  settle: clear minimums while setting sizes.
- Setting one tile's `relativeGeometry` moves its neighbours' shared edges: one pass in order can
  leave a stale edge. `CustomTile::setRelativeGeometry` pins a changed edge with no tile beyond it
  to 0 or 1 and compares exactly, and clamps a root to (0,0,1,1): no negative inset.
  `setSizesStable` repeats up to four passes. The warning names each tile still moving, the rect
  asked and the one KWin kept.
- **A tile's rect stores its four edges** (`core/rect.h` `RectF`: `m_left`, `m_right`, ...), but a
  script reads and writes x, y, width and height: KWin builds a written rect's right edge as
  `x + width`, and a script reads `width` as `right - left`, rounded. For edges that aren't short
  binary fractions the edge read back, or written back, is often an ulp off (on 2560 px, for 384
  of the 2556 split positions). KWin compares edges exactly and pins an outer one that
  "changed" to 0 or 1 (above), where `windowGeometry` gives the window the full padding: 1 px
  short, on some passes and not others, so every window of a workspace shifted by a pixel at a
  split, a layout change or a focus change inside a tab group. So every edge kwin-i3 writes is a
  multiple of 2^-20 (`grid()`), the root's included: every sum and difference is then exact, an
  edge reads back as written, and nothing is pinned. KWin's own edge moves (`setLeft`,
  `intersected`, a split's halves) keep the grid. A tile already pinned stays so under any write:
  `edgesIntact` (exact) fails and the workspace is rebuilt once.
- Padding is one number per tile (`tile.h:33`). `windowGeometry` gives an edge at the screen's
  border (relative 0 or 1) the full padding, others half (`tile.cpp:171-178`). Edges are rounded to
  whole logical pixels first, so an odd padding puts every window on a half pixel (text shifts on
  redraw). A padded tile has no anchors, so apps are never told "tiled".
- A side pinned all the same (a user's drag of an outer side) is measured from the root's edge
  (`windowRect`, `pinned`), and the window put back when KWin's own request for the short rect
  lands after the pass (`refitOnFrameChange`), until the next pass rebuilds the tiles.
- App minimum sizes exclude the decoration.

- **A leaf tile holds several windows** at the same geometry (`Tile::manage` keeps a list): KWin
  lays them over one another, the stacking order deciding which shows. Activating one raises it;
  closing one leaves the others listed. An **empty** leaf tile stays (KWin removes no tile by
  itself), and its minimum can be zeroed like any other's. kwin-i3's tabbed and stacked groups
  rest on both (probed in the test KWin: a bar tile, then one leaf holding three windows).
- A vertical tile can't sit in a vertical parent (`split()` adds a sibling instead): a group's
  bar-over-content pair merges into a vertical parent, and its bar's px come from its own kids.
- Scripts have `workspace.raiseWindow(w)` (6.7.5 `workspace_wrapper.h:471`): above all others in
  its layer, so not above a kept-above (floating) window.
- **A tile held across a pass is gone**: kwin-i3's passes make new tiles, so a `w.tile` kept in a
  variable reads `undefined` after one, and two tiles are never compared by identity. Ask the
  question another way (whose root it hangs from: `workspace.rootTile(output, desktop)`).
- **A cancelled interactive move re-tiles by position** (6.7.5 `window.cpp:1083-1088`): back to
  the start geometry, then `setQuickTileMode(Custom, start centre)`, which picks whatever custom
  tile is under that point now, not the one the move started from. A release at a screen edge
  sets a quick tile instead, one whose root is no custom root tile.

## Windows and Wayland clients (`window.cpp`, `xdgshellwindow.cpp`)

- **A hidden Wayland window (its desktop not current on its output) gets no frame callbacks, never
  acknowledges a configure, and KWin applies no size change to it until it does.** Never ask a
  hidden window for a new size. A hidden Electron client never acks a move either: `sendToOutput`
  is then a no-op forever.
- A same-size move is applied synchronously inside the caller (`moveResizeInternal`); a resize waits
  for the client's commit, so a check right after a resize reads the old frame.
  `frameGeometryAboutToChange` fires first either way, even when nothing changes. Windows of one
  layout change land 2-13 ms apart (240 Hz monitor). So a position worked out against a window's
  frame just after it was told a new one is against the old (a floated group's bar drawn
  mid-window): work from the rect it was told. A `moveResize` outside an interactive resize sends
  every new size on with no pacing (6.7.5 `xdgshellwindow.cpp:262-279`), and no Resizing state.
- KWin sends no configure when the size asked is the size the window has (a swap of two equal halves
  only moves them): an answer still in flight lands after a refit that saw "fits". A watch for late
  frames must be scoped to the tile it was set for.
- A client may set its own size and KWin accepts it after the fact (Firefox does; GTK 3/4 test
  clients can't); an oversize is clamped to the monitor.
- `configure_bounds` is sent only with a 0x0 configure (`sendRoleConfigure`) and never again when
  the decoration goes; plain GTK 4 clamps even an explicit tiled size to them.
- Fullscreen: `isFullScreen()` is the *applied* state. On the commit, the frame changes **before**
  the flag (`handleNextWindowGeometry`, then `handleStatesAcknowledged`), both going in and coming
  out: look again a moment later (kwin-i3 waits 150 ms). A pending fullscreen request makes
  `resizeable` false. A fullscreen window is on the top layer only while active (`isActiveFullScreen`).
- `PlacementTracker` re-requests fullscreen, and puts a returning monitor's windows back on it,
  **after** a script's replug reconcile.
- An X11 client's own move request (`X11Window::configureRequest`) is run as an interactive
  output change: a window landing on another output has its desktop swapped for that output's
  current one (`finishInteractiveOutputChange`, `window.cpp:4593`), and kwin-i3 hears
  `outputChanged`, then `desktopsChanged`. KWin ignores the request from a window in a tile
  (`requestedQuickTileMode() != None`; a custom tile is `Custom`), but only from a window that
  doesn't want no decoration (`m_wantsNoDecoration`, Motif hints: a borderless game in its tile is
  moved). A fullscreen window's ConfigureRequest is refused before any of this
  (`configureRequestEvent`, `events.cpp:451`); its `_NET_MOVERESIZE_WINDOW` is not
  (`NETMoveResizeWindow` calls `configureRequest` directly). `sendToOutput` (Move to Screen) lands
  a fullscreen window covering the new output (`ensureSpecialStateGeometry`) before its desktop
  swap; a client's own move lands where it asked.
- A Wayland transient is type `Normal` (check `isDialog` / `isModal` / `transientFor`).
  Every app's Wayland window is: KWin sets a type only from Plasma's shell roles, and Qt uses the
  xdg-dialog protocol only for a modal window. A dialog with no parent and no modality looks like
  a main window (`behaviour.md` R7).
  `normalWindow` is type Normal only: an X11 dialog/utility/splash isn't one.
- `Window::setDesktops` ties a window and its transients both ways (`window.cpp:730-742`), but only
  on a later `setDesktops` on the dialog, not when it opens. Moving a window with a modal dialog
  moves both and briefly gives them two desktops. Give a modal dialog a desktop directly.
- GTK maps a dialog child before its parent window (the dialog's `windowAdded` comes first).
- `isHidden()` leaves Show Desktop out; `isShown()` counts it (`window.cpp:4518/4521`). A hit test
  needs `isShown()` and `isOnCurrentActivity()`. A script has neither `isShown` nor the Show Desktop
  flag, but hears `hiddenByShowDesktopChanged` (no argument; probe 97). Show Desktop hides every
  window but docks, desktops, their transients, unmanaged and input-method ones
  (`breaksShowingDesktop`, `workspace.cpp:1743`), and one of those opening ends it. `isOnCurrentDesktop` is per output.
- A window given a desktop its monitor doesn't show is hidden.
- `Window`'s delayed-move API (`dontInteractiveMoveResize`, `start/stopDelayedInteractiveMoveResize`)
  is `protected`: a plugin can't cancel a move KWin armed, and a title-bar press arms one by a timer.
- Shift held during KWin's interactive move means "drop into a custom tile" on release.
- KWin's window actions (Meta+left move, Meta+right resize) fire only when the modifiers equal
  `CommandAllModifier` exactly (6.7.5 `input.cpp:1299`): Meta+Shift+left reaches the app.
- An app's own move request (`xdg_toplevel.move`, a header bar's drag) is run as KWin's own move
  command (`handleMoveRequested`, `xdgshellwindow.cpp:1045`): no input filter sees it, as for Move
  Window and the window menu's Move. `cancelInteractiveMoveResize` (public) stops one, but not
  inside `interactiveMoveResizeStarted`: `startInteractiveMoveResize` goes on after the emit
  (`window.cpp:1067-1070`), so queue it a turn. A cancel puts the quick-tile mode back
  (`finishInteractiveMoveResize`, `window.cpp:1082`); the first step of a move takes it off
  (`:1234`).
- Spectacle's region overlay is a Normal fullscreen window per output, class `org.kde.spectacle`.
- KWin shows a script no X11-only property: Plasma's notifications are told by class `org.kde.plasmashell`.
- `noBorder`'s change signal is `decorationPolicyChanged`; there is no `noBorderChanged` (`window.h:504`).
  On Wayland the title bar arrives with the client's answer to the configure
  (`configureDecoration`, `xdgshellwindow.cpp:1635`): right after the flag flips, frame = client. A
  tile's frame then keeps its size and the client shrinks by the title bar, so only
  `clientGeometryChanged` shows it, not `frameGeometryChanged` (probe 96, 2026-10-30).
- A Wayland window is transient only when its app names a parent (`set_parent`, or a portal's
  `parent_window` through xdg-foreign, `xdgshellwindow.cpp:1165`). There is no dialog type, so a
  parentless portal dialog (Firefox's screen-share picker) arrives as a plain `Normal` window.
- `resourceName` (i3's class instance) can be empty for a native Wayland window (KeePassXC's, live
  KWin 6.x, 2026-11-01); `resourceClass` (the app id) is always there. Anything keyed on the
  instance needs the class as a fallback.

## Activation and focus (`activation.cpp`, `workspace.cpp`)

- `addWaylandWindow` activates every new window (focus stealing Low) **before** scripts get
  `windowAdded`; `activateWindow` switches that output's desktop first (SwitchToOtherDesktop): a
  capture shows SHOWN, ACTIVE, ADD within 2 ms. A script can hand focus back synchronously from the handler,
  but a new modal dialog whose parent hasn't mapped yet is activated again right after (the same
  millisecond, before the next pass): a second `windowActivated` that is still the opening's, not
  a request (scenario 87, part 4; `opening` in `src/kwin.js`).
- `activateWindow` activates a window's modal dialog in its place (`findModal`): the parent never
  gets `windowActivated`.
- A parent resized by its tile (a rebuild after a sibling's fullscreen ended) was followed, the
  same millisecond, by KWin activating its open modal dialog, which had opened without the focus
  (scenario 32, `leave_fullscreen`, before a fullscreen window's place was kept). Seen, not yet read
  in the source; it is not the dialog's own activation request, which never came without the resize.
- Every activation (xdg-activation, Alt+Tab, a task manager click, a script) goes through one
  `activateWindow` and one `ActivationDesktopPolicy`; a script can't tell them apart. DoNothing
  breaks Alt+Tab and the task manager.
- A new xdg toplevel takes `currentDesktop()` of KWin's active output, which follows every pointer
  motion (`pointer_input.cpp:950`) and every activation.
- Closing: `closed()` fires, then KWin activates a successor (`activateNextWindow`: the window under
  the pointer if NextFocusPrefersMouse, else its focus chain), then `windowRemoved`.
- `doMinimize` activates the next window **before** `minimizedChanged`.
- After a monitor unplug KWin can activate a window whose desktop its monitor no longer shows.
- `activateWindow` of a window Show Desktop hides turns Show Desktop off; Plasma's edit mode turns
  it on. Scripts can't read Show Desktop (no property), but `callDBus` to `/KWin`
  `org.freedesktop.DBus.Properties.Get` works. D-Bus `showDesktop(bool)` lasts only while the caller
  stays on the bus; tests toggle the "Show Desktop" shortcut instead.
- **A full-screen effect starting or ending turns Show Desktop off** (`setActiveFullScreenEffect`,
  `effecthandler.cpp:440-454`), and the off activates the focus chain's window. Slide is one while it
  animates: Show Desktop turned on during a desktop switch's slide ends when the slide does (probe 99,
  gdb on the test KWin, 2026-10-30: the load's own switch, `OPEN.md` item 53).
- `Workspace::switchToOutput` focuses a window on that screen (or the desktop); it doesn't move the pointer.
- A brand-new output shows `initialDesktopForNewOutput`: the activity's last desktop for it, else 1.
- A press on, or focus follows mouse into, the window that is already active activates nothing:
  no `windowActivated`, and a script gets no press signal of its own. A press that matters while
  the active window stays active (i3's focus parent: the container's window pressed) has to come
  from the helper's input filter (`SetFocusParent`, "Window Pressed").

- With no other window left (an empty desktop), KWin activates xwaylandvideobridge's invisible
  idle window, a Normal window on Fedora's Plasma. It never asked for the keyboard, so it doesn't
  hold it: an active override-redirect window read as "holds the keyboard" ignored every key there
  (`Rules.fallbackOnly`). Seen on 6.8.2; the same bridge runs on 6.7.

## The pointer and focus follows mouse (`pointer_input.cpp`, `input.cpp`; `docs/pointer.md`)

- Hover is `findToplevel`: the topmost window whose **input region** (inside its buffer, not its
  frame) hits, recomputed on every motion, press and **stacking change**. Custom-frame apps (VS Code,
  Chromium/Electron, GTK header bars) keep a ~10 px invisible resize band past their frame.
- Focus follows the mouse only on pointer *motion* across a window edge. A window appearing under a
  still pointer isn't under it: KWin keeps the window it last entered.
- **Any stacking change during a motion (a raise) makes KWin re-enter at the stored position, and
  FFM takes it as "not moved": no focus, and the pointer counts as inside from then on.** Adding or
  removing an internal window is a stacking change: move such windows, never add/remove them.
- At an output crossing, `cursorPosChanged` comes first, `activeScreen` is already the new output,
  and FFM's activation comes the next turn.
- Over a decoration the pointer has no focus window (`InputDeviceHandler::updateFocus`): neither
  hover nor click focuses there unless a filter before the decoration filter does it.
- KWin updates no focus or decoration while a button is held (`focusUpdatesBlocked`).
- `DelayFocusInterval` 0 closes panel popups (KDE bug 511162).
- `InternalWindow`s count as clients (`isClient()` true): `windowUnderMouse` after a close counts
  them, and FFM focuses them at a stacking change. `Qt::Tool` holds `Qt::Popup`'s bit (KWin closes
  it as a popup). Asking a closed internal window for `hitTest` crashes KWin.

- A window has one `output` (the one holding most of it), but it is drawn wherever its frame
  reaches while it is on its own output's current desktop (`Window::isOnCurrentDesktop`,
  `window.cpp:817`; `WindowItem::updateVisibility`), and KWin's pointer hit test
  (`InputRedirection::findToplevel`, `input.cpp:3450`, 6.7.5) has no output test: a floating
  window reaching onto another output is under the pointer there.

## Keys (`xkb.cpp`, kglobalacceld)

- Shortcuts match the symbol the layout types; Shift is dropped when it made a non-letter symbol,
  kept on letters: Meta+Shift+1 is Meta+!, Meta+Shift+C stays (`modifiersRelevantForGlobalShortcuts`).
- `registerShortcut` on a taken key "succeeds" and both actions show the key, but a press runs only
  the active holder with the **lowest serial**; serials are given at first registration and kept
  in `~/.local/state/kglobalshortcutsstaterc` (Plasma's own actions beat a script's). An inactive
  holder (app not running) doesn't block. Freed from its holder, the key works at once.
- **A key filter ahead of `GlobalShortcut` wins a shared key without touching anyone's
  shortcuts**: the filters run in order and the first that takes an event ends it (6.7.5
  `input.h:154-166`; order `LockScreen`, `ScreenEdge`, `TabBox`, `GlobalShortcut`, `:367-372`), so
  a filter that takes the press and runs the script's action (`invokeShortcut`) keeps it from the
  holder with the lower serial (probe 91: stock Quick Tile Left and kwin-i3's Focus Left both on
  Meta+Left, the filter's press ran Focus Left). KWin's own shortcut filter skips while a window
  inhibits shortcuts (`waylandServer()->isKeyboardShortcutsInhibited()`, `input.cpp:1077-1084`):
  such a filter must too. **But a press kept from kglobalacceld breaks Meta alone**: its
  modifier-only state (Meta opens the launcher on release) resets only on a non-modifier key event
  reaching it (kglobalacceld 6.7.5 `globalshortcutsregistry.cpp:498-519`), and nothing a plugin can
  reach resets it (`GlobalShortcutsManager` isn't exported; 6.8.2 calls `KGlobalAccelD`
  directly). Taken outright, Meta+Left's release of Meta opened the launcher (probe 92); its
  release let through fixed only Left-up-first. What works on both versions: the filter sets the
  press's `key` to `Qt::Key_unknown` and lets it on (the shortcut filter passes `event->key` to
  kglobalacceld, 6.7.5 and 6.8.2 `input.cpp:1080`), so kglobalacceld resets and matches nothing;
  a second filter right after `GlobalShortcut` takes it (`addFilteredKey`) before any window
  sees it. Probe 92: no launcher in either release order, and no window got the key.
- **KWin 6.8 doesn't parent its `Scripting` object**: 6.7.5 creates it with the workspace as
  parent (`workspace.cpp:336`), 6.8.2 holds it in a `unique_ptr` (`:343`), so a search of the
  workspace's children finds no script and no script's actions there. Both register it at
  `/Scripting` and create each script as its child (`scripting.cpp:682`, `:868` / `:671`, `:816`):
  `QDBusConnection::sessionBus().objectRegisteredAt("/Scripting")`, a lookup in KWin's own process,
  finds it on both (the key override's table, P6's Arch run).
- **Filters of one weight run newest first**: `installInputEventFilter` inserts at the
  `lower_bound` of its weight (6.7.5 `input.cpp:2952`), so a plugin's filter at `TabBox` runs
  before KWin's own TabBox filter.
- `doRegister` of `<app>.desktop` then `invokeShortcut _launch` launches the app even with no
  `X-KDE-Shortcuts`.
- Window actions (`[MouseBindings] CommandAll*`) take exactly one modifier, Meta or Alt.
- On stock Plasma, Meta+R is Spectacle's region recording and Meta+D is Peek at Desktop.
- KWin names the layout `""` where the system sets none (Arch's default); its long name is still
  "English (US)".

## Scripting (`scripting.cpp`)

- `callDBus` converts arguments by `QJSValue::toVariant()` (`scripting.cpp:345`): no unsigned ints,
  no typed arrays, so typed methods (kglobalaccel's `a(ai)`, `Notify`'s `susssasa{sv}i`) are refused.
  It calls back only on a reply: on an error or a dead service it logs and never calls; guard with a timeout.
- `readConfig(key, def)` gives `def` only for a missing key: one present but empty reads as `""`
  (probed 2026-10-30), so an emptied text setting stays empty.
- `print()` goes nowhere readable on a desktop; read state through kwin-i3's dump (`docs/debugging.md`).
- A JS `Error().stack` stops at the nearest native boundary: in a signal handler it never shows who
  caused the signal.
- `var x` in the same scope as `function x()` overwrites the function.
- `workspace.screensChanged` is `Workspace::outputsChanged`, emitted at the end of every
  `updateOutputs` (6.7.5 `workspace.cpp:1490`), which runs on every applied output configuration
  (hotplug, geometry, scale, mode: `:541`). Inside it `updateOutputOrder` emits
  `screenOrderChanged` **first** (`:1422`), so a handler there sees a new output before
  `screensChanged` does; `screenOrderChanged` also fires alone (`:633`, `:691`).
- `currentDesktopChanged(previous, current, output)` is emitted after KWin has stored the new
  desktop (`virtualdesktops.cpp:588`): `currentDesktopForScreen` is current inside the handler.
- `workspace.createDesktop` is synchronous, tiles the new desktop at once, and **saves** the count
  to kwinrc. Removing a desktop renumbers the rest. With per-output desktops off, `setCurrent`
  switches every output.
- KPackage caches the script list at KWin's first look: a package linked after KWin started is
  never seen until a login. KWin rescans on every `Scripting.start` / reconfigure and **unloads** a
  listed package that isn't enabled.
- KWin 6.7.5's generic script config form (`kcm_kwin4_genericscripted`) saves and tells KWin
  nothing; kwin-i3 has no such form (its metadata names its own page for the cog).
- Live recovery: a one-off script via `loadScript` + `start` + `unloadScript`; a bad `loadScript`
  path still registers a name (unload it).
- A declarative (QML) script's `KNotification` does reach Plasma; the desktop portal refuses KWin as
  a caller (`/proc/<kwin>/root` unreadable).

## Config and D-Bus

- **`reconfigure` returns before the script is loaded again**: `isScriptLoaded` called at once
  after an `unloadScript` and a `reconfigure` says `false`; a moment later, `true`. The reload's
  check waits for it (polling a few times over a second), never reading the first answer.

- **A plugin's KConfigWatcher key changes only with `kwriteconfig6 --notify`**: a plain write plus
  `reconfigure` doesn't reach it, and the watcher then ignores a later `--notify` of the same value.
  `--notify` itself can lose its signal under load or on a slow machine: tests send it with
  `gdbus emit` (`tests/live/lib.sh` `set_layouts`).
- A plugin's config subscriptions must be the plugin's own, not KDE's shared `KConfigWatcher`
  (a live KWin crash, `tests/live/64-plugin-reload.sh`).
- KWin's drop-in `Environment=QT_PLUGIN_PATH` *replaces* the session's, and apps KWin launches
  (global-shortcut launches) inherit KWin's environment.
- Read-only live window list: `busctl --user call org.kde.KWin /WindowsRunner org.kde.krunner1 Match
  s <text>` for ids, then `org.kde.KWin getWindowInfo s <uuid>`.
- busctl's JSON for `a(ai)` nests each sequence one level deeper (`[[k,0,0,0]]`).
- **KWin's `reconfigure` loads an effect switched on in `[Plugins]` but doesn't unload one
  switched off** (`EffectsHandler::reconfigure` is `queryAndLoadAll`): unload it over D-Bus
  (`/Effects` `unloadEffect`), as Plasma's Animations page does. That page's rows are effect
  groups (`X-KWin-Exclusive-Category`, or `exclusiveGroup` in a built-in's metadata), "None" being
  all of a group off; 6.7.5: open/close scale (on), glide, fade; maximize; minimize squash (on),
  magic lamp; full screen; desktop switching slide (on), fade desktop; peek at desktop window
  aperture (on), eye on screen.
- **Turning `PerOutputVirtualDesktops` off is not a plain revert**: it sets every output's current
  desktop to the active output's (6.7.5 `virtualdesktops.cpp:984-998`, 6.8.2 `:990-1003`). Turning
  it on is harmless; both take effect at once.
- The screen-edge drag's tile and maximize are kwinrc `[Windows] ElectricBorderTiling` and
  `ElectricBorderMaximize` (both on by default), not `[ElectricBorders]`. Shift held at a move's
  release quick-tiles the window into a custom tile (6.7.5 `window.cpp:1108`, 6.8.2 `:1095`), with
  no setting to turn it off.
- A focus stealing prevention level of Medium or above stops a new window taking focus
  (`workspace.cpp:931-934`: activated if `mayActivate` or the level is Low or None).
- **A script can write KWin's live options, and kwinrc stays as it is** (probe 93, 6.7.5):
  `options.focusPolicy` (an enum, by number: 0 click, 1 follow mouse), `delayFocusInterval`,
  `nextFocusPrefersMouse`, `focusStealingPreventionLevel`, `electricBorderTiling` and
  `electricBorderMaximize` each hold when written. A `reconfigure` sets every one back to kwinrc's
  (`Options::updateSettings`, `options.cpp:657`) and then emits `options.configChanged`, where a
  script writes them again. Under click to focus the focus delay is forced to 0
  (`setDelayFocusInterval`, `options.cpp:221-224`): write the policy before the delay. Under
  FocusUnderMouse or FocusStrictlyUnderMouse the focus stealing level is forced to None
  (`options.cpp:334-336`): write the policy first. The window actions likewise (probe, 6.7.5):
  `commandAll1` written holds and a reconfigure puts kwinrc's back. It is a `MouseCommand` by
  number (`options.h:456-484`): 12 is "Activate, raise and move", 11 the restricted move;
  `keyCmdAllModKey` has a WRITE too. Disabling a script on the KWin Scripts page reconfigures
  nothing (`kcms/scripts/module.cpp` `save` calls `/Scripting start`), so what it wrote stays live
  until the next reconfigure.

## Plugins and effects (`plugin/`)

- Both plugins are version-locked to the installed KWin, which refuses a stale build after an update.
- A plugin reloaded (an install, KWin's own effect reload) starts with nothing the script told the
  last instance (the saved trees, the floating set, the bars): each asks a reconfigure at load,
  and the script compares Stats with what it told and tells it again (`checkFrame`). A script
  that tells only what changed never repairs a loss on its own.
- An effect's paint hooks run only while its `isActive()` says so: anything it draws (kwini3hold's
  ring, a group's bar) must keep it active, or it silently draws nothing (the bar was missing in
  the looks without a ring until a shown bar counted).
- A held snapshot is drawn at the window's old frame (the paint data's translate and scale), so
  anything drawn relative to that window must use its old values too until the hold releases.
- **What an effect draws in `paintWindow` follows only the paint data** (translate, scale,
  opacity). An `OffscreenEffect` (Glide, Wobbly, Magic Lamp, Fall Apart) renders the window's
  item tree into a texture sized to `expandedGeometry` and draws it on its own deformed quads
  (6.7.5 `offscreeneffect.cpp:109-143`, `:236-261`; Glide's matrix `glide.cpp:109-151`), which no
  other effect can read. A child item of the window's `WindowItem` goes into that texture and
  deforms with the window: an `OutlinedBorderItem` (exported, in 6.7.0 and 6.8.2) around the
  frame, outside it, widens `expandedGeometry` by its thickness and tilts whole under Glide
  (probe 90, test KWin with `KWIN_EFFECTS_FORCE_ANIMATIONS=1`). The renderer draws only its own
  item types (image, outlined border, surface, decoration, shadow): a subclass of `Item` draws
  nothing. Such an item is the effect's to own and delete (an `Item` deletes no child), and a
  change to it must be told as the window's damage, or an offscreen effect keeps drawing its stale
  copy (`offscreeneffect.cpp:73-74`); and it can't match the ring's device-pixel edges at a
  fractional scale nor its square corners. So kwini3hold draws no ring while Glide opens a window
  (`behaviour.md` L18), seen by an item effect on the window item (`Item::hasEffects`, held from
  Glide's `windowAdded` to its last frame).
- **The Animations page's exclusive groups are the page's only** (6.7.5
  `kcms/common/effectsmodel.cpp:193-194`):
  KWin's loader loads two of Scale, Glide and Fade side by side if `[Plugins]` says so, and the
  first to take a window's add grab animates it.
- KWin's exported CMake targets name `Qt6::Widgets` (`KWinTargets.cmake`): a plugin that uses no
  widget still finds the component, or its configure fails (2026-10-30).
  Unloading one in a running KWin leaves its library loaded: anything it connected must end with it.
  A filter left installed after its object dies crashes KWin on a later mouse move; only a relogin
  cleans it. Never install filters in a destructor.
- **Input filter order** (`/usr/include/kwin/input.h`): … TabBox, GlobalShortcut, Effects, …,
  Decoration, WindowAction … A filter at Effects never sees a bound key; key filters that must see
  shortcuts go before GlobalShortcut. An InputEventFilter can't hold an event and replay it.
  A filter ahead of yours can take a button's release (the lock screen), so a grab ended only by
  that release never ends: KWin updates the held buttons before running the filters
  (6.7.5 `pointer_input.cpp:302`, then `:317`), so the next event's `buttons` tells it was lost.
- **KWin scissors no effect's own GL draws** (`itemrenderer_opengl.cpp` enables the scissor only
  inside `renderItem`): an overlay drawn in `paintWindow` or `paintScreen` must clip itself to the
  paint's `deviceRegion`, or a partial repaint blends it again over pixels already holding it.
- A blocking D-Bus call in a plugin stalls the whole compositor: only async calls.
- An effect's override cursor shows only while it holds the mouse (`startMouseInterception`); then
  the effects filter takes pointer events before Decoration-order filters. Overview, Grid and
  Window View (`QuickSceneEffect`) hold it the whole time they run (`quickeffect.cpp` 6.7.5:564,
  released at 637), so kwin-i3's Meta+click drag and resize never see a click under them.
- An effect's paint hooks stop once `isActive()` is false: resets go on signals.
- An effect with no `requestedEffectChainPosition` sits at 0, before Slide (50), and draws with data
  Slide never offset.
- `CrossFadeEffect::redirect` snapshots synchronously through the active chain: an active CrossFade
  subclass must bypass itself while snapshotting or the snapshot is blank.
- `OffscreenQuickView` is exported but 6.7.5 gives no texture access: only a `QuickSceneEffect` can
  draw a scene; otherwise upload a QPainter image as a `GLTexture`.
- A GL texture is freed only where GL is current (mark stale, clear in the paint). A QHash copy
  detaches on write (two copies of held refs: a use after free).
- Corners: KWin rounds a window only from its decoration's radius (reset on every `setDecoration`);
  a plugin can call `Window::setBorderRadius`. `ShaderTrait::Border` rounds the outer edge by the
  thickness even at radius 0. Breeze's radius is fixed (5 px) and Breeze draws a 1 px outline
  *outside* `frameGeometry`.
- An effect-only repaint of a small strip can stay stale on NVIDIA monitors while KWin paints it
  right (screenshots look clean; cause below the compositor): tie visual changes to repaints that
  happen anyway, no timer-driven animations.
- Qt's single-shot QTimer is coarse (±5 %). `useractions.h` isn't buildable from the devel headers.
- A plugin can see modifier releases via `InputRedirection::keyboardModifiersChanged` (`input.h:273`); the helper doesn't use it.
- kconfig_compiler: a newline inside a kcfg `<default>` isn't safe.

## KWin 6.8 (found on Arch's 6.8.2, 2026-10-29)

- `Effect::paintScreen`, `paintWindow` and `drawWindow` return `bool` (`[[nodiscard]]`): false
  when painting failed (a GPU reset), and the effect then stops at once (`effect/effect.h`).
  No header macro gives KWin's version; CMake's `find_package(KWin)` sets `KWin_VERSION`.
- `GLShader::setUniform(QColor)` premultiplies RGB by alpha (`glshader.cpp:465`; 6.7.5 passed it
  as is, `:478`): blend a translucent uniform colour with `GL_ONE`, not `GL_SRC_ALPHA`.
- ScreenShot2 sends QImage format 16 (RGBX8888, bytes R,G,B,X) where 6.7 sent ARGB32 (B,G,R,A),
  and no longer checks the caller's permission in the D-Bus interface itself.
- Plasma's X11 session is gone. On Arch, `plasma-meta` pulls in Plasma Login Manager but enables
  no service: SDDM stays until switched by hand.
- `kwin_wayland --virtual` needs a GPU render node in 6.8: with none it logs "Found no render
  device!" and runs with compositing off (supportInformation: "Compositing is not active"), and
  no window is ever resized to its tile, only placed (a container with no `/dev/dri`, 2026-10-30:
  10-tiling 18 of 33 red). Arch's `kwin_wayland` carries `cap_sys_nice=ep`, which rootless podman
  won't exec. Both handled in `tools/box.sh`.
- plasmawindowed (the widget in a window, 67) resizes itself once just after it tiles, to its whole
  row of thumbnails (4936 px wide at x -548); kwin-i3's refit puts it back within milliseconds. A
  test reading its geometry waits for it back in its tile (2026-10-31; 6.7 doesn't).
- The window actions' stock defaults change: `[MouseBindings] CommandAll1` is `Activate, raise
  and move` and `CommandAll3` `Activate, raise and resize` (`kwin.kcfg:49,55`; the latter new,
  `options.cpp:843`), where 6.7.5 has `Move` and `Resize`: a floating window moved with Meta+left
  takes the focus on 6.8, as i3's (`click.c:274`), and keeps the old focus on 6.7.

## Plasma

- **The desktop style's ComboBox measures every entry on each count change** (qqc2-desktop-style
  `org/kde/desktop/ComboBox.qml:46-52`, to size its popup): a box with a few hundred entries costs
  ~35 ms to build, every such box on a page at once. The settings page gives a rule's application
  box its list only while in use (`kcm/ui/WindowRules.qml`); a shared C++ model doesn't help.
- **kcmutils' `SettingStateBinding` is a `Loader`** (kcmutils 6.31 `SettingStateBinding.qml:25`):
  its `parent` is the control it sits in, so `settingName: parent.settingName` works only where
  that control declares `settingName`; inside a stock ComboBox or SpinBox it names no setting (a
  "Unable to assign [undefined]" warning, no highlight). Name the row by its id.
- **A KWin script's cog loads its `X-KDE-ConfigModule` with the script's metadata** (KCMUtils 6.19
  `kpluginmodel.cpp:41-58` `findConfig`: the script's raw JSON paired with the plugin's file), so
  a QML KCM loaded that way looks for `qrc:/kcm/<the script's id>/main.qml` and shows "Could not
  find resource". `kcm/kcm.cpp` `ownMetaData` reads its own from the plugin's file (an offscreen
  `KCMultiDialog` probe: red before, green after).
- **Kirigami's FormLayout stacks every label above its control** once its widest label plus its
  widest row no longer fit: one long label (or one wide row) anywhere in the form does it to every
  row. A form of short settings and a wide table is two FormLayouts, each fitting alone.
- `kcmshell6` logs to the journal unless `QT_FORCE_STDERR_LOGGING=1`; with
  `QT_MESSAGE_PATTERN="%{time process} %{message}"` and `console.warn` in the QML it times a page's
  build, from a worktree's build put first in `QT_PLUGIN_PATH`.

- plasmashell's panel configuration view is a layer-shell surface in scope `dock`; the desktop view
  `desktop`; the edit-mode toolbar is QML inside the desktop view. "Show Panel Configuration" is
  libplasma's `configure` action.
- A *floating* panel switched to a no-strut visibility mode moves the work area only at its next
  surface commit (`behaviour.md` Y1).
- Wrapping a Kirigami `FormLayout` control in a `RowLayout` moves its label off it; give the control
  its own `Accessible.name` and the label `buddyFor` (Kirigami 6.31 sets `labelledBy` on the row).
- Effects treat Keep Above windows apart, so with kwin-i3 every floating window (`behaviour.md`
  L12): Dim Inactive leaves them undimmed unless its "Keep above windows" (`DimKeepAbove`) is
  ticked, off by default (6.7.5 `diminactive.cpp:184`, `diminactive.kcfg:17-18`); Slide Back
  neither slides them nor slides others away from them (`slideback.cpp:94`, `:167`, `:307`).
- xwaylandvideobridge's idle window ("Wayland to X Recording bridge") takes pointer input it should
  pass through (KDE bugs 525007, 524544): a resize grab there moves nothing. kwin-i3 leaves it as the
  distribution ships it (a keep-below workaround was declined).
- On NVIDIA (a driver with kernel suspend notifiers), waking from suspend can
  reset the GPU: the kernel logs `nvidia-drm … Failed to register auto-value-update`, and seconds
  later Firefox logs `[GFX1-]: Handle DeviceReset` and redraws its windows from scratch, a flash on
  every screen it fills. Below the window manager, i3's too: a capture with "flash" just after
  `PM: suspend exit` in `journalctl -b` and kwin-i3's log quiet is this (2026-10-30; 1 in 8
  resumes that boot).
- **Plasma 6.8's OSDs (volume, brightness) can show cut off**, their top part only: plasmashell
  sizes the OSD's own surface too short (KDE bug 527636, since 6.8.0, often after an output
  change or a resume; the candidate fix is plasma-workspace MR 7278). A capture taken while it
  shows has the OSD as an override-redirect `org.kde.plasmashell` window with `client=` equal to
  `frame=` and a height at its minimum (278x20 on 6.8.2), with nothing in kwin-i3's log for it:
  this bug, not kwin-i3 (2026-11-07).
- The logout screen (`org.kde.LogoutPrompt`, the global theme's `logout/Logout.qml`; Breeze in
  plasma-workspace 6.7.5): `promptLogout`, `promptShutDown` and `promptReboot` show that one action
  and Cancel, and **do it unasked after a 30 s countdown**; `promptAll` shows every action (Sleep
  and Hibernate only where the machine can, `spdMethods`), with no countdown, Shut Down focused.
  Escape or a click outside cancels. Read from the source, 2026-10-31.

## The test KWin (`tools/testkwin.sh`)

- Focus follows the mouse there: a pointer left over where windows are being laid out hands
  KWin's focus to whatever lands under it (a tab hidden by the time of the check, once: shown
  while its group was being built), and the next key acts from there. Park it (`point 20 20`)
  before building a layout a check depends on. A settled group never does it: with the pointer
  anywhere over `T[f V[g]]`, a window h opened into V took f into its tile behind it, f stayed
  lowest in the stacking and KWin activated only h (probe, branch `probe-hidden-tab`).
  A floated window's ring is the window beneath it to KWin's hover: a pointer that never moved,
  left where a floated container's ring lands (the screen's centre is the seam of a floated
  two-window split), activates that window at the next stacking change (the raise of a focus
  pass inside the container). Moved onto the ring, the helper focuses the ring's window (§9 F2).
- It runs no animations: on its software renderer `animationsSupported()` is false, so Scale,
  Glide, Slide and the rest don't load, unless `KWIN_EFFECTS_FORCE_ANIMATIONS=1` is set (6.7.5
  `effect/effecthandler.cpp:1415-1423`). Its screenshots render the whole scene, so a missed
  repaint never shows there either: a bug in what the screen repaints is seen only live.
- It has two outputs, and an empty workspace other than 1 may open on Virtual-1: a probe of what
  stays on one monitor (a sticky window's push) switches to a workspace shown on that monitor
  (3 from 1), not to 2.
- A scenario's bare `wait` waits for every background job, the test clients too, which never
  exit: the run times out at 110 s. Wait on the one PID (`held=$!`, `wait "$held"`).

- Its KWin logs to the user journal as `kwin_wayland`, with its own PID, and most of its lines
  don't name the test (a scenario's "No such object path '/kwini3hold'" while the effect loads):
  read the live KWin's lines by its PID (`.claude/commands/sessionstart.md`).
- `tools/a11y.py box` finds a control only among the rows a list view has created: one far down
  a long list (the Keys page's End session) isn't there until the list scrolls near it, so `box`
  says "no control named". Set the page's scroll bar first (`a11y.scroll_bars`), then `box`
  (2026-10-31).
- It inherits the starting shell's environment: over ssh there is no `XDG_CURRENT_DESKTOP=KDE`, so Qt
  loads no KDE platform theme (other fonts and style, a 36 px title bar). `testkwin.sh` sets the
  session variables.
- Its private bus starts no services; kglobalaccel runs inside KWin. plasmashell runs if
  `/usr/libexec/kactivitymanagerd` is started first, and is driven with
  `busctl --user call org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell evaluateScript s '...'`
  (panel `hiding`: none, autohide, dodgewindows, windowsgobelow; `shell/scripting/panel.cpp:321`).
- It can be recorded: KWin refuses `zkde_screencast_unstable_v1` only to sandboxed clients
  (6.8.2 `wayland_server.cpp`, `restrictedInterfaces`), so a plain client gets a PipeWire node
  (`tools/video/screencast.c`). The stream sends a frame per repaint, none while nothing changes,
  so a recording stops at the last change; GStreamer's `-e` file is finished only on SIGINT.
- With its private config empty, apps draw dark text on a dark palette until a colour scheme or
  look-and-feel is applied (`plasma-apply-lookandfeel -a org.kde.breezedark.desktop`).
- A launch through kglobalaccel (Meta+Return's terminal) inherits KWin's own environment, `HOME`
  and working directory included, not the caller's (`tools/video/record` sets both before
  `testkwin.sh`).
- `org.kde.kwin.Scripting.loadScript` is overloaded (`s`, `ss`): dbus-python's introspection picks
  `s` and aborts on two arguments; pass `signature="ss"`.
- It renders on the real GPU: antialiased pixels differ by vendor (an arc pixel: NVIDIA 55,48,48,
  AMD 68,33,33).
- `kscreen-doctor output.X.enable` leaves the returning output primary; set `output.X.priority.2` with it.
- A test under focus-follows-mouse can't park the pointer without moving the focus there.
- `ei-send` must ping/pong after each command (libei) or the disconnect beats the events; keep the
  10 ms pace, drags need it. `ei-send` has no scroll verb.
- alacritty reads `~/.config/alacritty` whatever `XDG_CONFIG_HOME` says (tests pass
  `--config-file /dev/null`).
- A worktree has no plugin build: `make plugin` in it, or the plugin scenarios skip silently. A test
  KWin with the plugins needs `KI3_PLUGIN=plugin/build/bin`, or every look falls back to title bars.
- ECM with no version picks Qt 5 wherever Qt 5's cmake files exist, and a failed configure leaves
  `plugin/build` caching it (delete it).
- kwin-i3 decides "no effect" one second after load, with a layout pass: a test that counts passes
  waits for the `FRAME` log line first.
- Real i3 runs off-screen for a comparison: Xvfb + i3 + xterm.
- The journal mixes test KWins' lines with the live one's: split by `_PID=$(pgrep -xo kwin_wayland)`.
- zsh doesn't split an unquoted variable (a scenario list in one variable runs as one name), and
  has no `${!name}`: a script using either runs under `bash -c`.
- The scenarios hide their tools' errors (`>/dev/null 2>&1`): a tool missing from a container shows
  only as a check failing ("the second monitor is gone"). Arch's kwin pulls in kscreen-doctor,
  plasmawindowed, gdbus and kpackagetool6; PikaOS's doesn't (`tools/box/Containerfile.pika`). A red
  only in one container: `command -v` its tools first (2026-10-31).
- `check "msg" VAR=x cmd` in a live test runs `VAR=x` as a command: wrap it in a function.
- **gdb on KWin**: `kwin_wayland` has `cap_sys_nice`, so it isn't dumpable and refuses `gdb -p`
  (ptrace_scope 0 or not), and a copy without the capability aborts (no Qt platform plugin from
  another directory). Start it under gdb instead: exec under ptrace drops file capabilities. For a
  probe, `testkwin.sh`'s `kwin_wayland` as `gdb -q -batch -x CMDS --args kwin_wayland`, with
  `set breakpoint pending on`, a `break KWin::...` with `commands` / `bt 30` / `continue`, then
  `run`; the stacks land in `$KI3_TMP/kwin.out`. `libkwin`'s exported names are enough (probe 99).
- The same non-dumpable flag refuses `/proc/PID/smaps_rollup`; `/proc/PID/status` (VmRSS, RssAnon,
  RssFile, RssShmem) and `/proc/PID/stat` still read. The test log (`$KI3_LOG`) has whole seconds:
  the milliseconds are only in kwin-i3's in-memory log (A capture).
