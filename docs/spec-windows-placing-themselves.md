# Spec: windows that place themselves change nothing you can see

(Renamed 2026-10-27 from `spec-unmanaged-windows.md`, for the words in `docs/spec-window-words.md`.)

Paul's go 2026-10-25, after two focus bugs in five minutes (the start menu sending the pointer to
the other monitor, fixed first: only key actions move the pointer; tray popups closing at once) and
a sweep for the pattern: **kwin-i3 reacting to a KWin event that wasn't about anything it manages,
then overriding something visible from KWin's global state.** The sweep was a code audit, an
independent second agent's audit (same findings, and more: below), and a battery of stand-in
windows (`tests/live/73-places-itself.sh`).

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

3. **A key that leaves kwin-i3's focus where it was** (a split, a resize, a layout toggle) takes no
   focus from an open window kwin-i3 doesn't manage (`act`): typing in Yakuake or KRunner, Meta+H
   used to hand the focus to the tiled window. Keys that move the focus still take it, as in i3.
   From the audit; `73` case 7, watched red under a fault.
4. **The login-only renumbering** (the first activity event renumbers every monitor 1, 2 …) is
   armed only at a login, not after a reload mid-session. From the audit; **untested live**: the
   test KWins have no activity manager (OPEN.md item 5).
5. **KWin activating a window its monitor isn't showing is refused** (`windowActivated`,
   2026-10-26, OPEN.md item 33): KWin switches the desktop before it activates a window elsewhere,
   so such an activation is a stale choice of KWin's, not a request. Seen when a monitor showing
   the focused, empty workspace is unplugged: kwin-i3 shows that workspace on the other monitor,
   as i3 does (`randr.c` `move_content`), and a millisecond later KWin activated a window of the
   workspace it replaced. Taken into the model, the next passive pass would have switched the
   monitor to that window's workspace. Now it isn't taken, and the focus goes back where the model
   has it, so what you see stays. Test: fuzzer seed 30 (shrunk to 38 actions; in git at 1a9e32d, `tests/fuzz/i33/`),
   red on main 3 of 3, clean with the change; `84-unplug-focus.sh` guards the plain case, which
   KWin gets right by itself (the long trace's trigger was not pinned down).

A change, no "Switch to Screen" from a passive pass, was dropped: with change 1 in place a
fault there changed nothing, so it would have been an untested second path.

## Tests

`73-places-itself.sh`: tooltips, notifications, OSDs, popups and dialogs coming and going in six
states (the pointer on the other monitor, a popup or a dialog active, one of kwin-i3's windows
closing meanwhile, an empty workspace focused with a desktop window there, a monitor switched outside
kwin-i3); each compares the focus, the pointer and what each monitor shows before and after. Red
before the change (6 checks); each change watched red alone under a fault.

## Left from the audit (closed 2026-10-25)

From the audit, won't-fix unless seen (Paul, 2026-10-25): an unmanaged window quick-tiled into
kwin-i3's tiles loses its tile (very rare). A capture of it would reopen it.

Not a bug (probed 2026-10-25): the frame's click handling can't swallow the click that dismisses a
menu during a popup grab. In KWin 6.7.5 the popup filter comes before the frame's
(`InputFilterOrder`: `Popup` < `Decoration`, `input.h`). A press outside the popup's app cancels
the popups and is eaten there (`popup_input_filter.cpp`), so `FrameFocus` never sees it and
`pointer()->hover()` doesn't come into it. Probed on a test KWin with the plugins: two tiles, b
opening a GTK 4 `MenuButton` popover (an `xdg_popup` with a grab). A click on a's frame, on b's own
frame and in a's client area each closed it, and a frame click with no popup still activated a. The
probe script stayed in the session's scratchpad. A popover that fills its window gets a 1 px
configure from KWin and closes at once: the button must leave room below it.

Won't-fix (Paul, 2026-10-25): the audit also found that a keep-above the user set is cleared when
the window tiles again, and that unticking it on a floating window doesn't stick. Both are i3's
model. Tiled windows never overlap, so the flag means nothing on one, and i3 has no such flag.
Floating windows always sit above tiled ones, and kwin-i3 uses the flag to put them there
(`lookFloating`), except on a workspace of Plasma windows, where the user's choice holds.

