# Code review: event side (2026-10-22)

Scope: src/workspaces.js, src/rules.js, and in src/kwin.js the workspace helpers, adopt/forget/
reclassify, connectWindow handlers, focus, gotoWorkspace/moveToWorkspace, registerKeys, start().
Line numbers are src/kwin.js unless stated. Time-boxed (about 12 minutes); one finding was reproduced
live in the headless KWin, the rest are from reading and are marked as such.

## 1. HIGH (reproduced): Meta+N on a workspace whose monitor is away overwrites its home, so it never returns, and its window can end up invisible

gotoWorkspace, lines 552-563. When workspace n is not showing anywhere, `occupied` is true
(it has windows and a home), so `s = Workspaces.outputOf(n)`. If the home monitor is gone,
outputOf returns the fallback screen (workspaces.js:28-34). Line 558 then runs
`Workspaces.setHome(n, s)`, which replaces the remembered home with the fallback. The comment in
workspaces.js:30 ("a gone home is kept for its return") and plan decision 10 are broken.

Scenario, run in the headless KWin with `/tmp/.../scratchpad/sc1.sh`:
1. a on ws1 (Virtual-0), b on ws2 (Virtual-1). Press Meta+1.
2. Disable Virtual-1. b moves to Virtual-0, and Virtual-0 keeps showing 1, so b is hidden.
3. Press Meta+2 on the single monitor (the normal reaction to "where did my window go"). Home[2] becomes Virtual-0.
4. Re-enable Virtual-1. b stays on Virtual-0 (not sent back), and BOTH monitors now show desktop 2.
5. Press Meta+1. Virtual-0 shows 1, Virtual-1 shows 2, and b (output Virtual-0, desktop 2) is shown
   nowhere, so it is invisible until Meta+2 is pressed again.

Without step 3 (case A in the same script) the return works: Virtual-1=2 and b is back on Virtual-1.
The existing 40-monitors test never presses a workspace key while the monitor is away.

Fix: in gotoWorkspace, only call setHome when the workspace is not occupied or has no home at all.
When occupied with a gone home, show it on the fallback screen without changing home:
`if (!(occupied)) Workspaces.setHome(n, s);` (the setCurrentDesktopForScreen call stays).
Add a 40-monitors case: unplug, Meta+2, replug, assert b is back on Virtual-1 and shown.

## 2. MEDIUM (reading, needs a test): returning monitor does not get its workspace shown

reconcile/relocate (lines 222-270) sends the windows of a workspace back to its home screen, but
nothing makes the home screen *show* that desktop. screensChanged only runs scheduleAll+wantFocus
(695). In case A above it worked, because KWin itself restores the per-output desktop. If KWin
restores something else (monitor was showing 3 when it left, or Plasma re-seeds its desktop on
hotplug), the windows are on a desktop shown nowhere. Also the fallback screen can end up showing
the same desktop as the returned one (seen in the repro, step 4: both showed 2).
Fix: in the screensChanged handler, for every workspace whose home screen is present and which was
visible on the fallback screen, call `setCurrentDesktopForScreen(desk, home)` and give the fallback
screen back the desktop it showed before (remember it per screen name on removal).

## 3. MEDIUM (reading): guard() can busy-loop at 100% CPU

Lines 20-26 and 64-84. On any exception, guard calls `scheduleAll()`; flush is itself a guard,
so a persistent throw in reconcile re-schedules a 0 ms timer forever. The likely trigger is the
2026-10-21 case of zero screens: `workspace.screens[0]` is undefined in outputOf (workspaces.js:33),
then `.geometry` (line 36) or `rootTile(undefined, ...)` throws. I could not reproduce zero screens
(kscreen-doctor refuses to disable the last output), so this is untested. Even with screens it
applies to any deterministic bug (log spam at 1000s of lines/s as well).
Fix: in outputOf return null when there are no screens, and have reconcile/wsModel/applyFocus bail
on null; in guard, do not scheduleAll from inside flush (or count consecutive failures and back
off with `timer.interval = 250`, giving up after N and logging once).

