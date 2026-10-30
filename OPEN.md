# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twenty-second session** (the fuzzer brought up to date and run
three times, Paul lifting the Stage's hold for the night; fixed live: 63, 64 and minimums filling a
split exactly; `LATER.md` item 5). The desktop runs main (33dd87d's script,
2026-10-30, the fuzzer's three fixes); the laptop runs 886732b's. The rulebook is `AGENTS.md` since a3d21a2, `CLAUDE.md` imports it.

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

**65. Ship the gaps at 2 and 0** (Paul, 2026-10-30, after living with them on large and small
screens: his desktop already runs `gapsInner=2`, `gapsOuter=0`). The defaults are 4 and 2 today
(`behaviour.md` L5, whose reason "the inner 4 is KWin's own tile padding" changes with it).
Next: change the default wherever it is written (`src/settings.js`, `package/contents/config/main.xml`,
`package/contents/ui/config.ui`, the settings page `kcm/ui/main.qml`, README's settings table,
`behaviour.md` L5); check what `tools/testkwin.sh` and the live scenarios that read the gaps
(26, 37, 55, 58, 78, 86) assume about the default, and run those.
