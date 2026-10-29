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
Not yet decided: a test-KWin option for one output and a scale (the suite has only two 1280x720
outputs at scale 1, `tools/testkwin.sh:178`), to run a few scenarios at the laptop's HiDPI. Worked over ssh from here (one repo, one
`OPEN.md`); the laptop's live session under the same "nothing goes live without Paul's go".
Next: Paul at the laptop for the first session: ssh access from the desktop, and the ALA snapshot
date.