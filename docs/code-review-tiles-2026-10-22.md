# Code review: tile side of src/kwin.js (2026-10-22)

Scope: project/shape*, reconcile, relocate, build, placeWindows, prepareTiles, setSizes*, checkInvariants,
readBack, specOf/start adoption, release, expected protocol, tileChanged, timer scheduling.
Checked against KWin Plasma/6.7 `tile.cpp`, `customtile.cpp`, `window.cpp` (fetched), and `make live`
(33 passed, 0 failed). One throwaway probe (5 windows, open a 6th) was run in the headless KWin.

Summary: the tile API use is correct for 6.7 (manage/unmanage, split semantics, setMinimumSize,
rootTile, relativeGeometry clamping all match the source). The main risk is not wrong API use but
the error path: a persistent exception turns into a busy loop inside the compositor.

## 1. HIGH: a persistent exception in reconcile busy-loops KWin (lines 20-26, 64-80)

`guard()` catches any error, logs, and calls `scheduleAll()`. `flush` is itself guarded, and
`schedule()` restarts a 0 ms single-shot timer. If `reconcile` throws for the same reason every
time, the loop is: flush -> throw -> scheduleAll -> timer(0) -> flush. It never backs off and never
stops, logging an error with a stack each pass. On Paul's desktop that is KWin's main thread at
100% plus a flooding journal, until he finds Meta+Ctrl+Shift+Q (which itself runs unguarded, see 4).

Ways to get a persistent throw (all plausible on a real session, none in the tests):
- `setSizes` (186) reads `tile.tiles[i]` that is undefined if `build` produced fewer tiles than the
  projection wants (any split that KWin refuses, e.g. a tile it cannot split at that moment). Then
  `child.relativeGeometry` throws on every pass.
- `outputOf(ws)` (224) when `Workspaces.outputOf` returns nothing for a workspace whose monitor is
  gone and has no fallback.
- A window that was destroyed between the event and the flush (`w.minSize` in prepareTiles 162).

Half-built state: `reconcile` unmanages every window and removes every child tile (234-238) before
building. A throw in `build` (203) leaves the root empty with all windows untiled, and the retry
loop above runs from that state.

Fix: in `guard`, count consecutive failures per workspace (reset on a successful reconcile). After
3, stop calling `scheduleAll()` for that workspace and log once; retry only on the next real event.
Cheaper: wrap each `reconcile(ws)` call in flush in its own try/catch so one bad workspace cannot
re-dirty the others, and re-dirty it with a 250 ms timer, max 3 times. Also check `build`'s result:
after `build`, if `shapeOfTile(root) !== want`, log "WARN build mismatch" and skip setSizes instead
of throwing.

## 2. MEDIUM: `manage()`'s return value is ignored, so a refused window leaves a hole (139-142)

`Tile::manage` returns false (tile.cpp 377-391) when the window is not resizable, is an applet
popup, or is not on the tile's desktop. `manageInto` sets `expected[id] = tile` first and ignores the
result. The projection still gives that window a leaf, so the user sees an empty slot where the window
should be, and the invariant check reports "not in its tile" on every reconcile.
- `Rules.classify` floats `!w.resizeable`, so the common case is covered at adoption time. Not
  covered: a window that becomes non-resizable later (no signal is connected for it) or whose
  `resizeable` was wrong while it was still mapping.
- `manage` also fails if `placeWindows` runs for a window not yet on this desktop (relocate runs first,
  so only if `w.desktops = [desk]` was refused by a window rule).

Fix: `manageInto` returns the bool; on false, `expected[id] = null`, log it, and mark the window for
`reclassify` as floating (or drop it from the projection via a `refused[id]` set that `visibleLeaf`
checks). Same for the shape comparison: a refused window then does not keep triggering rebuilds.

## 3. MEDIUM: start-up adoption trusts the saved tile tree more than the windows (661-683)

`specOf` reads `kwinrc [Tiling]` trees as restored by KWin. Spike note 3 says a window's desktop can
change without leaving its tile, so a window can sit in desk D's tile while `w.desktops == [E]`.
Adoption (667-682) assigns it to workspace D without checking, bypassing everything `adoptWindow`
checks (one desktop, output, maximize, fullscreen, float class, `w.active`, minimized). Consequences:
- `relocate` (261) later sees `w.desktops[0] !== desk` and moves the window to D with
  `sendClientToScreen` + `desktops = [desk]`. A window the user had on desktop E jumps. Scenario:
  reload the script after the Overview or a script moved a tiled window.
- `model.setFullscreen` is never called for an adopted fullscreen window (adoptWindow does at 355),
  so the model's fullscreen handling (focus, directional moves) is blind to it until it toggles.
- `wins[leaf.win] = w; expected[...] = w.tile` (678-679): if the window list lookup misses, `w` is null
  and `w.tile` throws inside `start()`, which is not guarded, so the script dies half-started. Cannot
  happen today (ids come from the same windows) but costs one line to protect.
