# Spec: redo stage 7, the look (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §7 L3 (three colour classes), L4 (the split indicator), L6
(`hide_edge_borders`, `smart_gaps`), L11 (floating rings in the same classes), §11 N2 (outer gaps
per side, gaps per workspace), all decided (Paul, 2026-10-27). Paul's rule for the look: blend
with Plasma, **no performance cost**.

## What happens today, from the sources

**kwin-i3**: the effect (`plugin/hold.cpp`) draws each ring in `frameActive` if the window is
**KWin's active window**, else `frameInactive` (`:846-847`); floating rings (with
`frameOnFloating`) in `frameFloatingActive` / `frameFloatingInactive` (Paul's kwinrc sets the
first to #4d7254). The script sizes the tiles: inner padding `gapsInner` (even) plus twice the
ring's width, the root inset by `gapsOuter` plus half the inner gap, the same on all four sides and
every workspace (`gaps()`, §6).

**i3 4.24**:

- **Colour class** (`x.c:498-512`): `focused` for the focused window; `focused_inactive` for a
  window that is its parent's last focus but not the focused one (the other output's focused
  window, the last focus of a split the focus isn't in); `unfocused` otherwise; `urgent` (out
  here). The border is drawn in the class's `child_border`, by default its background
  (`config.c:189-206`): #285577, #5f676a, #222222.
- **The split indicator** (`x.c:585-599`): a window with no siblings, not floating, gets the side
  where the next window opens (right in a horizontal split, bottom in a vertical one, the
  workspace counting as the parent) in its class's `indicator` (#2e9ef4, #484e50, #292d2e).
- **`hide_edge_borders`** (`con.c:1826-1879`): `none`, `vertical`, `horizontal`, `both` hide the
  border sides where the window **touches the workspace's edge** (`con_adjacent_borders`: its rect
  on the workspace's; with a gap at that edge it doesn't touch); `smart` drops the whole border
  when the workspace has one visible window; `smart_no_gaps` the same, only with no outer gaps.
  Floating windows never.
- **`smart_gaps`** (`gaps.c:16-46`): `on`, no gaps at all on a workspace with one visible window;
  `inverse_outer`, outer gaps only then.
- **Gaps per side and per workspace**: `gaps top|right|bottom|left|horizontal|vertical|outer|inner
  N`, and `workspace N gaps … M`, **added** to the global ones (`gaps.c:32-42`).

## Design

### A. The ring's class comes from the model (L3, L11)

The script works out each framed window's class at the end of a pass, from the tree as i3's
`x.c` does (focused; its parent's last focus; else unfocused). **A floating window**: i3 wraps
each in a floating container holding only it, so an unfocused floating window is always its
parent's last focus, `focused_inactive`; kwin-i3's model puts floating windows straight on the
workspace, so this is written as its own case, not left to the parent test. Before the script's
first `SetRing`, and after a release, the effect colours as today (KWin's active window); and sends only changes to the
effect: `SetRing(id, class, indicator, hidden)` (one call per changed window, as `SetFloating`
is now). The effect stops reading KWin's active window for the colour. **So the ring follows
i3's focus, not the keyboard**: with KRunner or a menu open (stage 2's override-redirect keeping
the keyboard), the focused window keeps its focused colour, as under dmenu.

**Settings**: `frameActive` (focused, #4c7899, kept), `frameFocusedInactive` (new),
`frameInactive` (unfocused, #333333 today); `frameIndicatorActive`, `frameIndicatorFocusedInactive`,
`frameIndicatorInactive` (new). The new defaults: call 36 below (as proposed, confirmed on screen when built). Floating rings use the
same six (L11): `frameFloatingActive` and `frameFloatingInactive` go, so Paul's muted green goes
with them (decided, L11), and the load report says once that they are no longer read. A floating
window keeps Plasma's look by default (`frameOnFloating` off).

### B. The split indicator (L4)

`indicator` in A's call: `right` or `bottom` for a tiling window with no siblings in the model
(its parent's layout, the workspace's for a lone window), else none. The effect draws that side of
the ring in the class's indicator colour. Only where a ring is drawn (`frame` look, and floating
windows never: i3's `con->parent->type != CT_FLOATING_CON`).

### C. Hiding ring sides (L6, `hide_edge_borders`)

**`smart` and `smart_no_gaps` work**: a workspace with one visible tiling window has no ring and
no room for it (its one tile's padding 0). **The per-edge values (`vertical`, `horizontal`,
`both`) can't be built as i3's**: KWin clamps a root tile to the output
(`tiles/customtile.cpp:58`, `intersected(0,0,1,1)`), so its inset can't go below 0, and a
tile's padding is one number for all four sides (`tiles/tile.h:33`; an edge side gets the full
padding, `tile.cpp:175-177`), so taking the ring's room away at an edge takes it from all four.
So (call 41, Paul 2026-10-28): those three hide the ring's side (`hidden` in A's call) and leave
a strip of the ring's width (1 px by default) where the window doesn't reach the edge, ≠ i3 with
that reason.

### D. Gaps (N2, L6 `smart_gaps`)

- `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` (empty: `gapsOuter`), as i3's per-side outer
  gaps; the root's inset per side (KWin's root tile takes any rectangle inside the output, which
  an inset of 0 or more always is).
