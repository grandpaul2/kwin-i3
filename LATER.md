# LATER — work held until the Stage ends

**Added to as we go.** The Stage (`OPEN.md`) is development, then the beta: a few early users run
kwin-i3 daily and it is adjusted as they go. Reliability work, release prep and anything upstream
wait here (upstream reports wait for more experience with Plasma), unless one informs a structural
change or a larger issue turns up. Rules:

- An item lives in **one** file: it moves to `OPEN.md` when the maintainer brings it back, and comes out of
  here then. Numbers are shared with `OPEN.md` (the next free one, never reused).
- Like `OPEN.md`, state, not history: rewrite an item as it changes.
- New finds that can wait for the end of the Stage go here, with what would be done and why it waits.

Moved out of `OPEN.md` 2026-10-25; what the beta needs (4, 22, 51, 61) went back,
51's rest and 22 returned
2026-10-30; 56 and 26 went back 2026-10-31, with 70's README paragraph as item 71. A beta user's bug brings the matching item back (27, 30, 45, 60, and 5's
activities are the likeliest). When the Stage ends, suggested order: 5, then 30.

## Reliability

**90. Plasma's window effects read against the hold, not yet seen** (2026-11-03). A sweep of
6.7.5's window animations against `kwini3hold` found these possible, none confirmed or seen:
Wobbly Windows during a tiling drag (it keeps the window redirected after the drop: the ring off
the wobbling window, the hold's snapshot of it not drawn); the ring dropped at once under Squash
and Magic Lamp minimize and a floating framed window's close animation (`ringed` is false for
minimized and deleted windows); Stretch still running when kwin-i3 refits a window leaving
fullscreen; Blur lost on a held window while the hold lasts; Dialog Parent dimming a parent but
not its ring; Fall Apart on a tiled close, by effect load order; a window mid-Glide or mid-Magic
Lamp snapshotted deformed; Eye on Screen's 1 px ring speck near scale 0, as Scale's opening shows
too. Each is cosmetic and behind a non-default effect but the minimize ones. Next: a live look
with each effect on, and a spec for any seen. Waits: the Stage, none seen by a user.

**45. A press past a monitor edge disagreed with the probe** (2026-10-28, test
KWin). VS Code's invisible band reached 1-3 px across the edge onto the other monitor: the probe
said `margin`, the real press passed (`FrameFocus pass`). Suspected, not proven: per-output
desktops, with the press making the other output active, so `isOnCurrentDesktop` drops VS Code
there. Rare (a custom-frame app's band at the monitor edge, the gap strips stop at their own
output). Next: a test-KWin trace of that press with `pointer-map events` (the press line was not
printed in the sweep). Waits: the Stage, nothing seen live.

**36. The test depth held back during the Stage** (`docs/testing.md` is lean until
the Stage ends). Then, each in runs of 5
minutes or less (never one long run): the fault battery (`make mutate-live`, `make mutate`) and
faults for each scenario added meanwhile (`KI3_SCENARIO=NN-name.sh`); the fuzz campaign. Waiting
there: 86-tiling-drag's 59 faults in `tests/live/mutate.py`, 36 run
(2026-10-26: 19 caught, 16 survived, 1 broken by its own text, "the helper not turned on at a
reconfigure", whose from-text ends mid-line), 23 not run; the survivors not yet sorted (a check to
add, code to remove, or not visible in the test KWin). The fuller procedure that was in
`docs/testing.md` before (git 6a58018) is the starting point for the stricter one. Many of the
faults' from-texts no longer match the code (2026-11-04: 64 of 146 in `tests/live/mutate.py`, 8 of
20 in `tests/unit/mutate.py`;
the centre swap, the drop outline added and removed, Meta+Shift, the monitor code moved to the
model): rewrite them from the code before the run.

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
**The fuzzer is up to date with the code of 2026-10-30** (2026-10-30): I11, the frame's
pixels (watched red with the effect unloaded unseen); the effect unloaded and loaded; a desktop
added, removed or moved; the unbound keys; Meta+Shift+N's id (its moves had invoked nothing since
2026-10-24). I4 already allowed for the frame. Still missing: a workspace of Plasma windows and
`frameOnFloating` (settings, so a per-seed configuration, with the ones above). Three 5-minute
campaigns ran that night: the first two found two bugs (63, 64) and I11's false reds
(shadows, sticky and cross-output windows, the resize badge, the screen lagging the dumps), the
third 23 of 24 clean and one more bug (minimums filling a split exactly); all fixed live.

