# "Show Panel Configuration" does nothing (fixed 2026-10-25)

Paul, 2026-10-25: right-click the panel, choose "Show Panel Configuration", and nothing happens.
Investigated live (read-only traces, then helper variants loaded with his OK, each try his own
click), then diagnosed from source and reproduced headlessly in a later session the same day.

## Diagnosis and fix (2026-10-25, later session)

**kwin-i3's passive focus pass.** Every window going away runs one (`forgetWindow` →
`wantFocus`, a 0 ms timer; `src/kwin.js` applyFocus), the panel's context menu included. The pass
treats an active *desktop* window as "nothing has the focus" and gives the focus back to the
focused tile; right for KWin's last resort when no window is left to focus on a monitor
(73-places-itself). Plasma turns Show Desktop on for its edit mode as the menu closes (below),
and KWin focuses the desktop; the pass then activates the tile Show Desktop hid, and KWin's
`activateWindow` turns Show Desktop off for a hidden window (`activation.cpp`). Plasma leaves edit
mode on that, and the configuration window hides and deletes itself before it ever mapped. The
3–28 ms is the timer plus KWin's round trips; the two successes were the pass running before
plasmashell's request reached KWin, when the tile was still the active window and the pass did
nothing. The Qt reading below is withdrawn.

**Fix.** A passive pass that finds a desktop window active asks KWin whether Show Desktop is on
(`org.kde.KWin` property `showingDesktop` over D-Bus; scripts can't read it) and goes on only if
it is off. Key actions are untouched. **Test:** `tests/live/74-show-desktop.sh`, red on the old
code in the two cases that matter (a popup closing, a tile closing, each with Show Desktop on;
case 2 is Plasma's order ten times and passes either way, the pass winning the race in the test
KWin). Learned on the way: KWin's D-Bus `showDesktop(bool)` lasts only while the caller stays on
the bus (`dbusinterface.cpp` watches the service), so the test toggles the Show Desktop shortcut.

**Left over, won't-fix (Paul, 2026-10-25; was OPEN.md item 16):** in the test KWin, Show Desktop turned on within the first second after a
kwin-i3 load, with no frame effect, is turned off again by an activation of the tile that is not
the pass (traced: the pass asked and stopped; the activation came with no JavaScript caller
visible, in the same millisecond as the frame check's 1 s miss timer, before that timer's
handler ran). The test waits for the load to settle. Not Paul's case: live, the effect answers
at once, and a reload is a deliberate act. Won't-fix for that reason: it needs no plugins
and a Show Desktop in the second after a load, and nobody has hit it outside a test. Reopen if it
is seen on a desktop.

## What happens (traced, three tries in a row at 03:54, all failing)

A tracing helper logged every window added or removed, every activation, every Show Desktop
change and every keyboard-focus change (`SeatInterface::focusedKeyboardSurfaceAboutToChange`).
The three tries look the same; the first, times in seconds after 03:54:

```
55.564  kbd -> plasmashell (type -1)         the panel's context menu: an xdg_popup, keyboard to it
55.564  added plasmashell popup 286x129
56.379  kbd -> Alacritty                     the item clicked: the menu closes, the keyboard goes
56.379  removed plasmashell popup              back to the active window, a kwin-i3 tile
56.379  kbd -> plasmashell (type 1, desktop)  Plasma starts edit mode: setDashboardShown(true),
56.379  activated desktop, showingDesktop true   KWin focuses the desktop window
56.407  showingDesktop false (active: desktop) 28 ms later Plasma ends edit mode itself
56.407  kbd -> Alacritty, activated Alacritty KWin's setShowingDesktop(false) refocuses the chain
```

The configuration window (`PanelConfigView`) is never created. In the other two tries, edit mode
ended after 3 ms and 7 ms.

## The mechanism (plasma-workspace 6.7.5 source; a reading, not yet proved)

- Plasma's edit mode turns Show Desktop on, and leaves when it goes off
  (`shell/shellcorona.cpp`: `editModeChanged` → `setDashboardShown(edit)`;
  `showingDesktopChanged(false)` → `setEditMode(false)`).
- **Plasma also leaves edit mode when none of its windows has the focus**
  (`shellcorona.cpp`: `QGuiApplication::focusWindowChanged` with a null window →
  `setEditMode(false)`).
- The likely race: the click closes the menu, and the keyboard goes to Alacritty, so plasmashell's
  Qt focus window becomes null. Plasma has already started edit mode, though. When that queued
  "focus null" is handled a few ms later, it cancels edit mode, and KWin's Show Desktop goes
  off with it. The off came while the desktop was still KWin's active window, and kwin-i3's
  script logged nothing, so KWin wasn't reacting to anything kwin-i3 did.
- So it would happen whenever a non-Plasma window has the focus as the menu closes. With
  kwin-i3 that is nearly always: a tile keeps the focus (i3's model), and focus follows mouse never
  moves it to the panel or the desktop (`Window::pointerEnterEvent` skips both).

## What it is not (each tested)

- **The frame filter** (`plugin/framefocus.cpp`): a trace of its events during a failing try
  shows it passed both clicks through (the pointer was over plasmashell, so `ringWindow` returned
  null), and the 03:50 and 03:54 tries failed with it not installed.
- **The rest of the helper:** the 03:54 tries ran with only the traces loaded (no frame filter,
  popup grace, layout keys or settings watch).
- **kwin-i3's script:** its in-memory log (`tools/capture` dump) shows no pass, action or focus
  change around any try.
- **The input method:** with the virtual keyboard set to None (`plasma-keyboard` not running),
  the 03:52 try failed the same way. KDE bug 489057 reported that fix for edit mode exiting.
- **Show Desktop by itself:** turned on over D-Bus (`setDashboardShown true`), it held 3 s with
  the helper loaded and unloaded. One earlier revert after ~0.6 s (03:39) is unexplained; the
  pointer may have moved.
- A first diagnosis (the frame filter focusing a tile hidden by Show Desktop) was wrong. A live
  test built for it (`74-show-desktop.sh`) passed on the old plugin too, so it was dropped,
  along with the `isShown()` change in `ringWindow`.

## Unexplained: two tries worked

- **03:43:26**, helper unloaded entirely: the configuration opened and stayed open ~10 s.
- **03:46:04**, helper without the frame filter: it opened and stayed open ~15 s.

Every other try failed: 03:19, 03:32, 03:47, 03:49 and 03:50, and 03:52 with the normal helper and
no input method. The two successes were not traced, so what differed is unknown. Paul (2026-10-25):
"you had it working a minute ago. please do not just move on from that." The leading guess:
which window had the focus when the menu closed (a Plasma window then, not a tile).

## Second look (2026-10-25, later session; sources read before the reproduction above)

Read for the installed versions: plasma-workspace 6.7.5 (`shell/shellcorona.cpp`, `panelview.cpp`,
`panelconfigview.cpp`), libplasma 6.7.5, plasma-desktop 6.7.5 (the installed QML under
`/usr/share/plasma`), kwin 6.7.5 (`workspace.cpp`, `activation.cpp`).

- **Who turns edit mode on.** Nothing in `PanelView::showConfigurationInterface` does. It creates
  the `PanelConfigView`, calls `show()`, and `showEvent` sets the containment "user configuring";
  the panel toolbox QML (`org.kde.paneltoolbox/contents/ui/main.qml`, `onUserConfiguringChanged`)
  then sets `corona.editMode = true`. All synchronous, inside the menu item's handler.
- **Who turns it off.** The `PanelConfigView` hides itself on `editModeChanged(false)` and
  `hideEvent` calls `deleteLater`. Its surface had no buffer yet, so KWin never saw a window: the
  "never created" in the trace is this. Edit mode goes off on (a) `focusWindowChanged(nullptr)`
  in `ShellCorona`, or (b) KWin's `showingDesktopChanged(false)`. KWin turns Show Desktop off by
  itself only when a window that breaks it is added, on a desktop switch, or in `activateWindow`
  of a hidden window; the trace shows none of the first two, and the third would come from a
  pointer-driven or scripted activation, which the traces did not show. So (a), from plasmashell.
- **Why the focus window is null, a reading of Qt's Wayland client** (6.11.2; the mechanism's
  symbols are in `libQt6WaylandClient.so.6`: `handleWindowDeactivated`, `requestWaylandSync`,
  `handleWaylandSync`; the source itself could not be fetched here): when a window that had the
  keyboard is destroyed, Qt does not report "no focus window" at once. It asks the compositor for
  a sync round trip and decides when that returns, so a leave followed by an enter in the same
  batch is not reported as a null. The menu is destroyed *before* its action is triggered
  (QMenu hides, then emits), so plasmashell's requests reach KWin in this order: sync, then
  show_desktop(true). KWin answers the sync before it gives the desktop the keyboard. plasmashell
  then sees: sync done with no active window → focus null → edit mode off → Show Desktop off; the
  keyboard enter for the desktop arrives after. 3–28 ms is one round trip.
- **What the reading does not explain**: the two successes, and that stock Plasma would fail the
  same way with any application focused (no such bug on bugs.kde.org; 525792 and 527512 are
  different mechanisms). So it is a hypothesis to test, not a diagnosis. The test that settles it
  is the order of events on plasmashell's own socket (`WAYLAND_DEBUG=client`, which needs a
  plasmashell restart), or the activation test below (a plasmashell window focused when the menu
  closes should make it work every time).

