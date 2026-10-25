# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24** (late).

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
   No campaign has run since 2026-10-24's key cleanup (the dead Shift+symbol actions gone, a
   minor `src/` change): the next campaign covers it.
   53-hold's other early failure, the kill switch's `--notify` not taking (seen once, early
   2026-10-24), has not recurred in ~15 full runs since; closed unless it comes back.
9. **Non-US keyboard layouts and the workspace move keys.** Meta+Shift+digit arrives as
   Meta+<the symbol Shift+digit types>, and kwin-i3 registers the US symbols (Meta+!, Meta+@, ...).
   On a German layout Shift+2 types `"`, so Meta+Shift+2 matches nothing and moving a window to
   workspace 2 doesn't work (likewise Meta+: for Move Right). Found 2026-10-24 (the probe behind
   `tests/live/38-retired-keys.sh`). Next: find how KWin matches a shifted key (its source), then
   choose: read the layout's symbols, or register by key position; spec, with a scenario on a
   German-layout test KWin.

10. **Window modes: Plasma's or i3's, per window** (Paul, 2026-10-24: "a defining feature, so it
    would need to be implemented cleanly"). A floating window is an ordinary Plasma window (the
    user's own decoration: title bar, rounded corners, shadow, the theme's focus colour); a tiled one
    has i3's frame; Meta+Shift+Space moves a window between them. A workspace can be set to open
    new windows in either mode (instead of i3's stacked and tabbed layouts: Plasma is the DE on
    those windows). The likely route: tiled windows get `noBorder` and a frame drawn by the effect
    plugin, which retires the `kwini3frame` decoration (KWin has one decoration for every window).
    Hurdles: the frame's pixel inside the tile, focus by clicking the frame, the script-only install
    (tiled windows keep title bars), KWin's quick tiling on floating windows, the kept-above
    floating marker. **Route chosen (Paul, 2026-10-24): the user's decoration on floating windows,
    tiled ones borderless, the frame drawn by the effect outside the window: nothing of the app
    covered.** Prototype done (branch `proto-effect-frame`, `tests/live/99-effect-frame.sh`, 18
    pixel checks green): the tiles padded by twice the frame and the root inset by a hair
    (1e-6) so KWin gives half the padding at the screen edges too, 1 px all round; the frame
    drawn by kwini3hold where the window is drawn, so it stays with a held snapshot. Found:
    - the border must go before the tile asks for a size, and the window be refit once the
      client has answered (KWin keeps the decoration until then; the `armed` refit does it);
    - plain GTK 4 windows with a server-side title bar stopped short by the title bar's height:
      KWin sends `configure_bounds` only with a configure that has no size (in practice the
      first, sized for the title bar then; `XdgToplevelWindow::sendRoleConfigure`, 6.7.5), and
      GTK 4 keeps within them. Fixed in the prototype, no upstream needed (Paul, 2026-10-24:
      work with what KWin gives): a window that lands short after its border went is asked
      for a 0x0 frame (KWin resends the bounds; GTK keeps its size), then for its tile 5 ms
      later. Qt, GTK 3, Alacritty and libadwaita apps never take that path;
    - `noBorder` stays after an unload (release gives it back) and is saved by session restore.
    Prototype shortcuts the spec must replace: the effect always active, a full repaint on
    every change, `sameRect`'s tolerance cut to 1e-9 for the hair.
    **All four pieces live 2026-10-24** (`docs/spec-window-modes.md`; reviews
    `docs/review-window-modes-*.md`; 37 scenarios, 793 checks green): the frame drawn by kwini3hold
    outside tiled windows, tiled windows borderless, floating ones the user's decoration, the GTK 4
    bounds, kwini3frame retired; `floatingWorkspaces` (workspaces of Plasma windows) and
    `frameOnFloating`, the effect keeping the floating mark. Paul's desktop on the defaults (both
    off). Left:
    - test gaps (the spec's test section): a second output with an offset, a desktop switch with
      slide, scroll on the frame (tools/ei-send can't scroll), a forcing window rule,
      `borderlessMaximizedWindows`, a window added or closed in the 250 ms at load;
    - known limits written in the spec (a monitor change in those 250 ms; kept-above left from an
      earlier load without the effect; late-classified windows on a Plasma workspace);
    - workspace 4's OBS was left at an odd size by the 22:0x reloads (hidden then): watch it on
      first show.
11. **The panel and notifications.** Plasma's default panel added 2026-10-24 as a trial
    (`~/.dotfiles/setup.sh` still removes panels on a run, untouched while it is a trial). Tiles
    leave room for it (Paul: above it). Left:
    - **The workspace widget** built and installed 2026-10-24 (`docs/spec-workspace-widget.md`,
      `widget/`, `make widget-install`; reviewed; unit + live tests). Paul swaps the pager for it
      himself (Show Alternatives). Left: a scroll test (tools/ei-send can't scroll), vertical
      panels and "Numbers only" untested live.
    - **The floating panel's gap** (KDE bug 511162): with focus follows mouse and no delay, the
      pointer crossing the gap focuses the desktop and closes the popup. Not hit at the default
      size; Paul would want it for a smaller panel. A narrow fix, not a delay: next, read KWin's
      focus-follows-mouse path (6.7.5) and the bug's upstream state.
    - To watch: auto-hide, the task list and hidden workspaces.
    - Paul may drop dunst for Plasma's notifications; how and when is not decided.

12. **`make plugin` leaves stale outputs.** `plugin/build/bin` keeps the files of a plugin renamed
    or retired (`kwini3mouse.so` was still loaded by every test KWin until 2026-10-24;
    `org.kde.kdecoration3/kwini3frame.so` is there now, harmless: nothing selects it). Next: have
    `make plugin` remove any plugin file it didn't build; spec it like any change.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