- `workspaceGaps`, i3's lines (`3 gaps inner 10`, `5 gaps outer 0`), **added** to the global ones
  per workspace, as i3; each workspace's root and its tiles' padding (one root per output and
  virtual desktop, so per workspace).
- `smartGaps` (`off` default, `on`, `inverse_outer`): judged per workspace each pass (one
  visible tiling window); a change re-places that workspace only.
- KWin's tile padding is one number per tile, the same on all sides; the per-side gaps live in
  the root's inset.

### E. Cost (Paul's rule)

The class, indicator and hidden sides are computed only for windows on visible workspaces at the
end of a pass that changed something, and sent only when they change; the effect draws the same
ring with up to two colours. No per-frame work is added.

## Tests

- **Run**: `make unit`; 26 (gaps), 54 (frame), 57 (effect frame), 58 (frame cases), 78 (rounded
  corners), 85 (tiled look), 25 (settings), 64 (the effect changed).
- **Expectations that change**: 57's ring colour checks (screenshots) where the active window
  isn't the model's focus; 26's gap cases where per-side keys are unset (unchanged values).
- **New checks, approved (Paul, 2026-10-28)**: 57, the three classes on two outputs (focused, the other output's
  focused window as focused_inactive, a third unfocused) and the indicator on a lone window; 26, a
  per-side gap, a workspace gap, `smartGaps on` with one window; 58, `hide_edge_borders` with
  outer gaps 0.

## Paul's calls (2026-10-28)

36. The defaults as proposed: `focused_inactive` #5f6b78; the focused indicator #3daee9, the
    other two indicators their class's frame colour; `unfocused` stays #333333; confirmed on
    screen when built.
41. `hide_edge_borders`: `none`, `smart`, `smart_no_gaps` as i3; `vertical`, `horizontal`, `both`
    hide the ring's side and leave a strip of the ring's width at the edge, ≠ i3 with KWin's
    reason (C).

## Live check (Paul)

Two monitors: the other monitor's last window has the focused_inactive ring; open KRunner: the
focused ring stays focused. A window alone on a workspace shows the indicator on its right; Meta+V
then shows it at the bottom. With `hideEdgeBorders=smart`, a lone window has no ring.

## Done when

Live and Paul's "it works": L3, L4, L6, L11, N2 rewritten as built; §11's settings table gains the
new keys, loses the two floating colours.

## Paul's review (2026-10-28)

67. The indicator shows on a window alone on its workspace too, as i3 (most of Paul's focused
    windows will carry it); seen on screen when the colours are confirmed.
