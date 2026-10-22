# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. The dotfiles' `OPEN.md` keeps only what touches the system (phase 6).

Last reconciled: **2026-10-22**.

## Open

- **Fuzz I10, flaky: a tiled window narrower than its tile** (2026-10-22 campaign: seeds 7, 14, 25,
  33, each 0/2 on replay; e.g. 1071 wide in a 1280 tile). Probably the same as `51-input.sh`'s one
  failure under the full parallel suite (1176 after a resize drag, wanted 1280; never alone, 3/3).
  Next: look at the post-drag/post-resize refit (`src/kwin.js`, "A tiled window fills its tile")
  under load, rather than raising waits.
- **Fuzz I1, seed 2: "window w3 not in its tile; window w12 not in its tile" on workspace 2**
  (138 steps, reproduces on every replay; the shrinker reached only 123 in its 20 minutes). Next:
  replay with a trace in a worktree to find the step where the two leave their tiles.
- **Fuzz I9, seed 28: a floating dialog (w7 dialog) off its monitor after an unplug and replug**
  (shrunk 73 -> 26 actions, `tests/fuzz/out/28/shrunk.json`, reproduces every replay). Traced: when
  the monitor returns, relocate() sends the parent w7 there; KWin's `sendToOutput` sends its
  transients along (`window.cpp:3918`), and the dialog, hidden, gets a request it never applies
  (its size changes too, 128 -> 178 high; the parent, same size, moved at once). relocate()'s own
  send of the dialog is then a no-op: KWin already counts it as on that monitor
  (`moveResizeOutput() == newOutput`, `window.cpp:3892`). Same family as the accepted I9 limit and
  the seed-1 fix (a hidden window can't apply a size change), but here KWin, not kwin-i3, asks for
  the size. Next: find where the 50 px comes from (KWin's `ensureSpecialStateGeometry` or the
  client), then decide: avoid it, or accept it with the I9 limit.

`tests/fuzz/out/` is gitignored: those traces live only on this disk.
