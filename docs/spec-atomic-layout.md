# Spec: atomic layout changes (no wallpaper flash when windows move)

Requested by Paul, 2026-10-23. Status: **revised after review 1; second review pending.** No code yet.

## The problem, measured

When windows are rearranged (a move, a split, a window opening or closing), there is a brief
flash of desktop wallpaper where a window is about to land. Paul sees it with terminals too.

Measured on Paul's desktop on 2026-10-23, with a read-only observer script logging each window's
frame and buffer (picture) geometry with millisecond timestamps over 16 moves of three Alacritty
windows: in each move the windows land **2 to 13 ms apart (typically ~5 ms)**. DP-4 runs at
240 Hz (4.2 ms per frame) and DP-6 at 144 Hz, so most moves show one frame with a hole and the
slowest about three. One move: at 23305 ms the left window shrank, at 23309 the second arrived in
the freed space, at 23318 the third filled the corner the second had left. Each hole is exactly
where a window is about to land.

Ruled out, in the headless test KWin with the test client and with real Alacritty: kwin-i3's own
steps. `reconcile` untiles and re-tiles every window when the layout's shape changes, but KWin
merges those requests: each window goes from its old geometry to its new one in one step, frame
and buffer together. The test KWin's virtual 60 Hz outputs land every window in the same
millisecond, so the flash only shows on real, fast monitors.

## Why it happens

On Wayland a window changes size only when its app has drawn a frame at the new size
(`XdgSurfaceWindow::moveResizeInternal`, xdgshellwindow.cpp:262 in KWin 6.7.5: a new size
schedules a configure, and the geometry is applied when the client commits it). A move that keeps
the size is applied immediately (line 276). Each app answers in its own time, so the windows of
one layout change land a few milliseconds apart, and every in-between state is a frame on a fast
monitor. i3 on X11 moved windows synchronously; Sway (i3 on Wayland) solved this with
"transactions": it keeps showing the old layout until every affected client has committed its new
size, or a timeout passes (200 ms in Sway), then shows the new layout at once.

KWin has no transactions, and a KWin script can't control painting. So this needs a KWin effect.

## The design

