# Spec: how tiled windows look, and i3's title-bar drag (OPEN.md item 35)

From Paul, 2026-10-26: "I'm trying to get back a little typical Plasma feel for those who like
that ... see what we could toggle in addition to the borders as well, as far as normal decorations
go." Agreed the same day: one choice for tiled windows (i3 frame / Plasma title bars / bare), the
frame staying the default; and "we'll definitely want i3's title bar drag too." **Status: draft,
reviewed once (2026-10-26, a second agent against KWin 6.7.5; its findings are folded in below,
marked "R-n"); Paul's answers 2026-10-26: A, the window stays put during a drag (i3's); C,
Meta+drag follows i3; B, the maximize button does nothing, as in sway. Nothing built.** Part A (the look) comes
first; part B (the drag) needs it and comes second.

Sources: KWin 6.7.5 (`window.cpp` `processDecorationButtonPress`, `handleInteractiveMoveResize`;
`tiles/tile.cpp` `windowGeometry`), i3 `next` (`src/tiling_drag.c`, `src/click.c`,
`src/config.c`, `etc/config`, `docs/userguide` "Moving tiling containers with the mouse"),
`src/kwin.js`, `plugin/hold.cpp`, `plugin/framefocus.cpp`, `docs/spec-window-modes.md`,
`docs/spec-rounded-corners.md`.

## How it is now

- With kwini3hold loaded (`frameOn`), a tiled window loses its decoration (`w.noBorder`,
  `takeBorder`) and the effect draws the frame in the tile's padding: padding = inner gap +
  2 x `frameWidth` (`gaps()`, `src/kwin.js:307`). The effect rounds the window's corners
  (`roundedCorners`), and the helper's `FrameFocus` filter makes clicks and hover on the frame ring
  the window's.
- **Without kwini3hold the tiled windows already keep their title bars**: no border taken, padding
  = the inner gap, and the headless tests run that way (Breeze) unless a scenario selects the
  frame. What happens then: a title-bar drag moves the window out of its tile and kwin-i3 floats
  it where it lands (`tileChanged`, "Dragged out of its tile"); an edge drag resizes the tile and
  is read back (`readBack`, as Meta+right-drag); minimize leaves a hole that the others fill and
  restore puts it back; the maximize button and a title-bar double-click (KWin's default
  `operationTitlebarDblClick` is Maximize) drop the window out of its tile, and kwin-i3 re-tiles it:
  a flicker that does nothing.
- CSD clients (GTK with a header bar) draw their own title bar in every mode; the effect frames
  them like the rest.

## Part A: the setting

`tiledLook`, choice, default `frame`:

| value | border | effect draws ring | effect rounds corners | padding |
|---|---|---|---|---|
| `frame` | taken | yes | with `roundedCorners` | gap + 2 x frameWidth |
| `titlebars` | kept (the theme's) | no | no (the theme's radius) | gap |
| `bare` | taken | no | with `roundedCorners` | gap |

Without kwini3hold every value acts as `titlebars`, as today (nothing else can draw a ring or
round a corner). Floating windows are untouched: `frameOnFloating` keeps its meaning in every
mode.

### What changes, by place

1. **`src/settings.js`, `main.xml`, the page's kcfg**: the key. The page shows it as one combo box
   ("Tiled windows: i3 frame / Plasma title bars / no border"); the tiled frame's active and
   inactive colours grey out unless `frame`; `frameWidth` stays active while either `frame` or
   `frameOnFloating` uses it.
