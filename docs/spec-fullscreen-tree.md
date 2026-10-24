# Spec: a fullscreen window stays in the tree

Drafted 2026-10-24 from Paul's capture of 2026-10-23 23:25. Status: **decided by Paul, 2026-10-24
(1: i3's rule, 2: confirmed, 3: same change); reviewed (second agent, 2026-10-24,
`docs/review-fullscreen-2026-10-24.md`, folded in below as "R-n"); the review's two questions
decided by Paul, 2026-10-24 (4: i3's, focus stays; 5: i3's, every newcomer but the fullscreen
window's own dialog opens behind). **Built 2026-10-24** (parts A, B, C below; `32-fullscreen-open.sh`
47 checks, `53-hold.sh` section 8 extended, a unit test; found at build time: the workspace-switch
case, "Deviations" below). Full suite green (the hold effect's snapshot-timing check flaked under load, as
before). Live mutants in a worktree: four of six red (A floats again; B; C no hand-back; C's
workspace switch); two are documented in `tests/live/mutate.py` as unreachable by a test, with
the evidence (the `outOfTiles` record: KWin cleared `w.tile` before the second pass with a slow
client and on a hidden workspace alike, so the predicted loop did not occur; the hidden-workspace
guard of the hand-back: KWin's activation shows the desktop first). Next: a second agent's review
of the change; then Paul decides about deployment. Not live.**

Deviations and findings at code time:
- **Meta+N onto a workspace with a fullscreen window and a newcomer sent there while hidden**
  focused the newcomer: `gotoWorkspace` switches the desktop first, KWin activates the window it
  last used there (the newcomer, from its own focus chain) and `focusWin` takes that into the
  model before the action applies the workspace's focus, so the newcomer came out on top of the
  fullscreen window. Within this spec's rule (plan, Meta+F: other windows on that workspace can't
  be focused while it is fullscreen): `gotoWorkspace` activates the workspace's fullscreen window
  when it has one. The general case (KWin's choice on a desktop switch wins over the model's
  remembered focus when nothing is fullscreen) is pre-existing and unchanged: a question for Paul.
- **A reload** rebuilds the tree from KWin's tiles, which an out-of-tiles fullscreen window is
  not in, so it comes back at the end of its row (still in the tree, still fullscreen; it joins
  the tiles there when fullscreen ends). Accepted as a limit of reloads; the test pins it.
- **Hold effect, measured** (`53-hold.sh`): a newcomer under a fullscreen window is one
  transaction (the test allows 1-3); leaving with the newcomer, one (allowed 1-2). Two
  pre-existing expected trees in that section had the focus on the wrong window and had been
  timing out silently (5 s each); corrected.
- The transient check in the hand-back is the cheap reading from the review: any transient
  (`w.transient`) keeps KWin's focus, not only the fullscreen window's own.

A first build of parts A and B ran on Paul's desktop for a few minutes on 2026-10-23 without his
approval and was reverted (commits a01e788, d23c445). Its diff is history to read, not a build to
reuse: anything from it goes through this spec and a review first.

Sources: KWin 6.7.5 `src/tiles/tile.cpp`, `src/xdgshellwindow.cpp`, `src/window.cpp`,
`src/workspace.cpp`, `src/activation.cpp`, `src/layers.cpp`; i3 `stable` `src/manage.c`,
`src/con.c`; the capture's `state.txt`.

## The problem

Firefox was fullscreen on workspace 2 (left monitor). Paul opened a terminal there: nothing
visible. He left fullscreen: still nothing, and nothing from the launcher either. Three terminals
had in fact opened, tiled, and the active window was one of them. The capture's log:

```
23:25:19 ADD Alacritty tile ws 2
23:25:19 FLOAT World Series Game 1 Recap! ... Firefox: KWin refused to tile it
23:25:19 TREE 2 H[Alacritty*] ~World_Series_..._Firefox
```

Firefox had been turned into a floating window the size of the monitor, kept above (floating
windows are), so every tiled window behind it was invisible, and leaving fullscreen left it
floating. Dropping fullscreen later could not undo it.

## Cause

