# "Show Panel Configuration" does nothing (open, 2026-10-25)

Paul, 2026-10-25: right-click the panel, choose "Show Panel Configuration", and nothing happens.
Investigated live (read-only traces, then helper variants loaded with his OK, each try his own
click). **Not fixed.** Next session: the activation test below, then a spec.

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

## Next session

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
