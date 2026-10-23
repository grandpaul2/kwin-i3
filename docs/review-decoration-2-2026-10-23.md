# Review 2: spec-decoration.md revision 2 (kwini3frame), 2026-10-23

Read against KWin/KDecoration/Breeze v6.7.5 (full kwin tag cloned in the scratchpad; `kw/` = kwin `src/`).
Nothing in the repo changed except this file; nothing loaded into the live KWin.

Verdict: the R1 findings are folded in correctly (checked below). Revision 2's new focus mechanism has
**two real bugs that would make it a no-op or cancel KWin's own focus**, both found by reading the
filter and `update()` order. Both are cheap to fix in the spec. The install verification has a timing
race, and the version guard has a hole.

## Findings

1. **`Window::pointerEnterEvent(pos)` called from the filter does nothing under focus-follows-mouse.
   Severity: blocks (Paul runs FocusFollowsMouse, `DelayFocusInterval=0`).**
   Spec: in `pointerMotion`, when `pointer()->decoration()` becomes W's, call `W->pointerEnterEvent(pos)`;
   "verify `decoration()` is updated before the filters".
   Source: the order part is fine: `PointerInputRedirection::processMotionInternal` calls `update()`
   (`kw/pointer_input.cpp:286`) before `processFilters` (`:288`), and `InputDeviceHandler::update`
   (`kw/input.cpp:3688-3710`) runs `updateDecoration()` then `updateFocus()`. But `update()` ends with
   `workspace()->updateFocusMousePosition(position())` (`input.cpp:3709`), so when our filter runs,
   `focusMousePosition() == event->position`. `Window::pointerEnterEvent` (`kw/window.cpp:2838-2857`)
   calls `requestDelayFocus` under FFM only `if globalPos != workspace()->focusMousePosition()`
   (`:2853-2855`), and starts auto-raise only under the same test (`:2844`). KWin's own call from
   `focusUpdate` (`pointer_input.cpp:639`) happens inside `update()`, before the position is stored, so it
   passes. Ours is always equal: **no focus request, ever**. Check 6 (hover) would catch it, which is
   the right outcome of the watched-red plan, but the design is wrong.
   Suggest: call `workspace()->requestDelayFocus(W)` directly (public, `workspace.h:382`) after the
   checks `pointerEnterEvent` does that still apply: `options->focusPolicy() != ClickToFocus`,
   `!workspace()->userActionsMenu()->isShown()`, `W->isClient()`, not desktop/dock. Say in the spec that
   frame hover does not auto-raise (i3 has no auto-raise; Paul has none set; a floating raise happens
   on click). The delay is a `QTimer` at `delayFocusInterval()` (`workspace.cpp:1695-1703`); 0 fires on
   the next loop turn, then `requestFocus` (which also cancels the delay, `activation.cpp:~388`).

2. **`W->pointerLeaveEvent()` after KWin's own enter cancels KWin's focus request for the next window.
   Severity: should fix (breaks the common case: frame of a, then straight into client of b).**
   Spec: when the pointer goes from W's decoration "to none or another window", call
   `W->pointerLeaveEvent()`, "unless the pointer went into W's own client area".
   Source: `pointerLeaveEvent` is `cancelAutoRaise(); workspace()->cancelDelayFocus();`
   (`window.cpp:2859-2863`), and `cancelDelayFocus` drops the single global `m_delayFocusWindow`
   (`workspace.cpp:1705-1710`). Going from a's frame to b's client, KWin's `update()` has already run
   `focusUpdate(null, b)` -> `b->pointerEnterEvent` -> `requestDelayFocus(b)` before our filter; our leave
   for a then cancels it. b is never focused by that crossing (`focusUpdate` fires only when the pointer's focus window
   changes, so b stays unfocused until the pointer leaves and re-enters it). The "own client area" exception does not cover this.
   Suggest: never call `pointerLeaveEvent`. Remember the last decoration window; on a change to another
   decoration, just request for the new one (it replaces the timer, `workspace.cpp:1698`). On a change
   to "no decoration", cancel only if `pointer()->focus()` is also null (nothing else requested).
   Add a test: pointer on a's line (a active), jump into b's client: b becomes active.
   Double request when KWin later enters the same W's client is harmless: the timer is replaced, and
   `requestFocus` on the active window is idempotent (`activation.cpp:366`, "mustn't be optimised").

