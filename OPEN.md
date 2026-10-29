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

**47. The refinement pass** (Paul, 2026-10-28, eleventh session): the redo's method again. The
foundations rewritten from four agents' review and a second round (531b86b, a3951fb; Paul's role
lightened: `philosophy.md`, "How a decision is made"; i3 means 4.24, `plan.md`); the code read
against them (46 findings) and brought into line by `docs/spec-refine-build.md`'s seven stages,
**all live 2026-10-28** (outputs in i3's order and directions, the effect following the tree, the
words and settings, kinds, the tree, a close mid-drag, the letter keys by position, floating
windows behind fullscreen); no "Being fixed" left in `behaviour.md`. Left: (a) stage 3's i3-directive
help beside each control, **held**: wrapping a form control moves its label off it and 37's keyboard
path fails; a design and one diagnostic run of 37 (Paul's go) first. (b) Float to tile: done
2026-10-28, twelfth session (b2fa04d, §9 G13; Paul: "works well"). (c) Stages 1-7: done (Paul,
2026-10-28, twelfth session). Next: (a) when Paul wants it.

**49. The settings page's words** (Paul, 2026-10-28, thirteenth session, from `LATER.md` item 22:
"friendly, cohesive and still descriptive"; less wordy). `docs/spec-settings-words.md`: steps 1-5
(inventory, glossary, tone rules, every page's new words, the Window Rules layout with an
application chooser) done and live (a211562, b0f222d, 9792a13, 9648229; `make kcm-install`).
Left: the help buttons naming i3's directives, with item 47 (a). Next: with 47 (a), when Paul
wants it.

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