2. **`src/kwin.js`**: one predicate in place of `frameOn` where it means "tiled windows lose their
   border" (`takeBorder`, `adoptWindow`'s give-back at `kwin.js:962`, `setFrame`'s loop) — true
   for `frame` and `bare` with the effect; and one for "the tiles leave frame room" (`gaps()` and
   `rootRect`'s `HAIR` inset, `kwin.js:307`, `314`) — `frame` with the effect. `lookFloating`,
   `tellFloating` and the `frameMisses` check keep the real `frameOn` (the effect is there) (R-2).
   A change of `tiledLook` in `settingsChanged` gives back or takes borders and redoes the
   padding, as `setFrame` does on an effect change (the refit of `armed` and the GTK 4 bounds
   path, `borderGone`, already cover a border going and coming). `frameMin` already follows
   `tookBorder`.
3. **`plugin/hold.cpp`**: **`titlebars` needs no change** (R-2): `framed()` is already false for a
   decorated window (`hold.cpp:637`), so no ring and no radius, and the theme's radius stands.
   `bare` needs one flag, "ring or not", that the ring's paths follow while the radius stays on
   `framed()`: `paintWindow` (`:598`), `paintFrame` (`:753`), `prePaintWindow`'s transformed
   mark (`:578`), `isActive` (`:553`), `repaintRing` (`:705`). The flag comes **from the script**
   (a `SetTiledLook` call, as `SetFloating`), not from the effect's own read of kwinrc: two
   readers on their own timing would leave the ring and the padding out of step for a pass
   (R-2). The hold itself is unchanged in every mode, a decorated window included.
4. **`plugin/framefocus.cpp`**: already skips a decorated window (`framefocus.cpp:41`); in `bare`
   it has no ring either, so a press in a gap next to a bare window stays the desktop's, as with
   gaps today. It learns the mode the way kwini3hold does (the helper and the effect are one
   library's neighbours, not one object: through kwinrc or the same D-Bus call, to be settled in
   the build).
4a. **KWin's `borderlessMaximizedWindows`** sets `noBorder` itself on a maximize
   (`xdgshellwindow.cpp:1812`): in `titlebars`, `takeBorder`/`giveBorder` must not take that for
   their own (R-2). Off by default.
5. **The maximize button and double-click, in `titlebars`: nothing, as in sway** (decision B, Paul
   2026-10-26: "I agree with sway here. And we even have full floating workspaces"; a Plasma
   maximize is a floating window's, or a floating workspace's). Today's path stays: the window
   leaves its tile and kwin-i3 re-tiles it. If its flicker shows live, quietening it is a fix of
   its own; the background, kept for that: i3 has no maximize,
   and sway declined one ("i3 doesn't have this, so we won't be implementing it", sway #5397):
   requests are ignored. Desktop tilers lift a maximized window over the layout (COSMIC: maximized
   windows belong to the floating layer, cosmic-comp #783). Options: (i) no-op, as now and as
   i3/sway; (ii) a real Plasma maximize over the tiles, panel kept, restore button back to its
   tile (the model keeps its place, as it does for a fullscreen window out of the tiles,
   `inLayout`); (iii) i3's fullscreen, which has no precedent and leaves no title bar to press
   again (R-1). KWin's order (R-2): `maximizedAboutToChange` (before the mode is set: no
   `setMaximize` from inside it), then `exitQuickTileMode` takes the window out of its tile at once
   (`w.tile` null), `tileChanged` at the configure's commit, `maximizedChanged` at the client's
   ack (`xdgshellwindow.cpp:1773-1834`, `1092`).
6. **What shows focus in `bare`**: nothing from kwin-i3. The page says so beside the choice and
   names KWin's own "Dim Inactive" effect (System Settings, Desktop Effects), which does it.

### Things to look at, not to decide now

- Breeze's shadows fall into the gaps and over the neighbours at the default 4 px gap. Paul to
  look at it live once built; if it's ugly, a larger default gap in `titlebars` is a page hint,
  not code.
- Breeze's border-size setting (`BorderSize`) adds side borders to the title-bar mode. It is the
  user's theme setting, left alone.

### Tests

The headless tests already cover a decorated tiled window (the Breeze default) in the main
scenarios. New:

- one scenario per mode (`frame` is today's 54/frame scenarios): the padding between and around
  two windows in pixels, the border state of each window (`noBorder`), no ring pixels outside
  `frame`, corner pixels rounded in `bare` and the theme's in `titlebars`;
- a live switch between the three modes with two tiled and one floating window: nothing moves but
  by the padding, the floating window's border unchanged;
- `titlebars`: the maximize button (injected click on its position: `tools/inject.py`) leaves the
  window in its tile; minimize and restore keep the window's place in the tree;
- faults (`make mutate`): the ring drawn in `bare`; the padding left at frame room in `titlebars`.

## Part B: i3's tiling drag

### What i3 does (`tiling_drag.c`, `click.c`)

- **Start**: a left press on a tiled window's title bar, after a small movement threshold; or a
  left press anywhere in it with the floating modifier held, with no threshold (`click.c` steps 2
  and 8). i3's default config has both (`tiling_drag modifier titlebar`); the built-in default is
  modifier only. Only while there is more than one drop target (`has_drop_targets`): with one
  window and no other visible empty workspace, the press is an ordinary click.
- **During**: the window stays where it is. i3 draws a drop indicator (a rectangle in the focused
  window's indicator colour) at the target under the pointer: the leaf container there, or, over no
  window, the visible workspace of that output (an empty one included). Focus doesn't follow the
  pointer while dragging.
- **Where it drops**, by the nearest edge of the target leaf (`drag_callback`):
  - within 30 % of the target's smaller side: **sibling**, beside the target on that side, the
    target split the other way if needed (`tree_split`, or a two-child parent's layout flipped);
  - closer still (the title-bar height + 5 px) and on an edge that is also its parent's: **parent**,
    inserted as sibling then `tree_move` out one level, climbing while the parent is on that side
    too;
  - else **center**: `con_move_to_target` (as `move container to mark`); with the swap modifier
    (Shift) held at the press, `con_swap`.
  - A workspace target is a center drop (moved onto the workspace). A drop onto itself, not as
    parent, does nothing.
- **Cancel**: `drag_pointer`'s revert (Escape, or another button). Fullscreen: dropped out of it,
  and back on afterwards if it was focused and fullscreen; focus stays with it if it had it.

### In kwin-i3

7. **Who sees the press**: the helper plugin's input filter, at `InputFilterOrder::Decoration` as
   `FrameFocus` is; installed later at equal weight, it runs before KWin's decoration filter
   (`input.cpp:2948`, R-4). A filter can't hold an event and replay it later (R-2), and KWin's
   title-bar press only arms a *delayed* move (`startDelayedInteractiveMoveResize`,
   `window.cpp:1121`, `2779`). So: the title-bar press of a tiled window goes on to KWin
   (focus, raise, the double-click timer, as now); the filter watches the motion while the button
   is down, and past i3's threshold cancels KWin's pending move (`dontInteractiveMoveResize`, to
   check it is reachable from a plugin) and takes the drag: every motion and the release from
   then on are its own. **Meta+left on a tiled window** (decision C: i3's) is taken at the press,
   before KWin's window-action filter starts its move (that filter's order against ours, to
   check); Meta+Shift+left the same, as the swap (KWin's own Shift-on-finish quick tile, R-5,
   never sees it). A floating window's Meta+drag stays KWin's move.
8. **The indicator**: drawn by kwini3hold, which already paints over windows (a rectangle in
   `frameActive`, semi-transparent), from a rect the script sends (`SetDropIndicator x y w h`,
   empty to clear).
9. **The drop**: worked out by the script, which has the tree (sibling/parent need the parents and
   their orientation). The helper sends the pointer's position as it moves and the release or the
   cancel; the script finds the target and zone (ported from `drag_callback`), sends the
   indicator, and on release applies it to the model (`insertConInto`, `move` exist in
   `src/tree.js`; `con_move_to_target` and `con_swap` are new ports from `src/con.c`, with unit
   tests).
   **The channel from the helper to the script is the open technical point**: a KWin script has
   no inbound D-Bus, and `workspace.cursorPos` has no change signal (R-3). Proposed, to probe:
   the helper tells the script a drag began by invoking a hidden kwin-i3 shortcut (registered
   unbound, as the other unbound actions); the script then polls on a short timer
   (`workspace.cursorPos` for the position, one `callDBus` to the helper for the window, the
   swap modifier and whether the button is still down or Escape cancelled) until the helper says
   it ended. A pending `callDBus` answered by a delayed reply (re-armed each time, the 25 s D-Bus
   timeout) is the fallback; it orphans on a reload of the helper (R-3).
   *Rejected (R-6)*: KWin's own move as the drag (the script keeps the window in the tree while
   KWin moves it, and drops on `interactiveMoveResizeFinished`): no filter and no channel, but the
   window follows the pointer, and Paul chose i3's stay-put (decision A).
10. **Floating windows**: their title bar stays KWin's move, as now; a floating window dragged
    over tiles stays floating (as in i3).
11. **`frame` and `bare` have no title bar**: there the drag starts by Meta+left only (decision C).

### Decisions

- **A. The window during the drag**: stays put with the indicator moving, as i3 (Paul,
  2026-10-26).
- **B. The maximize button in `titlebars`**: nothing, as in sway (Paul, 2026-10-26; item 5).
- **C. Meta+left drag on a tiled window**: i3's tiling drag (Paul, 2026-10-26: "follow i3"), in
  place of today's "it floats where dropped"; floating it stays Meta+Shift+Space. Meta+Shift+drag
  swaps (i3's swap modifier). A floating window's Meta+drag stays a move.

### Tests

Injected input (`tools/inject.py`) in the test KWin, `titlebars` mode, three windows: a drag to
each zone of a target (sibling on each side, parent, center, center with Shift), the tree checked
after each (`describe`); a drag to the empty workspace on the other monitor; Escape mid-drag leaves
the tree as it was; a press without movement only focuses; with one window, a title-bar press is a
click. The indicator: a screenshot mid-drag shows its rect. Faults: the zone thresholds swapped;
the drop applied on cancel.

## Order of work

1. This spec: reviewed once, decisions A-C answered (2026-10-26).
2. Part A, in a branch: `make test`, a screenshot of each mode; Paul's go to make it live.
3. Part B's channel probe (decision 9), in a worktree; then part B, in a branch, the same way.
