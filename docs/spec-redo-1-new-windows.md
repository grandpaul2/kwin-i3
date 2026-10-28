# Spec: redo stage 1, where new windows open and outside desktop switches (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §5 C1, C2, C3, C5, D2, D3 and §4 S4, all decided (Paul, 2026-10-27/28).
This stage is the 17:05 capture's (`~/.local/state/kwin-i3/captures/2026-10-27_170539.003`, kept
until it is live): Prism Launcher's "Please wait…" dialog opened while focus was on the empty
workspace 5 of the other output, two outputs showed workspace 5, and Prism moved output.

## What happens today, from the sources

**KWin 6.7.5** (`src/`, read for this spec):

- A new Wayland toplevel starts on **KWin's active output** (the pointer's) with the current
  virtual desktop (`xdgshellwindow.cpp:506-508`); a session restore or a KWin rule can give it
  another (`initialDesktops`, `:1363`; `rules()->checkDesktops`, `:1456`). An X11 window can ask
  with `_NET_WM_DESKTOP` (`x11window.cpp:648`, "Initial desktop placement").
- `addWaylandWindow` (`workspace.cpp:911-955`) places it (a dialog over its parent, so possibly on
  another output), then **activates it, then emits `windowAdded`**, in one synchronous call.
- `activateWindow` (`activation.cpp:309-313`): a window not on its output's current desktop
  switches **that output** to the window's desktop (`SwitchToOtherDesktop`, Plasma's default).
  The script sees `currentDesktopChanged` first, then `windowAdded`, in the same event-loop turn.
- `Window::setDesktops` (`window.cpp:730-742`) moves a window's transients with it, and **a modal
  dialog's main windows with it**.

The capture shows that order live (17:05:30.578-.582): `SHOWN DP-6 4 -> 5 (outside)`, the focus
following to 5 (`shownOutside`), then `ACTIVE`/`ADD` of the dialog on 5, then Prism (the parent)
relocated to 5.

**kwin-i3**: `adoptWindow` (`src/kwin.js`) puts a new window on the workspace of its virtual
desktop (`wsForWindow`); `shownOutside` makes the focus follow an outside switch on the focused
output only; `keepsFullscreenFocus` skips any transient; `gotoWorkspace` shows an empty hidden
workspace on `workspace.activeScreen`.

**i3 4.24** (`manage.c`): a new window goes, in order, to an assignment's workspace, a specific
`_NET_WM_DESKTOP`'s, the launch workspace, else **the focused container's**. It takes the focus
only if its workspace is visible **and on the focused output** (`:437`), and under a fullscreen
window only if it is that window's transient (`:506-510`, `smart`). `workspace N` shows N on its
own output and focuses it (`workspace_show`).

## Design

### A. Which workspace a new window gets (C1, C3, and C4 kept)

At `adoptWindow` for a window that just appeared (`fresh`), the **target workspace** T is the
first that applies (stage 3 adds `assign` before 1, as i3 checks it first):

