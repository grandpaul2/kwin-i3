# kwin-i3 — plan

Rewritten 2026-10-21 after the tile spike (`docs/spike-kwin-tiles.md`), then revised the same night
after an independent review (`docs/review-2026-10-21.md`; each finding's disposition is at its end).
The first version, a new layout inside Krohnkite, is in git history.

## Goal

i3's window management, as Paul used it, inside a stock Plasma 6.7 Wayland session: windows are
entities in a tree that move among each other, not contents moved between fixed divisions. One
KWin script, replacing `i3ws` + patched Krohnkite in `~/.dotfiles`, with the current behaviour
kept exactly where it already matches i3 (Paul called it "ideal").

## Decisions

1. **One plain-JS KWin script** (`KWin/Script`, `X-Plasma-API: javascript`). No QML: a plain-JS
   script reloads with `unloadScript` + reconfigure in seconds; a QML one needs a logout and can
   leave a stale copy running. Plain JS has everything needed: `registerShortcut`, `callDBus`,
   `QTimer` (registered for scripts in `scripting.cpp`).
2. **Plain JavaScript, no compiler.** `build.sh` concatenates `src/` into the one file KWin loads,
   with a `// ---- src/<file>.js` marker at each file start so KWin's line numbers can be mapped back.
3. **The model owns structure and focus; KWin's tiles own sizes and are the display.**
   - The model is an i3 tree per workspace: containers with orientation, leaves holding windows,
     i3's focus stack. That is what `tree_move`, `tree_flatten` and tree-based focus need, and it
     can be tested in node with no KWin.
   - **The model keeps i3's shares (`percent`)**, because i3's rules for them are exact and
     testable: a new window gets the average share, a closed one's share is spread proportionally
     (`con_fix_percent`). Reconcile writes them to the tiles. A size changed *in KWin* (a border drag)
     is read back into the model once, when the drag ends, not on every `relativeGeometryChanged`.
     (Changed in phase 1, 2026-10-21: "sizes only in the tiles" could not reproduce i3's shares.)
   - Considered and rejected for now: tiles as the only structure (review S3-11.1). It removes the
     projection, but i3's flatten and move rules would then be written against a structure that
     collapses on its own and can't be tested without a fake. Revisit if the projection proves costly.
4. **One idempotent `reconcile(workspace)`** applies the model to KWin: compute the wanted tile tree
   and window assignment, diff against the live tiles, change only what differs. Every event handler
   updates the model and schedules a reconcile; a zero-interval `QTimer` coalesces a burst into one
   pass. Nothing else writes to tiles. (Replaces "project on each change" and i3ws's 5-second window.)
5. **Start-up reads the live tiles back** into the model (structure from layout tiles and their
   directions, focus from `workspace.stackingOrder`), so a reload keeps the layout. Only tiles that
   hold zero or several windows fall back to inserting after the focus. KWin's saved defaults (the
   3-column template) hold no windows and are discarded.
6. **Tile calls, in this order, always**: `oldTile.unmanage(w)`, then change `w.desktops` / output,
   then `newTile.manage(w)`. `manage` refuses a window not on the tile's desktop (verified, round 4).
   `window.tile =` is deprecated in 6.7 and is not used.
7. **Our own tile events are expected, everything else is foreign.** The adapter records
   `expected[window] = tile` before each `manage`/`unmanage` and clears it when the matching
   `tileChanged` arrives (it lags for Wayland clients). A foreign `tileChanged(null)` means KWin or
   the user untiled the window; the policy table below says what happens.
8. **i3's semantics are ported from i3's source, not re-derived**: `tree_move` (src/move.c) with all
   its cases, `tree_flatten` where i3 calls it, tree-based `focus` (`tree_next`, descend by focus
   stack), insertion after the focused container, `split`, `layout toggle split`, close and
   focus-after-close (`tree_close_internal`). **Done in phase 1** (`src/tree.js`). Checked against
   the source, i3 calls `tree_flatten` only after a move that re-parents and after a layout change
   on a workspace; *not* after a close or a plain swap (the review said otherwise). And
   `tree_flatten` only removes a one-child split whose child is itself a split: a split holding one
   window stays, as i3 keeps it. KWin collapses those itself; the projection must tolerate that.
   **One deliberate break (Paul, 2026-10-23)**: a split whose only child is another split is
   removed after moves, closes, layout changes, float and send-to-workspace. i3 keeps them, and
   each one costs a move key press. They only matter in i3 because of `focus parent` and
   tabbed/stacked, both left out here; adding either means revisiting this first.
   `docs/spec-nested-boxes.md` has the reasoning, i3's side and the risks.
   **Atomic layout changes (Paul, 2026-10-23)**: a KWin effect, `kwini3hold` (plugin/hold.cpp),
   holds the old layout on screen until every moved window has its new frame, as Sway's
   transactions do; i3 on X11 never had the gap. `docs/spec-atomic-layout.md`.
9. **Workspaces work as i3ws does today**, and i3ws's code stays as its own source file
   (`src/workspaces.js`) with tests added around it, not rewritten: desktop N is workspace N; it lives on
   one monitor; login numbering (1 on the primary, 2 on the next, re-applied after Plasma's activity
   restore); the pointer follows focus across monitors. Only its calls into Krohnkite change.
10. **When a monitor goes away, its workspaces move to a remaining monitor and go back when it
    returns**, as in i3. The model keeps each workspace's home output; reconcile re-tiles everything
    once the screens settle. Windows KWin moves on its own during a hotplug are ignored: the model,
    not KWin's move, says where they belong. (Verified: a window KWin moves to another monitor loses
    its tile and is switched to the desktop that monitor shows.)

## Repo layout

```
src/tree.js        the i3 tree: containers, leaves, focus stack, every operation. No KWin calls.
src/workspaces.js  i3ws: per-monitor workspaces, numbering, pointer warp, screen tracking
src/kwin.js        adapter: KWin signals in, model operations, reconcile out, the tile-event protocol
src/rules.js       which windows tile, and when that is decided
src/keys.js        the shortcut table (it must match the dotfiles README "Plasma" table)
build.sh           src/ -> package/contents/code/main.js, with file markers
package/           the installable KWin script (metadata.json + built main.js)
tests/unit/        node tests of tree.js (and workspaces.js against a fake)
tests/live/        scenarios run in tools/testkwin.sh (headless KWin, two virtual outputs)
tools/             testkwin.sh, logsink.py, testclient (below)
```

## Behaviour (the spec is Paul's old i3 config, git `d3de958^` in `~/.dotfiles`)

| keys | i3 | notes |
|---|---|---|
| Meta+1…0 | workspace N | i3ws behaviour, unchanged |
| Meta+Shift+1…0 (and the symbols) | move container to workspace N | lands after the focus there; a hidden workspace is fine (KWin places it when shown, verified) |
| Meta+arrows, Meta+J/K/L/; | focus dir | **i3's tree-based focus**, across monitors at the edge (i3 picks the most recently focused leaf of the neighbouring branch, not the geometrically nearest; i3ws's was geometric) |
| Meta+Shift+ same | move dir | i3 `tree_move`, all cases incl. `ws_force_orientation`; at the workspace edge, to the visible workspace of the neighbouring monitor (i3ws's `screenToward`), landing on the side it came from |
| Meta+H / Meta+V | split h / split v | new |
| Meta+E | layout toggle split | new |
| Meta+Shift+Space | floating toggle | new (Paul: yes, 2026-10-21) |
| Meta+Space | focus mode_toggle | new (Paul: yes, 2026-10-21) |
| Meta+Ctrl+arrows, Meta+Ctrl+J/K/L/; | resize | **not a mode**: a script cannot register keys that exist only inside a mode, so i3's Meta+R mode is not buildable (review S3-9). Steps of 10 % as in the old config |
| Meta+F | fullscreen | KWin's own; the window returns to its tile (verified). As in i3 (per-output fullscreen): focus and move from a fullscreen window go to the neighbouring monitor; other windows on that workspace can't be focused while it is fullscreen: the keys don't, a new window opens behind it without focus (KWin's activation is handed back; its own dialog excepted) and Meta+N onto that workspace focuses it. The mouse is not blocked. A window opened or sent there while it is fullscreen is in the tree and joins the tiles when fullscreen ends (`docs/spec-fullscreen-tree.md`, 2026-10-24) |
| Meta+Shift+Q | kill | KWin's own |
| Meta+Ctrl+Shift+Q | **release** | safety valve: unmanage every window, restore KWin's default tiles, stop acting until reload |

