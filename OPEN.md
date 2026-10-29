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

**34. Test speed, the rest of the study** (2026-10-25; the study's report was not kept, its
findings are here). Done: per-scenario timings in `run.sh`, many pixels per probe (78: 64 s to 29 s).
First timings: batch 46 s, alone tail 176 s, total 222 s. (a) done 2026-10-27: 72, 73, 74 run in
the batch, testkwin.sh finding each Xwayland's display under a lock; 71 stays alone for its 1 s
focus checks (the five green together; ~36 s off the alone tail). Left: (b) the alone scenarios
without millisecond timings (37, 57, 58, 59, 76, 78) two or three at a time (~30-60 s; five
repeat runs first, ~20 min); held until a few sessions' `make test` show the flake fixes below
holding, as it puts the screenshot scenarios back under load. (c) dropped: the fixed sleeps in
78 and 58 add up to ~11 s, a few seconds to gain for new races. Next: (b), when the flakes have
stayed away for a few sessions.

**Done 2026-10-27** (Paul's go): (e) `make mutate-live` with `KI3_ONLY` baselines only its faults'
scenarios; (d) the flakes, by causes read from the code (no failing run's log was kept, so not
proven): 39 and 69 waited 5 s for a layout change to reach the keyboard daemon and the helper
(now 20 s); 57's screenshot had to land inside a 400 ms hold (now 2 s, and polls in place of its
sleeps); 70 and 80 expected nothing after the press, which `capture-read` prints by design (now:
the press is there and the timeline in time order). All five green alone after the change.
**Watched**: if one of these fails again in a full run, it moves alone (`# timing: alone`)
rather than another guess. 69 did (2026-10-28: "the helper fitted French" red in the batch, 48/48
alone), so it now runs alone (~29 s on the alone tail; green in its first full `make test` that way,
2026-10-28, eighth session: 60/60, 213 s; ninth session: 57/60, the three red (30, 70, 73)
stale expectations from stages 3 and 9, fixed in `1801897`, so 70's red was no flake; tenth
session: 60/60, 222 s; eleventh: green, 228 s; twelfth: not run, the changes covered by their scenarios; thirteenth: 59/60, 231 s, 25 red as a stale expectation from refinement stage 5's floating order, fixed; fifteenth: 60/60, 225 s); 39, 57, 70, 80 still watched. 53-hold's `--notify` kill switch: closed unless it comes back.

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