## 4. MEDIUM (reading): windows ignored at add time are never looked at again

adoptWindow returns at line 348 for "ignore" and connectWindow (the only place with
readyForPainting/caption/class/desktopsChanged handlers) is never called for them. So:
- a window that is on all desktops (sticky) when added and later set to one desktop is never adopted
  (the desktopsChanged adopt path at 413 exists only for windows already connected);
- a Wayland window whose class or transient state is set after windowAdded and which starts as
  "ignore" (e.g. skipTaskbar, quake role) stays unmanaged for good;
- the reverse direction is asymmetric too: reclassify returns at 377 when a managed window becomes
  "ignore" (class changes to plasmashell, skipTaskbar later set), so it stays in the tree.
Fix: connect the re-evaluation signals (readyForPainting, caption, windowClass, transient,
desktopsChanged, skipTaskbar if available) for every normalWindow, and in reclassify, if the kind
is "ignore" and the window is managed, forget it the same way the sticky path does (lines 414-423,
which should be factored into one helper).

## 5. LOW-MEDIUM (reading): login renumbering leaves other workspaces unreconciled

Lines 699-707. numberScreens overwrites `home` (workspaces.js:61-62) after windows restored by the
session may already have been adopted with homes taken from their then output. Only the focused
workspace is scheduled (via wantFocus), so the other workspaces' windows stay on their old output
until some later event. Fix: `scheduleAll()` in the handler after numberScreens. Also
`renumbered` is only set by the first activity event; if that never fires numbering is not
redone, which is as i3ws behaved, so fine.

## 6. LOW: sticky path and forgetWindow bookkeeping

- The desktopsChanged sticky branch (414-423) does `model.close(key)` and deletes wins/expected but
  not `connected`, `placing` or `keptAbove` (setFloatingLook clears keptAbove only when it was set)
  and does not call wantFocus, unlike forgetWindow (369-370). If the closed window was model
  focus, model.focused moves to a sibling and KWin focus is not reconciled until the next event.
- forgetWindow never deletes `connected[key]` (387) and the signal closures keep the dead window
  object alive: a slow leak of one small entry per window for the life of the session. IDs are
  unique, so no wrong behaviour. Fix: delete `connected[key]` and `placing[key]` in forgetWindow.
- desktopsChanged can fire for a window that forgetWindow just dropped; line 413 then calls
  adoptWindow, saved only by `w.deleted` in Rules.classify (rules.js:20). Keep that check; add a
  comment, since it is the only thing preventing resurrection.

## 7. LOW: act() reconciles every workspace on every key (lines 510-523)

`scheduleAll()` at 519 makes each keypress rebuild and size-check all 10 workspaces, including
hidden ones, and logs a TREE line for each. Correct but noisy; the comment says it is for moves
across workspaces. Only the origin, the destination (model.focused's) and, for move-to-workspace
and output moves, the target need it. Low priority because it is idempotent.

## 8. INFO / unverified

- Focus follows mouse: applyFocus warps the pointer only when the monitor changes (lines 487, 494).
  Moving focus between windows on the same monitor by key leaves the pointer over the old window;
  with strict focus-follows-mouse the next pointer motion re-activates it. I could not check
  whether Paul has FFM on; if so, add MoveMouseToFocus for same-monitor changes too.
- Key conflicts: Meta+V (Klipper), Meta+Arrows and Meta+Shift+Arrows (Quick Tile / Window to
  Screen) are stock Plasma bindings. The plan (lines 155-166) says the old script already owned
  its keys and Meta+L is unbound by setup.sh; I did not check that the other stock ones are
  unbound in kglobalshortcutsrc. KWin assigns a script's default key only if free, so a
  conflict shows as a silently dead key, not an error.
- A desktop current on two outputs is possible (repro, step 4) and nothing in workspaces.js
  prevents it: `showing()` returns the first screen found, which hides the second.
- tileChanged / minimized / fullscreen / drag handlers all re-check `model.byWin[key]`, so
  signals for removed windows are harmless. Drag-end onto another monitor looks right.
