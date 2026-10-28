# Spec: the gaps are kwin-i3's, as i3's are i3's

Paul, 2026-10-28 (OPEN.md item 43). Status: **probed; verdict build A + B + C, for Paul's go**. Nothing built on main;
the probes are on branch `gapwin-probe`. The measurements are in `docs/pointer.md`.

## 1. How i3 does it

- **Every client sits inside a window of i3's own.** i3 reparents each client into the frame
  window it creates (`manage.c:554`, `xcb_reparent_window(... nc->frame.id, 0, 0)`). X11 clips a
  child window to its parent, its drawing and its input both, so a client can't take one pixel
  outside its tile, whatever it asks for. i3 doesn't advertise `_GTK_FRAME_EXTENTS` either (not in
  its `_NET_SUPPORTED`), so GTK apps don't even draw their shadow and resize border under it.
- **The gaps are the root window.** A press there only focuses that output's workspace
  (`click.c:398-413`). A press on the border is i3's resize (`CLICK_BORDER`, `tiling_resize`).
- **The cursor**: the arrow on frames (`x.c:171`, `XCURSOR_CURSOR_POINTER`) and on the root; a
  resize cursor only on the window i3 puts up once a resize has started (`resize.c:238`).

So in i3 the space between clients belongs to the window manager, by construction.

## 2. How kwin-i3 copies it today, and where that falls short

kwin-i3 owns nothing in the gap. It filters presses (`FrameFocus`, ahead of KWin's own Decoration
filter) after KWin has already given the pointer to whichever window's **input region** covers the
point (`Window::hitTest`: the client's region inside its buffer, not its frame; `docs/pointer.md`).

- Next to an app with a plain frame (Alacritty, Paul's Firefox), nothing covers the gap: the
  desktop has the pointer, the arrow shows, and `FrameFocus` makes the press i3's resize.
- Next to an app that draws its own frame (VS Code's default title bar, Chromium, Electron apps,
  GTK header bars), **the app's invisible resize band covers the gap** (VS Code: 10 px past its
  frame). The app has the pointer, so **its resize cursor shows across the gap and on the
  neighbour's ring**. The press is still kwin-i3's, because `FrameFocus` takes margin presses.
  The band also covers **4 px of the neighbour's own content**, when the app is stacked above it.
  A click there never reaches the neighbour, and `FrameFocus` resizes the neighbour's **bottom**
  (a bug: part C).
- The band can't be removed from outside. KWin tells an app it's tiled only through
  `Tile::anchors`, which returns no edges for a tile with padding (`tile.cpp:190`). kwin-i3's
  tiles always have padding (the gaps), and nothing else sets those states. Chromium's input
  insets don't read the tiled state anyway (`ui/views/window/frame_view_layout_linux.cc:141`:
  maximized, fullscreen and its client-shadow flag; its shadows and corners do read tiled). Not
  traced: that VS Code's band is Chromium's 10 px (Electron may hit-test on its own). An app setting can
  remove it: VS Code's `"window.titleBarStyle": "native"` gives exactly i3's picture (measured).

## 3. The copy: a window of kwin-i3's over the gaps (part A)

i3's frame window, as far as Wayland allows: **one input-only window per output, inside KWin, whose
mask is exactly the gaps**, so that KWin's hit test finds it before any app's band.

- **How:** a `QWindow` in kwini3helper, so it is in KWin's own process and becomes a KWin
  `InternalWindow`. It is frameless, `Qt::BypassWindowManagerHint`, does not take focus, and
  paints fully transparent, with the arrow as its cursor. KWin's hit test honours its mask
  (`internalwindow.cpp:70-86`). A press on it is a gap press to `FrameFocus`.
- **The mask:** the output's tiling area, minus each tiled window's frame, plus each ring.
  Then, minus **everything shown above the tiles**: floating windows, panels, popups,
  notifications, OSDs. KWin puts internal windows in the Overlay layer, above all of these
  (`window.cpp:544`), so any of them the mask doesn't leave out would be blocked. A fullscreen
  window empties it, and so do a hidden desktop and Show Desktop.
