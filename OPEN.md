# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-31, twenty-fifth session** (Meta+Shift+E's End session: the
`endSession` setting, sleep, shut down, log out or Plasma's logout screen, on the Keys page beside
its label, f39bbff and 9e57240; the Keys page's mode notes after their key, 2d6f557; "a key runs
one fixed action" reworded to what it meant, 9c7f18e). The desktop runs main's script (reloaded at
f39bbff; `package/` unchanged since) and plugins (unchanged since e15a226), and main's settings
page (2d6f557). The rulebook is `AGENTS.md` since a3d21a2, `CLAUDE.md` imports it.

## Stage (Paul, 2026-10-24; the beta 2026-10-30)

**Development** (2026-10-24 to 10-30): Paul used kwin-i3 daily and adjusted it along the way.
**Now the beta** (Paul, 2026-10-30): before any release, the repo goes public without an
announcement, so a few people who know Paul can use it: two friends new to Plasma who found the
other tiling scripts buggy, on **CachyOS** (Arch-based, Plasma 6.8) and **PikaOS** (Debian
unstable-based, Plasma 6.7.4 in its August image), both on NVIDIA (a 50 series and a 30 series).
Their bugs are fixed by Paul, hardening kwin-i3 as they come. The Stage's rules hold through the
beta (lean testing, `docs/testing.md`; fuzz and fault runs in `LATER.md`); what a person needs to
install and use it moved here from `LATER.md`. Their desktops are theirs: their go to reload, as
for the collaborator (`AGENTS.md`). A public release is still not decided (`LATER.md`).

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope"; the audience and the lines drawn: `docs/philosophy.md`.

## Open

**69. A capture, "firefox issue, probably nothing"** (2026-10-31 01:30, Paul's desktop; kept in
`~/.local/state/kwin-i3/captures/2026-10-31_013050.248`). Next: read it with `tools/capture-read`
and diagnose, or delete it if Paul says it was nothing.
