# Review: spec-decoration.md (kwini3frame), 2026-10-23

Read against the 6.7.5 sources (kdecoration, kwin full tag `v6.7.5` cloned, breeze, kcoreaddons 6.31.0
which is the installed `kf6-kcoreaddons`). File:line refs are to those trees; `kw/` = kwin `src/`.
Nothing in the repo was changed except this file; nothing was loaded into the live KWin.

Verdict: the core mechanism is right (accepting every press is what stops everything; the section
overrides only change the cursor). Two claims in the spec are false and one of them changes what Paul
is asked in Question 1. The scale handling and the red-fault plan need fixing before code.

## Findings

1. **A click or a parked pointer on the 1 px line is dead, and hover does NOT focus: the premise of
   "Consequences" bullet 1 and Question 1 is wrong. Severity: should fix, re-ask Paul.**
   Spec: "Focus follows the mouse there as anywhere else: KWin's focus policy acts on the window under
   the pointer, decoration included."
   Source: `kw/input.cpp:3655-3660` (`updateFocus`: `if (m_focus.decoration) focus = nullptr`), so over a
   decoration the pointer has no focus window; `kw/pointer_input.cpp:628-639` calls
   `Window::pointerEnterEvent` only for `focusNow`; that is the only place FocusFollowsMouse requests
   focus (`kw/window.cpp:2838-2856`, `requestDelayFocus`). Entering the client area later does focus it.
   The press path: `DecorationEventFilter` (`kw/input.cpp:1618-1648`) returns true, and the
   `WindowActionInputFilter` (`:1933`, order after Decoration, `input.h:376-377`) is never reached, so
   the click activates nothing and the client gets nothing.
   Why it matters here: the frame is kept at screen edges, and a flung pointer clamps onto exactly that
   line. A pointer slid along the screen edge from window a to window b (stacked at the edge) never
   changes focus, and a click there is swallowed. Today (Aurorae, unaccepted press) the click activates
   (`window.cpp:2762-2785`).
   Suggest: (a) tell Paul the true consequence and let him decide; (b) if he wants activation, do it in
   kwini3mouse, whose filter already runs before Decoration (mouse-plugin-design.md): on a plain
   left/right press with `input()->pointer()->decoration()` set, call `workspace()->requestFocus(window)`
   (and consume nothing, or consume as now). Do not unaccept the press to get this: an unaccepted left
   press starts a delayed move whatever the titlebar command is (`window.cpp:2769-2781` excludes only
   Menu and Minimize). (c) add a test that documents whichever behaviour is chosen (see 11).

2. **Touch and tablet are blocked too; the spec's "touch would still start a move" is wrong.
   Severity: note (the spec errs on the safe side; fix the text).**
   Spec: "the touch path calls `processDecorationButtonPress` without consulting the decoration
   (`input.cpp:1704-1710`)".
   Source: `kw/input.cpp:1706-1711` sends a `MouseButtonPress` to the decoration and calls
   `processDecorationButtonPress` only `if (!e.isAccepted())`; the tablet tip path does the same
   (`:1815-1825`). Our accepting press stops both. Drop the "no touch screen" caveat.

