# Spec: building the i3 redo (OPEN.md item 40)

**Now (2026-10-28):** Draft for Paul. The plan for the rows `behaviour.md` marks **Decided, not
built** (2026-10-27/28). Nothing built.

The rows are the spec: each says today's behaviour (its Result) and the change (its note). This
file only orders them and says how each stage is built and checked. When a stage goes live, its
rows' Result columns are rewritten to the new behaviour and the "Decided, not built" notes go
(`behaviour.md` is what the code does).

## How each stage goes

1. A branch (or a worktree, if anything traces into `package/`). The design first where KWin's
   behaviour is unknown: a probe in `tools/testkwin.sh` (`docs/testing.md` P4), or KWin's source
   for the installed version, never a guess.
2. Built; `make unit` and the scenario(s) that drive what changed (`docs/testing.md` P1; a plugin
   change: 64 too). **A new test only with Paul's go**, proposed with the stage, only where
   nothing existing drives the change.
3. Paul's go to merge, then to reload (CLAUDE.md, "Nothing goes live"). He uses it; his "it works"
   ends the stage.
4. `behaviour.md`'s rows rewritten in the same commit as the code.

One stage live at a time, so a regression points at one stage.

## The stages

The order agreed 2026-10-27 (new windows first, then pointer, kinds, keys, clicks/closes, sticky
last), with §4's outputs, §7's look and §11's settings placed in it. Size: S (an afternoon), M (a
session), L (more, or unknowns).

**1. Where new windows open, and outside desktop switches** (M). §5 C1 (the focused workspace),
C2, C3 (a dialog on its parent's workspace), D2/D3 (a switch from outside is i3's `workspace N`),
§4 S4 (an empty workspace shows on the focused output), §5 C5 (`smart`: only the fullscreen
window's own transients). Why first: the 17:05 capture (Prism) is this stage; it closes it, and
the capture can then go. Touches `adoptWindow`, `wsForWindow`, `shownOutside`.

**2. The pointer** (L). §5 B2 (crossing onto root or a dock focuses that output), B4 (a click on
the desktop window), A2 (warp to the focused window's centre, an empty workspace's output centre),
A3-A5 (an override-redirect window keeps the keyboard while focus moves under it), §12 P2 / §5 E1
(login focus on the output under the pointer). Unknown: how a crossing is seen (KWin's
`cursorPos`, or the helper's pointer filter); a probe first. With `mouse_warping` (§11 N7) as its
setting.

**3. Kinds and rules** (L). §3: the kinds that differ (Yakuake, Spectacle, the password prompt,
KRuler, plasmashell's ordinary windows to floating), R2 (X11 dialogs float), R4 (the taskbar hint
decides nothing), R5 (no user ignore list; Plasma's system windows built in), R9 and X2 (i3's
`for_window` criteria, `floating enable | disable`, run once), §11 N12 (`assign` to a workspace or
output, the same criteria), N13 (`floatingWorkspaces` as a criterion), N15 (floating minimum and
maximum size). The biggest stage in `src/rules.js`; the settings move from lists to criteria, so
the settings page's Window Rules sub-page is broken until stage 10: it gets a minimal fix here
(the new keys read and written), not its redesign.

**4. Workspaces and outputs** (M). §4 W3/M3 (a lost output's workspaces move for good), M4 (a
returning output gets its assigned workspaces), M5 (a new output: its first assigned, else the
first free), W5 (`workspaceOutputs` takes a list per number), §5 D5 (focus to the first output in
KWin's order after an output change). Driven by the replug scenarios (48 and its kin).

**5. Keys** (M). §8 K4 (i3's resize mode, in the helper: Meta+R, then J K L ; and the arrows;
Return, Escape, Meta+R leave; the Meta+Ctrl actions stay, unbound; an on-screen sign while in the
mode, to design), K17 (Meta+Shift+E: Plasma's logout prompt), K18 (Meta+Return: Plasma's default
terminal; Meta+D: KRunner, Show Desktop reported as taken), §4 S5 (the no-back-and-forth actions),
S8/S9 (`next`, `primary`). Touches `KEYS`, the helper, `kcm/ui/commands.json`.

**6. Clicks, closes, minimize** (M). §5 C7 (i3's next focus for every close), C9 (minimize as
`move scratchpad`), §9 G1 (a Meta-drag doesn't move focus), G4 (no targets: the press goes to the
app), G7/Z7 (a drag's end: any key cancels, any button's release drops, an unmap on the focused
workspace aborts), Z1 (i3's nearest edge), Z3 (a ring drag resizes), F4 (a ring scroll focuses),
G3 (`tilingDrag`, i3's four values). Mostly the helper (`tilingdrag.cpp`, `framefocus.cpp`).

**7. The look** (M). §7 L3 (three colour classes: `focused` #4c7899, `focused_inactive` and
`unfocused` defaults to pick with Paul), L4 (the lone-child split indicator), L6
(`hide_edge_borders`, `smart_gaps`), L11 (floating rings in the same classes; the two floating
colours go), §11 N2 (outer gaps per side, gaps per workspace). The effect (`kwini3hold`) and §6's
gaps; no performance cost (Paul's rule for the look).

**8. Fullscreen** (S). §10 V6 (`popup_during_fullscreen`, i3's values, default `smart`; stage 1
made `smart` exact).

**9. Sticky** (M). §3 R3, X4, §10 V10 (a window on all desktops is sticky floating, in the tree,
visible on every workspace of its output). Last, as agreed: it touches every workspace switch.

**10. The settings page** (L). Paul, 2026-10-27: the new settings clash with what is there. Every
setting the stages added (criteria and `assign`, `mouse_warping`, `tilingDrag`, the colour classes,
`hide_edge_borders`, `smart_gaps`, the gaps, the floating sizes, `popup_during_fullscreen`,
`workspaceOutputs` lists), i3's kind names, super descriptive and explicit
(`docs/style-settings-page.md`). The settings page's finishing is `LATER.md`'s; this stage is
only what the new settings need to be usable.

## For Paul

31. The order above: new windows, pointer, kinds, outputs, keys, clicks, look, fullscreen, sticky,
    settings page. Outputs moved before keys: its decisions change where workspaces live, which
    the keys' tests rest on.
32. Stage 3 leaves the Window Rules sub-page minimally fixed until stage 10. The other way: stage
    10's Window Rules part comes with stage 3 (a longer stage 3).
33. Stage 10 inside the Stage, or in `LATER.md` with the rest of the settings page's finishing
    (until then the new settings are set in kwinrc or the Configure form).
