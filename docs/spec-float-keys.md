# Spec: floating windows move and resize by key, as in i3

OPEN.md item 23 (the i3 feature map, finding 1: rows A21, A40, A41). Draft for Paul's go,
2026-10-25.

## Today

Meta+Shift+arrows (Move) and Meta+Ctrl+arrows (Shrink/Grow Width/Height) do nothing to a
floating window: `Tree.move` returns at once for one (`src/tree.js:503`), and `Tree.resize` only
takes a tiled con (`tree.js:675`). The only way to move or size a floating window is the mouse
(Meta+drag, Meta+right-drag: KWin's own). KWin has no key that nudges a window: its nearest are
"Pack Window" (to the next edge) and the interactive move (Alt+F7), neither i3's.

## What i3 does (4.24, read from its source)

- **Move** (`cmd_move_direction`, `commands.c:1589`): on a floating window `move left` shifts it
  by **10 px** (the default amount, `commands.spec:411`; `move left 50 px` or `… 5 ppt` of the
  output for other amounts). The new position is refused only when the rectangle would touch no
  output at all (`floating_reposition`, `floating.c:755`); a window can hang off an edge.
- **Crossing a monitor**: after the move, if the window's **centre** is on another output, it
  joins the workspace shown there, and keeps the focus (`floating_maybe_reassign_ws`,
  `floating.c:490`, via `get_output_from_rect`, `randr.c:145`).
- **Resize** (`cmd_resize_floating`, `commands.c:427`): `grow width` adds **10 px** on the
  right, `grow height` on the bottom; shrink takes them off the same edges (`resize grow left`
  would move the left edge, not used by i3's default keys). The ppt half of `10 px or 10 ppt` is
  for tiled windows only. Size limits (`floating_check_size`) and the window's size increments
  (a terminal's cell size) win; a resize that changes nothing doesn't move the window.

## Proposal

1. **Move**, with the Move Left/Down/Up/Right keys on a focused floating window: shift its frame
   by 10 logical px. Refused (nothing happens) when the new frame would touch no monitor. A
   fullscreen or maximized floating window is left alone (i3 has no maximize; moving one would
   un-maximize it in KWin).
2. **Crossing**: when the frame's centre lands on another monitor, the window joins the workspace
   that monitor shows and keeps the focus: the code a Meta+drag drop already runs
   (`src/kwin.js:1075`), shared.
3. **Resize**, with the Shrink/Grow Width/Height keys on a focused floating window: 10 logical px
   on the right or bottom edge. KWin clamps to the window's minimum and maximum size. i3's
   size-increment fix (#1011, a terminal's cell bigger than the step) has no counterpart to port:
   Wayland has no size increments, and for an Xwayland window KWin applies them itself; a client
   that answers with a size of its own choosing (a terminal snapping to its cells) gets the size it
   picks, as with a Meta+right-drag.
4. **The amount**: fixed 10 px, as i3's defaults, no new setting. (Option for Paul: a
   `floatingStep` setting beside `resizeStep`, if 10 px proves slow on a 2560 px monitor.)
5. **Plasma-window workspaces** (`floatingWorkspaces`): every window there floats, so the keys
   move and size them the same way. That is what a user of those workspaces would expect from the
   key's name; noted so it's a decision, not a surprise.
6. **Nothing else changes**: tiled windows keep i3's tree moves and percentage resize; the keys,
   their names and the settings page are as they are.

The model needs no change: a floating con keeps no geometry of its own (KWin's frame is the truth,
as for Meta+drag), so this is `src/kwin.js` only, in the Move and resize actions: a floating
focused con goes to a new `nudgeFloating(w, dx, dy)` / `growFloating(w, dw, dh)` instead of the
tree.

## Test (live, `tests/live/`, a new scenario)

A floating test client (`--dialog`, or Meta+Shift+Space on a plain one) on Virtual-0:
- Move Right: frame x +10, y unchanged; Move Up: y -10; the tree unchanged.
- Grow Width: width +10, x unchanged; Shrink Height: height -10.
- A `--fixed` client: Grow Width changes nothing and logs no error.
- Crossing: moved right until its centre passes x 1280 (about 64 presses from where it opens; a
  loop of key calls): it is on Virtual-1's workspace in the tree, still focused.
- Off every monitor: a move that would leave no part on a monitor is refused (the frame at the
  far right edge of Virtual-1, Move Right until it stops).
- A tiled window's Move and Grow are untouched (the existing 10-tiling and resize tests cover it).

Made trusted with a fault (the floating branch skipped) turning it red, per CLAUDE.md.

## Not in this

- `move position center` / `move position mouse` (A23, A24 in the map): not asked; KWin's
  placement handles a new floating window.
- `resize set <w> <h>` (A42): no key in i3's defaults.
- `move left 50 px` style amounts: kwin-i3's keys carry no arguments.
