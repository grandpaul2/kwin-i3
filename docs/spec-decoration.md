# Spec: kwini3frame, the i3 frame as a KDecoration3 plugin

Decided by Paul, 2026-10-23. Status: **written 2026-10-23 against KDecoration 6.7.5, KWin 6.7.5 and
Breeze 6.7.5 source; awaiting review.** Not code until reviewed; not live until Paul says go.

Sources read (fetched from invent.kde.org at v6.7.5): kdecoration `src/decoration.h`,
`src/decoration.cpp`, `src/decoratedwindow.h`, `src/decorationsettings.h`; kwin
`src/decorations/decorationbridge.cpp`, `src/decorations/decoratedwindow.cpp`, `src/window.cpp`,
`src/input.cpp`; breeze `kdecoration/breezedecoration.cpp`, `breeze.json`, `CMakeLists.txt`. The
Aurorae findings are the dotfiles session's (2026-10-23), not re-read here.

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
decides tiling, so a window rule is out. Paul says the edge drag does not even work for him in
practice; untested, and moot after this.

## Decision

**The frame starts nothing from the pointer**: no resize, no move, no menu, no double-click action,
the arrow cursor everywhere on it. Resize is Meta+right-drag (KWin's stock `CommandAll3`) and the
Meta+Ctrl keys; move is Meta+Shift+drag (kwini3mouse) and the Meta+Shift keys. A floating window
resizes only by Meta+right-drag and the keys (Paul asked; accepted). The read-back after an
interactive resize (`readBack`, `src/kwin.js`; 51-input) stays: it serves Meta+right-drag.

## What the frame is

The theme as it is today: a square **1 px border on all four sides of every decorated window**,
`#4c7899` on the active window, `#333333` on the rest; no title bar, no buttons, no rounding, no
shadow. Kept at screen edges and when maximized (i3's `hide_edge_borders none`; Breeze drops them
there, we don't). The border is 1 logical pixel: at Paul's scale 1 that is 1 device pixel. Fullscreen
windows have no decoration (KWin's doing, as now). Firefox uses it too (`browser.tabs.inTitlebar=0`).
Clients that draw their own decoration (GTK with CSD) are untouched, as now.

The plugin ignores `settings()->borderSize()`: the frame is 1 px whatever kwinrc says. The
`[org.kde.kdecoration2] BorderSize=Tiny`, `BorderSizeAuto=false` keys stay (harmless, and they keep
Breeze tolerable if KWin ever falls back to it).

## How (the KDecoration3 API, 6.7.5)

One class, `KWinI3::Frame : public KDecoration3::Decoration`, in `plugin/frame.cpp` + `frame.h`,
about 80 lines, plus `frame.json` and a CMake target. Nothing else in the repo changes.

- **Factory**: `K_PLUGIN_FACTORY_WITH_JSON(FrameFactory, "frame.json", registerPlugin<KWinI3::Frame>();)`
  (Breeze's pattern, `breezedecoration.cpp:37`). KWin creates one `Frame` per decorated window
  through `m_factory->create<KDecoration3::Decoration>(window, args)` and calls `init()`
  (`decorationbridge.cpp` `createDecoration`). The constructor takes `(QObject *parent, const
  QVariantList &args)` and passes them to the base; all setup happens in `init()` (the header says so).
- **`init()`**: `setBorders(QMarginsF(1, 1, 1, 1))` (double-buffered state; KWin applies it with the
  window's next configure, `decoration.cpp:379`); `setTitleBar(QRectF())` (empty: the top strip is a
  plain border like the others, and nothing is `TitleBarArea`); `setOpaque(true)` (the 1 px is
  solid); `resizeOnlyBorders` untouched (default zero; `decoration.cpp:388`); no `setShadow`, no
  `setBorderRadius`, no `setBorderOutline` (defaults: none, 0, null). Connect
  `window()->activeChanged` to `update()`. That is all: the borders never change, so none of
  Breeze's `recalculateBorders` triggers (border size, font, maximized, adjacent edges, scale) apply.
- **`paint(QPainter *p, const QRectF &)`**: fill `rect()` transparent, then with antialiasing off, a
  1 px pen of the active or inactive colour and no brush, `p->drawRect(rect().adjusted(0, 0, -1, -1))`.
  `rect()` is the decoration's geometry in local coordinates, client size plus borders
  (`decoration.h:241`). Colour from `window()->isActive()`, hard-coded hex, no palette (the theme's
  colours are literal too).
- **The section never changes.** `sectionUnderMouse` starts as `Qt::NoSection`
  (`decoration.cpp:184`) and only `Private::updateSectionUnderMouse` changes it, which only the base
  class's `hoverEnterEvent`, `hoverMoveEvent` and `mouseReleaseEvent` call (`decoration.cpp:569,
  599, 635`; `mouseMoveEvent` and `mousePressEvent` only talk to buttons, and we have none).
  Override **all six pointer handlers** (`hoverEnterEvent`, `hoverLeaveEvent`, `hoverMoveEvent`,
  `mouseMoveEvent`, `mousePressEvent`, `mouseReleaseEvent`) without calling the base. Press and
  release handlers call `event->setAccepted(true)`; the rest do nothing. `wheelEvent` stays the
  base's (no buttons: it does nothing, and KWin's title-bar wheel action needs a title bar under
  the mouse, `input.cpp:1680`). With the section fixed at NoSection:
  - `Window::mouseGravity()` is `Gravity::None`, so `updateCursor()` gives the arrow and
    `processDecorationMove` (re-read on every hover, `window.cpp:2688`) never sets a gravity;
  - an accepted press means `DecorationEventFilter::pointerButton` never calls
    `processDecorationButtonPress` (`input.cpp:1641-1643`): no delayed move or resize, no
    double-click timer, no title-bar mouse command (menu, raise, lower, ...);
  - `globalWindowAction` (Meta+button, `input.cpp:1630`) runs **before** the decoration sees the
    press, in the same filter, so Meta+right-drag resize and Meta+left-drag (off, `CommandAll1
    Nothing`) are as before; kwini3mouse runs before this filter too (same slot, inserted first)
    and keeps Meta+Shift+drag.
- **Input region** = borders + resizeOnlyBorders (`window.cpp` `updateDecorationInputShape`): exactly
  the 1 px line. Nothing invisible.
- **Consequences to accept** (each is "the frame does nothing", which is the decision):
  - a plain click on the 1 px line neither activates nor raises the window (the title-bar mouse
    commands don't run). Focus follows the mouse there as anywhere else: KWin's focus policy acts on
    the window under the pointer, decoration included. Inside the frame the client gets the click.
  - no window menu from the frame (Alt+F3 and the keys still exist).
  - touch on the frame would still start a move: the touch path calls `processDecorationButtonPress`
    without consulting the decoration (`input.cpp:1704-1710`). No touch screen here.
  - no shadow on any window, as the theme has none now (to confirm with Paul: does i3frame draw one?).

## Metadata, build, install

- **`plugin/frame.json`**: `{"KPlugin": {"Name": "kwin-i3 frame", "Description": "i3's 1 px
  frame: nothing starts from the pointer", "EnabledByDefault": true}, "org.kde.kdecoration3":
  {"blur": false, "recommendedBorderSize": "Tiny"}}`. No `Id`: the id is the file name (KWin warns
  about an embedded Id, as with our other plugins). No KCM. KWin reads only `recommendedBorderSize`
  and the theme keys from the namespace object (`decorationbridge.cpp` `loadMetaData`).
- **CMake** (`plugin/CMakeLists.txt`, third target): `find_package(KDecoration3 REQUIRED)`,
  `kcoreaddons_add_plugin(kwini3frame INSTALL_NAMESPACE "org.kde.kdecoration3")`, sources
  `frame.cpp`, link `KDecoration3::KDecoration Qt6::Gui`. The build lands in
  `plugin/build/bin/org.kde.kdecoration3/kwini3frame.so` (the namespace is the directory, as
  `kwin/plugins/` is for kwini3mouse). Needs **`kdecoration-devel`** (6.7.5-1.fc44 is in the
  `updates` repo, matching the installed library; sudo, proposed per command).
- **Not version-locked to KWin**: the plugin IID is the plain string `org.kde.kdecoration3`
  (verified in `org.kde.breeze.so` by the dotfiles session), unlike KWin's own plugin interfaces.
  Rebuild when kdecoration's soversion (`KDecoration3`, major 6) or ABI changes, not at every Plasma
  update. `health-check` can compare the build's kdecoration version with `rpm -q kdecoration`.
- **Install** (`tools/plugin-install.sh`, a third branch): a new file per build,
  `<root>/org.kde.kdecoration3/kwini3frame-<hash>.so`, old ones unlinked (KWin never unloads a
  library and overwriting a mapped one can crash it: the same reason as for the other two). Then
  `kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library kwini3frame-<hash>` and
  `busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure`: `DecorationBridge::reconfigure`
  sees a new `library`, `initPlugin`s it and `recreateDecorations()` (`decorationbridge.cpp:167-171`).
  **Every decorated window is re-decorated at once, visibly, no logout.** The install script owns
  `library=`; dotfiles' `kset` writes a key only when it is empty, so the two don't fight.
- **Loading**: `KPluginMetaData::findPluginById("org.kde.kdecoration3", <library=>)` through
  `QCoreApplication::libraryPaths`, so the existing systemd drop-in (`QT_PLUGIN_PATH` for KWin's unit
  only) covers it. If the plugin can't be loaded at login, `DecorationBridge::init` falls back to
  `org.kde.breeze` and logs a warning (`decorationbridge.cpp:106-113`); KWin keeps running with
  Breeze's frame. That is the failure mode after a kdecoration ABI change: ugly, not broken.
- **Way back** until dotfiles retires the theme: `library=__aurorae__svg__i3frame` + reconfigure.
- **Then in dotfiles** (the dotfiles session does it, given the id `kwini3frame-<hash>` and the
  root `~/.local/lib/kwin-i3/qt6plugins`): retire the Aurorae theme, drop setup.sh's theme link and
  its `kwin-applywindowdecoration` call (lines 170-182; keep the BorderSize keys), drop
  health-check's theme link check, add a check that `library=` names a file under the root, update
  README's Plasma table row.

## Tests

`tests/live/54-frame.sh`, real input through `tools/inject.py`, the plugin loaded as 52-mouse loads
kwini3mouse (`KI3_PLUGIN=plugin/build/bin`) and selected in the test KWin by writing `library=
kwini3frame` to its kwinrc and reconfiguring inside the test (the test KWin keeps Breeze otherwise,
so the other scenarios don't change). The test client is GTK4 with server-side decoration (its
dialog's frame is 28 px taller than its client under Breeze, seen 2026-10-23), so it gets the frame.

1. **Geometry**: two tiled windows a | b; `a.frameGeometry` minus `a.clientGeometry` is 1 px on each
   side (so `frameMin` in kwin.js sees 2 px, and KeePassXC's 802 px tile stays right).
2. **Pixels** (`tools/shot.py same`): a's left border pixel is `76,120,153` while a is active, b's
   left border pixel is `51,51,51`; focus b and the two swap. Proves paint and `activeChanged`.
3. **Nothing from the pointer**: pointer to a's right border (x = 639, the 1 px line), left press,
   drag 100 px right, release: no `DRAG start` line, a and b unchanged. Same from a's top line (the
   old title bar) dragging down: no move. Right press and release on the line: no new window in
   `workspace.windowList()` (KWin's menu is an internal window). Double left click on the line: a
   not maximized, unchanged.
4. **Meta+right-drag still resizes and reads back**: 51-input's check 2, repeated here with the
   frame loaded.
5. **Between tiled windows** (the Aurorae strip): pointer 4 px above the seam of two stacked
   windows, left drag: nothing moves or resizes.

**Watched red** before it counts: the cursor shape is not readable from a script, so the proof is a
deliberate fault, built once in a worktree: `hoverMoveEvent` calling the base. Check 3's edge drag
must then resize (a `DRAG start resize` line). A second fault, `mousePressEvent` not accepting:
check 3's drag must then move or resize. Both go in the spec's review notes, not in mutate.py (the
plugins aren't in its scope).

Then `make test` green, `make fuzz` once with the frame loaded in the fuzzer's test KWins (the
fuzzer already loads the other two plugins; frame = tile holds with any border width), and live on
Paul's word, with the re-decoration flash announced first.

## Questions for Paul

1. A click on the 1 px line does nothing, not even focus or raise (focus follows the mouse there
   anyway). OK?
2. Shadows: the plugin draws none. Does the current theme?
3. Borders stay at screen edges and on a maximized window, as i3's default. OK?
