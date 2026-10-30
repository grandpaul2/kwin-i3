# Spec: atomic layout changes (no wallpaper flash when windows move)

**Now (2026-10-27):** Built and live (kwini3hold, `plugin/hold.cpp`); the effect also draws the frame since `spec-window-modes.md`. What it does: `behaviour.md` §7, "The hold".

Requested by Paul, 2026-10-23. Status: **implemented and code-reviewed on branch `atomic-layout` (plugin/hold.cpp, tests/live/53-hold.sh); not live.**

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

It needs **no messages from kwin-i3**, and it works on any tiling change. (Review 3 suggested
two messages from kwin-i3, "this window is placed" and "this rearrangement is done". Worked
through, they race: D-Bus calls are asynchronous, so a "done" sent at the end of one pass can
arrive after the next pass has already opened a new transaction, and release it early. A pass
counter with begin/end messages would avoid that, but the effect still couldn't tell which
`aboutToChange` belongs to which pass, and a script has no synchronous channel to an effect. Rules 5
and 6 get the same result from timing alone, with no change to kwin-i3.)

1. **Trigger.** For every window, the effect connects to the public
   `EffectWindow::windowFrameGeometryAboutToChange` (effectwindow.h:754). KWin emits it
   synchronously from `moveResizeInternal`, before the window moves, for both the immediate move
   (same client size) and the deferred resize (xdgshellwindow.cpp:264; X11 and internal windows
   have their own emit sites). Every tiling path reaches it: `Window::requestTile` (a window
   tiled, untiled or moved to another tile, window.cpp:3777) and `Tile::setRelativeGeometry`
   (tile sizes, tile.cpp:143); `requestedTile()` is window.h:1156. It is **not** emitted at commit time, nor when an app resizes
   itself. A D-Bus message from kwin-i3 would arrive too late: same-size moves are applied
   inside kwin-i3's own call.
2. **Eligible windows**: tiled (`requestedTile()` or `tile()` set; `tile()` only changes at the
   client's ack, so both are needed to cover untiling), shown (on its output's current desktop,
   not minimized, not hidden by Show Desktop: `isHidden()` leaves that out), not fullscreen (a window *leaving* fullscreen is still fullscreen when
   KWin's own restore fires, so that isn't held; kwin-i3's re-tile that follows is. A window
   *going* fullscreen isn't fullscreen yet when it fires, KWin only records the request until the
   app acknowledges, so it is held: its tiled picture stays until its fullscreen frame arrives,
   and neighbours kwin-i3 re-tiles switch with it. Found in testing; it is the atomic behaviour
   wanted, so kept), **with a buffer already** (a newly mapped window's first
   placement would snapshot an empty texture). Nothing is held on an output while any window on
   it is in an interactive move or resize. The effect keeps the set of windows in an interactive
   move or resize (`windowStartUserMovedResized` / `windowFinishUserMovedResized`, `QPointer`s)
   and, at each decision, suppresses holds on the outputs those windows are on *now* (so a drag
   that crosses outputs, or an output removed mid-drag, leaves nothing dangling): a border drag is an
   interactive resize of the dragged window only (window.cpp:1161), and its neighbours are moved
   through `Tile::setRelativeGeometry` with no interactive state of their own.
3. **Snapshot.** On the first `aboutToChange` of an eligible window, the effect snapshots it into
   a texture at once, records its frame geometry, and adds it to its output's open
   **transaction**, starting one if none is open. The snapshot is `CrossFadeEffect::redirect`
   (offscreeneffect.cpp:373), which makes the GL context current and renders immediately, so it
   captures the last committed buffer: the old state. It is safe outside the paint cycle; KWin's
   own `AnimationEffect` (from `windowMaximizedStateAboutToChange`, which scripts and D-Bus can
   trigger) and `blendchanges` (from a D-Bus slot) do the same. **But** `redirect` renders through
   `effects->drawWindow`, which runs the active effect chain, ours included; once the window is in
   `CrossFadeEffect`'s map, its `drawWindow` (offscreeneffect.cpp:328) skips the live window at
   progress 0 and draws the still-empty texture into itself: a blank snapshot. `blendchanges`
   escapes this only because it is inactive when it redirects. So: a `m_snapshotting` flag is set
   around every `redirect()`, and while it is set our `drawWindow` calls `Effect::drawWindow`
   (the plain chain) instead of `CrossFadeEffect::drawWindow`. And `isActive()` is true only while
   a transaction or a hidden window exists (the active chain is rebuilt each paint,
   effecthandler.cpp:425).
