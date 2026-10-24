# Review of the change: a fullscreen window stays in the tree (d0121d0, b30c300), 2026-10-24

Read against `docs/spec-fullscreen-tree.md` (with `docs/review-fullscreen-2026-10-24.md` folded in), KWin 6.7.5
(`tile.cpp`, `xdgshellwindow.cpp`, `window.cpp`, `workspace.cpp`, `activation.cpp` from the scratchpad copies) and
i3 `manage.c`/`con.c`. Nothing in the repo changed except this file; nothing loaded into the live KWin. I ran
`tests/live/run.sh 32-fullscreen-open.sh` once in the test KWin: **48 passed, 0 failed** (the commit message says 47;
the second commit added one). I did not run the rest of the suite, so the spec's "full suite green" is taken on trust.

Verdict: **the change does what the spec says, and the model/KWin ordering of the hand-back is right.** I found no path
that leaves `outOfTiles` set wrongly and no loop. There is one real hole in C (a newcomer that is itself fullscreen gets
the hand-back, finding 1), one weak test (the "no spin" check cannot fail on a spin, finding 2), and one missed cheap
route to a mutant the authors call unreachable (finding 3). The rest are notes. None needs a redesign.

## Findings

1. **A newcomer that is itself fullscreen gets the hand-back. Severity: should fix.**
   Claim: `keepsFullscreenFocus` hands the focus to the workspace's old fullscreen window even when the newcomer opens
   fullscreen (`mpv --fs`, a game, a second browser window restored fullscreen).
   Evidence: `adoptWindow` (src/kwin.js:644-651) computes `fs = keepsFullscreenFocus(...)` and calls `model.open` *before*
   `if (w.fullScreen) model.setFullscreen(key, true)` (:647). The guard (:625-629) never reads `w.fullScreen`. So `fs` is
   the old fullscreen leaf, `activeWindow = fs` hands back, and then `setFullscreen(newcomer)` clears the old one's flag
   (tree.js:747, one fullscreen per workspace). Result: KWin has two fullscreen windows; the one that is active
   (the old one) is `isActiveFullScreen` and stays in the top layer (window.cpp:2280), the new fullscreen window is
   inactive and sits in the normal layer *under* it; the model says the new one is the fullscreen window and the old one
   is not, and the focus is on the old one. The user launched something fullscreen and sees the old window. i3 would not
   do this: the newcomer is the fullscreen one and takes the (single) fullscreen slot.
   Why it matters: Paul runs games and video players. Not reproduced (testclient has no `--fullscreen`); the reading is
   from the code order above.
   Fix: `if (!fresh || !w.active || w.transient || w.fullScreen) return null;`. A unit-free live check needs a
   `--fullscreen` option in testclient (`win.fullscreen()` before `present()`); optional.

2. **"two reconcile passes, no spin" cannot detect a spin. Severity: should fix (test strength).**
   Claim (message): after the newcomer there are exactly two `TREE 1` lines and no loop.
   Evidence: tests/live/32-fullscreen-open.sh `check "two reconcile passes, no spin" poll trees_since "$m" 2`. `poll`
   (tests/live/lib.sh:29-36) returns success the first time the predicate holds, so a loop that goes 1, 2, 3, ... passes
   as soon as the count is 2, and no `sleep` follows. Review finding R-1 asked for exactly this ("a spin shows as more").
   The hidden-workspace check further down does it right: `sleep 0.5` and then `trees_at_most ... 4`.
   Why it matters: the spec's main A-risk is the loop, and the mutant for it (finding 3) cannot go red, so this check is
   the only guard and it would let a loop through.
   Fix: `sleep 0.5` then `trees_since "$m" 2` once (not polled), or the same `trees_at_most` form.

