# Real-input live tests: what they are and why

**Now (2026-10-27):** built 2026-10-22 and run in every `make test` (scenarios 50 and 51; the
tiling drag's 86 and the hold's 52 use the same tools). Its review is in git history
(`git show 3d98bd2:docs/input-tests-review-2026-10-22.md`); the fault battery that once named these
scenarios waits in `LATER.md` item 36.

They replaced a plan to test by hand in a nested KWin window: input like this can be automated,
and features built later will need the same kind of testing, so the precedent was set early.

## The tools

- `tools/inject.py CMD...`: real pointer and keyboard input into the test KWin through libei
  (`org.kde.KWin.EIS.RemoteDesktop.connectToEIS`), via `tools/bin/ei-send` (`make tools`).
  Commands: `abs X Y`, `btn left|right|middle down|up`, `key CODE down|up` (evdev), `wait MS`. It
  refuses to run outside `tools/testkwin.sh` (a private bus). It can't scroll (`LATER.md` items
  10, 11).
- `tests/live/lib.sh`: `press "Meta+Shift+V"` (a chord as evdev codes; `:` is Shift+;), `drag`,
  `sdrag` and `point`. Waits stay event-driven: the `ACTION <name>` log line after a press, the
  next `TREE` line after a drag, then `wait_geom` / `wait_tree`.
- The test KWin runs the focus settings kwin-i3 is designed around in a scenario marked `# focus: mouse`
  (`FocusPolicy=FocusFollowsMouse`, `NextFocusPrefersMouse=true`, `DelayFocusInterval=0`); the
  others keep KWin's click to focus.

## The scenarios

- **50-keys**: every default key, pressed for real (`tests/keys.json`), each must reach its
  action's `ACTION` line. `key` (invokeShortcut) bypasses the bindings; this doesn't.
- **51-input** (`# focus: mouse`), without the helper plugin: a border drag resizes and the model
  keeps it (`readBack`); a tiled window dragged out with Meta floats where dropped (KWin's own move,
  as with no helper); dropped on the other monitor it joins the workspace shown there; focus
  follows the mouse and the model follows KWin; a key that moves focus across monitors warps the
  pointer without focus bouncing back; a click focuses.

With the helper loaded, Meta+drag and Meta+right-drag are the tiling drag and resize instead
(`docs/behaviour.md` §9), tested in 86.
