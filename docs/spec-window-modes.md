# Spec: window modes, Plasma's or i3's, per window (OPEN.md item 10)

**Words superseded** (2026-10-27): a "Plasma window" is now a **floating** window, and the
ignore list's windows **place themselves** (`docs/spec-window-words.md`).

From Paul, 2026-10-24: "what we call a floating window [should] feel more like a [Plasma] window
... Full headers on the windows that they can click to drag around ... Then they tap
Shift+Meta+Space and the full i3 experience takes over. Headers gone, outlines on." And: "Rather
than using a float all or tile all option just set a workspace to automatically set it ... we let
Plasma just be a DE on those windows. This would be a defining feature, so it would need to be
implemented cleanly." Status: **decided by Paul, 2026-10-24 ("this is good": the
recommendations below, 1-7), with one standing rule: while this is built, Paul's desktop runs the
defaults a new user gets ("keep making my desktop look like what the default experience will look
like ... We can add my customizations back later"): `frameOnFloating` stays off there, and his
green floating frame comes back later by choice. Reviewed (review 1, folded in below); Paul's
answers on it, 2026-10-24: decision 5 (c), decision 8 Xwayland first-class ("we need to give
xwayland good treatment. That's going to be common"). Next: piece (i)+(ii) (decision 7).** Nothing built on main; the route and its prototype are green
(branch `proto-effect-frame`).

Sources: KWin 6.7.5 (`tiles/tile.cpp` `Tile::windowGeometry`, `window.cpp` `requestTile`,
`setNoBorder`, `pointerEnterEvent`, `xdgshellwindow.cpp` `configureDecoration`,
`sendRoleConfigure`, `moveResizeInternal`, `initialDecorationPolicy`), `src/kwin.js`,
`src/rules.js`, `src/settings.js`, `plugin/hold.cpp`, `plugin/frame.cpp`, `plugin/framefocus.cpp`,
`docs/spec-decoration.md`, `docs/spec-reload-keepabove.md`, the probes and prototype of
2026-10-24 (`OPEN.md` item 10).

## The idea

Every managed window is in one of two modes:

- **i3's (tiled):** in the tree, no title bar, i3's 1 px frame around it, blue when active.
- **Plasma's (floating):** an ordinary Plasma window: the user's own decoration (Breeze or any
  theme: title bar, buttons, rounded corners, shadow), moved by its title bar, focus shown by the
  theme. No kwin-i3 frame unless the user asks for it (decision 3).

Meta+Shift+Space moves the focused window between them, as i3's `floating toggle` does today. A
workspace can be set to open new windows in Plasma's mode: on that workspace Plasma is the DE,
in place of i3's stacked and tabbed layouts (out of scope, `docs/plan.md`). Everything else,
Plasma already does.

## Why it looks like this (decided, with the evidence)

1. **KWin has one decoration for every window** (`kwinrc [org.kde.kdecoration2] library=`), so
   the user's theme on Plasma windows and i3's frame on tiled ones can't both be decorations.
   The tiled windows give up theirs: kwin-i3 sets `w.noBorder` (the window menu's "No titlebar
   and frame", `Window::setNoBorder` -> decoration policy None). Probed: per window, tiled or
   floating, and it holds through a script reload.
2. **The frame is drawn by the effect, outside the window** (Paul, 2026-10-24: "we can't cover
   the app"). The tiles leave it room: every tile's padding is the inner gap plus twice the
   frame width, so KWin leaves the frame width on each side of a window between tiles (half the
   padding). At a screen edge KWin gives the *full* padding (`Tile::windowGeometry`: a side at
   relative 0 or 1), which would be twice the frame; the root tile is inset by a hair (10^-6 of
   the area, 0.003 px on 2560) so no side is exactly at the edge, and every side gets half.
   Measured: 1 px all round, 2 px between two windows (1 each), as in i3. With an outer gap the
   root is inset anyway (today's gaps), and the hair isn't needed.
3. **The effect is `kwini3hold`**, because only it knows where a window is drawn during a held
   layout change (its snapshot at the old frame); the frame goes around wherever the window is
   drawn (its frame moved and scaled by the paint data), so it stays with the held layout and
   follows a sliding desktop. `kwini3frame`, the decoration, is retired (decision 6).
4. **The border goes before the window joins its tile.** KWin sizes a window for the decoration
   it has; the decoration leaves only once the client answers, so the tile's first request still
   counted the title bar. kwin-i3 sets `noBorder` first and refits the window when its frame
   next changes (the existing `armed` refit, with its own marker).
5. **Plain GTK 4 gets its bounds again.** KWin tells a client its largest size
   (`xdg_toplevel.configure_bounds`) only in a configure with no size, in practice its first,
   sized for the title bar it had then, and GTK 4 keeps within them: a tiled plain GTK 4 window
   stayed 28 px short. kwin-i3 works those bounds out when it takes the border (the placement
   area less the border); a tiled window short of its tile at its first frame change after
   that, or later with its frame at the bounds, is asked for a 0x0 frame (KWin resends the
   bounds; GTK keeps its size), then for its tile 5 ms later (a configure of its own: KWin
   builds a configure from whatever is pending when its timer fires). The later look because a
   first tile inside the bounds (a vertical split's half) fits, and the whole monitor later
   stayed 26 px short (OPEN.md item 32, test 83). Qt, GTK 3,
   Alacritty and libadwaita apps come out right at once and never take this path. No upstream
   change (Paul, 2026-10-24).
6. **Hovering a frame doesn't steal focus for the desktop**: KWin's focus follows mouse ignores
   the desktop and docks (`Window::pointerEnterEvent`), so crossing the 2 px between two windows
   goes straight to the next one. A click there would land on the desktop: `kwini3helper` takes
   presses on a tiled window's frame and activates that window, as it does on today's
   decoration (`framefocus.cpp`, reworked from "the decoration under the pointer" to "a tiled
   window's frame ring under the pointer").

## The rules (to build)

**R1. A window's mode.** At adoption, in order:
1. the ignore rules (`ignoreClass`, `ignoreRole`): unmanaged, as today;
2. the floating rules (transient, modal, fixed size, dialog/splash/utility, `floatingClass`,
   `floatingTitle`): Plasma's, as today;
3. the workspace it opens on: Plasma's if that workspace is listed in `floatingWorkspaces`
   (decision 2), else i3's.

Meta+Shift+Space flips it. The rules re-check on a caption or class change as today
(`reclassify`).

**R2. The look follows the mode.** Tiled: `noBorder` on (before the tile asks: "why" 4), frame
drawn. Plasma's: `noBorder` off (the user's decoration), no frame (unless decision 3).
kwin-i3 records which windows it took the border from (as `keptAbove` for the flag) and gives it
back on un-tiling, on release, and when a window stops being managed. A border the user removed
by hand on a floating window is left alone.

**R3. Moving between workspaces keeps the mode**, as i3 keeps floating across `move to
workspace`. A workspace's setting only decides for windows that open there (decision 4).

**R4. Release, disable, reload.** Release (and the script's unload) gives every border back and
the root its whole area. A reload re-adopts: a window with no border and no tile is ... (decision
5: the durable marker of a hand-floated window).

**R5. No plugins (or the effect not loaded).** No frame can be drawn, so tiled windows keep their
decoration and the tiles no frame padding: exactly today's script-only install. kwin-i3 asks the
effect over D-Bus at load and on every reconfigure (`/kwini3hold net.local.kwini3hold Stats`,
already there) and switches when it appears or goes.

**R6. Fullscreen**: no frame (the effect skips fullscreen windows), the border untouched, as today.

**R7. The effect, properly** (the prototype's shortcuts replaced):
- active only while a framed window is on a shown desktop, not always;
- it repaints the frame rings that change (old and new frame, activation, a tile change, a
  decoration change), not the whole screen;
- frame colours and width from today's keys (`frameActive`, `frameInactive`, `frameWidth`,
  decision 3 for the floating ones), rounded to whole device pixels at any scale.

**R8. The hair.** `rootRect` gives a hair inset when the outer inset is 0, and `sameRect`
compares exactly enough to see it (the prototype cut its tolerance to 10^-9; the spec's version
compares the hair separately so float noise elsewhere keeps the old tolerance).

## Decisions for Paul

1. **The workspace setting's name and form.** Proposed: `floatingWorkspaces`, a list of
   workspace numbers ("3, 7"), on the settings page as a row of checkboxes 1..10 labelled
   "Open new windows as Plasma windows". Alternatives: a per-workspace choice in the same row as
   `workspaceOutputs` ("1=DP-4"), or a name other than "floating" (the page could say "Plasma
   windows" while the key says floating). Recommendation: the list, and "Plasma windows" on the
   page; i3's word stays in the key and the code.
2. **What i3's focus keys do on a Plasma-mode workspace.** i3's `focus mode_toggle` (Meta+Space)
   moves between tiled and floating; Meta+J/K/L/; move among tiled windows only. On a workspace
   of Plasma windows those keys do almost nothing; Alt+Tab and the mouse do it, as in Plasma.
   Recommendation: leave i3's keys as i3 has them; nothing new.
3. **A frame on Plasma windows**, as Paul asked ("could be a tick box to turn outlines on i3
   like"): `frameOnFloating`, off by default. On: Plasma windows lose their decoration too and
   get the frame in the floating colours (`frameFloatingActive`, `frameFloatingInactive`, today's
   green), moved with Meta+drag as in i3. Recommendation: build it; it is today's look for
   floating windows, so Paul's desktop can keep it.
4. **A window opened elsewhere and moved onto a Plasma workspace** keeps its mode (R3), as in
   i3. Alternative: take the workspace's mode on arrival. Recommendation: keep it (the setting is
   about where windows open, not a property of the place).
5. **The durable "floating" marker.** Today a floating window is kept above, which is also how a
   reload knows a hand-floated window (`docs/spec-reload-keepabove.md`). On a Plasma-mode
   workspace every window would be kept above, which a Plasma user sees: the window menu's "Keep
   above others" ticked, and no way to put one Plasma window under a tiled one. Options:
   (a) keep it: i3's layering (floating above tiled), and the marker stays;
   (b) Plasma windows not kept above; the marker becomes "managed, no tile, has its decoration"
   (with the plugins: a tiled window never has one), and without the plugins the flag as today.
   Recommendation: (b) on Plasma-mode workspaces only, (a) elsewhere: on an i3 workspace a
   floating window should still float above. Needs a look at what i3's stacking means when the
   whole workspace floats.
6. **Retiring `kwini3frame`.** `make plugin-install` stops installing it and selects Plasma's
   default decoration again (Breeze; nothing recorded what was before), `tools/frame-guard.sh`
   and its drop-in line go, the README's plugin table loses a row (two plugins). Paul's desktop
   goes from the frame decoration to Breeze on floating windows at the switch (all windows are
   re-decorated once). Recommendation: yes, in the same change.
7. **Order of work.** The whole thing is one feature but four pieces: (i) the frame in the
   effect with tiled windows borderless (R2, R4-R8; the look changes, nothing else);
   (ii) the GTK 4 bounds ("why" 5); (iii) `floatingWorkspaces` (R1, R3, decisions 1, 4);
   (iv) `frameOnFloating` and the marker (decisions 3, 5). (i)+(ii) first, then (iii)+(iv).

## Review 1 (2026-10-24), folded in

`review-window-modes-2026-10-24.md` (git history: `git show 3d98bd2:docs/review-window-modes-2026-10-24.md`), 17 findings. "R1-n" is finding n. Each is either a rule
for the build below, or a decision for Paul (marked).

- **R1-1 clipping.** The ring is drawn inside the paint's device region (scissor on the region's
  rects), never outside it: a floating window above a ring is never painted over.
- **R1-2 repaints.** The frame sets `setTransformed()` per framed window only; the screen mask
  and `postPaintScreen`'s repaint loop stay for held layouts only. Damage is the ring's rects
  (old and new) on a frame, activation, tile or decoration change. `Stats` gets an idle-frame
  counter, and a test that nothing repaints while nothing changes.
- **R1-3 scanout.** `blocksDirectScanout()` returns true only during a hold
  (`m_open || !m_hidden.isEmpty()`): a fullscreen game or video still scans out.
- **R1-4 the border is not only ours.** kwin-i3 reads `noBorder` back after setting it and records
  it only if it took (a forcing window rule wins, and that window is then treated as the rule
  says: a forced border keeps its title bar and gets no frame padding; a forced no-border on a
  Plasma window is left alone). Tiled windows have it re-asserted on each pass (the window menu's
  toggle, `borderlessMaximizedWindows`). A window adopted at load with `noBorder` set and no
  record (session restore) gets its border back if its mode is Plasma's. Writing the border never
  goes through a "remember" rule (checked in the test with such a rule).
- **R1-5 client-side decorations.** A CSD window (`DecorationMode::Client`) is framed when tiled
  (no server decoration to remove; the ring goes outside its window geometry) and never framed
  when floating, `frameOnFloating` or not: its own header and shadow are its Plasma look. Tests:
  zenity (libadwaita) tiled and floating, with the pixels around it. **Marker: decision 5 changes
  (below).**
- **R1-6 fractional scale.** Each ring edge runs from the window's pixel-snapped edge out to the
  neighbour's snapped edge (or the output's), so the gap is filled whatever the rounding. Tests
  at 1.25 and 1.5: no wallpaper pixel in any gap.
- **R1-7 the hair on nested layouts.** After every root change, every leaf's edges are checked
  and a lost hair is put back (or the tree rebuilt, as `edgesIntact` does for gaps). Test:
  `H[V[a b] c]`, a root change, pixels at all four edges.
- **R1-8 padding always > 0** changes KWin's anchors for every install: the gaps-only guards
  now apply at the defaults. Test Meta+right-drag on an outer edge at the defaults.
- **R1-9 the effect going away.** The effect announces itself: on load and on unload it asks KWin
  for a reconfigure (a script can't expose a D-Bus method), and kwin-i3 asks the effect's `Stats`
  at load and on every reconfigure; no answer within a second is "no frame". Between an unload and the next pass, tiled windows
  are borderless and frameless for at most one event. The frame is independent of `holdEnabled`.
  Test: unload the effect mid-session; title bars come back.
- **R1-10 `borderGone`** (the bounds) is cleared once the bounds are asked again, or when the
  window floats or goes (until 2026-10-26: after one settle check, which missed item 32); never
  for Xwayland
  (X11 has no bounds; a 0x0 request would be a real tiny resize). A refused `manage()` gives the
  border back at once.
- **R1-11 bounds elsewhere.** The same request is made when a tiled plain-GTK-4 window lands
  short after a move to another monitor or an area change (panel, resolution). Test: a move to a
  bigger output.
- **R1-12 the click strip.** `kwini3helper` takes a press (and its release, and a scroll) on a
  tiled window's ring where the pointer hovers nothing or the desktop: activate that window,
  consume the event. A floating window over a ring keeps its clicks. Tests: left, right, middle
  and scroll on the strip; a strip beside the panel.
- **R1-13 "why" 4 corrected**: KWin drops the next decoration at once for policy None, so the
  first tile configure is already undecorated; what the prototype saw short was GTK's bounds
  (R1-11's cause), and the refit covers both. `frameMin()` is read after the border goes.
- **R1-14 the plan.** `docs/plan.md` gets: floating above tiled except on Plasma-mode
  workspaces (decision 5); Plasma mode as part of the WM/DE seam (it decides who arranges a
  window, which only kwin-i3 can); Xwayland clients **(decision 8)**.
- **R1-16 effect chain.** The ring is drawn after `effects->paintWindow` returns, so it reads the
  paint data as every effect in the chain left it (slide's translation included); Hold asks for
  no chain position. (Test still to come: a desktop switch with slide on.)
  Overview and window view draw thumbnails: no ring there. Whole-screen captures include it.
- **R1-17 tests**: all of the above, plus a second output with an offset, Qt, Electron, Xwayland,
  a desktop switch, a replug and an unload for stale rings; colour tolerance 2, not 8.

**Decision 5, revised (for Paul).** The marker can't be "has its decoration" (CSD windows always
do). Options: (a) the kept-above flag everywhere, as today (visible to a Plasma user as "Keep
above others"); (c) the effect keeps the set of floating windows (it outlives a script reload)
and kwin-i3 asks it at load; without the effect, the flag as today. Recommendation: (c), and
Plasma windows on Plasma-mode workspaces not kept above. **Paul: (c).**

**Decision 8: Xwayland apps are first-class** (Paul: "we need to give xwayland good treatment.
That's going to be common": games, Steam, older apps). Every rule above holds for them, and the
test plan covers them as it covers Wayland ones: an X11 client (the GTK test client under
`GDK_BACKEND=x11` in a test KWin with `KI3_XWAYLAND=1`, and xterm-like size increments) tiled,
framed, borderless and back, floating with its decoration, fullscreen, through a reload and a
release, the click strip, and the pixel rows. Only the bounds request is skipped (X11 has none),
and its own X11 cases are specced as found: size increments (a terminal that snaps short of its
tile), Motif no-decoration hints, override-redirect windows (never managed, as now).

## Tests

Each watched red first (`make mutate` from a worktree for the plugin and script faults).

- **`tests/live/57-effect-frame.sh`** (from the prototype's `99-effect-frame.sh`, needs: plugin,
  timing: alone): the 1 px frame at every screen edge and 2 px between windows; the app's edge
  pixels untouched; no title bar on tiled windows; colours follow focus; no stale frame where a
  window was; a floating window has its title bar and no frame; frames stay with a held layout
  and move with the new one; a plain GTK 4 window fills its tile (the bounds). Alacritty in solid
  colours for the pixel rows (GTK's own rendering is not exact at its edges).
- gaps: `26-gaps.sh` with the frame (inner and outer gaps, the frame inside the gap).
- fullscreen: no frame, border untouched (`32-fullscreen-open.sh`, `46-replug-fullscreen.sh`).
- no plugins: tiled windows keep their decoration and no padding (a scenario without `needs:
  plugin`); the effect loaded later switches it on.
- release and reload: every border back after release; through a reload, tiled stays tiled and
  hand-floated stays floating (decision 5).
- `floatingWorkspaces`: a window opened there is a Plasma window; moved elsewhere it stays one;
  Meta+Shift+Space flips it; the setting applies on Apply.
- frame clicks: a press on the 1 px between two windows activates the window whose frame it is
  (`55-helper.sh`).
- monitors: unplug and replug with framed windows (`40`-`48`), a monitor at scale 1.25 (the hair
  and the device-pixel rounding).
- the fuzzer: one campaign after (i), with a pixel invariant for the frame ring (`docs/fuzz-design.md`).

**Built 2026-10-24 (pieces i and ii, branch `window-modes`), and the tests watched red** with six
deliberate faults: no hair (57, 58 red), release keeping borders (58, 59), the X11 check broken
(59, at "never the bounds request"), a fixed-width ring at 125 % (58, "no background anywhere"),
a click on the frame not activating (54). Two first went green and the tests were fixed: the 125 %
check scanned one row (a gap is 2 or 3 device px by phase; now the whole screen, five windows),
and the click check moved the pointer, so hover activated first (now parked, then clicked). **Not
testable here: the ring's clip (R1-1).** A KWin screenshot renders a fresh full frame in stacking
order, so a window above a ring is always painted over it again; the corruption only shows on a
real output's later partial repaints. Checked by reading `Hold::paintFrame` (the ring is cut to
the paint's device region), not by `make test`.

**Pieces (iii)+(iv) built 2026-10-24 (branch `window-modes-2`)**, reviewed
(`review-window-modes-2-2026-10-24.md` (git history: `git show 3d98bd2:docs/review-window-modes-2-2026-10-24.md`): two must-fix, both fixed with tests). Known limits,
documented rather than fixed: a monitor change inside the 250 ms before the rest of the windows
are adopted at load can hand out a workspace whose windows aren't adopted yet; a window left kept
above by an earlier load without the effect stays kept above on a Plasma workspace (kwin-i3 can't
tell it from the user's own flag), and a user's own keep-above is cleared when kwin-i3 floats a
window and then moves or un-floats it; a window classified late (a class or caption set after it
appears) opens tiled on a Plasma workspace; release leaves the effect's marks, so a later load
floats those windows again (intended).

A second agent reviews this spec before building (CLAUDE.md: substantial new tests and a slow
scenario), and the change before it goes live.