## Next session (as planned before the diagnosis; kept for the record, none of it needed)

1. **The activation test** (proposed, not run): make the desktop window KWin's active window with
   one KWin script call (Alacritty's frame turns inactive, nothing else changes). Paul then
   right-clicks the panel and chooses "Show Panel Configuration".
   - If it opens: the mechanism above is right, and the fix question is what kwin-i3 should do.
   - If not: find what differed at 03:43 and 03:46. Ask Paul what he did then (another monitor,
     a click first), and trace until a try succeeds.
2. Then a spec. One idea, not yet weighed: when a panel or desktop popup closes, hand the focus to
   the desktop or panel the way stock Plasma would end up, rather than straight back to the tile.
   Read KWin's `activateNextWindow` and stock Plasma's behaviour first; stock Plasma with focus
   follows mouse and a focused window may fail the same way (KDE bugs 525792, 527512 are close
   relatives). A "narrow fix, not broad setting" case: no global focus changes.
3. A test: plasmashell can't run in a test KWin, so the test needs a stand-in that reproduces
   "a popup closes, and its client cancels when it has no focus". Or a live check from a
   capture.

## How the traces were done (to repeat them)

- Show Desktop flag, read-only: `DISPLAY=:0 XAUTHORITY=$(ls /run/user/1000/xauth_*) xprop -root
  -spy _NET_SHOWING_DESKTOP`, with timestamps added per line.
- kwin-i3's log: `KI3_CAPTURE_DIR=<scratch> tools/capture` dumps the in-memory ring
  (`debugLog` is off live).
- Helper variants: a worktree, the change, `make plugin`, then install the `.so` under a new
  name (`~/.local/lib/kwin-i3/qt6plugins/kwin/plugins/kwini3probe-<name>.so`; KWin never unloads a
  library, so each build needs its own file), `UnloadPlugin kwini3helper-<hash>`, `LoadPlugin
  kwini3probe-<name>`. Trace lines are `qWarning() << "KI3TRACE …"`, and land in the journal
  under KWin's PID. Afterwards, load the normal helper back and delete the probe files.
- `KWin::Workspace::showingDesktopChanged`, `windowActivated`, `windowAdded`/`windowRemoved` and
  `waylandServer()->seat()`'s `focusedKeyboardSurfaceAboutToChange` gave the sequence above.
- gdb can't attach to a test KWin from Claude's sandbox (ptrace refused).