1. **KWin refuses to tile a fullscreen window.** `Tile::manage` (tile.cpp:377) starts with
   `if (!window->isResizable() ...) return false`, and `XdgToplevelWindow::isResizable`
   (xdgshellwindow.cpp:682) returns false whenever fullscreen is requested. (`Tile::manage` also
   refuses a window not on the tile's desktop, tile.cpp:389; R-3.)
2. **A newcomer rebuilds the workspace's tiles.** `reconcileNow` (kwin.js) compares the wanted
   shape with KWin's; `H[Firefox]` became `H[Firefox Alacritty]`, so it unmanaged every window,
   rebuilt the tiles and managed each window into its tile. For Firefox, `manageInto` got the
   refusal and did what it does for every refusal: `floatWindow(w, "KWin refused to tile it")`.
3. That refusal path was written for a different case (fuzzer I9: a fullscreen window dragged to
   the other monitor), and `visibleLeaf` already leaves a fullscreen window *without* a tile out
   of the layout "until fullscreen ends". The hole is a fullscreen window *with* a tile that
   loses it in a rebuild.

A second door to the same hole, not seen in the capture but in the code: `Rules.classify`
(rules.js:32) says "float" for `!w.resizeable`, and `reclassify` runs on every caption change and
floats a tiled window the rules now call floating. A browser's caption changes when a video
ends. The capture of 17:43 shows the fullscreen Firefox with `rule=float` for exactly this
reason, still tiled only because its caption had not changed while fullscreen.

A third door (R-3): `floatWhatCannotFit` picks the window to float from every leaf that is not
minimized, so a fullscreen window already out of the tiles can be the one it floats.

## What i3 does (manage.c:402-458, con.c:1188-1308)

- The fullscreen container stays where it is in the tree. A new window is inserted beside the
  focused container as usual; the layout underneath is unchanged.
- **The new window does not take focus** ("fs = %p, ws = %p, not focusing"): it is put second in
  the parent's focus stack, right after the fullscreen container. The fullscreen window keeps
  covering the output.
- **Leaving fullscreen moves no focus** (R-6): `con_toggle_fullscreen` and
  `con_disable_fullscreen` change the mode and the window property and nothing else. The
  fullscreen window keeps the focus; the newcomer, second in the stack, is what focus falls to
  when the fullscreen window closes or focus moves. (The manage.c comment "will be focused after
  we return from fullscreen mode" describes that stack order, not the toggle.)
- Exception (`popup_during_fullscreen smart`, the default): a floating transient *of the
  fullscreen window* (its own dialog, following the `transient_for` chain) is focused and shown.
  Any other newcomer, floating or tiled, gets no focus (R-5c).

`docs/plan.md` already records this for Meta+F: "other windows on that workspace can't be focused
while it is fullscreen". Today that is enforced only for the keys (`focusDir`,
`moveToWorkspace`); the mouse and KWin's own activation are not blocked (R-13). The plan line is
to say so once part C is built.

## Decisions (Paul, 2026-10-24: 1(a), 2 confirmed, 3 same change, 4 i3's, 5 i3's)

1. **The newcomer under a fullscreen window: i3's rule or KWin's?** Decided: (a), i3's rule.
   KWin keeps a fullscreen window on the top layer only while it is active
   (`Window::isActiveFullScreen`, window.cpp:2280; also while the active window is on another
   output, :2287), so this one choice sets both focus and what is visible.
   - **(a) i3's rule, decided:** the new window opens tiled behind the fullscreen window,
     without focus; it is next in the focus order. Costs part C below: KWin activates a new
     window itself, so kwin-i3 must hand focus back.
   - (b) KWin's: the new window takes focus and appears on top of the fullscreen window.
2. **A dialog of the fullscreen window** (Firefox's file picker): decided, unchanged. Today it
   floats with keep-above, KWin activates it, and KWin's layer rule keeps the fullscreen parent
   on top of everything else while its transient is active (window.cpp:2287-2289, 492-497;
   layers.cpp:600-640). Part C leaves it alone (R-8).
3. **The caption-change door (part B):** decided, same change.
4. **Decided, i3's (R-6): leaving fullscreen.** The draft said "leaving fullscreen shows it and focuses
   it", which is not i3 and not what the design does: the fullscreen window keeps the focus and
   the tree reads `H[a b* c]` after exit. Keep i3's behaviour (recommended; no code), or focus
   the newcomer when fullscreen ends (a deviation, code in the `fullScreenChanged` handler)?
   What is shown is the same either way; only the keyboard differs.
5. **Decided, i3's (R-5c): a floating newcomer that is not the fullscreen window's dialog** (a fixed-size
   app, a `floatingClass` window, a calculator). i3 gives it no focus either: it opens behind the
   fullscreen window. Follow i3 (recommended: the hand-back applies to every newcomer except a
   transient of the fullscreen window, which is also the simpler code), or let it show and take
   focus as KWin does (write the exception in the plan)?

## The change

**A. `kwin.js`, `manageInto`:** a refused window that is fullscreen is not floated. It is left
out of the tiles and the model is untouched: the window keeps its place in the tree.
- **Not by KWin's `w.tile` (R-1).** `w.tile` is cleared only when the client acknowledges the
  configure that carries the tile (`commitTile` from `handleRoleCommit`, xdgshellwindow.cpp:849-855;
  `Tile::unmanage` sets only the requested tile, window.cpp:3755), so after the unmanage in pass 1,
  pass 2 may still see the old tile, keep the window in the projection, rebuild and be refused
  again, until the ack lands or for ever if no configure goes out. So kwin-i3 keeps its own
  record: `outOfTiles[id]`, set in `manageInto` on the refusal, cleared when `fullScreen` goes
  false (the `fullScreenChanged` handler) and in `dropWindow`; `visibleLeaf` is "not minimized,
  and not (fullscreen and (no tile or `outOfTiles`))". Pass 2 is then deterministic. Once set,
  later reconciles do not try the window again (R-12: today's flow is two rebuilds for one
  newcomer; this makes it one from the second reconcile on).
- `refused` is set so the reconcile runs one more pass; a log line says so
  (`FULLSCREEN <caption>: out of the tiles until it ends`). The refusal may also be the desktop
  one (R-3: a relocate in progress, a window moved while fullscreen); it is treated the same,
  and the log line and the plan's known-limit text say so (R-10).
- `unmanageFrom` already keeps a fullscreen window's frame through the unmanage (the I9 path,
  R-2), and `fullscreenGeometryRestore` is untouched, so on exit KWin first restores the frame
  the window had when fullscreen began.
- When fullscreen ends, `fullScreenChanged` clears `outOfTiles` and schedules the workspace; the
  request flag is already false then (xdgshellwindow.cpp:1737), so `Tile::manage` accepts it and
  the rebuild puts it at its tree position.
- `floatWhatCannotFit` and `readBack` use `visibleLeaf` (R-3): a window out of the tiles is
  neither floated for size nor measured for shares.

**B. `rules.js`, `classify`:** a fullscreen window is judged by its own size limits
(`minSize < maxSize` on either axis means resizable; KWin's own last test,
xdgshellwindow.cpp:693-695, and `maxSize` is INT_MAX per axis when the client sets none, R-7),
not by KWin's `resizeable`, which is false for every fullscreen window. A fixed-size window
stays "float" whether fullscreen or not. The pending-fullscreen case (requested, not yet
applied: `resizeable` false and `fullScreen` false) is unchanged, so `46-replug-fullscreen.sh`'s
known limit is unchanged.

**C. i3's focus rule (decision 1a).** KWin activates a newcomer before it emits `windowAdded`
(`Workspace::addWaylandWindow`: `activateWindow` at workspace.cpp:948, the signal at :954; the
X11 path does the same), focus-stealing prevention is Low by default so the activation is
unconditional, and a script's `workspace.activeWindow = fs` goes straight to
`Workspace::activateWindow` (R-4). So the hand-back is synchronous inside the `windowAdded`
handler: the newcomer is deactivated, the fullscreen window reactivated and back in the active
layer, in one event-loop turn, before any frame is painted.
- **Where:** in the `windowAdded` connection, after `adoptWindow`, never inside `adoptWindow`
  itself (R-5b: `adoptWindow` also runs from `reclassify`, `desktopsChanged` and at start-up for
  every window, where it must not pull focus from a window in use). `adoptWindow` skips its
  `model.focusWin` in that case.
- **When:** the newcomer is active (`w.active`; with a raised prevention level KWin already
  restacks it under the active window and nothing is needed), its workspace has a fullscreen
  window, the workspace is shown on its monitor (R-5a: `activateWindow` on a hidden desktop
  switches desktops), and the newcomer is not a transient of the fullscreen window (R-8: walk
  `w.transientFor`; a newcomer with `w.transient` set and no parent known yet gets no hand-back,
  the cheap reading). Every other newcomer, tiled or floating, gets the hand-back (decision 5).
- **Model (R-6):** `M.open` inserts the new leaf second in its parent's focus stack when the
  workspace has a fullscreen container (i3's `TAILQ_INSERT_AFTER(first)`, including the "if
  first is not the new one" guard), so `nextFocused` picks it when the fullscreen window closes.
  `fullscreenOn` is private to tree.js; either expose it or let `open` do both and report it. A
  unit test in `tests/unit/tree.test.js` and a mutant in `tests/unit/mutate.py`.
- `permitsFocusing` is consulted only by `focusDir`, never by `activate`/`focusWin`, so nothing
  fights KWin's activation or the hand-back (R-6).
- One observable to prove: the newcomer's client gets a keyboard enter then leave, and the
  fullscreen window a deactivate then activate, in one turn. Firefox must not leave fullscreen
  on that brief deactivate (its `full-screen-api.exit-on.windowRaise` pref is the one to watch,
  R-4).

## What stays

- A tiled window that goes fullscreen with no other change keeps its tile (today's behaviour):
  KWin restores it to the tile's geometry when fullscreen ends, no reconcile needed.
- The I9 case: a fullscreen window dragged to the other monitor still joins when fullscreen ends.
- The known limit on a hidden workspace after a replug (plan, policies; test 46), reworded for
  the desktop refusal (R-10).
- Floating windows, dialogs, Meta+F itself, and the "a window that can't fit floats" rule (now
  reading `visibleLeaf`).
- Two monitors: a newcomer placed on the other monitor needs no hand-back; KWin keeps the
  fullscreen window on top when the active window is on another output (R-13).
- Nothing is done to a window already floating from the old behaviour (Paul's Firefox on
  workspace 2 that night): Meta+Shift+Space tiles it again.

## Risks

- **Part A leaves the fullscreen window out of the tiles for the rest of its fullscreen time**,
  so its neighbours fill the monitor behind it. On exit, KWin restores the pre-fullscreen frame,
  then the reconcile rebuilds the tiles with it: two geometry steps for the hold effect. On
  entry, today's flow is two rebuilds (R-12). Both counted in the test.
- **Part B changes a classification** (R-7): a KWin window rule forcing a size, and an X11
  window without NET support or with Motif no-resize, read "tile" by B while fullscreen and are
  refused by KWin when fullscreen ends, then floated by the refusal (the old behaviour, one step
  later). Pending fullscreen (request set, not applied) still reads "float"; a window that opens
  already fullscreen (`mpv --fs`, a game) may hit that at adoption. None of these is on Paul's
  desktop; noted, not handled.
- **Part C re-activates a window from inside a window-added handler.** The order is proven from
  the source (R-4); the test proves it in KWin.
- The fuzzer runs fullscreen actions; a campaign after the change is due in any case (OPEN.md:
  the frame run is pending), and this is the sort of seam it finds things at.

## Tests

`tests/live/32-fullscreen-open.sh`, one monitor, written to go red on today's code at each
part (the first build's version went red at A and, with B alone reverted, at B):

- **A.** `a`, `b` tiled; `b` fullscreen by the KWin property (`w.fullScreen = true`); `c`
  opened. Expect: no `FLOAT` line; the tree `H[a b*! c]`; `b` still fills the monitor and is
  KWin's active window; the monitor's centre pixel is `b`'s colour (testclient `--color`), and
  `workspace.stackingOrder` ends with `b` (R-9: both, the pixel is what Paul sees). Exactly two
  `TREE 1` lines after the newcomer (R-1: a spin shows as more), and `b.tile` null before the
  geometry checks.
- **Exit.** `b` leaves fullscreen. Expect `H[a b* c]` in thirds (decision 4).
- **B.** `r` tiled beside `b`, fullscreen (wait for `H[b r*!]`), retitled while fullscreen
  (`--retitle`). Expect it still tiled and fullscreen; leaving fullscreen gives two halves. (A
  reclassify that floats logs no `FLOAT` line; the half-geometry check is the one that sees it.)
- **Dialog** (decision 2): a modal dialog of the fullscreen window opened *during* fullscreen is
  floating, active and on top (pixel); the parent is not floated. Needs a `--dialog-delay
  SECONDS` option in `tools/testclient.py` (today `--dialog` opens at start-up, R-9).
- **More cases** (R-9): closing `b` with `c` behind it (`H[c*]`, `c` fills the monitor, the
  pointer decides KWin's focus as for any close); a second newcomer `d` (focus order `b d c`:
  the latest is second); a workspace switch and back (tree unchanged, `b` focused); a newcomer
  moved to the hidden fullscreen workspace with Meta+Shift+2 (no desktop switch, guard 5a); a
  reload with a fullscreen window and an unrelated active window (focus untouched, guard 5b).
- **Hold** (`53-hold.sh`, R-9v): the transaction count on entry with a newcomer and on exit, and
  the close hold when the fullscreen window is the last on the screen.
- `clean_log`.

Watched red before it counts: `tests/live/mutate.py` gets a fault for A (float again), B
(`!w.resizeable` back) and C (skip the hand-back); `tests/unit/mutate.py` one for the
insert-second rule (R-9).

`make test` green; `52-mouse.sh` and `53-hold.sh` are known to flake under the full parallel run
and are rerun alone when they do.

## Order

Change (A, B, C, the test client option, the unit test, the mutants, the
plan's line 103 and known-limit text) → `make test` → second agent reviews the change → Paul
says go → live reload → watch the next fullscreen session → fuzz campaign.

## Not in this spec

The capture of 2026-10-23 17:43 (both monitors showing workspace 5 after a Minecraft launch) is
a different seam and waits for Paul's account of what he saw.
