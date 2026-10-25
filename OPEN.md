# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-25**.

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work (item 5, item 10's test gaps) and release prep (item 4's README pass, item 9,
a release) are deferred unless they inform a structural change or a larger issue turns up.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". Suggested order: 4, 9, 5 (1, 3 and 7 are done; 7, kwin-i3's own
settings page, live 2026-10-24: `docs/spec-settings-page.md`).

## Open

2. **Settings**: done and hand-checked (`docs/spec-settings.md`, 2026-10-24). Left, Paul's call,
   when he wants it: the one-line KWin fix upstream (`ScriptingConfig::reload` in
   `genericscriptedconfig.cpp`), so the Configure form's Apply applies without the plugins too
   (the settings page's Apply already does).
4. **No dependence on Paul's dotfiles.** (a)-(d) done and live 2026-10-24: workspaces created on
   demand (`docs/spec-desktops-on-demand.md`), per-monitor desktops reported and put right when
   turned on (`docs/spec-per-output-desktops.md`), taken keys reported with `make take-keys` /
   `restore-keys` (`docs/spec-taken-keys.md`), kwin-i3's own Meta+F / Meta+Shift+Q
   (`docs/spec-own-keys.md`); (b) and (c) share one notification at load. The stock test mode
   is done (`make live-stock`, `docs/spec-stock-mode.md`, 2026-10-24): the install as written
   (per-output on, `make take-keys`) works on a stock Plasma with click-to-focus; no real
   finding. Left:
   - (e) focus follows mouse and Meta-alone: README only, in the README pass (four scenarios,
     `# focus: mouse`, assume it);
   - **the README pass**: install read as a stranger on a stock Plasma, the settings page
     (`make kcm-install`) included. Next: do it. It must cover: a package linked while KWin runs
     can't be turned on until the next login (KPackage's cache, `docs/spec-settings-page.md`).
5. **Wider reliability.** Fuzz configurations for one and three monitors, mixed scaling, more
   than one activity, and with no plugins (the fuzzer knows only two 1280x720 outputs at scale 1,
   unplugs only Virtual-1, and loads the plugins whenever they are built); Plasma 6.8 when it
   lands. Rare and deliberate, as the fuzzer is now. Next: a read-only check that
   kactivitymanagerd can run on a test KWin's bus (if not, activities are won't-fix here, with the
   reason), then a spec for the harness pieces (`KI3_OUTPUTS`, a scale per output, `run.py
   --no-plugins`, the invariants' two-output assumptions), then one campaign per configuration. 53-hold runs
   by itself after the parallel batch (`# timing: alone`, 2026-10-24), so its timing checks are
   strict in `make test`.
   **No campaign has run since 2026-10-24's changes** (window modes, desktop changes, the key
   cleanup), and the fuzzer needs updating first: its I4 "no hole" check must allow the frame's
   1 px (the plugins load in its KWins, so the frame is on), a frame-pixel invariant would catch
   lost or stale frames, and new actions: a workspace of Plasma windows, `frameOnFloating`, the
   effect unloaded and loaded, a desktop removed or moved. Deferred with the rest (the Stage).
   53-hold's other early failure, the kill switch's `--notify` not taking (seen once, early
   2026-10-24), has not recurred in ~15 full runs since; closed unless it comes back.
9. **Non-US keyboard layouts and the workspace move keys.** Meta+Shift+digit arrives as
   Meta+<the symbol Shift+digit types>, and kwin-i3 registers the US symbols (Meta+!, Meta+@, ...).
   On a German layout Shift+2 types `"`, so Meta+Shift+2 matches nothing and moving a window to
   workspace 2 doesn't work (likewise Meta+: for Move Right). Found 2026-10-24 (the probe behind
   `tests/live/38-retired-keys.sh`). Next: find how KWin matches a shifted key (its source), then
   choose: read the layout's symbols, or register by key position; spec, with a scenario on a
   German-layout test KWin.

10. **Window modes** (`docs/spec-window-modes.md`): all four pieces live 2026-10-24 (the frame drawn
    by kwini3hold outside tiled windows; floating windows keep the user's decoration;
    `floatingWorkspaces`, `frameOnFloating`; the effect keeps the floating set; kwini3frame
    retired; reviews `docs/review-window-modes-*.md`). Left (deferred with reliability, the Stage):
    - test gaps: a second output with an offset, a desktop switch with slide, scroll on the frame
      (tools/ei-send can't scroll), a forcing window rule, `borderlessMaximizedWindows`, a window
      added or closed in the 250 ms at load;
    - the known limits written in the spec;
    - workspace 4's OBS was left at an odd size by the reloads (hidden then): watch it on first show.
11. **The panel and notifications.** Plasma's default panel is back for good (2026-10-24; dotfiles'
    `setup.sh` adds it where there is none), with kwin-i3's workspace widget in place of the pager.
    Tiles leave room for it. Notifications are Plasma's since 2026-10-25
    (`docs/spec-notifications.md`; dunst removed). Left:
    - **The workspace widget** built and installed 2026-10-24 (`docs/spec-workspace-widget.md`,
      `widget/`, `make widget-install`; reviewed; unit + live tests); on Paul's panel in place of the
      pager, working (Paul, 2026-10-24). Left: a scroll test (tools/ei-send can't scroll), vertical
      panels and "Numbers only" untested live.
    - **The floating panel's gap** (KDE bug 511162): with focus follows mouse and no delay, the
      pointer crossing the gap focuses the desktop and closes the popup. Not hit at the default
      size; Paul would want it for a smaller panel. A narrow fix, not a delay: next, read KWin's
      focus-follows-mouse path (6.7.5) and the bug's upstream state.
    - To watch: auto-hide, the task list and hidden workspaces.
    - **Plasma's notifications in place of dunst** (`docs/spec-notifications.md`, Paul's go
      2026-10-25): the dotfiles side done. Next: the live switch (spec steps 8-10: remove dunst,
      `setup.sh`, restart plasmashell), on its own go, then the spec's checks.

13. **Workspace commands** (`docs/spec-workspace-commands.md`: back-and-forth, next/prev, the
    output moves, names in the widget), live 2026-10-25, unbound as in i3. Left (deferred with
    reliability, the Stage): live tests for the source monitor's lowest-with-windows fallback, the
    history after a rebuild, the previous workspace after an unplug; the widget's names on a
    vertical panel.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
