# Real-input live tests: what they are and why

**Now (2026-10-27):** built 2026-10-22 and run in every `make test` (scenarios 50 and 51; the
tiling drag's 86 and the hold's 52 use the same tools). Its review is in git history
(`git show 3d98bd2:docs/input-tests-review-2026-10-22.md`); the fault battery that once named these
scenarios waits in `LATER.md` item 36.

They replaced plan phase 4 ("a nested KWin window with Paul"). Paul: *"I don't understand why this
can't be automated ... there will be more features built in the future that will need similar
testing too. So why not go ahead and set the precedent now?"*

## The tools

- `tools/inject.py CMD...`: real pointer and keyboard input into the test KWin through libei
  (`org.kde.KWin.EIS.RemoteDesktop.connectToEIS`), via `tools/bin/ei-send` (`make tools`).
  Commands: `abs X Y`, `btn left|right|middle down|up`, `key CODE down|up` (evdev), `wait MS`. It
  refuses to run outside `tools/testkwin.sh` (a private bus). It can't scroll (`LATER.md` items
  10, 11).
- `tests/live/lib.sh`: `press "Meta+Shift+V"` (a chord as evdev codes; `:` is Shift+;), `drag`,
  `sdrag` and `point`. Waits stay event-driven: the `ACTION <name>` log line after a press, the
  next `TREE` line after a drag, then `wait_geom` / `wait_tree`.
- The test KWin runs Paul's focus settings in a scenario marked `# focus: mouse`
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
