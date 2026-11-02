# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-01** (the `stable` branch started at v1.1.0 on 2026-10-31, after
`docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
main's script as loaded at e0c5ace, its plugins at e0c5ace.

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

**56. kwin-i3's notifications never reach Plasma** (found 2026-10-29; back in `OPEN.md` 2026-10-31: a CachyOS update breaks the plugins and
the report saying so is what a user new to Plasma needs). The load report
(`behaviour.md` §13: taken keys, layouts, per-output desktops, missing plugins) is what tells a
new user their keys clash or their plugins didn't load after a Plasma update, and it is lost. It
is sent with `callDBus(... "Notify", "kwin-i3", 0, ..., [], {}, -1)`; KWin's callDBus converts by
`QJSValue::toVariant()` (`scripting.cpp:345`), so Plasma receives `sisssava{sv}i` for
`susssasa{sv}i` and refuses it ("no slot matched": the laptop 2026-10-29 16:48:53, the desktop
2026-10-28 05:10:30). JavaScript can't make an unsigned int or a typed array here. The tests
missed it: `tools/fakenotify.py` declares the signature but dbus-python doesn't enforce it (a
strict version, `message_keyword` and a signature check, refused it in a probe). Routes probed:
the desktop portal (`AddNotification`, `sa{sv}`) refuses KWin ("Unable to open
/proc/<kwin>/root"); a QML (declarative) script's KNotification sends it correctly, with a
`kwin-i3.notifyrc` of ours showing as "kwin-i3" (test KWin, strict stand-in), but a JS script
can't hand a QML one the report. Options: (1) kwin-i3 as a QML script hosting `main.js`, with the
globals mapped (`Workspace`, `DBusCall`, `ShortcutHandler`, `Timer`): no plugins, a spike first;
(2) the helper sends it (plugins only), an OSD line (`osdService.showText`) without them. Waiting
on it: the focus note (`plan.md` (e)'s load-notification place; once per install,
built then reverted with this item, wording in git `5c32a73`), and the strict stand-in.
For the beta, `make take-keys`'s printout at install is the one-time list of the keys taken, and
the settings page's banner says when the plugins aren't loaded. Next: how i3
tells a user (i3-nagbar for a config error), then a recommendation between (1) and (2).

**79. The install and first run, re-evaluated** (2026-11-01; takes in item 26). The seam a new
user meets first is murky in the foundation docs. `plan.md` reason (e) names the Plasma settings
kwin-i3 is designed around in three places, but only the README's "For i3's feel" exists: the
load notification never arrives (item 56) and the settings page shows none of them (`LATER.md`
item 22). That list was built from i3's config, so Plasma features with no i3 counterpart were
never candidates. Item 26's three, read in KWin 6.7.5's `window.cpp`: a drag to a screen edge
(`ElectricBorderTiling`, `ElectricBorderMaximize`) already floats the window, KWin untiling it at
the move's first step (`:1234`, `kwin.js` tileChanged), then quick-tiles it, not "pulled back" as
`behaviour.md` V12 and the i3 feature map's R11 say; Shift at a move's release (no Plasma setting)
drops a floating window into kwin-i3's tile under the pointer, two windows in one tile until some
other pass; Meta+T ("Edit Tiles", KWin's default) edits kwin-i3's tiles. No foundation doc owns the
install. Next, a session of its own: (1) a survey from Plasma's side: every stock Plasma 6.7/6.8
setting, shortcut, edge and effect touching windows (`kwin.kcfg`, default shortcuts), each marked
conflicting, standing in for an i3 directive, or harmless; (2) the install walked as a new user on
stock CachyOS and PikaOS (`tools/box.sh`), step by step; (3) the foundation question: names only,
or i3's `i3-config-wizard` way, one first-run step that lists what kwin-i3 needs and why and sets
it through Plasma's own settings on one yes, with a way back; (4) a home for the install and first
run in `plan.md`, which the README and the settings page follow.

**82. A hidden tab focused by KWin** (found 2026-11-01 building scenario 89). With the pointer over
a tiled tabbed group as a new window opened in its shown tab (`T[f V[g h]]`, h new), KWin activated
f, the hidden tab, right after kwin-i3 focused h (the log: `ACTIVE h (KWin)`, then `ACTIVE f
(KWin)`); the next key then took the focus from f. i3 never focuses a hidden tab but by a key or a
click on its tab (`con_is_hidden`). Likely KWin's focus follows mouse finding f under the pointer
in the stacking. Next: reproduce in a test KWin with the pointer over the group, read the stacking
order at that moment, then i3's rule against what KWin allows.

**71. The README's monitor paragraph for any monitor** (`LATER.md` item 70's (a)). "On a laptop
that docks" holds the advice to set workspace outputs, but a desktop's monitor drops out the same
way (a hotplug blip) and a desktop user skips a laptop paragraph. Next: a
bullet in Install step 7 ("For i3's feel", beside "More than one monitor"): workspaces of a
monitor that goes away stay on the other for good, as in i3; a workspace output per number, with
the other screen second, brings them back.

**83. A tiled fullscreen window's neighbours** (found 2026-11-01 with item 73's floated case).
i3 renders a fullscreen con alone and returns (`render.c:127-144`), its siblings keeping their
rects. The tiled projection leaves a fullscreen window out once KWin no longer keeps it in a tile
(`kwin.js` `visibleLeaf`: fullscreen with no tile), so after a rebuild its neighbours may take
its space, and give it back when it leaves fullscreen. Next: a test-KWin probe (a fullscreen
window in `H[a b]`, a rebuild, b's geometry), then i3's way if it differs.

**84. The foundation sweep's code fixes** (2026-11-01; each checked against i3 4.24 and the
code). The code breaks a row of `behaviour.md` or i3 with no reason (a)-(f); each row is marked
"being fixed". Five stages, one live at a time, each with the go to build and to reload, `make
unit` and the changed scenarios (64 for a plugin stage). Stages 1 (fullscreen), 2 (tree and rules), 3 (look) and 4 (plugins: Release's marks, B3, extra
modifiers, the bar's buttons and scroll, G4, Z9, K4's leave key, the ring's source, the range
rule) are built; left:
(5) **pointer and release**: entering a gap or a panel on the focused output refocuses (B2,
`handlers.c:91-121`); Release resets only the roots kwin-i3 placed, a user's own tile layout kept
(Y4, reason (e)). Next: stage 5, with the go.
