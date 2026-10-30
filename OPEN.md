# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "Paul's use"; Paul, 2026-10-30): such
an item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-10-30, twentieth session** (closed: 62, the desktop portal's dialogs float
by a default rule; 54(a) and (b), the window menu's flags put back at once and focus follows mouse
across outputs under Show Desktop; 55, a title bar that lands late is taken; 53, KWin's Slide ending
Show Desktop, upstream in `LATER.md`). The desktop runs main (886732b's script; later commits docs
only). The laptop runs main too (pulled and reloaded 2026-10-30, twenty-first session, Paul's go).
Twenty-first session, closed: 50 (`docs/records/laptop-test-bed.md`), 54 ((c) can't happen,
`docs/kwin-notes.md`), 59 (its facts in `docs/kwin-notes.md`, "Tiles"), 61 (to `LATER.md`).

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

**56. kwin-i3's notifications never reach Plasma** (found 2026-10-29; Paul: not urgent, decide
once the setup is hardened). The load report (`behaviour.md` §13: taken keys, layouts, per-output
desktops, missing plugins) is sent with `callDBus(... "Notify", "kwin-i3", 0, ..., [], {}, -1)`;
KWin's callDBus converts by `QJSValue::toVariant()` (`scripting.cpp:345`), so Plasma receives
`sisssava{sv}i` for `susssasa{sv}i` and refuses it ("no slot matched": the laptop 2026-10-29
16:48:53, the desktop 2026-10-28 05:10:30). JavaScript can't make an unsigned int or a typed array
here. The tests missed it: `tools/fakenotify.py` declares the signature but dbus-python doesn't
enforce it (a strict version, `message_keyword` and a signature check, refused it in a probe).
Routes probed: the desktop portal (`AddNotification`, `sa{sv}`) refuses KWin ("Unable to open
/proc/<kwin>/root"); a QML (declarative) script's KNotification sends it correctly, with a
`kwin-i3.notifyrc` of ours showing as "kwin-i3" (test KWin, strict stand-in), but a JS script
can't hand a QML one the report. Options: (1) kwin-i3 as a QML script hosting `main.js`, with the
globals mapped (`Workspace`, `DBusCall`, `ShortcutHandler`, `Timer`): no plugins, a spike first;
(2) the helper sends it (plugins only), an OSD line (`osdService.showText`) without them. Waiting
on it: the focus note (`plan.md` (e)'s load-notification place; once per install, Paul
2026-10-29, built then reverted with this item, wording in git `5c32a73`), and the strict stand-in.
