# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. The dotfiles' `OPEN.md` keeps only what touches the system (phase 6).

Last reconciled: **2026-10-22**.

## Open

- **Fuzz finding I9: a window fullscreen on a monitor that is unplugged and comes back, its
  workspace hidden meanwhile, ends up floating off its monitor** (seed 214, reproduces every replay
  of the 138-step trace; the shrinker only got it to 115 in its 20 minutes, each replay being minutes
  long). Cause, from KWin 6.7.5's source and a traced replay: when the monitor returns,
  `PlacementTracker::restore` (`placementtracker.cpp:129`) asks the window to be fullscreen again and
  moves it back; the window sits on a hidden desktop, never redraws, so never acknowledges, and while
  that request is pending KWin calls it not resizable (`xdgshellwindow.cpp:684`) and applies no
  geometry. `Tile::manage` refuses it, kwin-i3 floats it where it stands, on the other monitor.
  Tried in a worktree, none enough: keeping it out of the layout instead of floating (it then stays
  tiled, invisible, on the wrong monitor); cancelling the pending fullscreen in `relocate()` (it
  tiles in the model, but KWin still applies no geometry until the client acknowledges). Next:
  Paul's call between (a) find a way to make the hidden window acknowledge (e.g. briefly show its
  desktop on the monitor it stands on), (b) accept it: the window comes right once shown, and skip
  I9 for this signature in the fuzzer, (c) look for how KWin itself expects scripts to handle this.
- **`51-input.sh` failed once in the full parallel suite** ("solo fills the monitor again": 1176
  wide after the resize drag, wanted 1280), 1 of 4 full runs on 2026-10-22, never alone (3/3). Next:
  if it recurs, look at the post-drag refit (`src/kwin.js`, "A tiled window fills its tile") under
  load rather than raising waits.

`tests/fuzz/out/` is gitignored: those traces live only on this disk.
