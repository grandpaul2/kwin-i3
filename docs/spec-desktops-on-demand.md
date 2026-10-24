# Spec: workspaces created on demand (OPEN.md item 4 (a))

Paul's go 2026-10-24 (never removed, as recommended); built the same day. Part of "no dependence on Paul's dotfiles".

## The gap

Workspace N is virtual desktop N (`src/workspaces.js`). A stock Plasma has one desktop; Paul's
ten come from `setup.sh` (`createDesktop` over D-Bus, on a machine still at one). On a stock
machine today:
- Meta+2..0 and Meta+Shift+2..0 do nothing (`gotoWorkspace` / `moveToWorkspace`:
  `if (!deskOf(n)) return`);
- at login, `numberScreens` gives workspace 1 to the primary and nothing to the second monitor;
- a monitor plugged in finds no unused workspace (`unusedWorkspace` skips `!deskOf(n)`).

i3 creates a workspace when it is first used. kwin-i3 does the same with KWin's desktops.

## KWin's side (6.7.5, read from the source)

- `workspace.createDesktop(position, name)` (`workspace_wrapper.cpp`) calls
  `VirtualDesktopManager::createVirtualDesktop`: it is synchronous, an empty name gives KWin's
  default ("Desktop N"), and the maximum is 20.
- `TileManager` gives the new desktop a root tile on every output in its `desktopAdded` handler,
  which runs inside that call (`tiles/tilemanager.cpp:82`), so `deskOf(n)` and
  `workspace.rootTile(s, deskOf(n))` work on the next line.
- It **saves**: `[Desktops] Number` and the new `Id_N` go to `kwinrc` (`save()`). A desktop kwin-i3
  creates is still there at the next login, exactly as if it were added in System Settings or the
  pager.

## The change

1. **`Workspaces.ensure(n)`**: while `workspace.desktops.length < n` (and n <= 10, kwin-i3's
   keys), `workspace.createDesktop(workspace.desktops.length, "")`. Desktops are appended only
   at the end, so no existing desktop moves and no workspace is renumbered. It logs
   `DESKTOPS created k..n`.
2. Called from:
   - `gotoWorkspace(n)` and `moveToWorkspace(n, con)` (Meta+N, Meta+Shift+N), before the
     `deskOf(n)` check. Workspace 7 also creates 2..6, empty (KWin's desktops are numbered with
     no gaps). They are created by the key, shown nowhere, and get a home when first used, as now.
   - `numberScreens` (login, no windows): `ensure(min(screens, 10))` first, so each monitor gets
     its own workspace, as i3 does (`create_workspace_on_output`).
   - `unusedWorkspace(s)` (a monitor arrives): when no existing workspace is unused, the next
     number is created and used, up to 10. `null` only when all ten are taken, as now.
3. **Never removed.** i3 deletes an empty workspace when it's left. kwin-i3 doesn't:
   - removing renumbers every desktop after it (`removeVirtualDesktop`), and only trailing ones
     could go safely;
   - a desktop count that changes by itself would show in Plasma's pager and Overview;
   - KWin keeps a created desktop anyway, as any Plasma user does.
   The created desktops stay, at most ten (Paul, 2026-10-24). The alternative, removing trailing
   empty ones kwin-i3 created once they're shown nowhere, is i3's behaviour, at the cost above
   and of new code at the seam the fuzzer finds bugs in (hidden desktops, unplug).
4. Paul's desktop has ten already: nothing changes there.

## Found on the way (not part of (a))

kwin-i3 doesn't watch the desktop list (`workspace.desktopsChanged`). Removing or reordering a
desktop in System Settings mid-session renumbers KWin's desktops under kwin-i3's model: the
windows of workspace 4 are on what is now desktop 3. Adding one at the end is harmless. Not
caused by (a), which only appends. Its own `OPEN.md` item (6), Paul 2026-10-24: on a removal or move,
re-adopt every window (as a reload does) and log it, or say in the README that the count is
changed by a reload's worth of re-tiling. To decide later.

## Tests

- **`testkwin.sh`: `KI3_DESKTOPS=<n>`**, the test KWin's desktop count (default 10, as now), and
  `# desktops: N` in a scenario for `run.sh`. The first piece of the planned `KI3_STOCK=1` mode.
- The monitor path (`unusedWorkspace` creating one) checked by hand once: `42-replug-home.sh`
  run with `KI3_DESKTOPS=2` passes, its returning monitor showing a created workspace 3.
- **New live scenario `34-desktops-on-demand.sh`**, with `KI3_DESKTOPS=1` and the two outputs:
  1. at load, there are 2 desktops; screen 0 shows workspace 1 and screen 1 shows workspace 2;
  2. Meta+5 (injected keys) on screen 0: there are 5 desktops, and screen 0 shows workspace 5;
  3. a window, then Meta+Shift+7: there are 7 desktops, and the window is on workspace 7;
  4. Meta+3: no desktop created (still 7), and screen 0 shows workspace 3;
  5. the test KWin's `kwinrc` says `Number=7` (KWin saved it);
  6. no invariant failures or errors.
- **Watched red**: a mutant with `ensure` doing nothing fails at the first check, and with only
  the `numberScreens` call removed it fails check 1 alone (`make mutate`, or a worktree).
- The rest of the suite keeps ten desktops, so nothing else changes. The stock-mode sweep
  (`OPEN.md`) later runs every scenario at one.
- Docs: the README's install section no longer needs ten desktops; the "Desktops" line in its
  configuration notes says kwin-i3 creates them, saved by KWin.
