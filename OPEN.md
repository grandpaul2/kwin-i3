# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-01** (the `stable` branch started at v1.1.0 on 2026-10-31, after
`docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
main's script as loaded at b9ec21f, its plugins at f555ab3.

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

**73. Float a container whole** (i3's `floating_enable` on a split or group, `floating.c:233`).
With a container focused (focus parent), Meta+Shift+Space does nothing: a floating node here is
one window (`src/tree.js` header), where i3 wraps the container in a floating one, its splits
and tabs inside, moved and sized as a unit. Found by the i3 parity audit of the tree done with tabbed and
stacked layouts; the one core difference left from it. i3 wraps every floating thing in a `CT_FLOATING_CON`
whose child is laid out as a tiled tree inside its rect, moved and resized as one. Here: the
model's wrapper node ported from `floating_enable` / `floating_disable`; its windows KWin
floating windows whose frames kwin-i3 lays out; the hard parts a move (on Wayland compositor-only,
so the others may follow each step, or the helper takes the drag) and a resize of the outer edge
(each client answers at its own pace: likely the helper's), raising them together, and a group's
bar with no bar tile to draw over. Next: planned in item 78's session.

**74. Meta+drag on a tab** (i3's tiling drag from a decoration with the modifier,
`click.c:251-256`: `tiling_drag(con)` of the tab's container at once, no threshold, no focus;
`:427`, `:437` route a tab's press to its con). Here the helper's `pressBar` takes only a press
with no modifier (`plugin/tilingdrag.cpp:607-609`), so a Meta press on a group's bar falls to the
general drag, which finds no window there (§9 G8's gap rule: likely the group's shown window, not
the tab pressed). The i3 port: Meta+left on a tab drags that tab whole at once (G1's no-focus
rule, G14's tab con); it doesn't wait on item 73, except Meta+Shift+left (G5) on a split tab.
Next: planned in item 78's session.

**78. The line between Plasma and kwin-i3 for the mouse and floating** (raised 2026-11-01, while
planning items 73 and 74). Tabbed and stacked groups came after the mouse's float rules (G5's
Meta+Shift float where dropped, G13's float to tile, X5), which were judged for single windows;
a tab, a split tab and a floating container (item 73) each ask again what Plasma owns (KWin's
move and resize, its title bars) and what kwin-i3 owns, and some click-to-float behaviour may
change. Next: a planning session of its own: for each mouse action on a window, a tab and a
container, i3's behaviour (`click.c`, `tiling_drag.c`, `floating.c`), what Plasma does there, and
the line drawn explicitly, as a foundation change to `docs/plan.md` and `behaviour.md` §9; then
items 73 and 74 from it.

**71. The README's monitor paragraph for any monitor** (`LATER.md` item 70's (a)). "On a laptop
that docks" holds the advice to set workspace outputs, but a desktop's monitor drops out the same
way (a hotplug blip) and a desktop user skips a laptop paragraph. Next: a
bullet in Install step 7 ("For i3's feel", beside "More than one monitor"): workspaces of a
monitor that goes away stay on the other for good, as in i3; a workspace output per number, with
the other screen second, brings them back.
