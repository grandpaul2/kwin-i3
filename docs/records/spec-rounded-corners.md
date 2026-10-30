# Spec: rounded corners on tiled windows

**Now (2026-10-27):** Built and live 2026-10-25. What it does: `behaviour.md` §7, "Tiled windows".

Paul's go 2026-10-25; reviewed by a second agent against KWin 6.7.5's source the
same day (two must-fix, both in below: the frame's corner wedge, and the reset when the effect is
inactive). Paul asked for a toggle that rounds tiled windows' corners, the
frame following the curve, Breeze's 5 px radius, **on by default** ("not many people like square
corners anymore"). Floating windows are unchanged: they keep their theme's corners (window modes,
decision 3).

## How corners work now (KWin 6.7.5, Breeze 6.7.5)

- KWin rounds a window only through `Window::borderRadius`, which it sets from the window's
  decoration and nothing else: no decoration, radius zero (`window.cpp:2647`,
  `updateDecorationBorderRadius`, called from `setDecoration`). Its renderer clips the window's
  content to that radius, antialiased, decorated or not (`itemrenderer_opengl.cpp:190`, the
  `RoundedCorners` shader trait).
- Tiled windows have no decoration (kwin-i3 sets `noBorder`, policy None). For an app that
  speaks xdg-decoration or KDE's server-decoration protocol, KWin then tells it "server side"
  and draws nothing (`xdgdecoration_v1.cpp:131`, "faked as server_side mode"), so the app draws
  no title bar or corners either. Hence square tiled windows, Firefox included (seen live,
  2026-10-25 capture, corner pixels). KWin's "you are tiled" states are **not** sent: a tile with
  padding has no anchors (`tiles/tile.cpp:190`), and every kwin-i3 tile has padding.
- Breeze's radius is fixed: 2.5 x smallSpacing (2 on Wayland) = 5 px, snapped to the pixel grid
  (`breezedecoration.cpp:857`). It paints its title bar's top corners itself; it sets a
  `borderRadius` for KWin to clip with.
- A script can't reach `borderRadius` (not in the scripting API). `Window::setBorderRadius` is
  public in `KWIN_EXPORT` `Window` (`window.h:672`), so kwini3hold can.

**Probed** (test KWin, worktree, 2026-10-25): kwini3hold setting `BorderRadius(5)` on every
`framed()` window in `prePaintWindow`. Two tiled Alacritty windows came out with antialiased
5 px corners, the content untouched elsewhere; the 1 px frame stayed square around them, leaving
a dark wedge between frame and content at each corner. One floated with Floating Toggle came back
with Breeze's own rounded look: `setDecoration` replaced the probe's radius with Breeze's.

## The change

