# Spec: desktops removed or reordered mid-session (OPEN.md item 6)

**Now (2026-10-27):** Built and live 2026-10-24. What it does: `behaviour.md` §4, "Desktops and monitors changing", and §10's known limits.

From `docs/records/spec-desktops-on-demand.md` ("found on the way", 2026-10-24); Paul asked for this spec
2026-10-24. Status: **decided by Paul, 2026-10-24: (a), re-adopt everything ("do a"); numbered
settings stay positions, no notification (decision 2 without its extra); a removed shown desktop
as KWin does (3). Built the same day: `desktopListChanged` in `src/kwin.js`,
`tests/live/65-desktop-changes.sh` (18 checks; 13 red with the handler disabled).**

Sources: KWin 6.7.5 `virtualdesktops.cpp` (`removeVirtualDesktop`, `moveVirtualDesktop`),
`workspace.cpp` (`slotDesktopRemoved`), `scripting/workspace_wrapper.h` (`desktopsChanged`);
`src/kwin.js`, `src/workspaces.js`.

## The problem

Workspace N is KWin's virtual desktop N, by position (`Workspaces.deskOf(n) =
workspace.desktops[n - 1]`). KWin numbers desktops with no gaps:

- **Removing** desktop i (System Settings, the pager, a script): every later desktop moves down one
  (`removeVirtualDesktop`: `setX11DesktopNumber(j + 1)` for j >= i). The removed desktop's windows
  go to the desktop that took its place, or the last one (`slotDesktopRemoved`:
  `pickNewVirtualDesktopForWindow`), and a monitor that showed it now shows that one.
- **Reordering** (`moveVirtualDesktop`): positions change, windows stay on their desktop.
- **Appending**: nothing moves. That is all kwin-i3 itself does (desktops on demand).

kwin-i3 doesn't watch any of this. Its model keeps workspace numbers, homes (which monitor a
workspace lives on) and every tiled window's workspace by number. After a removal or a reorder the
numbers name other desktops: the next pass moves windows to the desktops their old numbers now
name (`relocate`), so workspaces swap contents, and a removed desktop's windows are in the model
twice over (their old workspace, and the desktop KWin put them on).

KWin's tiles belong to the desktop, not to its number (`workspace.rootTile(screen, desktop)`), so
a desktop's layout survives the change on KWin's side.

## The rule

kwin-i3 watches `workspace.desktopsChanged` and keeps the desktop behind each workspace number
(its id). When the list changes:

- only new desktops at the end: nothing (as now);
- anything else (a removal, a reorder, a desktop inserted before others): **workspace numbers
  follow KWin's new order.** The workspace that was on desktop 4, after desktop 3 is removed, is
  workspace 3, with its windows and its layout, on its monitor; what the pager shows and what
  Meta+3 shows agree. A removed desktop's windows join the workspace KWin moved them to.

Two ways to do that:

- **(a) Re-adopt everything, as a reload does.** The model, homes and window records are dropped
  and rebuilt from KWin's state through the load path (`startRest`: windows in KWin's tiles keep
  their layout; the rest are adopted; floating windows stay floating by the effect's set or the
  kept-above flag). Every window is re-placed once (as at a reload); no new logic at the seam,
  the load path is the most tested one (60-load, the reload steps of 54, 58, 62).
- **(b) Renumber in place.** Map old numbers to new through the desktop ids, renumber the model's
  workspaces and homes, re-adopt only the evacuated windows. Nothing else moves, but it is new
  code where the fuzzer finds its bugs (hidden desktops, per-monitor current desktops).

## Decisions for Paul

1. **(a) or (b).** Recommendation: (a). A desktop removal is rare and deliberate; a reload's
   re-tile is accepted for fixes already; (a) reuses the path every reload exercises.
2. **The numbered settings** (`workspaceOutputs` "3=DP-4", `floatingWorkspaces` "3, 7") name
   positions. After desktop 3 is removed, "3" means what was workspace 4. Options: leave them as
   positions (i3's config works that way: a number is a number), or rewrite them to follow their
   desktops. Recommendation: positions, and one notification when a removal or reorder changes
   what a numbered setting points at ("workspace 3's settings now apply to the desktop that was
   4").
3. **Removing the shown desktop.** KWin shows the next one on that monitor; kwin-i3 follows. With
   (a), focus goes where the load path puts it (the active window). Recommendation: as KWin does.

## Tests (`tests/live/65-desktop-changes.sh`)

- Five desktops; windows on 2 (a), 3 (b c, side by side), 4 (d), 3 shown on the first monitor.
  Remove desktop 2 (over KWin's D-Bus, `removeDesktop`): workspace 2 now holds b and c, side by
  side as before, workspace 3 holds d, a is on the desktop KWin moved it to and in that workspace's
  tree; no window lost or doubled (`tree`), no invariant failure, Meta+2 shows b and c.
- Reorder: move desktop 3 to position 1 (`moveDesktop`... over D-Bus if KWin offers it, else a
  KWin script `workspace.moveDesktop`); the workspaces follow; nothing lost.
- Append (a desktop created at the end): no re-adoption (the log says nothing), nothing moves.
- A floating window on a removed desktop stays floating where it lands.
- Watched red: without the handler, the first two fail (kwin-i3 moves windows to the old numbers).
