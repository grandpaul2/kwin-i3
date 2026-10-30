# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-29, nineteenth session** (item 57 closed: every panel setting probed
with plasmashell in the test KWin is followed; Plasma's one lag, a floating panel switched to
auto-hide, kept as a note in `behaviour.md` Y1 and a README line, Paul's call). Both machines run
what main holds (the session changed docs only).

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work, release prep and anything upstream wait in **`LATER.md`** (Paul, 2026-10-25),
with the settings page's finishing; it is added to as we go.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope"; the audience and the lines drawn: `docs/philosophy.md`. When the Stage ends: `LATER.md`, in the order its header suggests.

## Open

Work for now.

**50. Paul's Arch laptop as the second machine, then the 6.8 test bed** (Paul, 2026-10-28,
fourteenth session). No release before Plasma 6.8 (out 2026-10-14, Wayland only) has been lived
through: Fedora 44 gets it only after Fedora 45's release; Arch already has it (6.8.0 in Extra
2026-10-15). Stages: (a) Plasma 6.7 on the laptop (Arch + i3, X11 today; i3 stays as the fallback
session) from an Arch Linux Archive snapshot dated before 2026-10-15, the whole system at one date
(no partial downgrade); kwin-i3 installed by following the README as a stranger would, every snag
noted for the release road; what a laptop adds: one internal output, docking, HiDPI, lid and
suspend, touchpad gestures, Intel/AMD graphics (is the wallpaper flash NVIDIA's?), Arch's package
names for the plugin build (headers in `kwin`, no `kwin-devel`). (b) Once it runs well there, the
mirrorlist back to current and `pacman -Syu` to 6.8: the laptop becomes the test bed for changes
(a few missing system apps are fine; 6.8 brings Plasma Login Manager in place of SDDM). (c) Regroup:
what was learned, and how to work with it on the desktop.
**The cross-system check** (Paul, 2026-10-29: the same suite on a second machine, not a bigger
one; i3 too runs one suite everywhere, `testcases/complete-run.pl` under Xephyr): `make plugin`
and one `make test` on the laptop at the end of (a), and again after the 6.8 update in (b); a
scenario red there and green on the desktop is a finding (Arch's build in (a), 6.8 in (b)).
**By hand on the laptop**, what the headless KWin can't reach, each noted as works / snag: the
lid, suspend and resume, the internal screen (frame 1 px, gaps, the margins' focus), touchpad
scrolling and gestures (Overview, desktop switch) beside kwin-i3's keys, and the workspace widget
on the laptop's panel. The checks that need an external monitor on the laptop (docking, the lid
with a monitor) and the wallpaper flash on AMD moved to `LATER.md` item 60 (Paul, 2026-10-29: a
tedious desk setup, one session toward release; his two monitors cover the rest).
**HiDPI in the test KWin** (Paul's go, 2026-10-29): `KI3_OUTPUTS` and `KI3_SCALE`
(`tools/testkwin.sh`); 10-tiling, 26-gaps, 54-frame and 85-tiled-look green at `KI3_SCALE=2`
the same day. The laptop adds no HiDPI: its panel is 1366x768 at scale 1 (read 2026-10-29), so
fractional scales stay untested on real hardware. Worked over ssh from here (one repo, one
`OPEN.md`); the laptop's live session under the same "nothing goes live without Paul's go".
**Done 2026-10-29**: the laptop (`pauls-laptop`, Tailscale; HP, AMD Radeon Vega, 2 cores, 17 GB)
on Plasma 6.7.5 Wayland from the 2026-10-14 snapshot (pinned; later pacman runs need
`--disable-download-timeout`), SDDM offering Plasma and i3; the clone, `make plugin`, `make kcm`
and the suite there, in four runs under 5 minutes (`run.sh` on two cores: ~11 minutes in all).
Fixed from it: the plugins' and settings page's ECM version (Qt 5's cmake files made ECM pick
Qt 5); KWin's unnamed `""` layout counted as US (a false notice where the system sets none);
Arch's AT-SPI paths; the test KWin given a Plasma session's variables (over ssh Qt loaded no
KDE platform theme: other fonts and style, a 36 px title bar, spin boxes that took no typing).
Release-road snags so far, for the README: the repo is private; its package names are Fedora's
(`kwin` holds the headers on Arch, `libei`, `python-dbus`, `nodejs`); missing from its list:
`vulkan-headers` (KWin's cmake config) and `python-xlib` (the tests); a failed configure leaves
`plugin/build` caching Qt 5 (delete it); `run.sh` alone doesn't build `tools/bin/ei-send`; the
install (2026-10-29): `~/.local/share/kwin/scripts` doesn't exist on a fresh account (`mkdir -p`
first); `make take-keys` needs kwin-i3 loaded, so the log-out of step 1 comes before step 2;
`plugin-install`'s first run also prints "KWin did not load the effect … another KWin version?",
which reads as an error; a fresh panel with one desktop has no pager to right-click for the
widget (*Add or Manage Widgets* has it); `tools/capture` needs `kdialog` (not in Arch's Plasma);
Picture-in-Picture tiles (only Paul's own `floatingTitle` floats it).
Also fixed: the test terminals read the user's own alacritty config (the laptop's cursor colour
sat on 78's corner pixels); 59's arc pixel is the GPU's antialiasing (NVIDIA 55,48,48, AMD
68,33,33), judged as 78 judges it. 53-hold's two laptop findings fixed 2026-10-29 (6dd3a82: a
new window stays hidden until it lands; a kept closing window grabbed from Scale), 53 green on
both machines; installed live the same day. The suite once more on the laptop, 2026-10-29: 58 of
60 green; 39 and 69 red, both from `kwriteconfig6 --notify` losing its signal on the slower
machine (4 in 30; the tests now send it with gdbus, `lib.sh` `set_layouts`; upstream note in
`LATER.md`), green on both machines after. Stage (a)'s live install, 2026-10-29, Paul at the
laptop: the script, plugins, settings page and widget by the README, `make take-keys` (21 keys);
works: tiling and the frame, popups, the widget, touchpad scrolling and Overview, lid, suspend.
Found: (1) Meta+N with KWin's Slide left the incoming windows' frames at their final places:
fixed the same day (the effect's chain position, after Slide). (3) **Frames "not following the mouse"**: Paul's
capture 2026-10-29 16:09, the laptop is click to focus, so the focus (and the frame) moves only
on a click; correct, and item 52's question. (4) Frames seen **flashing** once, not seen since: dropped (Paul, 2026-10-29; a capture at the
moment reopens it). A small flash as Firefox closes is the hold's accepted trade (200 ms, Paul's decision), not
carried. Konsole's "New Tab / Split View" bar is Konsole's own toolbar (☰ > Show Toolbar). Then the laptop set
to `plan.md` (e)'s list as a user following the install would (2026-10-29): focus follows mouse
(mouse precedence, no delay), per-output desktops, animations off and Scale off; the keys taken earlier. Stage (a) is done.
**Stage (b), 2026-10-29**: the laptop on Plasma 6.8.2 (KWin 6.8.2, Qt 6.12; `pacman -Syu` from
current mirrors, the pinned list kept as `/etc/pacman.d/mirrorlist.pin-20261014`). Plasma Login
Manager is installed but not enabled: SDDM stays until PLM has been seen to reach a desktop (Arch
enables no service on install). 6.8 findings, all fixed (main 8dec0da): kwini3hold's paint hooks
return bool in 6.8 (it didn't compile); ScreenShot2 sends RGBX8888 (`shot.py` refused it: 11 of
13 reds); `GLShader::setUniform(QColor)` premultiplies (the drop indicator at a quarter). The
suite then: green but 86 and 53, item 61. Next: Paul signs in, `make plugin-install` and
`make kcm-install` there (his go, 2026-10-29), his use with Meta+Shift+B; then switching SDDM to
Plasma Login Manager, with his go.

**53. An activation of unknown origin ends Show Desktop just after a load** (reopened 2026-10-29,
`docs/records/bug-panel-config.md`, "Left over"; Paul: dive until solved). Within about a second of a
kwin-i3 load, KWin activates the tile Show Desktop hides, which ends Show Desktop; no kwin-i3 pass
or JavaScript caller is behind it (the 2026-10-25 trace), and the helper's pointer log shows
nothing. With the plugins, 74's case 1 fell in it (red in both builds, green after a 3 s settle);
74 now waits 3 s, labelled for this item. Next: trace where the activation comes from (KWin's
source for activations with no script caller, then a test-KWin trace of `windowActivated` with
its stack), then the cause, a fix, and 74's wait removed.

**54. From the audit of Plasma's special states** (an agent, 2026-10-29, read from KWin 6.7.5's
source; fixed the same day: the helper's hit tests skip windows on another activity, and the hold
leaves out windows Show Desktop hides). Left, each with its next action: (a) the window menu's
**No Border** and **Keep Above** aren't watched (`src/kwin.js` has no `noBorderChanged` /
`keepAboveChanged`): "No Border" off on a tile brings its title bar back and drops the frame until
a reclassify; next, a test-KWin probe, then listening to both and scheduling a pass. (b) **Focus
follows mouse under Show Desktop**, two outputs: `windowUnder` (`kwin.js:2156`) counts a hidden
tile, so the early return at `:2146` leaves the focus behind on an output crossing; next, a probe.
(c) **Meta+right-click in Overview** may resize a tile beneath (`TilingDrag` filters before
`Effects`, `tilingdrag.cpp:71`); very low risk; next, a probe. Not read: fullscreen Kickoff's
window type and the display settings' "keep these settings?" dialog (sources not found).

