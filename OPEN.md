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

**66. The pre-release code review's fixes** (review 2026-10-30, five agents, each finding checked
against the code; Paul's go for all of them the same day). Next: build, test and commit each
group; one reload at the end. (1) A newcomer's hold released by an unrelated pass before its move
(`kwin.js` `showHeld`): release only holds whose pass ran. (2) Release mid-drag leaves the drop
indicator. (3) Minimized windows in `tree.js`: a move swaps with one, a close's focus lands on a
split of them, a resize shares with them, floating toggles forget the flag. (4) The "closed
outside" hook missing for windows there at load. (5) Floating resize by key unclamped (i3's
`floating_check_size`). (6) `warnTakenKeys` silences the plugin and layout notices; the taken-key
check has no timeout; the report can split. (7) Unquoted criteria values (i3 accepts them).
(8) Two fullscreen flags after a move to an output; `moveToWorkspace` misses i3's
fullscreen-permits check. (9) A floating nudge whose centre is on no output: the largest overlap
(`randr.c`). (10) The resize mode stuck on after a helper unload. (11) Release mid-crossing leaves
a window on all desktops. (12) The Stats reply unguarded. (13) The page misreads "75 x 50".
(14) "Drag tiling windows" not greyed without the helper. (15) Probe: does an empty `forWindow`
bring the default rules back? (16) Tooltips naming Meta+Ctrl+arrow resize; T12. (17) The rules
help text and README on criteria; `notification`. (18) `holdTimeoutMs` 10 vs 1; `settings.js`'s
header. (19) Stale comments (`kwin.js` 865, 1819, 2157, 2485; `hold.h` 100 ms; `tree.js` and
`behaviour.md` "next at be04c853ee"). (20) Cuts: `sameLaunch`, the `reachable` and
`firstAssigned` exports, `m_pendingClose`'s timer, Qt Widgets, `connected` never cleared, the
five-times "focus what this output shows". (21) Drop the old list settings, their notices and the
migration.
