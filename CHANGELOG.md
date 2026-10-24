# Changelog

What changed between the versions that ran on a desktop. Newest first; the git log has the
detail. Versions are tags (`v1.0.0`) and `package/metadata.json`'s `Version`.

## Unreleased

- Settings, step 5: the plugins' settings move into the form (`frameWidth`, new; the frame's colours;
  the hold's kill switch and timeout), their old groups still read. **Apply applies** with the
  plugins: the KWin plugin, renamed `kwini3helper` (frame focus, settings apply), watches `kwinrc`
  and has KWin reconfigure; the frame and the hold take new values on any reconfigure, so the
  `--notify`-only rule is gone.
- Settings, step 4: gaps, i3's `gaps inner` and `gaps outer`, by KWin's tile padding and an
  inset root tile; a change applies at Meta+Shift+C, rebuilding the tiles once.
- Settings, step 3: `workspaceOutputs`, i3's `workspace N output X` (`1=DP-4, 2=DP-6`), at
  login, for a workspace first used, and when a monitor appears; unlisted workspaces as before.
- Settings, step 2: `resizeStep` (Meta+Ctrl+arrows, default 10 %), `defaultOrientation`
  (i3's `default_orientation`, default auto) and `focusWrapping` (i3's `focus_wrapping`, all four
  modes ported from `get_tree_next`, default yes), in the form and the README.
- Settings, step 1 (`docs/spec-settings.md`): a Configure form in System Settings for the
  script's keys, and i3's reload, **Meta+Shift+C**, which has KWin reparse its config and kwin-i3
  take the new values (the form itself tells KWin nothing on save). A changed rule re-judges the
  open windows; a window floated or tiled by hand under an unchanged verdict stays.
- Mouse chords dropped (Paul, 2026-10-24): window move is KWin's own Meta+drag again, not
  Meta+Shift+drag; `[kwin-i3-mouse]` is no longer read. `kwini3mouse` stays for focus on the
  frame alone. The plugins are optional: README's install is the script, the plugins a section of
  their own, and `make test` without `kwin-devel` skips the three plugin scenarios, saying so.
- Fix (live 2026-10-24): after a reload, un-floating a window left it kept above (and, since the frame colours,
  green): the new instance had not recorded the keep-above flag the old one set. A window
  kwin-i3 floats now owns its flag, set by it or not, and a window a reload finds kept above
  and in no tile stays floating instead of being re-tiled by the rules. Found by the review: a
  window floated by hand went back to tiled at its next caption change (seconds, for a browser),
  because the rules were re-applied on every change; they now act only when their verdict
  changes (Paul, 2026-10-24; `docs/spec-reload-keepabove.md`; `tests/live/60-load.sh`,
  `20-rules.sh`).
- Fix (live 2026-10-24): a window opened on a workspace whose focused window was fullscreen seemed not to open.
  The rebuild of the tiles for the newcomer lost the fullscreen window its tile, KWin refused to
  tile it again (a fullscreen window is not resizable to KWin), and kwin-i3 floated it,
  monitor-sized and above the tiles; leaving fullscreen changed nothing. It now stays in the tree
  as in i3, out of the tiles until fullscreen ends; the rules judge a fullscreen window by its
  size limits (a caption change floated it the same way); and, as in i3, the newcomer opens
  behind the fullscreen window without taking its focus (its own dialog excepted), also when
  sent there while the workspace is hidden or when the workspace is shown again with Meta+N.
  Paul's capture of 2026-10-23 23:25; `docs/spec-fullscreen-tree.md` and its review;
  `tests/live/32-fullscreen-open.sh`, `53-hold.sh` section 8, a unit test; six live mutants and
  one unit mutant.
- The frame paints the active floating window green (live 2026-10-24) (`#4c995a`), so a floating window is told
  from a tiled one; inactive stays i3's grey. The four colours are kwinrc keys
  (`[kwin-i3-frame]`, README), changed live with `--notify`. Paul's ask, 2026-10-24
  (`docs/spec-frame-colours.md`; `tests/live/54-frame.sh` section 2b).
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