**55. A tile can keep its title bar after floating and tiling again** (2026-10-29, one red of
54-frame's "and loses it again" in a batch of six scenarios; green alone on both builds and in
the same batch on main's). Hypothesis: `takeBorder` (`src/kwin.js:1179`) takes a border only from
a window whose frame and client sizes differ (`serverDecorated`); a window just given its title
bar back, then tiled again, can read frame = client until its app commits, and a pass in that
moment skips it with no later pass to retry. Next: a probe of the float-then-tile toggle under
load, logging frame and client at each pass; then the cause, a fix, and 54 under load.

**56. kwin-i3's notifications never reach Plasma** (found 2026-10-29; Paul: not urgent, decide
once the setup is hardened). The load report (`behaviour.md` §13: taken keys, layouts, per-output
desktops, missing plugins) is sent with `callDBus(... "Notify", "kwin-i3", 0, ..., [], {}, -1)`;
KWin's callDBus converts by `QJSValue::toVariant()` (`scripting.cpp:345`), so Plasma receives
`sisssava{sv}i` for `susssasa{sv}i` and refuses it ("no slot matched": the laptop 2026-10-29
16:48:53, the desktop 2026-10-28 05:10:30). JavaScript can't make an unsigned int or a typed array
here. The tests missed it: `tools/fakenotify.py` declares the signature but dbus-python doesn't
enforce it (a strict version, `message_keyword` and a signature check, refused it in a probe).
Routes probed: the desktop portal (`AddNotification`, `sa{sv}`) refuses KWin ("Unable to open
/proc/<kwin>/root"); a QML (declarative) script's KNotification sends it correctly, with a
`kwin-i3.notifyrc` of ours showing as "kwin-i3" (test KWin, strict stand-in), but a JS script
can't hand a QML one the report. Options: (1) kwin-i3 as a QML script hosting `main.js`, with the
globals mapped (`Workspace`, `DBusCall`, `ShortcutHandler`, `Timer`): no plugins, a spike first;
(2) the helper sends it (plugins only), an OSD line (`osdService.showText`) without them. Waiting
on it: the focus note (`plan.md` (e)'s load-notification place; once per install, Paul
2026-10-29, built then reverted with this item, wording in git `5c32a73`), and the strict stand-in.

**59. "Sizes did not settle after 4 passes"** (Paul's demo capture 2026-10-29 19:34, ten times on
one workspace after drags left one-window splits; the windows still landed right). i3 has no such
step (`render.c` sets each child's rect once); kwin-i3 goes through KWin's tiles, where one tile's
edge moves its neighbours', so `setSizesStable` repeats up to four passes. Probe 95 (branch
`probe-settle`, six runs: his trees, Firefox's minimum, plugins, FFM, 2560x1440, default gaps)
never reproduced it; left untried: Plasma's panel strut and real apps. Live since 2026-10-29
(0d9d87c): the warning names each tile still moving, the rect asked and the one KWin kept. Next:
when it shows in a capture or a Dump State, read those rects and name the cause.

**61. Two intermittent reds on KWin 6.8** (the laptop, 2026-10-29). (a) **86-tiling-drag**: red
twice right after a plugin rebuild (21 and ~25 checks; in one, window a was gone from kwin-i3's
tree after the swap drag, `V[H[b] c*]` for `V[H[a b] c*]`), then green seven runs in a row, alone
and beside 64; green on 6.7 on both machines. (b) **53-hold** "after: c has landed there": c (a
0.8 s client) still black 1.2 s after the move, once; green alone after. Both reds' logs were
lost with the test's temporary dir; since 8195ea5 `run.sh` keeps a red scenario's output and
kwin-i3's log in `tests/live/out/`. Next: when either is red again, read the kept log (for 86,
what removed a from the tree) and name the cause; Paul's live use of 6.8 is the other watch.
