# Spec: building the refinement pass (OPEN.md item 47)

**Now (2026-10-28):** Written from Phase 3's read of the code against the rewritten foundations
(46 findings, none high). Paul's go on the order (2026-10-28). **Stage 1 live** (2026-10-28, `refine-1` merged, Paul's go; unit 173/173, 40-49, 68, 84 green), waiting for his "it works". **Stage 2 live** (2026-10-28: merged, `make plugin-install`, reloaded; the effect reports the tree's focused window), waiting for his "it works". **Stage 3 live** but its held help-button item (merged; `make kcm-install`, `widget-install`, `plugin-install`; reloaded), waiting for his "it works". **Stage 4 live** (2026-10-28: merged, reloaded; live check: a `notify-send` popup is class `org.kde.plasmashell`, kept out as override-redirect), waiting for his "it works". **Stage 5 live** (2026-10-28, merged, reloaded), waiting for his "it works". **Stage 7 live** (2026-10-28, merged, reloaded), waiting for his "it works". Stage 6 next, a design note first.

Every change here brings the code to what `docs/definitions.md`, `docs/philosophy.md` and
`docs/plan.md` already say, or to i3's source where they point there. Each one's row in
`docs/behaviour.md` says **Being fixed** (`spec-refine-build.md`) today; the stage that fixes it
rewrites the row and drops the mark, in the same commit as the code. Lead with i3: each item
cites i3's source; each item's KWin side was read in KWin 6.7.5's source by Phase 3.

## How each stage goes

As the redo's (`spec-i3-redo-build.md`, "How each stage goes"):

1. A branch (a worktree if anything traces into `package/`). Where KWin's behaviour is unknown, a
   probe in `tools/testkwin.sh` first (`docs/testing.md` P4), never a guess.
2. Built; `make unit` and the scenario(s) that drive what changed (P1; a plugin change: 64 too).
   **A new test only with Paul's go**, proposed with the stage, only where nothing drives the change.
3. Paul's go to merge, then to reload. He uses it; his "it works" ends the stage.
4. `behaviour.md`'s rows rewritten in the same commit as the code; the "Being fixed" mark goes.

One stage live at a time, so a regression points at one stage. Size: S (an hour), M (a session),
L (more, or unknowns).

## The stages

**1. Outputs** (M). The one real multi-output bug, and i3's output rules:
- the first output, login numbering, `focus output primary` and the empty-workspace "Switch to
  Screen N" use KWin's primary-first `workspace.screenOrder`, not `workspace.screens`, KWin's
  backend order (`kwin.js` `applyFocus`, `screensChanged`, the `primary`/`next` commands;
  `workspaces.js` `numberScreens`); i3: `get_first_output` (`randr.c:80-98`); KWin: `Switch to
  Screen %1` indexes `outputOrder()` (`useractions.cpp:962-969`). W3, M1, D5, S8.
- "output in a direction" as i3's `get_output_next`: only an output overlapping on the other
  axis, nearest by origin (`randr.c:259-317`); the commands (`focus output`, `move … to output`,
  a direction in `workspace N output` or `assign`) wrap (`get_output_next_wrap`, `output.c:33-51`),
  the tree's edge crossing doesn't (`workspaces.js` `screenToward`). S11.
- at login an output shows its first assigned workspace before a free one (`randr.c:497-507`). M1.
- an output appearing makes no desktop for an assigned workspace that doesn't exist yet
  (`randr.c:462-486` loops existing workspaces; `outputs.js` `movingTo`). W2, W4.
Drives: unit `outputs`, scenarios 40-48. Visible only where the two orders differ (a docked
laptop) and in non-grid layouts. Unit cases with two orders are a test proposal (P1 rule 5).

**2. The effect follows the tree** (S). `plan.md`, "Focus": what the user sees follows the tree.
- the resize banner on the tree's focused window, not KWin's active one (`hold.cpp` `paintBanner`
  test; the `SetRing` class says which).
- a framed window the script hasn't told about is `unfocused`, not KWin's active window's
  `focused` (`Hold::ringOf`); the then-dead `windowActivated` repaint goes.
- the split indicator is cleared by `SetRing` (a tree focus change), not by any activation
  (`hold.cpp` `windowActivated` erasing it for KRunner, a popup).
i3: the ring's class is the tree's (`x.c:498-512`). L3, L4, the banner. Drives: 57, 64. Plugin:
`make plugin-install` with Paul's go.

**3. Settings and the words a user reads** (M). `philosophy.md`, "Every word a user reads is true";
`plan.md`, "Settings".
- the page, the Configure form, the load notification and `kcm/ui/commands.json` in
  `definitions.md`'s words: output, tiling, workspace output (`style-settings-page.md` already).
- `holdTimeoutMs` off the page and the form (an internal value: kwinrc only); its README row stays.
- the Window Rules help: floating and tiling, the last matching rule decides; a workspace and an
  output, the first matching `assign` (i3: `run_assignments`, all rules in order).
- each control's help names its i3 directive (`ContextualHelpButton`). **Held**: wrapping a
  FormLayout control in a row with the button moves its label off the control, and 37's keyboard
  path (click "Resize step", Tab) then fails; `buddyFor` and `NoFocus` didn't fix it. Needs a
  design and one diagnostic run of 37 (Paul's go) before it is built.
- the load notification names what each missing plugin takes away (the effect: the frame, the drag
  highlight, the hold; the helper: the mouse, frame focus, the resize mode, the terminal key, the
  layout keys, Apply), not only the two keys (§13).
- popup grace puts back KWin's default 300 ms when kwinrc has no `DelayFocusInterval`
  (`popupgrace.cpp`; kwin.kcfg's default). F10.
Drives: 37, 75, 76, unit `kcm`; the strings in them follow. `make kcm-install` with Paul's go.

**4. Kinds** (S, a probe first). i3's `manage.c` order (`definitions.md`, "How the kind is decided").
- `for_window` runs over an on-all-desktops window: a `floating disable` verdict tiles it through
  X4's "made tiling" path (taken off all desktops onto its workspace); i3 runs `for_window` last
  (`manage.c:588`). R3, R9.
- an X11 notification-type window floats (`manage.c:466`), if a probe shows Plasma's own
  notifications can be told from it (by class `plasmashell`, or a property); else R2 stays ≠
  with reason (a). R2.
- a virtual desktop past 10 is not kwin-i3's (`plan.md` decision 9): a window opened there goes to
  the focused workspace (C1), a switch to it is undone (D2); today windows on it enter the tree
  and every focus path refuses it. W1.
Drives: 20, 32, 62, unit `rules`.

**5. The tree** (S).
- a window that opens floating goes to the head of its workspace's floating list, as
  `floating_enable` (`floating.c:295`; `tree.js` `openFloating`). T20.
- the floating list reordered as i3's on a raise (`floating_raise_con`), so Meta+Left/Right cycles
  in i3's order; a hole until now, decided here as i3 (`philosophy.md` step 3). T20.
- "may focus leave a fullscreen window" asks about the focus's own fullscreen ancestor, as
  `con_fullscreen_permits_focusing` (`con.c:2327-2364`; `tree.js` `permitsFocusing`). T11, T22.
- across workspaces, `insertConInto` takes i3's `focus_before` (`move.c:88-135`).
- the resize-by-key floor is one pixel of the split (`percent_for_1px`), the adapter passing the
  split's size. T12.
Drives: unit `tree`, 10, 30.

**6. Input** (M-L, a design first).
- a window closing mid-drag still drops, as i3 (`DRAG_ABORT` is no revert, `tiling_drag.c:325`,
  `resize.c:274`), when the dragged window and the target still exist (`tilingdrag.cpp`). G7, Z7.
- the letter keys by position on any layout, as i3's keycode config (`etc/config.keycodes`):
  the helper's refit grows from the digits and `;` to every kwin-i3 key i3 binds by keycode
  (`layoutkeys.cpp`); a key the user bound stays theirs. The biggest item: a design note first
  (Dvorak, AZERTY, a layout switch), then the code. §8 "Keyboard layouts".
Drives: 39, 50, 51, 64.

**7. Floating windows over a fullscreen one** (S). Decided by the docs: fullscreen is in scope,
so i3's behaviour (`philosophy.md` step 3); no reason (a)-(e) to differ (KWin raising an activated
window doesn't stop a hand-back); and the precedent C5 (step 2). i3 draws no other
floating window above a fullscreen one and won't focus one (`render.c:253-270`,
`con_fullscreen_permits_focusing`); here KWin raises an activated one over it. As i3: an
activation of a floating window that isn't the fullscreen window's own transient, on a workspace
with a fullscreen window, hands the focus back, as C5 does for a new window
(`popupDuringFullscreen`). V6b.

## Not in this plan

- **Float to tile** (Paul, 2026-10-28): Meta+Shift+drag of a floating window onto a tile tiles it
  there, the float modifier's other half (G5). A feature: its own spec when Paul wants it.
- Rings of a workspace just left keeping the class last told during KWin's slide animation
  (Phase 3, unseen): only if seen.
- The ring's width at a fractional output scale (1 or 2 device px; unseen): only if seen.
