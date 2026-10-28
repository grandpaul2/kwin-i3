# The pointer: what is at each pixel, and what a press there does

Paul, 2026-10-28 (OPEN.md item 43): "we can't be guessing anymore". The gap handle was changed
twice on guesses about which window gets a press. This file is the home of how a press travels
through KWin 6.7.5 to kwin-i3, read from KWin's source, and of the tools that show it on a real
screen. `behaviour.md` says what kwin-i3 does; this says why the pointer ends up where it does.

## Asking: `tools/pointer-map`

kwini3helper's pointer probe (`plugin/pointerprobe.h`), on D-Bus at `/kwini3helper/pointer`.
Read-only: it moves nothing and presses nothing, so it runs on the live desktop without Paul.

- `pointer-map windows`: every window on screen, top first, with frame and buffer.
- `pointer-map probe X Y`: the windows over a point (frame, buffer, ring, their own hit test),
  the window KWin gives the pointer there, and what a plain left press does.
- `pointer-map map X Y W H`, `pointer-map gaps`: the same for every pixel, as grids. "press" is
  `FrameFocus::decide`, the one function real presses run, so the map can't disagree with a press.
- `pointer-map events`: the last presses and crossings (also in every capture, `pointer.txt`).

What it can't say: what a client draws in its own buffer (a transparent shadow counts as
"buffer"; the screenshot settles what shows), and the cursor's shape (the client sets it).

## A press, step by step (KWin 6.7.5)

Read from KWin's source for the installed version (`v6.7.5`, `src/`), 2026-10-28.

1. **Hover is computed first, at the press itself.** `PointerInputRedirection` runs `update()`
   on every motion and again on a press, before any filter (`pointer_input.cpp:277`, `296-298`):
   `setHover(findToplevel(pos))` (`input.cpp:3659-3680`). So `hover()` at a press is fresh. The
   pointer **focus** (where a press is sent if nobody takes it) is the hover, except while another
   button is held (`focusUpdatesBlocked`, `pointer_input.cpp:562-575`) or over a server decoration.
2. **`findToplevel`** (`input.cpp:3450-3490`) walks the stacking order from the top, skipping
   deleted, minimized, hidden, other-desktop, other-activity and not-yet-painted windows, and
   returns the first whose `hitTest(pos)` is true; none when an effect has the mouse. No kind is
   skipped: the desktop, panels and layer-shell surfaces all count.
3. **`Window::hitTest`** (`window.cpp:349-360`): a server-decorated window hits in its
   decoration's input region; otherwise only where the client's **surface input region** is
   (`surface.cpp inputSurfaceAt`), inside the **buffer** rect, not the frame. An app that draws
   its own frame (VS Code, Chromium, GTK headers) has a buffer larger than its frame (its shadow
   and resize border), and its input region decides how much of that takes the pointer. KWin adds
   no invisible resize margin of its own to a borderless window (only a decoration's
   `resizeOnlyBorders` does; not checked outside `window.cpp`).
4. **The filters**, in `InputFilterOrder` (`input.h:356-382`), each stopping the press by returning
   true (`input.h:161-165`). A new filter goes **before** KWin's filters of the same order
   (`input.cpp:2948-2955`, `lower_bound`), so kwini3helper's `FrameFocus` and `TilingDrag` run
   ahead of KWin's own Decoration filter. Before them, a plain left press is taken only in a
   mode: the lock screen, a drag-and-drop, a window pick, the window switcher held, a pointer
   shortcut bound with no modifier, an effect holding the mouse, an interactive move or resize
   under way, or **an open popup**: a press outside it closes the popups and goes no further
   (`popup_input_filter.cpp:58-80`). Not read: the accessibility filters before `VirtualTerminal`
   and XWayland's.
5. **After them**: KWin's Decoration filter (nothing without a decoration), **WindowAction**
   (`input.cpp:1933-1945`: the focus window's `getMousePressCommand`; over an inactive window
   "activate, pass the click, raise on release" by default, the press passed on), the internal
   windows', then **Forward**: the press goes to the focus surface (`input.cpp:2119-2124`). Over
   the desktop: plasmashell gets it, and WindowAction may activate the desktop window.

So for a gap pixel, the one question is step 2: **which window's input region covers it**. If none
but the desktop's, `FrameFocus` sees hover = the desktop and takes the gap; if a neighbour's
invisible border, the hover is that neighbour, and what happens is whatever `FrameFocus::decide`
says for a margin (`overTiledMargin`: tiled, outside its frame). `pointer-map gaps` answers it for
every pixel.

The press log tells the rest on a real press: the probe's filter sits first in the chain (at
`VirtualTerminal`), so a `press` line with no `FrameFocus` line after it was taken by one of the
filters in step 4.

## The live gaps

(The first live map, and what it settles, go here.)
