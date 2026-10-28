# Spec: redo stage 6, clicks, closes, minimize (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §5 C7 (i3's next focus for every close), C9 (minimize as `move
scratchpad`), §9 G1, G3, G4, G7/Z7, Z1, Z3, F4, all decided (Paul, 2026-10-27).

## What happens today, from the sources

**Closes** (`src/kwin.js` `connectWindow`'s `closed`, `forgetWindow`): kwin-i3 records i3's next
focus (`model.nextFocused`, i3's `con_next_focused`) **only** for a tiling window in a split with
another window left, and puts it back over KWin's choice after the close. Elsewhere (a workspace's
top level, a floating window) KWin's choice stands: its focus chain's most recent window, which
with Paul's `NextFocusPrefersMouse=true` is the one under the pointer. Why only there:
`ea3ea95` (2026-10-25) found that taking the tree's choice everywhere failed 20-rules and
25-settings, "KWin's record is the fuller one" (activations before kwin-i3 adopted a window, or
before a reload); which checks, and why, wasn't kept.

**Minimize**: the model has no notion of it. Only the projection onto KWin's tiles skips a
minimized window (`src/kwin.js:186`, `inLayout`), so its share goes to its siblings and it comes back where
it was. Focus can still point at it (a focus key, `con_next_focused`, a workspace's last focus),
and KWin's `activateWindow` un-minimizes what it activates (`activation.cpp:333`): C9's
"unchecked" is this.

**The mouse** (`plugin/tilingdrag.cpp`, `plugin/framefocus.cpp`, `startDrag` and `resizeEdge` in
`src/kwin.js`): §9's G, Z and F rows as they stand, with i3's `click.c`, `tiling_drag.c` and
`drag.c` read for them on 2026-10-27.

## Design

### A. Focus after any close (C7)

At a focused window's `closed` signal, always record `model.nextFocused(con)` (the condition on a
split with another window goes), and put it back over KWin's choice after `windowRemoved`, as for
a split today. For a floating window i3's `con_next_focused` takes the workspace's focus order
(`tree.js`'s port already does: `isFloating`).

**First, on the build's branch, for Paul's go** (a run of a changed build, not one of
`docs/testing.md` P1's): run 20 and 25 with the condition removed, and read the failing
checks' logs, to name what "KWin's record is fuller" was. The fix goes where the model's record is
short, not back to KWin's choice: the likely causes are windows adopted at load (adopted bottom of
the stack first, P4, so their order should follow stacking) and activations of windows before
they were adopted. If one can't be fixed in the model, that case comes back to Paul with what it
costs.

### B. Minimize (C9)

- The model marks a con **minimized** (`minimizedChanged` sets it; a new window that opens
  minimized is marked at adoption).
- **Focus never goes to a minimized window by kwin-i3's own choice**: `nextFocused`,
  `descendFocused` (a workspace's last focus), the focus keys (§2 T rows) and Focus Mode Toggle
  skip minimized cons, as i3's focus never reaches the scratchpad's windows.
- **Minimizing the focused window**: the focus goes to `nextFocused`, over KWin's choice. Not as
  A records it: KWin activates its choice inside `doMinimize` (`xdgshellwindow.cpp:858-863`,
  `x11window.cpp:1119-1124`) **before** `minimizedChanged` is emitted, so the script hears the
  activation first. The `windowActivated` handler therefore checks the window that had the
  model's focus: already minimized (KWin sets the flag before choosing), it is a minimize, and
  the model's choice is `nextFocused` of that window, taken before the new activation is.
- **Restoring** (the task manager, Alt+Tab: an activation): it takes the focus where it was in the
  tree (V7's "back where it was"), as today.
- A minimized window keeps its place in the tree and its share is its siblings' (the projection,
  as now). §10 V7 and §5 C9 rewritten as built.

### C. The tiling drag (G1, G3, G4, G7)

- **G1** (`tilingdrag.cpp`): a Meta+left press starts the drag **without activating** the window
  (`MouseActivateAndRaise` goes; i3's step 2 comes before step 3). After the drop, `Tree.drop`'s
  own rule (focus only if the dragged window had it) decides, as now. The title-bar drag keeps its
  activation (i3's step 3 then 8).
- **G3**: `tilingDrag` (`off`, `modifier`, `titlebar`, `modifier titlebar`; default the last), read
  by the helper from kwinrc as its other settings are; `off` leaves Meta+left to KWin (floating
  windows move as usual, tiling ones don't).
- **G4**: **kept as today** (call 42, Paul 2026-10-28). Passing the press on can't be done as decided: KWin's input filters run
  in order (`/usr/include/kwin/input.h`: … Effects, …, **WindowAction** …), the helper's at
  Effects, so a Meta+left press it lets go reaches KWin's window-action filter, whose Meta+left is
  KWin's move: the window would be pulled out of its tile and floated, not clicked. Today's
  swallow is there for that; nothing changes, only G4's row (≠, with this reason).
- **G7, and Z7 for the resize** (i3's `drain_drag_events`): **any key press** cancels (it then goes
  on as usual, so a key binding still runs, as in i3). The helper's drag filter is at KWin's
  Effects order, after GlobalShortcut, so a bound key never reaches it: the cancel needs a key
  filter **before GlobalShortcut** (TabBox's order), installed only while a drag runs, as stage
  5's mode does; **any button's release** drops, at the
  pointer, as the drag button's release would (another button's press is swallowed); **a window
  closing on the focused workspace** aborts (the script ends the drag on that window's `closed`).

### D. The tiling resize (Z1, Z3)

- **Z1** (`resizeEdge`): the nearest of the four edges, as i3's `floating_mod_on_tiled_client`
  (strictly nearest; a tie: nothing); if that edge has nothing to resize against, nothing. The gap
  press (Z2, kept) takes the nearest tiling window and then the same rule.
- **Z3** (`framefocus.cpp`, then the helper's resize): a plain left or right press on the ring
  starts the resize at once, against the neighbour on **the side pressed** (i3's
  `tiling_resize`, `CLICK_BORDER`: top, then left, right, bottom at a corner), not the nearest
  edge. The press still activates and raises (F3). No neighbour on that side: only the
  activation. The helper reports the side with the press (`resize <id> x y <side>`), and
  `resizePlan` takes it in place of `resizeEdge`.

### E. A scroll on the ring (F4)

`FrameFocus::pointerAxis`: a scroll with no modifier on a ring activates its window (i3's step 3)
and is swallowed, as now.

## Paul's calls (2026-10-28)

42. G4 **kept as today**: with nowhere to drop, a Meta press activates the window and is swallowed,
    ≠ i3 with KWin's reason (its window-action filter would float the window).

## Tests

- **Run**: `make unit`; 79 (close focus), 20, 25 (A's first step), 30 and 85 (minimize appears in
  both), 52 (mouse), 86 (tiling drag), 58 (frame cases), 55, 64 (a helper change).
- **Expectations that change**: none in 79 (its first case, `H[a b c]` closing c, is a top-level
  close where KWin's choice and i3's agree; its second is the split case); 86's Meta-drag focus (the dropped window had focus only if it was focused before)
  and "another button cancels".
- **New checks, for Paul's go** (rule 5): 79, its top-level case again with the pointer resting
  on another window, and a floating close, both taking i3's next focus (C7); 30 or 86, minimizing the focused window
  focuses i3's next, and a focus key never lands on the minimized one (C9); 86, a Meta-drag of an
  unfocused window leaves focus where it was (G1), any key cancels and another button's release
  drops (G7), a press with nowhere to drop reaches the app (G4); 58, a ring drag resizes on its
  side (Z3) and a ring scroll focuses (F4).
- **Unit, for Paul's go**: `tests/unit/tree.test.js` (it exists and loads `tree.js`): the
  minimized skip in `nextFocused` and `descendFocused`.

## Live check (Paul)

Close a window at a workspace's top level, or a floating one, with the pointer over another
window: focus goes to the one you used before, not the one under the pointer. Minimize the focused
window: focus goes to the previous one; Meta+arrows never bring the minimized one back. Meta-drag
a window you're not in: your focus stays. Drag a ring to resize; scroll on a ring.

## Done when

Live and Paul's "it works": C7, C9, V7, G1, G3, G4, G7, Z1, Z3, Z7, F4 rewritten as built;
`LATER.md` item 30 (focus after a close on a stock install) closed by A, or its remainder said.
