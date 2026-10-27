# Spec: i3's Meta+right-drag resize of tiled windows (OPEN.md item 37)

**Now (2026-10-27):** Built and live 2026-10-26. What it does: `behaviour.md` §9, "Tiling resize"; its breaks from i3 are in `plan.md`'s divergences.

From Paul, 2026-10-26: "the area I have to grab to meta+rightclick the transitions is small and
not in an obvious spot. In i3 I was able to be pretty much anywhere near that area ... I'm having
to click several times to find the correct spot." He chose approach B the same day: kwin-i3 does
the resize itself, as it does the tiling drag. **Status: live 2026-10-26 (f970807); Paul: "works great in every
way".** Decisions A-D as recommended; tests as approved (unit, 86's checks, 64 green). Built a little
differently from the Design: (1) a gap press reports the nearest tiled window's id, not `-` (the
script then needs no second hit test); the helper finds it within `SetResizeGap(px)`, which
kwin-i3 sets to half the inner gap + 1 at every `SetOn`. (2) `SetDragCursor(on, shape)` takes the
shape as an int (0 move, 1 left-right, 2 up-down). (3) The bar is kwini3hold's indicator (frame
colour, half transparent), not i3's solid focused-border colour. (4) The parent's size for
`Tree.resizeNeighbouring` is worked out from the two participants' frames, their gaps and their
shares (the model keeps no pixels); at a monitor's edge it is a few pixels short. (5) Refused
while a window is fullscreen on the workspace (i3 refuses mixed fullscreen modes). (6) Escape
cancels, but with Meta still held Plasma's Meta+Esc (System Monitor) is taken before the helper:
the test lets go of Meta first. The warp (D) and the cursor, seen live by Paul. **No hover feedback** with Meta held (Paul,
2026-10-26: "that feedback isn't needed. I just click anywhere nearby"; i3 has none either).

Sources: i3 4.24 `src/click.c` (`floating_mod_on_tiled_client`, `tiling_resize_for_border`,
`route_click`, `handle_button_press`), `src/resize.c` (`resize_find_tiling_participants`,
`resize_neighboring_cons`, `resize_graphical_handler`, `resize_callback`); KWin 6.7.5
`window.cpp:2098-2127` (MouseResize), `:1160-1171`, `tiles/tile.cpp:79-104`
(`supportsResizeGravity`); `plugin/tilingdrag.cpp`, `plugin/hold.cpp`, `src/kwin.js` (the tiling
drag), `src/tree.js` (`M.resize`).

## How it is now, and why the spot is hard to find

Meta+right-drag is KWin's own window-action resize (`[MouseBindings] CommandAll3`). KWin picks the
edge from where the press falls in the window: the outer thirds are the edges, the top and bottom
thirds give corners, the middle row gives left or right by the half (`window.cpp:2098-2127`). On
a tiled window only an edge with a neighbour moves the tile (`supportsResizeGravity`); any other
**takes the window out of its tile** and resizes it freely (`window.cpp:1166-1171`). For two
windows side by side the left one's only working area is its right half's middle third, and the
gap between them belongs to neither window, so a press there does nothing.

## What i3 does

- **Anywhere in a tiled window** (mod + right, `click.c:84`): the nearest of the four edges by
  distance from the press, no thirds, no limit; a tie (the exact centre) does nothing. No
  threshold: the resize starts at the press (`click.c:255`, `use_threshold = !mod_pressed`).
- **The participants** (`resize_find_tiling_participants`, both_sides false): up the tree from the
  window to the first ancestor whose parent splits along that edge's orientation and has a sibling
  on that side; that ancestor and the sibling resize. None up to the workspace: nothing happens.
  i3 never takes a window out of tiling.
- **The drag** (`resize_graphical_handler`): a 2 px bar in the focused border colour along the
  boundary, at the middle of the gap between the two; the pointer is warped onto it; a left-right
  or up-down resize cursor; the bar follows the pointer, kept 25 px inside the output. **The
  windows change once, at the release**: the pixels moved become a share
  (`resize_neighboring_cons`: px / the parent's size, refused if either side would drop below
  1 px). Escape reverts.
- **A press in the gap** lands on the root window: i3 only focuses that output's workspace
  (`handle_button_press`, "If the root window is clicked"). No resize.
- Floating windows: mod + right is i3's floating resize. KWin's here, unchanged.

## Decisions for Paul

- **A. Which edge.** i3's nearest edge, **counting only edges that have something to resize
  against** (a neighbour at some level up the tree). A press near a window's outer edge then
  takes its nearest inner boundary instead of doing nothing. A break from i3, small.
  **Recommended.** (i3 exact: the nearest edge, nothing if it has no neighbour.)
