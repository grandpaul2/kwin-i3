# Spike: can a script drive KWin's own tile tree? (2026-10-21)

**Verdict: yes. Build on it.** KWin 6.7.5 keeps one tile tree per (output, virtual desktop),
which is exactly i3's "one tree per workspace", and a plain-JS script can build, change and fill
it. KWin then does the placing (and, being its own tiles, the border resize and the padding).

Everything below was run in the headless test KWin (`tools/testkwin.sh`), never in Paul's
session, except one read-only dump of his live trees. Scripts are in `spike/`.

## API (KWin 6.7, `src/scripting/workspace_wrapper.h`, `src/tiles/{tile,customtile}.h`)

- `workspace.rootTile(output, desktop)` — the root of that pair's tree. (`tilingForScreen` is
  deprecated since 6.3.)
- `Tile`: `tiles` (children), `windows`, `isLayout`, `parent`, `absoluteGeometry`,
  `relativeGeometry` (writable), `padding` (writable), `resizeByPixels(delta, edge)`,
  `manage(w)` / `unmanage(w)`; signals `windowAdded/Removed`, `childTilesChanged`.
- `CustomTile`: `layoutDirection` (1 horizontal, 2 vertical; writable), `split(direction)`,
  `remove()`.
- `window.tile` — reads the *requested* tile. Writing it works but is deprecated in 6.7 (review
  S1-3); use `tile.manage(w)` / `tile.unmanage(w)`. `manage` refuses a window that is not on the
  tile's desktop, so set `w.desktops` first.

## What was shown

| test | result |
|---|---|
| live session, read only | every (screen, desktop) has its own root, holding KWin's default 3-column layout; no window is in a tile (Krohnkite places them itself) |
| clear a root, `split(H)`, put a and b in the halves | a, b fill the halves exactly |
| `split(V)` on b's tile, c in the lower half | the leaf became a vertical layout node holding b over c: a nested i3 split |
| a tree on screen 2 / desktop 2 while screen 1 shows desktop 1 | independent; untouched desktops keep their own trees |
| `split(H)` on a leaf whose parent is already H | adds a sibling (3 children), as i3 does |
| `padding = 0` | frame == tile, edge to edge (i3 / our "no gaps") |
| `resizeByPixels(100, RightEdge)` | the tile grew 100 px and its neighbour shrank 100 px |
| fullscreen a tiled window, then un-fullscreen | full screen, then back into its tile |
| an X11 window (xmessage via Xwayland) | tiles exactly like a Wayland one |
| round 4: `manage` into a hidden desktop's tile | no geometry until that desktop is shown, then KWin places it by itself |
| round 4: send a tiled window to the other output | it loses its tile and is switched to the desktop that output shows |

## Differences from i3 the script must own

1. **Closing a window leaves its tile empty.** KWin's tiles are a template; i3's are the windows.
   On close, the script removes the tile.
2. **Removing a tile collapses a parent left with one child** (b's vertical split vanished when c's
   tile went), and the removed tile's windows move into the sibling, stacked. i3 keeps
   single-child containers. Decide: accept KWin's collapse (simpler, arguably nicer) or keep a
   shadow tree. Never remove a tile that still holds a window.
3. **Changing a window's desktop does not move it out of its tile.** It stays in the old desktop's
   tree, geometry and all. Workspace moves must re-tile explicitly.
4. **Maximize takes a window out of its tile** (`tile` becomes null). i3 has no maximize: block it,
   or re-tile on un-maximize.
5. **`split` halves the tile being split**, so a third window gets 1/4, not 1/3. i3 shares equally:
   set `relativeGeometry` after an insert.
6. **The trees persist** in kwinrc `[Tiling][<desktop>][<output>]`. At start the script rebuilds
   each tree from the windows actually there, rather than trusting what was saved.

## Not shown (needs a real session)

- Dragging the border between two tiled windows with the mouse. KWin supports it for its own
  tiles; to be confirmed on Paul's desktop.
- Behaviour across a monitor hotplug (2026-10-21's bug class) and across a logout.

## Tooling this produced

- `tools/testkwin.sh`: private headless KWin, two 1280x720 virtual outputs, per-output desktops,
  optional Xwayland. Its first version leaked portals and a `ksecretd` onto Paul's real session
  (the private bus had been given his environment); see the comment at the top for the fix.
- `tools/logsink.py`: KWin drops script `print()` here, so scripts log over D-Bus to this.