3. **Click: `activateWindow` is not what a client-area click runs; mirror the stock command.
   Severity: should fix.**
   Spec: `workspace()->activateWindow(window)`, then return false.
   Source: a click in a client area goes `WindowActionInputFilter` -> `window->getMousePressCommand(button)`
   (`window.cpp:1881-1903`) -> `performMousePressCommand` (`:1966-`), whose default
   `MouseActivateRaiseAndPassClick` is `raiseWindow; requestFocus; setActiveOutput(globalPos)`
   (`:2011-2015`). `activateWindow` (`activation.cpp:294-345`) raises and focuses but does **not**
   `setActiveOutput`, and adds unminimize/desktop-switch logic that a window under the pointer does not
   need. Neither path applies focus-stealing prevention (that is `allowWindowActivation`, client
   requests only), which is right for a user click.
   Suggest: `if (auto cmd = window->getMousePressCommand(event->button)) window->performMousePressCommand(*cmd, event->position);`
   (both public, `window.h:1220, 1227`). It then honours Paul's `CommandWindow1..3` and click-raise
   exactly like the client area, includes the active output (kwin-i3 may read it), and needs no
   judgement about raise. Restrict to `mods == 0` (the chord code already computes `mods`): Meta+press
   on the frame belongs to `globalWindowAction` in KWin's decoration filter (`input.cpp:1630`) and must
   not activate first. Structure: the new branch goes in `MouseChords::pointerButton` where
   `if (it == m_chords.cend()) return false;` is now (the "no configured chord" condition is exactly
   that line, so it is clean); keep the release/constraint early returns above it. Returning false lets
   the press reach `DecorationEventFilter::pointerButton` (`input.cpp:1618-1648`) normally; it re-reads
   `pointer()->decoration()`, which is unchanged by activation. i3: `click.c:277` `con_activate` for
   every click, `:279-282` raise only for a floating con. Spec text is right; "tiled raise is a no-op"
   is true for the tile layer, but note `raiseWindow` on a tiled window can lift it above an
   unrelated lower floating window it overlaps (kwin-i3 keeps floats above via `keepAbove` only where
   it sets it, `src/kwin.js:592`), same as a client-area click does today.

4. **Painting: `fillRect(rect(), colour)` is right; fill `repaintArea` for exactness at fractional
   sizes. Severity: note.**
   Verified: KWin renders four part images, each `layoutDecorationRects` strip (`window.cpp:2672-2686`),
   clipped to the dirty rect with Antialiasing on (`kw/scene/decorationitem.cpp:140-151`), translated by
   the part's snapped origin; a full fill is clipped to exactly the border. X11 uses the same
   `DecorationItem`/renderer (no second path). Shadow is a separate `DecorationShadow` item and is only
   present if `setShadow` is called; blur only via `setBlurRegion`/metadata `blur` (both unset).
   `setOpaque(true)` -> `Window::decorationHasAlpha()` false (`window.cpp:2656-2662`) -> the item's opaque
   region is the four parts (`decorationitem.cpp:219-226`): correct as long as every device pixel of
   the parts is opaque. Caveat: `rect()` has a fractional right/bottom edge when the window is a
   fractional logical size (scale 1.25); with AA on, its edge pixel can be partial while the part image
   (sized with `rounded()`, `:113-115`) includes that pixel, leaving an opaque-flagged but translucent
   pixel. `paint`'s second argument is the already device-snapped `snappedDirtyRect` (`:132-134`):
   `p->fillRect(repaintArea, colour)` is exact at every scale. Use that.
   `snapToPixelGrid` is in `<KDecoration3/ScaleHelpers>` (`breezedecoration.cpp:20`; defined in
   `kdecoration/scalehelpers.h`, namespace `KDecoration3`, `qreal snapToPixelGrid(qreal, qreal)`).
   `nextScale()` and `nextScaleChanged` are on `DecoratedWindow` (`decoratedwindow.h:286, 318`). No race
   with the configure: `setBorders` goes through `setState` on the double-buffered next state
   (`decoration.cpp:379-385`), applied when the acked configure commits; Breeze does the same
   (`breezedecoration.cpp:253, 418`).

