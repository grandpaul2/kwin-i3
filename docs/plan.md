# kwin-i3 — plan

Rewritten 2026-10-21 after the tile spike (`docs/spike-kwin-tiles.md`). The first version, a new
layout inside Krohnkite, is in git history.

## Goal

i3's window management, as Paul used it, inside a stock Plasma 6.7 Wayland session: windows are
entities in a tree that move among each other, not contents moved between fixed divisions. One
KWin script, replacing `i3ws` + patched Krohnkite in `~/.dotfiles`, with the current behaviour
kept exactly where it already matches i3 (Paul called it "ideal").

## Decisions

1. **One plain-JS KWin script** (`KWin/Script`, `X-Plasma-API: javascript`). No QML: a plain-JS
   script reloads with `unloadScript` + reconfigure in seconds; a QML one needs a logout and can
   leave a stale copy running (dotfiles CLAUDE.md, 2026-10-21).
2. **Plain JavaScript, no compiler.** i3ws is plain JS; a TypeScript toolchain is a second thing to
   keep working. Revisit only if the code outgrows it.
3. **Our model is the truth; KWin's tiles are the display.** The script keeps its own i3 tree per
   workspace and projects it onto `workspace.rootTile(output, desktop)`. Not the other way round,
   because KWin's tiles differ from i3 in ways that would leak into behaviour (spike §"Differences":
   empty tiles survive a close, single-child splits collapse, `split` halves, a desktop change
   leaves a window in the old tree). The model can then be tested in node with no KWin at all.
4. **Sizes flow both ways.** Structure goes model → tiles. A size the user changes (a border drag,
   once confirmed to work) comes back tiles → model, through `relativeGeometryChanged`.
5. **i3's semantics are ported from i3's source, not re-derived** (`src/tree.c`, `src/move.c`,
   `src/con.c`): insertion after the focused container, `split`, `tree_move`, closing,
   `layout toggle split`. Where KWin forces a difference, the difference is written down here.
6. **Single-child containers: keep them in the model, as i3 does.** The projection may flatten them
   for KWin (KWin collapses them anyway); the model never does, so `move` behaves as in i3.
7. **Workspaces work as i3ws does today**: desktop N is workspace N; it lives on one monitor; the
   login numbering (1 on the primary, 2 on the next); the pointer follows focus across monitors;
   hotplug keeps workspaces. i3ws's code is the starting point, merged in rather than called.

## Layout of the repo

```
src/tree.js        the i3 tree: containers, leaves, focus, every operation. No KWin calls.
src/kwin.js        the adapter: KWin signals in, model operations, projection onto tiles out
src/keys.js        shortcut table (one place, matching README)
build.sh           concatenates src/ into package/contents/code/main.js (KWin loads one file)
package/           the installable KWin script (metadata.json + built main.js)
tests/unit/        node tests of src/tree.js
tests/live/        scenarios run in tools/testkwin.sh (headless KWin, two virtual outputs)
tools/             testkwin.sh, logsink.py
```

`src/tree.js` ends with `if (typeof module !== "undefined") module.exports = …` so node can load it
and KWin ignores it.

## The model

