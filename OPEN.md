# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, fourteenth session** (no code change: the survey of other tilers,
LATER.md item 51; item 50, the laptop plan; before that, item 49, the settings page's words and the
Window Rules layout, live; main's `package/` and plugins are what KWin runs).

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
what was learned, and how to work with it on the desktop. Worked over ssh from here (one repo, one
`OPEN.md`); the laptop's live session under the same "nothing goes live without Paul's go".
Next: Paul at the laptop for the first session: ssh access from the desktop, and the ALA snapshot
date.