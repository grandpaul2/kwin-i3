# Changelog

What changed between the versions that ran on a desktop. Newest first; the git log has the
detail. Versions are tags (`v1.0.0`) and `package/metadata.json`'s `Version`.

## Unreleased

- **What i3 decides, kwin-i3 decides while it runs, and Plasma's settings stay as you set them.**
  Focus follows the mouse at once (a setting of kwin-i3's own on the Tiling tab, on by default
  as in i3), a new window takes the focus, nothing tiles or maximizes at a screen edge, and
  Meta and a drag focus the window they move: none of it is written into Plasma's settings any
  more, and Plasma's own values are back when kwin-i3 is released or removed. The Plasma tab
  keeps only what kwin-i3 can't decide itself: per-output desktops and the optional animations.
  Values an earlier version's Plasma tab wrote stay as they are: change them in System Settings
  if you want Plasma's back.
- **kwin-i3's keys win a key Plasma's shortcuts share, by default**, and Meta+T no longer opens
  Plasma's tile editor: the key override is on, its checkbox now on the Keys tab (it needs the
  plugins). Plasma's shortcuts are not changed. Keys an earlier version took are not given back
  by `make install` any more: `make uninstall` of that version, or System Settings' Shortcuts,
  restores them.
- **One place for the settings**: the settings page. The cog beside kwin-i3 in KWin Scripts opens
  it; the old Configure form is gone. A hand edit of `~/.config/kwinrc` takes Meta+Shift+C, as
  i3's reload. The `floatingWorkspaces` key is gone: the Workspaces tab's "new windows float"
  writes i3's `for_window [workspace="^N$"] floating enable`, which does the same.

## v1.3.0 (2026-11-03)

- **The settings page is in tabs**, as Plasma's Window Behavior page: Plasma, Tiling, Gaps, Mouse &
  Focus, Workspaces, Window Rules, Frame, Keys. **Defaults resets only the tab shown**, as on any
  Plasma page: kwin-i3's settings go to their defaults, and on the Plasma tab Plasma's own settings
  go back to what they were before kwin-i3 changed them. Before, one Defaults reset every setting,
  your window rules and workspace screens included, and ticked kwin-i3's way for Plasma's settings.
- **kwin-i3's keys override Plasma's instead of taking them**: the Plasma tab's "On a key
  conflict, kwin-i3's key wins" runs kwin-i3's command on a key it shares with a Plasma shortcut,
  and Plasma's shortcuts are left as they are (untick it and they run again; it needs the
  plugins). `make take-keys` and `make restore-keys` are gone; `make install` gives back any keys
  an earlier version took and turns the override on in their place. Holding Meta alone still
  opens the launcher only when no other key was pressed with it.
- **The Keys tab sets keys only**: a key another shortcut also holds is set without a note and
  without being taken; which one runs is the key override's.
- **No flat frame under Glide**: with Glide as the window animation, a new window's frame
  appears when it has finished swinging in, not as a flat rectangle while it tilts.
