# Spec: a tiled window that resizes itself is put back in its tile, as in i3

Paul's capture 2026-10-25 23:06 (Firefox restarted after a reboot). Paul chose i3's rule (always,
not only after a window opens) the same day; this spec is for his go to build.

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
   So per window, a flag `settled`: cleared whenever kwin-i3 gives it a new tile rect (each TILE
   write, `expected` changing), set at the first frame that fits that rect. Only a settled
   window's frame changes are refitted. In the capture both Firefox windows fit (`.607`) before
   they left, so both are caught; 53-hold's windows never fit until their last step.
3. **Asked once per size**: the existing `lastFit` guard (one request for the same frame and
   tile) stays, so a client that refuses (its own minimum, a fixed size) isn't asked again for each
   answer; a minimum bigger than the tile stays as it is today.
4. **Left alone, as today**: floating windows (both i3 and sway honour their size), a fullscreen
   window and a frame that fills the monitor (going fullscreen: the frame changes before the
   flag), a drag in progress, a reconcile in progress (it ends with a refit), a window outside a
   tile. The GTK 4 bounds path (`borderGone`) runs first, unchanged.
5. **X11 windows** too: i3 is the X11 case, and KWin applies an Xwayland window's own
   ConfigureRequest the same way.
6. **The two armed cases** (screens change, resize drag) keep their own code: they cover a frame
   that *never* reached the new tile (a request in flight landing late), which rule 2 does not.
7. **Log**: one line per refit, `REFIT <caption>: resized itself, asked back into its tile`, so a
   capture shows it beside the client's GEOM.

## Test (live, a new scenario in `tests/live/`)

`tools/testclient.py --regrow SECONDS:WxH`: the client sets its own size that long after it opens
(GTK 4 `set_default_size` while mapped). **First check the client reproduces the bug on today's
code**; if KWin's tiled configure keeps GTK 4 from growing, the fallback is a GTK 3 client
(Firefox is GTK 3) or real Firefox with a throwaway profile, and this spec says which.

- Two clients on Virtual-0, the second with `--regrow 0.5:1200x700`: after the regrow, both
  frames are back in their tiles (state JSON `frame` vs `tile`), and a screenshot shows each
  colour inside its own half only.
- A `--regrow` to a size below the client's `--min`, or a `--fixed` client: asked once, no loop
  (the log has one REFIT, not one per frame).
- 53-hold passes unchanged (the slow `--resize-delay` client is not refitted mid-answer), and a
  floating client's `--regrow` keeps its new size.

Made trusted with a fault (the `settled` check skipped, and the refit skipped) turning it red.
Then `make test`, and a `make fuzz` run: this is the KWin seam.

## Not in this

- Moving a window's contents inside the tile (sway's centring of a too-small surface): KWin draws
  the frame from the client's size; nothing for a script to do.
