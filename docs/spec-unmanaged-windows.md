# Spec: windows kwin-i3 doesn't manage change nothing you can see

Paul's go 2026-10-25, after two focus bugs in five minutes (the start menu sending the pointer to
the other monitor, fixed first: only key actions move the pointer; tray popups closing at once) and
a sweep for the pattern: **kwin-i3 reacting to a KWin event that wasn't about anything it manages,
then overriding something visible from KWin's global state.** The sweep was a code audit, an
independent second agent's audit (same findings, and more: below), and a battery of stand-in
windows (`tests/live/73-unmanaged-windows.sh`).

## The rule

Only kwin-i3's own key actions override what you see. A passive pass (a window closed, a reload, a
monitor change) never takes the focus from a window kwin-i3 doesn't manage, and never undoes
something done outside kwin-i3.

## The changes (`src/kwin.js`)

1. **A passive pass leaves an open, active window kwin-i3 doesn't manage with the focus**
   (`applyFocus`, `from` null): a panel popup, a dialog, KRunner, the lock screen. Any window
   closing ran the pass (`forgetWindow`), so a tray icon's tooltip going as its popup opened handed
   the focus back to the tiled window, and Plasma closed the popup. When that window itself closes,
   its own pass brings kwin-i3's focus back. The desktop and the panel hold the focus only when
   nothing else does, so they don't count.
2. **kwin-i3's focus follows a desktop switched outside it** (`shownOutside`, on
   `Workspace::currentDesktopChanged`): on the monitor kwin-i3's focus is on, the focus moves to the
   workspace shown there, as in i3. Before, the Overview switching to an empty desktop left the
   focus on the old workspace, and the next passive pass (a notification closing) switched the
   monitor back. kwin-i3's own switches go through `showOn` (and its activations are marked), so
   they aren't taken for outside ones; nothing is followed while monitors come and go.

A third change, no "Switch to Screen" from a passive pass, was dropped: with change 1 in place a
fault there changed nothing, so it would have been an untested second path.

## Tests

`73-unmanaged-windows.sh`: tooltips, notifications, OSDs, popups and dialogs coming and going in six
states (the pointer on the other monitor, a popup or a dialog active, one of kwin-i3's windows
closing meanwhile, an empty workspace focused with a desktop window there, a monitor switched outside
kwin-i3); each compares the focus, the pointer and what each monitor shows before and after. Red
before the change (6 checks); each change watched red alone under a fault.
