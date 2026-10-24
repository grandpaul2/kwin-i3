# Review: spec-fullscreen-tree.md (a fullscreen window stays in the tree), 2026-10-24

Read against KWin 6.7.5 (`src/` files fetched into the scratchpad `rev/`: workspace.cpp, activation.cpp,
layers.cpp, window.cpp, xdgshellwindow.cpp, x11window.cpp, scripting/workspace_wrapper.cpp,
wayland_server.cpp, options/kcfg; plus the copies in `kwinsrc/`: tile.cpp, manage.c) and i3 `stable`
(con.c, manage.c). Line numbers in KWin files are those of the v6.7.5 tag; `kw.js` = `src/kwin.js`,
`tree.js` = `src/tree.js`. The reverted first build was read with `git show a01e788`.
Nothing in the repo was changed except this file; no test KWin was run, nothing was loaded or committed.
Everything below is from reading; the items marked "to prove" need the test KWin.

Verdict: the diagnosis (Cause 1-3) is right and part B is sound. Part A is right in outline but its second
pass reads `w.tile`, which KWin only updates when the client acknowledges a configure, so it can loop
(finding 1). Part C's mechanics work, and KWin's order of events is friendlier than the spec fears, but the
spec's claim that leaving fullscreen focuses the newcomer is not i3's behaviour and not what the code
would do (finding 6). That one changes what Paul decided in Decision 1, so he should be asked again.
Part C also needs three guards (hidden workspace, only for `windowAdded`, non-transient floats) and the
dialog test cannot be written with today's test client.

## Answers to the six questions (short; the findings carry the evidence)

1. A: yes in outline (second pass projects without it, no empty tile, invariants pass), but only once
   `w.tile` is null, and that lags (finding 1). Geometry survives (finding 2). Joining at the end works.
2. B: `minSize < maxSize` is exactly KWin's own last test, and a Wayland window with no max returns
   INT_MAX, so it is sound. Three narrow wrong classifications (finding 7).
3. C: KWin activates the newcomer synchronously before `windowAdded` fires; handing back from the handler
   works and the fullscreen window returns to ActiveLayer. No mapping race on Wayland. Findings 4-6.
4. Decision 2: today's dialog path is float + keepAbove + KWin activation, and part C needs an exception
   only if its test is "tiled newcomer"; detection through `w.transientFor` is possible (finding 8).
5. Tests: A and B can go red on today's code; C's focus half cannot be written as the spec words it, the
   dialog check cannot be built with `testclient.py --dialog` as it is, and several cases are missing
   (finding 9).
6. Everything else: findings 10-13.

## Findings

1. **Part A's second pass depends on `w.tile`, which KWin clears only when the client acknowledges a
   configure. It can loop, or log an INVARIANT. Severity: must fix (or prove in the test KWin first).**
   Spec: "`refused` set so the reconcile runs one more pass, which projects without it, as `visibleLeaf`
   already does for a fullscreen window without a tile."
   Source: `visibleLeaf` is `w.fullScreen && !w.tile` (kw.js:128-131). The scripting `tile` property is
   `Window::m_tile` (window.cpp:3745-3747), set only by `commitTile` (window.cpp:3730-3738), which the
   xdg window calls from `handleRoleCommit` for the last acknowledged configure
   (xdgshellwindow.cpp:849-855; the tile travels in the configure, `configureEvent->tile =
   m_requestedTile`, :830). `Tile::unmanage` only sets `m_requestedTile` (window.cpp:3755-3790). So after
   `unmanageFrom` in pass 1 (kw.js:427-430), `w.tile` still points at the old tile until the client
   acks. Pass 2 is scheduled with a zero timer (kw.js:85-93, 445); a GTK or Firefox ack needs a round trip
   to another process. Pass 2 can therefore still see `w.tile` set, keep `b` in the projection, rebuild
   every tile again (a and c unmanaged and managed), be refused again (`refused = true`) and schedule
   again, until the ack lands. If no configure goes out at all (a lone root tile has no anchors, so the
   tiled-edge bits of `doSetQuickTileMode`, :907-932, may not change; the geometry restore `moveResize` may
   be a no-op), `w.tile` stays set and the loop does not end. Same stale value makes
   `checkInvariants` (kw.js:544-546) log "window b not in its tile" because `expected[b]` is null.
   The first build's test passed, which says the headless client acks fast, not that Firefox does.
   Suggest: do not read KWin's lagging state for kwin-i3's own decision. Keep a table
   `outOfTiles[id(w)] = true`, set in `manageInto` on the fullscreen refusal, cleared when `fullScreen`
   goes false (`fullScreenChanged`, kw.js:662) and in `dropWindow`; `visibleLeaf` = not minimized and not
   (`w.fullScreen` and (`!w.tile` or `outOfTiles`)). Then pass 2 is deterministic. In the test, count
   `TREE 1` lines after the newcomer (expect 2) so a spin shows as red, and wait for `w.tile === null`
   before asserting the geometry.

