# Spec: settings (OPEN.md item 2)

Requested by Paul, 2026-10-24 (the heading: configurable and reliable, `docs/plan.md` Scope).
Status: **spec, reviewed (second agent, 2026-10-24: findings folded in, marked *review*), for
Paul's go.** Nothing built.

Every default is today's behaviour, so an install that sets nothing sees no change.

## Paul's decisions (2026-10-24)

- Settings A-F: gaps, resize step, frame width, default orientation, focus wrapping, workspace
  to monitor. All existing `kwinrc` keys get the form too.
- Gaps: **inner and outer**, as i3.
- Applying a change: i3's **reload key, Meta+Shift+C**, plus re-reading on every KWin
  reconfigure, which reaches the plugins too (below). (Upstream report of the KCM gap: later,
  separately.)
- Workspace to monitor: a text field `1=DP-4, 2=DP-6`; unlisted workspaces keep today's rule.

## Facts this rests on (KWin 6.7.5, i3 4.24; probed in the headless KWin where marked)

1. **The form.** `metadata.json` `"X-KDE-ConfigModule": "kwin/effects/configs/kcm_kwin4_genericscripted"`
   (as the stock `videowall` script) with `contents/config/main.xml` (KConfigXT) and
   `contents/ui/config.ui` (`kcfg_<key>` widgets). It reads and writes `kwinrc [Script-kwin-i3]`
   through `KConfigLoader` (`src/kcms/common/genericscriptedconfig.cpp`), **without the notify
   flag**, and **tells KWin nothing on save**: `ScriptingConfig::reload()` is `// TODO: what to call`.
2. **Reconfigure reaches a script** (probed): a running script's `options.configChanged` fires on
   `org.kde.KWin /KWin reconfigure`, and `readConfig` then returns the new value (KWin reparses
   `kwinrc` in `Workspace::slotReconfigure`). A plain write fires nothing. The test KWin's own
   start-up reconfigure fires one signal just after load: the handler must tolerate a no-op call.
