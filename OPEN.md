# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twenty-first session** (closed: 50, the laptop as test bed,
`docs/records/laptop-test-bed.md`; 54, (c) can't happen, `docs/kwin-notes.md`; 59, its facts in
`docs/kwin-notes.md` "Tiles"; 61 and 56 to `LATER.md`). Both machines run main (886732b's script;
later commits docs only). The rulebook is `AGENTS.md` since a3d21a2, `CLAUDE.md` imports it.

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
2026-10-30, seed 1 at 60 s, red on every replay). In `V[w7r w12 H[w10 w11 Konsole]]` w10 and w11
end 2 px above the output's bottom, Konsole 1 px: a 1 px line under them with no frame (the
wallpaper, live). i3 has none (its borders sit inside integer rects, `render.c`). Probed: the root
is inset by the hair (bottom 0.9999982) and Konsole's tile ends there, w10's and w11's at exactly
1.0, so KWin's `Tile::windowGeometry` (and `windowRect`) give that side the full padding, 2 px, not
half. It is the pinning `edgesIntact` mends (`CustomTile::setRelativeGeometry` forcing a changed
edge to the border), but it happens inside the pass, after that check at its start, and no pass
follows. The run (trace, log, dump) is kept in Paul's checkout, `tests/fuzz/out/1/` (ignored by
git). Next: shrink it in a worktree (`FUZZ_SEEDS=1 make fuzz-shrink`), find which write in
`setSizesStable` pins the edge, then a fix for Paul's go.