3. **Question 1 of the review: yes, overriding the handlers and accepting press/release keeps
   `NoSection` and blocks every decoration-started move/resize. Severity: confirmed, with corrections.**
   - `sectionUnderMouse` initial `NoSection`: `kdecoration/decoration.cpp:184`. The only writers of it
     are `setSectionUnderMouse` (`:192`), called from `updateSectionUnderMouse` (`:201`) and from the
     base `hoverLeaveEvent` (`:577`, sets `NoSection`: harmless). `updateSectionUnderMouse` is called
     only at `:569` (hoverEnter), `:599` (hoverMove), `:635` (mouseRelease). `DecorationButton`
     (`kdecoration/decorationbutton.cpp`) never touches it. KWin only reads it:
     `kw/window.cpp:833,2547,2731` (grep over the whole tag: no other reader or writer, no QML/effect
     user).
   - Only `hoverEnterEvent`, `hoverMoveEvent`, `mouseReleaseEvent` need overriding to hold NoSection.
     `mouseMoveEvent`, `mousePressEvent` (`:602-624`) touch buttons only, and `hoverLeaveEvent`'s base
     does nothing we need (forwards to buttons, sets NoSection). Overriding all six is harmless; the
     spec's own sentence says as much. Press must still `setAccepted(true)`.
   - `processDecorationButtonPress` has exactly three callers, all behind the acceptance test:
     pointer `kw/input.cpp:1641-1643`, touch `:1709-1711`, tablet `:1823-1825`. Everything else that
     starts a move/resize does not use the decoration: Meta chords (`:1630`, `performMousePressCommand`
     computes gravity from the pointer position, `window.cpp:2105-2127`), the window menu's Move/Resize
     and the keyboard ones (`performMouseCommand`/keyboard move), client `_NET_WM_MOVERESIZE`, and
     kwini3mouse. None reads `sectionUnderMouse`.
   - Wheel: `input.cpp:1676` needs `titlebarPositionUnderMouse()` (`window.cpp:828`), false at NoSection.
     (KWin sends the wheel event to the `DecoratedWindowImpl`, not the decoration, `:1672`, so the
     `wheelEvent` override question never arises.)
   - Release: `processDecorationButtonRelease` still runs (`input.cpp:1644-1646`), only clears state.
   - Cursor: `Window::updateCursor` (`window.cpp:2328`) and `endInteractiveMoveResize` (`:2571`) fall
     back to Arrow with `mouseGravity() == None` (`:2544-2569`). Good.

4. **`setTitleBar(QRectF())` does not make the top line a plain border to the base class.
   Severity: note (moot once the handlers are overridden; fix the sentence).**
   Spec: "the top strip is a plain border like the others, and nothing is `TitleBarArea`".
   Source: `kdecoration/decoration.cpp:248-260`: with `top` true and an empty title bar
   (`titleBar.top() == 0`), `y < titleBar.top()` is false, so the else branch gives `TitleBarArea`
   for the whole top line except the corners (`:215`). The top line is the title bar as far as the base
   class is concerned. It is harmless only because the override never lets it run. This also makes the
   hover-fault in finding 10 observable.

5. **Painting at scale != 1 is wrong; use fills, and snap the border to the pixel grid.
   Severity: should fix (Paul is at scale 1 today, so not a blocker for the first live run).**
   Spec: 1 px pen, `drawRect(rect().adjusted(0,0,-1,-1))`, AA off; "the border is 1 logical pixel".
   Source: KWin paints into an image with `devicePixelRatio = target scale` and turns Antialiasing on
   (`kw/scene/decorationitem.cpp:140-141`; image DPR at `:116-119`). `setRenderHint(Antialiasing, false)`
   is therefore needed (spec has it) but the stroke is the problem: at scale 2 a 1-logical pen centred
   on logical x=0 straddles the image edge (half clipped) and the right stroke sits at logical w-1,
   leaving the outer device pixel empty; at 1.25 the width is 1.25 device px and a non-integer part.
   Breeze copies the same line only for its no-alpha path and handles scale in the borders:
   `breezedecoration.cpp:465` (`snapToPixelGrid(1, nextScale())`), `:418` (`setBorders(bordersFor(nextScale()))`),
   `:253` (recompute on `nextScaleChanged`), with `KDecoration3/ScaleHelpers`.
   Suggest: (a) paint with `p->fillRect(rect(), colour)`: KWin renders only the four border parts and
   clips each (`decorationitem.cpp:140-151`, `layoutDecorationRects` `window.cpp:2672`), so a full fill
   becomes exactly the border, exact at any scale and corner-safe; (b) border = `snapToPixelGrid(1,
   window()->nextScale())` set in `init()` and again on `nextScaleChanged` (cheap; then borders stay 1
   device px on 1.25/2, which is what "i3's 1 px" means); or state "scale 1 only" in the spec;
   (c) keep `setOpaque(true)` only if the fill covers every device pixel of the parts (true with (a),
   because KWin sizes part images with `rounded()`, `decorationitem.cpp:113-115`).
   Pixel test at scale 1 must include the four corners and the bottom-right pixel, since the stroke
   variant relies on Qt's aliased rounding.

