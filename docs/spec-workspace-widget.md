# Spec: the workspace widget (OPEN.md item 11)

**Now (2026-10-27):** Built and live 2026-10-24; without kwin-i3 a click does nothing (the fallback below was not built). What it does: `behaviour.md` §11, "The workspace widget".

From Paul, 2026-10-24: Plasma's pager on the panel draws every workspace "twice as large as it
is": each desktop as both monitors side by side, so with per-monitor desktops half of every
thumbnail is a ghost (a workspace lives on one monitor). "I want all workspaces to show on the one
panel." Status: **decided by Paul, 2026-10-24 (the recommendations below, 1-6). Built the same
day: `widget/`, `make widget-install`, `tests/unit/widget.test.js` (8; faults in the monitor and
in-use rules red), `tests/live/67-workspace-widget.sh` (7: the widget in plasmawindowed in the test
KWin reports its workspaces, a click on a thumbnail is kwin-i3's Workspace N).**

Sources: Plasma 6.7.5's task manager QML module (`org.kde.taskmanager`: `VirtualDesktopInfo`,
`TasksModel`; `/usr/lib64/qt6/qml/org/kde/taskmanager/taskmanager.qmltypes`), the stock pager
(`org.kde.plasma.pager`: its `showOnlyCurrentScreen` option), `org.kde.plasma.workspace.dbus`,
`src/workspaces.js`, i3bar's workspace buttons.

## Why the stock pager can't

It draws a desktop as the whole screen layout (every monitor), or, with "only the current
screen", as the panel's own monitor with only that monitor's windows: a workspace living on the
other monitor shows empty. It has no idea a workspace belongs to one monitor. It also shows every
desktop, used or not (KWin's desktops have no gaps: 5 and 6 show while 7 is used).

## The widget

A panel widget (a QML plasmoid, no C++: nothing to rebuild after a Plasma update), in the repo as
`widget/`, installed with `make widget-install` (`kpackagetool6`), id `net.local.kwini3.workspaces`
(decision 6). It shows, in one row, ordered by number:

- **every workspace in use**: one that has windows, or that a monitor is showing (as i3bar shows
  the workspaces that exist);
- each **at its own monitor's shape** (the monitor it lives on: the one showing it, else the one
  its windows are on), with its windows drawn as in the pager (outlines, optionally icons), and
  its number;
- **which is shown where**: the workspace a monitor shows is marked; the one on the monitor with
  focus marked more strongly (i3bar's focused / visible colours, from the theme's highlight);
- **a click** shows that workspace where it lives and focuses it: kwin-i3's own "Workspace N"
  action (Meta+N) invoked over D-Bus (kglobalaccel `invokeShortcut`), so the widget and the key do
  the same thing; without kwin-i3, KWin's own per-screen activation (`requestActivateOnScreen`).
  A scroll goes to the next or previous workspace in use (i3bar does).
- **spacing** (Paul, 2026-10-25): on a panel the row leads with an icons-only task button's inset,
  read from the theme's `widgets/tasks` frame, so the widget sits as far from the launcher before
  it as from the task manager after it (`lead` in `workspaces.js`; mirrored right-to-left).

All from Plasma's own data, which already follows per-monitor desktops: `VirtualDesktopInfo`
(`desktopIds`, `desktopNames`, `currentDesktopByScreenName`, `currentDesktopForScreenChanged`),
`TasksModel` (each window's `VirtualDesktops`, `Geometry`, `ScreenGeometry`), and the screens Qt
knows. kwin-i3 needs no new code: workspace N is desktop N, and desktop changes are already
followed (`docs/spec-desktop-changes.md`), so the widget's numbers are kwin-i3's.

The logic (which workspaces, which monitor each lives on, each thumbnail's size and windows)
lives in one plain JS file the QML imports, so it is unit-tested in node like `src/`.

## Decisions for Paul

1. **Data**: Plasma's task manager model (above) or kwin-i3's own state (through the effect's D-Bus,
   so plugins needed). Recommendation: Plasma's: it works without the plugins, and the
   numbers agree by construction.
2. **What counts as "in use"**: windows on it, or shown on a monitor (i3bar). Alternatives: also
   every workspace assigned in "Workspace monitors"; or every desktop (the pager's way).
   Recommendation: i3bar's.
3. **The look**: thumbnails at the monitor's shape with window outlines and the number (as you
   asked), or i3bar's plain numbered buttons, or a setting for either. Recommendation: thumbnails,
   with a "numbers only" option for small panels.
4. **Where the panel lives**: one panel showing every workspace (as you asked), so a workspace on
   the other monitor shows there too. Optional later: a setting to show only the panel's own
   monitor's workspaces, for a panel on each monitor. Recommendation: one panel, all; the option
   later if anyone wants it.
5. **Scroll**: next or previous workspace in use (i3bar), or nothing. Recommendation: i3bar's.
6. **Name and packaging**: "kwin-i3 Workspaces", in this repo, its own `make widget-install`;
   the README's install section adds it ("replace the pager with it"). Your panel: the pager
   replaced by it at go-live (one plasmashell script call).

## Tests

- **Unit** (node, `tests/unit/widget.test.js`): from a list of desktops, screens, current desktop
  per screen and windows: which workspaces show, each one's monitor and shape, the windows'
  rectangles inside it, the marks (shown / focused); desktops removed or added; a workspace with
  windows on no shown monitor; one monitor; three.
- **Live** (`tests/live/67-workspace-widget.sh`): the widget in `plasmawindowed` inside the test
  KWin (to verify first: that it runs there without plasmashell); windows on workspaces 1, 3 and 4
  on two monitors; a screenshot: three thumbnails, each at 16:9 of one monitor, the shown ones
  marked; a click on 3's thumbnail shows workspace 3 (kwin-i3's log: `ACTION Workspace 3`).
- Watched red with faults in the JS logic (the monitor a workspace lives on; the "in use" rule).
