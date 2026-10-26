# Spec: a tiled window that resizes itself is put back in its tile, as in i3

Paul's capture 2026-10-25 23:06 (Firefox restarted after a reboot). Paul chose i3's rule (always,
not only after a window opens) and gave the go to build the same day; built and tested
(`tests/live/82-self-resize.sh`) on branch `self-resize`, not live yet.

## What happened

Firefox restored two windows onto workspace 2 (DP-6). kwin-i3 tiled the first full width, then
split for the second: both took their halves (`GEOM … -> 7,7 1270x1426` and `-> 1283,7
1270x1426` at 23:05:59.607). Then Firefox's session restore gave each the size it had before the
reboot, with no TILE from kwin-i3: the left one went back to 2546 wide 19 ms later, over its
neighbour, and the right one to 2548x1388 48 ms later, running about 1270 px past DP-6's right
edge onto the other monitor. kwin-i3 logged both and did nothing.

## Today

`refitOnFrameChange` (`src/kwin.js:551`) puts a window back in its tile only while it is
"armed": every window after a screens change (fuzzer I10), one window after a resize drag
(51-input). A general watch was dropped because it fought slow clients that answer a resize in
steps (53-hold): KWin sends a configure whenever the size asked for differs from the client's
current size (`XdgSurfaceWindow::moveResizeInternal`, `xdgshellwindow.cpp:262`, v6.7.5), so
writing the tile again mid-answer doubled the request.

## What i3 and sway do

- **i3** (`src/handlers.c:300`, `handle_configure_request`): a tiled window's request to change
  size is refused, always, with a synthetic ConfigureNotify telling the client its real geometry
  (`fake_absolute_configure_notify`). A floating window's is honoured (`floating_reposition`).
- **sway** (`sway/desktop/xdg_shell.c`, `handle_commit`): a Wayland client draws its new size
  without asking. A tiled container keeps its size and the surface is clipped to it
  (`view_center_and_clip_surface`); a floating container grows to match.

A KWin script can neither refuse nor clip: it sees the frame after KWin accepted it, and can only
ask for the tile again. That is the nearest to i3 available.

## Proposal

1. **The rule**: a managed tiled window that has **reached its tile and then leaves it** with no
   new tile from kwin-i3 is asked back into it (`fitToTile`). At any time, not only after it
   opens: i3's rule has no window.
2. **Telling it from a slow answer**: a window answering kwin-i3's resize in steps is heading
   *towards* its tile and has not reached it yet; a window resizing itself has already been there.
   So a frame change is refitted only when the frame **before** it (`frameGeometryChanged`'s
   argument) fitted the window's current tile rect. No state is kept: when kwin-i3 gives a window
   a new rect, its old frame no longer fits that rect, so its steps towards it are left alone. In
   the capture both Firefox windows fit (`.607`) before they left, so both are caught; 53-hold's
   windows never fit until their last step. (The spec first had a per-window `settled` flag; the
   old frame says the same with nothing to keep in step.)
3. **At most once a second per window** (`selfFitAt`), so a client that flips back after each
   request isn't asked without end. A second resize inside that second is asked back when the
   second is up (`selfFitLater`, one timer per window), not dropped: session restore comes in
   bursts (review). A client that refuses outright (its own minimum, a fixed size)
   sends no new frame, so it isn't asked again either; a minimum bigger than the tile never fits,
   so it stays as it is today.
4. **Left alone, as today**: floating windows (both i3 and sway honour their size), a fullscreen
   window and a maximized one (on Wayland KWin applies both flags when the client acknowledges the
   configure, `handleStatesAcknowledged`, before the new frame lands at its commit; the untile path
   re-tiles a maximized one), a frame that fills the monitor (a backstop, as the armed path has), one kwin-i3 is moving
   (`placing`), a drag in progress, a reconcile in progress (it ends with a refit), a window outside a
   tile. The GTK 4 bounds path (`borderGone`) runs first, unchanged.
5. **X11 windows** too: i3 is the X11 case, and KWin applies an Xwayland window's own
   ConfigureRequest the same way.
6. **The two armed cases** (screens change, resize drag) keep their own code: they cover a frame
   that *never* reached the new tile (a request in flight landing late), which rule 2 does not.
7. **Log**: one line per refit, `REFIT <caption>: resized itself, asked back into its tile`, so a
   capture shows it beside the client's GEOM.

## Test (`tests/live/82-self-resize.sh`)

**No well-behaved client can resize itself in a tile.** KWin sends a tile's window the xdg tiled
states (`XdgToplevelWindow::doSetQuickTileMode`, `xdgshellwindow.cpp:907`), and then GTK 4's
`set_default_size` and GTK 3's `gtk_window_resize` (Firefox's call) both keep the configured
size: tried, neither changed the frame. Firefox draws at its own size regardless. So the test
writes the frame from outside kwin-i3 (`frameGeometry` from a test script): to kwin-i3 that is
the same event, a frame change it didn't ask for. That KWin accepts a client's own size is what
the capture shows.

- b (lime) changes size within its monitor: asked back into its tile, one REFIT, a untouched.
- a (red), focused and on top, grows over b: back in its tile; a screenshot shows red in a's half
  and lime in b's.
- Twice within a second, at two sizes: one REFIT at once, b back in its tile when the second is
  up, a second REFIT.
- Floating b keeps the size it is given, no REFIT.
- 53-hold passes unchanged (the slow `--resize-delay` client is not refitted mid-answer).

Watched red on main's `src/kwin.js` (5 of 10 checks). Dropping the "old frame fitted" condition
leaves 82 green (its resizes all start from a fitting frame): 53-hold is that condition's test. A window resized past its monitor's edge
was put back even on main (it changes monitor, and that re-places it), so the test resizes within
the monitor. Then `make test`, and a `make fuzz` run: this is the KWin seam.

## Not in this

- Moving a window's contents inside the tile (sway's centring of a too-small surface): KWin draws
  the frame from the client's size; nothing for a script to do.
