# KWin as found: the traps

What KWin 6.7.5 (and Plasma around it) actually does where it surprised us, read from its source
or probed in the test KWin. Each line cost a session or more to find. Read the section for the
part of KWin you are about to touch before you touch it. kwin-i3's *answer* to each lives in
`behaviour.md` or the spec named; this page is KWin's side only.

Sources: KWin's source for the installed version (`rpm -q kwin` / `pacman -Q kwin`, then
`invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`; `git clone --depth 1 --branch v6.7.5`
works too). Plasma 6.8 (KWin's X11 code removed) is not yet lived through: anything here may
change there (`OPEN.md` item 50). Add a line when you find one; correct a line in place.

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
- Padding is one number per tile (`tile.h:33`). `windowGeometry` gives an edge at the screen's
  border (relative 0 or 1) the full padding, others half (`tile.cpp:171-178`). Edges are rounded to
  whole logical pixels first, so an odd padding puts every window on a half pixel (text shifts on
  redraw). A padded tile has no anchors, so apps are never told "tiled".
- App minimum sizes exclude the decoration.

## Windows and Wayland clients (`window.cpp`, `xdgshellwindow.cpp`)

- **A hidden Wayland window (its desktop not current on its output) gets no frame callbacks, never
  acknowledges a configure, and KWin applies no size change to it until it does.** Never ask a
  hidden window for a new size. A hidden Electron client never acks a move either: `sendToOutput`
  is then a no-op forever.
- A same-size move is applied synchronously inside the caller (`moveResizeInternal`); a resize waits
  for the client's commit, so a check right after a resize reads the old frame.
  `frameGeometryAboutToChange` fires first either way, even when nothing changes. Windows of one
  layout change land 2-13 ms apart (240 Hz monitor).
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
- A Wayland transient is type `Normal` (check `isDialog` / `isModal` / `transientFor`).
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

## Activation and focus (`activation.cpp`, `workspace.cpp`)

- `addWaylandWindow` activates every new window (focus stealing Low) **before** scripts get
  `windowAdded`; `activateWindow` switches that output's desktop first (SwitchToOtherDesktop): a
  capture shows SHOWN, ACTIVE, ADD within 2 ms. A script can hand focus back synchronously from the handler.
- `activateWindow` activates a window's modal dialog in its place (`findModal`): the parent never
  gets `windowActivated`.
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
- `Workspace::switchToOutput` focuses a window on that screen (or the desktop); it doesn't move the pointer.
- A brand-new output shows `initialDesktopForNewOutput`: the activity's last desktop for it, else 1.

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

## Keys (`xkb.cpp`, kglobalacceld)

- Shortcuts match the symbol the layout types; Shift is dropped when it made a non-letter symbol,
  kept on letters: Meta+Shift+1 is Meta+!, Meta+Shift+C stays (`modifiersRelevantForGlobalShortcuts`).
- `registerShortcut` on a taken key "succeeds" and both actions show the key, but a press runs only
  the active holder with the **lowest serial**; serials are given at first registration and kept
  in `~/.local/state/kglobalshortcutsstaterc` (Plasma's own actions beat a script's). An inactive
  holder (app not running) doesn't block. Freed from its holder, the key works at once.
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
- `print()` goes nowhere readable on a desktop; read state through kwin-i3's dump (`docs/debugging.md`).
- A JS `Error().stack` stops at the nearest native boundary: in a signal handler it never shows who
  caused the signal.
- `var x` in the same scope as `function x()` overwrites the function.
- `workspace.createDesktop` is synchronous, tiles the new desktop at once, and **saves** the count
  to kwinrc. Removing a desktop renumbers the rest. With per-output desktops off, `setCurrent`
  switches every output.
- KPackage caches the script list at KWin's first look: a package linked after KWin started is
  never seen until a login. KWin rescans on every `Scripting.start` / reconfigure and **unloads** a
  listed package that isn't enabled.
- KWin 6.7.5's generic script config form saves and tells KWin nothing.
- Live recovery: a one-off script via `loadScript` + `start` + `unloadScript`; a bad `loadScript`
  path still registers a name (unload it).
- A declarative (QML) script's `KNotification` does reach Plasma; the desktop portal refuses KWin as
  a caller (`/proc/<kwin>/root` unreadable).

## Config and D-Bus

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

## Plugins and effects (`plugin/`)

- Both plugins are version-locked to the installed KWin, which refuses a stale build after an update.
  Unloading one in a running KWin leaves its library loaded: anything it connected must end with it.
  A filter left installed after its object dies crashes KWin on a later mouse move; only a relogin
  cleans it. Never install filters in a destructor.
- **Input filter order** (`/usr/include/kwin/input.h`): … TabBox, GlobalShortcut, Effects, …,
  Decoration, WindowAction … A filter at Effects never sees a bound key; key filters that must see
  shortcuts go before GlobalShortcut. An InputEventFilter can't hold an event and replay it.
- An effect's override cursor shows only while it holds the mouse (`startMouseInterception`); then
  the effects filter takes pointer events before Decoration-order filters.
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
- The helper sees modifier releases via `InputRedirection::keyboardModifiersChanged` (`input.h:273`).
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

## Plasma

- plasmashell's panel configuration view is a layer-shell surface in scope `dock`; the desktop view
  `desktop`; the edit-mode toolbar is QML inside the desktop view. "Show Panel Configuration" is
  libplasma's `configure` action.
- A *floating* panel switched to a no-strut visibility mode moves the work area only at its next
  surface commit (`behaviour.md` Y1).
- Wrapping a Kirigami `FormLayout` control in a `RowLayout` moves its label off it; give the control
  its own `Accessible.name` and the label `buddyFor` (Kirigami 6.31 sets `labelledBy` on the row).
- xwaylandvideobridge's idle window ("Wayland to X Recording bridge") takes pointer input it should
  pass through (KDE bugs 525007, 524544): a resize grab there moves nothing. Paul leaves it as Fedora
  ships it (2026-10-27; a keep-below workaround was declined).

## The test KWin (`tools/testkwin.sh`)

- It inherits the starting shell's environment: over ssh there is no `XDG_CURRENT_DESKTOP=KDE`, so Qt
  loads no KDE platform theme (other fonts and style, a 36 px title bar). `testkwin.sh` sets the
  session variables.
- Its private bus starts no services; kglobalaccel runs inside KWin. plasmashell runs if
  `/usr/libexec/kactivitymanagerd` is started first, and is driven with
  `busctl --user call org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell evaluateScript s '...'`
  (panel `hiding`: none, autohide, dodgewindows, windowsgobelow; `shell/scripting/panel.cpp:321`).
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
- zsh doesn't split an unquoted variable (a scenario list in one variable runs as one name).
- `check "msg" VAR=x cmd` in a live test runs `VAR=x` as a command: wrap it in a function.
