# Spec: redo stage 4, workspaces and outputs (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §4 W3, W5, M3, M4, M5, and §5 D5, all decided (Paul, 2026-10-27;
`plan.md` decision 10 rewritten the same day). Together: a workspace lives on an output that is
there, as in i3; assignment is the only way back.

## What happens today, from the sources

**kwin-i3** (`src/workspaces.js`, `screensChanged` in `src/kwin.js`): each workspace with windows
keeps its output's **name** (`home`) even while that output is away, and shows on the remaining
one meanwhile; when all outputs are back, each shows again what it showed before the loss
(`beforeLoss`), unless that workspace moved meanwhile, when it gets an unused one; a never-seen
output shows whatever KWin picks (M5); focus stays where it was (D5). `workspaceOutputs` takes
one output per number (`1=DP-4, 2=DP-6`).

**i3 4.24** (`randr.c`, `workspace.c`, `con.c`):

- **An output lost** (`move_content`): its workspaces go to the **first output** (the primary if
  any, else the first active: `get_first_output`) **for good**, empty unfocused ones closed; the
  focused workspace is shown there and keeps the focus.
- **An output appearing** (`init_ws_for_output`): every workspace **assigned** to it (the first
  connected output of its `workspace N output A B …` list: `get_assigned_output`) moves to it
  (`workspace_move_to_output`, which shows the next workspace in the source's focus order, or an
  assigned or new one if the source would be left with none). Then it shows its first workspace
  (workspaces are kept in number order, `con.c:109-123`), else its first assigned one, else the
  first free one (`create_workspace_on_output`: the lowest number not assigned elsewhere).
- **After every output change** (`randr_query_outputs`, end): the primary output's workspace is
  shown and focused.

**KWin 6.7.5**: with per-output desktops, KWin moves a lost output's windows to a remaining one
and switches them to the desktop shown there (`plan.md` decision 10, verified); a new output shows
the desktop it last showed in the activity, else desktop 1 (M5).

## Design

### A. Where a workspace lives (W3, W5)

`home[num]` is always a **connected** output's name, or none (an empty workspace, W4, as today):

- `assignedScreen(num)`: the first connected output of N's `workspaceOutputs` list (W5), i3's
  `get_assigned_output`. The setting's form becomes `1=DP-4 HDMI-A-1, 2=DP-6`: a space-separated
  list per number, so an output name still can't contain a space (i3's names can't either, in its
  config). An old single-output entry reads unchanged.
- A workspace with windows whose home isn't connected doesn't exist after the change (B): no name
  is kept for an absent output, so `beforeLoss` and its restore go.

### B. An output lost (M3)

In `screensChanged`, for each lost output: each workspace living there gets the **first output**
(KWin's order, `workspace.screens[0]`, primary first; i3's `get_first_output`) as its home, for
good; an assigned one goes to its next connected assigned output if it has one (i3: the
assignment is re-read when an output appears, C). Windows follow their workspace (the reconcile's
`relocate`, as now, over KWin's own evacuation). The first output keeps showing what it showed,
unless the focus was on a moved workspace: then that workspace is shown there (i3's
`workspace_show(next)`; 84-unplug-focus checks exactly this today).

### C. An output appearing, new or back (M4, M5)

For each new output X, in KWin's order: every workspace whose `assignedScreen` is now X moves to X
(home = X, its windows relocated); a source left showing a moved workspace shows the workspace it
most recently showed that has windows, else its lowest with windows, else an unused one (S10's
rule, i3's focus order). Then X shows: its lowest-numbered workspace, else its first assigned
workspace (lowest number in `workspaceOutputs` naming X first), else the lowest free one (M1's
rule). kwin-i3 sets this over whatever KWin picked, so two outputs never show one workspace (M5's
"can be a workspace another output shows" goes).

### D. Focus after any output change (D5)

At the end of `screensChanged`: the first output's visible workspace gets the focus, its
fullscreen window, else its last focus (i3's primary-output focus). With the pointer elsewhere,
stage 2's warp brings it (A2: focus moved output, the pointer isn't there).

### E. What goes

`beforeLoss`, the "each output shows again what it showed" restore, and the name memory of absent
outputs; `plan.md` decision 10 already says why (the state behind most replug bugs).

## Tests

- **Run**: `make unit`; 40, 41, 42, 45, 46, 47, 48, 49, 84, 36 (per-output off).
- **Expectations that change**, each its own call in the review:
  - 45, 46, 47, 48 are fuzzer regressions about windows' geometry across a replug, and each
    relies on workspace 2 going back to the returning monitor. **Proposed**: their setup assigns
    2 to the second monitor (`workspaceOutputs=2=Virtual-1`), so i3's rule brings it back and the
    geometry checks keep their meaning; a line in each header says why.
  - 42 (a window sent to 2 while away): it already expects 2 not to return; its "the monitor gets
    an unused one" stays true.
  - 41 and 84 (unplug focus): unchanged, they are i3's case.
- **New checks, approved (Paul, 2026-10-28)** (rule 5): in 49, a two-output list (`2=Virtual-9 Virtual-1`: the
  first absent, so 2 goes to Virtual-1), and an unassigned workspace with windows on a lost
  monitor staying on the first one after it returns; in 40, a returning monitor showing a free
  workspace, not the one it showed.
- **Unit, approved (Paul, 2026-10-28)**: `workspaceOutputs`' list form in `tests/unit/settings.test.js` (exists);
  B's and C's choices (which home, what X shows) as pure functions of (outputs in order, homes,
  assignments, workspaces with windows), in a node-loadable file: `src/workspaces.js` isn't (it
  uses KWin's `workspace` and has no `module.exports`; only `tree.js` has).

## Live check (Paul)

Unplug the second monitor (or turn it off) with windows on its workspace: they join the first
monitor and stay there when it's back; the returning monitor shows a free workspace. With a line
like `3=DP-6` in `workspaceOutputs`, workspace 3 goes back to DP-6 when it returns. Focus after
either: on the first monitor.

**After a night with the monitors asleep** (call 62): Meta+Shift+B in the morning; the capture's
log shows whether outputs came and went (a DisplayPort monitor that disconnects when it sleeps
would count as an unplug every night). If they do, `workspaceOutputs` assignments are the answer.

## Done when

Live and Paul's "it works": W3, W5, M3, M4, M5, D5 rewritten as built; §11's `workspaceOutputs`
row gives the list form; `plan.md` decision 10's "Verified" line kept.

## Paul's review (2026-10-28)

61. Defaults stay i3's (no assignments): a monitor that goes away keeps its workspaces on the first
    one until assigned; Paul's own layout can be assigned in kwinrc for today's feel.
62. The overnight check above goes into the live check (two days of logs showed no disconnect, not
    proof).
