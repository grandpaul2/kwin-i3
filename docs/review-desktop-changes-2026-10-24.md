# Review: desktops removed or moved mid-session (2026-10-24)

A second agent's code review of `git diff main...desktop-changes` (at its first commit) against
`docs/spec-desktop-changes.md` and KWin 6.7.5. Read-only. Handling in brackets.

1. **Must-fix: `rebuilding` could stay true for good** (an exception in the deferred rebuild:
   `flush` returns early for ever). [Fixed: the rebuild's body releases on a failure, as a
   failing load does.]
2. **A second change while a rebuild waits for the effect's answer was dropped**: tiled windows
   adopted by the old positions, the rest by the new. [Fixed: rebuild again when the list changed
   meanwhile. Test: desktop 1 removed, one inserted at the front during the wait; red without.]
3. **A removed shown desktop could leave two monitors on one desktop** (KWin gives each the same
   next desktop). [Fixed: after a rebuild, `showHomes` (per-monitor desktops). Test: red without.]
4. **Model-only layout is lost** for windows never in a KWin tile (sent to a hidden workspace),
   and per-workspace focus history: as at a reload. [Accepted; in the spec.]
5. Notes: homes from `workspaceOutputs` dropped by the reset [re-applied]; `beforeLoss` and
   `touchedRoots` by old numbers [cleared; keyed by desktop id]; `keptAbove`/`tookBorder` of a
   window not re-adopted (narrow) [left]; a window added in the tick before the rebuild comes back
   not fresh [left, one tick]; the 250 ms pause without the effect [as at load].
6. Test gaps: floating window on a removed desktop, the shown desktop removed, two quick changes,
   a desktop inserted in the middle, the layout after the rebuild [all in
   `tests/live/66-desktop-changes-more.sh`]; an exception in the rebuild [not testable without a
   fault hook].

Checked and right: `workspace.desktopsChanged` is wired to desktopAdded, Removed and Moved
(`workspace_wrapper.cpp:42-44`); KWin moves a removed desktop's windows before the script hears
it (`slotDesktopRemoved` connected in Workspace's constructor); the removed desktop's tiles are
deleted (`tilemanager.cpp:83-87`); a desktop created in the middle counts as a change; per-window
handlers follow the new model; `connected` kept; focus starts empty and `wantFocus` follows.
