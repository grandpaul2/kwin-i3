# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-03** (the `stable` branch started at v1.1.0 on 2026-10-31; each move
after `docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
main at 63f30ad: script and plugins (settings page at 99b2d6a). `stable` is at
`v1.3.0` (2026-11-03, 8a42986).

## Stage

**Now the beta**: before any release, the repo is public without an announcement, so a few early
users can run it: people new to Plasma who found other tiling scripts buggy, on Arch-based
(Plasma 6.8) and Debian-unstable-based (Plasma 6.7.4) distributions, on NVIDIA. Their bugs are
fixed as they come, hardening kwin-i3. The Stage's rules hold through the beta (lean testing,
`docs/testing.md`; fuzz and fault runs in `LATER.md`). Their desktops are theirs: their go to
reload (`AGENTS.md`). They run the `stable` branch, moved to main when main has passed
`docs/testing.md` P6 (the maintainer's use and word that it works, every scenario on the host and in both
containers), and tagged `v1.N.0`; a fix for their bug reaches `stable` sooner, as `v1.N.M`. A
public release is not decided yet (`LATER.md`).

## Heading

Flesh out what is there: more configurable and more reliable, so it works on any machine, set up
by someone who has never seen it. **Not** more of i3: the goal is i3's feel and basic window
management, with Plasma doing the rest. The scope and its reasons: `docs/plan.md`, "Scope"; the
audience and the lines drawn: `docs/philosophy.md`.

## Open

**79. The install and first run, built to `plan.md`'s "Install and first run"** (2026-11-01;
takes in item 26). Built: `make install` and `make uninstall`; the key override (`behaviour.md` §8, "Shared keys");
the settings page's Plasma tab with its banner, its save and `make uninstall`'s
give-back (`behaviour.md` §11); the README's Install to match. To check: `behaviour.md` G2
names a System Settings page for the drag distance, and the survey of stock 6.7.5 and 6.8.2 found
none. Next: the install walked as a new user on stock CachyOS and PikaOS (`tools/box.sh`), step
by step, from `git clone` to the Plasma tab, the key override row ticked included; and with the
plugins not built: what the Plasma tab's banner and its greyed override row then say.

**91. Plasma's settings won at runtime** (2026-11-03; `philosophy.md` "The line between i3 and
Plasma", `plan.md` reason (e) and "Install and first run", decided; the code still writes them).
The script makes focus follows mouse (with no delay, next focus under the pointer; a setting of
its own, i3's `focus_follows_mouse`), a new window's focus (stealing prevention Low) and
screen-edge tiling and maximizing off through KWin's live options (probe 93), setting them again
on each reconfigure; Release reconfigures so Plasma's return; popup grace puts back kwin-i3's
delay. The Plasma tab keeps per-output desktops, the window actions, Meta+T and animations.
`behaviour.md` (B1, C4, N6, N8, F10, §11, §13) and the README change with the code. Open in it:
the key override's default (off from the old reason (e); i3 grabs its keys). Next: the code spec.
