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

Suggested order: 22, then 68.

**22. The settings page, finished for the beta** (Paul, 2026-10-25: "not perfect, but fine for
the dev phase; it will need more attention as we end it"). Today's state: reorganized
(`docs/records/spec-settings-cleanup.md`), the frame section given one shape and the debug-log
checkbox removed (2026-10-25). Next: a pass over the whole page with Paul, screenshot by
screenshot, on his desktop with the plugins (the test KWin's page has none, so its frame section is
all greyed); by hand, whether arrow keys move the highlight in an open dropdown (injected input
didn't, in 76). A gap found reading the code (2026-10-27, Paul's go to fix then): Defaults then
Apply on a non-US layout writes the US keys until the next layout change or load: the page calls
the helper's `FitKeys` after Apply, as i3's `bindsym` follows the keymap at once. Also for the
finished page (Paul, 2026-10-29, `plan.md` (e)): a section showing the Plasma settings kwin-i3 is
designed around, each with a control that changes Plasma's own setting, labelled as Plasma's, with
the words that changing it here is the same as in System Settings. Its accessibility check stays
`LATER.md` item 18.

**68. The repo public** (the beta, Paul 2026-10-30). Read-only so far: GPL-2 `LICENSE`, all 716
commits under Paul's GitHub noreply address, the tree's personal details only host names, the
laptop's specs and a KeePassXC rule. Next: a scan of the whole history for anything committed and
later removed; the collaborator's OK; README's status line; then `gh repo edit --visibility
public` at Paul's go. Not announcing it is not private: GitHub search finds a public repo.