**27. Keep Above and Keep Below on floating windows**. kwin-i3 owns Keep
Above on floating windows (the plain script's way to keep them over tiled ones), so a user can't
turn it off there, and Keep Below is overwritten. Next: whether the plugins' path (the effect's
floating set) can leave both flags to the user, and the plain script document it.

## The settings page

**22. The settings page, finished for a release** (back from `OPEN.md` 2026-10-30: the page
is fine for the beta, whose users are on US layouts; the screenshot pass and the dropdown's
arrow keys dropped). Left: Defaults then Apply on a non-US layout writes the US keys until the
next layout change or load: the page should call the helper's `FitKeys` after Apply, as i3's
`bindsym` follows the keymap at once (found reading the code 2026-10-27). Its accessibility
check is item 18.

**70. Workspace outputs for a fixed layout across monitors** (found 2026-10-31 from a capture:
not a bug). A monitor that drops out for a moment (a hotplug, a sleep, a cable) sends its
workspaces to the first output for good, as in i3 (`behaviour.md` W3, M3: `randr.c` `move_content`);
when it returns it shows a fresh empty workspace (M4) and the layout is gone. A user who keeps
one (odd numbers on the right, even on the left) gets it back only with workspace outputs, i3's
`workspace N output A B`: each number set to its screen with the other as the second, it returns
after a drop (M4), an empty workspace opens on its own screen (S4), and login lays it out (M1).
Set that way, it works and feels right. Where a user meets it today: the README's "On a laptop
that docks" (a desktop's monitor drops out the same way, but the paragraph reads as laptops
only); the settings page's Workspaces sub-page (a screen and a second screen per workspace, ten
rows by hand). Gaps: a desktop user learns of it only after losing a layout; a common pattern is
twenty choices; connector names change with the port or a driver, and the assignment then
matches nothing. i3 has only the config line: its users write it once, so anything beyond words is
blending with Plasma, judged against `plan.md`'s scope. Ideas, none decided: (a) the README's
paragraph for any monitor, not only docking; (b) a preset on the Workspaces page (alternate odd
and even, split in halves, or keep where they are now); (c) a hint when an output returns and no
workspace outputs are set, dropped: kwin-i3 sends no notifications (`behaviour.md` §13). (a) done:
the README's Install step 4. Next: the beta users' monitor setups and whether either has lost a layout, then
a proposal on (b).

**18. A standing accessibility check of the settings page** (parked: light tests while in
development). `tests/live/75-settings-a11y.sh` (in git history) audited every page through `tools/a11y.py`: names, no
duplicates, no empty headings, Tab order. Bring it back as `make a11y`, run when the page changes
rather than in `make test`.

## Release prep

**60. The laptop's monitor checks, one session toward release** (from `OPEN.md` item 50: the desk setup is
tedious, and two monitors on a desktop test most of it). On a laptop running Plasma 6.8
with an external monitor, each noted works / snag, Meta+Shift+B at any fault: docking and
undocking with windows open (i3 `randr.c`: an output's workspaces move to one that remains, and
return to it; kwin-i3 `behaviour.md` §4, scenarios 42-48; real hardware timing against KWin's
`PlacementTracker`); the lid closed and opened with the monitor attached; the wallpaper flash on
AMD (seen on an NVIDIA desktop: if never on the laptop, it points at NVIDIA). On Plasma 6.8 by
then, which is where it matters for a release.

**28. Launch workspace, a maybe** (from OPEN.md 2026-10-26, parked
as a maybe). i3 puts a window on the workspace it was launched from only when i3 started the program
itself (`exec`, or dmenu run by it), the window carries the matching `_NET_STARTUP_ID`, and the
launch finished less than 30 s ago (`startup.c` 4.24). kwin-i3 puts it on the workspace current
when the window appears. That is useful too (start a game from its launcher, then go to the
workspace it should open on), and in i3 it was the same: the game's window comes from its launcher's Java
process, which i3 didn't start, and GLFW sets no startup id. The difference is only an app started
straight from the launcher, then a switch before its window shows. Documented as a divergence
(`docs/plan.md`, "Scope"; README, "Keys"). Next, if a user asks for it: whether KWin 6.7.5 gives a
script the window's xdg-activation token (Wayland) or startup id (Xwayland) and the launch's
moment; if not, a plugin hook in KWin's activation, or won't-fix. First case: kwin-i3's own
Terminal key (`behaviour.md` K18), the one program it starts itself, as i3 starts its terminal
with startup notification on (`exec i3-sensible-terminal`; the launcher is `--no-startup-id`).

