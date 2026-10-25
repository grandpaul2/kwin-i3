# Review: docs/spec-window-modes.md (2026-10-24)

A second agent's review of the spec as decided on 2026-10-24, read cold against KWin 6.7.5's
source, the code, and the prototype branch `proto-effect-frame`. Read-only; nothing was run.
Findings as reported (lightly formatted); how each is handled is in the spec ("R1-n").

## Must-fix before building

1. **The ring is drawn unclipped; partial repaint (R7) will corrupt floating windows.**
   `Hold::paintFrame` ends in `vbo->render(GL_TRIANGLES)` and ignores the `deviceRegion` passed
   to `paintWindow`; KWin clips only inside `renderItem` (scissor on at
   `scene/itemrenderer_opengl.cpp:352-358, 415-425`, off at `:558`). The prototype hides it:
   `isActive()` is always true and `prePaintScreen` sets `PAINT_SCREEN_WITH_TRANSFORMED_WINDOWS`,
   which makes `WorkspaceScene::collectDamage` return the whole output every frame. Failure: a
   floating window over a tiled window's ring; the tiled window repaints; the ring paints over
   the floating window outside the damage, and the stripe stays. Fix: draw within the region
   (scissor, or `vbo->draw(region, ...)`); test a floating window over a ring while the tiled one
   animates.
2. **R7 contradicts the prototype's repaint loop.** `Hold::postPaintScreen` calls
   `addRepaintFull()` whenever `isActive()`; with R7's "active while a framed window is shown",
   that is a full repaint every frame for ever, and the screen mask forces full damage too. Fix:
   per-window `setTransformed()` only (honoured in `paintSimpleScreen`); the screen mask and the
   repaint loop for held layouts only. Test: an idle-frame counter in `Stats`.
3. **Direct scanout.** `EffectsHandler::blocksDirectScanout()` is true if any active effect says
   so, and `Effect::blocksDirectScanout()` defaults to true (`effect/effect.cpp:535`): an always
   active Hold stops fullscreen games and video from scanning out. Fix: override it to
   `m_open || !m_hidden.isEmpty()`.
4. **The border can be changed by others.** A "force" window rule wins over `w.noBorder`
   (`setDecorationPolicy` -> `rules()->checkDecorationPolicy`, `xdgshellwindow.cpp:751-761`);
   session restore brings a kwin-i3-made `noBorder` back at the next login with no marker
   (`:496`, `initialDecorationPolicy` `:1401`); `borderlessMaximizedWindows` sets the border from
   the maximize mode on every maximize change (`:1813`, and `requestTile` un-maximizes,
   `window.cpp:3765`); the window menu's toggle; and `updateWindowRules(Rules::NoBorder)` (`:759`)
   can write kwin-i3's state into a "remember" rule. Fix: read `noBorder` back after setting it,
   record it only if it changed, re-assert for tiled windows on reconcile (or watch
   `decorationPolicyChanged`), and a rule for a restored `noBorder` on adoption.
5. **Client-side decorations are not addressed.** A window with neither xdg-decoration nor KDE's
   server-decoration protocol is `DecorationMode::Client` (`xdgshellwindow.cpp:1560-1595`):
   `noBorder` does nothing; it keeps its own header, shadow and corners. Tiled: the ring should
   work (`hasDecoration()` false), but whether GTK/libadwaita drop shadows and corners in KWin's
   tiled states is unverified. Floating with `frameOnFloating`: a ring around a rounded,
   shadowed window. Decision 5(b)'s marker ("no tile and has its decoration") is false for every
   CSD window: a reload would re-tile a hand-floated Firefox or libadwaita app. Fix: a CSD
   policy, and another marker (keep the flag, or let the effect, which outlives a script reload,
   hold the floating set and answer over D-Bus).