1. **Setting** `roundedCorners`, bool, **default true** (`src/settings.js`,
   `package/contents/config/main.xml`, the page's kcfg). Read by kwini3hold in `reconfigure`
   beside `frameOnFloating`. The script has nothing to do with it (the tiles and padding are
   unchanged). Radius: **5.0 logical px**, as Breeze, passed unsnapped: a window has one radius
   but may span outputs of different scales, and KWin scales and rounds it per output itself
   (`itemrenderer_opengl.cpp:190-193`); the frame rounds `5 x viewport.scale()` the same way.
   Not a setting.
2. **The radius, set by kwini3hold**, on windows that are `framed()` (in a kwin-i3 tile, no
   server decoration, not fullscreen or minimized) while `roundedCorners` is on. Only two places
   in KWin write a window's radius: `setDecoration` (`window.cpp:2627`) and the decoration's own
   `borderRadiusChanged` (`:2619`); X11 (`x11window.cpp:989,998`) and Wayland
   (`xdgshellwindow.cpp:843`) windows both go through `setDecoration`.
   - **Set**: on `windowDecorationChanged` (emitted after `setDecoration` has reset the radius,
     `window.cpp:2628`, so it is set again before any paint: no frame of square corners), on the
     tile signals (`tileChanged`, `requestedTileChanged`), and for every window when the setting
     changes: compare, set if different. A `prePaintWindow` backstop was built (review: safe
     there) and taken out: the fault battery showed it never acted, every way into `framed()`
     having a signal.
   - **Reset** to `BorderRadius()` in the existing handlers (`hold.cpp:137-139`): fullscreen on,
     minimized; and for every rounded window when the setting goes off. **Not** through
     `prePaintWindow` or `isActive`: the effect is inactive, and its paint hooks not called, once
     no window is framed (`effecthandler.cpp:426-434`, `Hold::isActive`), so the last tiled window
     going fullscreen would keep its corners; and keeping the effect active for it would stop a
     fullscreen game or video scanning out directly (`hold.cpp:509`, review R1-3).
   - **Floated**: nothing to do. The decoration comes back, `setDecoration` gives it Breeze's
     radius (probed), and the window leaves the set. kwini3hold never writes the radius of a
     decorated window.
   - **The set** of windows kwini3hold rounded, keyed by `internalId` (closed windows linger as
     deleted ones), so it resets only its own. A window leaves it when it is decorated, reset, or
     closed.
   - **Unload**: the destructor resets every window in the set still alive and undecorated (the
     plugin-unload-lifetime trap: `isDeleted()` checked).
   - **`frameOnFloating`** windows (floating, decoration taken by kwin-i3): not rounded, their
     frame square, as now. Floating is Plasma's mode; this option is i3's look for it.
3. **The frame follows the curve.** `paintFrame` draws the ring with KWin's `ShaderTrait::Border`
   (`base.frag:74`, what Breeze's outline is drawn with): inner edge the window's rect with radius
   r, outer edge `frameWidth` beyond with radius r + `frameWidth`, antialiased. From the review:
   - **One quad** over the outer rect (window rect plus the frame width), clipped to
     `deviceRegion`, in place of `ring()`'s four bars: the wedge between the rect's corner and the
     arc is *inside* the window rect, where no bar reaches. The shader gives the interior zero
     coverage. `repaintRing` (on an activation change, `hold.cpp:60-68`) damages the r x r corner
     squares too, or the wedge keeps the old colour.
   - **Coordinates**: `position0` is the vertex position (`base.vert`), and the vertices are in
     global device pixels (the output's origin included), so `box` is too: centre and half size
     of the window's drawn rect, its edges rounded as `ring()` rounds them now; not made
     output-relative.
   - **Shader**: traits `Border | TransformColorspace`, not `UniformColor` (both declare
     `geometryColor`, `base.frag:22,34`). Uniforms `Box`, `CornerRadius` (vec4, all four `r`),
     `Thickness` (int, `round(frameWidth x scale)`), `Color`. The shader multiplies the colour by
     coverage on all four channels (`base.frag:79`), so the colour is premultiplied by the
     window's opacity and drawn with blending **always on**, `GL_ONE, GL_ONE_MINUS_SRC_ALPHA`
     (today's path blends only below full opacity, `hold.cpp:656`).
   - The radius is the one KWin clips the window to (`borderRadius()`, scaled and rounded as KWin
     does), so the frame can't disagree with the window, and a floating frame (radius 0) stays
     square. At radius 0 the frame is today's plain bars, unchanged: the border shader would
     round the outer corner by the frame width even then (outer radius = radius + thickness),
     seen in the first test run as an antialiased corner on every square frame.
   - During a hold or a slide (paint data scaled) the arc is not scaled with the snapshot: a few
     pixels' mismatch, for the hold's ~100 ms only. Accepted.
4. **Settings page**, Frame section (disabled without the plugins, as the rest of it):
   `[x] Round the corners of tiled windows`. Accessible name as the label. No radius control.

## What it looks like, and accepted

- Where four tiles meet, and at the screen's corners, small wedges of wallpaper show between the
  rounded frames: every tile is rounded, at the screen edge too. With gaps 0 the wedges are about
  5x5 px. Normal for rounded tiles; not designed around.
- Without the plugins: as now, tiled windows keep their title bars (no frame) and so their
  theme's corners. (Earlier drafts said "square": wrong, found by test 78.) The page says the frame needs the
  plugins already; this option sits under it.
- **Paul's desktop goes rounded at deploy** (he runs the defaults, 2026-10-24).
- A client that speaks neither decoration protocol (possibly libadwaita): its own corners and
  shadow inside the tile, as now, *and* KWin's clip on top. Unverified either way; the test
  below covers the GTK 4 test client.

## Tests

New `tests/live/78-rounded-corners.sh` (`# needs: plugin`), pixels with `tools/shot.py`:

- Two tiled solid-colour windows: each corner pixel just inside the frame is not the app's
  colour (clipped); the pixel 6 px in along the diagonal is; the middle of each side is.
- The frame follows: at a's top-left, the pixel on the arc (about 2,2 at scale 1) is frame
  colour, blended; the square corner pixel (0,0) is not frame colour. Active and inactive colours
  as in 57.
- Floating Toggle: the floated window's corners are Breeze's (title bar top corners, the
  bottom ones as in the probe); tiled again: rounded again.
- Focus moves: the wedge pixel on the arc changes from active to inactive colour (the repaint).
- Fullscreen of the **only** window on the screen: square corners, no frame. Back: rounded.
- `roundedCorners=false` (`--notify`, reconfigure): square content corners and square ring, as
  today, while a floated Breeze window keeps its rounded corners; true again: rounded.
- `frameWidth=3`: the outer arc, and two neighbours' frames meeting with no gap or overlap
  (54:104 does this for square frames).
- `frameOnFloating`: a floated window's frame square, its corners square.
- The GTK 4 test client tiled: rounded likewise (a client with its own decoration handling).
- An X11 window (Xwayland, beside 59): rounded.
- Mid-hold (a slow client, as in 57): the held snapshot's corners rounded (the snapshot is drawn
  through the item renderer, so it is clipped; untested until this).
- The effect unloaded: kwin-i3 gives tiled windows their decoration back, whose radius
  replaces ours, so the reset at unload can't be seen on screen (it is there for a window left
  undecorated); 78 checks the unload and load go cleanly and rounding comes back.

Existing: 54-frame's outer-corner check (`pixel_is 0 0`, `54-frame.sh:52`) assumes a square
ring; it sets `roundedCorners=false`, as does any other scenario that reads corner pixels (58, 59,
62 to check), so they keep testing what they test. The fuzzer is geometry-based (I4 counts tiled
windows' rects, not pixels): unaffected.

Fault battery (2026-10-25, a worktree, each fault in `plugin/hold.cpp` against 78; `mutate.py`
knows only `src/`): **red** for the signals not setting the radius (fullscreen), the frame drawn
square, the four bars kept (no wedge), the radius never reset (setting off), the reset applied
to decorated windows (floating Breeze corners), `frameOnFloating` frames rounded. **Green**, two:
the `prePaintWindow` backstop removed (it never acted: taken out, above); and `repaintRing`'s
reach into the corners removed: the corner recoloured on a focus change anyway, with Alacritty
and the GTK 4 test client (checked at the arc's deepest pixel), so something else repaints the
whole window on activation (the clients, or KWin; not settled). **Kept, not shown by a test**:
four small rects, for an app that doesn't redraw on focus.

Not tested: scale other than 1. The test KWin's outputs are scale 1, and adding a scale is OPEN.md
item 5's harness work (`KI3_OUTPUTS`, a scale per output). The device-pixel arithmetic is the same
`ring()` uses, which is tested at 1 only too. For Paul's look on his desktop (scale 1 on both).

## Files

`plugin/hold.cpp`, `plugin/hold.h`, `src/settings.js`, `package/contents/config/main.xml`,
`kcm/ui/main.qml` and the kcm's kcfg, `tests/live/78-rounded-corners.sh`, `tests/live/54-frame.sh`;
`docs/records/spec-settings-cleanup.md`'s page listing; the README pass gets the option in its settings
list (OPEN.md item 4).