- **The frame follows window effects more closely**: it is repainted after an effect animates a
  window, and drawn on a window an effect shows off its desktop (Slide, Show Desktop's).
- **The split indicator** shows inside a split or group floated whole.
- **Shift is the float modifier**: Meta+Shift+drag pulls a tiling window out to float where it is
  dropped (Escape puts it back), and drags a floating window, or a group floated whole, into the
  tiles, with the drop indicator; the middle's bottom third reads Beside there, putting it after
  that window. With Meta and Shift the mouse alone moves, swaps, groups, floats and tiles. i3's
  swap modifier is gone from the plan: the middle's Swap third already swaps. After Meta+A,
  Meta+Shift+drag on one of the highlighted windows floats them all whole, where an outline
  shows, as Meta+Shift+Space would.
- **A split or group floated whole moves and resizes as an outline**: the windows are placed once,
  at the release, so a large container no longer stutters as each window redraws; a single
  floating window still moves live.

## v1.2.0 (2026-11-02)

- **A fullscreen window keeps its place**, as in i3: the windows beside it keep their sizes behind
  it, rather than taking its space and giving it back when fullscreen ends.
- **No load notification**: what to fix in a setup (keys other shortcuts hold, a keyboard
  layout without the plugins, the plugins missing, per-output desktops off) is shown on the
  settings page's banners and logged, as i3 tells a user only of a config error. The
  `warnTakenKeys` setting, which only turned the notification's taken-keys part off, is gone.
- **Tabbed and stacked layouts, as i3's**: Meta+W and Meta+S make the focused window's container
  a group, its windows sharing one place under a bar of their titles (one row of tabs, or a row
  each); Meta+E goes back to the split it was. Left/right walk the tabs, up/down the rows; a
  click or a scroll on the bar switches, and a tab dragged off the bar leaves the group. Groups
  come back after a reload.
- **Focus parent** (Meta+A), as i3's: a split or a group is then moved, split or made tabbed as
  one, and every window in it is drawn focused.
- **The tree keeps i3's levels**: a split holding only a split is no longer removed (it was
  kwin-i3's own tidying), so focus parent reaches it as in i3.
- **The tiling drag's centre**: the middle of a window is outlined and cut in three, each named:
  the top makes the two windows a tabbed group, the middle a stacked one, the bottom swaps them;
  dropped in the middle of a window in a group, it joins the group. The centre is kept about as
  wide as tall; beyond it is the beside drop.
- **The mouse never floats or tiles a window, as in i3**: Meta+Shift+drag is the tiling drag on a
  tiling window and KWin's move on a floating one; it no longer floats a tiling window or drops a
  floating one into the tiles. Meta+Shift+Space is the way between them.
- **Tabs take i3's mouse**: Meta+drag on a tab drags that tab (a split tab whole) at once
  without switching to it; a right-drag on a tab resizes the group against the window above.
- **A tiling window stays in its tile when an app's own title bar is dragged** (a browser's tab
  strip, a GNOME app's header bar), and under KWin's Move Window and the window menu's Move, as
  i3 ignores those for a tiling window (with the helper plugin).
- **Keys**: Meta+W is Plasma's Overview on a stock install; `make take-keys` gives it to Layout
  Tabbed (the Overview stays on the top-left screen corner).

## v1.1.0 (2026-10-31): the first version on `stable`

Install the `stable` branch from now on (README, Install step 1); `main` is where the work lands
first.

- **Workspaces and outputs as i3's `randr.c`**: a lost output's workspaces move to one that
  remains for good, an appearing output takes the workspaces assigned to it (workspace outputs),
  the first output gets the focus; outputs in i3's order and directions; a new window opens on the
  focused workspace, a modal dialog with its parent.
- **Kinds and rules as i3's**: `for_window` and `assign` in i3's syntax, the kinds decided in
  `manage.c`'s order, sticky floating (a window on all desktops), `popup_during_fullscreen`, the
  desktop portal's dialogs floating by a default rule, floating windows kept behind a fullscreen
  one.
- **The look**: i3's three colour classes, the split indicator after a split key,
  `hide_edge_borders`, `smart_gaps`, gaps as i3's (inner 2 px and outer 0 by default; per side
  and per workspace), title bars keeping the whole gap.
- **The mouse**: drag a tiling window to move it (a centre drop swaps); Meta+Shift+drag floats a
  tiling window or drops a floating one into the tiles; a press in a gap resizes, as i3's resize
  on the nearest side; focus follows the mouse past a neighbour's margin and across outputs under
  Show Desktop.
- **Keys**: i3's resize mode with a "Resize (Esc)" banner; Exit, Terminal and Launcher; Move to
  Workspace Next/Prev (on Output), unbound; the letter keys follow key position, as i3's keycode
  config, on any keyboard layout; Meta+Shift+E set by the new End session setting.
- **The settings page**: Window Rules as one line per rule, the application chosen from the
  installed ones; a Gaps page, a Mouse and focus page; a help button beside each setting naming
  its i3 directive; a banner when the plugins aren't loaded.
- **Plasma 6.8**: the plugins build against KWin 6.8 (and the effect's translucent colours blend
  right there).
- **Fixes**: two KWin crashes (the helper's destructor reinstalling its filters; the pointer probe
  asking a closed window); a fullscreen window resized by its tile put back on its monitor; GTK 4
  windows' size limits kept across a rebuild; a frame side missing at an output's edge; No Border
  and Keep Above from the window menu put back at once; a title bar that lands late taken; a new
  window hidden until it lands and a closing one held through close animations; minimum sizes that
  fill their split exactly counted as fitting.

Before this (since v1.0.0):

- A tiled window that resizes itself goes back in its tile, as i3 refuses a tiled window's own
  resize: Firefox's session restore had left one window over its neighbour and one off the
  monitor (A capture, 2026-10-25). At most once a second per window, and never mid-answer to
  kwin-i3's own resize.
- The dead Shift+symbol keys are gone: a Shift+key that types a symbol arrives as the symbol, so
  Meta+Shift+; and Meta+Shift+1..0 never fired; their twins Meta+: and Meta+!..) did (probed in
  the test KWin, 2026-10-24). Only the twins are registered now, and the old actions are
  unregistered at load, so the settings page's Keys list shows one box per key. The keys pressed
  are the same (`tests/live/38-retired-keys.sh`).