3. **The `outOfTiles` mutant is called unreachable but a SIGSTOPped client reaches it cheaply. Severity: should fix
   (documentation and a missed test), note on the reasoning.**
   Claim: tests/live/mutate.py's note says the loop could not be produced: the client "answered at once" and "the
   acknowledgement still arrived" on a hidden workspace.
   Evidence: the mechanism in the spec is right and I confirmed it in source: `Tile::unmanage` only does
   `requestTile(nullptr)` (tile.cpp:427-436); `w.tile` is the committed tile and changes in `Window::commitTile`
   (window.cpp:3728-3738), i.e. when the client acks the configure. A client that never acks keeps `w.tile` set. The
   test client acks promptly, so the mutant survives. `kill -STOP` of the test client after `b` is fullscreen and before
   `c` opens makes the ack impossible (a real equivalent is a Firefox busy in a long script). With the mutant
   (`visibleLeaf` by `w.tile` alone) pass 2 sees the stale tile, rebuilds, is refused, schedules again: a loop. With the
   real code it stays at 2 passes. Then `kill -CONT`.
   The reasoning that it is "unreachable" is therefore not sound; it is "not reached by a client that acks". The note
   should say what was tried and that SIGSTOP is the untried route. Note that this only matters together with finding 2:
   a SIGSTOP test needs the non-polled pass count.
   Not run by me (needs a mutant build in a worktree, which this review may not do).

4. **The hand-back reaches a fullscreen window's modal dialog correctly, but gotoWorkspace now bypasses a floating focus.
   Severity: note.**
   Evidence: `workspace.activeWindow = fs` goes through `Workspace::activateWindow` then `requestFocus`, which redirects
   to `window->findModal()` (activation.cpp:373-381). So with `p`'s modal dialog open and a newcomer arriving, the
   hand-back to `p` lands on the dialog, which is what one wants (the dialog test does not cover this combination; the
   behaviour comes from KWin). In `gotoWorkspace` (src/kwin.js:884-893) `model.activate(fs || descendFocused(ws))` now
   sets the *model* focus to `p`, while KWin ends up activating the dialog through the same redirect; the model and KWin
   differ until the next `windowActivated` or `focusedCon()` (which re-reads `workspace.activeWindow`, so keys self-heal).
   For a non-modal floating window of the fullscreen app that was last focused, Meta+N back now focuses the fullscreen
   window, not it. That matches i3 (`con_fullscreen_permits_focusing`), so no change needed; say so in the plan row.
   Floating fullscreen: `setFullscreen` requires `con.type === "con"` (tree.js:744), so a floating window is never
   `model.fullscreenOn`, and `gotoWorkspace`, `keepsFullscreenFocus` and part A do nothing for it. Unchanged from before.
   An empty workspace: `fullscreenOn` returns null and the old path runs. `applyFocus` is unaffected (it takes the model's
   focus as before and does its own desktop handling).

5. **A newcomer adopted late (ignored, then reclassified) keeps KWin's focus over a fullscreen window. Severity: note.**
   Evidence: `reclassify` calls `adoptWindow(w)` (src/kwin.js:~655) with `fresh` undefined, as the spec wants (R-5b). A
   window that is "ignore" or has no workspace at `windowAdded` (class or transient set after it appears; the code
   comments say this happens) is activated by KWin at add time, adopted later, and never gets the hand-back. Rare, and
   the cost is the old behaviour (the window shows over the fullscreen one). Accept; the plan text could say "a window
   KWin identifies late is not handed back".

6. **Deviations of the code from the spec, all benign. Severity: note.**
   - Spec C says the hand-back sits in the `windowAdded` connection, "never inside `adoptWindow`". The code puts it in
     `adoptWindow` gated by `fresh` (src/kwin.js:625-651, :1140). Equivalent for the three other callers; one more
     argument is needed in the file's comment only.
   - The spec's walk over `w.transientFor` became `w.transient` (documented in "Deviations", so not a finding). Nothing
     in `tests/live/32` covers a transient of a different app.
   - The spec's hold test list includes "the close hold when the fullscreen window is the last on the screen"; 53-hold.sh
     section 8 has entry and exit counts only. Missing, not a correctness risk.
   - Spec status text says 47 checks; there are 48.
   - The `!shown` guard of the hand-back is dead code in practice (mutants note, 2026-10-24): KWin's own activation
     switches the desktop first, so `w.active` and "hidden" do not co-occur, and the test that sends a window to a hidden
     workspace goes through `desktopsChanged` (`fresh` false), not `windowAdded`. Harmless; the mutant note's reasoning is
     sound here. The note could add "or `w.active` is false" as the reason it cannot fire.

## The questions

**1. Does the code do what the spec says, part by part?**
- A: yes. `outOfTiles` set in `manageInto` (:187-196), `refused = true` hoisted above the early return (so one more pass,
  correct: the pass-1 build created an empty leaf tile for the window, which pass 2 must remove; `checkInvariants` is
  skipped in pass 1 because `refused`), cleared in the `fullScreenChanged` handler (:702) and `dropWindow` (:665);
  `floatWhatCannotFit` (:496) and `readBack`'s `extent` (:580) use `visibleLeaf`.