6. **Fractional scale: the ring can't fill the padding.** The padding is logical (2f + inner),
   the ring `round(f*s)` device px at independently rounded edges: at 1.25 the gap between two
   windows is 2.5 device px (2 or 3 by phase; a 3 px gap shows a sliver), at 1.5 `fd` = 2 against
   3. Fix: each ring edge from the window's snapped edge out to the neighbour's snapped edge (or
   the output's). Test 1.25 and 1.5 with "no wallpaper pixel in any gap".
7. **The hair breaks on nested layouts after a root change.** Verified for a flat layout
   (`tiles/tile.cpp:171-182`), but `CustomTile::setRelativeGeometry` (`tiles/customtile.cpp:83-86,
   100, 117, 132`) pins a changed edge with no tile beyond it to exactly 0 or 1, and only each
   level's first child is re-fixed on a root change (`:144-155`): nested tiles at the left edge
   of the first column can lose the hair and get a 2f edge. Test: `H[V[a b] c]` and a root
   change, pixels at all four edges.

## Should-fix

8. **Zero-gap installs now take the "padding > 0" path**: `Tile::anchors()` (`tile.cpp:191-194`)
   returns no edges when padding > 0, which the frame makes always true; the gaps-only
   interactive-resize guard (`kwin.js` ~270) now applies to everyone. Test Meta+right-drag on an
   outer edge at the defaults.
9. **R5 has no way to learn the effect went away.** A script can't watch bus names or effect
   loads; unloading the effect (System Settings, Alt+Shift+F12, `supported()` false) triggers no
   reconfigure, leaving every tiled window borderless and frameless. Say how it's detected and
   what the windows look like meanwhile; test an unload. Also: `holdEnabled=false` calls
   `releaseAll()`; the frame must be independent of the hold setting.
10. **`borderGone` can go stale**: cleared only by a later refit with the window in its tile; if
    that never comes, a later divider move on a healthy window fires the 0x0 request. Clear it
    after one settle check; skip Xwayland (a 0x0 request there is a real tiny resize; X11 has no
    `configure_bounds`). The refusal path in `manageInto` leaves `noBorder` set (a title-bar
    flicker); restore it on refusal.
11. **GTK 4 bounds go stale elsewhere**: `configure_bounds` is the output's `PlacementArea` at
    the time (`xdgshellwindow.cpp:815-819`): a tiled GTK 4 window moved to a bigger output, or
    after a resolution or panel change, is capped at the old bounds. Scope it, or trigger the
    same request on those changes and test it.
12. **The click strip: a press falls through to the desktop.** Nothing owns the strip any more;
    `FrameFocus::pointerButton` returns false, safe over a decoration, but now the desktop gets
    the press: a right-click opens Plasma's desktop menu, a drag a rubber band. Consume the press
    and its release; hit-test only where `pointer()->hover()` is null or the desktop (a floating
    window over a ring keeps its click). Tests: right-click and scroll on the strip.
    Focus-follows-mouse ignoring the desktop is right (`window.cpp:2848`).
13. **"Why" 4 is under-evidenced.** `configureDecoration()` -> `clearDecoration()` nulls the next
    decoration at once for policy None (`xdgshellwindow.cpp:803-806, 1616-1622`), so a `noBorder`
    set in the same tick as `manage()` is already in the first tile configure. Cite the line
    that makes the title bar count, or correct the claim. `frameMin()` (`kwin.js` ~328) is taken
    while the decoration still exists, so the tile's minimum is inflated until the next pass.
14. **Decision 5 and the plan.** `docs/plan.md` says floating windows stay above tiled ones;
    5(b) breaks that on Plasma workspaces (the plan needs an edit). Plasma mode is an addition,
    not a replacement for stacked/tabbed (out of scope already); the plan's own test ("if Plasma
    already does it, kwin-i3 doesn't") needs an answer for `floatingWorkspaces` and
    `frameOnFloating`. The plan says X11 is out: say whether Xwayland clients are in (best
    effort) or out.

## Notes

15. **Checked and right**: tile padding (half between, full at edges) and the hair's 0.003 px;
    `configure_bounds` only on sizeless configures, from `PlacementArea`; focus follows mouse
    ignores desktop and docks; fullscreen forces no decoration and restores the policy after;
    `paintFrame`'s viewport coordinates (the projection is over `scaledRenderRect`, so a second
    output and rotation work; test a second output anyway); the paint order puts the ring under
    windows above it, once clipped.
16. **Effect chain position**: `Hold` sets no `requestedEffectChainPosition`, so the ring follows
    only transforms applied before it; slide and zoom are unchecked, and there is no slide test
    though the spec claims it. Overview and window view draw thumbnails (no ring; probably
    fine). Window screenshots and screencasts probably bypass `paintWindow`; whole-screen
    captures include the ring. State it.
17. **Test-plan gaps**: nested tree; fractional-scale gap pixels; second output with an offset;
    floating window over a repainting ring; idle-frame counter; scanout; right-click on the
    strip; effect unload; a session-restored `noBorder`; a force-no-border rule;
    `borderlessMaximizedWindows`; the window-menu toggle; a CSD client tiled and floating; Qt;
    Electron; Xwayland. Tolerance 8 and Alacritty only hide colour-space and CSD errors. "No
    stale frame" is tested only on close: add a desktop switch, a replug, an unload.
