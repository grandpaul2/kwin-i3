# The pointer: what is at each pixel, and what a press there does

No more guessing: the gap handle was once changed
twice on guesses about which window gets a press. This file is the home of how a press travels
through KWin 6.7.5 to kwin-i3, read from KWin's source, and of the tools that show it on a real
screen. `behaviour.md` says what kwin-i3 does; this says why the pointer ends up where it does.

## Asking: `tools/pointer-map`

kwini3helper's pointer probe (`plugin/pointerprobe.h`), on D-Bus at `/kwini3helper/pointer`.
Read-only: it moves nothing and presses nothing, so it runs on the live desktop unattended.

- `pointer-map windows`: every window on screen, top first, with frame and buffer.
- `pointer-map probe X Y`: the windows over a point (frame, buffer, ring, their own hit test),
  the window KWin gives the pointer there, and what a plain left press does.
- `pointer-map map X Y W H`, `pointer-map gaps`: the same for every pixel, as grids. "press" is
  `FrameFocus::decide`, the one function real presses run, so the map can't disagree with a press.
- `pointer-map events`: the last presses and crossings (also in every capture, `pointer.txt`).

What it can't say: what a client draws in its own buffer (a transparent shadow counts as
"buffer"; the screenshot settles what shows). The cursor is in the events: every change, a shape's
name (KWin's, or an app's through the cursor-shape protocol) or "app image", with the window that
has the pointer focus.

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

Plasma's resize in a tile has its own entry points, none through kwin-i3's press filter: once a
KWin interactive resize starts on a window in a KWin tile, KWin resizes the **tile** live
(`window.cpp:1161`, `m_tile->resizeFromGravity`). It starts from an app's own resize border
(`xdgshellwindow.cpp:1060`, `handleResizeRequested`: the press went to the app, which asked), a
server decoration's border, a window action (Meta+right; `TilingDrag` takes it on a tiled
window), the task manager's Resize (`window.cpp:1778`), or Alt+F8. The probe logs every start
(`KWin resize started on ..., edge, pointer, in a KWin tile`) and finish.

## The gaps

What `pointer-map gaps` shows, with an inner gap of 4 and the 1 px frame:

- **Between two tiled windows whose buffers are their frames** (a terminal, Firefox): the gap is
  all kwin-i3's resize, the ring column of each and then the gap columns on each side.
- **Beside an app whose input region reaches past its frame** (Chromium and Electron apps such as
  VS Code: 10 px of input, a 16 px buffer): KWin gives **every** gap pixel to that app, so the gap
  there is `overTiledMargin`'s, not the desktop's. In an outer gap, inside its buffer and past the
  gap reach, a press is `margin`: taken, and nothing done.
- **Across the edge between two outputs**: two outer gaps, not siblings; the part of each next to
  its window is the resize, and the middle passes to the desktop.

## The hover cursor (test KWin)

i3 shows the arrow on frames and in the gaps (`x.c:171`, `XCURSOR_CURSOR_POINTER`; the gap is the
root window) and a resize cursor only on the window it puts up once a resize has started
(`resize.c:238`). Alacritty | VS Code | Alacritty with gaps, the pointer moved across both gaps,
no press:

- Between two terminals' gaps the desktop has the pointer: the arrow, as i3.
- Beside VS Code, **VS Code has the pointer across the whole gap and both rings** and shows its own
  `w-resize` / `e-resize`: Plasma's look where i3 has none. The press there is kwin-i3's resize.
- **VS Code's border reaches 10 px past its frame, 4 px into the terminal's own content** (it is
  stacked above): a click there never reaches the terminal, and `FrameFocus` takes it as a margin
  press and resizes the terminal's **bottom** (`sideOf` on a point inside the frame). Closed by `FrameFocus::decide`'s Margin case.
- Both come from one cause: KWin sends the app no tiled edges for a padded tile (`Tile::anchors`),
  so it keeps its invisible resize border.
- KWin can't send them for a padded tile, and nothing else sets them (`tile.cpp:190`
  `Tile::anchors`, `xdgshellwindow.cpp:907` the only reader; no constrained states in 6.7.5).
  Chromium's 10 px input band reads maximized/fullscreen and its client-shadow flag, not tiled
  (`frame_view_layout_linux.cc:141`; read 2026-10-28, not traced to the end).
- **VS Code with `"window.titleBarStyle": "native"`** (test KWin, same sweep): buffer = frame, the
  gaps and rings are no window's (KWin's `default` arrow), the terminals keep all their pixels,
  every press there kwin-i3's resize: i3's picture exactly.