3. **Gaps in KWin's tiles.** One padding P per tile, propagated to children
   (`src/tiles/tile.cpp` `setPadding`); `windowGeometry()` takes P/2 off a side that is inside the
   screen and P off a side at the screen's edge, judged by the tile's relative edge being exactly
   0 or 1 (relative to the output's maximize area). So padding alone gives edge = between.
   **The root tile accepts an inset** `relativeGeometry` (probed: 0.05 → 64,36 1152x648 on
   1280x720) and children split from it stay inside it. With the root inset, no leaf edge is 0
   or 1, so every side gets P/2: edge = inset + P/2, between = P (*review*: arithmetic checked).
   **KWin does not save the root's geometry** (`tilemanager.cpp` `tileToJSon` skips the root):
   a KWin start resets it to 0,0,1,1; a script reload finds the old inset (*review*).
4. **i3's gaps** (`src/render.c:54-86`, `src/gaps.c`): the workspace is inset by the outer gaps;
   each leaf by inner/2 towards a neighbour and inner towards the workspace edge. Edge = outer +
   inner, between = inner. (`smart_gaps` and per-workspace gaps: not asked for, out.)
5. **i3's focus wrapping** (`src/tree.c` `get_tree_next`, 4.24): `no` never wraps inside a
   container but still crosses to the next output at the workspace edge; `yes` (default) wraps
   inside the innermost container of that orientation when there is no next output; `force`
   always wraps inside the container, never leaves it (blocked by fullscreen as `next` is);
   `workspace` wraps as `yes` but never leaves the workspace. One nuance (*review*): when the
   focused con is itself a workspace (an empty one), i3 jumps straight to the next output's
   workspace, in every mode; today's `focusDir` starts from a window and has no such branch.
6. **i3's default orientation** (`workspace.c` `_workspace_apply_default_orientation`):
   `auto` = horizontal unless the output is taller than wide; applied when a workspace is
   created, not to existing ones.
7. **i3's workspace assignment** (`workspace.c` `workspace_get`, `create_workspace_on_output`):
   a workspace is created on its assigned output if that output exists, else on the current one;
   a new output shows the lowest-numbered workspace that is free and not assigned elsewhere.
8. **What a KWin reconfigure reaches** (`workspace.cpp` `slotReconfigure`): it reparses
   `kwinrc`, emits `Workspace::configChanged` (scripts get `options.configChanged`), and the
   decoration settings re-read and **always emit `DecorationSettings::reconfigured()`**
   (`decorations/settings.cpp:39,181`), which a decoration can connect to. Effects are **not**
   reconfigured by it (they hear only notify writes, `effecthandler.cpp:134`), but kwini3hold is
   a KWin plugin and can connect to `Workspace::configChanged` itself.

## The settings

All in `kwinrc [Script-kwin-i3]`, the form's group. The plugins read their keys there too, falling
back to their old groups (`[kwin-i3-frame]`, `[kwin-i3-hold]`) when the new key is absent, so an
existing setup keeps working; the README documents the new keys only.

| key | type, default | i3 | where |
|---|---|---|---|
| `gapsInner` | px, 0 | `gaps inner` | script: every tile's padding |
| `gapsOuter` | px, 0 | `gaps outer` | script: the root's inset, outer + inner/2 per side |
| `resizeStep` | %, 10 (1-50) | `resize ... 10 ppt` | script: `model.resize` |
| `defaultOrientation` | auto / horizontal / vertical, auto | `default_orientation` | script: `wsModel` |
| `focusWrapping` | yes / no / force / workspace, yes | `focus_wrapping` | model: `focusDir` |
| `workspaceOutputs` | text, empty: `1=DP-4, 2=DP-6` | `workspace N output X` | script: `Workspaces` |
| `ignoreClass`, `ignoreRole`, `floatingClass`, `floatingTitle` | as today | `for_window ... floating enable` (the managed/floating part only) | script: `Rules` |
| `debugLog` | as today | | script |
| `frameWidth` | px, 1 (1-10) | `default_border pixel N` | kwini3frame |
| `frameActive`, `frameInactive`, `frameFloatingActive`, `frameFloatingInactive` | as today's colours | `client.focused` ... | kwini3frame |
| `holdEnabled`, `holdTimeoutMs` | true, 100 | (Sway's transactions) | kwini3hold |

Not settings, on purpose (Scope): where a new window goes, floating windows above, maximize undone.

## Applying a change

- **Meta+Shift+C** = `kwin-i3 Reload Settings` (i3's `reload`; free in a stock Plasma and on
  Paul's desktop): `callDBus` KWin's `reconfigure`. Logged `ACTION Reload Settings`.
- **The script** re-reads every key on `options.configChanged` and compares with what it holds;
  only a change acts, and none re-tiles a window that did not need it:
  - gaps: every root's inset and every tile's padding, then a reconcile of the visible
    workspaces (hidden ones when shown, as now);
  - resize step, focus wrapping: take effect at the next key;
  - default orientation: new workspaces only (i3: existing ones keep theirs);
  - workspace outputs: new homes; a workspace already shown stays where it is until the next
    login or replug (i3 applies assignments at creation; moving live workspaces on a reload is
    surprising);
  - rules: as today's caption/class change path, re-judged for every managed window (the rules
    act only when their verdict changes, 2026-10-24).
- **The plugins** re-read on KWin's reconfigure too (fact 8), so Meta+Shift+C reaches all
  three: kwini3frame on `DecorationSettings::reconfigured` (one shared settings object for every
  window's decoration, not one reader per window), kwini3hold on `Workspace::configChanged`,
  each reparsing `kwinrc` and comparing. The `KConfigWatcher` stays for `--notify` writes. No
  file watcher (*review*: a watcher on `~/.config` fires for every file there and needs a
  debounce; this needs neither). A plain write followed by `reconfigure` then works for the
  plugins, which retires the README's "`--notify` and nothing else" rule. Whether it also
  explains `53-hold`'s flake is not known (OPEN.md item 5).
- **A frame width change** changes every window's decoration and so its frame minimum
  (`frameMin`): the script's reload runs after the decoration's (both on the same reconfigure,
  order not guaranteed), so it re-judges minimums on the next `frameGeometryChanged` as well as
  in its own reload (*review*).
- `rules.js` and `log.js` read their keys once at load today: both become functions of the
  current settings (*review*).
- The form says, at its top: "Press Meta+Shift+C, or log out and in, to apply."

## Gaps, in detail

- Root inset per side: `outer + inner/2` px, as relative geometry of the output's **maximize
  area** (KWin's basis for `absoluteGeometry`; a panel shrinks it). With inner = outer = 0 the
  root is 0,0,1,1 exactly as today. Odd inner values give half-pixel insets; rounding is to
  whole pixels, within `fits`' 1 px tolerance (tested).
- `setSizesStable` starts from the root's inset rect, not `{0,0,1,1}`, and `setSizes` snaps
  with the maximize area's pixels, not `screen.geometry` (*review*: otherwise every child is
  pushed back to the full screen).
- Every tile, root to leaf: `padding = inner`. `prepareTiles` sets it instead of 0. Order at a
  reconcile with changed gaps: inset, padding, then the minimums (*review*: else the invariant
  fires on the first reconcile after a reload with new gaps).
- Pixel minimums (*review*): `minOf` adds inner per leaf; `fitMinimums` and
  `floatWhatCannotFit` work within the area minus 2 x (outer + inner/2) per axis.
- Geometry: `fits`, `fitToTile` and `refitOnFrameChange` use `tile.windowGeometry` instead of
  `absoluteGeometry` (equal when inner = 0; `fitToTile` writing the larger rect would fight KWin).
  `readBack` after a drag is unaffected (shares from tile geometry, relative to the parent).
- The invariant: "no root has padding" becomes "every tile's padding is gapsInner and every root
  has the gaps' inset".
- Release (Meta+Ctrl+Shift+Q) puts **every** root back to 0,0,1,1 and padding 0, reconciled or
  not; the padding captured at the first reconcile (`rootPadding`) is no longer restored, as
  after a reload it would be our own gap value (*review*).
- Fullscreen windows are out of the tiles and fill the output as now; the refit's
  "frame fills the monitor" guard compares with the output, not the tile (unchanged).

## Focus wrapping, in detail

Ported from i3's `get_tree_next` (fact 5) into `M.focusDir(dir, wrapping)`; the four modes differ
only in the `switch` at the wrap point and in the `workspace` mode's early return. `force`
returns nothing when the next container exists but fullscreen blocks it. The empty-workspace
branch (fact 5's nuance) is ported too, as far as kwin-i3 can focus an empty workspace (Meta+N
onto it, then Meta+arrow). Floating focus
(left/right through the floating windows, wrapping) is the same in every mode, as in i3.

## Workspace outputs, in detail

`1=DP-4, 2=DP-6`: workspace number, `=`, KWin's output name (shown in the form's tooltip: System
Settings > Display names them; `kscreen-doctor -o` lists them). An entry with an unknown
workspace number or a malformed pair is logged and ignored.
- At login (`numberScreens`): each assigned workspace's home is its output (present or not: a
  home is kept by name, so an absent monitor's workspaces go there when it appears, as now);
  each screen then shows the lowest-numbered workspace homed on it, else the lowest that is free
  and not assigned elsewhere (fact 7).
- A workspace first used (a window sent there, Meta+N) with an assignment goes to its home if
  present, else stays on the current screen meanwhile (today's policy for a gone home).

## The form

Plain Qt widgets, so QUiLoader needs no designer plugins: `QSpinBox` for pixels and %, `QComboBox`
for the choices (KConfigXT `Enum`), `QLineEdit` for lists, the outputs and the colours (`#4c7899`;
a colour button needs KWidgetsAddons' designer plugin, which may be absent). Groups: Gaps;
Layout (orientation, resize step); Focus (wrapping); Workspaces (outputs); Window rules; and,
marked "needs the plugins", Frame (width, colours) and Atomic layout (on, timeout).
- The choices are KConfigXT `String` entries, not `Enum`, with the combo box bound by its text
  (`kcfg_property` = `currentText`), so the file holds `horizontal`, `force`, ... and no
  question of index versus name arises (*review*). Verified when the form is built.

## Tests (each watched red against a deliberate fault)

- **Unit** (`tests/unit/`): focus wrapping, all four modes, on i3's cases (a container at a
  workspace edge with and without a next output, nested containers, fullscreen, floating);
  resize step; default orientation at creation; the outputs parser.
- **Live** (`tests/live/`):
  - gaps by pixels (`tools/shot.py`): inner between two windows, outer + inner at each edge, a
    nested split, an odd inner; a window's minimum with gaps (one that nearly fits floats or
    not, as the arithmetic says); a border drag with gaps (read back); fullscreen with gaps
    (fills the output); a panel's strut (the inset follows the maximize area); unplug and
    replug with gaps; a gaps change while a hidden workspace holds windows (right when shown);
    a reload with gaps set (inset found, release still restores 0,0,1,1 and no padding);
  - Meta+Shift+C after a plain write (as the form) changes the gaps with no window re-tiled
    (no `UNTILE` in the log), and a changed resize step acts at the next key;
  - workspace outputs on the test KWin's two virtual monitors: at a fresh start, after an
    unplug and replug;
  - the plugins: a plain write (no `--notify`) of `frameWidth` and of `holdEnabled`, then
    Meta+Shift+C, takes effect; a frame width change re-judges the minimums;
  - the form: `main.xml` and `config.ui` load in the generic KCM, and a value set in it lands
    in `kwinrc` as the script reads it (the KCM run headless if it can be; else by hand once,
    with Paul, and a parse check of both files against each other's keys in `make test`).
- **Fuzz**: one configuration with gaps set (OPEN.md item 5).

## Docs

README's Configuration table regenerated from `main.xml`; the Keys table gains Meta+Shift+C;
dotfiles' `hotkeys` too; `docs/plan.md` Behaviour gains the reload key (it listed i3's reload as
left out, 2026-10-21: superseded).
