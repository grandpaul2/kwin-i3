# Spec: redo stage 2, the pointer (OPEN.md item 40)

**Now (2026-10-28):** Built on branch `redo-2` (on `redo-1`) as designed below: `pointerMoved`,
`desktopActivated`, `keyboardHeld`, `focusUnderPointer`, the warp in `applyFocus` and
`windowActivated` (`src/kwin.js`), `Rules.i3Kind` with its unit test, the `mouseWarping` setting
(table, form, README); the checks in 40, 72 and 74; 72's case 1 and 73's premises updated to the
crossing rule. One addition the design didn't name: KWin's own next-window activation after a
window outside the tree closes (`closingOutside`, D7) is set aside, or the crossing's focus on an
empty workspace would snap back to the window KWin picks, and the pointer with it (72, case 1).
`make unit` and the scenarios green. **Done 2026-10-28**: merged, live, and Paul's "it works" on the live check below.
**Fixed the same day** (found by 68-workspace-commands while building stage 4): the warp's output
memory was a `var focusOutput`, which overwrote the `focusOutput(dir)` action's function in the
same scope, so every Focus Output key threw; renamed `focusedOutput` (commit on `redo-2`, the later
stages rebased on it).
Not testable with focus follows mouse: a key moving the focus to the output the pointer is already
on (D's pointer test), since the crossing has already moved the focus there; an activation with
the pointer there is checked instead (72, case 4).

**The rows**: `behaviour.md` §5 B2, B4, A2, A3-A5, E1 (§12 P2), and §11 N7's `mouse_warping`
setting, all decided (Paul, 2026-10-27). Together: focus and pointer never come apart, as in i3.

## What happens today, from the sources

**i3 4.24**:

- **Crossing** (`handlers.c` `check_crossing_screen_boundary`, from every motion): unless focus
  follows mouse is off, a pointer that moves onto another output focuses that output
  (`workspace_show`, then `con_focus` of its `con_descend_focused`): its workspace's last focus, or
  the empty workspace. Over a window, the enter event focuses that window first.
- **Root click** (`click.c` `handle_button_press`, "If the root window is clicked"): focuses the
  clicked output's visible workspace. A dock is never focused.
- **Warp** (`workspace.c:556-559`, `tree.c:617`, `x.c:1357-1376`): every focus change that moves
  to another output asks for a warp to the new focus's centre (an empty workspace: its rect);
  `x_push_changes` warps only if the pointer isn't on that output already. So a mouse crossing
  never warps, and a key, `workspace N`, a pager's `_NET_CURRENT_DESKTOP` or an activation does.
  `mouse_warping none` turns all of it off.
- **dmenu** grabs the keyboard: no binding fires until it goes.
- **Start** (`main.c:995-1010`): focus on the output under the pointer.

**KWin 6.7.5**: the script sees the pointer through `workspace.cursorPos` and its
`cursorPosChanged` signal (`scripting/workspace_wrapper.h:149, 276`); `workspace.activeScreen`
moves with the pointer but has no signal. With focus follows mouse, entering a window activates it;
the desktop window never (`window.cpp`, as today's B1, B2). A click on the desktop window
activates it.

**kwin-i3** (`src/kwin.js`): nothing follows a crossing (72-pointer-stays case 1 checks that the
focus stays); a click on the desktop window leaves it active until the next passive pass gives
the focus back (`applyFocus`, its Show Desktop check); `applyFocus` warps (`MoveMouseToCenter`,
`MoveMouseToFocus`) only when it was passed `from`, the output a key moved focus from; every key
acts whatever has the keyboard; at a login focus goes to workspace 1 (the activity handler in
`startRest`).

## Design

### A. Crossing onto another output (B2)

`workspace.cursorPosChanged`, with focus follows mouse on (`options.focusPolicy`; off: nothing,
i3's `focus_follows_mouse no`): the output under the pointer (`screenAt`) is compared with the
last one seen; the same: return. That is the whole cost per motion: a rectangle test against two
or three outputs, no allocation.

On a change to output X, the topmost window under the pointer on X decides (from
`workspace.stackingOrder`, top down, the first visible window on X's current virtual desktop whose
frame geometry holds the point):

- **a tiling or floating window**: nothing; KWin's focus follows mouse activates it (B1), as
  i3's enter event does;
- **none, the desktop window, or a dock** (a panel): i3's crossing: X's visible workspace gets the
  focus, its fullscreen window, else its last focus, or the empty workspace (§5 C8's state), no
  warp (the pointer is there);
- **an override-redirect window** (a popup that spans the boundary): the model's focus moves as
  above, KWin's active window stays with the popup (B2's "keeps the keyboard while the focus
  moves under it"), and a passive pass leaves it (D7).

Not while a tiling drag or resize runs (the helper holds the pointer), after a release, or while
outputs come and go (`screensChanged` resets the last output seen, from the pointer's position
then). kwin-i3's own warp needs no mask: it goes to the output that already has the focus, so the
crossing it causes finds nothing to change (a flag around `invoke` couldn't work anyway: the call
is asynchronous, the motion arrives after it).

### B. A click on the desktop window (B4)

`windowActivated` of the desktop window, with Show Desktop off: the focus goes to the visible
workspace of the output that window is on (its fullscreen window, else last focus, or the empty
workspace), applied at once, so the desktop window doesn't keep the keyboard. With Show Desktop
on, it keeps it (Plasma's edit mode, +). A click on a panel changes nothing (KWin doesn't activate
a dock), and what it opens is override-redirect (C). The known limit stays: typing into the
desktop itself (renaming an icon) loses the keyboard.

### C. Keys while an override-redirect window has the keyboard (A3-A5)

**Override-redirect** is §3's table, as a function in `src/rules.js` (`i3Kind(w)`: `dock` for a
panel, `root` for the desktop window, `override-redirect` for KRunner, popups, menus,
notifications, OSDs, the system windows of `ignoreClass`'s defaults, the logout screen). Stage 3
gives the rest of the kept-out windows their kinds through the same function.

Every kwin-i3 action (`act()`, and the guard around Meta+F and Meta+Shift+Q, `KWIN_OWN`) first
checks KWin's active window: override-redirect, the action does nothing and logs `KEY … ignored:
<caption> has the keyboard`. So Meta+Shift+Q never closes KRunner, and Escape comes first, as with
dmenu. Until stage 3, a kept-out window that isn't override-redirect (Yakuake, Spectacle) is as
today (A4: a focus key takes the keyboard from it).

### D. The warp (A2, N7)

`applyFocus` keeps the output its last focus was on. When the new focus is on another output and
the pointer (`workspace.cursorPos`) isn't on that output: the warp, to the focused window's centre
(`MoveMouseToFocus`) or an empty workspace's output centre (`MoveMouseToCenter`). What moves
the focus there, as i3's callers of `x_set_warp_to` (`workspace_show`, focus commands): a key,
stage 1's outside switch, an activation (Alt+Tab). **Not a close** (i3's close sets no warp:
the 2026-10-25 start-menu bug that 72 guards stays fixed). `from` today does two jobs: the output
focus left (the warp) and "a key asked for this" (the passive-pass test at `applyFocus`'s top,
which spares KRunner and popups); the warp's job moves to the kept last output, the key's stays
as a flag of its own (`byKey`). `mouseWarping` (`output` default, `none`): with `none`, no warp.

### E. Login (E1, P2)

The activity handler in `startRest` activates the visible workspace of the output under the
pointer (`screenAt(workspace.cursorPos)`), not workspace 1.

## Probe result (2026-10-28, probe 91, branch `probe-redo`)

Raw KWin, focus follows mouse, b focused on Virtual-0, the pointer moved onto a on Virtual-1:
`cursorPosChanged` comes once per motion event (34 for 34 steps); at the crossing
`workspace.activeScreen` is already the new output and KWin's active window is **still b**; KWin's
activation of a comes **in the next turn**. Back over the gap onto Virtual-0: the crossing, then
b's activation when the pointer reached it. A's hit test (what is under the pointer, not what is
active) is right for both orders.

## Tests

- **Run**: `make unit`; 72 (pointer stays: **its case 1 asserts today's behaviour, the focus
  staying; it changes to the decided one**, the empty workspace focused, still no warp), 73,
  71 (popup grace), 74 (Show Desktop), 33 (own keys: **its case 3, KWin's Meta+Shift+Q closing a
  window of an ignored class, changes** where that class is override-redirect: the key does
  nothing; with a floating-kind class it still closes), 41 and 84 (unplug focus), 40 (login
  numbering), 60.
- **Unit, approved (Paul, 2026-10-28)** (`docs/testing.md` rule 5; there is no `rules.test.js` yet): `i3Kind`
  against §3's table.
- **New checks in existing scenarios, approved (Paul, 2026-10-28)** (`docs/testing.md` rule 5; no new
  scenario): 74, a click on its stand-in desktop window with Show Desktop off gives the focus to
  the output's workspace (B4; nothing checks a desktop click today); 40, after the login
  numbering, the focus is on the output the pointer was parked on (E1); 72, a key moving focus
  to the other monitor while the pointer is already there doesn't warp (D's pointer test).

## Live check (Paul)

Focus on one monitor, move the pointer onto the other's empty workspace or its panel: a key now
acts there, and a new window opens there. Click the wallpaper on the other monitor: typing goes
nowhere, Meta+Enter's window opens there. KRunner open: Meta+Shift+Q does nothing. Meta+arrow
across monitors: the pointer follows; pointer already there (after a crossing): it doesn't jump.

## Done when

Live and Paul's "it works": B2, B4, A2, A3-A5, E1 and §12 P2 rewritten as built; §11 gains
`mouseWarping`; the settings page's control waits for stage 10 (the setting is in the Configure
form and kwinrc until then).

## Paul's review (2026-10-28)

59. Panel popups (the calendar, the tray, the app menu) hold the keyboard while open, so kwin-i3's
    keys do nothing until they close: C as decided, i3's dmenu rule; no exception for them.
