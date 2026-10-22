# i3's window tree inside Krohnkite — plan (2026-10-21)

Paul: *"with krohnkite you are setting the divisions and then moving the content around inside of
those divisions. whereas i3 the windows are like their own entity that is moving amongst other
entities."* He wants the i3 model, and is fine with it taking time.

## What exists, and why we build it

- **No KWin 6 script does this.** The one i3 tree layout for KWin, `kwin-tiling`'s I3Layout
  (Meta+V/Meta+B wrap modes, a `containerTree`), is Plasma 5 and archived since 2022-11.
  Polonium (KWin 6) keeps a binary tree but chooses splits itself; I found no preselection.
  Upstream Krohnkite (Codeberg, active) has none either.
- **Krohnkite can host it.** Its layouts are per surface (output + activity + desktop, i.e. one per
  i3ws workspace), get `apply(ctx, tileables, area, gap)` on every arrange, get first refusal on
  every shortcut (`handleShortcut`, before the engine's own swap), and get `adjust` for mouse
  resizes and `drag` for mouse moves. `ColumnsLayout` already keeps state keyed by window id across
  arranges, a two-level tree. So a deeper tree is a new layout class, not an engine rewrite.
- Replacing Krohnkite would also throw away the i3ws work and the per-screen-desktop patches.

## The old i3 config (git `d3de958^:i3/.config/i3/config`) is the spec

| key | i3 | now |
|---|---|---|
| Meta+H / Meta+V | `split h` / `split v` | unbound |
| Meta+E | `layout toggle split` | unbound |
| Meta+W | `layout tabbed` | **Overview** (2026-10-21) |
| Meta+A | `focus parent` | unbound |
| Meta+R | resize mode (arrows / jkl; ±10 ppt, Return/Esc out) | unbound |
| Meta+Shift+Space | `floating toggle` | unbound |
| Meta+Space | `focus mode_toggle` (tiled ↔ floating) | unbound |
| Meta+Shift+dir | `move` (tree move) | i3ws → Krohnkite swap |
| default | new workspace splits horizontally | — |

## Design

1. **`I3TreeLayout`**, a new class in our patched `script.js`, marked `i3ws patch` like the rest.
   Per surface: a root container. A container has an orientation (`h`, `v`, later `tabbed`), an
   ordered list of children (window ids or containers) and a weight per child.
2. **New window**: inserted after the focused window in that window's container; the first window
   on an empty workspace goes in the root (`h`).
3. **Meta+V / Meta+H**: as i3, wrap the focused window in a new container of that orientation
   (one child). The next window opens inside it. If its parent already has that orientation and only
   this child, nothing changes (i3 does the same).
4. **Close**: remove the leaf; remove containers left empty. i3 keeps single-child containers, and so
   will we, so behaviour matches.
5. **Meta+Shift+dir**: i3's `tree_move` (src/move.c), ported, not reinvented: swap with a leaf
   sibling that way, enter a sibling container that way, or leave the parent at its edge and land
   beside it one level up. At the root edge, i3ws's existing cross-screen move takes over, as now.
6. **Meta+E**: flip the focused window's container between `h` and `v`.
7. **Resizing**: `adjust` changes weights, so a mouse drag of a border works. Meta+R mode, if wanted:
   KWin has no modes, so i3ws would grab arrows/jkl until Return/Esc (scope question below).
8. **Moves between workspaces/screens** (i3ws): an arriving window is inserted beside the focused
   window there (i3), or at the root's left/right edge for a screen-edge crossing (what i3ws's
   `KrohnkiteI3wsToFront` does today).
9. **Rollout**: the new layout goes first in Krohnkite's layout order; Tile stays as a fallback
   Krohnkite layout. Krohnkite is a QML script, so every reload is a **logout** (CLAUDE.md table).

## Tests

The tree is plain JavaScript with no KWin calls, so a node harness in `tests/` drives it directly:
open, split, close, move, toggle, resize, cross-screen arrival, each asserted on the resulting tree
and on the rectangles. Each guard gets a mutation watched to go red before it counts. Live checks
afterwards read window geometry back from KWin (`getWindowInfo`), as done on 2026-10-21.

## Out of scope unless asked

Tabbed (Meta+W is the Overview now, and KWin has no tab bar to draw: a tab would be a full-size
window with its siblings stacked behind), stacked, `focus parent` (KWin can't focus a container, so
moves/splits on a selected container would need an indicator drawn by us), saving trees over a
logout (i3 doesn't across a logout either).