5. **Version guard protects the install, not the update that actually breaks it.
   Severity: should fix (this is the one live-session risk).**
   Spec: record the kdecoration-devel version at build; `plugin-install` and `health-check` compare with
   `rpm -q kdecoration`.
   Source/analysis: the failure sequence is `dnf upgrade` of kdecoration -> `library=kwini3frame-<hash>`
   is already written -> next login loads the old build against the new library with no IID check
   (`org.kde.KPluginFactory`, confirmed in review 1) -> possible crash at the first window, every login.
   An install-time check never runs in that sequence; `health-check` runs after login, if the session
   is even up. A plugin cannot guard itself by returning null: `DecorationBridge::createDecoration`
   dereferences the result (`decorationbridge.cpp:243-244`, no null check).
   Better signals: (a) the build gets the version for free: `ecm_setup_version(... VARIABLE_PREFIX
   KDECORATION3 ...)` (kdecoration `CMakeLists.txt:31`) installs `kdecoration3_version.h`
   (`KDECORATION3_VERSION_STRING`, `:88`) and `find_package(KDecoration3)` sets `KDecoration3_VERSION`;
   pass it as a compile definition and as the file the build records, instead of parsing rpm. (b) The
   installed library's own version is its file name: `libkdecorations3.so.6.7.5` (target `VERSION`,
   `kdecoration/CMakeLists.txt:49`), so `readlink -f` of the soname is the runtime truth, not rpm.
   (c) Check **before KWin starts**: the existing systemd drop-in for KWin's unit can add an
   `ExecStartPre=` script that, if the embedded version differs from the soname's, runs
   `kwriteconfig6 ... library org.kde.breeze` (or the Aurorae id while it exists). That closes the
   crash-loop instead of documenting recovery. Keep the TTY recovery command (confirmed correct:
   `library` key, group `org.kde.kdecoration2`, `decorationbridge.cpp:~190`, read by `readPlugin`).
   Also note the soname is `.so.6`, so the real ABI promise is per major; the minor/patch check is
   deliberately stricter than KDE's promise and will fire on every Plasma point release. Say so, so
   nobody loosens it later.

6. **Install verification races KWin's reconfigure debounce. Severity: should fix.**
   Spec: after `busctl ... reconfigure`, `supportInformation` "must show `Plugin: kwini3frame-<hash>`";
   if it still shows the old id, exit 1.
   Source: the D-Bus `reconfigure` only starts a 200 ms single-shot (`workspace.cpp:998-1001`);
   `slotReconfigure` (`:1007`) emits `configChanged` -> `DecorationBridge::reconfigure`
   (`workspace.cpp:165`). The call returns before any of it runs, so an immediate check reads the old
   id and the script reports a false failure (live, with the flash already happening). Same for test
   check 0 and test 7 (switching back and forth).
   Format confirmed: `b.append("Plugin: %1\n".arg(m_plugin))` (`decorationbridge.cpp:274`); `m_plugin` is
   set only on a successful `initPlugin` (`:132`), and `reconfigure` keeps the old id when the load
   fails (`:166-171`), so it does reflect the live state. `supportInformation` is one D-Bus string;
   `busctl` prints it with `\n` escapes, so do not anchor with `^`: match `Plugin: <id>\n` as a fixed
   string (`grep -F`), and include the trailing `\n` so a prefix id cannot match.
   Suggest: poll up to ~3 s (tests: `poll`, `lib.sh:29`), then fail.