- B: yes. `fixedSize` (rules.js:25-33) matches KWin's own last test (xdgshellwindow.cpp:693-695); the pending case
  (fullScreen false, resizeable false) is unchanged.
- C: yes, with finding 1 and the placement deviation of finding 6. `M.open` inserts second with i3's guard (tree.js:251).
- Deviations section: `gotoWorkspace` and the reload limit are implemented as written. One statement in the spec is now
  out of date: "Nothing is done to a window already floating from the old behaviour": with B, a model-floating window that
  is fullscreen classifies as "tile" on its next caption change and `reclassify` re-tiles it (it is then refused and
  becomes out-of-tiles). Beneficial (it undoes the old fault), but not what the sentence says.
- In the code, not in the spec: the `refused = true` move (needed), the log lines, `M.fullscreenOn` as an accessor
  (the spec offered it). Nothing else.

**2. Correctness of A.** Paths I tried, none wrong:
- Leaves fullscreen while its workspace is hidden: the signal handler is independent of the desktop; it clears the record
  and schedules; the reconcile then manages it (a refusal now floats it, the documented hidden-workspace limit).
- Fullscreen, refused, leaves, fullscreen again: the second entry finds `w.tile` null (unmanaged) so `visibleLeaf` is
  false by the old test; if a stale `w.tile` is still set, one pass rebuilds, is refused, and re-sets the record. Self
  healing, no loop (every refusal sets it).
- Floated or moved to another workspace while out of tiles: the record stays with the window until fullscreen ends or it
  is dropped, which is right (it stays untileable).
- A fullscreen window with a tile and no newcomer: untouched (`visibleLeaf` true, no refusal).
- `checkInvariants` (src/kwin.js:556-562) skips non-`visibleLeaf` leaves, so it stays quiet; confirmed by `clean_log` in
  the run.
- `refused = true` before the early return: right. One more pass is exactly what is needed (see above); it terminates
  because the record makes pass 2 refusal-free.

**3. Correctness of C.**
- Moment: `model.fullscreenOn(ws)` before `model.open` is right (the newcomer is not yet a leaf; `fs.win === id(w)` is
  unreachable for a new window and is only a guard). Reading it before `setFullscreen` is the cause of finding 1.
- Order with KWin: confirmed in `workspace.cpp` (the scratchpad copy): `activateWindow(window)` at the end of
  `addWaylandWindow`, `Q_EMIT windowAdded(window)` after it. KWin's `windowActivated(newcomer)` is emitted *before* the
  script knows the window, so the handler's `wins[id(w)]` test skips it and the model never focuses the newcomer. The
  hand-back then runs in the `windowAdded` handler, synchronously, and its `windowActivated(fs)` → `focusWin(fs)` →
  `activate(fs)` → `focusUp` moves `fs` to the head of every stack on its path; the leaf `M.open` put second stays second.
  The unit test and `check "H[a b*! c]"` agree. If the fullscreen window was not first in its parent's focus stack (an
  unusual state), the newcomer goes behind the *first*, as in i3 (`TAILQ_INSERT_AFTER(first)`), and `focusUp` then puts
  `fs` first: also i3.
- `permitsFocusing` is not consulted by `activate`/`focusWin`, so nothing fights the hand-back.
- A transient newcomer (`w.transient`) gets no hand-back, as decided. A transient of another application also gets
  KWin's focus and shows over the fullscreen window (KWin's layer rule only keeps the parent on top for its own
  transients); accepted by the spec's "cheap reading".
- gotoWorkspace: see finding 4. Empty workspace and floating fullscreen are fine.

**4. B.** Nothing new. `minSize`/`maxSize` exist on the scripting `Window`; a client that sets no maximum reports the
INT_MAX default so the `<` test reads "resizable". The one new reading is the case in finding 6 (re-tiling a floating
fullscreen window on a caption change).

**5. The tests.**
- Checks and messages agree, with the exception in finding 2. The pixel plus stacking pair in A is good. "b is out of the
  tiles" tests `w.tile === null` (KWin's view), not the record, which is fine as an effect check.
- Spec test list: second newcomer's focus order is in the unit test (yes); the stacking check (yes); the hold counts
  (entry and exit yes, the close hold no, finding 6).