2. **Geometry through the unmanage and back: survives, with one caveat. Severity: note.**
   Spec: "The model is untouched... When fullscreen ends... the existing join path manages it into its tile."
   Source: `unmanageFrom` keeps `frameGeometry` for a fullscreen window and writes it back after
   `tile.unmanage` (kw.js:192-198), because `Window::requestTile(nullptr)` moves the window to
   `geometryRestore()` (window.cpp:3777-3790). That is the path fuzzer I9 used and test 51 covers
   (`51-input.sh:29-38`: the window keeps 1280x720 on the other monitor). `fullscreenGeometryRestore`
   is separate, set only in `setFullScreen` (xdgshellwindow.cpp:1737-1760) and untouched by the unmanage,
   so on exit KWin restores the frame the window had when fullscreen began (the old tile's rectangle),
   as the spec's Risks say. At exit `isRequestedFullScreen()` is already false when `fullScreenChanged`
   fires (the request flag is set first, :1737), so `Tile::manage` (tile.cpp:377-379, `isResizable`
   xdgshellwindow.cpp:682-692) accepts it in the rebuild; the existing join path works. Caveat: `w.fullScreen`
   (`m_isFullScreen`) also lags the request (:1501), which is the "pending" window the spec already leaves
   alone.

3. **Two refusal reasons, only one is fullscreen. Severity: should fix (text and a guard).**
   `Tile::manage` also returns false when the window is not on the tile's desktop (tile.cpp:391-395). A
   refused window with `w.fullScreen` true is now never floated, whatever the reason; one refused for the
   desktop (a relocate in progress, a window moved to another workspace while fullscreen) will stay out
   of the tiles for the whole fullscreen and no longer float. That is probably fine, but the spec says
   "refused fullscreen" as if resizability were the only cause. State it, and keep the log line honest
   (it says "out of the tiles until it ends").
   Also `floatWhatCannotFit` (kw.js:470-488) chooses the window to float from `model.leaves(ws)` with only
   a `minimized` test (kw.js:481), not `visibleLeaf`. `project` already leaves an out-of-tile fullscreen
   window out (kw.js:473), so when the others cannot fit, `worst` may still pick the fullscreen window
   (ties go to the later one in the tree) and float it: the capture's symptom by a third door. This is
   latent today for the I9 window too. Use `visibleLeaf(leaf)` there. Same check for `readBack`
   (kw.js:560-566): an out-of-tile window's extent is its fullscreen frame, so a resize drag on a
   neighbour while it is out of the tiles inflates its share.

4. **Part C, KWin's order of events: the newcomer is already active when `windowAdded` fires, so the
   hand-back runs after, synchronously. The "newcomer not yet mapped" worry does not apply on Wayland.
   Severity: confirmed; spec text to correct.**
   Source: `WaylandServer::registerWindow` emits `windowAdded` only when `readyForPainting` is true, or on
   the signal that sets it (wayland_server.cpp:243-252). `Workspace::addWaylandWindow` then computes
   `shouldActivate` (workspace.cpp:930-934), calls `activateWindow(window)` (:948) and only after that
   `Q_EMIT windowAdded` (:954). So when `adoptWindow` runs, `w.active` is already true (kw.js:612 uses
   exactly that) and `windowActivated(newcomer)` has already fired, which kwin-i3 ignores because the
   window is not in `wins` yet (kw.js:1096-1098). Setting `workspace.activeWindow = fs` goes to
   `Workspace::activateWindow` directly (scripting/workspace_wrapper.cpp:260-263): no `mayActivate`, so
   focus-stealing prevention does not apply to the script. In order: `raiseWindow(fs)` (activation.cpp:308),
   `requestFocus` (:341; it activates the window's modal dialog instead if it has one, :373-376),
   `setActiveWindow(fs)` (:223-278): newcomer `setActive(false)`, fs `setActive(true)`, which calls
   `updateLayer()` for both (window.cpp:474-501), and `belongsToLayer` puts fs back in `ActiveLayer`
   because `isActiveFullScreen` is true again (window.cpp:580-582, 2280-2290). Then
   `windowActivated(fs)` reaches kwin-i3's handler, which does `focusWin(fs)` (kw.js:1096-1098,
   tree.js:726-730). No frame is painted in between: it is one call stack inside one event-loop turn.
   One observable: the newcomer's client gets keyboard enter then leave, and fs gets a deactivated then
   activated configure, in one turn (to prove: that Firefox does not leave its fullscreen on a brief
   deactivate; its pref `full-screen-api.exit-on.windowRaise` is the one to look at).
   X11 (Xwayland) windows: `createX11Window` activates inside `manage` (x11window.cpp:829) before
   `windowAdded` (workspace.cpp:873), so the same order. Nothing needs `readyForPaintingChanged`
   (kwin-i3 only connects it after adoption, kw.js:654, so it does not fire for the first ready anyway).
   Default focus-stealing prevention is Low (kwin.kcfg:112-113, `Low = 1`, options.h:58-64; neither
   Paul's kwinrc nor the test kwinrc, tools/testkwin.sh:85-101, sets it), and Low "always activates new
   windows" (workspace.cpp:932). So on Paul's desktop and in the tests the newcomer is always activated.
   If he raised the level, a newcomer without a token is not activated and KWin itself restacks it under
   the active window (`restackWindowUnderActive`, workspace.cpp:939; layers.cpp:531-551): the hand-back
   then sees `activeWindow === fs` and does nothing, which is correct, so condition it on `w.active`.
   Alternative to the in-handler hand-back: leave `model.focused` alone and rely on `wantFocus()` to run
   `applyFocus` at the end of `flush` (kw.js:101-114, 741-778). Safe but one timer later, so fs loses
   ActiveLayer for a turn that may paint; prefer the synchronous call and keep `wantFocus()` as a
   backstop.

5. **Part C needs three guards the spec does not give. Severity: must fix (first), should fix (others).**
   a. **Hidden workspace.** `Workspace::activateWindow(fs)` switches desktops when fs is not on the
      current one (activation.cpp:309-322, policy `SwitchToOtherDesktop`). A newcomer that KWin activated
      on a workspace that is hidden (an app opening on its own desktop, a window moved there) would drag
      the user to the fullscreen window's workspace. Only hand back when the workspace is shown on its
      monitor (`Workspaces.showing(ws.num)` / `currentDesktopForScreen(outputOf(ws)) === deskOf(ws.num)`),
      the same trap `applyFocus` already comments (kw.js:767-775).
   b. **Only from `windowAdded`, not from `adoptWindow`.** `adoptWindow` is also called from
      `reclassify` (kw.js:635, on caption/class/transient/ready changes), from `desktopsChanged`
      (kw.js:676) and at start-up for every window (kw.js:1089-1090). Any of those with `w.active` true
      and a fullscreen window on the workspace would pull focus away from a window the user is using
      (at a reload the active window is adopted this way). Wrap the signal connection
      (`workspace.windowAdded.connect(guard("windowAdded", function (w) { adoptWindow(w); handBack(w); }))`,
      kw.js:1094) or pass a `fresh` flag, and skip `model.focusWin(key)` at kw.js:612 in the hand-back case.
   c. **Floating non-transient newcomers.** The spec limits C to "tiled (not a floating transient)".
      i3 gives focus to a new window under fullscreen only for a transient of the fullscreen window
      (manage.c:451-460 in the copy under `kwinsrc/`: `PDF_SMART` sets `set_focus` by
      `con_find_transient_for_window(nc, fs->window->id)`); a fixed-size or rule-floated window that is
      not its dialog gets no focus either. As written, a calculator or a `floatingClass` window opening
      over a fullscreen game is shown and focused (KWin's way). Decide: follow i3 (hand back for every
      newcomer except a transient chain of fs) or write the exception down in the plan. The first is
      simpler to code: the one exception is the dialog test in finding 8.

6. **Leaving fullscreen does not focus the newcomer in i3 or in this design; the spec's claim and test
   are wrong, and Decision 1's reasoning rests on it. Severity: must fix, re-ask Paul.**
   Spec: "it is next in the focus order, so leaving fullscreen shows it and focuses it" (Decision 1a);
   test: "`b` leaves fullscreen. Expect `H[a b c]` in thirds, `c` focused under 1(a)"; Part C: "so
   `nextFocused` picks it when fullscreen ends".
   Source: i3's `con_toggle_fullscreen` / `con_disable_fullscreen` / `con_set_fullscreen_mode` change the
   mode and the window property and nothing else (con.c:1188-1203, 1295-1308 in the fetched copy); the
   comment in manage.c "will be focused after we return from fullscreen mode" describes the focus
   stack's order, which is used when the fullscreen window closes or focus moves, not when fullscreen is
   toggled. In kwin-i3 the handler only calls `model.setFullscreen` and schedules (kw.js:662-666;
   tree.js:734-742); `nextFocused` is called only from `closeCon` and `moveToWorkspace` (tree.js:264,
   552). After leaving fullscreen `b` stays focused and tree text is `H[a b* c]`, not `H[a b c*]`. A test
   that expects `c*` would only pass if new code moved focus, which is a deviation from i3.
   What is true and worth keeping: when `b` is *closed*, the model picks `c` (second in the stack) via
   `closeCon -> nextFocused` (tree.js:144-153, 264-268). But `activateNextWindow` runs first, and with
   `NextFocusPrefersMouse=true` (Paul's and the test kwinrc) KWin prefers the window under the pointer
   (activation.cpp:453-459), then `windowActivated -> focusWin` makes that the model's focus before the
   close handler runs (kw.js:1095-1098; `closeCon` only applies `nextFocused` when the closed one is
   still `focused`, tree.js:264). With three or more windows the pointer decides, as for any close today.
   Questions for Paul (replaces the spec's wording of 1a): leaving fullscreen keeps focus on the
   fullscreen window as in i3 (recommended, no code), or should it focus the newcomer (a deviation, needs
   code in `fullScreenChanged`)? The displayed result differs only in who has the keyboard.
   Model side for the "second" slot: `M.open` attaches with `parent.focus.push(con)` at the tail
   (tree.js:182-192, 244); with the hand-back skipping `focusWin` the new leaf stays last. Insert it after
   `parent.focus[0]` when `fullscreenOn(ws)` exists (i3's `TAILQ_INSERT_AFTER(first)`), mirroring manage.c
   including "if first !== nc". If KWin's activation were observed first (`focusWin(newcomer)` then
   `focusWin(fs)`) the order would come out the same by itself, but the hand-back is meant to skip the
   first call, so the explicit insert is needed. `fullscreenOn` is private to tree.js (tree.js:80); expose
   it for the handler, or let `open` do both jobs and return whether it applied. Add a unit test in
   `tests/unit/tree.test.js` (cheap, can go red) and a mutant in `tests/unit/mutate.py`.
   `permitsFocusing` does not fight any of this: it is consulted only by `focusDir` (tree.js:705, 707) and
   `moveToWorkspace` is separate (tree.js:557-565); `activate` and `focusWin` (tree.js:207-210, 726-730)
   never call it. So the spec's question "does it block activate()" is no.

7. **Part B: sound; three narrow misclassifications. Severity: note (the first two to put in Risks).**
   `XdgToplevelWindow::isResizable` is: false if requested fullscreen; false for special windows; false
   if a rule forces the size; then `min.width < max.width || min.height < max.height`
   (xdgshellwindow.cpp:682-692). B copies the last line, so for a Wayland toplevel it agrees with KWin
   except for the first three. `maxSize()` returns INT_MAX per axis when the client sets none, and the
   result is `expandedTo(minSize())` (xdgshellwindow.cpp:634-639), so "no max" is `min < INT_MAX` true and
   a fixed-size client (min = max) is false. `minSize()` is expanded to 150 (decorated) or 20
   (:628-632); it never makes a fixed-size window look resizable because `max` is raised to it too.
   Wrong in these cases:
   - A KWin window rule forcing the size (the spec's "odd case"): tiled in the model, refused by KWin.
   - X11 windows: `X11Window::isResizable` also fails for `!hasNETSupport() && !m_motif.resize()`
     (x11window.cpp:3456-3458) and for forced positions on some gravities (:3469). A Motif-no-resize
     legacy or Wine window with `min < max` that goes fullscreen is classified "tile" by B but refused by
     `Tile::manage` when fullscreen ends (reclassify does not fire at that moment), and is then floated
     by `manageInto` (the old behaviour for it, one step later). Acceptable.
   - Pending fullscreen (requested, not applied: `resizeable` false, `fullScreen` false, `isRequestedFullScreen`
     is not a scripting property) still reads "float". A caption change in that short window floats a
     tiled window, and a newcomer rebuild in it floats too (A needs `w.fullScreen`). Narrow, already
     recorded as a known limit; a window opened already fullscreen (mpv --fs, a game) arrives with the
     request set before it is ready and may hit the same at `adoptWindow` (kw.js:600): prove with a
     client that maps fullscreen (`testclient.py` cannot; see 9).
   `w.minSize`/`w.maxSize` are already read in `dump` (kw.js:1006), so they exist in the API.

8. **Decision 2 (a dialog of the fullscreen window): today's path, and what C must not do. Severity:
   should fix (specify the detection).**
   Today: `Rules.classify` returns "float" for `w.transient || w.modal` (rules.js:32), `adoptWindow`
   opens it floating with `keepAbove` (kw.js:608, 592-595); KWin activates it (Low FSP, and
   `mayActivate` is also true for a transient of the active window, activation.cpp:591-593) and the
   layer rule keeps fs on top while the dialog is in its group: `isActiveFullScreen` is true when the
   active window's `allMainWindows()` contains fs (window.cpp:2287-2289), `setActive` updates the main
   windows' layers "fullscreens go high even if their transient is active" (window.cpp:492-497), and the
   transient is stacked above its parent by a constraint, whatever layers say (layers.cpp:600-640).
   So today it works and part C must leave it alone.
   Detection: `w.transientFor` is in the scripting API (kw.js:504 already uses `d.transientFor`).
   Walk the chain: `for (var t = w.transientFor; t; t = t.transientFor) if (t === fsWindow) return true`
   (i3 follows the chain too, `con_find_transient_for_window`). A modal dialog's `transientFor` is set on
   Wayland at map; on X11 it may arrive after `windowAdded` (the `transientChanged` handler exists,
   kw.js:656). In the hand-back this means: for a window whose parent is not yet known, "transient of fs"
   can be false at `windowAdded` and true a moment later. Cheapest: `w.transient` true means "no
   hand-back" (a dialog of some other window is rare; with i3's rule it would also not get focus, but the
   KWin parent-activation case is more useful than the strictness).
   Also: `requestFocus(fs)` switches to fs's *modal* if it has one (activation.cpp:373-376). With a
   dialog open and a terminal launched, the hand-back focuses the dialog, not fs: correct.

9. **Tests: what can go red on today's code, and what the design lacks. Severity: should fix.**
   - Part A check ("no FLOAT line; tree `H[a b! c]`; b fills the monitor"): red today (the old log shows
     `FLOAT ... KWin refused to tile it`, the first build's test did go red at A). Keep the `no_float` helper
     (`^.{9}FLOAT `).
   - Part B check (retitle while fullscreen, half geometry afterwards): red today and red with A alone,
     as the first build showed; fine. `--retitle 2:rr` needs the retitle to land after the fullscreen is
     acknowledged; `wait_tree ... "H[b r*!]"` before the sleep does that.
   - Part C focus check: the spec writes the expected tree without the star ("`H[a b! c]` (focus per
     decision 1)"). State it: `H[a b*! c]` and that `workspace.activeWindow` is b (the star is the model;
     the KWin side is `kjs 'log(workspace.activeWindow.caption)'`). Then after `b` leaves fullscreen
     expect `H[a b* c]`, not `c*` (finding 6).
   - Stacking: `workspace.stackingOrder` is in the API (kw.js:1087); its last entry on the output is the
     topmost window and includes the layer sort. A pixel is the stronger test (`54-frame.sh:13-14`,
     `53-hold.sh:29-31` helpers, testclient `--color`): give b one colour, c another, read the monitor
     centre. Use both; the pixel is what Paul sees. Both are red on today's code once A is in and C is
     not (c active, fs drops out of ActiveLayer, c's tile would show through).
   - The dialog check cannot be built as written: `testclient.py --dialog` opens the dialog in `show()` at
     startup (`tools/testclient.py:90-97`), before the window is fullscreen, so nothing exercises
     "a dialog opened *during* fullscreen". Add a `--dialog-delay SECONDS` option (or a signal), then
     expect: dialog floating, active, on top (pixel), b not floated, fs layer unchanged.
   - Missing cases:
     (i) closing b with the newcomer behind it: expect `H[c*]`, c fills the monitor, no stale hold. KWin
         side of the focus is the pointer (finding 6).
     (ii) a second newcomer (`d`) while b is fullscreen: the focus stack should read b, then one of c/d;
          i3 inserts each "after first", so the *latest* comes second (`H[a b*! d c]` order by tree, focus
          order b d c). Pin the order.
     (iii) workspace switch while fullscreen (`key "Workspace 3"`, back): the focus returns to b and the
           tree is unchanged; and a newcomer opened while the workspace is hidden (Meta+Shift+2 from
           another workspace: `moveToWorkspace` has its own fullscreen branch, tree.js:557-565): activation
           must not be stolen (guard 5a).
     (iv) two monitors: fs on A, newcomer on A; and fs on A with the newcomer placed on B. KWin keeps fs
          in ActiveLayer when the active window is on another output (`!ac->isOnOutput`, window.cpp:2287),
          so the second case needs no hand-back.
     (v) leaving fullscreen under 53-hold: the exit rebuilds every tile (a, c re-managed), so it is a
         transaction of the hold effect where today's tiled fullscreen window exits with "KWin's own
         restore alone, not held" (`53-hold.sh:156-171`). Add an `between` check on the transaction count
         on exit with a newcomer (1 or 2), and the close-hold case if fs is the last window on the screen
         (53-hold section 9).
     (vi) the reload case: kwin-i3 reloaded with a fullscreen window and an unrelated active window must
          not take the focus (guard 5b).
     (vii) the spin check from finding 1 (count `TREE` lines).
   - Mutants: add to `tests/live/mutate.py` one for each of A (float again), B (old test), C (skip the
     hand-back) and to `tests/unit/mutate.py` one for the insert-second rule; the CLAUDE.md rule is that a
     test is trusted after a deliberate fault turned it red.

10. **Test 46 and the plan's known limit are unaffected, with one overlap. Severity: note.**
    `46-replug-fullscreen.sh` uses a fixed-size window whose fullscreen request is never applied
    (`fullScreen` stays false), so `manageInto` still floats it. Plan.md line 126 describes the hidden
    pending-fullscreen case as floating "where it stands"; after A a *hidden* window that did become
    fullscreen is refused for the desktop reason (finding 3) and stays out of the tiles instead. The text
    should say which of the two is the limit.

11. **`reclassify` is the other door for a different class of window. Severity: note.**
    `reclassify` for kind "float" calls `untile(w)` and `toggleFloating` (kw.js:639-644). With B in place
    the fullscreen browser stays tiled, but a window that is fixed-size and fullscreen was never tiled.
    Fine. However `connectWindow` also calls `reclassify` on `readyForPaintingChanged` (kw.js:654): for
    the first-ready of an X11 window `w.fullScreen` may be set already, so B matters there too. No action.

12. **Order of the reconcile for the capture's exact flow (A). Severity: note (hold effect).**
    The first pass builds the tile for b (kw.js:417 projects before the unmanage loop, :427-433),
    `placeWindows` is refused for b only after a and c have been managed; pass 2 then rebuilds a and c
    again (shape differs: `H[a c]` vs the three-tile shape, kw.js:420-436). That is two rebuilds for the
    one newcomer. With the hold effect watching tile changes it should be coalesced, but the spec's Risk
    about "two geometry steps" is about the exit; this one is on entry. Include it in the transaction
    count test (9 v). Could be avoided by excluding a known out-of-tile fullscreen window in `project`
    before the first pass (use the `outOfTiles` table from finding 1: once a fullscreen window has been
    refused, later reconciles do not try it; and a window going fullscreen with a rebuild pending is the
    only entrant).

13. **Smaller corrections to the spec text. Severity: note.**
    - "Tile::manage (tile.cpp:377) starts with `if (!window->isResizable() ...)`": right
      (`tile.cpp:377-379`); `XdgToplevelWindow::isResizable` is at xdgshellwindow.cpp:682, right.
    - "`Window::isActiveFullScreen`, window.cpp:2280": right; it also stays true when the active window
      is on another output (`:2287`), which is why multi-monitor needs no hand-back.
    - "focus-stealing prevention does not apply to a script": confirmed
      (scripting/workspace_wrapper.cpp:260-263 calls `activateWindow` directly), and the default is Low so
      the newcomer's activation is unconditional (finding 4).
    - Spec Order: add "unit test for `open`" and the dialog-delay option to the test client in the step
      "change".
    - `docs/plan.md` line 103 (Meta+F): "other windows on that workspace can't be focused while it is
      fullscreen" is enforced only for the keys (`focusDir`/`moveToWorkspace`); the mouse and KWin's own
      activation are not blocked. The plan line should say so once C is built.
    - Status header "Not built, not reviewed": update after this review.

## Questions Paul would need to re-answer

1. Decision 1a assumed that leaving fullscreen shows and focuses the newcomer. In i3 it does not: the
   fullscreen window keeps the focus, the newcomer is next in the focus order (used when the fullscreen
   window closes or focus moves). Keep i3's behaviour (recommended; no code), or focus the newcomer when
   fullscreen ends (a deviation)?
2. A floating window that is not a dialog of the fullscreen window (a fixed-size app, a rule-floated
   class): hide it behind the fullscreen window like i3 (my recommendation, same hand-back), or let it
   show and take focus as KWin does?
3. Decision 3 (part B in the same change) stands as proposed; no re-ask. Decision 2 (dialog unchanged)
   stands, with the detection in finding 8.