- A tile holding 0 or 2+ of our windows returns null from `specOf`, and its sibling shares are
  not renormalised in the spec (`percent` values then sum to less than 1). Confirm `Tree.adopt`
  normalises (tree.js is another reviewer's), otherwise the first reconcile resizes everything.

Junk from saved layouts that hold no windows (KWin's default 3 empty columns, the spike saw them on
every desktop) is handled: `specOf` returns null, and reconcile's shape mismatch removes them.

Fix: in the adoption loop, skip any leaf where `!(w.desktops.length === 1 && w.desktops[0] === d)`
or `Rules.classify(w) !== "tile"` (leave it to `adoptWindow`), and for adopted windows set fullscreen
the same way `adoptWindow` does. Guard `w` null.

## 4. MEDIUM: `release()` is not guarded and does not fully restore (622-638)

- Registered directly as the shortcut callback (612), not through `guard`. `outputOf(model.workspaces[n])`
  (633) throws for a workspace with no home/monitor; the `for` loop aborts, remaining roots keep their
  tiles, and "RELEASED" is never logged. `released` is already true, so nothing retries. This is the
  safety valve; it must not be able to half-run. Fix: try/catch per workspace.
- Only workspaces in `model.workspaces` are cleaned. Windows are unmanaged from `w.tile` (requested
  tile); a window sitting in `tile.windows` of a hidden desktop with `w.tile === null` (Tile::manage
  only calls `requestTile` when the tile's desktop is current, tile.cpp 417-421) is not unmanaged
  explicitly, only swept by `remove()`'s re-manage into whatever tile `pick()` finds, and the tile it
  is left in is the root. Fix: also iterate `tiledWindowsOf(root)` and `tile.unmanage` each.
- What release leaves behind: root `padding` set to 0 and `minimumSize` set to 0 by `prepareTiles` stay on
  the root (and padding is persisted in kwinrc), and KWin's saved default layout is gone (all children
  removed). Probably harmless for Paul (no gaps, Krohnkite era), but "fully restoring" is not true. Fix:
  remember the root's original padding/minimumSize on first `prepareTiles` and restore them in release.
- Maximize/keepAbove: keepAbove restored; fine. Signal connections stay but are inert (`released`).
  The 0 ms timer cannot fire usefully (guard returns). OK.

## 5. LOW-MEDIUM: every window open/close rebuilds the whole workspace's tiles (230-243)

Any change in window set changes the shape string, so `reconcile` unmanages all windows, removes all
tiles, rebuilds, re-manages. With the 6.7 source: `unmanage` -> `requestTile(nullptr)` ->
`moveResize(geometryRestore)` (window.cpp 3776-3786), then `manage` -> `moveResize(tile)`. Measured
in the headless KWin (5 windows, open a sixth): windows a and c each emitted exactly one frame
geometry change and one `tileChanged(set)`, with no intermediate restore geometry, so the two moves
coalesce for a Wayland client that has not committed between them. Not measured: X11 clients and
slow-committing Wayland clients (Firefox, Electron, terminals), where the intermediate configure may
reach the client, causing a resize storm plus flicker on every open/close with many windows.
Also `geometryRestore` can be overwritten if a client commits in between (`requestTile` 3768-3770 sets
it only when `!m_requestedTile && !m_tile`), losing the original floating geometry of a window.
Fix (if flicker is seen): rebuild without unmanaging windows that will land in a tile again; call
`newTile.manage(w)` directly, which evacuates from the old tile itself and calls `requestTile(this)`
without passing through null. Only unmanage windows that leave the projection.

## 6. LOW: smaller points

- `wantFocus` (85-88): if `model.focused` is null, `schedule(null)` starts nothing and `focusPending`
  stays set until some unrelated flush. Fix: start the timer unconditionally.
- `prepareTiles` minimum (161-164): `ms.width / g.width` uses the output geometry; KWin's tile
  area is the output minus anything reserved (panel). With no panel, equal. Window minSize that
  exceeds the screen share (a 1000 px minimum is 0.39 on 2560 but 0.78 on the 1280 tests): `setRelativeGeometry`
  silently refuses (customtile.cpp 60-65, "do nothing") and the stable-pass loop ends in the WARN at
  177; the window overflows its tile. Real-monitor behaviour differs from the tests here only in that
  fewer windows hit it. Consider capping the min at `1 / leafCount` of the dimension.
- `minSize` is read at reconcile time only; a client that sets its minimum after first commit
  (common for GTK/Electron) is not noticed until the next unrelated reconcile. Connect
  `minSizeChanged` if present, or accept.
- `setSizes` tolerance 1e-4 is 0.26 px at 2560 and 0.13 px at 1280, and `checkInvariants` 1e-3 is 2.6 px:
  fine. Integer rounding of thirds (853.33) is done by KWin; no drift seen.
- `readBack` (307-335): reads window frames, not tile geometry. A client with size increments or
  an aspect constraint (X11 terminals, some games) has a frame smaller than its tile, so each border
  drag bakes that slack into shares (normalised by the sum, so the drift is small and per drag only).
  Fix: read `w.tile.relativeGeometry` (or the tile's `absoluteGeometry`) instead of `frameGeometry`.
- `tileChanged` handler (458-472): protocol is sound for synchronous delivery (tests prove). If
  `tileChanged(null)` for a drag arrives before `interactiveMoveResizeStarted` sets `dragging`, the
  window is treated as a foreign untile and re-tiled under the pointer instead of floating. The live
  input tests cover only the opposite order; worth one check on a real desktop.
- `shapeOfTile` returns "?" for a multi-window tile; the rebuild fixes it. Good.
- Same-direction merge in `project` and `build`'s use of `split` match `CustomTile::split`
  (sibling when parent direction equals, nest otherwise). Verified against customtile.cpp 193-250.
  `RootTile` has `parentT == nullptr` so `split` creates children, not siblings: matches `build`.

## Verified OK

- `tile.remove()` on root's children only: root is never collapsed (`!parentT->isRoot()` guard at
  customtile.cpp 328); nested one-child promotion is a non-issue because whole subtrees are removed.
- No window can be in two tiles: `Tile::manage` evacuates it from every root of that desktop on all
  outputs (tile.cpp 393-412). A window in no tile only via item 2 or an exception (item 1).
- `setMinimumSize` re-applies the geometry and is idempotent; `prepareTiles` guards with a tolerance.
- Hidden-desktop workspaces: `manage` adds to `tile.windows` without `requestTile`; `expected` is
  set to the tile, and `tileChanged` arrives equal to it when the desktop is shown. Consistent.
