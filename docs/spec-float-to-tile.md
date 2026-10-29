# Spec: float to tile, Meta+Shift+drag of a floating window onto a tile

**Now (2026-10-28):** Proposed, not built. Waits on Paul's go.

OPEN.md item 47 (b). Paul's planned feature, the other half of the float modifier (`behaviour.md`
§9 G5): Meta+Shift+drag pulls a tiled window out to float; the same drag of a floating window
drops it into the tiles, with the drop indicator, where a tiling drag would put it.

## What i3 does (4.24, read from its source)

i3 has no such drag. A floating window never starts a tiling drag, and a tiling drag never
tiles a floating window:

- `route_click` (`click.c`) guards the tiling drag with `!floatingcon` (step 2, `click.c:251-258`;
  step 8 is reached only by tiled windows, `:331-340`). A floating window with the modifier and
  left is `floating_drag_window`, a plain move (step 5, `:284-287`). **Shift changes nothing**
  there: it is read only as `proportional` for the right-button resize (`:221`, `:293`).
- `is_tiling_drop_target` refuses a floating window (`tiling_drag.c:13-16`), and the drop path
  has no `floating_disable` (`tiling_drag.c:340-360`).
- The only way from floating to tiled is `floating disable` / `floating toggle` (a key):
  `floating_disable` (`floating.c:420-448`) inserts the window **after the workspace's focused
  tiling leaf** (`con_descend_tiling_focused`, `:431`, `insert_con_into … AFTER`, `:441`), or at
  the top of an empty workspace (`:437`). kwin-i3's `Tree.floatingDisable` is the same
  (`src/tree.js:854-873`; `behaviour.md` T17).
- No issue or PR asks for it (searched: #1627, #2643, #5184, discussion #6000).

So this is a **+** (no i3 counterpart), not a ≠. It stands on G5's reason (c), Paul's live
verdict of 2026-10-28, which names this feature ("to work both ways later"): `philosophy.md`,
"How a decision is made", step 2 allows a live verdict as precedent for the thing it names.
Everything the feature does *inside* the drag is i3's tiling drag (G6-G10, G12), unchanged.

## Today in kwin-i3

- The helper only looks at tiled windows: a press on a window that isn't in a KWin tile
  returns false at once (`plugin/tilingdrag.cpp:325`), so every press on a floating window is
  KWin's. Meta+left and Meta+Shift+left on a floating window are both KWin's move, which is
  i3's `floating_drag_window` (=).
- Meta+Shift+left on a tiled window: KWin's move, the window floats where dropped
  (`tilingdrag.cpp:328-336`, G5). Not gated by `tilingDrag`.
- The script's drag (`startDrag`, `src/kwin.js:1932`) refuses anything but a tiled leaf, and
  `Tree.drop` (`src/tree.js:780-812`) assumes the dragged window is one.
- Which windows float is told to the effect (`tellFloating` → `kwini3hold SetFloating`,
  `kwin.js:1058`), not to the helper, and only while the frame is on.

## Proposal

**A. The press.** Meta+Shift+left on a floating window of kwin-i3's starts a tiling drag, with
no threshold and no activation (as G1: i3 starts a drag before it focuses anything).
- Only with `tilingDrag` set to a mode with `modifier` (the default, `modifier titlebar`). With
  `titlebar` or `off`, Meta+Shift+left on a floating window stays KWin's move, as i3's
  `floating_drag_window` ignores Shift. The float modifier on a tiled window (G5) stays as it
  is, ungated.
- Meta+left (no Shift) on a floating window stays KWin's move (= i3, step 5). Title-bar drags of
  a floating window stay KWin's.
- "Of kwin-i3's": a window in the tree as floating (not a panel, popup, override-redirect or
  ignored window). The helper needs that list, so the script tells it as it tells the effect,
  whether or not the frame is on: a new `SetFloating(id, on)` on `/kwini3drag`, fed from the
  same places as `tellFloating`. That's the only plugin change besides the press routing.
- **Nowhere to drop**: as G4, the press is swallowed. Here there is somewhere to drop when a
  shown workspace has a tiled window or is empty (one target is enough, the dragged window not
  being one of them). The helper can't count targets when the press comes, so a press with none
  does nothing (Meta alone still moves the window). Rare: every shown workspace would have to
  hold only floating windows.

**B. During the drag.** As G6-G9, unchanged: the indicator (drawn over everything, so it shows
over the floating window), the move cursor, the pointer reaching no window, any button's release
drops, any key cancels, a close on the focused workspace drops at the last target (G7). Targets
and zones are G8 and G9's: the tiled windows of every shown workspace, judged from the pointer
alone, so the floating window itself (or any other floating one) over a tile doesn't hide it. The
floating window stays where it is until the drop, as the dragged window does in a tiling drag.

**C. The drop.** The window becomes tiled first (`Tree.floatingDisable`, i3's `floating_disable`),
then the tiling drop places it (`Tree.drop` with the same plan):
- **An edge or a parent strip** (G9, G10): beside the target, or beside the highest ancestor on
  that side, as for a tiled window.
- **The centre of a window**: **after the target, in its parent** (i3's centre drop,
  `con_move_to_target`), **not a swap**. G11's swap is Paul's verdict for two tiled windows
  ("I love swap"); a swap here would float the target, the opposite of what the drag is for.
  Step 3 (i3's source) decides the rest.
- **The centre of an empty workspace**: tiled there, alone.
- **Another workspace or monitor**: the window moves to the target's workspace, tiled there (as a
  tiling drag across outputs).
- **Cancelled** (a key, or nowhere to drop at the release): it stays floating where it was.
- Its look and state follow the floating toggle (`kwin.js:1470-1479`): the floating look goes
  (keep above cleared if kwin-i3 set it), its floating geometry is kept, so Meta+Shift+Space
  later floats it back there. A sticky floating window keeps its sticky flag, which does
  nothing while tiled (as i3).
- **Focus**: as G1, it stays where it was unless the dragged window had it.
- **Fullscreen** (a floating fullscreen window): as G12.
- **A window KWin can't tile** (fixed size, X6): KWin refuses the tile, and X6 floats it again,
  where the tile was. Not filtered at the press: the script can't tell the helper what KWin will
  refuse.

**D. The docs when built.** A new `behaviour.md` row G13 (+, reason (c), Paul 2026-10-28, this
spec), G3's "floating windows are KWin's" amended, G5's "to work both ways later" pointing at
G13, and the hotkeys cheat sheet's Meta+Shift+drag line (dotfiles, `localbin/.local/bin/hotkeys`).

## Tests

The scenario that drives the tiling drag (`tests/live/51-input.sh`) gets the new case, which
needs **Paul's go** (`testing.md` rule 5): a floating window Meta+Shift-dragged onto a tiled
window's right edge, then the centre of another, then a key's cancel, with the tree checked
after each. And `64-plugin-reload.sh` for the plugin change (P1, step 3). No new scenario.

## Not in this

- A Meta+Shift+drag of a floating window that just moves it (KWin's move with Shift held): Meta
  alone does that.
- Float to tile by the title bar, or by any key other than the one that already exists
  (Meta+Shift+Space, i3's `floating toggle`).
- The floating window following the pointer during the drag (i3's tiling drag doesn't move the
  dragged window; it would also hide the targets under it).