- **Kept current on:** a layout change (kwin-i3's TILE), a geometry change of any shown window,
  a stacking change, a desktop switch, an output change, fullscreen, minimize.

**Probe** (test KWin, terminal | VS Code | terminal, Paul's gaps, VS Code's default title bar;
one strip over one gap):
- In the gap: the arrow, pointer focus kwin-i3's window.
- A press there: `FrameFocus` gap-resize, `ew-resize` during the drag, i3's resize at release.
- Before it, VS Code's `w-resize` showed across the whole gap.

**Hurdles it showed, each with its answer:**

| hurdle | answer |
|---|---|
| the window came out 75 px wide, not 6, covering VS Code's content | kwin-i3's own floating minimum (75x50), applied because the script managed it: the script skips it (next row), and strips stay 6 px (probed below) |
| kwin-i3's script managed it as a floating window (`~kwin-i3_gap`) | the script skips it (its caption and class), as i3 never manages its own frames |
| `Qt::Tool` holds `Qt::Popup`'s bit: KWin closed it as a popup on the first motion | `BypassWindowManagerHint`, no Tool (fixed in the probe) |
| asking a closed internal window for its hit test crashed KWin | fixed on main in the pointer probe (`9b856b8`); the gap window never asks closed windows |

**Probed 2026-10-28** (test KWin, after the table above):
- **The 75 px was kwin-i3's own**: the script managed the window as floating and gave it i3's
  `floating_minimum_size` (75x50, `src/kwin.js:822`). With the script skipping it, a strip stays
  6 px. So: **one window per gap strip**, not one per output. Its paint cost is the strips only,
  and only where something under them is redrawn. KWin's GL renderer does draw an opacity-0
  window (no opacity-0 skip in its item traversal, `itemrenderer_opengl.cpp:170-185`; it only
  modulates the alpha, `:434`), so a whole-output window would have cost a
  blended quad over every damaged area; strips make that the gaps alone. Its scanout checks skip
  opacity 0 (`workspacescene.cpp:288`).

**Still to check while building (expected unaffected):**
1. **Drag and drop across a gap** (a file dragged from Dolphin over the gap): KWin's
   DragAndDrop filter runs first, so it should be unaffected. Check it.
2. **KWin's own effects** (Overview, Present Windows): `findToplevel` returns nothing while an
   effect has the mouse, so it should be unaffected. Check it.

## 4. The neighbour's 4 px (part B)

The gap window can't help here: those pixels are inside the neighbour's frame and must reach the
neighbour. In i3 they would, because of clipping. The answer in KWin is **stacking**. Tiled windows
never overlap visibly, so the order among them is invisible, and kwin-i3 can raise the tiled
window whose frame is under the pointer above its tiled neighbours. It raises without focusing,
and stays below every floating window. Then each tiled window owns its whole frame, as in i3.
**Probed 2026-10-28**: `Workspace::raiseWindow` of the terminal above VS Code: zero screen
pixels changed (a screenshot diff), the tree and the focus unchanged, and KWin then gave the
terminal all of its frame (its last 4 px were VS Code's before). To keep while building: the
raise stays among tiled windows, below every floating one (`spec-reload-keepabove.md`).

## 5. Part C: the bug, whatever is decided

A margin press inside another tiled window's frame resizes that window's **bottom** (`sideOf` on a
point inside the frame). Fix: a margin press inside a tiled window's own frame is not a gap press.
It goes no further (taken, nothing done), since the app holding the pointer can't hand it on. With
part B it can't happen. Without part B it is the honest minimum. The test: the test client's
`--csd` beside a terminal, a press 2 px inside the terminal's edge, watched red then green.

## 6. Cost and verdict

- **Size:** part A is about 200 lines of C++ in kwini3helper (the window, the mask, its upkeep)
  and about 5 lines of the script. Part B is about 40 lines. Part C is about 10.
- **Coupling:** part A leans on KWin's `InternalWindow` (the mask in the hit test, the Overlay
  layer, the popup bit). These are KWin internals with no promise behind them, like the rest of
  the plugins. A KWin update can break them, and the plugin must be rebuilt for each KWin release
  anyway.
- **Gain:** the gap behaves as i3's does for every app on every system: Electron, Chromium, GTK
  header bars, anything with its own frame. No per-app setting is needed. And kwin-i3 then owns a
  surface in the gap, which future work can use (the split indicator, drop zones).

**What we know now, either way:** with a plain-frame app, the gap already behaves as i3 intends.
With a custom-frame app, without part A, **the only difference left is the cursor** (the app's
resize cursor over its 10 px band), plus the 4 px bug (part C). The press stays kwin-i3's.

**Verdict (after the probes, 2026-10-28):** build A + B + C. Both probes passed: the strips
cost only the gaps, and the raise is invisible. That is the full i3 ownership without needless
bulk, for every app that draws its own frame. Before building, the design left is the mask's upkeep
(what sits above a gap, fullscreen, desktops, outputs) and when to raise.