7. **Test plan and harness. Severity: mostly notes; three should-fix.**
   - Check 3 vs the new click focus: "right press and release on the line: `activeWindow` unchanged" holds
     only if a is already active. State it (hover will have made it so). Spec is otherwise consistent.
   - Check 6 hover: no need to approach from outside. `abs X Y` is an absolute libei move
     (`tools/ei-send.c:101`), so the pointer jumps straight onto x = 0 and `update()` finds the frame at
     the new position (`findToplevel`, `input.cpp:3696`). Start with the pointer inside b's client so
     "without entering a's client" is true by construction. The test KWin has
     `FocusFollowsMouse`, `DelayFocusInterval=0` (`testkwin.sh:70-73`), the same as Paul's live
     `kwinrc`, so finding 1 is testable as written. Add: a's line -> jump into b's client: b active
     (finding 2). Add: a's line -> jump to empty space/other output: no focus change.
   - Check 6 parked-pointer click: make b active without moving the pointer by kjs
     `workspace.activeWindow = w` (as `20-rules.sh:22`); FFM does not refocus without motion
     (`pointerEnterEvent` runs only on a focus-window change). The floating-raise case needs no
     kwin-i3: two plain overlapping clients, read `workspace.stackingOrder` via kjs.
   - Check 7 will be flaky under kwin-i3: tiles' client size changes between Breeze (28 px title bar,
     150 px minimum) and the frame, and `frameMin`/`refit` (`src/kwin.js:253, 361`) may move tiles.
     Assert geometry unchanged only for floating/plain windows, or assert "after, geometry equals what
     kwin-i3 settles on" with a poll. Both switches need the poll of finding 6. Scenario budget:
     `run.sh:17` kills at 110 s; with ~25 checks, two reconfigures and an `abs`-heavy drag set, watch it.
   - Check 2 pixels: `shot.py capture` uses `native-resolution` and includes decorations; `shot.py same`
     on (0,y) and (639,y) is fine at scale 1.
   - Scale: `kwin_wayland --scale <s>` exists (`main_wayland.cpp:351-354, 520-527`) and is passed to the
     virtual outputs (`:546-549`), so one scale-2 run of check 2 is feasible (add `KI3_SCALE` to
     `testkwin.sh:135`). `--width/--height` are device pixels, so logical coordinates halve at scale 2.
   - `KI3_FRAME` for the fuzzer is feasible as described: `testkwin.sh` writes kwinrc from a heredoc
     (`:62-80`); append `[org.kde.kdecoration2]\nlibrary=kwini3frame` when the env is set and the .so
     exists under `$KI3_PLUGIN`; `run.py` sets the env. `inject.py` needs no new op (no wheel needed).
   - Watched-red additions: F = leave guard from finding 2 left as in rev. 2 (the b-client crossing
     test goes red); G = click branch removed (click test red) separately from hover; E as written
     catches finding 1 only if hover is tested with the real policy (it is).
   - Check 5 is positive now and fault C turns it red: good.

8. **Dependency between the two plugins. Severity: should fix (small).**
   The frame's focus behaviour lives in kwini3mouse, whose IID carries the exact KWin version
   (`org.kde.kwin.PluginFactoryInterface6.7.5`), while the frame has no IID check. After a KWin point
   release, if kwini3mouse is not rebuilt it is refused, the frame still loads, and clicks and hover on
   the line silently stop focusing. `health-check` should assert `kwini3mouse` is in `LoadedPlugins`
   whenever the frame is the configured `library=`; README should say the pair is rebuilt together.

9. **R1 fold-in check. Severity: note (all confirmed).**
   R1-1 (hover and click dead; do it in kwini3mouse): folded, but the mechanism has findings 1-3.
   R1-2/R1-3 (touch/tablet blocked; section handling): correct as written. R1-4 (`setTitleBar` empty ->
   `TitleBarArea`): correct. R1-5 (fills, snap, opaque): see finding 4. R1-6 (init order,
   `qOverload`, `bool init`, no pre-fill): correct. R1-7: see finding 5. R1-8 (id from file name, no
   `Id`, `KDECORATION_PLUGIN_DIR`, who writes `library=`): correct. R1-9 (verify via
   `supportInformation`): see finding 6. R1-10 (matrix): correct, plus F/G above. R1-11 (select per
   scenario): correct. R1-12 (`frameMin` stale one tick, maximized borders, stale comment): correct.
   Small: `Window::pointerEnterEvent`/`pointerLeaveEvent` are public virtuals (`window.h:1148-1149`),
   so the spec's "public" claim is right; they are just the wrong tool here.
