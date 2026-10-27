# LATER — work held until the Stage ends

**Added to as we go.** The Stage (`OPEN.md`) is development: Paul uses kwin-i3 daily and adjusts
it. Reliability work, release prep and anything upstream wait here (upstream: Paul wants more
experience with Plasma first, 2026-10-25), unless one informs a structural change or a larger issue
turns up. Rules:

- An item lives in **one** file: it moves to `OPEN.md` when Paul brings it back, and comes out of
  here then. Numbers are shared with `OPEN.md` (the next free one, never reused).
- Like `OPEN.md`, state, not history: rewrite an item as it changes.
- New finds that can wait for the end of the Stage go here, with what would be done and why it waits.

Moved out of `OPEN.md` 2026-10-25 (Paul). When the Stage ends, suggested order: 4, 5, 22, 26.

## Reliability

**36. The test depth held back during the Stage** (Paul, 2026-10-26: testing that heavy "is really
hurting my motivation"; `docs/testing.md` is lean until the Stage ends). Then, each in runs of 5
minutes or less (never one long run): the fault battery (`make mutate-live`, `make mutate`) and
faults for each scenario added meanwhile (`KI3_SCENARIO=NN-name.sh`); the fuzz campaign; `make
live-stock`. Waiting there: 86-tiling-drag's 59 faults in `tests/live/mutate.py`, 36 run
(2026-10-26: 19 caught, 16 survived, 1 broken by its own text, "the helper not turned on at a
reconfigure", whose from-text ends mid-line), 23 not run; the survivors not yet sorted (a check to
add, code to remove, or not visible in the test KWin). The fuller procedure that was in
`docs/testing.md` before (git 6a58018) is the starting point for the stricter one. Several of
those faults' from-texts no longer match (the centre swap, the drop outline added and removed,
Meta+Shift): rewrite them from the code before the run.

**30. Focus after a close on a stock install** (finding 8: B51, C26; from OPEN.md 2026-10-26).
At a workspace's top level and when a floating window closes, KWin's choice stands (`docs/plan.md`,
"Focus"). With Paul's `NextFocusPrefersMouse=true` that is the window under the pointer, the
accepted pointer/keyboard choice; with a stock install's `false` it is KWin's most recently used,
which should match i3's workspace focus order but may not (windows kwin-i3 doesn't manage, the
per-monitor chain). i3's own rule, the yardstick (`con_next_focused`, `tree.c` `tree_close_internal`, read
2026-10-27): closing a floating window or a top-level tiled one focuses the workspace's next most
recently focused child, tiled or floating, descended to its focused leaf; with none left, the
workspace. Next: compare KWin's choice with `false` against that in the test KWin (three tiled,
one floating, close each), then a proposal or a line in `docs/behaviour.md` §5 saying they agree.

**5. Wider reliability.** Fuzz configurations for one and three monitors, mixed scaling, more than
one activity, and with no plugins (the fuzzer knows only two 1280x720 outputs at scale 1, unplugs
only Virtual-1, and loads the plugins whenever they are built); Plasma 6.8 when it lands. Rare and
deliberate, as the fuzzer is now. **Activities are unhandled today**: nothing in the code checks a window's activity
(2026-10-27, `docs/behaviour.md` §3), though the README once said other activities' windows were
never managed; KWin's tiles are per monitor and desktop, not per activity, so a window on another
activity likely takes a tile on its desktop and leaves a hole there. Next: a read-only check that
kactivitymanagerd can run on a test KWin's bus, then that hole confirmed or not (if activities
can't run there, they are won't-fix here, with the reason), then a spec for the harness
pieces (`KI3_OUTPUTS`, a scale per output, `run.py --no-plugins`, the invariants' two-output
assumptions), then one campaign per configuration.
**No campaign has run since 2026-10-24's changes** (window modes, desktop changes, the key
cleanup) nor 2026-10-25's at the KWin seam (focus passes that spare unmanaged windows, focus
following desktops switched outside kwin-i3, the pointer moved only by keys, the popup grace, the
layout keys, the flight recorder's GEOM/TILE lines), and the fuzzer needs updating first: its I4
"no hole" check must allow the frame's 1 px (the plugins load in its KWins, so the frame is on), a
frame-pixel invariant would catch lost or stale frames, and new actions: a workspace of Plasma
windows, `frameOnFloating`, the effect unloaded and loaded, a desktop removed or moved. The test flakes are `OPEN.md` item 34.

