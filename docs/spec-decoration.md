# Spec: kwini3frame, the i3 frame as a KDecoration3 plugin

Decided by Paul, 2026-10-23. Status: **revision 3, 2026-10-23, after reviews 1 and 2
(`docs/review-decoration-2026-10-23.md`, `docs/review-decoration-2-2026-10-23.md`; every finding
folded in below, marked "R1-n" / "R2-n"). Review 2 confirmed the R1 fold-in and found two bugs in
the focus mechanism, both fixed here. Ready for code unless Paul wants a third review.** Not live
until Paul says go.

Sources: KDecoration, KWin and Breeze at v6.7.5 (`invent.kde.org`), kcoreaddons 6.31.0, i3 `next`
`src/click.c`. The Aurorae findings are the dotfiles session's (2026-10-23).

## The problem

The 1 px frame is the Aurorae theme `i3frame` (dotfiles, `plasma/.local/share/aurorae/themes/i3frame`,
i3's `default_border pixel 1`). Three things come with it that i3 never had:

1. **A resize cursor and an edge drag on the 1 px line.** KDecoration's library turns the border
   strip into resize sections (`decoration.cpp` `Decoration::Private::updateSectionUnderMouse`,
   called from `hoverEnterEvent`, `hoverMoveEvent` and `mouseReleaseEvent`); KWin maps the section
   to a gravity (`window.cpp` `Window::mouseGravity`) and a cursor (`Window::updateCursor`), and a
   left press the decoration leaves unaccepted starts a delayed move or resize
   (`Window::processDecorationButtonPress`, from `input.cpp` `DecorationEventFilter::pointerButton`).
2. **A move from the top 1 px**, which Aurorae reports as the title bar.
3. **An invisible resize-only strip of about 8 px above every window** (Aurorae
   `v2/decoration.cpp` `updateResizeOnlyBorders`), inside the bottom of the window above: the
   cursor flip between tiled windows. `BorderSize=None` makes it all four sides.

No theme key switches any of it off. The only gate KWin has is `isResizable()`, which is what
decides tiling, so a window rule is out.

## Decision

**The frame starts nothing from the pointer**: no resize, no move, no menu, no double-click action,
the arrow cursor everywhere on it. Resize is Meta+right-drag (KWin's stock `CommandAll3`) and the
Meta+Ctrl keys; move is Meta+Shift+drag (kwini3mouse) and the Meta+Shift keys. A floating window
resizes only by Meta+right-drag and the keys (Paul asked; accepted). The read-back after an
interactive resize (`readBack`, `src/kwin.js`; 51-input) stays: it serves Meta+right-drag.

**Focus on the frame follows i3** (Paul, 2026-10-23: "since we are trying to mimic i3 ... follow
that precedent"). In i3 (`src/click.c` `route_click`) the border is part of the window for focus:
the pointer entering it focuses under focus-follows-mouse, and any click on it focuses and, for a
floating window, raises (`con_activate`, step 3). KWin treats a decoration as no window at all for
pointer focus (`input.cpp` `InputDeviceHandler::updateFocus`: over a decoration the focus window is
null; R1-1), so neither hover nor click on the line focuses today under Aurorae either, and the
decoration API has no way to ask for activation. The frame itself stays "nothing"; **kwini3mouse**,
which already runs before KWin's decoration filter, does the focusing (below).

**Deliberate break from i3, like the nested boxes** (`docs/spec-nested-boxes.md`): no resize by
dragging the border (i3's `tiling_resize`, `click.c` step 10) and no move or resize of a floating
window from its border (steps 5 and 6). That is what Paul wants gone.

## What the frame is

The theme as it is today: a square **1 px border on all four sides of every decorated window**,
`#4c7899` on the active window, `#333333` on the rest; no title bar, no buttons, no rounding, no
shadow (the theme's `decoration.svg` has no shadow elements, so none now, none after; R1-12).
Kept at screen edges and when maximized (i3's `hide_edge_borders none`; Breeze drops them there;
Aurorae's `TitleEdgeTopMaximized=0` drops the top one on a KWin-maximized window today, so that
case changes, welcome; R1-12). The border is **1 device pixel at any scale**:
`KDecoration3::snapToPixelGrid(1, window()->nextScale())`, recomputed on `nextScaleChanged`, as
Breeze does (`breezedecoration.cpp:465, 418, 253`; R1-5). At Paul's scale 1 that is 1 logical px.
Fullscreen windows have no decoration (KWin's doing, as now). Firefox uses it too
(`browser.tabs.inTitlebar=0`). Clients that draw their own decoration (GTK with CSD) are untouched.

The plugin ignores `settings()->borderSize()`: the frame is 1 px whatever kwinrc says. The
`[org.kde.kdecoration2] BorderSize=Tiny`, `BorderSizeAuto=false` keys stay (harmless, and they keep
Breeze tolerable if KWin ever falls back to it). The stale `theme=__aurorae__svg__i3frame` key is
ignored without a `themes` entry in our metadata (`decorationbridge.cpp` `findTheme`); delete it at
retirement (R1-8).

## How: the decoration (KDecoration3 API, 6.7.5)

One class, `KWinI3::Frame : public KDecoration3::Decoration`, in `plugin/frame.cpp` + `frame.h`,
about 80 lines, plus `frame.json` and a CMake target.

- **Factory**: `K_PLUGIN_FACTORY_WITH_JSON(FrameFactory, "frame.json", registerPlugin<KWinI3::Frame>();)`
  (Breeze's pattern, `breezedecoration.cpp:37`). KWin creates one `Frame` per decorated window
  (`decorationbridge.cpp` `createDecoration`: `create()`, then `init()`), on Wayland before the
  window's first configure, so the first configure already carries the borders
  (`xdgshellwindow.cpp:1625-1629, 803-806`; R1-6). The constructor is `explicit Frame(QObject
  *parent, const QVariantList &args)`, passed to the base; all setup is in `init()`, which returns
  `bool` (true).
- **`init()`**: `setBorders(QMarginsF(b, b, b, b))` with `b = snapToPixelGrid(1, window()->nextScale())`,
  again on `window()->nextScaleChanged` (double-buffered state, `decoration.cpp:379`);
  `setTitleBar(QRectF())`; `setOpaque(true)` (the fill covers every device pixel of the four border
  parts, which KWin sizes rounded, `decorationitem.cpp:113-115`; R1-5); `resizeOnlyBorders`
  untouched (default zero, `decoration.cpp:388`); no `setShadow`, `setBorderRadius`,
  `setBorderOutline` (defaults: none, 0, null). Connect `window()->activeChanged` to
  `qOverload<>(&Decoration::update)` (`update` is overloaded; R1-6). The borders never otherwise
  change, so none of Breeze's `recalculateBorders` triggers (border size, font, maximized, adjacent
  edges) apply.
- **`paint(QPainter *p, const QRectF &repaintArea)`**: `p->fillRect(repaintArea, colour)`, nothing
  else. KWin renders the decoration as four border parts, each clipped to its strip
  (`decorationitem.cpp:140-151`, `window.cpp` `layoutDecorationRects`; the X11 path uses the same
  renderer, shadow and blur are separate and unset), so a full fill is exactly the border, exact
  at any scale and at the corners; a stroked 1 px rectangle straddles the device pixel grid at
  scale 2 and is 1.25 px wide at 1.25 (R1-5). `repaintArea`, not `rect()`: at a fractional window
  size `rect()` can leave one translucent pixel (R2-4). No transparent pre-fill (KWin clears with
  `Source` first; R1-6). `snapToPixelGrid` is in `<KDecoration3/ScaleHelpers>`; `setBorders` on a
  scale change goes through the double-buffered state, so it can't race the configure (R2-4).
  Colour from `window()->isActive()`, hard-coded hex, no palette (the theme's colours are literal
  too). While kwini3hold holds a snapshot, the held frame keeps its old colour until the hold ends;
  not a bug, and no test asserts colour during a hold (R1-6).
- **The section never changes.** `sectionUnderMouse` starts as `Qt::NoSection`
  (`decoration.cpp:184`); its only writers are `updateSectionUnderMouse` (called from the base
  `hoverEnterEvent`, `hoverMoveEvent`, `mouseReleaseEvent`: `decoration.cpp:569, 599, 635`) and the
  base `hoverLeaveEvent` (sets NoSection, harmless); KWin only reads it (R1-3). Override **all six
  pointer handlers** (`hoverEnterEvent`, `hoverLeaveEvent`, `hoverMoveEvent`, `mouseMoveEvent`,
  `mousePressEvent`, `mouseReleaseEvent`) without calling the base; three would do, six is uniform.
  Press and release call `event->setAccepted(true)`; the rest do nothing. Wheel: KWin sends it to
  its own `DecoratedWindowImpl`, not the decoration, and its title-bar wheel action needs
  `titlebarPositionUnderMouse()`, false at NoSection (`input.cpp:1672-1676`; R1-3). Note: with an
  empty title bar the base class would still label the top line `TitleBarArea`
  (`decoration.cpp:248-260`); that only matters if the overrides are removed (R1-4).
  With the section fixed at NoSection and every press accepted:
  - `Window::mouseGravity()` is `Gravity::None`, so `updateCursor()` and `endInteractiveMoveResize`
    give the arrow (`window.cpp:2328, 2544-2571`), and `processDecorationMove` (re-read on every
    hover, `window.cpp:2688`) never sets a gravity;
  - `processDecorationButtonPress` has exactly three callers, all behind the acceptance test:
    pointer (`input.cpp:1641-1643`), touch (`:1709-1711`) and tablet (`:1823-1825`). So no delayed
    move or resize, no double-click timer, no title-bar mouse command (menu, raise, lower), from
    any input device (R1-2, R1-3). `processDecorationButtonRelease` still runs and only clears state.
  - `globalWindowAction` (Meta+button, `input.cpp:1630`) runs **before** the decoration sees the
    press, in the same filter, and computes its gravity from the pointer position, not the section
    (`window.cpp:2105-2127`), so Meta+right-drag resize and Meta+left-drag (off, `CommandAll1
    Nothing`) are as before; kwini3mouse runs before this filter too (same slot, inserted first)
    and keeps Meta+Shift+drag. The window menu's Move/Resize, keyboard moves and a client's own
    move request never read the section either (R1-3).
- **Input region** = borders + resizeOnlyBorders (`window.cpp` `updateDecorationInputShape`): exactly
  the 1 px line. Nothing invisible.

## How: focus on the frame (kwini3mouse, `plugin/mousechords.cpp`)

KWin's `DecorationEventFilter` returns true for every pointer event over a decoration, so the
`WindowActionInputFilter` that activates on click never runs there, and `InputDeviceHandler::
updateFocus` gives the pointer no focus window over a decoration, so `Window::pointerEnterEvent`,
the only place focus-follows-mouse asks for focus (`window.cpp` `pointerEnterEvent` ->
`workspace()->requestDelayFocus`, `pointer_input.cpp` `focusUpdate`), never runs for it (R1-1).
Both gaps exist today under Aurorae; the review found them, and they matter most at screen edges,
where the frame is kept and a flung pointer lands exactly on the line.

kwini3mouse (an `InputEventFilter` at `InputFilterOrder::Decoration`, inserted before KWin's) gets
two additions, about 25 lines, both returning false so the event goes on to the decoration (which
accepts it, so nothing moves):

1. **Hover**: in `pointerMotion`, track `input()->pointer()->decoration()`, which KWin updates
   before the filters run for that motion (`pointer_input.cpp:286-288`, `input.cpp:3688-3710`;
   R2-1). When it becomes the decoration of window W (from none or from another window's), and
   the focus policy is not click-to-focus, the window menu is not shown, and W is not a desktop or
   dock, call `workspace()->requestDelayFocus(W)` directly. **Not `W->pointerEnterEvent(pos)`**:
   KWin's `update()` has just stored this pointer position as the focus-mouse position
   (`input.cpp:3709`), so `pointerEnterEvent`'s "has the mouse moved" check (`window.cpp:2853-2855`)
   fails and it requests nothing (R2-1, blocked revision 2). `requestDelayFocus` with the delay at
   0 is a zero-interval timer, fired on the next loop turn. **Never call `W->pointerLeaveEvent()`**:
   from a's frame straight into b's client, KWin has already requested focus for b before our
   filter runs, and the leave's `cancelDelayFocus` would drop it (R2-2). Only when the pointer goes
   from a frame to nothing at all (no decoration, no hovered window), `workspace()->cancelDelayFocus()`.
   KWin's own enter when the pointer goes on into W's client requests W's focus a second time;
   harmless.
2. **Click**: in `pointerButton`, a press with **no modifiers** (so a Meta+press stays with KWin's
   own handling) that is not a configured chord (the existing `it == cend` branch), while
   `input()->pointer()->decoration()` is set: run the same pair a client-area press runs in
   KWin's `WindowActionInputFilter`, `getMousePressCommand` then `performMousePressCommand`
   (`window.cpp:1881-1903, 2011-2015`): raise, `requestFocus`, `setActiveOutput`, no focus-stealing
   prevention, which is right for a user click (R2-3; not `activateWindow`, which skips
   `setActiveOutput`). Then return false so the press reaches the decoration filter normally, where
   the frame accepts it. i3 activates on every click and raises only floating windows
   (`click.c:277-282`); KWin's raise of a tiled window is a no-op within the tile. Under
   click-to-focus this is the only focus path on the frame, under focus-follows-mouse it covers the
   parked-pointer case. Do not get this by leaving the press unaccepted in the decoration: any
   unaccepted left press arms KWin's delayed move whatever the title-bar command is
   (`window.cpp:2769-2781` excludes only Menu and Minimize; R1-1).

Both are the stock KWin calls the client area gets; nothing is re-implemented. No config key:
the frame is part of the window for focus, full stop. They do nothing when no decoration is under
the pointer, so Breeze or CSD windows see no change. **The frame depends on kwini3mouse** for
focus, and kwini3mouse is refused by exact KWin version while the frame loads without a check, so
after a KWin point release hover and click on the line would silently stop focusing until the
rebuild: `health-check` asserts kwini3mouse is loaded whenever `library=` names the frame (R2-8).

**Consequences to accept**: no window menu from the frame (Alt+F3 and the keys still exist); no
double-click action; no cursor change. A click on the frame reaches no client (the frame is 1 px).

## Metadata, build, install

- **`plugin/frame.json`**: `{"KPlugin": {"Name": "kwin-i3 frame", "Description": "i3's 1 px
  frame: nothing starts from the pointer", "EnabledByDefault": true}, "org.kde.kdecoration3":
  {"blur": false, "recommendedBorderSize": "Tiny"}}`. No `Id`: the id is the file's complete base
  name (`kpluginmetadata.cpp:186-192`, kcoreaddons 6.31; R1-8). No KCM. KWin reads only
  `recommendedBorderSize` and theme keys from the namespace object (`decorationbridge.cpp` `loadMetaData`).
- **CMake** (`plugin/CMakeLists.txt`, third target): `find_package(KDecoration3 REQUIRED)` (exported
  target `KDecoration3::KDecoration`; its config also sets `KDECORATION_PLUGIN_DIR`, the directory
  name `org.kde.kdecoration3`: use it, so the string lives in one place; R1-8),
  `kcoreaddons_add_plugin(kwini3frame INSTALL_NAMESPACE "${KDECORATION_PLUGIN_DIR}")`, sources
  `frame.cpp`, link `KDecoration3::KDecoration Qt6::Gui`. Build lands in
  `plugin/build/bin/org.kde.kdecoration3/kwini3frame.so`. Needs **`kdecoration-devel`**
  (6.7.5-1.fc44 in `updates`, matching the installed library; sudo, proposed per command).
- **No version guard at all** (R1-7, corrected): the plugin IID is `org.kde.KPluginFactory`;
  `org.kde.kdecoration3` is only the directory and the JSON key. So, unlike kwini3mouse (IID
  `...PluginFactoryInterface6.7.5`), a build against a kdecoration whose `Decoration` layout changed
  **loads without complaint and can crash KWin at the first window, every login**. KWin's Breeze
  fallback (`decorationbridge.cpp:107-116`) covers only a load failure, and the plugin can't guard
  itself by returning null (`createDecoration` dereferences the result, `:243-244`; R2-5). The
  dangerous sequence is `dnf upgrade` with `library=` already set, then the next login, so an
  install-time check is not enough (R2-5). Mitigations, all required:
  - the build embeds `KDecoration3_VERSION` (from `find_package`, or the generated
    `kdecoration3_version.h`) in `plugin/build/kdecoration.version`; the installed library's version
    is the real file name of `libkdecorations3.so.6` (`6.7.5`);
  - an `ExecStartPre=` on the existing KWin systemd drop-in (`plasma-kwin_wayland.service.d/
    kwin-i3-plugin.conf`) runs a small script before every KWin start: if `library=` names our
    frame and the two versions differ, it writes `library=org.kde.breeze` (and says so in the
    journal), so a mismatch never reaches KWin. `make plugin-install` runs the same check and
    refuses to write `library=` on a mismatch; dotfiles' `health-check` reports it. Rebuild at
    every Plasma update, as KDE rebuilds Breeze;
  - the recovery for a crash-looping session, in README and `health-check`'s output: from a TTY or
    ssh, `kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library org.kde.breeze`,
    then log in again (R2-5 confirms the command).
- **Install** (`tools/plugin-install.sh`, a third branch; R1-9): a new file per build,
  `<root>/org.kde.kdecoration3/kwini3frame-<hash>.so`, old ones unlinked (KWin never unloads a
  library, and the old factory is only `reset()` while its library stays mapped, so unlinking is
  safe, as for the other two). When the file exists and the version check passes:
  `kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library kwini3frame-<hash>`, only
  if it differs (same id: no reconfigure, no flash), then `busctl --user call org.kde.KWin /KWin
  org.kde.KWin reconfigure`: `DecorationBridge::reconfigure` sees a new `library`, `initPlugin`s it
  and `recreateDecorations()` (`decorationbridge.cpp:157-180`; Wayland `invalidateDecoration`,
  `xdgshellwindow.cpp:768-772`). **Every decorated window is re-decorated at once, visibly, no
  logout; say so before running it live.** Then verify, **polling for up to a few seconds**: the
  D-Bus `reconfigure` only starts a 200 ms timer (`workspace.cpp:998-1001`), so an immediate read
  still shows the old id (R2-6). `busctl --user call org.kde.KWin /KWin org.kde.KWin
  supportInformation` must contain `Plugin: kwini3frame-<hash>` (format `Plugin: %1\n`,
  `decorationbridge.cpp:274`, the live plugin; busctl prints it escaped, so `grep -F`, no `^`
  anchor). If it still shows the old id after the wait, KWin did not load the new file (it
  retries at every reconfigure with a warning): print the journal hint and exit 1. With
  `KI3_PLUGIN_ROOT` set (tests) the branch touches neither kwinrc nor KWin.
- **Loading**: `KPluginMetaData::findPluginById("org.kde.kdecoration3", <library=>)` is a
  `QPluginLoader` on `<dir>/<id>` through `QCoreApplication::libraryPaths`
  (`kpluginmetadata.cpp:206-224`), which the existing systemd drop-in (`QT_PLUGIN_PATH` for KWin's
  unit) covers. The metadata is valid iff the JSON has a non-empty `KPlugin` object (`:309-313`).
- **Who else writes `library=`** (R1-8): the Window Decorations KCM (it will list "kwin-i3 frame"
  under the hashed id, and can write a stale id after a rebuild), `kwin-applywindowdecoration`, and
  applying a Plasma global theme (look-and-feel defaults). `health-check` checks that `library=`
  names an existing file under the root; README says a global theme resets the frame.
- **Way back** until dotfiles retires the theme: `library=__aurorae__svg__i3frame` + reconfigure.
- **Then in dotfiles** (the dotfiles session does it, given the id `kwini3frame-<hash>` and the
  root `~/.local/lib/kwin-i3/qt6plugins`): retire the Aurorae theme, drop setup.sh's theme link and
  its `kwin-applywindowdecoration` call (lines 170-182; keep the BorderSize keys; delete the
  `theme=` key), drop health-check's theme link check, add the two checks above, update README's
  Plasma table row.

## Interaction with kwin-i3 (R1-12)

`frameMin` (`src/kwin.js:253`) takes frame minus client from the live window, so it follows the
2 px; the re-decoration at install time changes client size at the next configure with the frame
geometry unchanged (`xdgshellwindow.cpp:803-817`), so `fits`/`refit` see nothing; `frameMin` is
stale for one tick, harmless. kwini3hold snapshots the whole window, frame included. The fuzzer's
invariants use geometry, not pixels. The stale comment at `src/kwin.js:252` ("the headless tests
have no decorations"; they run Breeze, 28 px title bar, 150 px enforced minimum) gets corrected
with this change.

## Tests

`tests/live/54-frame.sh`, real input through `tools/inject.py`, the plugin built into
`plugin/build/bin` and loaded as 52-mouse loads kwini3mouse (`KI3_PLUGIN`). The frame is selected
**per scenario**, by writing `[org.kde.kdecoration2] library=kwini3frame` to the test kwinrc and
reconfiguring inside the test, as 52-mouse writes its chord (`52-mouse.sh:33-35`); the test KWin
keeps Breeze by default, so the other scenarios, 52-mouse's title-bar check among them, are
unchanged, and Breeze's 150 px minimum and 28 px frame stay covered (R1-11). The test client is
GTK4 with server-side decoration (`DecorationBridge::init` sets the default mode to Server;
`testclient.py:92`), so it gets the frame.

0. **The switch took**: `supportInformation` shows `Plugin: kwini3frame`, polled for up to a few
   seconds after the reconfigure (R2-6); otherwise KWin fell back to Breeze silently and only
   check 1 would notice.
1. **Geometry**: two tiled windows a | b; `a.frameGeometry` minus `a.clientGeometry` is 1 px on each
   side (so `frameMin` sees 2 px, and KeePassXC's 802 px tile stays right).
2. **Pixels** (`tools/shot.py same`): a's four corner pixels and one per side are `76,120,153`
   while a is active, b's are `51,51,51`; focus b and they swap.
3. **Nothing from the pointer**: a active; pointer to a's right line (x = 639), left press, drag
   100 px, release: no `DRAG start` line, a and b unchanged. Same from a's top line dragging down:
   no move. Right press and release on the line: `workspace.activeWindow` still a (it was active
   already; R2-7) and no `DRAG`, and the menu check (no new entry in `workspace.windowList()`) only
   if fault A below proves it observable.
   Double left click on the line: a not maximized, unchanged. A second click on the line after a
   Meta+right-drag started on the line: starts nothing (cursor state reset).
4. **The chords still work from the line**: Meta+Shift+drag started on a's line moves a (floats
   it); Meta+right-drag started on it resizes and reads back (51-input's check 2, repeated here).
5. **Nothing invisible above a window** (the Aurorae strip), positive: two stacked windows, a left
   click 4 px above the seam, inside the upper window's client area, reaches the client (`--clicks`
   log, as 52-mouse's `press 1 release 1`).
6. **Focus follows i3**: b active; pointer jumped straight onto a's screen-edge line (`inject.py`'s
   absolute move to x = 0; R2-7) without entering its client: a becomes active (hover). Then from
   a's line straight into b's client: b active (the leave bug of revision 2, R2-2). b active and
   the pointer parked on a's line: set `workspace.activeWindow = b` from the scripting console
   (R2-7), then a left click on the line: a active (click). A floating window c under a: a click on
   c's line raises it (stacking order).
7. **Re-decoration without restart**: switch `library=` to Breeze and back with the windows open:
   no `WARN`/`ERROR` in the log, a modal dialog and a floating window stay put, and the tiled
   frames are back at their tiles once settled. Not "geometry unchanged throughout": the minimum
   frame size differs between Breeze and the frame, so kwin-i3 may refit in between (R2-7); poll
   the final state (check 0's poll) rather than asserting the intermediate one.

**Watched red** before it counts (R1-10), each fault built once in a worktree:
- A: press not accepted (handlers still overridden): check 3's left drag gives `DRAG start move`
  and the right press opens the menu. The real guard.
- B: press not accepted and `hoverMoveEvent` calling the base: the right-line drag gives `DRAG
  start resize` (the section drives the gravity).
- C: `setResizeOnlyBorders(QMarginsF(8, 8, 8, 8))`: check 5 red.
- D: colours swapped, and a 2 px border: checks 1 and 2 red.
- E: kwini3mouse's hover addition removed: check 6's hover red. F: its click addition removed on
  its own: check 6's click red (R2-7).
- G: the revision-2 leave call put in (`pointerLeaveEvent` on leaving the frame): check 6's
  frame-to-client step red (R2-7).
- The hover fault alone (base called, press accepted) changes only the cursor, which no script can
  read: verified by eye once, live, and that is written in the review notes.

Then `make test` green; `make fuzz` once with the frame selected in the fuzzer's test KWins
(`tests/fuzz/run.py` sets a `KI3_FRAME=1` that `testkwin.sh` turns into the `library=` line when
the built file exists) and once as now with Breeze, since the two exercise different minimums; one
run of checks 1 and 2 at scale 2 (`kwin_wayland --scale 2` reaches the virtual outputs; width and
height are then device pixels; R2-7) pins the pixel-snapped border; and live on Paul's word, with
the re-decoration flash announced first.

## Paul's answers (2026-10-23)

1. A click on the line does nothing: first "yes", then, told that i3 focuses on border click and
   hover, "follow that precedent". Hence the kwini3mouse section. The border-drag resize stays out.
2. Shadows: none now, none after.
3. Borders at screen edges and on a maximized window: OK.