6. **`setBorders` in `init()` is in time. Other painting points. Severity: confirmed, plus small notes.**
   - Wayland: `createDecoration` calls `create()` then `init()` (`kw/decorations/decorationbridge.cpp:
     230-245`) before `XdgToplevelWindow` connects `nextStateChanged` and clones `nextState()`
     (`xdgshellwindow.cpp:1625-1629`), so the first configure already carries the borders
     (`:803-806`, `:827-828`); `apply()` runs at precommit of the acked configure (`:838-846`) and only
     then is the decoration set, so nothing paints with zero borders. X11: `x11window.cpp:982` applies
     the next state immediately.
   - The transparent fill is a no-op (default composition is SourceOver and KWin already cleared with
     Source, `decorationitem.cpp:146-149`); drop it.
   - `connect(window(), &DecoratedWindow::activeChanged, this, ...)`: `Decoration::update` is
     overloaded (`decoration.cpp:648,653`), so the spec's "connect to `update()`" needs `qOverload<>(&Decoration::update)`
     (signal exists, `decoratedwindow.h:48`).
   - `init()` returns `bool` (`decoration.h:371`, pure virtual): return true.
   - Shaded windows: `size()` uses height 0 when shaded (`decoration.cpp:526`); harmless, i3 has no shade.
   - Active colour changes while kwini3hold holds a snapshot of the window: the held frame keeps the
     old colour until the hold ends (snapshot is taken through the plain chain, `hold.cpp:247-257`).
     Not a bug; just do not assert border colour during a hold.

7. **"Plugin IID is the plain string `org.kde.kdecoration3`" is wrong; the conclusion (no version
   guard) holds, and that is a risk the spec under-rates. Severity: should fix (text + mitigation).**
   Source: the IID in `org.kde.breeze.so` is `org.kde.KPluginFactory` (strings of the installed file;
   `K_PLUGIN_FACTORY_WITH_JSON`, `breezedecoration.cpp:37`). `org.kde.kdecoration3` is the plugin
   directory (`KDECORATION_PLUGIN_DIR`, `KDecoration3Config.cmake.in`) and the JSON key KWin reads
   (`decorationbridge.cpp:38,191`). So there is no IID check at all, unlike kwini3mouse
   (`org.kde.kwin.PluginFactoryInterface6.7.5`).
   Consequence: a build against a kdecoration whose `Decoration` vtable or private layout changed loads
   without complaint and can crash KWin at the first window, every login (decorations are created for
   every window), not "ugly Breeze". The fallback at `decorationbridge.cpp:107-116` only covers a load
   failure. Suggest: say so in the spec; make `make plugin-install` and health-check compare the
   `kdecoration-devel` version used at build (record it in the build dir) with `rpm -q kdecoration`
   and refuse to write `library=` if they differ; document the recovery for a crash-looping session
   (TTY or ssh: `kwriteconfig6 --file kwinrc --group org.kde.kdecoration2 --key library org.kde.breeze`).
   KDE rebuilds Breeze each release for the same reason; rebuild at every Plasma minor, not only on a
   soversion bump (soversion is the major, `kdecoration/CMakeLists.txt:35`).