1. **A modal dialog whose parent is in the tree**: the parent's workspace (C3, ≠ i3, decided: KWin
   ties the two). Probe 90: KWin itself doesn't move the parent when the dialog opens; the tie
   fires only when someone calls `setDesktops` on the dialog later, and in the 17:05 capture that
   was kwin-i3's own `relocate`. So the dialog is given its parent's virtual desktop directly
   (the tie then sets the parent's to what it already is), and **never through `relocate`'s move
   via all desktops**, which would put the parent on all desktops too.
2. **A window that asked for a virtual desktop** (session restore, a KWin rule, X11
   `_NET_WM_DESKTOP`): that one (i3's `_NET_WM_DESKTOP`; C4, accepted: a hidden one switches its
   output). Seen as: its virtual desktop is not the one KWin gives by default, the current one of
   KWin's active output **before** this window's own switch (from B's record).
3. **Otherwise the focused workspace** (C1): the model's focused container's workspace; with no
   focus (a login's first window), KWin's choice stands.

A window already on T is adopted as today. Otherwise kwin-i3 gives it T's virtual desktop and
output (`relocate`'s path, which moves through sticky so a hidden client still answers); for case
1 that is the dialog's own `setDesktops`, which KWin's tie applies to the parent too, putting it
back.

**Known limit, written into §5 C1 when built**: a window that asks for exactly the virtual desktop
KWin would have given it anyway can't be told from one that didn't ask (KWin tells a script
neither), so it goes to the focused workspace. Only when the pointer's output and the focused one
differ.

### B. Switches a new window caused (C2)

`currentDesktopChanged` from outside (`!switching`) is **recorded, not acted on**:
`pendingShown.push({ output, previous, current })`, and a 0 ms timer handles the list. Because
KWin emits `windowAdded` in the same synchronous call as the activation that switched (above),
`adoptWindow` runs before the timer, and claims the entry on its window's output whose `current`
is its virtual desktop:

- **claimed, case A3 or A1**: the switch is undone, the output shows `previous` again (C2: a new
  window never switches what an output shows);
- **claimed, case A2** (it asked for a hidden workspace): the switch stands (C4), and its output's
  focus goes to it;
- **unclaimed**: an outside switch, section D.

### C. Focus for a new window (C1, C5)

As i3 (`manage.c:437`): the new window takes the focus only if T is visible and on the focused
output; otherwise the focus goes back to what had it (KWin activated the window already). Under a
fullscreen window on T (C5): only a transient **of the fullscreen window** (its `transientFor`
chain reaches it) or a window opening fullscreen itself takes the focus; any other newcomer,
another app's dialog included, opens behind and the fullscreen window keeps the focus
(`keepsFullscreenFocus`, its `w.transient` test replaced by the chain).

### D. Outside switches (D2, D3)

The timer's unclaimed entries, each as i3's `workspace N` for the workspace now shown, N, on
output X (the Overview, a pager, KWin's own desktop keys, an activation by Alt+Tab or the task
manager):

- N **lives on another output** Y (it has windows and Y is connected): X shows `previous` again,
  N shows on Y if it isn't already, and focus goes to N on Y (so two outputs never show one
  workspace: the capture's DP-4 and DP-6 both on 5);
- otherwise N is X's (claimed, as now) and focus goes to N on X: its fullscreen window, else its
  last focus;
- on **any** output, not only the focused one (D3);
- not while kwin-i3 switches (`switching`), rebuilds, or outputs come and go (as now).

An activation that switched (Alt+Tab to a window on a hidden workspace) is then followed by
KWin's `windowActivated`, which the model takes as today. A focus change across outputs warps the
pointer as A2 does today; A2's own change is stage 2's.

### E. An empty workspace shown by a key (S4)

`gotoWorkspace`: an empty hidden N shows on its assigned output, else **the focused output** (the
focused workspace's), else KWin's active output when nothing has focus. `moveToWorkspace` already
uses the window's output.

## Probe result (2026-10-28, probe 90, branch `probe-redo`)

Raw KWin, the parent on Virtual-1's desktop 2, the pointer on Virtual-0 (desktop 1), the parent's
modal dialog opening: `SHOWN Virtual-1 2 -> 1`, `ACTIVE "p dialog"`, `ADD "p dialog" desks=1
out=Virtual-1`, **all in one event-loop turn** (B's claim holds), and **no desktop change for the
parent at all** within half a second: KWin's tie didn't fire at the dialog's opening (A1 above).

## Tests

- **Run** (`docs/testing.md` P1): `make unit`; scenarios 32 (fullscreen open), 40 (monitors:
  line 48's "Meta+4 … opens on the current, first monitor" becomes the focused output, the same
  monitor there), 44 (dialog drag), 56, 72, 73 (popups and windows kept out of the tree change
  nothing: B's claim must not take their switches), 79 (close focus).
- **Unit, approved (Paul, 2026-10-28)** (`docs/testing.md` rule 5): A's choice of T and B's claim are pure functions of recorded state,
  so they go in a small module (`src/placement.js`, as `tree.js` and `rules.js` are), unit-tested;
  `src/kwin.js` itself is not unit-testable (its tests only read its text).
- **New scenario, approved (Paul, 2026-10-28)** (`docs/testing.md` rule 5): `87-new-window-placement.sh`, two
  outputs. (1) Focus on an empty workspace of one output, the pointer on the other, a window
  opens: on the focused workspace (C1). (2) The capture: a window with a modal dialog on output A,
  focus on output B's empty workspace, the dialog opens: on its parent's workspace, nothing moves
  output, no output switches (C2, C3). (3) A pager-style switch (`currentDesktop` set from the
  test) on output A to a workspace living on B: A shows what it did, B shows it, focus there
  (D2); the same on the unfocused output (D3). (4) Another app's dialog over a fullscreen window:
  the fullscreen window keeps the focus (C5). Justified: the capture's bug has no test, and
  nothing else drives B's claim. About 40 s, alone (two outputs).

## Live check (Paul)

The capture's case: Prism on one monitor, focus on an empty workspace of the other, start an
instance: the dialog opens over Prism, Prism stays, neither monitor changes workspace. The
Overview or the pager onto a workspace that lives on the other monitor: that monitor shows it,
focus goes there.

## Done when

Live and Paul's "it works": the rows' Result columns rewritten (C1 with its known limit, C2, C3,
C5, D2, D3, S4), their "Decided, not built" notes gone; the 17:05 capture deleted.
