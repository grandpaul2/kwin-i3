# Real-input live tests — design for review (2026-10-22)

Replaces plan phase 4 ("a nested KWin window with Paul"). Paul: *"I don't understand why this can't
be automated ... there will be more features built in the future that will need similar testing
too. So why not go ahead and set the precedent now?"* and *"make sure the tests get reviewed before
they are implemented."* This document is what gets reviewed; nothing below is written yet.

## Tooling (built and probed, committed)

- `tools/inject.py CMD...` — real pointer/keyboard input into the test KWin through libei
  (`org.kde.KWin.EIS.RemoteDesktop.connectToEIS`), via `tools/bin/ei-send` (`make tools`).
  Commands: `abs X Y`, `btn left|right|middle down|up`, `key CODE down|up` (evdev), `wait MS`.
  Refuses to run unless inside `tools/testkwin.sh` (private bus).
- Probed 2026-10-22 in the headless KWin: a real Meta+V (125, 47) runs kwin-i3's "Split V"
  through kglobalaccel; Meta+right-drag resizes a tiled window (a went 640 -> 760 px wide);
  Meta+left-drag of a tiled window onto the second monitor made it float there, on workspace 2.

## Test KWin config changes

To behave like Paul's desktop, `tools/testkwin.sh` writes his focus settings (read from his live
kwinrc 2026-10-22, and set by `~/.dotfiles/setup.sh`): `[Windows] FocusPolicy=FocusFollowsMouse`,
`NextFocusPrefersMouse=true`, `DelayFocusInterval=150`. Open question for the review: does turning
focus-follows-mouse on for *every* scenario make the existing ones flaky (the pointer rests at the
screen centre at start, so whatever window is under it gets focus after 150 ms)? Alternative: only
`50-input.sh` gets it, through a `KI3_KWINRC_EXTRA` hook in testkwin.sh.

## lib.sh additions

- `press "Meta+Shift+V"` — parse a chord into evdev codes, inject modifiers down, key down/up,
  modifiers up (one inject.py call). Table: Meta 125, Shift 42, Ctrl 29; letters by evdev code;
  digits 2-11; Left 105, Right 106, Up 103, Down 108, Space 57, `;` 39.
- `drag <mods> <button> X1 Y1 X2 Y2` — modifiers down, move to X1 Y1, button down, move in 4
  steps with `wait 30`, button up, modifiers up.
- Waits stay event-driven: `wait_log "^.{9}ACTION <name>$" "$m"` after a press; after a drag,
  wait for the next `TREE` line after a mark, then `wait_geom` / `wait_tree`.

## Scenario 50-input.sh

1. **Every default key, pressed for real.** For each action in kwin.js `KEYS` plus the workspace
   keys (Meta+1..0, Meta+Shift+1..0), press its chord(s) and require the `ACTION <name>` line.
   Closes the gap that `key` (invokeShortcut) bypasses the bindings. The actions' effects are
   already covered by 10-40; here only "the key reaches the action". ~40 presses; at ~50 ms each,
   ~2 s. Question: run with no windows (actions are no-ops but still log ACTION), so no state
   leaks into the rest of the scenario?
2. **Border drag resizes, and the model keeps it.** Two windows a | b. Meta+right-drag from inside
   a near its right edge (600,360) to (760,360). Expect a 760 px wide. Then force a reconcile from
   the model (e.g. press Meta+Left, which re-applies sizes) and require a to *stay* 760: without the
   read-back (kwin.js `readBack`), reconcile would snap it back to 640.
3. **Dragging a tiled window out floats it where dropped.** Meta+left-drag b from its middle by
   200 px within the monitor: tree shows `~b`, b's frame is where it was dropped (±1 px), a fills
   the monitor.
4. **Dragging a window onto the other monitor** joins the workspace shown there (floating), the
   source workspace re-tiles without it.
5. **Focus follows the mouse.** Pointer onto b: within ~150 ms b is KWin's active window, and the
   model follows: a following real Meta+V splits *b* (tree `H[a V[b]]`), proving the model's focus
   is b, not just KWin's.
6. **Pointer follows focus across monitors without focus bouncing back.** Windows on both monitors,
   pointer over the right one; real Meta+Left focuses the left window and warps the pointer there;
   after 300 ms (> DelayFocusInterval) the active window is still the left one.
7. **Click focuses.** Click on a window: the model's focus follows (checked as in 5).

## Faults for `make mutate-live` (each must turn 50-input red)

- `readBack` disabled -> 2.
- "dragged out of its tile floats" disabled (tileChanged `dragging === "move"` branch) -> 3.
- dropped-on-another-monitor join disabled (dragEnd) -> 4.
- windowActivated not followed -> 5 and 7 (exists for 10-tiling; add 50-input as its scenario too?).
- pointer warp disabled -> 6 (exists).
- a key table typo (e.g. Split V bound to Meta+B) -> 1.

## Questions for the reviewer

- Are the pixel targets in 2-4 robust, given the client's minimum size (150x150) and that KWin
  may snap/clamp during interactive moves?
- Is `wait 30` between drag steps enough for KWin to register a drag, or should the drag wait for
  `interactiveMoveResizeStarted` (logged by kwin.js)?
- Anything in Paul's real setup that the headless KWin lacks and that would make these tests pass
  while his desktop fails (e.g. his `CommandAllKey`, Krohnkite gone, i3frame borders, a real
  pointer acceleration profile)?