- `Workspace { desktop, output, root }`; `root` is a `Container`.
- `Container { orient: "h" | "v", children: [Container | Leaf], weights: [number], focus: [child] }`
  (`focus` is i3's focus stack, most recent first).
- `Leaf { windowId }`.
- Floating windows are not in the tree; they belong to the workspace, as in i3.

## Behaviour (the spec is Paul's old i3 config, git `d3de958^` in `~/.dotfiles`)

| keys | i3 | notes |
|---|---|---|
| Meta+1…0 | workspace N | i3ws behaviour, unchanged |
| Meta+Shift+1…0 (and the symbols) | move container to workspace N | lands beside the focused window there, as i3 |
| Meta+arrows, Meta+J/K/L/; | focus dir | across monitors, as i3ws |
| Meta+Shift+ same | move dir | i3 `tree_move`; at a monitor edge, crosses to the other monitor's workspace, landing on the side it came from (as i3ws) |
| Meta+H / Meta+V | split h / split v | new |
| Meta+E | layout toggle split | new |
| Meta+Shift+Space | floating toggle | new (scope question 4) |
| Meta+Space | focus mode_toggle | new (scope question 4) |
| resize | Meta+R mode in i3 | scope question 2: a mode, or Meta+Ctrl+arrows |
| Meta+F | fullscreen | stays KWin's own; spike: the window returns to its tile |
| Meta+Shift+Q | kill | stays KWin's own |

Not planned unless Paul asks (scope questions 1, 3): tabbed (Meta+W is the Overview now, and KWin
has no tab bar), stacked, focus parent (KWin cannot focus a container; we would draw the highlight).

**Which windows float** (from what Krohnkite handled for us): dialogs and other transients,
utility/splash/notification types, fixed-size windows (min == max), the stage's Xephyr window
(title `STAGE (streamed)`), and anything toggled by hand. Maximize is not an i3 state: a maximize
request is undone and the window stays tiled (spike: maximize drops a window out of its tile).

## KWin events the adapter handles

`windowAdded`, `windowRemoved`, `windowActivated`, per window `desktopsChanged`,
`outputChanged`, `fullScreenChanged`, `maximizedChanged`, `minimizedChanged`, `tileChanged`
(something else moved it out of its tile), `workspace.screensChanged` and the per-screen current
desktop change. At start (and after a reload) every tree is rebuilt from the windows actually
present; trees KWin saved in kwinrc are not trusted.

## Phases — each ends green, committed, pushed

0. **Scaffold.** Repo layout, `build.sh`, `make test` running unit + live tests. The live harness
   exists (`tools/testkwin.sh`).
1. **Model.** `src/tree.js` with unit tests for insert, split, close, every `tree_move` case,
   toggle split, weights, focus stack. Each test written against i3's source behaviour; each guard
   watched to fail with a deliberate fault before it counts.
2. **Adapter, one monitor.** Projection onto tiles, the events above, floating rules. Live tests:
   open N clients, run key actions over D-Bus (`invokeShortcut`), read geometry back.
3. **Workspaces and monitors.** Merge i3ws: per-monitor workspaces, cross-monitor focus and move,
   login numbering, hotplug. Live tests with both virtual outputs. Whether the virtual backend can
   unplug an output at runtime is an open question; if it can't, hotplug is tested by hand.
4. **Switch-over on Paul's desktop.** Only with Paul, and only after 0–3 are green. kwinrc:
   `i3wsEnabled=false`, `krohnkiteEnabled=false`, `kwin-i3Enabled=true`. Krohnkite is QML, so
   turning it off takes effect at the next logout; the switch is done at a logout. **Fallback** is
   the same three lines reversed and a logout. The two checks only a real session can do happen
   here: dragging a tiled border, and a logout/login.
5. **Dotfiles.** After Paul has used it for a while and says it's good: `setup.sh` clones
   `kwin-i3` and links `package/` into `~/.local/share/kwin/scripts/kwin-i3`; health-check checks
   that link; README's Plasma table is updated; `i3ws` and the Krohnkite copy are retired from the
   dotfiles in one change (CLAUDE.md "retire on both machines" does not apply: the laptop runs i3).
6. **Extras** from Paul's answers to the scope questions.

Never load kwin-i3 into Paul's session while i3ws and Krohnkite are running: three scripts would
place the same windows.

## Risks

- **KWin's tile API is young.** `tilingForScreen` was deprecated in 6.3; per-output desktops are
  new in 6.7. A Fedora update can change it. Mitigation: the live tests run against the installed
  KWin, so `make test` after a `dnf upgrade` says whether it still holds.
- **Projection flicker.** Rebuilding a workspace's tiles on each change may make windows jump or
  resize twice. Start with a diff (change only tiles that differ); measure in the live tests.
- **Things Krohnkite solved that we haven't met yet**: minimum sizes larger than the tile, windows
  that resize themselves, apps that open several windows at once, Steam/Minecraft/X11 quirks.
  Mitigation: run side by side with the old setup as long as needed; collect each one as a live test.
- **Hotplug**, the bug class of 2026-10-21: KWin moves windows when a monitor goes and comes back.
  The model keeps each window's workspace and re-projects when the monitor returns, rather than
  reacting to each window move.
