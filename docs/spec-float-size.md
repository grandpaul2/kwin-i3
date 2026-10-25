# Spec: a floated window comes back at its untiled size, as in i3

Paul's go 2026-10-25; built, tested and live the same day. Paul asked: a window brought up as a floating (Plasma) window
should have its untiled size, not its tiled one. Options weighed with a second agent's review
(in-session record, KWin's restore set by the helper, a record that survives logout); Paul chose
i3's way after reading what i3 does.

## The bug, probed

kwin-i3 doesn't size a window it floats: it takes it out of its tile, and KWin moves it back to
its *geometry restore* (`Window::requestTile(nullptr)`, `window.cpp` in KWin 6.7.5). KWin records
that restore when a window goes into a tile from no tile, as the window's size at that moment
(`quickTileGeometryRestore()` = `moveResizeGeometry()`). A script can neither read nor set it
(not a property, `window.h`).

Probed in the test KWin (2026-10-25), Meta+Shift+Space after each:

| path | floats at |
|---|---|
| a fresh window | its untiled size |
| moved to a shown workspace (the other monitor) | its untiled size |
| fullscreen and back | its untiled size |
| kwin-i3 reloaded | its untiled size |
| monitor unplugged and replugged | its untiled size |
| **moved to a hidden workspace**, then shown | **its old tiled size** |

The hidden move: `unmanageFrom` keeps the tiled frame for a window on its way to a hidden
workspace (`src/kwin.js`, the comment above it says why); the new tile doesn't take it until that
workspace is shown (`Tile::manage` calls `requestTile` only for the current desktop), and then
KWin records the frame it has, the tiled one, as the restore. The most ordinary i3 move
(Meta+Shift+N), so it is hit often.

Not ours, and unchanged by this: an app that saved its size while tiled (KDE apps, through
`KWindowConfig::saveWindowSize`, skip only when maximized) opens asking for that size next
session, and that is its untiled size as far as anyone knows. i3 is the same.

## What i3 does (`src/manage.c`, `src/floating.c`)

- At manage (`manage.c:520`) it stores the geometry the window asked for in `con->geometry`,
  once; nothing updates it afterwards.
- `floating_enable` puts the window at that geometry (`floating.c:330`). At 0,0 it centres it
  on the workspace; a rect not on the workspace's output is moved there keeping its relative
  place (`floating_fix_coordinates`: the centre's fraction of the old output, applied to the
  new), centred if that still misses.
- `floating_disable` saves nothing: resized while floating, tiled, floated again, it is back
  at the size it opened with.

## The change (`src/kwin.js` only)

1. **The record.** `untiled[key]`: the window's frame when kwin-i3 first sees it untiled. Taken
   in `adoptWindow` when the window is in no tile and not fullscreen: a new window (KWin has
   placed it at the size it asked for), or one open before kwin-i3's first load. A window
   already in a tile at adoption (a reload) gets none. Never updated; deleted in `dropWindow`.
2. **Applied when kwin-i3 floats a window**: after `untile(w)` in "Floating Toggle", in
   `reclassify` (a rule now says float) and in `floatWindow` (KWin refused it, or its minimum
   size can't fit). A function `floatAtRecord(w)` sets `w.frameGeometry` within the same call,
   as `unmanageFrom` already does (KWin sends the configure from a timer, with the last size
   pending). Not applied, KWin's restore left as now: no record; the window fullscreen; the
   window hidden (its desktop not shown on its output: a hidden window doesn't acknowledge a
   size, see `unmanageFrom`'s comment).
3. **Placement**, as i3: the record's output is the one holding its centre. The window's
   current output the same: the record as it is. Another (the window moved monitor, or the
   record's output is gone): moved by i3's relative rule onto the current output's area, and
   centred there if it still doesn't fit inside. A record larger than the area is cut to it.
4. **Not changed**: a window dragged out of its tile still floats by KWin (KWin anchors it to
   the pointer from its restore), so after a hidden move a drag-out still gets the tiled size.
   A later piece if Paul notices it. A window that opens floating keeps its own size, as now.

About 40 lines.

## Test: `tests/live/77-float-size.sh`

Each case floats a 400x300 client with Meta+Shift+Space and checks its frame's size (and
position where it matters):

1. Fresh, beside another window: 400x300 (+ decoration), where KWin placed it.
2. **Moved to a hidden workspace, shown, floated: 400x300** (red on today's code: 640x720,
   seen in the probe).
3. Moved to the other monitor's workspace, floated: 400x300, at the same relative place on that
   monitor.
4. Resized while floating, tiled, floated again: back at 400x300 (i3's rule, checked so it's
   deliberate).
5. A rule change (floatingClass) floats a tiled one at 400x300, after a hidden move (else KWin's
   own restore would pass it, as it did on the first version of the test).
6. A window already tiled at a reload: floats at KWin's restore, as now (no record).
7. A window open before the load, set off-centre at 100,100 (recorded at the load), moved to the
   other monitor and floated: at 1380,100, the centre's fraction on the new monitor, not centred.

Watched red on the old code: cases 2, 3 (after 2) and 4. `make mutate-live` faults
(`tests/live/mutate.py`, "float size"): the record never applied, never recorded, no relative
rule, a rule's float not at the record.

## Docs

- `docs/plan.md`, "Policies": a floated window takes the geometry it opened with (i3's
  `con->geometry`); the drag-out exception.
- README: nothing (it's what a user expects).
