# Review of src/tree.js, 2026-10-22

Scope: `src/tree.js` only, against i3 `next` (move.c, tree.c, con.c, floating.c, workspace.c,
resize.c, commands.c, fetched 2026-10-22). `make unit` is green. I also ran a throwaway random-op
fuzzer (3000 runs x 40 ops each, seeds 1-4, ops: open/close/move/split/toggleFloating/
moveToWorkspace/focusDir/toggleSplit/resize/focusWin/setFullscreen, with a fake output
neighbour). Invariants checked: every focus array is exactly nodes + floating, parent pointers,
no empty splits, sibling shares sum to 1, no stale `byWin`, focus never detached. **No violation
found.** Fuzzer: `/tmp/claude-1000/fz/fz.js`. Probes: `/tmp/claude-1000/fz/t1.js`, `t2.js`.

The port matches i3 closely: `insert_con_into`, `attach_to_workspace`, `tree_move`'s do/while,
`con_fix_percent`, `tree_flatten`, `con_next_focused`, `floating_enable` / `floating_disable`,
`ws_force_orientation`, `tree_split`, and `resize_find_tiling_participants` all agree with the
C line for line, including the quirks (focus tail-insert in `_con_attach`, leaf swap not
touching percent or focus).

## Findings, by severity

### 1. (medium) Two fullscreen leaves on one workspace wedge focus
`setFullscreen` (l.704-707) only sets a flag. i3's `con_toggle_fullscreen` first un-fullscreens
the workspace's existing fullscreen con. KWin does not make fullscreen exclusive (F11 in a
browser, then a video player on the same desktop).

Scenario (verified, t2.js): `H[1! 2 3*!]`; `focusDir("left")` returns null. `fullscreenOn`
(l.80-88) returns the first in breadth-first order (leaf 1), so `permitsFocusing` refuses
everything except 1. Un-fullscreening 3 does not help while 1 stays flagged.

Fix: in `setFullscreen(win, true)`, clear `fullscreen` on every other leaf of `wsOf(con)` (what
i3 does), or have kwin.js call `setFullscreen(other, false)` for the old one.
Also make `fullscreenOn` prefer the focused one if you keep two.

### 2. (medium) `open` / `openFloating` are not idempotent: a repeated add creates a ghost leaf
l.236-248, 251-256. Calling `open(2, ws)` for a window already in `byWin` (KWin re-announces a
window on a desktop change, restart race, or `adopt` plus a late add event) attaches a second
leaf and overwrites `byWin[2]`. The old leaf stays in the tree, focusable and sized, with no
window behind it. It can never be closed because `close()` goes through `byWin`.
Verified: `H[V[H[1] 2 3* 2]]`.

Fix: at the top of both, `if (this.byWin[win]) return this.byWin[win]` (or move it to `ws` if
the workspace differs, via `moveToWorkspace`).
Other callers have no protection. Same for `adopt` when a spec window id is already in `byWin`
on another workspace: its old leaf is not removed.