8. **Build recipe and loading: right, with details. Severity: confirmed / notes.**
   - Exported target `KDecoration3::KDecoration` (`kdecoration/src/CMakeLists.txt:36` alias,
     export `KDecoration3Targets`, `KDecoration3Config.cmake.in`); the config also sets
     `KDECORATION_PLUGIN_DIR=org.kde.kdecoration3`: use `INSTALL_NAMESPACE "${KDECORATION_PLUGIN_DIR}"`
     so the string lives in one place. `find_dependency(Qt6Gui)` only; no extra find_package needed.
   - Breeze does not use `kcoreaddons_add_plugin`: `add_library(MODULE)` with `OUTPUT_NAME org.kde.breeze`
     installed to `${KDE_INSTALL_PLUGINDIR}/${KDECORATION_PLUGIN_DIR}` (`breeze/CMakeLists.txt`);
     KWin's own fake decoration does the same with `PREFIX ""` (`autotests/integration/fakes/
     org.kde.kdecoration3/CMakeLists.txt`). `kcoreaddons_add_plugin(... INSTALL_NAMESPACE ...)` produces
     the same kind of file and your two existing targets already prove the build-dir layout
     (`bin/<namespace>/name.so`). Fine. It must have AUTOMOC (Q_OBJECT in the class, as the existing
     targets) and `KDECompilerSettings` already defines `QT_NO_KEYWORDS`, which the kdecoration headers
     support (`Q_SIGNALS`/`Q_EMIT`). CMake file's `project(kwini3mouse)` and C++23 vs kdecoration's 20: no
     problem for the headers.
   - `findPluginById("org.kde.kdecoration3", "kwini3frame-<hash>")` (`decorationbridge.cpp:123`) is
     `QPluginLoader` on `<dir>/<id>` through `libraryPaths()` (kcoreaddons 6.31 `kpluginmetadata.cpp:
     206-224`, `pluginLoaderForPath` `:115-125`); id = `completeBaseName` of the file with no `Id` needed
     (`:186-192`); valid iff the JSON's `MetaData` object is non-empty (`:309-313`), and yours is. The
     embedded-`Id` warning the spec mentions is in the path constructor (`:171-182`), not on this route;
     harmless either way. `QT_PLUGIN_PATH` (the systemd drop-in, already in place for kwini3mouse) is
     part of `libraryPaths`.
   - Switching: `Workspace::configChanged` is wired to `DecorationBridge::reconfigure`
     (`kw/workspace.cpp:165`, after `reparseConfiguration`, `:1014`). `reconfigure`
     (`decorationbridge.cpp:157-180`) compares `library` with the current id; on change it
     `initPlugin`s and `recreateDecorations()`. Wayland: `invalidateDecoration` clears and recreates the
     decoration and schedules a configure (`xdgshellwindow.cpp:768-772`); X11: `updateDecoration(true,
     true)` (`x11window.cpp:964`). If the new id fails to load, `m_plugin` stays old and every later
     reconfigure retries with a warning: the install script must check, not assume (see 9).
     The old factory is `reset()` while its library stays mapped (`TODO: unload`), so unlinking the old
     `.so` is safe, as for the other plugins.
   - Who writes `library=` back: `kcm_kwindecoration` (`kwindecorationsettings.kcfg:8` key `library`)
     when Paul applies a decoration in System Settings; `kwin-applywindowdecoration`; Plasma
     global-theme application (look-and-feel `[kwinrc][org.kde.kdecoration2]` defaults). The KCM will
     list "kwin-i3 frame" under the hashed id, so a stale id after a rebuild is possible if the KCM wrote
     one. KWin itself never writes it except `migrateAuroraeTheme` (`decorationbridge.cpp:41-52`), which
     only rewrites `org.kde.kwin.aurorae` to `.v2` and does nothing for our id. Add to health-check:
     `library=` names an existing file; and note that applying any Plasma global theme resets the frame.
   - The stale `theme=__aurorae__svg__i3frame` key can stay: without a `themes` key in our JSON KWin
     ignores it (`findTheme`, `decorationbridge.cpp:206`). Delete it at retirement for tidiness.

9. **Install script: missing checks. Severity: should fix (small).**
   Spec: third branch, write `library=`, reconfigure.
   Source/repo: `tools/plugin-install.sh` writes the drop-in only when `KI3_PLUGIN_ROOT` is unset and
   reports success by `LoadedPlugins`/`AvailablePlugins` for the mouse plugin only. Decorations are not
   in `/Plugins`. Suggest: after `reconfigure`, read `busctl --user call org.kde.KWin /KWin
   org.kde.KWin supportInformation` and grep `^Plugin: kwini3frame-<hash>` (`decorationbridge.cpp:274`);
   if it still shows the old id, KWin did not load the new file: restore nothing, print the journal hint
   and exit 1. Write `library=` only when the file exists and the version check of finding 7 passes. When
   `KI3_PLUGIN_ROOT` is set (tests) the branch must not touch kwinrc or reconfigure. Keep `kwriteconfig6`
   idempotent (same id: no reconfigure, no flash). Also `place` is called with base `kwini3frame`, whose
   glob `kwini3frame*.so` is safe next to the other two bases.

10. **The "watched red" plan does not work as written. Severity: should fix.**
    Spec: fault 1 `hoverMoveEvent` calling the base, "check 3's edge drag must then resize"; fault 2
    press not accepting.
    Source: with fault 1 alone the press is still accepted, so `processDecorationButtonPress` is never
    called (`input.cpp:1641`) and no drag starts: check 3 stays green. The section only drives the cursor
    (`window.cpp:2328`, not readable from scripts: `Window::cursor()` is not a Q_PROPERTY, `window.h:1197`)
    and, for the top line, the titlebar wheel and double-click paths. So fault 1 needs another observer
    or must be dropped from "must go red".
    Suggest a matrix, each built once in a worktree:
    - A: press not accepted, handlers overridden: left drag on the right line must give `DRAG start move`
      (gravity None); right press must open the menu (`CommandActiveTitlebar3` default Operations menu).
      This is the real guard; watch checks 3a and 3b go red.
    - B: press not accepted and `hoverMoveEvent` calling the base: the right-line drag gives `DRAG start
      resize` (this is the spec's fault 1 as intended).
    - C: `setResizeOnlyBorders(QMarginsF(8,8,8,8))`: check 5 (below) goes red.
    - D: the hover fault alone is cursor-only. If Paul wants it tested, a wheel injected on the top line
      with `[MouseBindings] CommandTitlebarWheel=Change Opacity` changes `window.opacity` under the base
      class (top line is `TitleBarArea`, finding 4, `input.cpp:1676`). `tools/inject.py` has no wheel
      op today (grep: none); adding one is the cost. Otherwise state in the spec that the cursor is
      verified by eye once.
    - E: border pixel colour swapped (active/inactive) and a 2 px border: checks 1 and 2 red.

11. **Test plan: feasibility and gaps. Severity: should fix / note.**
    - Mid-test switch works mechanically: `reconfigure` re-reads kwinrc (`workspace.cpp:1014`) and the
      bridge recreates the decorations; 52-mouse already does `kwriteconfig6` + `reconfigure`
      (`52-mouse.sh:33-35`). The test KWin finds `plugin/build/bin/org.kde.kdecoration3/kwini3frame.so`
      through `QT_PLUGIN_PATH=$KI3_PLUGIN` (`testkwin.sh:36`), id `kwini3frame` (no hash).
      Add a first check that the switch took: `supportInformation` has `Plugin: kwini3frame`
      (`decorationbridge.cpp:274`). Otherwise a load failure falls back silently to Breeze
      (`init()` fallback / the retry in `reconfigure`) and check 1 is the only thing that notices.
    - GTK4 gets server-side decoration in the test KWin already: `testclient.py:92` comments the 150 px
      minimum "for a decorated window" (`xdgshellwindow.cpp:630`, `enforcedMinimum = m_nextDecoration ?
      150 : 20`), 52-mouse check 5 relies on a Breeze title bar, and fuzz I9 seed 28 was a decorated
      window. `DecorationBridge::init` sets default mode Server when a factory exists
      (`decorationbridge.cpp:118`). So the spec's claim is right.
      Stale text to fix elsewhere: `src/kwin.js:252` says "The headless tests have no decorations"; they
      run Breeze (title bar 28 px), so the 150 px minimum and a 28 px frameMin are what the suite and
      the fuzzer exercise today. Moving the fuzzer to the frame removes that coverage. Run the fuzzer
      both ways once (Breeze as now, then frame), or keep Breeze as the default and select the frame
      per scenario.
    - The fuzzer needs the same `library=` write: the spec says "already loads the other two plugins"
      but never says how the frame is selected there. `testkwin.sh` writes kwinrc itself
      (`:85-102`); add `KI3_FRAME=1` (or: write `[org.kde.kdecoration2] library=kwini3frame` when
      `$KI3_PLUGIN/org.kde.kdecoration3/kwini3frame.so` exists) and have `tests/fuzz/run.py:44-48` set it.
      If it becomes the default for `needs: plugin` scenarios, 52-mouse check 5 ("a title-bar sdrag") has no
      title bar any more and must change.
    - Check 3: right press and release on the line, then "no new window in `workspace.windowList()`":
      unverified that the window menu (a QMenu, internal window) appears in `windowList()`; prove it
      with fault A first, or check `workspace.activeWindow`/the log instead.
    - Check 5 is a negative check that cannot fail under the new plugin (no strip exists) except
      through fault C. Make it positive: a left click 4 px above the seam, inside the upper window's
      client area, must reach the client (`--clicks` log, as 52-mouse `saw "press 1 release 1 "`), and
      under fault C it does not.
    - Add: a click on the line while another window is active (documents finding 1: focus unchanged or,
      if Paul chooses (b), changed); the pointer moved onto the screen-edge line then into a client (focus
      follows on entering the client); pixels at all four corners; Meta+Shift+drag started on the line
      still moves (kwini3mouse runs first, `mouse-plugin-design.md`); Meta+right-drag started on the line
      resizes and the cursor state resets afterwards (a second click on the line starts nothing);
      re-decoration without restart: switch `library=` back and forth with two windows open and assert
      geometry unchanged and no `WARN`/`ERROR` in the log; a stacked floating window and a dialog
      (modal dialogs are decorated: fuzz seam).
    - Scale: if the test KWin's virtual backend accepts `--scale` (not checked), one run at scale 2
      would pin finding 5.

12. **Interaction with kwin-i3 and kwini3hold. Severity: notes, one to document.**
    - `frameMin` (`src/kwin.js:253-257`) takes `frame - client`, so it follows whatever the plugin
      sets (2 px). Right. But it is computed per call from the live window, and a re-decoration changes
      client size at the next configure: after the install-time switch every window gets one configure;
      frame geometry is unchanged (`xdgshellwindow.cpp:803-817` subtracts the padding from the same
      frame), so `fits`/`refit` (`kwin.js:361-376`) see no change. Expect `frameMin` to be
      stale for one tick; harmless.
    - Aurorae today: `TitleEdgeTopMaximized=0` (i3framerc: the top edge is 0 when maximized), so a *maximized* window
      has at most a partial Aurorae frame now (sides not checked); the spec's "kept when maximized" is
      a (welcome) change, only visible for KWin-maximized windows (kwin-i3 tiles do not use that mode).
      `borderlessMaximizedWindows` is unset in Paul's kwinrc (default false), so the frame stays
      (`xdgshellwindow.cpp:1797,1812`).
    - Shadows (Question 2 for Paul): `i3frame/decoration.svg` has no `shadow-*` elements, so Aurorae
      draws none today. Answer: no shadow now, none after.
    - kwini3hold snapshots the whole window through the effect chain (`hold.cpp:247-257`), so the frame
      is included; no dependency on border width. Fuzzer invariants I2-I5 use frame/client geometry only
      (`docs/fuzz-design.md:42-60`), not pixels, so a 1 px frame passes; I5 (client >= `minSize`) is
      consistent with the 150 px enforced minimum.
    - `tools/plugin-install.sh` must stay safe for the live session: switching `library=` re-decorates
      every window at once (spec says so; Paul's rule: say it before doing it).

13. **Smaller corrections to the spec text. Severity: note.**
    - "KWin warns about an embedded Id": that warning is in the path constructor only (see 8). Leaving
      `Id` out is still right.
    - `input.cpp:1680` for the wheel check is `:1676` in this tag; the other cited lines
      (`decoration.cpp:184,379,388,569,599,635`, `input.cpp:1630,1641-1643`, `window.cpp:2688`) match.
    - Spec says touch "no touch screen here": see 2. It is blocked either way.
    - "about 80 lines": fine. `explicit` constructor with `(QObject*, const QVariantList&)` matches
      `decoration.h` and the fake decoration.
    - Question 3 for Paul (borders at screen edges and maximized): the consequences in 1 and 12 apply;
      mention finding 1 in the question.