- **B. The gap.** Meta+right in the gap between two tiled windows, or on a window's frame ring,
  takes the boundary there. Beyond i3 (its gap press resizes nothing), and it is exactly "near
  that area". **Recommended.**
- **C. What you see.** i3's: the bar at the boundary while you drag, under a left-right or up-down
  resize cursor, and the windows resize once when you let go. One resize per drag, so no app
  redraws all the way through it. **Recommended.** (Live resizing as you drag is the other way;
  Firefox and the GTK apps would redraw at every step.)
- **D. The pointer jump.** i3 warps the pointer onto the boundary at the press, so the bar is
  where the pointer is. With A, a press far inside a window jumps the pointer up to half a window
  away. **Recommended: as i3**, which is what Paul's hand is used to. (Not warping: the bar moves
  by the pointer's movement, from the boundary, with the pointer off to the side of it.)

## Design

1. **The helper** (`plugin/tilingdrag.cpp`, beside the tiling drag) takes a Meta+right press when
   kwin-i3 is on (`SetOn`):
   - on a tiled window (`quickTileMode() == Custom`, as the drag checks), anywhere in it,
     including its frame ring and, in the title-bar look, its title bar;
   - with no managed window under the pointer (the desktop window, or none): only within the gap
     width kwin-i3 passes it of a tiled window's frame (B), found from the stacking order as
     `FrameFocus` hit-tests the ring. Anywhere else the press stays KWin's.
   - Not on floating windows (KWin's resize, as now), not with the pointer constrained or global
     shortcuts off (as the drag).

   It says so through a second hidden action, "kwin-i3 Tiling Resize"; `State()` reports it as
   phase `resize` (then `drop` / `cancel` as now), the window id or `-` for a gap, and the
   pointer. Escape and another button cancel, as in the drag; the motions and the release go
   nowhere else, through the same `TilingDragGrab`.
2. **The script** (`src/kwin.js`, beside `startDrag`) on the hidden action:
   - finds the window (the reported one, or for a gap the tiled window nearest the press), then the
     edge (A) and the participants (`Tree.resizeParticipants`, ported from
     `resize_find_tiling_participants`). None: the press was nothing, the drag ends at once;
   - the boundary: the middle of the gap between the two participants' descended-focused leaves,
     as i3; it asks the helper to warp the pointer there (D; `Warp(x, y)`, the helper calling
     `input()->pointer()->warp`, which is public);
   - shows the bar through kwini3hold's indicator (`SetDropIndicator`, a 2 px rect along the
     second participant, as i3's `helprect`) and the resize cursor (`SetDragCursor` gains the
     shape: `Qt::SizeHorCursor` / `SizeVerCursor`);
   - polls `State()` at the drag's 16 ms; the bar follows the pointer along one axis, kept inside
     the two participants less each side's minimum (the tiles' `minimumSize`, which kwin-i3
     already sets from the windows' `minSize`), so a release can't ask for what KWin's tiles
     refuse;
   - at the drop: the pixels moved become shares (`Tree.resizeNeighbouring`, ported from
     `resize_neighboring_cons`: px / the parent's extent, `conRect`), one reconcile; at a cancel,
     nothing.
3. **The tree** (`src/tree.js`): `resizeParticipants(con, dir)` and `resizeNeighbouring(first,
   second, px, size)`, from `resize.c`, next to `M.resize` (whose both-sides search is the
   keyboard command's). The floor is `MIN_SHARE`, as `M.resize`.
4. **KWin's own resize** stays for floating windows, and for the edges of a tiled window's
   decoration in the title-bar look (KWin's tile resize, read back as now). Without the helper
   plugin, Meta+right is KWin's everywhere, as today.

About 80 lines in the helper, 100 in the script, 40 in the tree, plus the tests.

## Tests (each for Paul's go; docs/testing.md rule 5)

- `make unit`: the two tree ports, each case from `resize.c` (participants up the tree, none to
  the workspace, the share arithmetic, the floor refusal).
- `86-tiling-drag.sh` gains a few checks, not a new scenario: Meta+right in the left third of the
  left window of two moves their boundary by the drag at the release and not before; a press in
  the gap does too; Escape leaves it; a floating window's Meta+right is still KWin's resize.
- `64-plugin-reload.sh` before going live (P1.3: a plugin change).

## Risks

- KWin's window-action filter takes Meta+right after ours (`InputFilterOrder::Decoration` sorts
  before `WindowAction`, as the drag found), so the press is ours to take; already relied on.
- The warp (D): `PointerInputRedirection::warp` is public, but untried here; with a pointer
  constraint active the helper already refuses the press.
- A press in the gap on a monitor's edge, or next to a floating window: the hit test takes only
  tiled windows; anything else stays KWin's.
