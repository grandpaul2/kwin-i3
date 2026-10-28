# Spec: redo stage 10, the settings page for the new settings (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**Why** (Paul, 2026-10-27, call 21): the stages add settings that clash with what the page has;
this stage makes them usable, with i3's kind names, super descriptive and explicit. It is inside
the Stage (call 33). `LATER.md` item 22 (the page finished for a release) and 18 (its standing
accessibility check) stay there, apart from what this stage takes from 22 (call 40).

## What the page is today

`kcm/ui/main.qml` with sub-pages `Workspaces.qml`, `WindowRules.qml`, `Keys.qml`; sections Tiling
(gaps, new-workspace direction, both steps, focus at an edge, the hold), Workspaces, Frame (look,
width, two colours, corners, floating frame and its two colours), Window rules (two lists, "Places
itself" and "Always float"), Keys. Its rules: `docs/style-settings-page.md`. Its config comes from
`package/contents/config/main.xml`, which `src/settings.js`'s table and `config.ui` follow
(`tests/unit/` keeps the three together).

## The settings the stages add or change

| stage | setting | today |
|---|---|---|
| 2 | `mouseWarping` (`output`, `none`) | — |
| 3 | `forWindow`, `assign` (i3's lines) | `ignoreClass`, `ignoreRole`, `floatingClass`, `floatingTitle` go |
| 3 | `floatingMinimumSize`, `floatingMaximumSize` | — |
| 3 | `floatingWorkspaces` | becomes a `forWindow` rule |
| 4 | `workspaceOutputs` | one output per number → a list |
| 6 | `tilingDrag` (`off`, `modifier`, `titlebar`, `modifier titlebar`) | — |
| 7 | `frameFocusedInactive`, `frameIndicatorActive`, `frameIndicatorFocusedInactive`, `frameIndicatorInactive` | `frameFloatingActive`, `frameFloatingInactive` go |
| 7 | `hideEdgeBorders`, `smartGaps` | — |
| 7 | `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft`, `workspaceGaps` | — |
| 8 | `popupDuringFullscreen` | — |
| 5, 9 | the new actions (Resize Mode, Exit, Terminal, Launcher, the no-back-and-forth and output actions, Sticky Toggle) | Keys sub-page, from `commands.json` |

## Design (the layout is call 38)

**Main page**, sections in this order:

- **Tiling**: Gaps (inner, outer, as now) with **Configure Gaps…** (summary: "Same on every side" /
  "2 workspaces differ"): per-side outer gaps, `smartGaps`, and per-workspace gaps in one row per
  workspace; new-workspace direction; both steps; focus at an edge; layout changes (the hold).
- **Mouse and focus** (new): "Move the pointer to a monitor that gets the focus" (`mouseWarping`);
  "Drag a tiling window:" with its title bar and with Meta / with Meta / by its title bar / not at
  all (`tilingDrag`); "New windows over a fullscreen window:" stay behind it, except its own
  dialogs / always stay behind it / end the fullscreen, if a dialog / come in front, if floating
  (`popupDuringFullscreen`).
- **Workspaces**: as now; the Workspaces sub-page's monitor control becomes an ordered list per
  workspace ("Monitors, the first connected one used"), and its "New windows: tiling / floating"
  stays as a control that writes and reads that workspace's `[workspace="^N$"] floating enable`
  rule.
- **Frame**: look, width; the colours as a grid of three rows (focused; focused, on a monitor or
  split without the focus; others), two `ColorButton`s each (frame, split indicator), side labels
  `Accessible.ignored` as now; "Hide frame sides:" none / at the screen's left and right / top and
  bottom / all edges / when a workspace has one window / the same, with no outer gaps
  (`hideEdgeBorders`); rounded corners; "Draw the frame on floating windows too".
- **Window rules**: **Configure Window Rules…** (summary: "4 rules, 1 sending to a workspace").
- **Keys**: as now; the new actions appear grouped (`commands.json`).

**Window Rules sub-page** (the redesign stage 3 left minimal; call 39): one row per rule, in
order: what it matches (application, title, role, type, each "matches" a pattern; Pick a Window…
fills the application in as `^…$`), and what it does (floats / tiles / opens on workspace N /
opens on monitor X); the defaults listed like any other rule, marked, removable (style guide §4);
a rule that couldn't be read shown with its `WARN`. Below, **Floating window sizes**: smallest
(75 × 50 px), largest (all monitors, or a size). The words name i3's kinds: "floats (a floating
window)", "tiles (a tiling window)"; "places itself" goes.

**Apply** writes the new keys and **removes the old ones** (`ignoreClass`, `ignoreRole`,
`floatingClass`, `floatingTitle`, `floatingWorkspaces`, `frameFloatingActive`,
`frameFloatingInactive`), translated as stage 3's C does, so Paul's two floating titles become two
rules on the first Apply.

**The style guide** (`docs/style-settings-page.md`) §2 "Three words for a window": rewritten for
i3's kinds (tiling, floating, sticky floating; dock, root, override-redirect where a page ever
names them), super descriptive and explicit, as `spec-window-words.md`'s supersession says.

**The Configure form** (`config.ui`, KWin's generic script form) gets the new keys as plain fields,
as now for every setting.

## Tests

- **Run**: `make unit` (`kcm.test.js`, `kcm-settings.test.js`, `settings.test.js`: the three-way
  table check), 37 (settings page), 76 (sub-pages), 25.
- **Expectations that change**: 76's Window Rules page throughout; 37's Frame section (six
  colours); the unit tests' table (new keys, two gone).
- **New checks, for Paul's go**: 76, a rule added with Pick a Window… and applied appears in
  `forWindow`; the migration on Apply (old keys gone, Paul's two titles as rules); the Gaps
  sub-page's per-workspace row reaching `workspaceGaps`.
- **Screenshots** (the style guide's §1: every layout change checked on a screenshot): each
  changed page, for Paul.

## For Paul (in the review)

38. **The layout above**: the new "Mouse and focus" section, gaps behind a sub-page, the colour
    grid, the floating sizes on the Window Rules page. Paul's screenshots decide.
39. **The rule editor**: rows with fields (recommended: the control that can't be wrong, style
    guide §3) or i3's lines as text (what stage 3 leaves; closer to i3, easy to get wrong).
40. **The helper's banner** from `LATER.md` item 22, brought into this stage: the page checks only
    for the effect today, and the resize mode (stage 5), the drag settings (stage 6) and Apply on
    the Configure form all need the helper. Recommended: yes, a banner naming the missing plugin
    and what it costs; the rest of item 22 stays.

## Done when

Paul has seen each page's screenshots and used it: `behaviour.md` §11 "The settings page" rewritten
as built; the style guide's §2; `LATER.md` item 22 says what this stage took from it.
