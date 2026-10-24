# Spec: a fullscreen window stays in the tree

Drafted 2026-10-24 from Paul's capture of 2026-10-23 23:25. Status: **draft, nothing decided.
Not built, not reviewed, not live.** The numbered items under "Decisions" are Paul's to answer;
the rest is the proposal.

A first build of parts A and B ran on Paul's desktop for a few minutes on 2026-10-23 without his
approval and was reverted (commits a01e788, d23c445). Its diff is history to read, not a build to
reuse: anything from it goes through this spec and a review first.

Sources: KWin 6.7.5 `src/tiles/tile.cpp`, `src/xdgshellwindow.cpp`, `src/window.cpp`; i3 `stable`
`src/manage.c`; the capture's `state.txt`.

## The problem

Firefox was fullscreen on workspace 2 (left monitor). Paul opened a terminal there: nothing
visible. He left fullscreen: still nothing, and nothing from the launcher either. Three terminals
had in fact opened, tiled, and the active window was one of them. The capture's log:

```
23:25:19 ADD Alacritty tile ws 2
23:25:19 FLOAT World Series Game 1 Recap! ... Firefox: KWin refused to tile it
23:25:19 TREE 2 H[Alacritty*] ~World_Series_..._Firefox
```

Firefox had been turned into a floating window the size of the monitor, kept above (floating
windows are), so every tiled window behind it was invisible, and leaving fullscreen left it
floating. Dropping fullscreen later could not undo it.

## Cause

1. **KWin refuses to tile a fullscreen window.** `Tile::manage` (tile.cpp:377) starts with
   `if (!window->isResizable() ...) return false`, and `XdgToplevelWindow::isResizable`
   (xdgshellwindow.cpp:682) returns false whenever fullscreen is requested.
2. **A newcomer rebuilds the workspace's tiles.** `reconcileNow` (kwin.js) compares the wanted
   shape with KWin's; `H[Firefox]` became `H[Firefox Alacritty]`, so it unmanaged every window,
   rebuilt the tiles and managed each window into its tile. For Firefox, `manageInto` got the
   refusal and did what it does for every refusal: `floatWindow(w, "KWin refused to tile it")`.
3. That refusal path was written for a different case (fuzzer I9: a fullscreen window dragged to
   the other monitor), and `visibleLeaf` already leaves a fullscreen window *without* a tile out
   of the layout "until fullscreen ends". The hole is a fullscreen window *with* a tile that
   loses it in a rebuild.

A second door to the same hole, not seen in the capture but in the code: `Rules.classify`
(rules.js:32) says "float" for `!w.resizeable`, and `reclassify` runs on every caption change and
floats a tiled window the rules now call floating. A browser's caption changes when a video
ends. The capture of 17:43 shows the fullscreen Firefox with `rule=float` for exactly this
reason, still tiled only because its caption had not changed while fullscreen.

## What i3 does (manage.c:402-458)

- The fullscreen container stays where it is in the tree. A new window is inserted beside the
  focused container as usual; the layout underneath is unchanged.
- **The new window does not take focus** ("fs = %p, ws = %p, not focusing"): it is put second in
  the parent's focus stack, right after the fullscreen container, "so the new container will be
  focused after we return from fullscreen mode". The fullscreen window keeps covering the output.
- Exception (`popup_during_fullscreen smart`, the default): a floating transient *of the
  fullscreen window* (its own dialog) is focused and shown.

`docs/plan.md` already records this for Meta+F: "other windows on that workspace can't be focused
while it is fullscreen".

## Decisions

