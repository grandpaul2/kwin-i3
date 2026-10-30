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

Suggested order: 67, then 61 and 56, then 4 with 51(a), then 22, then 68.

**67. PikaOS in a container on the desktop** (Paul's go, 2026-10-30). The Arch half is done:
`tools/box.sh` (`docs/testing.md` P5) runs the test KWin on KWin 6.8.2 here, on the AMD iGPU (KWin
6.8's virtual backend needs a render node, `docs/kwin-notes.md`); 10-tiling and 86-tiling-drag
green in it with fresh plugins (2026-10-30, 27 s). Left: a PikaOS image the same way, for whether
it ships KWin's headers at its own version and the Debian package names for the README. What no
container gives: NVIDIA on 6.8 on a real output (6.8 turned on triple buffering for NVIDIA), only
a friend's session. Next: `tools/box/Containerfile.pika`, then `make plugin` in it.

**61. Two intermittent reds on KWin 6.8** (the laptop, 2026-10-29; a friend runs 6.8 now).
(a) **86-tiling-drag**: red twice right after a plugin rebuild (21 and ~25 checks; in one, window a
was gone from kwin-i3's tree after the swap drag, `V[H[b] c*]` for `V[H[a b] c*]`), then green
seven runs in a row, alone and beside 64; green on 6.7 on both machines. (b) **53-hold** "after: c
has landed there": c (a 0.8 s client) still black 1.2 s after the move, once; green alone after.
Neither log was kept; `run.sh` keeps a red's output and kwin-i3's log in `tests/live/out/` since
8195ea5. Both green on the laptop 2026-10-30, after the code review's plugin rebuild (one run
each). Next: 86 in a loop in `tools/box.sh` (each run builds the plugins fresh), runs of 5 minutes or
less, a red's log read for what removed a.

**56. kwin-i3's notifications never reach Plasma** (found 2026-10-29). The load report
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
on it: the focus note (`plan.md` (e)'s load-notification place; once per install, Paul
2026-10-29, built then reverted with this item, wording in git `5c32a73`), and the strict stand-in.
Next: how i3 tells a user (i3-nagbar for a config error), then a recommendation between (1) and (2).

**4. No dependence on Paul's dotfiles.** (a)-(d) done and live 2026-10-24: workspaces created on
demand (`docs/records/spec-desktops-on-demand.md`), per-monitor desktops reported and put right when
turned on (`docs/records/spec-per-output-desktops.md`), taken keys reported with `make take-keys` /
`restore-keys` (`docs/records/spec-taken-keys.md`), kwin-i3's own Meta+F / Meta+Shift+Q
(`docs/records/spec-own-keys.md`); (b) and (c) share one notification at load. The stock test mode is
done (`make live-stock`, `docs/records/spec-stock-mode.md`, 2026-10-24): the install as written
(per-output on, `make take-keys`) works on a stock Plasma with click-to-focus; no real finding.
Left, all for the beta's README:
- the default keys against a stock Plasma (finding 13: R1-R7): 22 clash until `make take-keys`;
  README says zoom clashes, but only Meta+0 does; and no Meta+Return terminal outside the
  dotfiles (finding 14, D74): say how to bind one;
- (e) focus follows mouse and Meta-alone (also map finding 12): an install step, not only a table
  (the laptop's stock install, 2026-10-29: under click to focus the frames look broken, they move
  only on a click, and the popup grace has nothing to do); four scenarios assume it (`# focus: mouse`);
- **the README pass**: install read as a stranger on a stock Plasma, the settings page
  (`make kcm-install`) included, with **CachyOS and PikaOS** steps (their package names from item
  67). It must cover: an install step, "For i3's feel", listing the Plasma settings kwin-i3 is
  designed around and where each lives in System Settings, said to be Plasma's (`plan.md` (e),
  Paul 2026-10-29); a package linked while KWin runs can't be turned on until the next login
  (KPackage's cache, `docs/records/spec-settings-page.md`); and an app's floating size: a floated
  window comes back at the size it opened with, but an app that last closed tiled opens at that
  tiled size, as in i3. The fix is a Plasma window rule (Size/Position, "Apply Initially"), i3's
  `for_window` resize done through Plasma: README steps, after a test-KWin check that such a rule
  leaves tiling alone (`docs/records/spec-float-size.md`);
- bug reports from other people: binding the capture key from the first day, what a capture holds
  and how to send one (`docs/debugging.md`), and that a flash just after resume on NVIDIA is the
  driver's (`docs/kwin-notes.md`, "Plasma").

**51. What users of other KWin tilers expect** (fourteenth session, 2026-10-28: three agents
surveyed Krohnkite, Bismuth, Polonium, Karousel, KZones, PlasmaZones and the forums; the report
was not kept, its findings are here). Ranked: works after Plasma upgrades with a visible
maintainer (Bismuth died of that; Polonium nearly); auto-tiling on Wayland; multi-monitor right;
one-click install, no re-login, no duplicate instances; defaults with no clashes and a key table;
misbehaving windows handled (games, mpv, Electron, 1x1 helpers) with a "window X won't tile" FAQ;
changelog, troubleshooting, a supported-Plasma line. kwin-i3 is ahead on multi-monitor, clash
handling, live Apply and the Window Rules page; behind on: (a) the install (store users get the
script alone: title bars, no drag; the plugins need a per-KWin-version build); (b) a user README
(screenshot, FAQ, supported versions, uninstall), with item 4's README pass; (c) activities (item
5); (d) the scratchpad, i3's most-asked missing feature (Bismuth #412; `plan.md` leaves it out as
unused by Paul, but the audience is not Paul): a foundation question for Paul, cheap on floating
plus a hidden workspace, i3's `src/scratchpad.c` first. Tabbed/stacked stay out (KWin's tiles
can't show tabs without much work). Our niche's only other entry: krohnkite-i3 (4 stars, no
releases). For the beta, (a) is a build from source on each friend's machine (a package, COPR/AUR
as PlasmaZones ships, waits for a release): a KWin update breaks the plugins until `make plugin
plugin-install` runs again, often on CachyOS, so the README says so, and item 56's report is what
says the plugins are missing. Next: (a) and (b) in item 4's README pass; (d) asked as a foundation
change if a friend asks for it.

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
