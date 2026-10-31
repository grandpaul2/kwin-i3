# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twenty-fourth session** (the beta decided; one capture, a flash
after resume, was NVIDIA's GPU reset: `docs/kwin-notes.md`, "Plasma"). The desktop and the laptop
both run main (e15a226: script, plugins and, on the laptop, the settings page). The rulebook is
`AGENTS.md` since a3d21a2, `CLAUDE.md` imports it.

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

Next: 68.

**68. The repo public** (the beta, Paul 2026-10-30). Read-only so far: GPL-2 `LICENSE`, all 716
commits under Paul's GitHub noreply address, the tree's personal details only host names, the
laptop's specs and a KeePassXC rule. The whole history scanned 2026-10-30 (736 commits, every added
line and the 115 files since removed): no keys, tokens, passwords, IP or Tailscale addresses,
personal email (one KDE copyright line, Marco Martin's, from a KWin source header), images or
captures; app names only as examples (Steam, Discord, KeePassXC, Minecraft); the removed
`notes/control-tower-clipboard-laptop.md` holds clipboard commands only. Commit trailers name
Claude. Next: the collaborator's OK (they have opened no pull request yet); README's status line;
then `gh repo edit --visibility public` at Paul's go. Not announcing it is not private: GitHub search finds a public repo.
