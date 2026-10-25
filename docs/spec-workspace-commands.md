# Spec: workspace back-and-forth, next/prev, output moves, workspace names

Draft 2026-10-25, for Paul's go. From the i3 feature map (`docs/i3-feature-map.md`, holes) and
Paul's answers the same day: **offer them, bind nothing** (i3 binds none of these by default),
skip swap, names yes, more than ten no.

All new commands are **actions with no key**, registered like the self-test ones
(`registerShortcut(name, text, "", fn)`): they appear in System Settings > Shortcuts > KWin as
"kwin-i3: …", for the user to bind. `tests/keys.json`, the taken-keys check, `make take-keys`
and the cheat sheet see no new keys.

Ported from i3 4.24's source (`src/workspace.c`, `src/commands.c`, `src/con.c`), read
2026-10-25. kwin-i3 has numbered workspaces only, so i3's named-workspace branches drop out.

## 1. Back-and-forth

i3: `previous_workspace_name` is set in `workspace_show` to the workspace focused before it,
every time the focused workspace changes (a key, `focus output`, focus crossing a monitor, the
mouse, an activated window). `workspace back_and_forth` shows it (re-created if it was empty
and closed). `move container to workspace back_and_forth` sends the focused window there.
`workspace_auto_back_and_forth` (config, **default off**): `workspace N` for the workspace
already focused goes back instead (`maybe_back_and_forth`); it applies to
`move container to workspace N` too.

kwin-i3:
- **The previous workspace** is recorded in `Tree.activate` (`src/tree.js`, the one place
  global focus changes): when the focused workspace changes, the old one's number is kept.
  That covers every cause above, as i3's `workspace_show` does. Cleared by the model's
  rebuild (`docs/spec-desktop-changes.md`); a number past the desktops that exist is ignored.
- **Actions**: "Workspace Back and Forth" (`gotoWorkspace(prev)`; nothing if none) and
  "Move to Workspace Back and Forth" (`moveToWorkspace(prev, focused)`).
- **Setting** `workspaceAutoBackAndForth` (bool, default false) in `[Script-kwin-i3]`, the
  Configure form and the settings page: Meta+N for the focused workspace goes back, and
  Meta+Shift+N for it sends the window back. Only the workspace keys check it, as in i3:
  next/prev and back-and-forth itself don't.

## 2. Next and previous

i3 (`workspace_next`, `_prev`, `_next_on_output`, `_prev_on_output`): among the workspaces
that exist, the next higher number, across all outputs; past the highest, the lowest (wraps).
`_on_output` considers only the focused workspace's output. In i3 a workspace exists while it
has windows or is shown.

kwin-i3: a workspace **exists** if its model has windows (tiled or floating) or a monitor shows
it (what the widget shows). The target is shown with `gotoWorkspace`, so one on the other
monitor is focused there, as i3's `workspace_show` does. With one workspace, nothing happens.
On-output: the workspaces whose home is the focused workspace's monitor (`outputOf`).
**Actions**: "Workspace Next", "Workspace Prev", "Workspace Next on Output", "Workspace Prev on
Output". The choice of target is a pure function, unit-tested in node.

## 3. Output moves

Directional focus and move already cross monitors at the edge (`tree.js:481`, `:733`). These
are i3's explicit forms, each with left, right, up and down (`screenToward`, i3's
`get_output_next`); no monitor that way does nothing.

- **Focus Output** (i3 `cmd_focus_output`): show the target monitor's visible workspace with
  `workspace_show`, which focuses its focused window: `model.activate(descendFocused(ws))` of
  that workspace, as `gotoWorkspace` ends.
- **Move to Output** (i3 `con_move_to_output`): the focused window to the visible workspace of
  the target monitor, `moveToWorkspace` with that workspace. **Focus stays** on the source
  workspace, on the window i3 picks next (`_con_move_to_con` step 7; `Tree.moveToWorkspace`
  already does this). A floating window keeps its relative position (`relocate` →
  `sendClientToScreen`).
- **Move Workspace to Output** (i3 `workspace_move_to_output`): the focused workspace's home
  becomes the target monitor, which shows it, and it keeps the focus. Reconcile's `relocate`
  carries every window, floating ones included. The source monitor, if it showed the
  workspace, shows instead the workspace it showed most recently that still lives there (i3's
  focus stack on that output: a small per-monitor history, updated where kwin-i3 already notes
  what each monitor shows); with none, an unused workspace (`unusedWorkspace`, as for a
  returning monitor; i3's `create_workspace_on_output`). If all ten are taken, the move is
  refused and logged. A workspace given an output by `workspaceOutputs` moves all the same:
  as in i3, an assignment applies when the workspace is created.

**Actions**: 12, "Focus Output Left" … "Move to Output Left" … "Move Workspace to Output Left" ….
For two monitors side by side only Left/Right matter, but up/down are the same code and cost
nothing but rows in the Shortcuts page.

## 4. Workspace names

Names are Plasma's: System Settings > Virtual Desktops renames desktop N, which is workspace N
(kwinrc `[Desktops] Name_N`). kwin-i3 creates desktops with no name and never removes one, so
it never resets a name. KWin's Overview and desktop-switch OSD already show them.

**The widget** reads the names (`desktopNames`) and labels each workspace with its number only
(`main.qml:142`). Change: a named workspace's label is **"2 mail"** (number, a space, the name);
the tooltip "Workspace 2: mail". A desktop with no name of its own carries KWin's default,
`i18n("Desktop %1")` (`virtualdesktops.cpp:762`), in the user's language: the widget compares
with `i18nd("kwin", "Desktop %1", n)`, KWin's own string, and treats a match as unnamed. In
"Numbers only" mode the button widens to fit the label. Unit-tested in `widget.test.js`
(default name, custom name, another language's default).

## Tests

- **Unit**: the previous-workspace record in `Tree.activate` (focus within a workspace doesn't
  change it; across does); next/prev target selection (gaps, wrap, one workspace, on-output);
  the widget's label rule; the new setting's parsing.
- **Live** (`tests/live/`, two outputs, actions invoked with `invokeShortcut`, as the existing
  key scenarios do): back-and-forth after Meta+N and after focus crosses a monitor; move to
  back-and-forth; auto back-and-forth on and off; next/prev wrapping across both monitors and
  on-output; focus output; move to output with focus left behind; move workspace to output
  with a tiled and a floating window (pixel positions on the target, the source showing its
  previous workspace, then an unused one when there is none). Each new check watched red
  first (a scenario before the code, or a deliberate fault).
- `make test`, then a second agent's read of the new scenarios before relying on them (a
  substantial new set), then live.

## Not here

Swap (Paul: skip). More than ten workspaces (Paul: skip). Default keys for any of these.
Name-based commands (`workspace mail`): they need a way to type a name; not asked for.

## For Paul

1. The label: "2 mail" (recommended), or i3bar's "2:mail", or the name alone.
2. Output moves: all four directions (12 actions, recommended: monitors can be stacked), or
   left/right only (6).