A KWin **effect** plugin, `kwini3hold`, built in `plugin/` beside `kwini3mouse`: a second target in
the same CMake project, linked to `KWin::kwin` and version-locked to the installed KWin the same
way. Declared with `KWIN_EFFECT_FACTORY_SUPPORTED(Class, "metadata.json", return supported();)`
(as KWin's in-tree `blendchanges` effect), built with `kcoreaddons_add_plugin(...
INSTALL_NAMESPACE "kwin/effects/plugins")`; metadata has a `KPlugin` object with `Name`,
`Category` and `EnabledByDefault: true`. `supported()` requires OpenGL compositing (both Paul's
desktop and the test KWin composite with OpenGL on his GPU; without it the effect does nothing).

It needs **no messages from kwin-i3**, and it works on any tiling change.

1. **Trigger.** For every window, the effect connects to the public
   `EffectWindow::windowFrameGeometryAboutToChange` (effectwindow.h:754). KWin emits it
   synchronously from `moveResizeInternal`, before the window moves, for both the immediate move
   (same client size) and the deferred resize (xdgshellwindow.cpp:264; X11 and internal windows
   have their own emit sites). Every tiling path reaches it: `Window::requestTile` (a window
   tiled, untiled or moved to another tile, window.cpp:3777) and `Tile::setRelativeGeometry`
   (tile sizes, tile.cpp:143). It is **not** emitted at commit time, nor when an app resizes
   itself. A D-Bus message from kwin-i3 would arrive too late: same-size moves are applied
   inside kwin-i3's own call.
2. **Eligible windows**: tiled (`requestedTile()` or `tile()` set; `tile()` only changes at the
   client's ack, so both are needed to cover untiling), shown (on its output's current desktop,
   not minimized), not fullscreen, **with a buffer already** (a newly mapped window's first
   placement would snapshot an empty texture). Nothing is held on an output while any window on
   it is in an interactive move or resize, tracked per output with
   `windowStartUserMovedResized` / `windowFinishUserMovedResized`: a border drag is an
   interactive resize of the dragged window only (window.cpp:1161), and its neighbours are moved
   through `Tile::setRelativeGeometry` with no interactive state of their own.
3. **Snapshot.** On the first `aboutToChange` of an eligible window, the effect snapshots it into
   a texture at once, records its frame geometry, and adds it to its output's open
   **transaction**, starting one if none is open. The snapshot is `CrossFadeEffect::redirect`
   (offscreeneffect.cpp:373), which makes the GL context current and renders immediately, so it
   captures the last committed buffer: the old state. It is safe outside the paint cycle; KWin's
   own `AnimationEffect` (from `windowMaximizedStateAboutToChange`, which scripts and D-Bus can
   trigger) and `blendchanges` (from a D-Bus slot) do the same.
4. **Closing windows.** On `EffectsHandler::windowClosed` for an eligible window, the effect
   snapshots it and keeps it (`refWindow`), so its slot doesn't show wallpaper while its
   neighbours grow into it. This hold is **pending**: if no neighbour on that output starts
   changing before the next event-loop turn, it is dropped (and the window unref'd) without
   opening a transaction.
5. **Paint while held.** The effect subclasses `CrossFadeEffect`. For a held window,
   `prePaintWindow` sets `data.setTransformed()`, so KWin neither clips the window to its current
   bounds nor culls what lies under it (workspacescene.cpp:737). `paintWindow` sets cross-fade
   progress 0 (only the snapshot is drawn, never the live window), plus a `WindowPaintData`
   translation of (old position - current position) and a scale of old size / current size about
   the top-left: `CrossFadeEffect::drawWindow` draws the snapshot over the window's *current*
   frame, and this transform puts it back on the old one (its shadow margins use the same ratio,
   so they line up). Progress is set only in `paintWindow`, never in `drawWindow`: the snapshot
   itself is rendered through `drawWindow` with default data. Tiled windows that appear during a
   transaction are not drawn until release: the effect skips the chain in its `drawWindow` for
   them, and marks them transformed too, so their opaque region doesn't cut what's painted
   beneath (6.7.5 has no API to hide a window; `EffectWindowVisibleRef` only forces visibility).
   The output is repainted fully each frame while a transaction is open, and once at release.
6. **Release.** A transaction ends when every held window has **settled**: its frame geometry
   equals `moveResizeGeometry()` (public, window.cpp:3353), compared after snapping to device
   pixels (fractional scales give fractional rects). `moveResize` sets it before emitting, so a
   pending resize differs until the client commits; when a client commits a size other than the
   one asked (a minimum size), KWin rewrites the requested geometry to the actual one
   (xdgshellwindow.cpp:167), so it still settles. Settledness is checked on every
   `windowFrameGeometryChanged` of a held window **and** on a 0 ms queued check after each
   `aboutToChange` (KWin emits it even when nothing changes, and then no geometry change ever
   follows). A transaction also ends after a **timeout of 100 ms** from its start (Paul,
   2026-10-23; measured worst case 13 ms; Sway's default is 200). At release every snapshot is
   dropped (`unredirect`, closed windows unref'd) in the same frame.
7. **Chained changes.** An `aboutToChange` during an open transaction adds that window (a window
   already held keeps its first snapshot). The deadline is not extended, so nothing can hold the
   screen past 100 ms.
8. **Two monitors.** Transactions are per output. A window moving to another output is held where
   its snapshot was taken (rendered at the old output's scale; drawn by whichever output's paint
   covers the old rect).
9. **Observability.** The effect counts transactions, durations, timeouts and pending close-holds
   dropped, and answers a D-Bus call `net.local.kwini3hold.Stats` (for tests, and for kwin-i3's
   Dump State / Meta+Shift+B capture). Counters are driven by geometry events, never by paints, so
   a screenshot (which renders through the effect chain) doesn't change them.
10. **Installing and the kill switch.** `tools/plugin-install.sh` installs it like `kwini3mouse`:
    a new file per build (`kwini3hold-<hash>.so`, since KWin never unloads a library), the old
    file unlinked, the old id unloaded and the new one loaded through the `org.kde.kwin.Effects`
    D-Bus interface (`unloadEffect` / `loadEffect`). A plugin's id is its file name, so KWin's
    own enable key (`<id>Enabled`) changes with every build; the effect is therefore enabled by
    default, and the **kill switch is its own config**: `kwinrc [kwin-i3-hold] Enabled=false`,
    read and watched by the effect (`KConfigWatcher`, as `kwini3mouse` does), takes effect at once.
    kwin-i3 works unchanged with or without it.

## What it changes for Paul

A move, open or close shows the old layout for a few milliseconds longer (typically 5, at most
100), then the new layout in one frame: no wallpaper in between. Input goes to the windows' real
positions during that time, as it already does. No animation; nothing else changes.

## Risks

1. **KWin API** can change between versions: mostly public effect API now
   (`windowFrameGeometryAboutToChange`, `CrossFadeEffect`, `windowClosed`, `refWindow`), plus
   `moveResizeGeometry()` and `requestedTile()` from `Window`. The plugin is rebuilt against each
   KWin update anyway (as `kwini3mouse` is); a build or load failure leaves kwin-i3 working,
   without the hold.
2. **A window that never settles** (a hung app, a pending configure): bounded by the timeout.
   Hidden and minimized windows are never held (a hidden window never acknowledges a size:
   OPEN.md, seed 28).
3. **Snapshot cost**: one texture per held window (about 7 MB at 1280x1440), rendered inside the
   call that moves it, freed at release.
4. **Stale pixels** if a window is drawn or culled wrongly during a hold (rule 5): covered by the
   screenshot tests, mid-hold and after release.
5. **Interactive drags** must never hold (rule 2); the drag scenarios check it with Stats.
6. **Effects ordering**: no other effects are enabled on Paul's desktop; with others, ours draws
   held and hidden windows itself and leaves everything else to the chain.

## Tests

1. **Reproduce the gap headless.** The test client gets `--resize-delay MS`, which sleeps in its
   size handler (`notify::default-width`/`size-allocate`) so its new-size frame arrives late (the
   ack may go first; KWin applies geometry only at the commit, so the gap shows either way). A
   few hundred ms, so a screenshot lands inside it. Two windows, one slow, swapped: a ScreenShot2
   capture during the gap shows wallpaper. That's the red test, before the effect exists. The test
   KWin gets `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1` (ScreenShot2 is authorised per caller).
2. **With the effect**: the capture mid-hold shows the old layout, and one after release shows the
   new layout complete. First check that the effect loaded and `supported()` is true, so a
   silently missing effect can't pass as green.
3. **Close**: closing one of two windows (its neighbour slow) shows the closed window until the
   neighbour has grown, not wallpaper. **Open**: a new window isn't drawn until the others have
   made room.
4. **Timeout**: a client delayed 5 s; the transaction ends at about 100 ms (Stats reports a
   timeout), and the screen is not held longer. **No-op change**: a tile set to its current size
   ends its transaction at once, not at 100 ms.
5. **Never held**: minimized and hidden windows, and every window during an interactive resize
   drag (Stats: no transactions during the drag).
6. **Every rule watched red**: each guard removed in turn in a worktree and its test fails.
7. `make test` and a fuzz run with the effect loaded, then Paul's eyes on the live desktop.

## Not in scope

Animations of any kind. Workspace switches (they replace the whole screen at once already).

## Decisions

1. Timeout: 100 ms (Paul, 2026-10-23: "100 is plenty").
2. Settled = frame equals requested geometry, snapped to device pixels (review 1: KWin rewrites
   the requested geometry when a client picks its own size, and the exact "configure
   acknowledged" state is private to KWin).

## Reviews

1. **2026-10-23, second agent, against KWin 6.7.5's source**: not buildable as first written.
   Blocker: `CrossFadeEffect` draws the snapshot over the window's *new* frame (now rule 5's
   transform). Changes: paint flags for held and hidden windows (rule 5); closing windows left a
   hole (rule 4); the trigger fires even when nothing changes (rule 6's queued check); eligibility
   needs a buffer and per-output drag tracking (rule 2); the enable key is per file name (rule 10);
   test details (test 1, 2, 4); "KWin's maximize effect" was the wrong precedent (rule 3). Paul
   asked for a fresh review of the revised spec before code.

## Sources

Paul's desktop measurement 2026-10-23 (observer script; log kept in the session scratchpad).
KWin 6.7.5 source: `src/xdgshellwindow.cpp` (moveResizeInternal), `src/effect/offscreeneffect.cpp`
(CrossFadeEffect::redirect), `src/effect/effectwindow.h`, `src/effect/effecthandler.h`,
`src/effect/effectloader.cpp`, `src/effect/animationeffect.cpp`, `src/scene/workspacescene.cpp`,
`src/window.cpp`, `src/tiles/tile.cpp`, `src/plugins/blendchanges/`. Sway: `server.c:701` (200 ms). Sway's transactions (`sway/desktop/transaction.c`).
