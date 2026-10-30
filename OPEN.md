# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twenty-first session** (closed: 50, the laptop as test bed,
`docs/records/laptop-test-bed.md`; 54, (c) can't happen, `docs/kwin-notes.md`; 59, its facts in
`docs/kwin-notes.md` "Tiles"; 61 and 56 to `LATER.md`). The desktop runs main (ad7344a's script,
2026-10-30, the fix for 63); the laptop runs 886732b's. The rulebook is `AGENTS.md` since a3d21a2, `CLAUDE.md` imports it.

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

Work for now. (63, a frame side missing at the output's edge, fixed live in ad7344a:
`docs/kwin-notes.md`.)

**64. A GTK 4 window 26 px short after a desktop removed or moved** (fuzzer campaign 2, seed 11,
I10, 2026-10-30). The model's rebuild (`startRebuild`) emptied `borderGone`, the bounds a GTK 4
window keeps within after its title bar is taken, though the windows and their taken borders
outlive it: the next tile taller than those bounds left it short for good. Fixed on branch
`fuzz-run` (the bounds kept, as `tookBorder` is); seed 11 green (the bounds asked again), 65, 66,
85 green. Next: Paul's go to merge and reload.
