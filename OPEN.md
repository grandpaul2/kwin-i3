# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-26** (item 31 live).

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

**32. A GTK 4 window stays 26 px short of its tile** (fuzzer I10, found 2026-10-26 once the
fuzzer was repaired; 13 of 40 seeds and 17 of 41 in a second campaign, reproduces on main: seeds 4 and 11, trace and
result kept in `tests/fuzz/i32/`). The test client's frame ends 26 px above its
tile's bottom (`frame [1, 1, 1278, 692]` in `[1, 1, 1278, 718]`), after kwin-i3's `BOUNDS ...
bounds asked again` lines: the GTK 4 bounds path (spec-window-modes "why" 5) doesn't always
recover. Next: shrink seed 4 (copy its two files to `tests/fuzz/out/4/` as `trace.json` and
`result.json`, then `make fuzz-shrink FUZZ_SEEDS=4`), then a diagnosis.

**33. The active window on a desktop its monitor isn't showing** (fuzzer I8, found 2026-10-26;
1 seed in each of two campaigns, reproduces on main: seed 30, `active w10 is on desktop [1],
Virtual-0 shows 4`; kept in `tests/fuzz/i33/`). Next: shrink seed 30 as for 32, then a diagnosis.

**25. A new window opens on the pointer's monitor, not the focused one** (finding 7: C2, C75).
KWin places by the pointer; i3 by keyboard focus. With the pointer over an empty workspace on the
other monitor, keys act on one monitor and the new window opens on the other. Next: confirm in the
test KWin (pointer on Virtual-1's empty workspace, focus on Virtual-0, open a window), then a fix
proposal (KWin's placement option, or kwin-i3 sending a new window to the focused workspace).

**28. No launch workspace** (finding 2: C19). An app opens on the workspace current when its
window appears, not the one it was launched from: switch workspaces while a slow app starts and
it lands where you are. i3 places it by the startup notification's workspace; KWin ignores the
notification's desktop. Next: read what KWin 6.7.5 gives a script at launch (startup id / token
on the window, `xdg-activation`), then a proposal (remember the workspace at launch, send the
window there), or won't-fix with the reason if nothing reaches the script.

**29. No "move window to next/prev workspace"** (finding 4: A27). Workspace Next/Prev (and on
Output) exist as go-to actions (`kwin.js:1394`), the move forms don't; KWin's own "Window to Next
Desktop" ignores which workspaces exist. Next: add the four move actions, unbound as the go-to
ones (`docs/spec-workspace-commands.md`), with a test; Paul's go first.

**30. Focus after a close, at the top level and for floating windows** (finding 8: B51, C26).
Inside a split kwin-i3 gives focus as i3 does; at a workspace's top level and when a floating
window closes, KWin's choice stands (`NextFocusPrefersMouse=true` here, false on a stock install),
which can differ from i3's (the most recently focused in the workspace). Next: compare the two in
the test KWin for both settings (three tiled, one floating, close each), then a proposal.

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
