# Spec: atomic layout changes (no wallpaper flash when windows move)

Requested by Paul, 2026-10-23. Status: **spec, for Paul's read and then a second agent's review.**
No code yet.

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

A KWin **effect** plugin, `kwini3hold`, built in `plugin/` beside `kwini3mouse` (a second target
in the same CMake project, version-locked to the installed KWin the same way), installed by
`tools/plugin-install.sh`, enabled with `kwinrc [Plugins] kwini3holdEnabled=true`.

It needs **no messages from kwin-i3**, and it works on any tiling change.

1. **Trigger.** For every window, the effect connects to KWin's
   `Window::frameGeometryAboutToChange` (internal API, reached through `EffectWindow::window()`;
   `kwini3mouse` already uses KWin internals). KWin emits it synchronously, before the window
   moves, for both the immediate same-size move and the deferred resize. A D-Bus message from
   kwin-i3 would arrive too late: same-size swaps are applied inside kwin-i3's own call.
2. **Eligible windows**: tiled (`requestedTile()` or `tile()` set), shown (on its output's
   current desktop, not minimized), not fullscreen, and not in an interactive move or resize.
   Nothing is held on an output while any window on it is in an interactive move or resize
   (a border drag re-tiles the neighbours continuously; holding them would make them lag).
3. **Snapshot.** On the first `aboutToChange` of an eligible window, the effect snapshots it into
   a texture at once (KWin's `CrossFadeEffect::redirect`, which renders immediately:
   offscreeneffect.cpp:373), records its frame geometry, and adds it to its output's open
   **transaction**, starting one if none is open.
4. **Paint while held.** Each held window is drawn from its snapshot at its recorded geometry (old
   place, old size), not live. Tiled windows that appear during the transaction (a new window)
   are not drawn until release. A held window that closes stays drawn from its snapshot until
   release (`refWindow`). The output is repainted fully each frame while a transaction is open.
5. **Release.** A transaction ends when every held window has **settled**: its frame geometry
   equals KWin's requested geometry (`moveResizeGeometry()`, within 1 px), meaning no configure
   is outstanding. It also ends after a **timeout of 100 ms** from its start (measured worst case
   13 ms; Sway uses 200). At release every snapshot is dropped in the same frame, so the screen
   goes from the old layout to the new one in one step.
6. **Chained changes.** An `aboutToChange` during an open transaction adds that window (a window
   already held keeps its first snapshot). The deadline is not extended, so nothing can hold the
   screen past 100 ms.
7. **Observability.** The effect counts transactions, their durations and timeouts, and answers a
   D-Bus call `net.local.kwini3hold.Stats` (for tests, and for kwin-i3's Dump State / Meta+Shift+B
   capture). Nothing goes to the journal in normal use.
8. **Kill switch.** `kwini3holdEnabled=false` and a KWin reconfigure turn it off. kwin-i3 works
   unchanged with or without it.

## What it changes for Paul

A move shows the old layout for a few milliseconds longer (typically 5, at most 100), then the
new layout in one frame: no wallpaper in between. Input goes to the windows' real positions during
that time, as it already does. No animation; nothing else changes.

## Risks

1. **Internal KWin API** (`frameGeometryAboutToChange`, `moveResizeGeometry`, `requestedTile`,
   `CrossFadeEffect`) can change between KWin versions. The plugin is rebuilt against each KWin
   update anyway (as `kwini3mouse` is); a build failure leaves kwin-i3 working, without the hold.
2. **A window that never settles** (a hung app, or one KWin never configures): bounded by the
   timeout. Hidden and minimized windows are never held (a hidden window never acknowledges a
   size: OPEN.md, seed 28).
3. **Snapshot cost**: one texture per held window (about 7 MB at 1280x1440), rendered inside the
   call that moves it, freed at release. KWin's own maximize effect does the same.
4. **Wrongly settled or never-settling detection**, e.g. an app that commits a size other than the
   one asked (minimum sizes): it never matches `moveResizeGeometry()`, so its transaction runs to
   the timeout. To check in testing; if real, "settled" becomes "the app has acknowledged the
   last configure".
5. **Interactive drags** must never hold (rule 2); the test suite's drag scenarios cover this.
6. **Two monitors**: transactions are per output; a window moving between outputs is held where
   its snapshot was taken.
7. **Effects ordering**: no other effects are enabled on Paul's desktop; with others, ours draws
   held windows itself and leaves everything else to the chain.

## Tests

1. **Reproduce the gap headless**: the test client gets `--resize-delay MS`, which blocks its main
   loop for that long when its size changes, so its new frame arrives late. Two windows, one slow,
   swapped: a screenshot (KWin's ScreenShot2) taken during the gap shows wallpaper. That's the red
   test, before the effect exists.
2. **With the effect**: the same screenshot shows the old layout, and one taken after release
   shows the new layout complete. Green.
3. **Timeout**: a client delayed 5 s; the transaction ends at about 100 ms (Stats reports a
   timeout), and the screen is not held longer.
4. **Open and close during a transaction**, **minimized and hidden windows** never held,
   **interactive resize drag** never held (Stats: no transactions during the drag).
5. **Every rule watched red**: each guard removed in turn in a worktree (`make mutate` style) and
   its test fails.
6. `make test` and a fuzz run with the effect loaded, then Paul's eyes on the live desktop.

## Not in scope

Animations of any kind. Workspace switches (they replace the whole screen at once already).

## Open questions (for Paul and the review)

1. Timeout 100 ms, or Sway's 200?
2. Settled = "frame equals requested geometry" vs "last configure acknowledged" (risk 4).

## Sources

Paul's desktop measurement 2026-10-23 (observer script; log kept in the session scratchpad).
KWin 6.7.5 source: `src/xdgshellwindow.cpp` (moveResizeInternal), `src/effect/offscreeneffect.cpp`
(CrossFadeEffect::redirect), `src/effect/effectwindow.h`, `src/effect/effecthandler.h`,
`src/tiles/tile.cpp`. Sway's transactions (`sway/desktop/transaction.c`).
