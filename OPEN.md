# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twenty-first session** (closed: 50, the laptop as test bed,
`docs/records/laptop-test-bed.md`; 54, (c) can't happen, `docs/kwin-notes.md`; 59, its facts in
`docs/kwin-notes.md` "Tiles"; 61 and 56 to `LATER.md`). The desktop runs main (4158084's script,
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

Work for now.

**63. A frame side missing at the output's edge: a tile pinned to the border** (the fuzzer's I11,
2026-10-30). The first fix (4158084, live) was half of it: the first campaign's seed 1 found the
window short again after a focus change, as `edgesIntact` rebuilt a pinned tree on every pass and
KWin's request for the short rect lands after the pass (`docs/kwin-notes.md`). Completed on branch
`fuzz-run`: seed 1's 50 steps, the 9-step trace with focus changes and with a swap (the refit seen
once a window), 26, 54, 58, 85 green. Next: Paul's go to merge and reload.