**51. What users of other KWin tilers expect** (back from `OPEN.md` 2026-10-30; (b)'s rest waits for a
release. A survey, 2026-10-28, of Krohnkite, Bismuth, Polonium, Karousel, KZones, PlasmaZones and the forums; the report
was not kept, its findings are here). Ranked: works after Plasma upgrades with a visible
maintainer (Bismuth died of that; Polonium nearly); auto-tiling on Wayland; multi-monitor right;
one-click install, no re-login, no duplicate instances; defaults with no clashes and a key table;
misbehaving windows handled (games, mpv, Electron, 1x1 helpers) with a "window X won't tile" FAQ;
changelog, troubleshooting, a supported-Plasma line. kwin-i3 is ahead on multi-monitor, clash
handling, live Apply and the Window Rules page; behind on: (a) the install (store users get the
script alone: title bars, no drag; the plugins need a per-KWin-version build); (b) a user README
(screenshot, FAQ, supported versions, uninstall), with item 4's README pass; (c) activities (item
5); (d) the scratchpad, i3's most-asked missing feature (Bismuth #412; `plan.md` leaves it out):
a foundation question, cheap on floating
plus a hidden workspace, i3's `src/scratchpad.c` first. Our niche's only other entry: krohnkite-i3 (4 stars, no
releases). For the beta, (a) is a build from source on each user's machine (a package, COPR/AUR
as PlasmaZones ships, waits for a release): a KWin update breaks the plugins until `make plugin
plugin-install` runs again, often on CachyOS, so the README says so, and the settings page's banner
says the plugins are missing. (a) done in item 4's README pass (2026-10-30: per-distribution packages, rebuild after a Plasma
update); of (b), supported versions and removal done. Next, toward a release: (b)'s screenshot and a
"window X won't tile" FAQ, written from the beta's questions; (d) asked as a foundation change
if a user asks for it.

**Not decided: a release** and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle): not settled; not an item until it is decided. The beta
(`OPEN.md`) comes first: the repo public, unannounced, its users on the `stable` branch.

## i3 parity

**105. Plasma's window actions not yet covered on a window in the tree** (from `plan.md`, "Plasma's
window actions"). KWin's window rules, No Border and shade on a window kwin-i3 places: none has
a row saying what kwin-i3 does. Next: for each, i3's handling of the matching request
(`handlers.c:675-991`) and a row by `plan.md`'s rule. Waits: the Stage; no user has met one.

## Upstream

**kwriteconfig6 --notify loses its signal** (found 2026-10-29, OPEN.md item 50): it sends KConfig's
`ConfigChanged` with a fire-and-forget `QDBusConnection::send` (`kconfig.cpp`, `notifyClients`)
and exits; on the slower laptop 4 writes in 30 reached the file but never the bus. A KConfig bug
report (flush before exit). The tests send the signal with gdbus instead (`tests/live/lib.sh`,
`set_layouts`).

**Firefox's screen share names no parent window** (found 2026-10-30, `OPEN.md` item 62's capture):
the portal's picker came up a plain Normal window, not transient (KWin makes a Wayland window
transient only from `set_parent` or the portal's `parent_window` through xdg-foreign,
`xdgshellwindow.cpp:1165`), so it isn't attached to Firefox on any compositor. kwin-i3 floats the
portal's dialogs by a default rule (`behaviour.md` §3); a Mozilla bug report, once Firefox's
source confirms it passes `""`.

**A full-screen effect's end turns Show Desktop off** (found 2026-10-30, `OPEN.md` item 53, probe
99): `EffectsHandler::setActiveFullScreenEffect` calls `setShowingDesktop(false)` when an effect
starts and when it ends (`effecthandler.cpp:451`), so Show Desktop turned on during a desktop
switch's Slide is undone when the slide finishes, and the hidden window activated. Ending it when
an effect starts makes sense (Overview); when one ends, a KWin bug report.
