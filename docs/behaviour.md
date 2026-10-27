# What kwin-i3 does: the behaviour as built

**The one description of what kwin-i3 does today**, exactly, read from the code (2026-10-27). A
spec records a decision and why; this page says what the code does now. Where they disagree,
this page is checked against the code and the spec is the one that's stale. A change to
behaviour updates this page in the same commit (`docs/testing.md` P1).

Long and exact on purpose during the Stage (Paul, 2026-10-27); the user's documentation will be
written from it later. Code is cited by file and function (`src/kwin.js` `applyFocus`), not by
line, so the citations survive edits. The words are `docs/spec-window-words.md`'s: a window is
**tiled**, **floating**, or **places itself**. In the code the last is the rules' verdict
`"ignore"` and the settings `ignoreClass`/`ignoreRole`; those names are internal.

Contents: 1 the pieces · 2 the tree · 3 window kinds · 4 workspaces and monitors · 5 focus ·
6 from the tree to the screen · 7 the frame and the look · 8 keys · 9 the mouse · 10 edge cases ·
11 settings · 12 start, reload, release · 13 reports · 14 the KWin seam

---

## 1. The pieces

| piece | what it is | built from | installed by |
|---|---|---|---|
| the script | a KWin script, the whole window manager | `src/*.js`, concatenated by `build.sh` into `package/contents/code/main.js` | linking `package/` (README, "Install") |
| `kwini3hold` | a KWin effect (`CrossFadeEffect`, internal, on by default; needs OpenGL compositing) | `plugin/hold.cpp`, `holdmain.cpp`, `hold.json` | `make plugin-install` |
| `kwini3helper` | a KWin plugin holding five jobs | `plugin/main.cpp`, `helper.cpp`, `framefocus.cpp`, `tilingdrag.cpp`, `settingswatch.cpp`, `layoutkeys.cpp`, `popupgrace.cpp`, `metadata.json` | `make plugin-install` |
| the settings page | a System Settings module (`kcm_kwin_i3`, Wayland only, under Window Management) | `kcm/` | `make kcm-install` |
| the Configure form | KWin's generic script form (the cog in KWin Scripts) | `package/contents/ui/config.ui`, `config/main.xml` | with the script |
| the workspace widget | a Plasma applet, an alternative to the pager | `widget/` | `make widget-install` |

**The script alone is the product**; the plugins finish it (`docs/philosophy.md`, "Defaults").
What each plugin piece adds, and what happens without it:

| plugin piece | adds | without it |
|---|---|---|
| hold: atomic layout | moved windows switch to their new places in one frame; a closing tiled window stays drawn until its neighbours have resized; a new tiled window is hidden until placed | windows move one by one; the wallpaper can show for a frame |
| hold: the frame | the 1 px ring outside tiled (and optionally floating) windows, rounded corners, the drop indicator, the drag cursor; keeps the floating set across a script reload | tiled windows keep their title bars whatever `tiledLook` says; no drop indicator |
| helper: frame focus | the ring counts as its window for hover focus, clicks and scroll | hovering the ring focuses nothing; a click there goes to the desktop beneath |
| helper: tiling drag | i3's tiling drag (title bar or Meta+drag) and Meta+right-drag resize | Meta+drag is KWin's own move, which floats the window where it's dropped; no tiling resize |
| helper: settings watch | the Configure form's Apply applies at once | press Meta+Shift+C after Apply (the settings page applies by itself either way) |
| helper: layout keys | the position keys (digits, `;`) follow a non-US keyboard layout | the keys are US symbols; a notification at load says so |
| helper: popup grace | a panel popup survives the pointer crossing the gap to it | with focus follows mouse, the popup closes when the pointer crosses the gap |

`kwini3hold` and `kwini3helper` are built against the installed KWin and refused by any other
version. `tools/plugin-install.sh` gives each build a new file name (`kwini3hold-<hash>.so`),
because KWin never unloads a library and overwriting a mapped one can crash it, then unloads the
old id and loads the new one over D-Bus. It writes `QT_PLUGIN_PATH` into a systemd drop-in for
`plasma-kwin_wayland.service`, effective from the next login.

### How they talk

All plugin interfaces are on KWin's own bus name, `org.kde.KWin`:

| object | interface | methods | caller |
|---|---|---|---|
| `/kwini3hold` | `net.local.kwini3hold` | `Stats`, `Events`, `SetFloating(id, on)`, `SetTiledRing(on)`, `SetDropIndicator(x, y, w, h)`, `SetDragCursor(on, shape)` | the script (`Events`: `tools/capture`) |
| `/kwini3drag` | `net.local.kwini3drag` | `State`, `SetOn(on)`, `SetResizeGap(px)`, `Warp(x, y)` | the script |
| `/kwini3helper` | `net.local.kwini3helper` | `FitKeys`, `Plan` | the script (`Plan`: tests) |

The helper calls back into the script through kglobalaccel: it invokes the hidden shortcuts
`kwin-i3 Tiling Drag` and `kwin-i3 Tiling Resize` (registered with no key), and the script then
polls `State()`. Only `Stats` and `State` are asked for a reply. Settings reach the plugins
directly from kwinrc `[Script-kwin-i3]`, each with its own watcher, except the tiled ring, which
the script tells the effect (`SetTiledRing`).

The script logs to `net.local.kwini3.log` only when `debugLog` is on, and keeps the last 2000
lines in memory either way for `Dump State` (`src/log.js`; `docs/debugging.md`).

---

## 2. The tree

