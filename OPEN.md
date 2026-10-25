# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-25** (session end).

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work (item 5, the test gaps in items 10, 11 and 13), release prep (item 4's README
pass, a release) and anything upstream (item 2; Paul, 2026-10-25: more experience with Plasma
first) are deferred unless they inform a structural change or a larger issue turns up.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". When the Stage ends, suggested order: 4, 5 (1, 3 and 7 are done; 7,
kwin-i3's own settings page, live 2026-10-24: `docs/spec-settings-page.md`; 15, the panel
configuration bug, fixed 2026-10-25: `docs/bug-panel-config.md`).

## Open

Work for now.

**16. A tile hidden by Show Desktop activated in the first second after a load** (seen only in the
test KWin, 2026-10-25, while fixing item 15; `docs/bug-panel-config.md`, "Left over"). With no frame
effect, Show Desktop turned on within ~1 s of a kwin-i3 load goes off again: something activates
the hidden tile. Traced far enough to rule out the passive pass (it asked KWin and stopped) and
`setFrame`'s border work (the tile was active before the 1 s miss timer's handler ran); the
activation had no JavaScript caller visible. Not Paul's case (live, the effect answers at once).
Next: a trace of KWin's `Workspace::activateWindow` callers in that second (helper probe in a
worktree), or won't-fix if it stays a load-time curiosity. 74-show-desktop waits for the load to
settle (`FRAME` logged) meanwhile.

**17. The settings page, reorganized and made accessible** (Paul, 2026-10-25):
`docs/spec-settings-cleanup.md`, built, tested and installed (`make kcm-install`). Next: Paul's
look at it; by hand, whether arrow keys move the highlight in an open dropdown (injected input
didn't, in 76).



## Deferred (the Stage)

Reliability, release prep and anything upstream, held for the development stage (upstream: Paul
wants more experience with Plasma before submitting anything, 2026-10-25). Not open work until
Paul brings one back or it informs a structural change.

**2. Settings**: done and hand-checked (`docs/spec-settings.md`, 2026-10-24). Left: the one-line
KWin fix upstream (`ScriptingConfig::reload` in `genericscriptedconfig.cpp`), so the Configure
form's Apply applies without the plugins too (the settings page's Apply already does).

**4. No dependence on Paul's dotfiles.** (a)-(d) done and live 2026-10-24: workspaces created on
demand (`docs/spec-desktops-on-demand.md`), per-monitor desktops reported and put right when
turned on (`docs/spec-per-output-desktops.md`), taken keys reported with `make take-keys` /
`restore-keys` (`docs/spec-taken-keys.md`), kwin-i3's own Meta+F / Meta+Shift+Q
(`docs/spec-own-keys.md`); (b) and (c) share one notification at load. The stock test mode is
done (`make live-stock`, `docs/spec-stock-mode.md`, 2026-10-24): the install as written
(per-output on, `make take-keys`) works on a stock Plasma with click-to-focus; no real finding.
Left:
- (e) focus follows mouse and Meta-alone: README only, in the README pass (four scenarios,
  `# focus: mouse`, assume it);
- **the README pass**: install read as a stranger on a stock Plasma, the settings page
  (`make kcm-install`) included. It must cover: a package linked while KWin runs can't be turned
  on until the next login (KPackage's cache, `docs/spec-settings-page.md`).

**5. Wider reliability.** Fuzz configurations for one and three monitors, mixed scaling, more than
one activity, and with no plugins (the fuzzer knows only two 1280x720 outputs at scale 1, unplugs
only Virtual-1, and loads the plugins whenever they are built); Plasma 6.8 when it lands. Rare and
deliberate, as the fuzzer is now. Next: a read-only check that kactivitymanagerd can run on a test
KWin's bus (if not, activities are won't-fix here, with the reason), then a spec for the harness
pieces (`KI3_OUTPUTS`, a scale per output, `run.py --no-plugins`, the invariants' two-output
assumptions), then one campaign per configuration. 53-hold runs by itself after the parallel batch
(`# timing: alone`, 2026-10-24), so its timing checks are strict in `make test`.
**No campaign has run since 2026-10-24's changes** (window modes, desktop changes, the key
cleanup) nor 2026-10-25's at the KWin seam (focus passes that spare unmanaged windows, focus
following desktops switched outside kwin-i3, the pointer moved only by keys, the popup grace, the
layout keys), and the fuzzer needs updating first: its I4 "no hole" check must allow the frame's
1 px (the plugins load in its KWins, so the frame is on), a frame-pixel invariant would catch lost
or stale frames, and new actions: a workspace of Plasma windows, `frameOnFloating`, the effect
unloaded and loaded, a desktop removed or moved. 53-hold's other early failure, the kill switch's
`--notify` not taking (seen once, early 2026-10-24), has not recurred in ~15 full runs since;
closed unless it comes back. Likewise 39-layout-notice: 5 checks failed once in a full batch
(2026-10-25), passed alone twice and in the next full run; closed unless it comes back.

**10. Window modes** (`docs/spec-window-modes.md`): all four pieces live 2026-10-24 (the frame
drawn by kwini3hold outside tiled windows; floating windows keep the user's decoration;
`floatingWorkspaces`, `frameOnFloating`; the effect keeps the floating set; kwini3frame retired;
reviews `docs/review-window-modes-*.md`). Left:
- test gaps: a second output with an offset, a desktop switch with slide, scroll on the frame
  (tools/ei-send can't scroll), a forcing window rule, `borderlessMaximizedWindows`, a window
  added or closed in the 250 ms at load;
- the known limits written in the spec.

**11. The panel** (Plasma's default, with kwin-i3's workspace widget in place of the pager,
`docs/spec-workspace-widget.md`; working, Paul, 2026-10-25). The widget's test gaps: a scroll test (tools/ei-send can't scroll), vertical
panels and "Numbers only" untested live.

**13. Workspace commands** (`docs/spec-workspace-commands.md`: back-and-forth, next/prev, the
output moves, names in the widget), live 2026-10-25, unbound as in i3. Left: live tests for the
source monitor's lowest-with-windows fallback, the history after a rebuild, the previous workspace
after an unplug; the widget's names on a vertical panel.

**18. A standing accessibility check of the settings page** (parked by Paul, 2026-10-25: light
tests while in development). `tests/live/75-settings-a11y.sh` (git history, commit after
`docs/spec-settings-cleanup.md`'s build) audited every page through `tools/a11y.py`: names, no
duplicates, no empty headings, Tab order. Bring it back with the reliability work, as `make a11y`
run when the page changes rather than in `make test`.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
