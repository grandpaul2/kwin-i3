# Changelog

What changed between the versions that ran on a desktop. Newest first; the git log has the
detail. Versions are tags (`v1.0.0`) and `package/metadata.json`'s `Version`.

## Unreleased

- Fix: a window opened on a workspace whose focused window was fullscreen seemed not to open.
  The rebuild of the tiles for the newcomer lost the fullscreen window its tile, KWin refused
  to tile it again (a fullscreen window is not resizable to KWin), and kwin-i3 floated it,
  monitor-sized and above the tiles; leaving fullscreen changed nothing. It now stays in the
  tree as in i3, out of the tiles until fullscreen ends. A caption change while fullscreen (a
  browser) floated a tiled window the same way, through the rules' "not resizeable" test
  (Paul's capture, 2026-10-23 23:25; `tests/live/32-fullscreen-open.sh`).
- **kwini3frame** (live 2026-10-23), a third plugin: i3's 1 px frame as a KDecoration3 decoration that starts
  nothing from the pointer (no resize cursor or edge drag, no title-bar move, no menu), replacing
  the Aurorae theme. Focus on the frame follows i3 (hover and click) through kwini3mouse.
  `make plugin-install` selects it in kwinrc; `tools/frame-guard.sh` falls back to Breeze before a
  KWin start if the build no longer matches the installed kdecoration (`docs/spec-decoration.md`).
- Fix: after a monitor replug, activating a fullscreen window KWin could not move switched the
  other monitor to that window's workspace, so both monitors showed it and its tiled windows
  stood off-screen (fuzz I2, seed 7; `tests/live/46-replug-fullscreen.sh`).
- Fix: when a monitor returns, KWin restores every window's geometry from that layout, as a
  pending resize kwin-i3's refit could not see; a window whose tile had changed meanwhile ended up
  at its old size. After a screens change, tiled windows are refitted as their frames change until
  each shows its tile (fuzz I10; `tests/live/47-replug-restore.sh`).
- Fix: a window that KWin itself tiles on a returning monitor (one with a modal dialog) kept
  kwin-i3's record of its old tile, which the invariant check read as "not in its tile" and could
  throw on once that tile was gone (fuzz I1, seed 2; `tests/live/48-replug-listed.sh`).
- Licensed GPL-2.0-or-later (LICENSE, NOTICE); the phase-0 spike scripts and the reference copy
  of KWin's `tile.cpp` removed from the tree (git history before 2026-10-23 has them).
- The floating-title default is empty; the stage's title moved to the dotfiles' setup (it was a
  default of the author's).
- Test client: the dialog starts at 200x160, above KWin's 150 px decorated minimum (fuzz I9,
  seed 28: a smaller dialog on a hidden desktop can't take the resize KWin sends with a move).

## 1.0.0 — 2026-10-23

Feature complete for its author's use, after two nights' work (2026-10-21 to 2026-10-23), the
window manager on his desktop since 2026-10-22. One KWin script plus two small KWin plugins:

- **The i3 tree** (`src/tree.js`), ported from i3's source: insertion after the focus, `tree_move`
  with every case, split and toggle-split, tree-based focus in a direction, close with i3's
  focus-after-close, shares (`percent`) with i3's rules. One deliberate break: a split that holds
  only another split is removed (`docs/spec-nested-boxes.md`).
- **KWin's own tiles as the display** (`src/kwin.js`): one idempotent reconcile per workspace,
  minimum sizes honoured with neighbours giving up room, edges snapped to whole pixels, start-up
  reads the live tiles back so a reload keeps the layout, a release key that hands everything
  back to KWin.
- **Workspaces per monitor** (`src/workspaces.js`, from i3ws): workspace N is desktop N on one
  monitor, numbering at login, pointer follows focus, workspaces move to a remaining monitor on
  unplug and back on replug.
- **Rules** (`src/rules.js`): which windows tile, float or are ignored, with Krohnkite's
  defaults; configurable under `kwinrc [Script-kwin-i3]`.
- **Keys**: i3's, as `kwin-i3 <verb>` actions (workspace N, move to workspace N, focus and move
  in four directions, split h/v, toggle split, floating toggle, focus mode toggle, resize,
  release, dump state).
- **kwini3mouse** (`plugin/`): modifier + mouse button chords, so window move is
  Meta+Shift+drag (`docs/mouse-plugin-design.md`).
- **kwini3hold** (`plugin/`): an effect that holds the old layout on screen until every moved
  window has its new frame, like Sway's transactions (`docs/spec-atomic-layout.md`).
- **Tests**: unit tests of the tree (cases from i3's own testsuite), live scenarios in a private
  headless KWin with two virtual outputs and real hotplug, real input through libei, a fuzzer
  with pixel invariants and a shrinker, mutation batteries for the unit and live suites, and a
  capture key (Meta+Shift+B) that turns a bug seen into a file.