`src/tree.js` is a pure model (no KWin calls), ported from i3 at be04c853ee (2026-10-12); each
function names the i3 function it ports.

### The model

- **Nodes.** A workspace (`ws`: number, layout `h` or `v`, tiling children, floating children,
  focus stack). A split (`con` with no window: layout, children, focus stack, share). A leaf
  (`con` with a window). A floating node (one node per window, not i3's wrapper container).
- **Focus stacks**, most recent first, in every container. Only a workspace's stack holds
  floating nodes.
- **Shares** (`percent`) of siblings sum to 1 (`fixPercent`, on attach, detach, close and move):
  a child with no share gets the average of the others', then all are divided by the total.
- **The model's own state**: the global focus, the previous workspace (for back-and-forth), and
  the workspace focus was last on.
- **Departures from i3, by design**: workspaces are KWin desktops and are never closed when empty;
  outputs are not modelled (the adapter supplies the neighbouring output); fullscreen is a flag on
  a leaf (i3's output fullscreen only); no tabbed or stacked layout, no marks, no urgency, no
  scratchpad (`docs/plan.md`, "Scope").

### Tidying

- **A split left empty closes**, and so on upward (`onRemoveChild`).
- **`flatten`** is i3's `tree_flatten`: a split whose only child is a split of the other
  direction, inside a parent of that same direction, is dissolved into the parent.
- **`tidy`**, not i3 (`docs/spec-nested-boxes.md`): a split whose only child is a split is
  replaced by that child, repeatedly. A one-child split holding a window stays. Run after a move
  (through `flatten`), a close, floating a window, sending one to a workspace, a drop and the
  adoption at load; not after tiling a floating window.

### Operations

- **Open** (`open`, i3's `tree_open_con`). The new leaf goes after the focused container of its
  workspace, in that container's parent; if focus is on a floating window, after the focused
  tiled container; on an empty workspace, at the top level. It takes the average share. It goes
  to the bottom of its parent's focus stack; KWin's activation then focuses it (§5). Under a
  fullscreen window the newcomer goes second in the focus stack, so it gets focus when the
  fullscreen window closes.
- **Close** (`close`, i3's `tree_close_internal`). If the window had focus, the next focus is i3's
  `con_next_focused`: the previous focus in the same container, descending. Whether that or
  KWin's choice wins is §5's.
- **Split** (`split`, i3's `tree_split`; Meta+H, Meta+V). On a workspace with fewer than two
  children it sets the workspace's direction. Otherwise, if the window's parent has one child, the
  parent's direction is set; else the window is wrapped in a new split of that direction (even
  when the parent already has it, as in i3).
- **Toggle split** (`toggleSplit`, i3's `layout toggle split`; Meta+E). The parent's direction
  flips. On the window's own parent if that isn't the workspace; with i3's #3001 rule (a parent
  and grandparent each holding one child are collapsed first). At a workspace's top level the
  workspace's children are wrapped in a new split of the other direction, then flattened.
- **Move** (`move`, i3's `tree_move`; Meta+Shift+direction). Swaps with a window beside it in the
  same split; enters a split beside it (at the edge facing the move); climbs out of its split to
  the nearest ancestor of that direction, creating one at the top if there is none; at the edge of
  the workspace, moves to the workspace shown on the neighbouring monitor (`moveToOutputDirected`).
  A fullscreen window, or a workspace's only child, moves straight to the neighbouring monitor. A
  move that would cross a fullscreen window is refused.
- **Resize by key** (`resize`, i3's `cmd_resize_tiling_width_height`). The nearest ancestor-or-self
  in a split of the matching direction with more than one child grows (or shrinks) by
  `resizeStep` percent of the split; its siblings give up (or gain) the same amount in equal
  parts. Refused if any would go below a 0.1 % share. Grow Width is Meta+Ctrl+Right, so the
  window's right or bottom edge moves, as in i3 (`docs/philosophy.md`).
- **Swap** (`swap`, i3's `con_swap`): two tiled windows exchange places, shares and fullscreen
  flags; used by the tiling drag's centre drop.
- **Float** (`floatingEnable`, i3's `floating_enable`): the leaf becomes a floating node at the top
  of the workspace's floating list, taking its branch's place in the focus stack. A fullscreen
  window stays fullscreen, both ways, as in i3; a floating window's flag follows KWin's but only a
  tiled one's blocks focus. **Tile** (`floatingDisable`): the window goes after the
  workspace's focused tiled container, or to the top level of an empty workspace.
- **Focus a direction** (`focusDir`, i3's `tree_next` with `focus_wrapping`; Meta+arrow or J K L ;).
  From a floating window: left and right cycle the workspace's floating windows, wrapping; up and
  down do nothing. From a tiled window: the sibling in that direction in the nearest split of the
  matching direction; at the workspace's edge, the workspace shown on the neighbouring monitor;
  failing that, wrapping, by `focusWrapping`:
  - `yes` (default): the next monitor first, else wrap inside the outermost container;
  - `no`: the next monitor, never wrap;
  - `force`: wrap inside the container, never leave it;
  - `workspace`: wrap, never leave the workspace.
  Landing on a container descends its focus stack. A fullscreen window lets focus go only to the
  next monitor.
- **Focus mode toggle** (`focusModeToggle`; Meta+Space): between the workspace's most recent
  floating window and its most recent tiled one.
- **Move to a workspace** (`moveToWorkspace`, i3's `con_move_to_workspace`): the window goes after
  the target workspace's focused container; focus stays on the source workspace, on what i3 would
  focus next there. A fullscreen window arriving where another is fullscreen clears the other's
  flag.

---

## 3. Window kinds

### How a window gets its kind

`src/rules.js` `classify` runs on every judgement (settings are read each time), in this order:

1. **Places itself** if KWin says it isn't a normal window, is a popup or a special window
   (panels, the desktop, OSDs).
2. **Places itself** if it is on all desktops or skips the taskbar.
3. **Places itself** if its class or name is in `ignoreClass`, or its role in `ignoreRole`.
4. **Floating** if it is transient, modal, or has a fixed size (not resizable; for a fullscreen
   window, KWin's own test: fixed unless its minimum and maximum differ).
5. **Floating** if it is a dialog, a splash or a utility window.
6. **Floating** if its title is exactly `kwin-i3 capture note` (`tools/capture`'s window).
7. **Floating** if its class or name is in `floatingClass`, or its title contains a
   `floatingTitle` entry.
8. Otherwise **tiled**.

There is no check for activities: a window on another activity is judged like any other.

Then `src/kwin.js` `adoptWindow`:

- A window that **places itself** is not entered into the model. Its signals are still connected,
  so a later change of class, title or transience can adopt it.
- A window that isn't on exactly one desktop is not adopted until it is.
- **After a reload**, a window the rules call tiled but that isn't in a tile and is kept above (or
  is in the effect's floating set) comes back floating: it was floating before the reload.
- **A new window on a workspace set to Floating** (`floatingWorkspaces`) opens floating.
- An adopted window that is maximized is unmaximized.

### Changing kind

- **Meta+Shift+Space** toggles tiled and floating (`Floating Toggle`). A window floated this way
  comes back at its untiled size (below).
- **A changed verdict follows.** On a change of title, class, transience or readiness to paint
  (`reclassify`), the rules run again. If the verdict is unchanged, nothing happens: a window the
  user floated or tiled by hand stays. If it changed, the window follows it. A window that now
  places itself is dropped from the model.
- **A changed rule setting** reclassifies every window the same way (§11).
- **Made sticky** (on all desktops): dropped from the model, as a window that places itself.
- **Meta+Shift+drag** pulls a tiled window out of its tile; it floats where it is dropped (§9).
- **KWin refusing to tile it** (not resizable, or not on the tile's desktop) floats it, except a
  fullscreen window, which stays in the tree out of the tiles until fullscreen ends.
- **Too big to fit**: if the tiled windows' minimum sizes don't fit the screen, the one with the
  largest minimum along the overflowing axis floats, repeatedly (`floatWhatCannotFit`).

### A floating window's size

- **The untiled record** (`recordUntiled`): when kwin-i3 first sees a window untiled, it records
  its frame and its monitor's geometry.
- **Floating a tiled window** (`floatAtRecord`) gives it the recorded size, clamped to the screen
  area. On a different monitor its centre is mapped by fraction onto the new one (i3's
  `floating_fix_coordinates`); a rect that doesn't fit is centred. On a hidden workspace, KWin's
  own restore applies instead.
- **An app that last closed tiled** opens at its tiled size and floats at that size, as in i3
  (`docs/spec-float-size.md`).

### What each kind gets

| | tiled | floating | places itself |
|---|---|---|---|
| placed by | the tree | the user | the app or Plasma |
| on a workspace | yes | yes | yes, KWin's |
| moved between monitors by kwin-i3 | with its workspace | with its workspace | no |
| look | per `tiledLook` (§7) | its own decoration; the frame instead if `frameOnFloating` | untouched |
| kept above tiled windows | — | yes, except on a Floating workspace while the effect marks floating windows | untouched |
| takes keyboard focus from kwin-i3 | — | — | yes, until a key moves focus (§5) |

---

## 4. Workspaces and monitors

`src/workspaces.js`, with the actions in `src/kwin.js`.

- **Workspace N is virtual desktop N**, 1 to 10 (Meta+1 … Meta+0). Desktops are created on demand
  up to the one asked for (`ensure`) and never removed (`docs/spec-desktops-on-demand.md`).
- **Per-monitor workspaces** need KWin's per-output desktops (`perOutputVirtualDesktops`); kwin-i3
  reports when it is off with two or more monitors, and never sets it (§13).
- **A workspace's home** is the monitor it lives on, kept by name. It is the home monitor if
  connected, else the monitor showing it, else the first. A home whose monitor is gone is kept for
  its return.
- **Assignment** (`workspaceOutputs`, i3's `workspace N output X`): an assigned workspace's home is
  its monitor, even while that monitor is away; when the monitor appears, its assigned workspaces
  go home.
- **At login** (no normal windows open): the assigned workspaces get their homes, then each monitor
  in KWin's order (primary first) shows the lowest unassigned free workspace (i3's
  `create_workspace_on_output`). A reload doesn't renumber.
- **New workspace direction** (`defaultOrientation`): set when a workspace is first made; `auto` is
  side by side unless its monitor is taller than wide.

### Actions

- **Show workspace N** (Meta+N, `gotoWorkspace`). An occupied workspace shows on its home monitor,
  even one that is away; an empty one shows on its assigned monitor, else the active one, and
  makes that its home. Focus goes to its fullscreen window, else its last focus. With
  `workspaceAutoBackAndForth`, pressing the shown workspace's key goes to the previous workspace.
- **Move to workspace N** (Meta+Shift+N): the window goes to N on N's monitor; focus stays behind.
  An empty hidden N takes the window's current monitor as its home. Auto back-and-forth applies.
- **Unbound by default, as in i3** (`docs/spec-workspace-commands.md`): back-and-forth and move to
  back-and-forth (the previous workspace, if it still exists); next and previous, overall or on
  this monitor, and moving a window there (over workspaces with windows or shown, wrapping); focus
  the monitor in a direction; move a window to the monitor in a direction (to its shown
  workspace, focus stays); move the workspace to the monitor in a direction (the source monitor
  then shows its last shown workspace that is free, else its lowest occupied one, else an unused
  one, else the move is refused).
- **The neighbouring monitor** in a direction is the nearest by edge distance (i3's
  `get_output_next`, closest); a diagonal monitor can qualify.

### Desktops and monitors changing

- **A desktop switched outside kwin-i3** (Overview, the pager, an app) on the monitor that has
  kwin-i3's focus: focus follows to that workspace (`shownOutside`).
- **Desktops removed or reordered** (`desktopListChanged`): appending changes nothing; anything else
  rebuilds the model from KWin's tiles and windows, as at load (`docs/spec-desktop-changes.md`).
  While it rebuilds, nothing is placed.
- **A monitor lost**: its workspaces keep their homes. **All back**: each monitor shows what it
  showed before the loss, unless that workspace now lives elsewhere (then an unused one). After any
  monitor change every window is re-fitted to its tile as its geometry settles (`armRefit`).
- **Per-output desktops turned on**: each monitor showing another's workspace switches to one of
  its own (`showHomes`).

---

## 5. Focus

The model owns focus; KWin shows it. `docs/plan.md`, "Focus", is the reasoning; this is the
behaviour.

### In from KWin

- **`windowActivated`**: KWin activated one of kwin-i3's windows (a click, focus follows mouse, a
  new window): the model focuses it. **Refused** when the window's workspace isn't the one shown
  on its monitor (a stale activation): focus is put back.
- **Before every key action** the model re-syncs from KWin's active window, without the stale
  check: a key inside the millisecond after a monitor unplug would take a stale activation (known,
  accepted, 2026-10-26).

### Out to KWin

`applyFocus` runs once after each pass of placing (so a pointer warp lands on settled windows):

1. **A passive pass** (no key caused it) leaves the focus with a window that places itself
   (KRunner, a panel popup, a dialog of Plasma's), unless that is the desktop or a panel.
2. **The desktop or a panel focused**, passively: kwin-i3 asks KWin whether Show Desktop is on;
   if it is, nothing happens; if not, focus goes back to the model's window on the next pass.
3. The model's workspace is shown on its monitor if it isn't.
4. **An empty workspace focused**: its monitor becomes the active screen, and no window is active.
5. **A window focused**: it is activated. If activating it switched another monitor's desktop,
   that switch is undone.

### Key actions

- **Every key** runs, then the focus is applied, unless the key left the model's focus unchanged
  while a window that places itself has the keyboard (Yakuake, KRunner): then it keeps it. A key
  that moves focus takes it from such a window.
- **Meta+F and Meta+Shift+Q** are KWin's own actions on KWin's active window, whatever its kind;
  they don't go through the focus pass, so the window that is acted on is the one you see focused
  (`docs/spec-own-keys.md`).
- **The pointer moves only when a key moved focus to another monitor**: to the focused window, or
  the centre of an empty workspace's monitor. Passive passes never move it. Focus follows mouse is
  KWin's own setting.

### Closing

- **A tiled window in a split with others**: i3's choice, the previous focus in that split,
  recorded as the window closes, before KWin activates its own choice.
- **At a workspace's top level, and a floating window**: KWin's choice stands. With
  `NextFocusPrefersMouse` that is the window under the pointer; without, KWin's most recently used
  (`LATER.md` item 30).

### A fullscreen window

Keeps its workspace's focus: a new window opening on its workspace is given focus by KWin, and
kwin-i3 hands it straight back to the fullscreen window, unless the newcomer is transient (its own
dialog, i3's `popup_during_fullscreen smart`) or opens fullscreen itself (then it takes over).
Switching to its workspace focuses it.

---

## 6. From the tree to the screen

### The pass

Every change marks its workspace dirty; a 0 ms timer coalesces them into one pass (`flush`). Each
workspace is placed in its own try (one failure doesn't stop the others), then the focus is
applied. A failure logs `ERROR` and retries the whole pass after 250 ms, at most 3 times in a row,
then waits for the next real event.

### Projection onto KWin's tiles

kwin-i3 places tiled windows with KWin's own custom tiles (`docs/spike-kwin-tiles.md`); KWin's
tiles are the display, the model is the truth. `project` turns the model into a shape KWin's tiles
can hold:

- minimized windows, and fullscreen windows KWin has taken out of their tile, are left out; their
  share goes to their siblings;
- one-child splits collapse; a split inside one of the same direction merges into it, shares
  multiplied through.

`reconcileNow` then, per workspace: moves windows that are on the wrong desktop or monitor
(below), refreshes the floating windows' look, floats what can't fit, and compares the projection
with the root tile's shape. **The same shape** is only resized; **a different shape, or a root not
inset for the gaps, or an outer edge KWin has pinned to the screen border** rebuilds the tiles
from scratch. Each window is put in its tile; sizes are set in up to four passes until they
settle (setting one tile moves its neighbours' edges); a window whose frame isn't its tile's rect
is written to it. Then it logs the tree (`TREE`) and checks its invariants (logged, never thrown).

### Gaps

- The **inner gap** (`gapsInner`) counts as the even number at or below it (an odd padding put
  windows half a pixel off). The **frame** adds twice its width to it, when the tiled ring is on.
- Every tile has that padding; the root is inset by `gapsOuter` plus half the inner gap. So
  between windows: the inner gap; at the screen's edge: the outer gap plus half the inner gap.
- With an inset of 0 and the ring on, the root is inset by a hair, as KWin gives a full padding
  at an edge it judges exactly 0 or 1.
- Edges are rounded to whole pixels (thirds of 2560 left a 1 px hole).

### Minimum sizes

A leaf tile's minimum is its window's minimum size plus its decoration plus the inner gap; splits
have none (KWin's default 15 % minimum would block i3's sizes). The display bends to fit minimums
(the model keeps i3's shares); if they can't fit at all, the largest floats (§3).

### Moving between desktops and monitors

`relocate`: a window whose workspace is on another monitor is made sticky for the move, sent to
that monitor, then given its workspace's desktop on arrival (or after 2 s), so a client hidden
mid-move still answers the resize. A window on the right monitor but the wrong desktop is given
its desktop. A window being dragged, or whose modal dialog is, waits for the drag's end.

### Keeping windows in their tiles

- **A resize drag on a tile's edge** reads the new sizes back into the model's shares when it
  ends (`readBack`).
- **A tiled window that resizes itself** (Firefox's session restore) is put back in its tile, as
  i3 refuses a tiled window's own resize; at most once a second per window, and a frame filling
  the monitor waits 150 ms in case it is going fullscreen (`docs/spec-self-resize.md`).
- **After a monitor change or a resize drag**, a window whose geometry lands on its old place is
  fitted again (KWin's placement tracker and slow clients answer late).
- **A GTK 4 window short of its tile** after its border was taken is asked for 0 × 0, then its tile,
  so KWin resends its bounds.

---

## 7. The frame and the look

### Tiled windows

`tiledLook`, with the effect loaded:

- `frame` (default): no title bar; the effect draws a ring `frameWidth` px outside the window, in
  `frameActive` for the focused window and `frameInactive` for others, and the tiles leave room
  for it;
- `titlebars`: the window's own decoration;
- `bare`: no title bar and no ring (nothing marks the focused window; the page suggests Dim
  Inactive).

**Without the effect**, every tiled window keeps its title bar. **Rounded corners**
(`roundedCorners`, default on): the effect gives tiled framed windows Breeze's 5 px radius, in
`frame` and `bare`; it resets only radii it set itself.

kwin-i3 takes a tiled window's border by setting `noBorder`, and gives it back when the window
floats, places itself, closes or kwin-i3 releases. It doesn't take the border of a window whose
decoration is its own (client-side), and records a window already without a border so it can be
given back. It reasserts this every pass (the window menu, `borderlessMaximizedWindows`).

### Floating windows

- Keep their own decoration. With `frameOnFloating`, their border is taken and the effect draws
  the ring in `frameFloatingActive` / `frameFloatingInactive`.
- Are **kept above** tiled windows (kwin-i3 owns their Keep Above flag, including one left by a
  previous instance; `docs/spec-reload-keepabove.md`), except on a Floating workspace while the
  effect marks floating windows. Keep Below is overwritten (`LATER.md` item 27).
- The effect knows which windows are floating (`SetFloating`); the set survives a script reload.

### The hold (atomic layout)

`kwini3hold`, `docs/spec-atomic-layout.md`. When a tiled window on a shown workspace is about to
move or resize, the effect snapshots it and draws the snapshot at the old place. Every other
window moving within 3 ms joins. When every held window's frame equals what it was asked for, all
switch at once in one frame; after `holdTimeoutMs` (default 100) they switch regardless. A held
window that is no longer shown counts as settled.

- **A tiled window closing** stays drawn: inside an open hold it joins it; otherwise it waits 20 ms
  for a neighbour to start moving, then goes.
- **A new normal window** (not a dialog, modal or transient) is hidden for up to 20 ms; if a tile
  places it, it joins the hold and appears at its place.
- Direct scan-out is blocked while holding.
- `holdEnabled` off stops only the hold and the hiding; the ring, corners and drop indicator stay.

---

## 8. Keys

All keys are kglobalaccel shortcuts on component `kwin`, named `kwin-i3 <Action>`; the second key
of a pair has the key in its name (`kwin-i3 Focus Left (J)`). The defaults are i3's, from Paul's
i3 config (`docs/plan.md`, "Behaviour"); a rebinding is kept by kglobalaccel.

| action | default | |
|---|---|---|
| Focus Left / Down / Up / Right | Meta+Left Down Up Right, Meta+J K L ; | §2 `focusDir` |
| Move Left / Down / Up / Right | Meta+Shift+arrow, Meta+Shift+J K L, Meta+: | tiled: §2 `move`; floating: by `floatingStep` px |
| Shrink Width / Grow Height / Shrink Height / Grow Width | Meta+Ctrl+Left Down Up Right, Meta+Ctrl+J K L ; | tiled: by `resizeStep` %; floating: by `floatingStep` px |
| Split H / Split V | Meta+H / Meta+V | |
| Toggle Split | Meta+E | |
| Floating Toggle | Meta+Shift+Space | |
| Focus Mode Toggle | Meta+Space | |
| Fullscreen | Meta+F | KWin's Window Fullscreen |
| Close | Meta+Shift+Q | KWin's Window Close |
| Workspace 1 … 10 | Meta+1 … Meta+0 | |
| Move to Workspace 1 … 10 | Meta+! @ # $ % ^ & * ( ) | the US Shift+digit symbols |
| Reload Settings | Meta+Shift+C | KWin's reconfigure |
| Release | Meta+Ctrl+Shift+Q | the safety valve (§12) |
| Dump State | none | `tools/capture` (Meta+Shift+B, from the dotfiles) |
| back-and-forth, next/prev, output moves (§4) | none | as in i3 |

- **Move Right's second key is Meta+:** because Shift+; arrives as `:`; Meta+Shift+; never fires.
- **Floating windows by key**: a move is refused only if the window would leave every screen;
  crossing to another monitor joins the workspace shown there. A resize grows or shrinks to the
  right and down; a window that isn't resizable doesn't. A floating window that is fullscreen or
  maximized ignores these keys.
- **Retired actions** are unregistered at every load.
- **Debug actions** (`Selftest …`) are registered only when `debugLog` is on at load.

### Keyboard layouts

KWin matches a shortcut by the typed symbol, not the key's position. With the helper, the 23
position keys (Workspace 1-10, Move to Workspace 1-10, Focus Right (;), Grow Width (;), Move
Right (:)) are refitted to the current layout at load, on every layout change and on the
script's `FitKeys`. A key is changed only if it still holds the US default or what the helper set
last (recorded in `~/.config/kwini3helperrc`, `[LayoutKeys]`); a key the user bound is theirs. A
key with no symbol on the layout is emptied (`docs/spec-keyboard-layouts.md`).

### Taken keys

At load (with `warnTakenKeys`), kwin-i3 asks kglobalaccel which of its keys another active
component holds, and reports them (§13). `make take-keys` frees them, recording the holders in
`~/.local/state/kwin-i3/taken-keys.json`; `make restore-keys` gives them back. The settings page's
Keys page takes a key the same way on Apply, recording it in the same file
(`docs/spec-taken-keys.md`).

---

## 9. The mouse

With the helper's tiling drag (`plugin/tilingdrag.cpp`, the script's `startDrag`); none of this
applies to floating windows, which KWin moves and resizes as usual.

### Tiling drag (i3's `tiling_drag`)

- **Starts** with a left press on a tiled window: **Meta** anywhere in it, at once; or **no
  modifier on its title bar**, after the drag distance (a title bar button still gets its click).
  Not started if there is nowhere to drop (one window and no other shown workspace).
- **Meta+Shift+left** is not a tiling drag: KWin's own move pulls the window out of its tile and
  it floats where dropped (beyond i3, Paul 2026-10-26).
- **While dragging**, the effect draws the drop indicator in `frameActive` at half opacity and
  shows the move cursor; the pointer reaches no window. Escape, or another button, cancels.
- **Targets** are the tiled windows of every shown workspace, on any monitor, not under another's
  fullscreen; over a gap, the shown workspace there.
- **Where it lands** (`dropPlan`, i3's `drag_callback`): within the target's edge zone (30 % of its
  smaller side) it goes beside the target on that side; within the inner strip (the title bar
  height plus 5 px) on a side its parent shares, beside the parent; otherwise the **centre**,
  which **swaps** the two windows, Shift or not (Paul, 2026-10-26: "I love swap"). Onto an empty
  workspace it moves there. The dropped window has focus.

### Tiling resize (Meta+right-drag)

- **Starts** with Meta+right on a tiled window, or in the gap within half the inner gap plus 1 px
  of one. The nearest of the window's edges that has a neighbour is the one resized; a tie
  resizes nothing.
- The pointer jumps onto the boundary; the cursor shows its direction; a 2 px bar follows the
  pointer, kept within both windows' minimum sizes. Nothing moves until release.
- **Refused** while any window on the workspace is fullscreen.
- **On release** the two neighbours' shares change by the distance (i3's `resize_neighboring_cons`);
  if the layout changed meanwhile, nothing happens (`docs/spec-tiling-resize.md`).

### Without the helper

A Meta+drag is KWin's own move: the window leaves its tile and floats where dropped. A resize drag
on a tiled window's edge (KWin's, with title bars on) is read back into the shares (§6).

### Frame focus

The ring is part of its window: with focus follows mouse, hovering it focuses the window (KWin's
delay applies); a click activates and raises it as KWin's window-click commands say and is
swallowed; a scroll with no modifier is swallowed (it would switch desktops). A modified click
(Meta+drag) passes on. Floating windows count only with `frameOnFloating`.

### Popup grace

While a panel popup is active, KWin's focus delay is 1.5 s, so crossing the gap between a floating
panel and its popup doesn't focus the window beneath (KDE bug 511162). Any other activation puts
back the user's `DelayFocusInterval`, read fresh from kwinrc.

---

## 10. Edge cases

- **Fullscreen.** A fullscreen window stays in the tree (`docs/spec-fullscreen-tree.md`). KWin
  takes it out of its tile; it is left out of the layout (its siblings fill the space) and rejoins
  when fullscreen ends. One per workspace: making one fullscreen clears the others. It keeps the
  focus (§5) and blocks focus and moves across it (§2). Floated or tiled again, it stays
  fullscreen (§2).
- **Minimized.** Out of the layout, its share to its siblings; back where it was when restored.
  Across a reload a minimized window loses its place.
- **Maximize.** No handler: a maximize takes the window out of its tile, the next pass puts it
  back, and that clears the maximize.
- **KWin's quick-tile and tile editor.** A quick-tiled window is pulled back into its tile. Meta+T's
  editor edits tiles kwin-i3 overwrites on the next pass (`LATER.md` item 26).
- **Modal dialogs.** Float (§3). KWin moves a modal dialog with its parent; kwin-i3 waits while
  either is dragged, and ignores the moment they have two desktops.
- **A window moved to another desktop by someone else** (Overview, a window rule): kwin-i3 follows,
  as a move to that workspace.
- **A window that resizes itself** while tiled: put back (§6).
- **A new window under a fullscreen one**: §5.
- **Known limit, a monitor returning to a fullscreen window on a hidden workspace** (accepted,
  Paul, 2026-10-22; fuzzer I9, seeds 214 and 28). KWin asks the window to be fullscreen again and
  to move back, but a hidden window gets no frame callbacks, never acknowledges, and KWin applies
  nothing until it does. Meanwhile KWin calls it not resizable and refuses the tile, so kwin-i3
  floats it where it stands, out of sight. Meta+Shift+N, or closing it, brings it back. The same
  holds for a hidden floating window smaller than KWin's 150 px decorated minimum.

---

## 11. Settings

**Where they live**: kwinrc `[Script-kwin-i3]`. `src/settings.js` is the table (types, defaults,
ranges); `package/contents/config/main.xml` and `config.ui` follow it (`tests/unit/` keeps the
three together); the settings page builds its config from `main.xml`. A value that doesn't parse
logs a `WARN` and uses the default.

**When a change applies**: the script reads its settings at load and at every KWin reconfigure.
The settings page sends one on Apply (with the helper loaded, its settings watch sends a
second, which finds nothing changed). The Configure form doesn't; the helper's settings watch
does it for it (100 ms after kwinrc's group changes); without the helper, press Meta+Shift+C. The
plugins watch kwinrc themselves. On a reconfigure with changes: the rules reclassify every window
if a rule list changed, the ring is told if `tiledLook` changed, and every workspace is placed
again.

| setting | default | range | effect | applies |
|---|---|---|---|---|
| `gapsInner` | 4 | 0-100 | gap between tiled windows (even; an odd value counts as the one below) | next pass |
| `gapsOuter` | 2 | 0-200 | added at the screen's edges | next pass |
| `defaultOrientation` | `auto` | `auto`, `horizontal`, `vertical` | a new workspace's direction | new workspaces |
| `resizeStep` | 10 | 1-50 % | resize by key, tiled | next press |
| `floatingStep` | 10 | 1-200 px | move and resize by key, floating | next press |
| `focusWrapping` | `yes` | `yes`, `no`, `force`, `workspace` | §2 | next press |
| `workspaceOutputs` | empty | `N=OUTPUT, …`, N 1-10 | assigned monitors (§4) | at login, when the monitor appears, and for a workspace first used after |
| `workspaceAutoBackAndForth` | off | | §4 | next press |
| `floatingWorkspaces` | empty | numbers 1-10 | workspaces whose new windows float | next pass, new windows |
| `ignoreClass` | Plasma's own (krunner, yakuake, spectacle, plasmashell, polkit agent, kruler, logout greeter, kded5, xwaylandvideobridge, ksplashqml, kwin_wayland) | list | windows that place themselves, by class | reclassify |
| `ignoreRole` | `quake` | list | the same, by role | reclassify |
| `floatingClass` | empty | list | always floating, by class | reclassify |
| `floatingTitle` | empty | list | always floating, by title substring | reclassify |
| `tiledLook` | `frame` | `frame`, `titlebars`, `bare` | §7 | next pass |
| `frameWidth` | 1 | 1-10 px | the ring | next pass; the effect at once |
| `frameActive`, `frameInactive` | `#4c7899`, `#333333` | `#rrggbb` | tiled ring colours | the effect at once |
| `frameOnFloating` | off | | ring on floating windows | next pass |
| `frameFloatingActive`, `frameFloatingInactive` | `#4d7254`, `#333333` | `#rrggbb` | floating ring colours | the effect at once |
| `roundedCorners` | on | | §7 | the effect at once |
| `holdEnabled` | on | | §7 | the effect at once |
| `holdTimeoutMs` | 100 | 10-2000 ms | §7 | the effect at once |
| `warnTakenKeys` | on | | the load-time key reports (§13) | next load |
| `debugLog` | off | | the D-Bus log, the debug actions; no control on either form | at once (debug actions: next load) |

The plugins accept any colour Qt parses; the script only `#rrggbb`. `holdTimeoutMs`'s range is
kept by the forms, not by the effect. The effect still reads `[kwin-i3-hold] Enabled` and
`TimeoutMs` where the new keys are missing.

### The settings page

`kcm/`, `docs/style-settings-page.md` for how it looks and reads.

- **Banners**: kwin-i3 off (with Turn On, which enables it and reconfigures); on but not running
  (pointing at the journal); running without the effect (the frame and the hold need the plugins).
  It checks for the effect, not the helper.
- **Main page**: Tiling (gaps, the new-workspace direction, both steps, focus at an edge, the
  hold), Workspaces (auto back-and-forth, and the Workspaces sub-page), Frame (`tiledLook`, width,
  colours, corners, frame on floating windows; greyed without the effect), Window Rules, Keys (the
  sub-page, and `warnTakenKeys`).
- **Workspaces sub-page**: for each of the ten, a monitor (any, or a connected one, or a stored one
  shown as not connected) and new windows tiled or floating.
- **Window Rules sub-page**: the two lists, Places itself (application or role) and Always float
  (application or title contains); defaults marked; Pick a Window… (KWin's window picker; a window
  KWin doesn't manage is reported as placing itself already); no commas, no duplicates.
- **Keys sub-page**: every command from `kcm/ui/commands.json`, current keys from kglobalaccel; a
  key held by another component is named and taken on Apply (recorded for `make restore-keys`); a
  shifted symbol is shown with the keys that type it on the current layout. Not shown while
  kwin-i3 isn't running.
- **Apply** writes kwinrc and the keys, and reconfigures if a setting changed. **Defaults** resets
  both to `main.xml`'s and the US keys.

### The workspace widget

`widget/`: a button for each workspace in use (with windows, or shown), drawn at its monitor's
shape with its windows as rectangles; the focused workspace bold, the shown ones highlighted; a
named desktop shows "N name". A click runs `kwin-i3 Workspace N` (as Meta+N); the wheel steps
through workspaces in use, wrapping. One setting, "Numbers only". Without kwin-i3 it draws, and a
click does nothing.

---

## 12. Start, reload, release

### Load (`start`, `startRest`)

1. Register Release and Dump State first, so the safety valve exists whatever fails next.
2. **A login** (no normal windows): number the monitors (§4). Focus goes to workspace 1 after
   Plasma's first activity event. **A reload**: no renumbering.
3. **Adopt the tiles** (`adoptTiled`): windows already in KWin's tiles keep their layout
   (`docs/plan.md`, decision 5).
4. Connect KWin's signals; register the hidden drag actions; turn the tiling drag on.
5. **Ask the effect** for its stats, waiting up to 250 ms, then **adopt every other window**,
   bottom of the stack first (so the focus order follows stacking), and focus KWin's active
   window.
6. Register the keys, ask the helper to fit them, check taken keys, layout keys and per-output
   desktops (one notification, §13), place everything.

An exception during load releases (below). The effect is asked again at every reconfigure: two
missed answers (1 s each) turn the frame off; an answer turns it on and borders are given back
where no frame replaces them.

### Reload

Unloading the script runs nothing: tiles, paddings, taken borders and Keep Above stay as they
are, and the next load adopts them (step 3; the floating set from the effect; borders sorted at
the first answer). Paul's reload is CLAUDE.md's.

### Release (Meta+Ctrl+Shift+Q)

The safety valve, also run on a load or rebuild failure: turn the tiling drag off; every window
out of its tile, Keep Above cleared where kwin-i3 set it, its border given back; every root tile
kwin-i3 touched emptied and reset to the full screen with no padding. Logs `RELEASED`. After it
the script does nothing until reloaded.

### The plugins

The effect, loaded or unloaded, tells the script by queueing a reconfigure; unloaded, it releases
holds and resets radii it set. The helper, loaded, queues a reconfigure (so the script turns the
drag on) and a key fit; unloaded, it removes its filters and D-Bus objects and puts back the
user's focus delay. If the script doesn't poll a started drag within 500 ms, the helper turns the
tiling drag off; the drag cursor ends by itself 500 ms after the script stops renewing it.

---

## 13. Reports

One notification per load (app "kwin-i3"), its parts collected first:

- **Taken keys** (`warnTakenKeys`): kwin-i3's keys another active component holds, with how to free
  them (System Settings > Shortcuts, or `make take-keys`).
- **Layout keys** (`warnTakenKeys`): without the helper, any keyboard layout other than US, as
  kwin-i3's position keys are set for US.
- **Per-output desktops off** with two or more monitors: reported at load, and once later if it
  becomes a problem; never set.

`Dump State` (Meta+Shift+B's capture) sends the outputs, the tree, the windows, a JSON state and the
in-memory log to `net.local.kwini3.dump`; `tools/capture` saves it with the effect's `Events`
(`docs/debugging.md`).

---

## 14. The KWin seam

What KWin 6.7 does that kwin-i3 works around, in one place. Each is in the code's comments, with
the capture or fuzzer finding that showed it.

| KWin does | kwin-i3 does |
|---|---|
| `Tile::unmanage` restores the pre-tiling size | keeps the frame when the window is fullscreen, hidden or leaving its workspace |
| a tile managed while its desktop is hidden lists the window but never places it | unmanages and manages it again once shown |
| on a hidden desktop `w.tile` is null though the tile lists it | finds the tile from its own record |
| an outer side dragged with gaps pins the tile to the screen border for good | rebuilds the tiles when an outer edge isn't the layout's |
| gives a full padding at an edge it judges exactly 0 or 1 | insets the root by a hair |
| rounds tile position and width separately | rounds edges to whole pixels itself |
| a 15 % default minimum per tile | sets minimums from the window |
| moves a window only when its tile changes | writes the window to its tile when it's off |
| answers a returning monitor's placement with the old geometry, late | re-fits until the window shows its tile |
| a hidden client may never answer a move | moves via sticky, then gives the desktop on arrival |
| moves a modal dialog with its parent, with two desktops for a moment | ignores that moment; waits while either is dragged |
| activates a new window before telling scripts | hands focus back to a fullscreen window |
| activating a window can switch another monitor's desktop | switches it back |
| calls every fullscreen window not resizable | uses min/max size for fullscreen windows |
| refuses to tile a fullscreen window | keeps it in the tree out of the tiles |
| KPackage caches a package linked while KWin runs | it can't be turned on until the next login (README) |
| the generic script config form tells KWin nothing on Apply | the helper's settings watch reconfigures |
| shortcuts match the typed symbol, not the key | the helper refits the position keys |
| Shift+; arrives as `:` | Move Right's second key is Meta+: |
| a GTK 4 client keeps within bounds sent only with its first configure | asks 0 × 0, then its tile |
| `print()` from a script is dropped on this machine | logs over D-Bus |
| plugin libraries are never unloaded | a new file name per build |
| a `KConfigWatcher` subscription outliving its plugin crashed KWin | subscriptions owned by the plugin's own object |
