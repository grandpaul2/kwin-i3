# LATER — work held until the Stage ends

The Stage (`OPEN.md`) is development, then the beta: a few early users run
kwin-i3 daily and it is adjusted as they go. Reliability work, release prep and anything upstream
wait here (upstream reports wait for more experience with Plasma), unless one informs a structural
change or a larger issue turns up. Rules:

- An item lives in **one** file: it moves to `OPEN.md` when the maintainer brings it back, and comes out of
  here then. Numbers are shared with `OPEN.md` (the next free one, never reused).
- Like `OPEN.md`, state, not history: rewrite an item as it changes.
- New finds that can wait for the end of the Stage go here, with what would be done and why it waits.

A beta user's bug brings the matching item back (27, 45, 60 and 5's activities are the likeliest).
When the Stage ends, 5 first.

## Reliability

**90. Plasma's window effects read against the hold, not yet seen** (2026-11-03). Reading
6.7.5's window animations against `kwini3hold` finds these possible, none confirmed or seen:
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
output). Next: a test-KWin trace of that press with `pointer-map events`. Waits: the Stage, nothing seen live.

**36. The test depth held back during the Stage** (`docs/testing.md` is lean until
the Stage ends). Then, each in runs of 5
minutes or less (never one long run): the fault battery (`make mutate-live`, `make mutate`) and
faults for each scenario added meanwhile (`KI3_SCENARIO=NN-name.sh`); the fuzz campaign. Open
there: 86-tiling-drag's 59 faults in `tests/live/mutate.py`, 23 of them never run, one ("the helper
not turned on at a reconfigure") with a from-text that ends mid-line, and the survivors of the rest
not sorted (a check to add, code to remove, or not visible in the test KWin). Many faults'
from-texts no longer match the code (66 of 146 in `tests/live/mutate.py`, 8 of 20 in
`tests/unit/mutate.py`: the centre swap, the drop outline, Meta+Shift, the monitor code in the
model): rewrite them from the code before the run.

**5. Wider reliability.** Fuzz configurations for one and three monitors, mixed scaling, more than
one activity, and with no plugins (the fuzzer knows only two 1280x720 outputs at scale 1, unplugs
only Virtual-1, and loads the plugins whenever they are built); Plasma 6.8 when it lands. Rare and
deliberate, as the fuzzer is now. **Activities are unhandled today**: nothing in the code checks a window's activity
(`docs/behaviour.md` §3); KWin's tiles are per monitor and desktop, not per activity, so a window on another
activity likely takes a tile on its desktop and leaves a hole there. Next: a read-only check that
kactivitymanagerd can run on a test KWin's bus, then that hole confirmed or not (if activities
can't run there, they are won't-fix here, with the reason), then a spec for the harness
pieces (`KI3_OUTPUTS`, a scale per output, `run.py --no-plugins`, the invariants' two-output
assumptions), then one campaign per configuration.
Also missing from the fuzzer: a workspace of Plasma windows and `frameOnFloating` (settings, so a
per-seed configuration, with the ones above).

**27. Keep Above and Keep Below on floating windows**. kwin-i3 owns Keep
Above on floating windows (the plain script's way to keep them over tiled ones), so a user can't
turn it off there, and Keep Below is overwritten. Next: whether the plugins' path (the effect's
floating set) can leave both flags to the user, and the plain script document it.

## The settings page

**22. The settings page, finished for a release** (the page is fine for the beta, whose users
are on US layouts). Left: Defaults then Apply on a non-US layout writes the US keys until the
next layout change or load: the page should call the helper's `FitKeys` after Apply, as i3's
`bindsym` follows the keymap at once. Its accessibility
check is item 18.

**70. Workspace outputs for a fixed layout across monitors** (2026-10-31). A monitor that drops out for a moment (a hotplug, a sleep, a cable) sends its
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

**18. A standing accessibility check of the settings page** (held: light tests during the
Stage). `tests/live/75-settings-a11y.sh` (in git history) audited every page through `tools/a11y.py`: names, no
duplicates, no empty headings, Tab order. Bring it back as `make a11y`, run when the page changes
rather than in `make test`.

## Release prep

**60. Docking checks on real laptop hardware, one session toward release** (two monitors on a
desktop test most of it). On a laptop running Plasma 6.8
with an external monitor, each noted works / snag, Meta+Shift+B at any fault: docking and
undocking with windows open (i3 `randr.c`: an output's workspaces move to one that remains, and
return to it; kwin-i3 `behaviour.md` §4, scenarios 42-48; real hardware timing against KWin's
`PlacementTracker`); the lid closed and opened with the monitor attached; the wallpaper flash on
AMD (seen on NVIDIA: if never on AMD, it points at NVIDIA). On Plasma 6.8 by
then, which is where it matters for a release.

