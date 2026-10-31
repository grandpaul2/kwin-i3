# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-31** (both of the day's captures diagnosed: a monitor dropping out,
as i3, `LATER.md` item 70; a Firefox GPU reset, not kwin-i3's; 56 and 26 back from `LATER.md`, 71 new). The live desktop runs
main's script as loaded at f39bbff; since then `main.js` and the plugins' sources changed in
comments only, so no reload is needed.

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

**26. KWin's own tile tools act on kwin-i3's tiles** (i3 feature map, finding 9: R11, R12,
R14; back in `OPEN.md` 2026-10-31: the beta runs stock installs, where both are a new user's first try). Meta+T's tile editor edits the tiles kwin-i3 owns (overwritten at the next pass);
Shift+drag drops a window into one (two windows in a leaf); drag to a screen edge quick-tiles into
KWin's other tree (kwin-i3 pulls it back, not "floats where dropped"). Meta+T is unbound on some
desktops but KWin's default on a stock one. Inferred from code: next, a test-KWin check of each,
then whether to block, follow or document them (and whether `make take-keys` should free Meta+T).
The map's R12 says Shift is no modifier of kwin-i3's: untrue since 2026-10-26, Meta+Shift+drag
floats a tiled window; the check includes whether KWin's Shift-drop still fires beside it.

**71. The README's monitor paragraph for any monitor** (`LATER.md` item 70's (a)). "On a laptop
that docks" holds the advice to set workspace outputs, but a desktop's monitor drops out the same
way (a hotplug blip) and a desktop user skips a laptop paragraph. Next: a
bullet in Install step 7 ("For i3's feel", beside "More than one monitor"): workspaces of a
monitor that goes away stay on the other for good, as in i3; a workspace output per number, with
the other screen second, brings them back.