1. **The newcomer under a fullscreen window: i3's rule or KWin's?**
   KWin keeps a fullscreen window on the top layer only while it is active
   (`Window::isActiveFullScreen`, window.cpp:2280), so this one choice sets both focus and what
   is visible.
   - **(a) i3's rule, recommended:** the new window opens tiled behind the fullscreen window,
     without focus; it is next in the focus order, so leaving fullscreen shows it and focuses
     it. Consistent with the plan and with what Paul expected ("I thought it was because of the
     fullscreen so I dropped it to normal view"). Costs part C below: KWin activates a new
     window itself, so kwin-i3 must hand focus back.
   - **(b) KWin's:** the new window takes focus and appears on top of the fullscreen window,
     which keeps playing underneath at monitor size. No part C. A break from i3 to write down in
     the plan.
2. **A dialog of the fullscreen window** (Firefox's file picker): today it floats and KWin
   focuses it; with 1(a), part C must leave that alone (i3's `smart` default does the same).
   Proposed: unchanged. Confirm.
3. **The caption-change door (part B):** fix it in the same change, or leave it for a capture?
   Proposed: same change; it is the same symptom.

## The change

**A. `kwin.js`, `manageInto`:** a refused window that is fullscreen is not floated. It is left
out of the tiles (`expected` cleared; `refused` set so the reconcile runs one more pass, which
projects without it, as `visibleLeaf` already does for a fullscreen window without a tile), and a
log line says so (`FULLSCREEN <caption>: out of the tiles until it ends`). The model is untouched:
the window keeps its place in the tree. When fullscreen ends, `fullScreenChanged` schedules the
workspace and the existing join path manages it into its tile; the tree's order (`H[a b c]`)
decides where.

**B. `rules.js`, `classify`:** a fullscreen window is judged by its own size limits
(`minSize < maxSize` on either axis means resizable), not by KWin's `resizeable`, which is false
for every fullscreen window. A fixed-size window stays "float" whether fullscreen or not. The
pending-fullscreen case (requested, not yet applied: `resizeable` false and `fullScreen` false)
is unchanged, so `46-replug-fullscreen.sh`'s known limit is unchanged.

**C. Only with 1(a). `kwin.js`, `adoptWindow`:** when the window's workspace has a fullscreen
window and the newcomer is tiled (not a floating transient), re-activate the fullscreen window
after adopting; in `tree.js`, `open` puts the new leaf second in its parent's focus stack when
the workspace has a fullscreen container (i3's `TAILQ_INSERT_AFTER`), so `nextFocused` picks it
when fullscreen ends. How KWin reacts to `workspace.activeWindow = fs` right after it activated
the newcomer is to be checked in the test KWin before the design is final (focus-stealing
prevention does not apply to a script, but the newcomer's own activation may still be pending).

## What stays

- A tiled window that goes fullscreen with no other change keeps its tile (today's behaviour):
  KWin restores it to the tile's geometry when fullscreen ends, no reconcile needed.
- The I9 case: a fullscreen window dragged to the other monitor still joins when fullscreen ends.
- The known limit on a hidden workspace after a replug (plan, policies; test 46).
- Floating windows, dialogs, Meta+F itself, and the "a window that can't fit floats" rule.
- Nothing is done to a window already floating from the old behaviour (Paul's Firefox on
  workspace 2 tonight): Meta+Shift+Space tiles it again.

## Risks

- **Part A leaves the fullscreen window out of the tiles for the rest of its fullscreen time**,
  so its neighbours fill the monitor behind it. When fullscreen ends, KWin first restores the
  window's pre-fullscreen frame (`fullscreenGeometryRestore`), then kwin-i3's reconcile rebuilds
  the tiles with it: two geometry steps, which the atomic-layout effect should hold as one or two
  transactions. To be watched in `53-hold.sh` terms (no new flash) before going live.
- **Part B changes a classification**, so a window that was "float" by `!resizeable` while
  fullscreen becomes "tile" if its size limits allow. A window a KWin rule forces to a size
  (`rules()->checkSize`) is the odd case: resizable by its limits, not to KWin; it would be tiled
  in the model and refused by KWin, then floated by the refusal once fullscreen ends. No such
  rule is set on Paul's desktop; noted, not handled.
- **Part C re-activates a window from inside a window-added handler.** The order of KWin's own
  activation and ours needs the test to prove it, not the spec.
- The fuzzer runs fullscreen actions; a campaign after the change is due in any case (OPEN.md:
  the frame run is pending), and this is the sort of seam it finds things at.

## Tests

`tests/live/32-fullscreen-open.sh`, one monitor, written to go red on today's code at each
part (the first build's version went red at A and, with B alone reverted, at B):

- `a`, `b` tiled; `b` fullscreen by the KWin property (`w.fullScreen = true`); `c` opened.
  Expect: no `FLOAT` line; the tree `H[a b! c]` (focus per decision 1); `b` still fills the
  monitor; with 1(a), `b` still active and the top window at the monitor's centre (a screenshot
  pixel, as `53-hold.sh` reads them, or KWin's `stackingOrder`).
- `b` leaves fullscreen. Expect `H[a b c]` in thirds, `c` focused under 1(a).
- `r` tiled beside `b`, fullscreen, retitled while fullscreen (`--retitle`). Expect it still
  tiled and fullscreen; leaving fullscreen gives two halves. (A reclassify that floats logs no
  `FLOAT` line; the half-geometry check is the one that sees it.)
- `clean_log`.
- With 1(a): a modal dialog of the fullscreen window (`--dialog`) is focused and visible.

`make test` green; `52-mouse.sh` and `53-hold.sh` are known to flake under the full parallel run
and are rerun alone when they do.

## Order

Decide (1-3) → second agent reviews this spec → change → `make test` → second agent reviews the
change → Paul says go → live reload → watch the next fullscreen session → fuzz campaign.

## Not in this spec

The capture of 2026-10-23 17:43 (both monitors showing workspace 5 after a Minecraft launch) is
a different seam and waits for Paul's account of what he saw.