**28. Launch workspace, a maybe** (2026-10-26). i3 puts a window on the workspace it was launched from only when i3 started the program
itself (`exec`, or dmenu run by it), the window carries the matching `_NET_STARTUP_ID`, and the
launch finished less than 30 s ago (`startup.c` 4.24). kwin-i3 puts it on the workspace current
when the window appears. That is useful too (start a game from its launcher, then go to the
workspace it should open on), and i3 does the same there: the game's window comes from its
launcher's Java process, which i3 didn't start, and GLFW sets no startup id. The difference is only an app started
straight from the launcher, then a switch before its window shows. Documented as a divergence
(`docs/plan.md`, "Scope"; README, "Keys"). Next, if a user asks for it: whether KWin 6.7.5 gives a
script the window's xdg-activation token (Wayland) or startup id (Xwayland) and the launch's
moment; if not, a plugin hook in KWin's activation, or won't-fix. First case: kwin-i3's own
Terminal key (`behaviour.md` K18), the one program it starts itself, as i3 starts its terminal
with startup notification on (`exec i3-sensible-terminal`; the launcher is `--no-startup-id`).

**51. What users of other KWin tilers expect** ((b)'s rest waits for a release; from the other
KWin tilers' issue trackers and the forums). Ranked: works after Plasma upgrades with a visible
maintainer; auto-tiling on Wayland; multi-monitor right;
one-click install, no re-login, no duplicate instances; defaults with no clashes and a key table;
misbehaving windows handled (games, mpv, Electron, 1x1 helpers) with a "window X won't tile" FAQ;
changelog, troubleshooting, a supported-Plasma line. kwin-i3 is ahead on multi-monitor, clash
handling, live Apply and the Window Rules page; behind on: (a) the install (store users get the
script alone: title bars, no drag; the plugins need a per-KWin-version build); (b) a user README
(screenshot, FAQ, supported versions, uninstall); (c) activities (item
5); (d) the scratchpad, i3's most-asked missing feature (`plan.md` leaves it out):
a foundation question, cheap on floating
plus a hidden workspace, i3's `src/scratchpad.c` first. For the beta, (a) is a build from source on each user's machine (a package, COPR/AUR
as PlasmaZones ships, waits for a release): a KWin update breaks the plugins until `make plugin
plugin-install` runs again, often on CachyOS, so the README says so, and the settings page's banner
says the plugins are missing. The README has (a)'s per-distribution packages and the rebuild after a Plasma
update, and (b)'s supported versions and removal. Next, toward a release: (b)'s screenshot and a
"window X won't tile" FAQ, written from the beta's questions; (d) asked as a foundation change
if a user asks for it.

**Not decided: a release** and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle): not settled; not an item until it is decided. The beta
(`OPEN.md`) comes first: the repo public, unannounced, its users on the `stable` branch.
When it is decided, the repo starts a fresh history at it (built and audited once as a dry run):
(1) the old history, every branch and tag, mirrored into a private archive; (2) the release
commit on main as any other: the version, a CHANGELOG entry telling users to clone again (the
path stays `~/kwin-i3`, so `make install` is all that follows; `git pull` in an old clone stops
at "unrelated histories" and changes nothing), README's tags line from that version on;
(3) a new repository from main's tree (`git archive`), one commit, `main` and `stable` on it, the
release tagged there; (4) checked before it goes out: the publish audit with `--history` at 0,
`make build` reproducing the committed `main.js`, `make unit` green; (5) `main` and `stable`
force-pushed, the old tags and the probe branches deleted from origin, the tag pushed, the
release notes the CHANGELOG entry; (6) every checkout and worktree cloned again. The one
force-push of `stable` is this; `docs/testing.md`'s rule holds after it.

## i3 parity

**105. Plasma's window actions not yet covered on a window in the tree** (from `plan.md`, "Plasma's
window actions"). KWin's window rules, No Border and shade on a window kwin-i3 places: none has
a row saying what kwin-i3 does. Next: for each, i3's handling of the matching request
(`handlers.c:675-991`) and a row by `plan.md`'s rule. Waits: the Stage; no user has met one.

## Upstream

**kwriteconfig6 --notify loses its signal**: it sends KConfig's
`ConfigChanged` with a fire-and-forget `QDBusConnection::send` (`kconfig.cpp`, `notifyClients`)
and exits; on a slower machine 4 writes in 30 reached the file but never the bus. A KConfig bug
report (flush before exit). The tests send the signal with gdbus instead (`tests/live/lib.sh`,
`set_layouts`).

**Firefox's screen share names no parent window** (from a capture):
the portal's picker came up a plain Normal window, not transient (KWin makes a Wayland window
transient only from `set_parent` or the portal's `parent_window` through xdg-foreign,
`xdgshellwindow.cpp:1165`), so it isn't attached to Firefox on any compositor. kwin-i3 floats the
portal's dialogs by a default rule (`behaviour.md` §3); a Mozilla bug report, once Firefox's
source confirms it passes `""`.

**A full-screen effect's end turns Show Desktop off** (probed):
`EffectsHandler::setActiveFullScreenEffect` calls `setShowingDesktop(false)` when an effect
starts and when it ends (`effecthandler.cpp:451`), so Show Desktop turned on during a desktop
switch's Slide is undone when the slide finishes, and the hidden window activated. Ending it when
an effect starts makes sense (Overview); when one ends, a KWin bug report.
