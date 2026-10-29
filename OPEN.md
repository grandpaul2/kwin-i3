# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-29, fifteenth session** (all live: G5's float without KWin's tile
outlines; `holdTimeoutMs` 200; the i3 help buttons, closing items 47 and 49; title bars' gap room;
focus follows the mouse past a margin's raise; i3's gap rules. Items 34 and 41 closed; the four
captures handled. Main's `package/` and plugins are what KWin runs).

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
undocking (windows home again, as on a replug), the internal screen at its HiDPI scale (frame
1 px, gaps, the margins' focus), touchpad scrolling and gestures (Overview, desktop switch) beside
kwin-i3's keys, the wallpaper flash on Intel/AMD, and the workspace widget on the laptop's panel.
**HiDPI in the test KWin** (Paul's go, 2026-10-29): `KI3_OUTPUTS` and `KI3_SCALE`
(`tools/testkwin.sh`); 10-tiling, 26-gaps, 54-frame and 85-tiled-look green at `KI3_SCALE=2`
the same day. On the laptop, those four again at its own scale (1.5 is the likely one, and
fractional rounding is where a 1 px frame could break) with `KI3_OUTPUTS=1`. Worked over ssh from here (one repo, one
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
68,33,33), judged as 78 judges it. Next: **53-hold**, the one red left on the laptop, shows two
behaviours a slower machine reveals (screenshots 2026-10-29): (1) a slow new window (c, 0.8 s
to redraw) is on screen at KWin's centre placement, floating, title bar and shadow, before
kwin-i3 tiles it (its shadow is the 224 red); (2) a closing window is drawn by KWin's close
animation (Scale: shrunk, darkened, 0,160,0) instead of held as it was while its neighbour
grows. On the desktop the captures fall early enough to pass; neither is proven absent there.
Both are the atomic-layout effect's business (`docs/spec-atomic-layout.md`): the cause, i3's
view (i3 has no animations; a new window appears tiled), then a proposal for Paul. Then the rest of the suite once more, the HiDPI four, and stage (a)'s live install
with Paul at the laptop (the by-hand list above).