- The active floating window's frame defaults to a muted green, `#4d7254` (was `#4c995a`),
  picked in the settings page's colour button.
- kwin-i3's own page in System Settings > Window Management (live 2026-10-24): every setting, laid
  out as Plasma's pages are, Apply that applies without the plugins, and a Keys sub-page where a
  key another shortcut holds is named and taken on Apply (`make restore-keys` gives it back);
  `make kcm-install`. The Configure form is tidied to match.
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
- Settings, step 1: a Configure form in System Settings for the
  script's keys, and i3's reload, **Meta+Shift+C**, which has KWin reparse its config and kwin-i3
  take the new values (the form itself tells KWin nothing on save). A changed rule re-judges the
  open windows; a window floated or tiled by hand under an unchanged verdict stays.
- Mouse chords dropped: window move is KWin's own Meta+drag again, not
  Meta+Shift+drag; `[kwin-i3-mouse]` is no longer read. `kwini3mouse` stays for focus on the
  frame alone. The plugins are optional: README's install is the script, the plugins a section of
  their own, and `make test` without `kwin-devel` skips the three plugin scenarios, saying so.
- Fix (live 2026-10-24): after a reload, un-floating a window left it kept above (and, since the frame colours,
  green): the new instance had not recorded the keep-above flag the old one set. A window
  kwin-i3 floats now owns its flag, set by it or not, and a window a reload finds kept above
  and in no tile stays floating instead of being re-tiled by the rules. Found by the review: a
  window floated by hand went back to tiled at its next caption change (seconds, for a browser),
  because the rules were re-applied on every change; they now act only when their verdict
  changes (`tests/live/60-load.sh`,
  `20-rules.sh`).
- Fix (live 2026-10-24): a window opened on a workspace whose focused window was fullscreen seemed not to open.
  The rebuild of the tiles for the newcomer lost the fullscreen window its tile, KWin refused to
  tile it again (a fullscreen window is not resizable to KWin), and kwin-i3 floated it,
  monitor-sized and above the tiles; leaving fullscreen changed nothing. It now stays in the tree
  as in i3, out of the tiles until fullscreen ends; the rules judge a fullscreen window by its
  size limits (a caption change floated it the same way); and, as in i3, the newcomer opens
  behind the fullscreen window without taking its focus (its own dialog excepted), also when
  sent there while the workspace is hidden or when the workspace is shown again with Meta+N.
  Found from a capture; `tests/live/32-fullscreen-open.sh`, `53-hold.sh` section 8, a unit test; six live mutants and
  one unit mutant.
- The frame paints the active floating window green (live 2026-10-24) (`#4c995a`), so a floating window is told
  from a tiled one; inactive stays i3's grey. The four colours are kwinrc keys
  (`[kwin-i3-frame]`, README), changed live with `--notify`
  (`tests/live/54-frame.sh` section 2b).
- **kwini3frame** (live 2026-10-23), a third plugin: i3's 1 px frame as a KDecoration3 decoration that starts
  nothing from the pointer (no resize cursor or edge drag, no title-bar move, no menu), replacing
  the Aurorae theme. Focus on the frame follows i3 (hover and click) through kwini3mouse.
  `make plugin-install` selects it in kwinrc; `tools/frame-guard.sh` falls back to Breeze before a
  KWin start if the build no longer matches the installed kdecoration.
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
- The floating-title default is empty; a streaming setup's title, once a
  default, is a user's rule now.
- Test client: the dialog starts at 200x160, above KWin's 150 px decorated minimum (fuzz I9,
  seed 28: a smaller dialog on a hidden desktop can't take the resize KWin sends with a move).

## 1.0.0 — 2026-10-23

Feature complete for daily use, after two nights' work (2026-10-21 to 2026-10-23), and in
daily use since 2026-10-22. One KWin script plus two small KWin plugins:

- **The i3 tree** (`src/tree.js`), ported from i3's source: insertion after the focus, `tree_move`
  with every case, split and toggle-split, tree-based focus in a direction, close with i3's
  focus-after-close, shares (`percent`) with i3's rules. One deliberate break: a split that holds
  only another split is removed.
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
  Meta+Shift+drag.
- **kwini3hold** (`plugin/`): an effect that holds the old layout on screen until every moved
  window has its new frame, like Sway's transactions.
- **Tests**: unit tests of the tree (cases from i3's own testsuite), live scenarios in a private
  headless KWin with two virtual outputs and real hotplug, real input through libei, a fuzzer
  with pixel invariants and a shrinker, mutation batteries for the unit and live suites, and a
  capture key (Meta+Shift+B) that turns a bug seen into a file.