### 3. (low-medium) `moveToWorkspace` focuses a window under a fullscreen window on the target
l.518-542. i3 `_con_move_to_con` step 6 skips `con_activate` when the target workspace has a
fullscreen con (`!fullscreen`), unless the moved con was itself fullscreen (it first
un-fullscreens the target's). The port always calls `focusUp(con)` (l.539).

Verified: ws2 has fullscreen `1`; move `2` there; `ws2.focus = [2, 1]`, so switching to ws2
focuses a window hidden behind the fullscreen one.

Fix: `var fs = fullscreenOn(ws); ... if (!fs || con.fullscreen) focusUp(con)`. Note `fs` is
cleared on l.532 only when `con.fullscreen`, so the test is already available. For a
non-fullscreen `con`, `fs` stays set and the move must not touch the focus order. Also the
moved con should be appended at the focus tail (the plain `attach` already does that).

### 4. (low) `permitsFocusing` is a per-workspace rule, i3's is relative to the focused window
l.90-94 uses "the fullscreen con on the workspace of `con`". i3's `con_fullscreen_permits_focusing`
looks at the fullscreen ancestor of `focused` (con.c). Differences:
- Focus is on a floating window or an empty workspace while a tiling leaf is fullscreen: i3
  allows moving focus among tiling windows (fs is the workspace); the port refuses.
- It matters for `tree_move`'s check (l.497) and `focusDir` (l.677, 679).
Realistic only with a floating window focused over a fullscreen app. Acceptable to leave, but
the header should say it differs. Fix if wanted: compute `fs` from `this.focused` as in C.

### 5. (low) `setLayout` / `toggleSplit` on a workspace leaves the lone child with `percent` 0
l.316: `wrapChildren(con, newCon(layout), false)` then `flatten()`; no `fixPercent(ws)`. i3
does not either (its renderer falls back to 1/n for a 0 share). Verified: `H[H[1] 2 3]` then
`toggleSplit(2)` gives `H[V[H[1] 2 3]]` with `ws.nodes[0].percent === 0`. If kwin.js reads
`percent` directly for a single child, it sees 0. Later `open`/`fixPercent` self-heal. Fix: call
`fixPercent(con)` after l.316 (harmless; a single child becomes 1.0). Same for `split()` on a
workspace (l.288) and `forceOrientation` which does fix it.

### 6. (low) `adopt` accepts an empty split spec and keeps it
l.719: `s.kids` truthy with `[]` builds a split with no children that nothing ever closes
(`onRemoveChild` only runs on removals). Verified: `H[V[] 5]`. Fix: skip specs with
`kids.length === 0` in `build`, or call `onRemoveChild` afterwards.

### 7. (low) `adopt` closes the old tiling cons via `closeCon`, which moves focus
l.717. If the focused leaf was in the replaced tree, `closeCon` activates a neighbour or the
workspace, and the true focus is only restored by a later `focusWin`. The header says so; just
make sure kwin.js calls `focusWin(activeWindow)` right after `adopt`. Floating focus survives.

### 8. (info) `floatingEnable` of a fullscreen leaf drops the fullscreen flag
l.562: `newFloating` has `fullscreen: false`, and `setFullscreen` ignores floating nodes
(l.706). i3 keeps `fullscreen_mode` on the con inside the floating wrapper. Fine in this model
(the flag would be unreachable by `fullscreenOn` anyway), but a window toggled floating while
fullscreen comes back tiled and not fullscreen. Matches the design note "per-output fullscreen
flag on the leaf".

### 9. (info) Faithful i3 behaviour that can look like a bug
- `forceOrientation` / `wrapChildren` (l.219-230) append the new split at the tail of
  `ws.focus`. With a floating window present, `descendFocused(ws)` then returns the floating
  one until the next `activate`. Same in i3 (`con_attach(split, ws, false)`).
- `setLayout`'s #3001 branch (l.321-327) and `flattenCon` call `closeCon(con, true)` on a
  possibly focused split; works (`nextFocused` handles it), and the fuzzer never broke it.

## Edge cases probed, all fine
Empty focused workspace: `focusDir`, `focusModeToggle`, `toggleSplit` return null / no-op, no
exception. Floating-only workspace: `open` then lands as a tiling leaf; `focusDir` cycles;
closing the focused floating window focuses the tiling leaf; `toggleFloating` back to tiling
works. Moving the last window: goes to `moveToOutputDirected`, no-op without a neighbour.
Close of a window not in `byWin`: no-op. `focusWin` unknown id: returns null. `resize`: rejects
shrink-to-zero and grow-into-zero, both directions.

Exceptions on odd input: `move`, `split`, `toggleSplit`, `floatingEnable/Disable`, `resize`
guard null; `moveToWorkspace(con, ws)` with a stale `con` (already closed, `parent` still
set) would operate on a detached node, and `insertConInto` throws "not in the same tree" if
given cons of different workspaces. kwin.js always goes through `byWin`, so this is not
reachable today.

## Untested paths (tests/unit/tree.test.js has no case; mutate.py would not notice)
- `open` / `openFloating` twice with the same id (finding 2).
- `setFullscreen` at all, with two fullscreen leaves (finding 1), and `moveToWorkspace` with
  a fullscreen con or a fullscreen target workspace (finding 3).
- `floatingEnable` of an UNFOCUSED window: the `placeholder` / `before` focus-stack placement
  (l.551-559, 565-571) has no test. A wrong `before` flip would not fail any current test.
- Closing a focused floating window (l.151 `descendFocused` branch of `nextFocused`).
- `moveToWorkspace` of a floating window (`target = ws`, l.530) and of a split container.
- `adopt` with nested kids, empty `kids`, and a window id already known.
- `focusDir` from a floating window in both directions, and up/down (returns null).
- `resize` with `ppt < 0` growing siblings, and the `MIN_SHARE` boundary on the shrink side.
- `describe` / `focusOrder` are test helpers and fine.

Suggested mutations for mutate.py: flip `before` in `floatingEnable` (l.554 / 565); drop the
`!isFloating(con)` guard in `closeCon` l.264; make `attach` use `ignoreFocus = true` always;
remove `fix_percent` in `insertConInto` l.416. Check each turns a test red.
