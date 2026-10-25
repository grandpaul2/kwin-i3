# Spec: rounded corners on tiled windows

Draft, 2026-10-25, for Paul's go. Paul asked for a toggle that rounds tiled windows' corners, the
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
   unchanged). Radius: 5 logical px, as Breeze, `snapToPixelGrid(5, scale)` per output; not a
   setting.
2. **The radius, set by kwini3hold.** For a window that is `framed()` (in a kwin-i3 tile, no
   server decoration, not fullscreen or minimized) and `roundedCorners` on: `setBorderRadius(r)`.
   For one it rounded that stops being framed (floated, fullscreen, the setting off, the effect
   unloaded): `setBorderRadius(BorderRadius())` if it has no decoration; a decorated one already
   has Breeze's from `setDecoration`, and kwin-i3 never touches it. Kept in a set of windows
   kwini3hold rounded, so it resets only its own.
   - **When**: in `prePaintWindow`, compare and set (the probe's place). `framed()` is already
     evaluated there each paint; every transition (a decoration change resetting the radius to
     zero, a float, fullscreen) is followed by a paint before it is seen. Cost: one comparison per
     window per frame. The alternative, `decorationChanged`/`borderRadiusChanged`/tile signals
     per window, is more code for the same effect. For review: writing window state from a paint
     pass (it emits `borderRadiusChanged`, which only updates the window's item; the probe showed
     no loop).
   - **Unload**: the destructor resets every window in the set (the plugin-unload-lifetime trap:
     only windows still alive, `isDeleted()` checked).
3. **The frame follows the curve.** `paintFrame` draws the ring with KWin's `ShaderTrait::Border`
   (`base.frag:74`, what Breeze's outline is drawn with): inner edge the window's rect with radius
   r, outer edge `frameWidth` beyond with radius r + `frameWidth`, antialiased, premultiplied
   (blend `GL_ONE, GL_ONE_MINUS_SRC_ALPHA`). Uniforms in device pixels: `box` = the window's
   drawn rect (centre, half size, after the paint data's translate/scale, rounded as `ring()`
   rounds the inner edge now), `cornerRadius`, `thickness` = `round(frameWidth x scale)`, the
   colour with the window's opacity. The quads stay what they are now: `ring()`'s four bars
   clipped to `deviceRegion` (the shader decides coverage per pixel, the bars bound it).
   With `roundedCorners` off, today's square ring, unchanged (same code path, radius 0, or the
   current uniform-colour path kept as is: the build decides which is less risk to the pixel
   tests).
4. **Settings page**, Frame section (disabled without the plugins, as the rest of it):
   `[x] Round the corners of tiled windows`. Accessible name as the label. No radius control.

## What it looks like, and accepted

- Where four tiles meet, and at the screen's corners, small wedges of wallpaper show between the
  rounded frames: every tile is rounded, at the screen edge too. With gaps 0 the wedges are about
  5x5 px. Normal for rounded tiles; not designed around.
- Without the plugins: square, as now (no frame either). The page says the frame needs the
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
- Fullscreen: square corners, no frame (as now). Back: rounded.
- `roundedCorners=false` (`--notify`, reconfigure): square content corners and square ring, as
  today; true again: rounded.
- The GTK 4 test client tiled: rounded likewise (a client with its own decoration handling).
- The effect unloaded with a window rounded: square after (radius reset, no frame).

Existing: 54-frame's outer-corner check (`pixel_is 0 0`) assumes a square ring; it sets
`roundedCorners=false`, as do any other scenario whose corner pixels fail, so they keep testing
what they test. The fuzzer is geometry-based (I4 counts tiled windows' rects, not pixels):
unaffected.

Faults for `make mutate-live` (from a worktree): the radius not set again after a decoration
change; the frame drawn square with rounding on; the radius not reset on float; not reset at
unload. Each should turn 78 red.

Not tested: scale other than 1. The test KWin's outputs are scale 1, and adding a scale is OPEN.md
item 5's harness work (`KI3_OUTPUTS`, a scale per output). The device-pixel arithmetic is the same
`ring()` uses, which is tested at 1 only too. For Paul's look on his desktop (scale 1 on both).

## Files

`plugin/hold.cpp`, `plugin/hold.h`, `src/settings.js`, `package/contents/config/main.xml`,
`kcm/ui/main.qml` and the kcm's kcfg, `tests/live/78-rounded-corners.sh`, `tests/live/54-frame.sh`;
`docs/spec-settings-cleanup.md`'s page listing; the README pass gets the option in its settings
list (OPEN.md item 4).
