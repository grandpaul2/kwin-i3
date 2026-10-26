# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-25** (session end).

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work, release prep and anything upstream wait in **`LATER.md`** (Paul, 2026-10-25),
with the settings page's finishing; it is added to as we go.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". When the Stage ends: `LATER.md`, in its suggested order (1, 3 and 7 are done; 7,
kwin-i3's own settings page, live 2026-10-24: `docs/spec-settings-page.md`; 15, the panel
configuration bug, fixed 2026-10-25: `docs/bug-panel-config.md`; 19 and 20, a floated window's
size and rounded corners, live 2026-10-25: `docs/spec-float-size.md`, `docs/spec-rounded-corners.md`).

## Open

Work for now.

**16. A tile hidden by Show Desktop activated in the first second after a load** (seen only in the
test KWin, 2026-10-25, while fixing item 15; `docs/bug-panel-config.md`, "Left over"). With no frame
effect, Show Desktop turned on within ~1 s of a kwin-i3 load goes off again: something activates
the hidden tile. Traced far enough to rule out the passive pass (it asked KWin and stopped) and
`setFrame`'s border work (the tile was active before the 1 s miss timer's handler ran); the
activation had no JavaScript caller visible. Not Paul's case (live, the effect answers at once).
Next: a trace of KWin's `Workspace::activateWindow` callers in that second (helper probe in a
worktree), or won't-fix if it stays a load-time curiosity. 74-show-desktop waits for the load to
settle (`FRAME` logged) meanwhile.

**21. Wallpaper flashes** (Paul, 2026-10-25, three times; captures 15:44, 17:57 and 18:51, all
kept in `~/.local/state/kwin-i3/captures/` until this is worked on). The first was Firefox shown
again on a workspace switch 4 to 2. **The other two followed a close of the window beside it**:
at 17:57 a terminal beside Firefox, at 18:51 one of two Alacritty on workspace 3 (DP-4; its
`state.txt` log: `18:51:17 ACTION Close`, `TREE 3 H[Alacritty*]`, the press 7 s later). kwin-i3's
side checked for the Firefox ones: the trees were right, and kwini3hold kept the closing window and
released on Firefox's new size with no timeout (66 holds, max 69 ms). With no Firefox at 18:51,
the guess that Firefox acknowledges a size before drawing into it no longer covers every case; a
cause in kwini3hold, the frame effect or KWin is as likely. From 2026-10-25 late a capture holds the
flight recorder (`docs/debugging.md`): kwin-i3's TILE and GEOM lines and kwini3hold's hold, close
and release events, to the millisecond, read with `tools/capture-read`. Next: the next flash's
capture says whether it falls after kwini3hold's release (then the client or KWin drew late) or
inside the hold (then the effect); meanwhile, reproduce in the test KWin (two tiled, close one,
screenshots every few ms, background inside the survivor's rect), Alacritty and the test client
first, real Firefox with a throwaway profile second. If timelines can't settle it: the screen
replay buffer (`docs/debugging.md`, "What none of these show"), its own proposal.