**Left out, Paul's decisions (2026-10-21):** tabbed and stacked ("I don't use tabbed"),
`focus parent` ("never used this"), urgent windows (i3 showed them in its bar; there is no bar here).
Also left out: i3's reload/restart/exit keys (reload is `unloadScript` from a session; exit is
Plasma's own).

## Policies the adapter applies

| event | policy |
|---|---|
| new window | tiled after the focused container **of the workspace it appeared on** (KWin chooses the monitor; the desktop is that monitor's current one, as i3ws does), classified as below |
| classification | decided when the window is ready (`readyForPaintingChanged` if not ready at `windowAdded`) and redone on `captionChanged`, `windowClassChanged`, `transientChanged` |
| floats | transients and modals, `!resizeable`, `skipPager`, Krohnkite's default ignore-class list (krunner, yakuake, spectacle, plasmashell, ksplashqml, polkit agent, kruler, …) and the stage window (`STAGE (streamed)`); not `normalWindow` is never a candidate. **On Wayland a dialog *is* `normalWindow`**
(xdg-toplevel has no window type; only `transient`/`modal` mark it, seen in phase 0), so the
transient rule is what floats dialogs. Floating windows stay above tiled ones |
| never managed | `onAllDesktops`, `skipTaskbar`, other activities (one activity: everything else is ignored) |
| minimum size | the leaf tile's `minimumSize` is the window's `minSize`, propagated up the tree; a window that can't fit floats |
| maximize | undone, and the window re-tiled (maximize drops it from its tile, verified) |
| minimize | the leaf stays in the tree, its tile is removed, and it comes back in place on un-minimize. **Not across a reload**: KWin's tiles don't hold a minimized window's place and a script can't save state, so after a reload it comes back after the focus (found 2026-10-22) |
| foreign untile (Meta+Shift+drag via the kwini3mouse plugin, KWin quick-tile) | the window floats where it was dropped; Meta+Shift+Space tiles it again. (i3's drag-to-retile, `tiling_drag`, needs title bars or a modifier drag; later, if wanted) |
| monitor returns, a window there was fullscreen, its workspace hidden meanwhile | **known limit, accepted (Paul, 2026-10-22; fuzzer I9, seed 214)**: KWin's `PlacementTracker` asks the window to be fullscreen again and moves it back, but a hidden window gets no frame callbacks, never acknowledges, and KWin applies nothing until it does (only a thumbnail or screencast would make it render; a JS script can do neither). Meanwhile KWin calls it not resizable, refuses the tile, and kwin-i3 floats it where it stands, on the other monitor, out of sight. (Since 2026-10-24 a window KWin reports as fullscreen is not floated on a refusal but kept in the tree, out of the tiles until fullscreen ends; this limit is the *pending* request, where KWin reports it not fullscreen yet.) Meta+Shift+N, or closing it, brings it back. The alternative, flipping its desktop for a moment so it renders, was judged not worth a workaround. Same limit, other trigger (fuzzer I9, seed 28, 2026-10-23): a hidden floating window smaller than KWin's 150 px decorated minimum gets a resize with any move KWin sends it (`checkWorkspacePosition` constrains the size), so it stays behind on a replug too. Real apps report a minimum of their own; the test client's dialog now starts at 200x160 |
| close | leaf removed, empty splits removed upwards (no flatten), focus to the previous focus in that container |
| focus follows mouse | KWin's `windowActivated` updates the focus stack; the last focus event wins, as in i3 |
| errors | every handler in try/catch: log over D-Bus (`tools/logsink.py` protocol, behind a config flag in production) and reconcile |

An **invariant check** runs after every reconcile in the live tests and, cheaply, in production
(logged): every tiled window is in exactly one leaf, each leaf's tile holds exactly that window, no
tile is empty, no root has padding.

Every root the script sees, including new desktops and returning outputs, gets `padding = 0`;
`setup.sh` also sets `[Tiling] padding=0` so new roots start that way.

## Phases — each ends green, committed, pushed

0. **Scaffold.** Layout, `build.sh`, `make test` (unit + live). A small test client for the
   harness (Python + GTK 4 or Qt) with flags: fixed size, large minimum size, transient dialog,
   slow to map, retitles itself. Alacritty can't be any of those.
1. **Model. Done 2026-10-21**: 46 unit tests (6 translated from i3's own testsuite), and
   `make mutate`, 16 deliberate faults, every one caught. `src/tree.js` with unit tests per `tree_move` case, `tree_flatten`, tree focus,
   close-focus, split, toggle, insertion. Each test written from i3's source; each guard watched to
   fail with a deliberate fault before it counts.
2. **Adapter, one monitor. Done 2026-10-22** (`src/kwin.js`, `src/rules.js`; live scenarios
   10-tiling, 20-rules, 30-more, 80 checks in 6 s; `make mutate-live`, 19 faults, all caught).
   **Adapter, one monitor.** Reconcile, the tile-event protocol, start-up from live tiles, rules,
   min sizes, the policies above, the release action. Live tests drive keys with `invokeShortcut`
   and read geometry back; the invariant check runs after each step.
3. **Workspaces and monitors. Done 2026-10-22** (`src/workspaces.js`; live scenario
   40-monitors with a real unplug/replug through `kscreen-doctor`; battery: 26 faults, all caught,
   3 min). **Workspaces and monitors.** `src/workspaces.js` from i3ws, cross-monitor focus and move,
   numbering, the hotplug policy. Live tests on both virtual outputs. Hotplug: the virtual backend *can*
   unplug an output (`kscreen-doctor output.Virtual-1.disable`). If it couldn't, reconcile is driven from a synthetic "windows lost their tiles and
   the screen set changed" state, which is what a hotplug leaves behind. Not by hand on Paul's desktop.
4. **Real input. Done 2026-10-22, automated** (Paul: "why can't this be automated ... set the
   precedent now"): input injected through libei into the headless KWin (`tools/inject.py`);
   scenarios 50-keys and 51-input. The nested-window session with Paul below is dropped. ~~Real input, outside Paul's session. Tell Paul before it starts~~ (his words, 2026-10-21). A nested `kwin_wayland` window with two
   outputs on his desktop, real apps inside, for what headless can't do: focus follows mouse, pointer
   warp, border drag, Meta+drag. It shows a window on his desktop, so only with his OK.
5. **Switch-over on Paul's desktop. Done 2026-10-22**, all steps: login numbering right (1 on the
   right/primary, 2 on the left); every kwin-i3 key one live owner after Dolphin moved to Meta+T;
   the stage floats at 1280x720 above; Firefox, Prism Launcher and KeePassXC tile with nothing
   off-screen; Minecraft fullscreen on 5 survives a workspace switch; the release key releases
   everything on the real desktop; a clean reload with no journal warnings. Discord skipped (Paul
   no longer uses it). Way back stays in `~/kwin-i3-WAYBACK.txt` until phase 6. With Paul present, at a logout (Krohnkite is QML). The
   checklist is from the live-desktop review (docs/code-review-live-2026-10-22.md):
   0. Pre-flight, read-only: `make test` green, both repos clean and pushed; no `[Script-kwin-i3]`
      group in kwinrc (debug log off); back up `kwinrc` and `kglobalshortcutsrc`
      (`*.pre-kwin-i3`); write the way back to `~/kwin-i3-WAYBACK.txt` (on disk: the clipboard
      dies at logout).
   1. Install: `ln -s ~/kwin-i3/package ~/.local/share/kwin/scripts/kwin-i3` (metadata Id is
      `kwin-i3`).
   2. kwinrc `[Plugins]`: `i3wsEnabled=false`, `krohnkiteEnabled=false`, `kwin-i3Enabled=true`
      (kwriteconfig6, no reconfigure: three scripts must never run together). Keep the old keys,
      don't delete them.
   3. Close the stage and Minecraft; log out and in.
   4. Verify live: `isScriptLoaded kwin-i3` true and the old two false; workspace 1 on the right
      (primary), 2 on the left; every kwin-i3 key has exactly one owner on the live bus (his
      kglobalshortcutsrc still binds i3ws to all of them; plasmashell may hold Meta+V, Meta+1..9).
   5. Awkward apps one at a time: the stage (floats at 1280x720, above), Firefox, Prism Launcher,
      KeePassXC, Discord (nothing off-screen), Minecraft fullscreen on 5 and back.
   6. Release test while nothing is at stake: Meta+Ctrl+Shift+Q with 3 windows. Windows float where
      they were; the keys stay grabbed by the released script (workspace keys stop working) until
      `unloadScript kwin-i3` or a logout. A client grabbing the keyboard (the stage's Xephyr) blocks
      global keys: Meta+Shift+Esc first.
   7. If the desktop freezes: Ctrl+Alt+F3, log in, reverse step 2, log out (or
      `systemctl --user restart plasma-kwin_wayland`).
   Floating windows are kept above tiled ones (i3's behaviour; Krohnkite didn't): a "why is this
   on top" is that.
6. **Dotfiles. Done 2026-10-22** (Paul: "I'm happy with kwin-i3 now"). `setup.sh` clones `kwin-i3`,
   links `package/`, enables it and sets Dolphin to Meta+T; its shortcut pruning skips `kwin-i3*`;
   `health-check` checks the link; `i3ws` and the Krohnkite copy are retired, with their 83 live
   shortcut entries unregistered; the way-back files are deleted. The laptop runs real i3, untouched.
7. **Extras**: none decided yet.

**Action names are fixed now** (they persist in `kglobalshortcutsrc`, and renaming leaves dead
entries): `kwin-i3 <verb>`, e.g. `kwin-i3 Workspace 1`, `kwin-i3 Move Left`, `kwin-i3 Split V`.

Never load kwin-i3 into Paul's session while i3ws and Krohnkite are running: three scripts would
place the same windows.

## Risks

- **KWin's tile API is young** (`tilingForScreen` deprecated in 6.3, `window.tile =` in 6.7,
  per-output desktops new in 6.7). The live tests run against the installed KWin, so `make test` after
  a `dnf upgrade` says whether it still holds.
- **Reconcile churn**: windows jumping or resizing twice. The diff keeps it to what changed; the live
  tests count geometry changes per operation.
- **What Krohnkite solved that we haven't met yet** (Steam, Minecraft, Electron apps that re-parent,
  apps opening several windows at once). Each one met becomes a live test with the test client.
- **Untestable headless**: input-driven behaviour. Phase 4 exists for it.
- **kwinrc churn**: KWin rewrites `[Tiling]` on every tile change. Harmless; kwinrc is not captured.