- The bound "at most 4 passes" on the hidden workspace is a reasonable spin detector (a loop is unbounded, and the
  reconcile timer is fast) but not tight; the shown-workspace check, which is `== 2`, is the one that needs the sleep.
- Reload section: `H[c e p!]` reads as an accepted limit and does not hide a bug I can find. After a reload the record is
  empty, `p` has no tile, the rebuild adopts it after the focus, a first pass has p refused and re-recorded, and `p!`
  proves it stayed fullscreen. What it does not check is that `p` is still on top and active after the reload; that the
  position is lost is real but harmless. It matters for deployment: **reloading kwin-i3 while a fullscreen window has
  newcomers behind it reorders the tree** (the reload is Paul's normal deploy step).

**6. The two mutants called unreachable.**
- `outOfTiles` ignored: not sound as "unreachable" (finding 3); SIGSTOP of the test client reaches it.
- Hand-back only on a shown workspace: the reasoning is sound (activation switches the desktop first, and `w.active`
  would be false where it does not). It is dead code, kept as a safeguard. No cheap route short of a KWin window rule
  forcing a desktop, which would test KWin, not this guard.

**7. Risks for the live desktop.**
- Firefox and the hand-back: from source, the fullscreen window's xdg states do *not* flap. `setActive(false)` and
  `setActive(true)` both only change `m_nextStates` and call `scheduleConfigure()`, a single timer
  (`XdgSurfaceWindow::scheduleConfigure`, xdgshellwindow.cpp:107-112), so the client gets one configure carrying the
  net state (still activated). What it does get is a `wl_keyboard.leave` and `enter` in one dispatch (inferred from KWin
  following the active window; I did not read the keyboard redirect). I cannot say what Firefox's GTK/Gecko does with
  that pair; there is no source here to read. Two pieces of evidence that it is safe: Paul's capture of 23:25 shows
  Firefox *kept* fullscreen through a much longer focus loss (the terminal was active), and
  `full-screen-api.exit-on.windowRaise` concerns Firefox's own window raises, not the compositor. The one cheap test is
  Firefox in the test KWin (F11 and an HTML fullscreen video), then open a terminal. Not done (heavy, and showing a
  browser is a test-KWin matter only).
- Applications other than Firefox: SDL/Proton games treat focus loss differently; one enter/leave pair in one turn is
  the smallest possible.
- What Paul will notice: a window that opens while something is fullscreen is no longer visible and does not take the
  keyboard (i3's rule, decided). A launcher or a dialog from another app (a Plasma/KDE dialog not marked transient, a
  password prompt, a GTK portal file chooser opened without a parent) now appears *behind* the fullscreen window. The
  ignore list covers spectacle, krunner, polkit, the logout greeter, plasmashell, so those are safe. Meta+N or leaving
  fullscreen reveals the rest. This is the price Paul chose in decision 5 and worth saying again at deployment.
- The hold effect: the hand-back changes no geometry, the measured transaction counts are 1-3 and 1-2, and
  the 53-hold section passes. The tree fixed there (`H[c! h*]`) shows the earlier expected trees had the focus on the wrong
  window; that is a test correction, not a behaviour change.
- Not worse than today if deployed: the old behaviour floated the fullscreen window over everything, which this removes.
  The new risks are finding 1 (fullscreen newcomer behind an old one) and the hidden-newcomer visibility above.

## Ready?

**Ready for Paul to decide about deployment after the one-line fix in finding 1 and the test fix in finding 2** (both
small; finding 3's SIGSTOP test would be a good addition and is optional).

Paul must decide or be told:
- Told: deploying means a reload (windows re-tile once); a reload with a fullscreen window that has newcomers behind it
  reorders that workspace's tree (the fullscreen window lands after the focus).
- Told: any new window that is not the fullscreen app's own dialog opens behind a fullscreen window and without the
  keyboard; ignored apps (spectacle, krunner, polkit) are exempt; the mouse is not blocked.
- Told: Firefox's reaction to the keyboard leave/enter pair is unverified; the first fullscreen session after the
  reload is the test (a fix is `permitsFocusing`-style opt-out, or a one-line disabling of the hand-back).
- Decide (optional): whether Meta+N back to a workspace focuses the fullscreen window rather than its floating
  sibling (this is i3's rule and the code's; the plan row says it).
- Decide: whether to add the SIGSTOP test and the `w.fullScreen` guard now or after the live trial.
