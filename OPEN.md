# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-02** (the `stable` branch started at v1.1.0 on 2026-10-31, after
`docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
main at 1c93f70: script, plugins and settings page, through `make install`.

## Stage

**Now the beta**: before any release, the repo is public without an announcement, so a few early
users can run it: people new to Plasma who found other tiling scripts buggy, on Arch-based
(Plasma 6.8) and Debian-unstable-based (Plasma 6.7.4) distributions, on NVIDIA. Their bugs are
fixed as they come, hardening kwin-i3. The Stage's rules hold through the beta (lean testing,
`docs/testing.md`; fuzz and fault runs in `LATER.md`). Their desktops are theirs: their go to
reload (`AGENTS.md`). They run the `stable` branch, moved to main when main has passed
`docs/testing.md` P6 (a day on the maintainer's desktop, every scenario on the host and in both
containers), and tagged `v1.N.0`; a fix for their bug reaches `stable` sooner, as `v1.N.M`. A
public release is not decided yet (`LATER.md`).

## Heading

Flesh out what is there: more configurable and more reliable, so it works on any machine, set up
by someone who has never seen it. **Not** more of i3: the goal is i3's feel and basic window
management, with Plasma doing the rest. The scope and its reasons: `docs/plan.md`, "Scope"; the
audience and the lines drawn: `docs/philosophy.md`.

## Open

**79. The install and first run, built to `plan.md`'s "Install and first run"** (2026-11-01;
takes in item 26). Built: `make install` and `make uninstall`; the taken keys' save and give-back;
the settings page's Plasma Settings sub-page with its banner, its save and `make uninstall`'s
give-back (`behaviour.md` §11); the README's Install to match. To check: `behaviour.md` G2
names a System Settings page for the drag distance, and the survey of stock 6.7.5 and 6.8.2 found
none. Next: the install walked as a new user on stock CachyOS and PikaOS (`tools/box.sh`), step
by step, from `git clone` to the sub-page. Separate, still open: a rule for Plasma's window
actions that have no i3 counterpart acting on a window in the tree (minimize, quick tile, Show
Desktop, activities, Keep Above), today one-off rows.

**82. A hidden tab focused by KWin** (found 2026-11-01 building scenario 89). With the pointer over
a tiled tabbed group as a new window opened in its shown tab (`T[f V[g h]]`, h new), KWin activated
f, the hidden tab, right after kwin-i3 focused h (the log: `ACTIVE h (KWin)`, then `ACTIVE f
(KWin)`); the next key then took the focus from f. i3 never focuses a hidden tab but by a key or a
click on its tab (`con_is_hidden`). Likely KWin's focus follows mouse finding f under the pointer
in the stacking. Next: reproduce in a test KWin with the pointer over the group, read the stacking
order at that moment, then i3's rule against what KWin allows.

**83. A tiled fullscreen window's neighbours** (found 2026-11-01 with item 73's floated case).
i3 renders a fullscreen con alone and returns (`render.c:127-144`), its siblings keeping their
rects. The tiled projection leaves a fullscreen window out once KWin no longer keeps it in a tile
(`kwin.js` `visibleLeaf`: fullscreen with no tile), so after a rebuild its neighbours may take
its space, and give it back when it leaves fullscreen. Next: a test-KWin probe (a fullscreen
window in `H[a b]`, a rebuild, b's geometry), then i3's way if it differs.

