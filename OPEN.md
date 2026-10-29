# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-29, seventeenth session** (a housekeeping session: tests are tools, not debts, so none is listed as owed; before it, the sixteenth: item 50 stage (a) begun: the laptop on
Plasma 6.7.5, the suite run there and its differences fixed; the test KWin's HiDPI option. Main's
`package/` differs from what KWin runs only by 0a1e1c0's `""`-layout fix, which changes nothing on
Paul's desktop (its layout is `us`): it loads at his next login or reload, no reload needed.

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
lid closed and opened (with and without an external monitor), suspend and resume, docking and
undocking (windows home again, as on a replug), the internal screen (frame
1 px, gaps, the margins' focus), touchpad scrolling and gestures (Overview, desktop switch) beside
kwin-i3's keys, the wallpaper flash on Intel/AMD, and the workspace widget on the laptop's panel.
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
`plugin/build` caching Qt 5 (delete it); `run.sh` alone doesn't build `tools/bin/ei-send`.
Also fixed: the test terminals read the user's own alacritty config (the laptop's cursor colour
sat on 78's corner pixels); 59's arc pixel is the GPU's antialiasing (NVIDIA 55,48,48, AMD
68,33,33), judged as 78 judges it. 53-hold's two laptop findings fixed 2026-10-29 (6dd3a82: a
new window stays hidden until it lands; a kept closing window grabbed from Scale), 53 green on
both machines; installed live the same day. The suite once more on the laptop, 2026-10-29: 58 of
60 green; 39 and 69 red, both from `kwriteconfig6 --notify` losing its signal on the slower
machine (4 in 30; the tests now send it with gdbus, `lib.sh` `set_layouts`; upstream note in
`LATER.md`), green on both machines after. Next: stage (a)'s live install with
Paul at the laptop (the by-hand list above).

**52. Panel popups on a fresh install: the popup grace's premise** (Paul, 2026-10-29, at the
laptop before kwin-i3 was loaded). On a fresh Plasma 6.7.5 a panel popup never closes when the
pointer leaves it, however long: only a click elsewhere closes it. We had assumed Plasma kept
popups up through KWin's focus delay, and built the popup grace (`kwini3helper`,
`docs/spec-popup-grace.md`, 1.5 s while a popup has the focus) on that. The laptop's kwinrc has no
`[Windows]` group, so it runs Plasma's default, click to focus: no pointer crossing moves the focus
there, and the popup has nothing to lose it to. The closing the grace fixes comes only with focus
follows mouse (i3's default, `focus_follows_mouse yes`; the desktop's setting), which kwin-i3
doesn't set. Next: once kwin-i3 is loaded on the laptop, the same popup under click to focus, then
under focus follows mouse with and without the helper; then whether the spec's cause, the README's
helper row and `behaviour.md` §9 describe it right, and a proposal for Paul.

**53. An activation of unknown origin ends Show Desktop just after a load** (reopened 2026-10-29,
`docs/bug-panel-config.md`, "Left over"; Paul: dive until solved). Within about a second of a
kwin-i3 load, KWin activates the tile Show Desktop hides, which ends Show Desktop; no kwin-i3 pass
or JavaScript caller is behind it (the 2026-10-25 trace), and the helper's pointer log shows
nothing. With the plugins, 74's case 1 fell in it (red in both builds, green after a 3 s settle);
74 now waits 3 s, labelled for this item. Next: trace where the activation comes from (KWin's
source for activations with no script caller, then a test-KWin trace of `windowActivated` with
its stack), then the cause, a fix, and 74's wait removed.