4. **Closing windows.** On `EffectsHandler::windowClosed` for an eligible window, the effect
   keeps it (`refWindow`), so its slot doesn't show wallpaper while its neighbours grow into it.
   No snapshot is needed: a closed window keeps its last buffer and doesn't move, and KWin keeps
   drawing a referenced closed window as it is (close animations rely on this). A window that was
   already held when it closes keeps its snapshot and counts as settled; a hidden new window
   (rule 5) that closes is simply dropped. This hold is **pending**: if no neighbour on that output starts
   changing within **20 ms**, it is dropped (and the window unref'd) without opening a
   transaction. Not "the next event-loop turn": KWin reports the close (`Window::closed`) before
   kwin-i3 hears of it (`windowRemoved`, then its own zero-delay timer, kwin.js `schedule`), so a
   zero-delay drop would usually fire before kwin-i3 rearranges. Cost: closing the last window on
   a screen leaves it visible up to 20 ms longer (under 5 frames at 240 Hz). A kept window (pending
   or held) is **grabbed** (`WindowClosedGrabRole`), so a close animation leaves it alone: Plasma's
   default Scale effect shrank and darkened it while held (found on the laptop, 2026-10-29), and
   Scale cancels a running one when another effect grabs (`scale/.../main.js:133`, `:165`). So a
   closing tiling window gets no close animation, as in i3; a floating one keeps it.
5. **Paint while held.** The effect subclasses `CrossFadeEffect`. For a held window,
   `prePaintWindow` sets `data.setTransformed()`, so KWin neither clips the window to its current
   bounds nor culls what lies under it (workspacescene.cpp:737). `paintWindow` sets cross-fade
   progress 0 (only the snapshot is drawn, never the live window), plus a `WindowPaintData`
   translation of (old position - current position) and a scale of old size / current size about
   the top-left: `CrossFadeEffect::drawWindow` draws the snapshot over the window's *current*
   frame, and this transform puts it back on the old one (its shadow margins use the same ratio,
   so they line up). Progress is set only in `paintWindow`, never in `drawWindow`: the snapshot
   itself is rendered through `drawWindow` (rule 3). **New windows**: every newly added normal window (`isNormalWindow()`, which excludes dialogs,
   utilities and other special types) that is shown (rule 2's test: on its output's current
   desktop and current activity, not minimized) is hidden from `windowAdded` (the effect's slot runs before
   kwin-i3's, which only schedules a zero-delay pass: kwin.js `schedule`). The effect doesn't try
   to copy kwin-i3's rules for which windows float (src/rules.js: transients, dialogs, fixed size,
   Paul's own lists): if the window gets a tile (`requestedTile()` set, seen at its
   `aboutToChange`), it **joins the transaction without a snapshot** and stays hidden until the
   release, which then shows it in its tile; if its first `aboutToChange` comes without a tile
   (kwin-i3 floated and placed it), or no tile comes within **20 ms**, it is shown where it is.
   A joined window still unsettled at the release (a timeout) **stays hidden until it settles**, at
   most 1 s more: shown then, it would be drawn at KWin's first placement, floating with a title
   bar, since KWin moves it only with the app's new frame (found on the laptop, 2026-10-29, a
   0.8 s client). Its tile shows wallpaper meanwhile, as i3's frame shows before the app draws.
   Dialogs, modal and transient windows are never hidden (on Wayland a transient is still
   "Normal" by KWin's type, so the effect checks `isDialog`, `isModal` and `transientFor`). Without this, it would flash at its default
   spot for a frame. Cost: a window kwin-i3 floats appears up to 20 ms later. This applies whether
   or not kwin-i3 is loaded: a plugin can't ask KWin's scripting (kwin-devel installs no
   `scripting.h`), and with kwin-i3 off the only cost is the same 20 ms. Hidden windows are skipped in our `drawWindow`, marked transformed (so their opaque
   region doesn't cut what's painted beneath; 6.7.5 has no API to hide a window, and
   `EffectWindowVisibleRef` only forces visibility), and given an `ItemEffect` on their window item,
   as held windows get from `redirect`: that keeps them off hardware overlay planes and direct
   scanout (`findOverlayCandidates` rejects items with effects, workspacescene.cpp:280), which
   could otherwise show a window KWin didn't draw.
   While anything is held or hidden, `prePaintScreen` sets `PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS`
   (the generic paint path: a full region per window, full damage), so drawing at old positions
   doesn't depend on the simple path's culling. The screen is repainted fully (global
   `effects->addRepaintFull()`, never per output) when a transaction starts, every frame while
   one is open, and once at release. Frame callbacks keep reaching held and hidden windows'
   clients: KWin sends them from the scene's frame handling, not from `drawWindow`
   (surfaceitem_wayland.cpp:237), so a held app still gets to draw its new size.
   **Shadow caveat**: the transform assumes the window's shadow margins at capture equal its
   current ones. True for server-side decorations (Alacritty, Paul's 1 px border); a client that
   draws its own shadow (GTK, Firefox) can change it with the new buffer, and then the shadow is
   squeezed for the length of the hold (risk 6).
6. **Release.** A transaction ends when every held window has **settled**: its frame geometry
   equals `moveResizeGeometry()` (public, window.cpp:3353), compared after snapping to device
   pixels (fractional scales give fractional rects). `moveResize` sets it before emitting, so a
   pending resize differs until the client commits; when a client commits a size other than the
   one asked (a minimum size), KWin rewrites the requested geometry to the actual one
   (xdgshellwindow.cpp:181), so it still settles, once its last configure is acknowledged (KWin
   skips the rewrite while one is pending, l.183; the timeout covers a client that never acks).
   A held window that has become hidden (another desktop, minimized: Meta+Shift+N and minimize
   untile it first, so it is held while still visible) **counts as settled**: a hidden window gets
   no frame callbacks (windowitem.cpp:172, item.cpp:727), never acknowledges, and would otherwise
   hold everything to the timeout. But its snapshot is **kept and still drawn** until the release:
   the effect takes an `EffectWindowVisibleRef` on it (effectwindow.h:898) with all four reasons
   (`PAINT_DISABLED_BY_HIDDEN | _DESKTOP | _MINIMIZE | _ACTIVITY`), because a hidden window leaves
   the stacking order (workspacescene.cpp:770) and its slot would show wallpaper while its
   neighbours are still held at their old size. The ref also makes KWin paint the live window, so
   for a held window that is no longer shown our `drawWindow` draws **only the snapshot** and
   skips the live window, as for hidden new windows. The ref is released with the transaction.
   `desktopsChanged` and `minimizedChanged` also queue a check.
   Settledness is **never evaluated synchronously**. A held window's
   `windowFrameGeometryChanged`, every `aboutToChange` (KWin emits it even when nothing changes,
   and then no geometry change follows), and every painted frame while a transaction is open (a
   client that answers a configure with its *current* size, e.g. one at its minimum, changes no
   geometry, so no signal would ever say it settled: found by the code review) only mark "check needed" and queue one check
   (`QMetaObject::invokeMethod(..., Qt::QueuedConnection)`), which runs after the code that caused
   it has returned. Otherwise a same-size move, applied synchronously inside kwin-i3's
   reconcile (xdgshellwindow.cpp:277), would make the first window look settled before the
   second window's `aboutToChange` arrived, and release the transaction mid-change.
   **Quiet period.** Release also needs **3 ms** with no new `aboutToChange` of an eligible
   window (a held window's repeated ones included), close hold or hidden new window; each of those
   restarts it. A `Qt::PreciseTimer` (a coarse timer can be 5% late, fine at 100 ms, not at 3 ms).
   kwin-i3 sometimes spreads one change over two passes, the second from a zero-delay timer
   (kwin.js `kick`): after a workspace switch (`applyFocus`), or when KWin refused a tile
   (`reconcile`'s `refused`). If the first pass's moves were all same-size they settle at once, and
   without a quiet period the in-between layout would be shown. A second pass runs microseconds
   later; 3 ms covers it with room (under one frame at 240 Hz). If load ever delays a second pass
   past 3 ms, the cost is today's flash, not a stall. A transaction also ends after a **timeout of 100 ms** from its start (Paul,
   2026-10-23; measured worst case 13 ms; Sway's default is 200). At release every snapshot is
   dropped (`unredirect`, closed windows unref'd) in the same frame.
7. **Chained changes.** An `aboutToChange` during an open transaction adds that window (a window
   already held keeps its first snapshot). The deadline is not extended, so nothing can hold the
   screen past 100 ms.
8. **Two monitors.** There is **one transaction for all outputs**, with one deadline and one
   release: per-output transactions left a hole or an overlap when a window moved between
   outputs and one side released first. Drag suppression (rule 2) stays per output. A window
   moving to another output is held where its snapshot was taken (drawn by the old output's
   paint). The two outputs (240 and 144 Hz) still present the release on their own next frames.
9. **Bookkeeping.** Every held, pending-close and hidden entry is also erased on `windowDeleted`
   (KWin emits `closed` before deleting, xdgshellwindow.cpp:310, so this is a safety net), and
   every reference to an `EffectWindow` in queued work is a `QPointer` or is re-validated.
   Ending everything (release, kill switch, unload, destructor) works on a **copy** of the lists,
   because `unrefWindow` can delete a window and call back into them, in this order: unredirect
   every snapshot, remove every `ItemEffect`, release every `EffectWindowVisibleRef`, then unref
   every closed window. An output removed mid-hold: the transaction continues; its windows'
   snapshots are drawn by whichever output now covers them, or not at all, and the global repaint
   covers the change.
10. **Observability.** The effect registers an object at `/kwini3hold` on KWin's own session-bus
   connection (service `org.kde.KWin`), interface `net.local.kwini3hold`, method `Stats` returning
   a map: transactions, timeouts, last and maximum duration, the last quiet-period wait, close
   holds kept and dropped, new windows hidden and how long, snapshots taken and the time spent
   rendering them (last and maximum). Exported with `registerObject(..., ExportAllSlots)` and
   unregistered in the destructor. For tests, and for kwin-i3's Dump State / Meta+Shift+B
   capture. Counters are driven by geometry events, never by paints, so
   a screenshot (which renders through the effect chain) doesn't change them.
11. **Installing and the kill switch.** `tools/plugin-install.sh` installs it like `kwini3mouse`:
    a new file per build (`kwini3hold-<hash>.so`, since KWin never unloads a library), the old
    file unlinked, the old id unloaded and the new one loaded through the `org.kde.kwin.Effects`
    D-Bus interface (`unloadEffect` / `loadEffect`, effecthandler.cpp:1173), not `/Plugins`. It goes
    in `$root/kwin/effects/plugins` (KWin finds it through `QT_PLUGIN_PATH`, as the mouse plugin),
    and an effect enabled by default loads at login (effectloader.cpp:396). On unload, on the kill
    switch, and in the destructor, the effect ends every transaction: unredirects every snapshot,
    unrefs every closed window and removes every `ItemEffect`, so nothing is left drawn or leaked. A plugin's id is its file name, so KWin's
    own enable key (`<id>Enabled`) changes with every build; the effect is therefore enabled by
    default, and the **kill switch is its own config**: `kwinrc [kwin-i3-hold] Enabled=false`,
    read and watched by the effect (`KConfigWatcher`, as `kwini3mouse` does, and on KWin's
    `reconfigure`), takes effect at once. **Change either key with `kwriteconfig6 --notify` and
    nothing else** (live, 2026-10-23: a plain write plus KWin's `reconfigure` left the effect on
    the old value, and a later `--notify` write of the same value was ignored by the watcher,
    which sees no change against the already-reparsed shared config; another key in the group had
    to change to make it reread).
    The same group's `TimeoutMs` (default 100) was meant for the tests, which raise it to capture
    mid-hold. Paul set it to 200 (Sway's) on 2026-10-23 to see whether it feels slow.
    kwin-i3 works unchanged with or without it.

## What it changes for Paul

A move, open or close shows the old layout for a few milliseconds longer (typically 5 to 8,
counting the 3 ms quiet period; at most 100), then the new layout in one frame: no wallpaper in
between. A window kwin-i3 floats (other than a dialog, which is never hidden) appears up to
20 ms after it opens. Input goes to the windows' real
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
3. **Snapshot cost**: one texture per held window (about 7 MB at 1280x1440), rendered on KWin's
   main thread inside the call that moves it. Three to five windows at once might exceed one
   frame at 240 Hz (4.2 ms) and cause a hitch. Textures can't be reused through `CrossFadeEffect`
   (its private `OffscreenData` owns them), so the cost is measured (test 13, from Stats' snapshot
   timings) before this goes live; if it's too high, the fix is drawing snapshots ourselves.
4. **Stale pixels** if a window is drawn or culled wrongly during a hold (rule 5): covered by the
   screenshot tests, mid-hold and after release.
5. **Interactive drags** must never hold (rule 2); the drag scenarios check it with Stats.
6. **Client-drawn shadows** (GTK, Firefox) can look squeezed for the few milliseconds of a hold
   when a window goes from floating to tiled: `CrossFadeEffect::drawWindow` computes the shadow
   margins from the window's *current* geometry (offscreeneffect.cpp:352, private), and GTK drops
   its shadow when it becomes tiled. Accepted unless test 14 shows it visibly; the fix would be
   drawing the snapshot quad ourselves instead of through `CrossFadeEffect`. (This replaces review
   2's "store the captured margins", which can't work through `CrossFadeEffect`.)
7. **Known limits**: a per-window capture or thumbnail of a held window shows its stretched
   snapshot (it renders through `drawWindow` without our `paintWindow`); Xwayland windows apply
   geometry at once while their buffer lags, so they are effectively never held (Paul's apps are
   Wayland-native).
8. **Effects ordering**: no other effects are enabled on Paul's desktop; with others, ours draws
   held and hidden windows itself and leaves everything else to the chain.

## Tests

1. **Reproduce the gap headless.** The test client gets `--resize-delay MS`, which sleeps in its
   size handler (`notify::default-width`/`size-allocate`) so its new-size frame arrives late (the
   ack may go first; KWin applies geometry only at the commit, so the gap shows either way). A
   few hundred ms, so a screenshot lands inside it. Two windows, one slow, swapped: a ScreenShot2
   capture during the gap shows wallpaper. That's the red test, before the effect exists. The test
   KWin gets `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1` (ScreenShot2 is authorised per caller).
2. **With the effect**: the capture mid-hold shows the old layout, and one after release shows the
   new layout complete. Whole-output captures only: a per-window capture renders through
   `drawWindow` without our `paintWindow`, so a held window would come out as its stretched
   snapshot. First check that the effect loaded and `supported()` is true, so a silently missing
   effect can't pass as green.
3. **Close**: closing one of two windows (its neighbour slow) shows the closed window until the
   neighbour has grown, not wallpaper. **Open**: a new window isn't drawn until the others have
   made room.
4. **Timeout**: a client delayed 5 s; the transaction ends at about 100 ms (Stats reports a
   timeout), and the screen is not held longer. **No-op change**: a tile set to its current size
   ends its transaction at once, not at 100 ms.
5. **Never held**: minimized and hidden windows, and every window during an interactive resize
   drag (Stats: no transactions during the drag). A drag's end, where the first `aboutToChange`
   can come before `windowFinishUserMovedResized`: either held correctly or knowingly left
   unheld; the test states which.
6. **One transaction per change**: three windows, the first moving at the same size (applied at
   once): Stats shows exactly one transaction, and the capture shows no intermediate layout.
7. **A chained snapshot is not blank**: a window joining an open transaction (rule 7) is captured
   mid-hold and its region isn't empty or wallpaper. This is the test that proves rule 3's flag;
   removing the flag must turn it red.
8. **Close with kwin-i3 slow to react**: the reconcile delayed (a test hook) up to 15 ms: the
   closed window stays until its neighbour has grown.
9. **Open**: the new window's first placement before its neighbours have moved: it isn't drawn at
   its default spot or in its tile before the others have made room.
10. **Kill switch and unload mid-hold**: no ghost window remains on screen, and no closed window
    stays referenced (Stats, and KWin's window list).
11. **Hidden mid-hold**: a held window sent to another workspace (Meta+Shift+N) and one minimized,
    each with a slow neighbour: release well under 100 ms (Stats).
12. **Across outputs**: a window moved to the other output with a slow neighbour on either side:
    whole-output captures of both outputs mid-hold and after release show no hole and no overlap.
    (The test KWin's two virtual outputs present together, so the per-output presentation at 240
    and 144 Hz can't be tested here; Paul's eyes are that test.)
13. **Cost**: a five-window reflow: Stats' snapshot rendering time for the whole change stays well
    under 4.2 ms (on Paul's GPU, in the test KWin; the headless KWin has no frame-time figure).
14. **GTK shadow**: the GTK4 client moved from floating to tiled: capture mid-hold, judged by eye.
15. **New windows not tiled**: a dialog (never hidden), a window kwin-i3 floats, and any window
    with kwin-i3 unloaded: Stats' hidden duration at most about 20 ms, and never shown inside a
    tile first. A new window on a desktop not shown isn't hidden at all.
16. **Bookkeeping**: close a held window; close a hidden new window; kill a client mid-hold:
    Stats counters return to zero, nothing left drawn, no crash.
17. **Two-pass change**: a refused tile forcing a second pass, and the workspace-switch case
    (fuzzer I4): Stats shows one transaction and its quiet-period wait; no in-between layout
    captured.
18. **Fullscreen** in and out: neither held (Stats).
19. **Meta+Shift+N**: the window sent away with a slow neighbour: a capture mid-hold shows the
    sent window's snapshot in its slot, not wallpaper, and no live copy of it anywhere.
20. **Monitor unplugged mid-hold** (the test KWin can disable an output): no crash, the hold
    ends, nothing left drawn.
21. **kwin-i3 unloaded mid-hold**: the hold ends normally (the effect doesn't depend on it).
22. **Last window on a screen closed**: it lingers at most 20 ms (Stats), then wallpaper.
23. **Fractional scale** (a test output at 1.25): the settle comparison still releases before the
    timeout.
24. **`supported()` false** (the test KWin with OpenGL off, if available; otherwise a forced flag):
    the effect doesn't load, and everything works as without it.
25. **Every rule watched red**: each guard removed in turn in a worktree and its test fails.
26. `make test` and a fuzz run with the effect loaded, then Paul's eyes on the live desktop.

## Not in scope

Animations of any kind. A plain workspace switch (KWin shows the other desktop at once); the
second pass kwin-i3 sometimes makes after one is covered by rule 6's quiet period.

## Implementation notes (2026-10-23)

- `plugin/hold.{h,cpp}`, `plugin/holdmain.cpp`, `plugin/hold.json`; a second target in
  `plugin/CMakeLists.txt` (`CMAKE_AUTOMOC_MACRO_NAMES` must list `KWIN_EFFECT_FACTORY_SUPPORTED`,
  or automoc misses the factory's `Q_OBJECT`). `tools/plugin-install.sh` installs and loads it
  beside the mouse plugin.
- Tests: `tests/live/53-hold.sh`, with `tools/shot.py` (ScreenShot2 captures and pixel probes),
  the test client's `--color` and `--resize-delay`, and `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1`
  in the test KWin. The headless KWin's background is black, so a hole reads as `0,0,0`.
- Measured there: a snapshot takes 0.25-1 ms; a no-op change releases in under 40 ms.
- The queued settle check and the quiet period each prevent a release mid-reconcile on their own
  (a 0 ms timer still counts as active until the event loop runs it), so a fault in one is masked
  by the other; the battery disables both together to prove the test sees it.
- Mutation battery (scratchpad `mutate-hold.py`, 10 faults, 2026-10-23): blank-snapshot guard
  off, settle check synchronous (+ no quiet period), new windows not hidden, closing windows not
  kept, hidden held window not kept visible, snapshot drawn at the new frame, everything counts as
  settled, transients hidden too, kill switch ignored. Every one turned at least one check red,
  the intended one in each case.
- Test plan coverage (`53-hold.sh`, 65 checks): tests 1-4, 6, 8, 10 (loaded, supported), 11, 15,
  16 (close while held), 18, 19, 22, 25 and the chained-snapshot test 7 (a swap on the second
  output while the first holds). Not written: 5 (minimized: same path as 19), 9 (the new
  window's placement order), 12 (across outputs), 13 (done as a snapshot-time check), 14 (GTK
  shadow, by eye on the desktop), 17 (two-pass), 20 (unplug mid-hold), 21 (kwin-i3 unload),
  23 (fractional scale), 24 (OpenGL off). `make fuzz` now loads the plugins into its test KWins
  (`tests/fuzz/run.py`), so the effect runs under the random actions (test 26).

## Decisions

1. Timeout: 100 ms (Paul, 2026-10-23: "100 is plenty"). **Changed to 200 ms, Sway's, on
   2026-10-23 ~06:45 as a trial and made permanent on 2026-10-24** (Paul: not felt as slow;
   `kset kwinrc kwin-i3-hold TimeoutMs 200` in the dotfiles' setup.sh; the plugin's own default
   stays 100). The "100 ms" figures above describe the design at that default.
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
2. **2026-10-23, a fresh agent, against the source**: one blocker: the snapshot renders blank once
   the effect is active, because `redirect` draws through our own `drawWindow` (rule 3's flag).
   Changes: settledness checked synchronously could release mid-reconcile (rule 6, queued only);
   the close hold's zero-delay drop raced kwin-i3's timer (rule 4, 20 ms); new windows flashed at
   their default spot because kwin-i3 places them a turn later (rule 5, hide from `windowAdded`);
   hidden windows could reach hardware planes (rule 5, `ItemEffect`). Also: the shadow caveat,
   cleanup on unload, install path, citation fixes, tests 6-10. Confirmed: the transform maths,
   frame callbacks still reach held clients (no stall), stacking across outputs, the D-Bus load
   path and loading at login. A third fresh review before code (Paul).
3. **2026-10-23, a third fresh agent, walking eight scenarios through the rules**: no blocker.
   Changes: a held window that becomes hidden stalled everything to the timeout (rule 6); per-output
   transactions left holes when a window changed output (rule 8, now global); new-window hiding
   had no safe release and the effect can't copy kwin-i3's float rules (rule 5, until a tile or
   20 ms); bookkeeping for deleted windows (rules 4, 9); snapshot cost on the main thread (risk 3,
   test 13); review 2's shadow fix can't work through `CrossFadeEffect` (risk 6); kwin-i3's
   two-pass changes could release between passes (rule 6, quiet period). It suggested messages
   from kwin-i3 for the last two; they race (see "The design"), so timing rules do it instead.
   Paul asked for a fourth review before code.
4. **2026-10-23, a fourth fresh agent**: core design sound; nine scenarios walked, one failure.
   Build blocker: a plugin can't call KWin's scripting to see if kwin-i3 is loaded (rule 5: no
   detection). Changes: Meta+Shift+N left a hole (rule 6, keep the snapshot drawn with a visible
   ref); texture pooling can't be built on `CrossFadeEffect` (rule 9, risk 3); the generic paint
   path, a precise 3 ms timer, output removal, copy-then-unref clean-up order (rules 5, 6, 9);
   six implementer decisions settled (rules 2, 5, 6, 9, 10); timing tests read Stats; tests
   19-24. The race argument held. Paul: fold in, then a focused review of the changes only.
5. **2026-10-23, focused check of revision 4** against the installed kwin-devel headers: every API
   the spec uses exists; ready for code after two fixes, both made: a hidden held window drew its
   live self too (rule 6: snapshot only); a dialog line contradicted rule 5. Settled the visible
   ref's reasons and the Stats export.
6. **2026-10-23, code review of the implementation** (branch `atomic-layout`): nothing blocking.
   Fixed: a use-after-free at release (a window sent away, then closed, in one hold: its visible
   ref was dropped after `unrefWindow` had freed it; now refs go first, as rule 9 says); a stall
   to the timeout when a client answers a configure with its current size (rule 6: a check per
   painted frame; test 12 asks KWin for a size under a window's minimum); a hidden new window
   that closes was kept as a close hold (dropped outright now); a window with no output could
   reach `redirect` (guarded); the quiet period now restarts on a close hold too. Test 12 (a
   GTK window asked for a size under its minimum) passes with the per-frame check removed as
   well: KWin still signals in that case, so the check is insurance for a client that commits
   its current size without any signal, and no test has turned it red. Noted: every
   no-op `aboutToChange` costs a ~1 ms snapshot (kwin-i3's `setSizes` on each re-tile), accepted.

## Sources

Paul's desktop measurement 2026-10-23 (observer script; log kept in the session scratchpad).
KWin 6.7.5 source: `src/xdgshellwindow.cpp` (moveResizeInternal), `src/effect/offscreeneffect.cpp`
(CrossFadeEffect::redirect), `src/effect/effectwindow.h`, `src/effect/effecthandler.h`,
`src/effect/effectloader.cpp`, `src/effect/animationeffect.cpp`, `src/scene/workspacescene.cpp`,
`src/window.cpp`, `src/tiles/tile.cpp`, `src/plugins/blendchanges/`. Sway: `server.c:701` (200 ms). Sway's transactions (`sway/desktop/transaction.c`).