**10. Window modes** (`docs/spec-window-modes.md`): all four pieces live 2026-10-24 (the frame
drawn by kwini3hold outside tiled windows; floating windows keep the user's decoration;
`floatingWorkspaces`, `frameOnFloating`; the effect keeps the floating set; kwini3frame retired;
reviews `docs/review-window-modes-*.md`). Left:
- test gaps: a second output with an offset, a desktop switch with slide, scroll on the frame
  (tools/ei-send can't scroll), a forcing window rule (desktop, maximize, size or no titlebar:
  each may ping-pong with kwin-i3's placement or frame, i3 feature map finding 10), `borderlessMaximizedWindows`, a window
  added or closed in the 250 ms at load; rounded corners on a libadwaita app (one that may draw
  its own corners and shadow, unverified; `docs/spec-rounded-corners.md`);
- the known limits written in the spec.

**11. The panel** (Plasma's default, with kwin-i3's workspace widget in place of the pager,
`docs/spec-workspace-widget.md`; working, Paul, 2026-10-25). The widget's test gaps: a scroll
test (tools/ei-send can't scroll), vertical panels and "Numbers only" untested live.

**13. Workspace commands** (`docs/spec-workspace-commands.md`: back-and-forth, next/prev, the
output moves, names in the widget), live 2026-10-25, unbound as in i3. Left: live tests for the
source monitor's lowest-with-windows fallback, the history after a rebuild, the previous workspace
after an unplug; the widget's names on a vertical panel.

**26. KWin's own tile tools act on kwin-i3's tiles** (i3 feature map, finding 9: R11, R12,
R14). Meta+T's tile editor edits the tiles kwin-i3 owns (overwritten at the next pass);
Shift+drag drops a window into one (two windows in a leaf); drag to a screen edge quick-tiles into
KWin's other tree (kwin-i3 pulls it back, not "floats where dropped"). Meta+T is unbound on Paul's
desktop but KWin's default on a stock one. Inferred from code: next, a test-KWin check of each,
then whether to block, follow or document them (and whether `make take-keys` should free Meta+T).

**27. Keep Above and Keep Below on floating windows** (finding 11: R18, R19). kwin-i3 owns Keep
Above on floating windows (the plain script's way to keep them over tiled ones), so a user can't
turn it off there, and Keep Below is overwritten. Next: whether the plugins' path (the effect's
floating set) can leave both flags to the user, and the plain script document it.

## The settings page

**22. The settings page, finished for a release** (Paul, 2026-10-25: "not perfect, but fine for
the dev phase; it will need more attention as we end it"). Today's state: reorganized
(`docs/spec-settings-cleanup.md`), the frame section given one shape and the debug-log checkbox
removed (2026-10-25). Next, at the end of the Stage: a pass over the whole page with Paul,
screenshot by screenshot, on his desktop with the plugins (the test KWin's page has none, so its
frame section is all greyed); by hand, whether arrow keys move the highlight in an open dropdown
(injected input didn't, in 76); then item 18. Two gaps found reading the code (2026-10-27, Paul's go to fix then): the page
checks only for the effect, so it can't say the helper is missing (no tiling drag, frame focus,
layout keys, or Apply on the Configure form): a banner naming whichever plugin is missing and what
that costs; and Defaults then Apply on a non-US layout writes the US keys until the next layout
change or load: the page calls the helper's `FitKeys` after Apply, as i3's `bindsym` follows the
keymap at once. Also then: plainer words on the page where the explicit ones are stiff (Paul,
2026-10-27: "colloquialize wording later"), still true (`docs/spec-window-words.md`).

**18. A standing accessibility check of the settings page** (parked by Paul, 2026-10-25: light
tests while in development). `tests/live/75-settings-a11y.sh` (git history, commit after
`docs/spec-settings-cleanup.md`'s build) audited every page through `tools/a11y.py`: names, no
duplicates, no empty headings, Tab order. Bring it back as `make a11y`, run when the page changes
rather than in `make test`.

## Release prep

**28. Launch workspace, a maybe** (finding 2: C19; from OPEN.md 2026-10-26, Paul: "park it as a
maybe"). i3 puts a window on the workspace it was launched from only when i3 started the program
itself (`exec`, or dmenu run by it), the window carries the matching `_NET_STARTUP_ID`, and the
launch finished less than 30 s ago (`startup.c` 4.24). kwin-i3 puts it on the workspace current
when the window appears. Paul uses that (start a Minecraft instance, then go to the workspace it
should open on), and in i3 it was the same: the game's window comes from its launcher's Java
process, which i3 didn't start, and GLFW sets no startup id. The difference is only an app started
straight from the launcher, then a switch before its window shows. Documented as a divergence
(`docs/plan.md`, "Scope"; README, "Keys"). Next, if a user asks for it: whether KWin 6.7.5 gives a
script the window's xdg-activation token (Wayland) or startup id (Xwayland) and the launch's
moment; if not, a plugin hook in KWin's activation, or won't-fix.


**4. No dependence on Paul's dotfiles.** (a)-(d) done and live 2026-10-24: workspaces created on
demand (`docs/spec-desktops-on-demand.md`), per-monitor desktops reported and put right when
turned on (`docs/spec-per-output-desktops.md`), taken keys reported with `make take-keys` /
`restore-keys` (`docs/spec-taken-keys.md`), kwin-i3's own Meta+F / Meta+Shift+Q
(`docs/spec-own-keys.md`); (b) and (c) share one notification at load. The stock test mode is
done (`make live-stock`, `docs/spec-stock-mode.md`, 2026-10-24): the install as written
(per-output on, `make take-keys`) works on a stock Plasma with click-to-focus; no real finding.
Left:
- the default keys against a stock Plasma (finding 13: R1-R7): 22 clash until `make take-keys`;
  README says zoom clashes, but only Meta+0 does; and no Meta+Return terminal outside the
  dotfiles (finding 14, D74): say how to bind one;
- (e) focus follows mouse and Meta-alone (also map finding 12): README only, in the README pass (four scenarios,
  `# focus: mouse`, assume it);
- **the README pass**: install read as a stranger on a stock Plasma, the settings page
  (`make kcm-install`) included. It must cover: a package linked while KWin runs can't be turned
  on until the next login (KPackage's cache, `docs/spec-settings-page.md`); and an app's floating
  size: a floated window comes back at the size it opened with, but an app that last closed tiled
  opens at that tiled size, as in i3. The fix is a Plasma window rule (Size/Position, "Apply
  Initially"), i3's `for_window` resize done through Plasma: README steps, after a test-KWin check
  that such a rule leaves tiling alone (`docs/spec-float-size.md`);
- bug reports from other people: what a capture holds and how to send one (`docs/debugging.md`).

**Not decided: a release** and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; not an item until he decides.

## Upstream

**2. Settings**: done and hand-checked (`docs/spec-settings.md`, 2026-10-24). Left: the one-line
KWin fix upstream (`ScriptingConfig::reload` in `genericscriptedconfig.cpp`), so the Configure
form's Apply applies without the plugins too (the settings page's Apply already does).
