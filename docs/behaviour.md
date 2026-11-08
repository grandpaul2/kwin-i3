# What kwin-i3 does: the behaviour as built

**The one description of what kwin-i3 does today**, exactly, read from the code. A decision's
reason lives in `docs/plan.md`; this page says what the code does now. Where a doc disagrees,
this page is checked against the code. A change to
behaviour updates this page in the same commit (`docs/testing.md` P1).

Long and exact on purpose during the Stage; the user's documentation will be
written from it later. Code is cited by file and function (`src/kwin.js` `applyFocus`), not by
line, so the citations survive edits. **The words are `docs/definitions.md`'s.** A window has one
of i3's four kinds (§3): **tiling** and **floating** (sticky or not) in the tree; **dock** and
**override-redirect** kept out of it; the desktop window is the root, in no tree (`src/rules.js`
`classify`, whose labels also include `sticky` and `root`).

Contents: 1 the pieces · 2 the tree · 3 window kinds · 4 workspaces and outputs · 5 focus ·
6 from the tree to the screen · 7 the frame and the look · 8 keys · 9 the mouse · 10 edge cases ·
11 settings · 12 start, reload, release · 13 reports · 14 the KWin seam

---

## 1. The pieces

| piece | what it is | built from | installed by |
|---|---|---|---|
| the script | a KWin script, the whole window manager | `src/*.js`, concatenated by `build.sh` into `package/contents/code/main.js` | `make install` (`tools/install.sh`: linked into KWin's scripts and enabled; README, "Install") |
| `kwini3hold` | a KWin effect (`CrossFadeEffect`, internal, on by default; needs OpenGL compositing) | `plugin/hold.cpp`, `holdmain.cpp`, `hold.json` | `make plugin-install` (with `make install`) |
| `kwini3helper` | a KWin plugin: frame focus, the tiling drag and resize, the resize mode and terminal key, the key override, layout keys, popup grace, the gap strips, and a pointer probe for the tools | `plugin/main.cpp`, `helper.cpp`, `framefocus.cpp`, `tilingdrag.cpp`, `resizemode.cpp`, `keyoverride.cpp`, `layoutkeys.cpp`, `popupgrace.cpp`, `gapstrips.cpp`, `pointerprobe.cpp`, `metadata.json` | `make plugin-install` (with `make install`) |
| the settings page | a System Settings module (`kcm_kwin_i3`, Wayland only, under Window Management) | `kcm/` | `make kcm-install` (with `make install`) |
| the workspace widget | a Plasma applet, an alternative to the pager | `widget/` | `make widget-install` |

**The product is the script and its two plugins** (`docs/philosophy.md`, "Defaults"); the script
runs alone too. What each plugin piece adds, and what happens without it:

| plugin piece | adds | without it |
|---|---|---|
| hold: atomic layout | moved windows switch to their new places in one frame; a closing tiling window stays drawn until its neighbours have resized; a new tiling window is hidden until placed | windows move one by one; the wallpaper can show for a frame |
| hold: the frame | the 1 px ring outside tiling (and optionally floating) windows, rounded corners, the drop indicator, the drag cursor | tiling windows keep their title bars whatever `tiledLook` says; no drop indicator |
| hold: the bars and the banner | a tabbed or stacked group's bar (its tabs), the resize mode's banner | a group shows an empty strip where its tabs would be; the resize mode shows no sign it is on |
| hold: the memo | keeps the floating set and each workspace's whole tree across a script reload (P3) | a reload reads the tiles back (`plan.md` decision 5): less comes back |
| helper: frame focus | the ring counts as its window for hover focus, clicks and scroll | hovering the ring focuses nothing; a click there goes to the desktop beneath |
| helper: tiling drag | i3's tiling drag (title bar or Meta+drag) and Meta+right-drag resize; a floating container moved and resized whole | Meta+drag is KWin's own move, which floats the window where it's dropped; no tiling resize; a container can't be floated whole |
| helper: resize mode and terminal key | i3's resize mode (K4) and the Terminal key's launch (K18) | neither key works; the settings page's banner says the plugins are missing |
| helper: gap strips | the gaps take presses (Z2, Z3, Z9) | a press in a gap goes to the desktop beneath |
| helper: layout keys | the position keys (digits, `;`) follow a non-US keyboard layout | the keys are US symbols; logged at load (§13) |
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
| `/kwini3hold` | `net.local.kwini3hold` | `Stats` (with the memo, P3), `Events`, `SetFloating`, `SetFloated`, `SetRing`, `SetTiledRing`, `SetFocused`, `ShowIndicator`, `SetDropIndicator`, `SetDropBands`, `SetDragCursor`, `SetBar`, `SetBarSpan`, `ClearBars`, `SetMode`, `SetMemo`, `HoldNew` | the script (`Events`: `tools/capture`; `SetMode`: the helper) |
| `/kwini3drag` | `net.local.kwini3drag` | `State`, `SetOn`, `SetResizeGap`, `SetFloating`, `SetFloated`, `SetFocusParent`, `SetBars`, `TabEvent`, `Warp`, `Cancel` | the script |
| `/kwini3helper` | `net.local.kwini3helper` | `FitKeys`, `Plan` | the script (`Plan`: tests) |
| `/kwini3mode` | `net.local.kwini3mode` | `SetMode(mode)`, `Mode`, `LaunchTerminal`, `TerminalService` | the script |
| `/kwini3helper/pointer` | `net.local.kwini3helper.Pointer` | `Probe(x, y)`, `Map(x, y, w, h)` (at most 10000 px a call), `Windows`, `Events` | `tools/pointer-map`, `tools/capture` (`docs/pointer.md`) |

The helper calls back into the script through kglobalaccel: it invokes six hidden shortcuts,
registered with no key (`kwin-i3 Tiling Drag`, `Tiling Resize`, `Floated Moved`, `Tab Click`,
`Window Pressed`, `Mode Changed`), and the script then asks `State()` (or `TabEvent`, `Mode`).
The script asks for a reply from `Stats`, `State`, `TabEvent`, `Mode` and `TerminalService`; every
other call is told, not asked. Settings reach the plugins directly from kwinrc
`[Script-kwin-i3]`, each with its own watcher, except the tiling ring, which the script tells the
effect and the helper (`SetTiledRing` on both; the helper reads `tiledLook` only until told).

The script also runs five of KWin's own shortcuts by name (`invoke`): **Window Fullscreen** and
**Window Close** (Meta+F, Meta+Shift+Q), **Switch to Screen N**, to make an output with an empty
workspace KWin's active one, and **MoveMouseToCenter** / **MoveMouseToFocus**, the pointer warp
when focus changes output (§5 A2).

The script logs to `net.local.kwini3.log` only when `debugLog` is on, and keeps the last 2000
lines in memory either way for `Dump State` (`src/log.js`; `docs/debugging.md`).

---

## 2. The tree

`src/tree.js` is a pure model (no KWin calls), ported from i3 4.24; each function names the i3
function it ports.

### The model

- **Outputs**, i3's levels above the workspaces: the root (the outputs in KWin's order, primary
  first; its focus stack, the focused output first), each output (name, rect, the workspace KWin
  shows there) and its content (its workspaces in number order; its focus stack, i3's, which
  says what an output falls back to, §4 S10, M4). Focus runs up to the root as i3's `con_focus`.
  A workspace with no output (empty, never shown since it lost one, §4 W4) has none above it.
  `src/kwin.js` mirrors KWin into it: the outputs at load and `screensChanged` (the order also at
  `screenOrderChanged`), what each shows at every desktop switch, the focus order at each pass.
- **Nodes.** A workspace (`ws`: number, layout, `workspace_layout`, tiling children, floating
  children, focus stack). A split (`con` with no window: layout, children, focus stack, share).
  A layout is `h` or `v` (i3's splith, splitv), `tabbed` or `stacked`; a tabbed container counts
  as horizontal and a stacked one as vertical wherever a direction is asked (`con_orientation`),
  and each container remembers its last split layout for Meta+E. A leaf
  (`con` with a window). A floating container (i3's `CT_FLOATING_CON`, on the workspace's
  floating list) holding one child, a window or a split or group floated whole (T16); the child
  carries the floating flag (`con_is_floating`) and a window its sticky flag.
- **Focus stacks**, most recent first, in every container. Only a workspace's stack holds
  floating containers; the focus itself is never on one, only on what it holds.
- **Shares** (`percent`) of siblings sum to 1 (`fixPercent`, on attach, detach, close and move):
  a child with no share gets the average of the others', then all are divided by the total.
- **The model's own state**: the global focus, the previous workspace (for back-and-forth), and
  the workspace focus was last on.
- **Departures from i3, by design**: workspaces are KWin desktops and are never closed when empty;
  the workspace an output shows is a pointer on the output, not i3's `CF_OUTPUT` flag on the
  workspace (KWin shows one desktop on several outputs with per-output desktops off, and a
  workspace on an output it doesn't live on for a turn: reason (a)); no dock areas (Plasma's
  panels are outside kwin-i3's area); fullscreen is set on a window, never a container (i3's
  output fullscreen only; K11, reason (a): KWin fullscreens windows); no shares above a workspace
  (outputs and contents have none in i3's rendering either); showing a workspace (`show`) reorders
  only its content's focus stack, the global focus following KWin's activation (reason (a): KWin
  activates, the model follows); no marks, no urgency, no scratchpad (`docs/plan.md`, "Scope"); a
  minimized window stays in the tree, skipped by every descent, focus move and insertion
  (`reachable`), reason (g): i3 rejects minimize (`handlers.c:849-858`) (§5 C9, §10 V7).

### Empty and redundant splits

- **A split left empty closes**, and so on upward (`onRemoveChild`).
- **`flatten`** is i3's `tree_flatten`: a split whose only child is a split of the other
  direction, inside a parent of that same direction, is dissolved into the parent; only splits,
  never a tabbed or stacked container. Run where i3 runs it: after a move, a move to another
  output and a layout change on a workspace; and, as i3's (`tree.c:740-746`), inside the
  floating containers too, so a redundant pair inside a split floated whole is dissolved. Nothing else is removed: a one-child split holding a
  split stays, as in i3, where `focus parent` reaches it (`plan.md` decision 8).

### Operations

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart. The "=" rows are
ports: the i3 function is named, and the code follows it, edge cases included.

| # | Operation | Result | i3 | Note |
|---|---|---|---|---|
| T1 | **Open** (`open`) | the new leaf goes after the focused container of its workspace, in that container's parent; focus on a floating window: after the focused tiling container; an empty workspace: at the top level. It takes the average share and goes to the bottom of its parent's focus stack; KWin's activation then focuses it (§5). Under a fullscreen window it goes second in the focus stack, so it gets focus when the fullscreen window closes | = | `tree_open_con`, `manage.c` |
| T2 | **Close** (`close`) | the next focus is `con_next_focused`: the previous focus in the same container, descending | = | `tree_close_internal`. Whether it or KWin's choice wins today: §5 C6, C7 |
| T3 | **Split** (`split`; Meta+H, Meta+V) on a window | its parent has one child: the parent takes the direction; else the window is wrapped in a new split of that direction, even when the parent already has it | = | `tree_split` |
| T4 | Split with the workspace focused (an empty workspace) | under two children: the workspace takes the direction; else its children are wrapped first (`workspace_encapsulate`), then as T3 | = | `tree_split` |
| T5 | Split on a floating window | nothing | = | `tree_split`: "Floating containers can't be split" |
| T6 | **Toggle split** (`toggleSplit`; Meta+E) | the window's parent flips direction (after i3's #3001 rule: a parent and grandparent each holding one child are collapsed first); at the workspace's top level, the workspace's children are wrapped in a split of the other direction, then flattened. From a tabbed or stacked container: back to the split it was (side by side if it never was one) | = | `layout toggle split` (`con_toggle_layout`). i3's bare `layout toggle`, which cycles stacked and tabbed too, is bound to no key |
| T7 | **Move** (`move`; Meta+Shift+direction), a leaf beside it in the same split | the two swap | = | `tree_move` |
| T8 | Move, a split beside it | enters that split at the edge facing the move, then `flatten` | = | `tree_move` |
| T9 | Move, no sibling that way | climbs out to the nearest ancestor of that direction, creating one at the top if none (`ws_force_orientation`) | = | `tree_move` |
| T10 | Move at the workspace's edge; or a fullscreen window; or the workspace's only child; or the lone child of a split at the workspace's edge that way | to the workspace visible on the neighbouring output, at its top level, at the near edge (first when moving right or down); it keeps focus. A fullscreen window arriving where one already is: that one's flag goes (one per workspace, as a move to a workspace) | ≠ | `move_to_output_directed`, `attach_to_workspace` (`move.c:179-245`), which leave the target's fullscreen window alone, so i3 can end with two on one workspace: reason (f), the path breaks the one-per-workspace invariant `con_enable_fullscreen` keeps (`con.c:1269-1276`) and `_con_move_to_con` keeps (T24) |
| T11 | Move that would climb out across a fullscreen window | refused | = | `tree_move` checks only the climb-out path, as here; a swap inside the fullscreen window's own split isn't checked by either |
| T12 | **Resize by key** (`resize`; the resize mode's J K L ;, K4) on a tiling window | the nearest ancestor-or-self in a split of that direction with more than one child grows or shrinks by `resizeStep` percent of the split; every sibling gives up or gains an equal part, so which edge moves depends on its place (the last child growing moves its left or top edge); refused if any share would go below one pixel of the split (`percent_for_1px`, `resize.c:131-136`) | ≠ | `cmd_resize_tiling_width_height` (`commands.c:505`), in ppt, as i3's default config gives on a tiling window ("10 px or 10 ppt"). ≠ in what can't be said: a px-only resize, as a key's action takes no arguments (`plan.md` reason (d)). And the floor: 1 px both ways here; i3's is 1 px across and 1 px plus the title bar's height down a vertical split (`resize.c:131-136`, `deco_rect`), the title bar being Plasma's here, not part of the tree (reason (b)) |
| T13 | Resize by key on a floating window | by `floatingStep` px, if KWin lets it resize, kept within `floatingMinimumSize` and `floatingMaximumSize` (§11 N15) | = | `cmd_resize_floating`, 10 px (§8), `floating_check_size` |
| T14 | Move by key on a floating window | by `floatingStep` px; refused only if no part would be on an output; landing on another output (the one holding its centre, else the one it overlaps most) joins the workspace visible there, keeping focus | = | `cmd_move_direction`, `floating_reposition`, `floating_maybe_reassign_ws`, `get_output_from_rect` |
| T15 | **Swap** (`swap`) | two tiling windows exchange places, shares and fullscreen flags; the tiling drag's centre drop uses it (§9) | = | `con_swap` |
| T16 | **Float** (`floatingEnable`; Meta+Shift+Space) | the leaf goes into a new floating container at the head of the workspace's floating list (the bottom of the stacking, T20), taking its branch's place in the focus stack; a fullscreen window stays fullscreen. With a container focused (focus parent): the container goes whole into a new floating container, its windows laid out inside its rect as a tiled tree with no gaps (L10a), the rect its children's own sizes (the frame each window arrived with, or for one tiled already at a load KWin's restore, its size out of the tile; widths summed, the tallest height; a split child's its own children's, the same way) within the floating size limits, centred on the workspace; Floating Toggle on it again tiles it whole, and on a window inside it floats that window alone. Without the helper, on a container: nothing (§13 says so) | ≠ | `floating_enable` (`floating.c:331-342`, `:382`), `floating_disable`; `gaps.c:57`. ≠ in one point, reason (f): i3 sums its children's `geometry`, which is set for a window (`manage.c:523-524`) and never for a split, so a container of splits floats at the size floor, 75x50; the code's intent is "a sensible one by combining the geometry of all children". Without the helper: as K4, the helper being what moves it whole (`plan.md` "The mouse") |
| T17 | **Tile** (`floatingDisable`) | after the workspace's focused tiling container, or at the top level of an empty workspace; a fullscreen window stays fullscreen | = | `floating_disable` |
| T18 | **Focus a direction** (`focusDir`; Meta+arrows, J K L ;) from a tiling window | the sibling that way in the nearest split of that direction; at the workspace's edge, the workspace visible on the neighbouring output, at its **tiling** focus (its fullscreen window if it has one); else wrapping by `focusWrapping` | = | `tree_next`, `get_tree_next` |
| T19 | `focusWrapping` | `yes` (default): the next output first, else wrap inside the **innermost** container of that direction; `no`: the next output, never wrap; `force`: wrap inside the container, never leave it; `workspace`: wrap, never leave the workspace | = | `focus_wrapping` |
| T20 | Focus a direction from a floating window | left and right cycle the workspace's floating windows, wrapping; up and down do nothing | = | The list is i3's stacking order: a window that opens floating goes to its head (`floating_enable`, `floating.c:296`), an activated one to its tail (`con_activate`'s `floating_raise_con`, `floating.c:479-482`), and a step left or right rotates it so the one reached is last, the cycle keeping its order (`tree.c:622-626`). `get_tree_next`: "up/down does not change floating containers" |
| T21 | Focus a direction with the (empty) workspace focused | the next output, in every `focusWrapping` mode, `force` too; nothing if there is none | = | `get_tree_next`, `handle_workspace` |
| T22 | Focus a direction past a fullscreen window | only to the next output, in all four directions, tiling or floating (with `focusWrapping` `workspace`: nowhere) | = | `con_fullscreen_permits_focusing` (`con.c:2327-2364`), from the focus's own fullscreen ancestor: with the focus on another window of that workspace (after an activation), it moves on, as i3 |
| T23 | **Focus mode toggle** (`focusModeToggle`; Meta+Space) | between the workspace's most recent floating window and its most recent tiling one; with the workspace itself focused (T27), to its most recent floating window. A fullscreen window on the workspace ends (§10 V6b) | = | `focus mode_toggle` (`cmd_focus_window_mode`, `commands.c:1399-1424`, `con_activate_unblock`) |
| T24 | **Move to a workspace** (`moveToWorkspace`) | after the target's focused container; focus stays on the source, on i3's next focus there. A fullscreen window arriving where another is fullscreen clears the other's flag; a window arriving under a fullscreen window doesn't take that workspace's focus | = | `con_move_to_workspace` |
| T25 | **Layout tabbed / stacked** (`setLayout`; Meta+W, Meta+S) | the focused window's container takes the layout; at the workspace's top level, the workspace's children are wrapped in a new container of that layout; on an empty workspace, the workspace takes it as its layout and its `workspace_layout`, so the windows that open there go into a new container of that layout | = | `con_set_layout`, `workspace_attach_to`. With a container focused (T27), that container's parent |
| T26 | Focus and move inside a tabbed or stacked container | tabbed: left and right step through the tabs, up and down leave the group; stacked: up and down, left and right leave it; a move reorders the same way; a window opened in the group goes after the focused tab | = | `con_orientation`, `get_tree_next`, `tree_move` |
| T27 | **Focus parent** (`focusParent`; Meta+A) | the focused container's parent takes the focus; from a floating window, its workspace; never above the workspace, and not out of a fullscreen window. KWin's focus stays on the window the container would descend to; every window in the focused container is drawn focused; a window opened then goes beside the container, and a move or a layout key acts on the whole container | = | `level_up` (past the floating container, `tree.c:392`); `con_inside_focused` (x.c) for the look |
| T27a | **Focus child** (`focusChild`; unbound) | the focused container's most recently focused child takes the focus (a minimized window skipped, §5 C9); from a workspace, its last focused tiling child or floating window, stepping through its floating container; from a window, nothing | = | `level_down` (`tree.c:412`, the floating container's step at `:418`). Unbound, as in i3's shipped config (`#bindsym $mod+d focus child`) |
| T28 | Resize inside a tabbed or stacked container | the container is skipped: the resize goes to the nearest split around it | = | `resize_find_tiling_participants` |

---

## 3. Window kinds

### i3's kinds (as i3's, down to the names)

Every window has one of i3's four kinds (`definitions.md`), a floating one may be sticky, and the desktop window is the root, not a kind; the rules (focus first, §5) are written in them:

| i3's kind | in i3 | here |
|---|---|---|
| **tiling** | in the tree's layout | the tree places it |
| **floating** | in the tree, on its workspace's floating list | you place it |
| **sticky floating** (floating, sticky) | floating, visible on every workspace of its output (`sticky enable`) | a window on all virtual desktops (R3): floating, moved in the model to whatever its output shows |
| **dock** | i3bar; never focused (`manage.c`) | Plasma's panels |
| **root window** (not a kind) | the background; a click or a crossing focuses its output | the desktop window |
| **override-redirect** | not in the tree: i3 never places or focuses it; it takes the keyboard itself, and focus is where it was when it goes (`manage.c`) | on Wayland: popups and Plasma's shell surfaces |

**The code's kinds are i3's** (`src/rules.js` `classify`, `keptOut`,
`i3Kind`): tiling and floating in the tree; dock, root and override-redirect kept out by type or by
the built-in class list; **sticky** (on all desktops) in the tree as sticky floating.
The i3 kind of each window Plasma shows, and how the code gets there:

| window | i3's kind | how |
|---|---|---|
| KRunner, panel popups, menus, notifications, OSDs | override-redirect | by KWin's type (popups, menus, tooltips, notifications, OSDs, applet popups); KRunner by class |
| `kded5`/`kded6`, `xwaylandvideobridge`, `ksplashqml`, `kwin_wayland` (system windows, never meant to have focus) | override-redirect | the built-in class list (Normal windows on Wayland, where i3 would never see them) |
| Plasma's panels, and its panel configuration window (a layer-shell surface in scope `dock`, `panelconfigview.cpp`) | dock | KWin's type |
| the desktop window | root | KWin's type |
| Yakuake (on all desktops) | sticky floating | `classify`: on all desktops (R3). On Wayland Yakuake's hide is a close: Qt drops the surface's role and unmaps it (`QWaylandWindow::setVisible(false)`: `resetSurfaceRole`, Qt 6.9), so each show is a new window (§5 C1) and §5 C7's close focus applies when it hides |
| Spectacle's window, the password prompt (polkit), KRuler | floating | the default `forWindow` rules, by class (a user can delete one and see the tool tile) |
| Spectacle's region overlays (a Normal fullscreen window per output, probe 93) | override-redirect | by class and fullscreen (in the tree they would gather on the focused workspace) |
| the logout screen (`ksmserver-logout-greeter`) | override-redirect (as i3lock: it holds the keyboard itself) | the built-in class list |
| `plasmashell`'s shell surfaces (panels, popups) | dock / override-redirect, by type | KWin's type |
| `plasmashell`'s ordinary windows (Configure Desktop and Wallpaper, a widget's settings) | floating | the default rule `[class="^(org\.kde\.)?plasmashell$" window_type="normal"]` |
| the desktop portal's dialogs (`xdg-desktop-portal-kde`: the screen-share picker, the file chooser, the remote-control prompt) | floating | the default rule `[class="^org\.freedesktop\.impl\.portal\.desktop\.kde$"]`: Qt dialogs, which i3 floats by the X11 dialog type (`manage.c`); on Wayland they have no type, and are transient only when the app names a parent window (Firefox's screen share names none) |

### How a window gets its kind

`src/rules.js` `classify` runs on every judgement (settings read each time), first match wins;
then `src/kwin.js` `adoptWindow`. **=** as in i3 · **≠** differs · **+** no i3 counterpart.

| # | When | Kind today | i3 | Note |
|---|---|---|---|---|
| R1 | KWin's type: a panel (dock), the desktop window (root); popups, menus, tooltips, OSDs, applet popups, and Plasma's notifications (class `plasmashell`; override-redirect); another type that is neither Normal nor dialog, utility, toolbar, splash or notification; kwini3helper's own gap strips (Z9: kwin-i3's own windows, as i3's frame windows are i3's; the code labels them override-redirect only to keep them out) | kept out of the tree | = | `i3Kind`, `keptOut` |
| R2 | An X11 dialog, utility window, toolbar, splash screen or notification (an Xwayland app's) | floating | = | `manage.c`: dialog, utility, toolbar, splash; and another app's notification-type window (an X11 toast) floats too, as `manage.c:469`, Plasma's own being told apart by class (KWin shows a script no X11-only property) |
| R3 | On all desktops | **sticky floating**: in the tree, floating, on whatever workspace its output shows (the model moves it there after every switch, i3's `output_push_sticky_windows`; KWin draws it there by itself; not after a move: sent to a hidden workspace it stays there until that output next shows a workspace, as i3; Move Workspace to Output pushes on both outputs, as its two workspace_show do); it keeps the focus across a switch if it had it, else joins without it. The windows are pushed in i3's order: the output's workspaces by their focus stack, then each one's floating windows by its own (`output.c:90-117`). A window inside a split or group floated whole (T16) keeps the container: the container is sticky and pushed whole, its other windows going to the desktop shown with it; the focus stays with it only if the window's own parent is the floating container, so not from inside a split | = | `con_is_sticky` looks down from the floating container, and `cmd_sticky` sets the flag on any window's con (`commands.c:1571`); the focus rule is `output.c:109`'s `current != old_focus->parent`. The `forWindow` rules run after, as i3's (`manage.c:591`): `floating disable` tiles it, taking it off all desktops onto its workspace (X4: KWin's tiles belong to one desktop, where i3 keeps the flag); `floating enable` leaves it sticky. Otherwise as i3: i3: `_NET_WM_DESKTOP` all: "float it and make it sticky" (`manage.c:486-490`); `output.c:83-120`. Yakuake comes in this way |
| R4 | Skips the taskbar | decides nothing | = | i3 ignores the hint. Read on a live desktop: the only Normal window that sets it is `xwaylandvideobridge`, on the built-in list. |
| R5 | The built-in class list: `krunner`, `kded5`/`kded6`, `xwaylandvideobridge`, `ksplashqml`, `kwin_wayland`, `ksmserver-logout-greeter` (class or instance); Spectacle's windows that are fullscreen | override-redirect | ≠ | On Wayland Plasma makes its system windows Normal windows, where i3 would never see them; not a setting (a user can't make a window override-redirect). Reason (a): KWin gives these system windows no type that keeps them out. Of them, `xwaylandvideobridge`'s idle window is **KWin's fallback only** (`Rules.fallbackOnly`): it never asks for the keyboard, yet KWin activates it when nothing else is left (an empty desktop), so it holds nothing (A3) and keeps no focus (D7) |
| R6 | Transient, modal, or a fixed size (not resizable; a fullscreen window: fixed unless its minimum and maximum differ) | floating | = | `manage.c`: transient_for (or a leader that is managed), `_NET_WM_STATE_MODAL`, min = max |
| R7 | KWin's type is dialog, utility, toolbar or splash (R2) | floating; a Wayland dialog with no parent, not modal and resizable tiles (R10) | ≠ | `floatsByDefault`. On Wayland a window has no type: KWin sets one only from Plasma's shell roles (`xdgshellwindow.cpp`), and Qt sends a dialog's parent, and the dialog protocol for a modal one only (R6). So a dialog with neither reaches KWin as an ordinary window, where i3 floats it by its X11 type (`manage.c:466`). Reason (a): Wayland carries no window type. Sway's `wants_floating` (`xdg_shell.c`) meets the same limit. Seen: KIO's untrusted-program warning, which KIO 6.31 opens with no parent. Not a default rule: such a dialog has its app's class and a translated title, so no rule names it alone; Meta+Shift+Space floats it |
| R8 | Its title is exactly `kwin-i3 capture note` | floating | + | `tools/capture`'s box |
| R9 | The `forWindow` rules, i3's `for_window [criteria] floating enable \| disable`, in order, each at most once per window (X2): `class`, `instance`, `title`, `window_role`, `window_type` (a keyword, case-insensitive, as i3's `match.c`: `normal`, `dialog`, `utility`, `toolbar`, `splash`; `notification` (another app's notification-type window, R2); i3's `menu`, `dropdown_menu`, `popup_menu`, `tooltip` are read but never match, those windows being kept out of the tree, R1; the page offers the five), `workspace` (the number it opens on), `floating`, `tiling`, `all`; a value quoted (`\"` inside) or bare, as i3's `word` (up to a space, a quote or the `]`); the others regular expressions, case-sensitive, read as i3's PCRE2 as far as JavaScript can: JavaScript's strict syntax first, then a leading `(?i)` as case-insensitive and loose escapes (`\-`, `\ `); all in one rule must match | as the last matching rule says | ≠ | `Rules.classify`; a pattern still unreadable (possessive quantifiers, atomic groups), or another command, skips the rule with a `WARN` (≠: i3 reads those; reason (a), JavaScript has no PCRE2). `window_type=normal` matches every window of no other type, where i3 gives a typeless X11 window no type and `normal` misses it: KWin has no typeless windows (reason (a)). i3's `__focused__` value matches the focused window's class, instance, title or role, or the focused workspace, as i3's (`match.c:101-103`, `:180-181`); at a window's opening that is the focus before it. |
| R10 | Otherwise | tiling | = | |
| R12 | After a reload: the rules say tiling, but it is in no tile and kept above (or in the effect's floating set) | floating | + | It was floating before the reload |
| R13 | On two or more desktops, not all | not adopted until it is on one (or all: R3) | ≠ | i3 has no such state (`_NET_WM_DESKTOP` is one or all); reason (a): a workspace is one virtual desktop and KWin's tiles belong to one, so such a window has no one place in the tree |
| R14 | Maximized when adopted | unmaximized | = | i3 has no maximize and ignores the request (V8) |
| R15 | On another activity | judged like any other | + | Plasma's activities; no check |
| R16 | A window kept out of the tree | not in the model; watched for a later change of class, title or transience **only if it is a Normal window** | = | i3 manages every window but docks and override-redirect ones; the sticky kind is R3's |
| R17 | A window already closing when kwin-i3 first sees it (`deleted`) | kept out of the tree (override-redirect) | + | nothing to place |
| R19 | `assign` (§11 N12): `[criteria] → N` (`workspace N`, `number N`; 1-10) or `[criteria] output X`, at adoption only, before every other choice of workspace (§5 C1's `placeNew`): the first matching workspace rule, then the first matching output rule on top of it, as i3 applies both (`manage.c`, `run_assignments`); X as i3's `get_output_from_string`: a name (case-insensitive), `primary` (KWin's first screen), `nonprimary`, `current`, `left`/`right`/`up`/`down` from the focused output (wrapping; with no other output, the focused one); a direction counts from the window's own output, the matching workspace rule's if there is one, as i3's `con_move_to_output_name` (`get_output_for_con`) | opens on N, shown or not, without switching an output and without the focus if N is hidden; then, with an output rule, on X's visible workspace; an output that isn't connected leaves that rule aside (the workspace one stands) | = | i3 marks a hidden target urgent; there is no urgency here, so the window waits there. A never-used N is created on the focused output. A `floating`, `tiling` or `workspace` criterion never matches in an assign, as in i3, where assignments are read before the window has a container (`match.c`). |
| R20 | A window becoming floating (adoption, a rule, Meta+Shift+Space, KWin's refusal to tile) | sized within `floatingMinimumSize` (75x50) and `floatingMaximumSize` (0x0: all outputs together; -1x-1: none), then KWin's own floor (~150 px wide with a title bar) | = | i3's `floating_minimum_size`/`floating_maximum_size` (`floating.c`); `clampFloating`. |
| R18 | A window adopted with no border, not to be framed (a session restore of one kwin-i3 had taken, or a reload after the effect went) | its border given back; a KWin rule forcing no border wins | + | |

### Changing kind

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| X1 | Meta+Shift+Space (`Floating Toggle`) | tiling and floating swap; a window floated this way comes back at its untiled size (below) | = | `floating toggle` |
| X2 | A change of title, class, transience or readiness to paint (`reclassify`) | the `forWindow` rules not yet run on the window run, each at most once, only to apply it: a window whose title stops matching stays as it is, and so does one floated or tiled by hand; a window now kept out of the tree (a type change) leaves the model | = | i3's `run_assignments` (`assignments.c`) |
| X3 | A rule setting changed (`forWindow`, `assign`, the old lists) | every rule runs anew on every window (each window's record cleared), as a reload would in i3 | = | §11 |
| X4 | Put on all desktops (the window menu, a client, a KWin rule, Sticky Toggle) | floated if tiling, marked sticky, pushed to what its output shows (R3). Off all desktops onto one: no longer sticky, it stays floating on that desktop's workspace. **Made tiling** (Floating Toggle): taken off all desktops onto its workspace's first | ≠ | i3: Sticky Toggle is `sticky toggle` (`cmd_sticky`, `commands.c:1571`), unbound, as i3's; a client or the menu putting it on all desktops is `_NET_WM_DESKTOP` all (`handlers.c:885-895`: floated, then sticky only if it was not floating already, V10). A tiled sticky con keeps its flag in i3; reason (a): KWin's tiles belong to one desktop's root, so a tiling window can't stay on all of them. |
| X5 | A move KWin starts on a tiling window: the app's own header bar asking to be moved (GTK, Electron, a browser's tab strip), KWin's Move Window, the window menu's Move | refused: the helper cancels it on the next turn, the window staying in its tile. **Without the helper** (and so Meta+drag, F9): out of its tile, floating where dropped | ≠ | i3 ignores a client's move request on a tiling window (`handlers.c:936`) and has no keyboard or menu move; KWin runs each as its own interactive move (6.7.5 `xdgshellwindow.cpp:1045-1050`), before any input filter, so the helper cancels it once started (`TilingDrag::watchMoves`); one whose first step comes first has untiled the window and floats it, as before. Without the helper: ≠, reason (a). Floating windows move as ever (F1); Meta+Shift+drag (G5) or Meta+Shift+Space floats a tiling one first. G5's move is the one let through: the helper's own, for as long as it lasts |
| X6 | KWin refuses to tile it (not resizable, or not on the tile's desktop) | floating; a fullscreen window stays in the tree, out of the tiles, until fullscreen ends | ≠ | i3 tiles any window; KWin's tiles can't hold one that won't resize **Kept**: KWin's tiles can't hold a window that won't resize. Reason (a). |
| X7 | The tiling windows' minimum sizes don't fit the output | the one with the largest minimum along that axis floats, repeatedly (`floatWhatCannotFit`) | ≠ | i3 ignores size hints on tiling windows (`plan.md` reason (a)) **Kept**: a Wayland client can't be drawn smaller than its minimum; it would hang outside its tile |

### A floating window's size

- **The untiled record** (`recordUntiled`): when kwin-i3 first sees a window untiled, it records
  its frame and its output's geometry.
- **Floating a tiling window** (`floatAtRecord`) gives it the recorded size, clamped to the output's
  area. On a different output its centre is mapped by fraction onto the new one (i3's
  `floating_fix_coordinates`); a rect that doesn't fit is centred. On a hidden workspace, KWin's
  own restore applies instead.
- **An app that last closed tiling** opens at its tiling size and floats at that size, as in i3
 .

### What each kind gets

| | tiling | floating | kept out of the tree |
|---|---|---|---|
| placed by | the tree | the user | the app or Plasma |
| on a workspace | yes | yes | yes, KWin's |
| moved between outputs by kwin-i3 | with its workspace | with its workspace | no |
| look | per `tiledLook` (§7) | its own decoration; the frame instead if `frameOnFloating` | untouched |
| kept above tiling windows | — | yes (L12) | untouched |
| takes keyboard focus from kwin-i3 | — | — | yes, until a key moves focus (§5) |

KWin's part, which kwin-i3 doesn't touch: where a new floating window opens (KWin's placement,
"centered", a dialog over its parent; i3: the window's requested place, centred over its leader),
and the smallest it can be (the client's minimum and KWin's decorated floor, about 150 px; i3:
75x50). A KWin window rule that forces a size, a desktop, maximize or no title bar fights
kwin-i3: none is handled.

---

## 4. Workspaces and outputs

`src/workspaces.js`, with the actions in `src/kwin.js`.

**A workspace is a virtual desktop**, 1 to 10, and lives on one output, **its output**, kept by
the output's name. i3's workspaces live on outputs the same way; the differences are in the rows.
Per-output workspaces need KWin's per-output desktops (`perOutputVirtualDesktops`); kwin-i3
reports when it is off with two or more outputs and sets it only on the user's yes, on the
settings page's Workspaces tab (§11).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**W. What a workspace is**

| # | Rule | i3 | Note |
|---|---|---|---|
| W1 | Workspace N is desktop N, numbers only, 1 to 10; Plasma's desktop names are display only. A virtual desktop past 10 (the Overview can add one) is not a workspace: a window opened on it, or asking for it, goes to the focused workspace (C1); one moved there leaves the tree; the Overview showing it is undone | ≠ | i3 has named, unbounded workspaces: `plan.md` decision 9, reason (a) |
| W2 | Desktops are created on demand up to the one asked for (Meta+7 on one desktop makes 2 to 7), never removed; KWin saves the count | + | i3 creates a workspace when asked and closes it when empty and hidden; here the desktop stays, and W4 gives the same effect |
| W3 | **A workspace with windows**, or the focused one, lives on a connected output: when its output goes, it moves to the first output (the primary first: KWin's `workspace.screenOrder`, as i3's `get_first_output`; `Workspaces.ordered`), workspace outputs not read, for good; one whose workspace output names a returning output comes back (W5, M2) | = | i3's `move_content` (`randr.c:863`); `src/outputs.js` `homesAfterLoss`. |
| W4 | **An empty workspace**, unless focused (W3), has no lasting output: it takes the output it is next visible on (S3) | = | i3 closes an empty workspace when it is hidden, and makes it again where asked; an empty focused one is kept and moved (`randr.c` `move_content`) |
| W5 | **Workspace output** (`workspaceOutputs`, i3's `workspace N output A B …`): a list of outputs per number, space-separated (`1=DP-4 HDMI-A-1, 2=DP-6`), the first connected one wins; when it appears, its workspaces go there. An output name can't contain a space (i3's can't either) | = | i3's `get_assigned_output` |
| W6 | A new workspace's direction (`defaultOrientation`): `auto` is side by side unless its output is taller than wide | = | `default_orientation` |

**S. Showing and sending (the actions)**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| S1 | Meta+N, N visible on the focused output | nothing; with `workspaceAutoBackAndForth`, the previous workspace | = | |
| S2 | Meta+N, N visible on the other output | focus goes to that output (§5 A2 for the pointer) | = | |
| S3 | Meta+N, N hidden, with windows | N shows on its output; focus to its fullscreen window, else its last focus | = | |
| S4 | Meta+N, N hidden and empty | N shows on its workspace output, else the **focused output** (the focused workspace's; KWin's active output only with nothing focused), which becomes its output | = | `workspace_show` |
| S5 | Meta+Shift+N | the window goes to N on N's output; focus stays behind, on i3's next focus there. An empty hidden N takes the window's output as its own. Auto back-and-forth applies; the unbound **Workspace N (no back-and-forth)** and **Move to Workspace N (no back-and-forth)** actions skip it | = | i3's `--no-auto-back-and-forth` flag, as actions (a key takes no arguments). |
| S6 | Back-and-forth, and moving a window there (unbound) | the previous workspace, if it still exists | = | Unbound by default, as in i3 |
| S7 | Next and previous, overall or on this output, and moving a window there (unbound) | over workspaces with windows or visible, wrapping | = | |
| S8 | Focus the output in a direction (S11, wrapping), or **next** (the outputs' order, primary first, wrapping) or **primary** (the first in that order) (unbound) | its visible workspace, at its last focus | = | i3's `focus output left\|right\|up\|down\|next\|primary`; by name stays out: KWin's shortcuts are registered once, at load, under fixed names. |
| S9 | Move a window to the output in a direction, next or primary (unbound) | to the workspace visible there; focus stays | = | as S8 |
| S10 | Move the workspace to the output in a direction, next or primary (unbound) | it shows there, with the focus; the source shows its most recently focused workspace that has windows (i3's focus stack of the output's workspaces, `TAILQ_FIRST(focus_head)`), else its lowest with windows, else an unused one: one whose workspace output is the source and not yet in use first, then the lowest whose workspace output is not elsewhere (i3's `workspace_move_to_output`, then `create_workspace_on_output`); none left (all ten in use): refused. A workspace with a workspace output moves too. The previous workspace (back-and-forth) is then the one the source shows | ≠ | i3's has no "refused": it makes a new workspace; here there are ten (`plan.md` decision 9, reason (a)) |
| S11 | Which output is "in a direction" | one that way by origin, overlapping on the other axis, the nearest by origin (a diagonal one never qualifies); for the commands (S8-S10, a direction in `assign`), none that way: the farthest the other way (wrapping); for the tree's edge (T10, T18), none: nothing | = | i3's `get_output_next` (`randr.c:259-317`), and `get_output_next_wrap` for the commands (`output.c:33-51` `get_output_from_string`), which gives the current output when there is none at all; the model's `outputNext`, `outputNextWrap` |

**M. Outputs and desktops changing**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| M1 | Login (no normal windows) | the workspaces with workspace outputs get their outputs; then each output, primary first (`screenOrder`), shows the lowest workspace whose workspace output it is, else the lowest free workspace whose workspace output is not another | = | i3's `init_ws_for_output` (`randr.c:503-514`, then `create_workspace_on_output`); i3 takes its config's first such line, the setting here is keyed by number, so the lowest stands in |
| M2 | A reload | nothing renumbered; each workspace's output comes back from which output's tiles hold the windows | + | |
| M3 | An output lost | its workspaces with windows, and the focused one, move to the first output for good, workspace output or not (W3); empty unfocused ones have no output left; the first output keeps showing what it showed, unless the focus was on a moved workspace, which it shows then; focus as §5 D5 | = | i3's `move_content`. |
| M4 | **The lost output back** (or any output appearing) | the existing workspaces whose workspace output it is (W5) move to it (one not made yet is made only when shown or used, as i3's loop over existing workspaces, `randr.c:462-486`), their windows with them; a source left showing one of them shows its most recently focused workspace that has windows, else its lowest with windows, else an unused one (S10's rule); then the output shows its lowest workspace, else the first whose workspace output it is, else the lowest free one | = | i3's `init_ws_for_output` (`randr.c`); `src/outputs.js` `movingTo`, `sourceShows`, `newShows` |
| M5 | **An output never seen before** | as M4: the workspaces whose workspace output it is go to it, and it shows its lowest, else the first of those, else the lowest free one, over whatever KWin picked (the desktop it last showed in the activity, else desktop 1) | = | as M4 |
| M6 | After any output change | every window is re-fitted to its tile as its geometry settles (`armRefit`) | + | |
| M7 | A desktop switched outside kwin-i3 (the Overview, a pager, KWin's own desktop keys, an activation) | §5 D2/D3 | | |
| M8 | Desktops removed or reordered (`desktopListChanged`) | appending changes nothing; anything else rebuilds the model from KWin's tiles and windows, as at load, and with per-output desktops each output showing another's workspace switches to one of its own. Nothing is placed while it rebuilds. A removed desktop's windows join the workspace KWin moved them to. The numbered settings stay positions: after a removal, "3" names whatever is now workspace 3 | + | |
| M9 | Per-output desktops turned on | each output showing another's workspace switches to one of its own (`showHomes`): the lowest living there and visible nowhere, else an unused one | + | |

---

## 5. Focus

The model owns focus; KWin shows it. `docs/plan.md`, "Focus", is the reasoning; this is the
behaviour.

**Four things can point at an output**, and in i3 they are always the same one:

- **the model's focus**: a window, or an empty workspace;
- **KWin's active window**: what has the keyboard. Usually the model's window; it can also be an
  override-redirect window (KRunner, a popup), or none;
- **KWin's active output**: where a new window opens. It moves on **every pointer motion** and
  every activation (`pointer_input.cpp`, `activation.cpp`);
- **the pointer**.

i3 keeps them together: crossing onto an output focuses it, even an empty workspace
(`handlers.c` `check_crossing_screen_boundary`), and a command that moves focus to another
output brings the pointer along (`x.c`). kwin-i3 can split them apart; rows **B2** and **A2** say how.
A new window still opens on the focused workspace (**C1**): kwin-i3 moves it there from KWin's choice.

### Every way focus changes

**=** as in i3 · **≠** differs from i3 (the reason in the note) · **+** no i3 counterpart (Plasma's)

**A. Keys**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| A1 | A key moves focus on the same output (Meta+arrows, Meta+Space, Meta+N visible there) | kwin-i3 | the tree's choice (§2, §4) | stays | = | |
| A2 | A key moves focus to another output (an edge, Meta+N on the other, focus/move workspace to output); also an outside desktop switch (D2) or an activation (Alt+Tab, the task manager, an app); not KWin's own pick at a close (i3 sets no warp at a close, `tree.c`) | kwin-i3 | the workspace's fullscreen window, else its last focus | to the focused window's centre, an empty workspace's output centre, **unless the pointer is on that output already**, or inside the window (KWin's focus follows mouse on a floating window reaching onto another output: a pointer's activation, never warped in i3); `mouseWarping none` (§11 N7): never | = | i3's `x_set_warp_to` from `workspace_show` and the focus commands, `x_push_changes` warping only if the pointer isn't there (`workspace.c`, `x.c`). Never from a close (`applyFocus`'s `byKey`; the start menu closing sent the pointer across) |
| A3 | Any key of kwin-i3's while an **override-redirect** window has the keyboard (KRunner, a menu, a panel popup, a notification; §3 `i3Kind`); not the video bridge KWin falls back to on an empty desktop (R5): the key runs as with no window active, as i3's bindings yield only to a client's keyboard grab (`bindings.c:177`) | — | nothing: the key does nothing (`KEY … ignored` in the log); Escape first | stays | = | i3's bindings don't fire while dmenu holds the keyboard; panel popups included |
| A4 | A key that doesn't move focus while a window in no tree and not override-redirect has the keyboard (R13: on two or more desktops) | — | that window keeps it | stays | ≠ | reason (a), as R13; an override-redirect window's keyboard is A3's |
| A5 | Meta+F, Meta+Shift+Q | KWin | unchanged. Meta+F acts on KWin's active window, whatever its kind, unless it is override-redirect (A3) or the video bridge KWin falls back to (R5: nothing, as i3's on an empty workspace; Meta+Shift+Q there closes nothing either); Meta+Shift+Q on the model's focus: a window, or every window in a focused container or workspace (§8 K12) | stays | ≠ | i3 acts on its focused container: Meta+Shift+Q as i3; Meta+F with a container focused fullscreens its focused window (§8 K11, reason (a): KWin fullscreens windows) |
| A6 | Move window to workspace N / to an output | kwin-i3 | stays on the source workspace, i3's next focus there | stays | = | |
| A7 | Any key acting on the tree, first (all but the six KWin runs: Fullscreen, Close, Resize Mode, Exit, Terminal, Launcher; `KWIN_OWN`) | kwin-i3 | the model takes KWin's active window, if it is in the tree | — | + | Not stale-checked: a key in the millisecond after an output unplug takes a stale activation (accepted) |

**B. The mouse**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| B1 | The pointer enters a window (focus follows mouse), or its ring (§9) | KWin | that window | — | = | i3's `focus_follows_mouse` (`handlers.c:95`): kwin-i3's `focusFollowsMouse` (default on, as i3's), won through KWin's live options at load and after every reconfigure (focus follows mouse, no delay, the next focus under the pointer), Plasma's own focus setting left as it is; off, click to focus (`src/kwin.js` `winOptions`). The pointer reaching a tiling window's frame under a neighbour's margin raises that window (Z9's part B), and the raise asks its focus too: KWin's own enter at the stored position counts as a pointer that hasn't moved and asks nothing (probe 94). Entering the window KWin keeps active inside a container chosen by focus parent focuses that window, as B3 |
| B2 | The pointer moves over the root window or a dock (an empty workspace, a gap, a panel, a tile Show Desktop hides): on another output than the focus's, at a crossing or later (the focus moved there by a key with `mouseWarping none`); on the focus's own output, while focus parent has chosen a container or the workspace, as i3 checks on every such motion | kwin-i3 (`pointerMoved`, from `cursorPosChanged`; one comparison per motion, the hit test only when the check can change the focus) | that output's visible workspace: its fullscreen window, else its last focus, or the empty workspace; over an override-redirect window the model's focus moves and that window keeps the keyboard (D7); nothing with focus follows mouse off, during a tiling drag, or until an output change has settled | stays | = | i3's `check_crossing_screen_boundary` (`handlers.c:91-121`, no test that the output differs; `con_descend_focused` brings a container chosen by focus parent down to its window); a dock counts as root. Over a tiling or floating window, KWin's focus follows mouse activates it a turn later (B1, probe 91); a floating window reaching over from another output is a window there, not the root (`handlers.c:206-210`; KWin's own hit test has no output test either), and its activation by the pointer warps nothing (i3 warps only for a command, `tree.c:617`, `workspace.c:559`). Focus and pointer never come apart across outputs, but for the far part of such a window. Under Show Desktop the hidden tiles count as root (probe 97); the focus pass then leaves the keyboard with the desktop and Show Desktop on (74), and the focus is that workspace's when it ends |
| B3 | A click on a window | KWin; with a container or the workspace focused (focus parent), on the window KWin keeps active in it, the helper, then kwin-i3 (`windowPressed`) | that window, raised, the container chosen by focus parent included; without the helper, a click on that one window leaves the container focused; a Meta+Shift+left press on any of its windows is G16's, which keeps the container focused | — | = | i3's `route_click` step 3 (`con_activate` on the window's con, any button and modifier). KWin activates a window clicked but not the one it has active, so the helper tells kwin-i3 of that one ("Window Pressed"): frame focus for most presses, the tiling drag for the two it takes first (a title-bar left press, Meta+right; KWin orders filters of one weight last-installed first, 6.7.5 `input.cpp`). A Meta+left drag reports nothing, as i3's step 2 starts it before focusing. Likewise focus follows mouse entering it (B1; `handle_enter_notify` focuses any con but the focused one) |
| B4 | A click on the root window or a dock | KWin, then kwin-i3 (`desktopActivated`) | the desktop: that output's visible workspace at its last focus (or the empty workspace), the desktop window given up at once; a panel: unchanged (KWin never activates a dock), what it opens is override-redirect (A3); with Show Desktop on, the desktop keeps the keyboard (+, Plasma's edit mode) | — | = | i3's root click (`click.c`). Known limit kept: typing into the desktop itself (an icon rename) loses the keyboard on the next pass. |
| B5 | The pointer still, a window grows under it (after a close, a resize) | — | unchanged | — | = | i3 ignores enter events its own re-layout caused (`add_ignore_event`); KWin acts only on motion |
| B6 | A tiling drag drops | kwin-i3 | the dropped window | stays | = | |
| B7 | The pointer crosses the gap to a panel popup (override-redirect) | helper | the popup keeps it (KWin's delay 1.5 s) | — | + | i3's popups grab the pointer |

**C. Windows opening and closing**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| C1 | A new window | kwin-i3: **the focused workspace**, wherever KWin's active output (the pointer's) put it; moved there, hidden until it is placed (`src/placement.js`, `placeNew`) | the new window, if its workspace is visible on the focused output (`manage.c:437`); else what had it | — | ≠ | i3: the focused container's workspace (`manage.c`). KWin opens it on its active output's current desktop and activates it before kwin-i3 hears of it; kwin-i3 moves it. ≠ in one step: i3 first opens a window on the workspace it was **launched** from (`manage.c:336`, `startup_ws`, startup notification); reason (d), the launch workspace is out (`plan.md` "Out"; `LATER.md` item 28), so a window opens where the focus is when it maps. **Known limit**: a window that asks for exactly the desktop KWin would give it anyway (a session restore, a rule) can't be told from one that didn't ask, so it goes to the focused workspace; only when the pointer's output and the focused one differ. "Asked" means a desktop no output was showing before the window's own switch (`placement.js` `target`), so a restored window whose desktop another output shows also counts as not asking. |
| C2 | A new window whose desktop isn't the one its output shows (a dialog placed over its parent on the other output, with the active output's desktop) | kwin-i3 | as C1 or C3 | — | = | KWin switches that output first (`SwitchToOtherDesktop`), in the same call as `windowAdded`: kwin-i3 records the switch, the window's adoption claims it, and the output shows what it did again. A new window never switches what an output shows, except under C4. |
| C3 | A new modal dialog whose parent is in the tree | kwin-i3 | the dialog, if the parent's workspace is visible on the focused output (`manage.c:437`); else what had it (the capture: the focus stayed on the other output's empty workspace) | — | ≠ | **The dialog opens on its parent's workspace**, given the parent's desktop directly; the parent stays. i3's rule (dialog on the focused workspace, parent stays) can't hold on KWin: `Window::setDesktops` moves a window's transients with it and a modal dialog's parent with it (`window.cpp:730-742`, 6.7.5; probe 90): reason (a). A non-modal dialog follows C1 |
| C4 | A new window on a hidden workspace (an app asking, a session restore) | KWin | the new window; its output switches to it | — | ≠ | i3 neither focuses nor shows a new window on a hidden workspace (`manage.c:432-441`); an app's activation request marks it urgent (`focus_on_window_activation smart`); a pager's or task manager's request switches to it, as here (`handlers.c:782-793`). **Accepted**: every activation (Alt+Tab, the task manager, an app, kwin-i3's own) reaches KWin through one policy a script can't tell apart; "do nothing" breaks Alt+Tab and the task manager across workspaces and leaves nothing to mark urgent. Seen as: its desktop was shown on no output before its own switch (`Placement.target`). Reason (a). |
| C5 | A new window on a workspace with a fullscreen window | kwin-i3 | handed straight back to the fullscreen window, as `popupDuringFullscreen` says (§10 V6): `smart`, not if the newcomer is a transient **of the fullscreen window** (its `transientFor` chain reaches it); `ignore`, always; `leave_fullscreen`, always, but a transient of any window ends the fullscreen; `all`, not if the newcomer floats, and a floating one takes the focus wherever its workspace is visible, on either output (`manage.c:527`; i3's invisible-workspace rule, `manage.c:604-616`, still holds). One that opens fullscreen itself takes over whatever the value. The fullscreen window's own **modal** dialog takes the focus under every value: KWin activates a window's modal dialog in its place (`activation.cpp:373`, `findModal`) | — | ≠ | i3's `popup_during_fullscreen` (`manage.c:424-528`, `con_find_transient_for_window`); another app's dialog opens behind it under `smart`. Kept: the modal exception, KWin's (i3 has no modal dialogs), reason (a) |
| C6 | A tiling window closes, in a split with others | kwin-i3 | the previous focus in that split, recorded as it closes | — | = | `con_next_focused` |
| C7 | A window at a workspace's top level, or a floating one, closes | kwin-i3 | i3's next focus (`con_next_focused`): the workspace's most recently focused window other than it, minimized ones skipped, over KWin's choice (here the window under the pointer, `NextFocusPrefersMouse=true`; stock Plasma: KWin's most recently used) | — | = | As C6. A parent whose modal dialog KWin activates in its place takes its place in the model's focus order right behind the dialog (`activatedNow`, `windowActivated`), as i3 focuses a window at its opening before its dialog |
| C8 | The last window of a workspace closes | kwin-i3 | the empty workspace; no window active | — | = | |
| C9 | The focused window is minimized | kwin-i3 | i3's next focus (C7) over KWin's choice: KWin activates its own inside `doMinimize`, before `minimizedChanged`, so `windowActivated` sees the focused window's flag set while the model's isn't, and takes it for the minimize | — | = | i3's `move scratchpad`: the window leaves the layout (§10 V7), and the focus kwin-i3 chooses never lands on a minimized window (`tree.js` `reachable`: `nextFocused`, `descendFocused`, the focus keys, the mode toggle skip it); restoring it is an activation (the task manager, Alt+Tab). Also when KWin's own pick is no window of the tree (none, the desktop, a gap strip under the pointer): the minimize itself moves the focus to i3's next. |

**D. Workspaces and outputs changed from outside**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| D1 | KWin activates a window its output isn't showing, without switching (stale) | kwin-i3 | refused; the model's focus is put back | — | + | |
| D2 | An output's virtual desktop switched outside kwin-i3 to N (the Overview, a pager, KWin's own desktop keys, an activation by Alt+Tab or the task manager, C4), **on the output with the focus** | kwin-i3 | i3's `workspace N` (`workspace_show`): N's fullscreen window, else its last focus, else the empty N (`shownOutside`) | to the focus, when it changed output (A2) | ≠ | N living on another output (windows there, that output connected): the switched output shows what it did again and N shows on its own, so two outputs never show one workspace (a capture showed two outputs both on 5; the Overview included). Else N is the switched output's. Recorded at the signal and handled a turn later, after C2's claim. Also when KWin switched to activate a window kept out of the tree (a dialog of KWin's or of Plasma's): ≠, reason (e): i3's override-redirect windows never switch a workspace, but undoing the switch would hide the window that asked to be seen, which is Plasma's (`philosophy.md`). |
| D3 | The same, **on the other output** | kwin-i3 | as D2 | as D2 | = | |
| D4 | A desktop switch kwin-i3 made itself | KWin, then kwin-i3 | KWin activates that desktop's last window; the model's choice replaces it on the same pass | — | = | |
| D5 | An output lost, or back | kwin-i3 | the first output's visible workspace (the primary, `screenOrder`'s first): its fullscreen window, else its last focus, or the empty workspace | to it, if it isn't on that output (A2) | = | i3 focuses the primary output's workspace at the end of every output change, when an output is flagged primary (`randr.c:1048-1058`); Plasma always flags one (the first of KWin's `screenOrder`), so here always |
| D6 | Desktops removed or reordered | kwin-i3 | rebuilt from KWin's active window (§4) | — | + | |
| D7 | A window kept out of the tree takes the keyboard (KRunner, a popup; not the video bridge KWin falls back to, R5, which keeps nothing and which an empty workspace's focus takes the keyboard from, as from the desktop) | KWin | it keeps it through passive passes and, if override-redirect, through every key (A3), until it closes: then the model's focus again, **not** KWin's own next choice (`closingOutside`: the activation KWin makes before `windowRemoved` is set aside) | — | = | A floating one is in the tree and follows C1 and C7, as i3. Not root or a dock: those get B4 |

**E. Start**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| E1 | A login | kwin-i3 | the output under the pointer, at its workspace's focus (§12 P2) | — | = | |
| E2 | A reload | kwin-i3 | KWin's active window, the window focused before it | — | = | i3's `restart` keeps the focus (§12 P3) |

### In from KWin

- **`windowActivated`**: KWin activated one of kwin-i3's windows (a click, focus follows mouse, a
  new window): the model focuses it. **Refused** when the window's workspace isn't the one visible
  on its output (a stale activation): focus is put back.
- **Before every key action** the model re-syncs from KWin's active window, without the stale
  check: a key inside the millisecond after an output unplug would take a stale activation (known,
  accepted). The six keys KWin runs (A7) skip it.

### Out to KWin

`applyFocus` runs at the end of a pass that asked for focus (`wantFocus`: a key, a close, a new
window and the like), after the placing, so a pointer warp lands on settled windows:

1. **A passive pass** (no key caused it) leaves the focus with a window kept out of the tree
   (KRunner, a panel popup, a dialog of Plasma's), unless that is the desktop window or a panel.
2. **The desktop or a panel focused**, passively: kwin-i3 asks KWin whether Show Desktop is on;
   if it is, nothing happens; if not, focus goes back to the model's window on the next pass.
3. The model's workspace is made visible on its output if it isn't.
4. **An empty workspace focused**: its output becomes KWin's active output, and KWin's active
   window is cleared if it is on another workspace.
5. **A window focused**: it is activated. If activating it switched another output's desktop,
   that switch is undone.
6. **The pointer** moves only on a key's pass (A2); passive passes never move it.

---

## 6. From the tree to the screen

### The pass

Every change marks its workspace dirty; a 0 ms timer coalesces them into one pass (`flush`). Each
workspace is placed in its own try (one failure doesn't stop the others), then the focus is
applied. A failure logs `ERROR` and retries the whole pass after 250 ms, at most 3 times in a row,
then waits for the next real event.

### Projection onto KWin's tiles

kwin-i3 places tiling windows with KWin's own custom tiles; KWin's
tiles are the display, the model is the truth. `project` turns the model into a shape KWin's tiles
can hold:

- minimized windows are left out, their share going to their siblings; a fullscreen window KWin
  has taken out of its tile keeps its place in the tiles' projection as an empty tile, so its
  siblings keep their sizes behind it (i3's `render.c:127-144` renders a fullscreen con alone and
  leaves its siblings' rects); a tabbed or stacked group showing it, or a workspace of nothing
  else, has no such tile;
- one-child splits collapse; a split inside one of the same direction merges into it, shares
  multiplied through;
- a **tabbed or stacked** container is a vertical pair: an empty bar tile, then the tiles of the
  child it shows (its focused one). The bar is 24 px for tabbed and 24 px a child for stacked,
  taken out of the group's own share, so the pair stays right when it merges into a vertical
  parent. It is drawn that tall whatever the gaps, flush on the shown child's ring and in line
  with its neighbours' rings: KWin pads the bar tile as any tile, and the bar is drawn across
  that padding, as i3's bar is the group's, inside its gaps, on its child (`gaps.c:62-71`,
  `render.c:474-477`). Its window keeps its whole ring, the top side under the bar: ≠ i3, which
  draws a group's child `normal`, the bar in its top border's place (`con.c:1889-1893`); the
  look's reason, the bar sitting on the frame as every window's frame shows. Each tab (a
  stacked bar's row) has i3's 1 px border on all four sides (`x_draw_title_border`,
  `x.c:363-381`), in its class's frame colour: the shown tab the group's, the others unfocused. The other children's windows go into the tile of the shown child's focused window,
  behind it, and the shown child's window is raised when it isn't on top (i3's raise of a
  group's focused child, `render.c`). A group of one child has no bar and is that child alone,
  as i3 with its `pixel` border (`render_con_tabbed`: the bar only for more than one child or a
  `normal` border). After a border drag, a group's share is read from its shown child's tiles
  and its bar; the children behind keep theirs.
- **The bar** is drawn by kwini3hold (with the plugins; without them the bar's place stays
  empty), with the group's shown window, so a window above covers it; groups nested in one
  another show the same window and each draws its own bar, as i3 draws every tabbed or stacked
  container's decorations: one row of equal tabs, or
  one row per child, each the child's window title, a container's i3's tree representation
  (`H[alacritty firefox]`, each window by its class instance, `con.c`'s
  `con_get_tree_representation`; a Wayland window with no instance by its class). Without i3's
  `i3: ` prefix (`x.c`): the brackets already say it is a container, and the look follows
  Plasma's (reason (b)). The shown child takes the frame's colour of its class (focused when the focus is in
  the group, as i3's `focused` against `focused_inactive`) with white text (re-told at every pass and when KWin moves the focus
  itself, `windowActivated`); the others Plasma's
  window colours. Reason (b): i3 draws its own colours and font, here Plasma's. While the hold
  shows the old layout, each bar stays as it was and the new ones show with the new layout.

`reconcileNow` then, per workspace: moves windows that are on the wrong desktop or output
(below), refreshes the floating windows' look, floats what can't fit, and compares the projection
with the root tile's shape. **The same shape** is only resized; **a different shape, or a root not
inset for the gaps, or an outer edge KWin has pinned to the output's edge** rebuilds the tiles
from scratch. Each window is put in its tile; sizes are set in up to four passes until they
settle (setting one tile moves its neighbours' edges); a window whose frame geometry isn't its tile's rect
is written to it. Then it logs the tree (`TREE`) and checks its invariants (logged, never thrown).

### Gaps

i3's `gaps.c` `calculate_effective_gaps`, per workspace (`gaps(ws)`, worked out once per pass):

- The **inner gap** (`gapsInner`, plus the workspace's own `gaps inner` line) counts as the even
  number at or below it (an odd padding put windows half a pixel off; ≠ i3, which halves it
  between windows and gives the full value at the edge, `render.c:70-73`: reason (a)). The **frame** adds twice
  its width to it, when the ring is drawn on that workspace. **Title bars** add 2 px, for the
  decoration's outline outside its frame geometry (Breeze's, 1 px a side; KWin tells a script no
  theme's), when the inner gap isn't 0: so the wallpaper between two windows is the gap itself in
  either look, as i3's borders sit inside its rects.
- The **outer gap per side**: `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft`, each `gapsOuter`
  unless set (-1); a workspace's own lines (`workspaceGaps`: i3's `workspace N gaps …`)
  **replace** the global values there, as i3's `gaps_for_workspace` (`gaps.c:124-160`). **A negative outer gap** takes from the edge as i3's, but only down
  to half the inner gap, where i3 goes to 0 and past: KWin gives a tile at least half its padding
  against the screen (`tile.cpp` `windowGeometry`) and its root can't leave the output, reason
  (a); below that it is held, logged once (`WARN gaps`). The per-side keys stay 0 and up, as -1
  means "as `gapsOuter`" there.
- **`smartGaps`** (i3's `smart_gaps`): `on`, no gaps at all on a workspace with one visible tiling
  window, a tabbed or stacked group's hidden tabs not counted, or whose one child is a tabbed or
  stacked group (`Tree.numVisibleChildren`: i3's `con_num_visible_children`, `con.c:1090-1110`;
  `gaps.c:22-26`); `inverse_outer`, the outer gaps only on such a workspace. The ring keeps its
  room either way.
- Every tile has the inner padding; the root is inset on each side by that side's outer gap plus
  half the inner gap. So between windows: the inner gap; at the output's edge: that side's outer
  gap plus the inner gap (the root's inset plus the tile's own half), as i3.
- A side with an inset of 0 and a padding to halve is inset by a hair, as KWin gives a full
  padding at an edge it judges exactly 0 or 1. A tile KWin pins to the border anyway (a rebuild's
  float noise, `docs/kwin-notes.md`) still gets half there: a side is at the edge only where the
  root is, and its window is written back whenever KWin puts it a padding short (fuzzer I11: a
  1 px line with no frame under a bottom row).
- Edges are rounded to whole pixels (thirds of 2560 left a 1 px hole).

### Minimum sizes

A leaf tile's minimum is its window's minimum size plus its decoration plus the inner gap (which
holds the ring's room); splits have none (KWin's default 15 % minimum would block i3's sizes). The
display bends to fit minimums (the model keeps i3's shares, until a border drag KWin runs reads
every share of the workspace back, §9); if they can't fit at all, the window with the largest
minimum along the overflowing axis, width first, floats, repeatedly (§3 X7). Minimums that fill
their split exactly count as fitting, to half a pixel (a split made just wide enough lost to float
noise and gave a window half of it).

### Moving between desktops and outputs

`relocate`: a window whose workspace is on another output is made sticky for the move, sent to
that output, then given its workspace's desktop on arrival (or after 2 s), so a client hidden
mid-move still answers the resize. A window on the right output but the wrong desktop is given
its desktop. A window being dragged, or whose modal dialog is, waits for the drag's end.

### Keeping windows in their tiles

- **A resize drag on a tile's edge** reads the new sizes back into the model's shares when it
  ends (`readBack`).
- **A tiling window that resizes itself** (Firefox's session restore) is put back in its tile, as
  i3 refuses a tiling window's own resize; at most once a second per window, and a frame geometry filling
  the output waits 150 ms in case it is going fullscreen.
- **After an output change or a resize drag**, a window whose geometry lands on its old place is
  fitted again (KWin's placement tracker and slow clients answer late).
- **A fullscreen window KWin keeps in its tile** (no rebuild since it went fullscreen) is resized
  to the tile by KWin whenever the tile's padding or geometry is written (a reload's first pass,
  a gap or frame-width change); each pass puts it back on its whole output, and so does its frame
  changing to anything else while it is still fullscreen (a client answering the resize after the
  pass, as on a reload).
- **A GTK 4 window short of its tile** after its border was taken is asked for 0 × 0, then its tile,
  so KWin resends its bounds. The bounds it keeps within are remembered across a rebuild of the
  model (a desktop removed or moved), as its taken border is.

**Y. Against i3** (i3 4.24 `render.c`; the rest of this section is how KWin's tiles are driven, with
no i3 counterpart)

| # | What | Here | i3 | Note |
|---|---|---|---|---|
| Y1 | The area tiled | the output's work area (`MaximizeArea`: panels left out), followed as KWin changes it (a panel moved, resized, floated, hidden, or on another output; probed with plasmashell in the test KWin). Known lag, Plasma's: a *floating* panel switched to auto-hide, dodge windows or windows go below keeps its strut until the panel next redraws (its exclusive zone waits for a surface commit, `panelview.cpp:1591`; KDE bug 491363 alike); not seen in daily use, so no workaround | = | i3 leaves out its docks (the bar) and re-renders when a dock's strut changes (`handlers.c:1259`) |
| Y2 | A tiling window's minimum size | respected: the display bends to fit, the model keeps i3's shares; too many to fit: the window with the largest minimum along the overflowing axis (width first; a tie, the later in the tree) floats, repeatedly (§3 X7), and stays floating when room comes back | ≠ | i3 ignores size hints on tiling windows. Kept: a Wayland client draws at least its minimum whatever it is sent, and KWin's tiles won't size a window below it (§9 Z5). Reason (a). |
| Y3 | A window resizing itself; KWin's pack and grow keys, a maximize | put back on the next pass | = | i3 refuses a tiling window's own geometry |
| Y4 | A root tile kwin-i3 never placed (a desktop it hasn't shown) | keeps KWin's saved tiles, and Release (§12) leaves it too when it holds tiles (a layout made with Meta+T's editor: Plasma's, reason (e)) | + | |

---

## 7. The frame and the look

Checked against i3 4.24's `config.c` (defaults) and `x.c` (`x_draw_decoration`). The text after
the table is how it works. **The look is where kwin-i3 differs from i3 most, to blend with
Plasma**, as long as it costs no performance: a look difference's reason can be
that it fits Plasma better.

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**L. The look**

| # | What | Here | i3 | Note |
|---|---|---|---|---|
| L1 | A tiling window's default look | `frame`: no title bar, a ring | ≠ | i3's default is `normal`: its own title bar (a tab) and a border. Kept: the only title bar here is KWin's decoration (Breeze, with buttons), not i3's tab; `frame` is i3's `pixel`, `bare` its `none`, `titlebars` the nearest to `normal`. Reason (b). |
| L2 | The ring's width (`frameWidth`) | 1 px | ≠ | i3: 2 px (`default_border_width`, `config.c:217`). Reasons (b) and (c): **judged live**, after push back (i3's 2 px): what looks good in Plasma, and the look popular with modern window manager users |
| L3 | The ring's colours | two classes, from the tree (`x.c:498-512`): `focused` (`frameActive` #4c7899) for the focused window; `unfocused` (`frameInactive` #333333) for every other, the other output's focused window included. The ring follows the tree's focus, not the keyboard: with KRunner or a menu open the focused window keeps its colour | ≠ | i3 has a third, `focused_inactive`, for a parent's last focus (the other output's focused window, a split's last focus, an unfocused floating window). **Left out**, judged live: a third colour confused more than it told. i3 draws the border in `child_border`, by default the class's **background**: #285577, #5f676a, #222222. Kept: Plasma-friendly defaults; `urgent` stays out with urgency. The script sends each shown window's class to the effect at the end of a pass, only when it changes; the script also tells the effect the tree's focused window (`SetFocused`, whatever the frame), and a window not yet told its class is `focused` only if it is that window; after a release, none is. Reason (c). |
| L4 | A window alone in a split | the side where the next window opens (right in a horizontal split, bottom in a vertical one; the workspace counts, so a window alone on its workspace has it too) is drawn in the class's indicator colour after Split H, Split V or Toggle Split on it (the effect's `ShowIndicator`), until the tree's focus moves to another window (`SetFocused`) or the window is no longer alone in its split; otherwise in the frame's colour. No timer: it goes with the repaint of a focus change or a layout change (a fade's own repaints left the side stale on NVIDIA). `frameIndicatorActive` #3daee9, `frameIndicatorInactive` empty, the class's frame colour | ≠ | i3's `x.c:585-599` (its #2e9ef4, #484e50, #292d2e) draws it always. Only after a split key, until the focus leaves or the split happens: an indicator always on, judged live, said more than it helped. Reason (c). |
| L5 | Gaps (`gapsInner`, `gapsOuter`) | 2 px between, none more at the edges | ≠ | i3: 0 and 0 (`config.c:222-226`). Reason (c): **judged live**, after living with them on large and small screens |
| L6 | `hide_edge_borders`, `smart_gaps` (i3's `smart_borders` is a deprecated alias of `hide_edge_borders smart \| smart_no_gaps`) | `hideEdgeBorders` (`none` default): `smart` draws no ring on a workspace with one visible tiling window, and its tile leaves no room for it; `smart_no_gaps` the same when that workspace has no outer gap; `vertical`, `horizontal`, `both` leave out the ring's left and right, top and bottom, or all sides where the window's tile is at the root's edge and the inner gap is 0 (i3's `con_adjacent_borders`, `con.c:1902`, on the rendered rects: an outer gap moves the workspace's rect, an inner gap moves the window off it). `smartGaps`: §6. Floating windows never | ≠ | i3's `con_border_style` (`con.c:1821-1879`). `vertical`, `horizontal`, `both` leave a strip of the ring's width where the side was: ≠, reason (a), KWin's tiles have one padding for all sides and a root inside its output. `smart` counts visible windows as i3 (`con.c:1827-1828`): a group's hidden tabs don't count |
| L7 | A window's own look (i3's `border normal \| pixel N \| none`, `border toggle`, `for_window … border`) | one look for all tiling windows | ≠ | kept: no command language (§8 K22), and §3 R9's criteria set floating only. Reason (d). |
| L8 | `titlebars`: maximize button, title-bar double-click | nothing | + | the tree places it, as sway |
| L9 | Rounded corners (`roundedCorners`) | on: Breeze's 5 px on tiling framed windows; a group's topmost bar has its two top corners rounded as the ring's outer ones, and its bottom corners fill the notches down to a rounded ring right under them, in the colour of the tab above (not in the title-bar look, where the bar stays square) | ≠ | i3 has square corners. **Kept**: rounded by default, square a choice (the setting off): the floating windows around them are Breeze's, rounded. Reason (b). |
| L10 | A floating window, alone in its floating container | its own decoration (KWin's title bar and border) | ≠ | i3 gives a window that floated by itself (a dialog, a rule) its `default_floating_border normal 2`, and one floated by Floating Toggle keeps its tiling border (`floating.c:354-356`: only when the float is automatic). Here Plasma's title bar either way, reason (b), as L1: a floating window is moved and resized as Plasma's (`plan.md` "The mouse") |
| L10a | A window inside a split or group floated whole | the tiling look (L1-L9: the ring, the title bars by the look setting, a group's bar) | = | i3's `floating_enable` changes the border only of what it floats, and only when the float is automatic (`floating.c:354-355`): the windows inside keep their tiling border, and `render_con` lays the floating container out as any tiled container. L10's reason (b) is a Plasma user's one floating window; a floated split is i3's alone (`OPEN.md` item 73) |
| L11 | A floating window's ring (`frameOnFloating`, off) | L3's classes: `focused`, else `unfocused` (i3's would be `focused_inactive`, left out as L3); no indicator | ≠ | i3's `x.c`. `frameFloatingActive` and `frameFloatingInactive` are no longer read; by default (`frameOnFloating` off) a floating window keeps Plasma's styling, its title bar and no ring. Reason (b). |
| L12 | Floating above tiling | kept above, on every workspace (kwin-i3 owns Keep Above) | = | i3 keeps floating windows above tiling ones. Keep Below overwritten: + |
| L13 | No ring on a fullscreen window | none | = | i3 draws no border on a fullscreen window |
| L14 | No ring on a minimized window, or on a floating one with a client-side decoration (a tiling one is framed like any other) | none | + | i3 refuses minimize; it borders every window, as X11 apps there draw no shadow |
| L15 | Colours, width | colours forced opaque; width 1-10 | + | |
| L16 | The hold: windows that change together switch in one frame | `kwini3hold` | + | i3 has no compositor and draws one tree at once; the hold gives that on KWin |
| L17 | Without the effect | every tiling window keeps its title bar | + | |
| L18 | A window opening under Glide (Plasma's Animations page; not the default, Scale is) | no ring until Glide's animation ends, then the ring at once | + | Glide tilts the window on its own quads, which a ring drawn from the paint data can't follow (`docs/kwin-notes.md`, "Plugins and effects"); a window the hold catches mid-animation keeps a flat ring for those frames |

### Tiling windows

`tiledLook`, with the effect loaded:

- `frame` (default): no title bar; the effect draws a ring `frameWidth` px outside the window, in
  its colour class's colour (L3) with the indicator side, after a split key, in the class's indicator colour (L4), and
  the tiles leave room for it;
- `titlebars`: the window's own decoration; its maximize button and a title-bar double-click do
  nothing, as in sway (the tree places it). In a tabbed or stacked group showing its bar, none:
  the tab is the window's title bar, as in i3, where the tab is the child's decoration;
- `bare`: no title bar and no ring (nothing marks the focused window; the page suggests Dim
  Inactive).

The ring is drawn at the output's edges too (i3's `hide_edge_borders none`), unless
`hideEdgeBorders` says otherwise (L6). What the effect is told: `SetRing(id, class, indicator,
hidden sides)` for each window on a shown workspace at the end of a pass, when it changes;
`SetTiledRing` for `tiledLook`; the effect reads the colours from kwinrc itself.

**Without the effect**, every tiling window keeps its title bar. **Rounded corners**
(`roundedCorners`, default on): the effect gives tiling framed windows Breeze's 5 px radius, in
`frame` and `bare`; it resets only radii it set itself.

kwin-i3 takes a tiling window's border by setting `noBorder`, and gives it back when the window
floats (unless `frameOnFloating`: then a floating window's border is taken too), leaves the tree, closes or kwin-i3 releases. It doesn't take the border of a window whose
decoration is its own (client-side), and records a window already without a border so it can be
given back. It reasserts this every pass (the window menu, `borderlessMaximizedWindows`), and at
once when the window menu's No Border or Keep Above flips the flag on a window of the tree (on
Wayland, once the title bar has come back: KWin adds it at the app's answer to the configure).
A title bar that hasn't landed yet when a pass wants it gone (a window floated and tiled again
before its app answered) is taken when it lands (probe 98).

### Floating windows

- Keep their own decoration. With `frameOnFloating`, their border is taken and the effect draws
  the ring in the colour classes (L11), except on a window that draws its own title bar: no
  border is taken, so no ring and no frame focus (`takeBorder`, `floatingFramed`).
- Are **kept above** tiling windows (kwin-i3 owns their Keep Above flag, including one left by a
  previous instance; L12). Keep Below is overwritten (`LATER.md` item 27).
- The effect knows which windows are floating (`SetFloating`), and which sit in a container
  floated whole (`SetFloated`); the set survives a script reload.

### The hold (atomic layout)

`kwini3hold`. When a tiling window on a visible workspace is about to
move or resize (in a tile, or in a container floated whole, T16: i3 renders its windows with the
rest of the tree, `x_push_changes`; so its resize by the helper, step by step, is held too), the effect snapshots it and draws the snapshot at the old place. Every other
window moving within 3 ms joins. When every held window's frame geometry equals what it was asked for, all
switch at once in one frame; after `holdTimeoutMs` (default 200, Sway's `txn_timeout_ms`) they switch regardless. A held
window that is no longer visible counts as settled.

- **A tiling window closing** stays drawn as it was: inside an open hold it joins it; otherwise it
  waits 20 ms for a neighbour to start moving, then goes. The effect grabs its close, so no close
  animation (Plasma's Scale) shrinks it meanwhile, nor after: as i3, a closed tiling window just goes.
- **A new normal window** (not a dialog, modal or transient) is hidden for up to 20 ms; if a tile
  places it, it joins the hold and appears at its place. If its app hasn't drawn the tile when the
  hold releases (a timeout), it stays hidden until it has, up to 1 s more, its tile empty meanwhile:
  shown sooner, KWin would draw it where it first put it, floating (i3 maps a new window already in
  its tile, `x.c:1107` then `:1156`).
- Direct scan-out is blocked while holding.
- The effect sits late in KWin's effect chain (90, after Slide's 50): the frame and a held snapshot
  move with whatever earlier effects do to the window (Slide's desktop switch, Scale's opening).
- `holdEnabled` off stops only the hold and the hiding; the ring, corners and drop indicator stay.

---

## 8. Keys

All keys are kglobalaccel shortcuts on component `kwin`, named `kwin-i3 <Action>`; the second key
of a pair has the key in its name (`kwin-i3 Focus Left (J)`), and Move to Workspace N is
`kwin-i3 Move to Workspace N (symbol)` (the id an install already holds its key under); a rebinding is kept by kglobalaccel.
Checked against i3 4.24's shipped config (`etc/config.keycodes`, what `i3-config-wizard` writes),
with `$mod` as the wizard's Win choice.

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**K. The keys**

| # | Action | Default | i3 | Note |
|---|---|---|---|---|
| K1 | The modifier | Meta | = | i3's wizard offers Win or Alt; Alt is Plasma's menu key |
| K2 | Focus Left / Down / Up / Right | Meta+Left Down Up Right, Meta+J K L ; | = | §2 `focusDir` |
| K3 | Move Left / Down / Up / Right | Meta+Shift+arrow, Meta+Shift+J K L, Meta+: | = | tiling: §2 `move`; floating: by `floatingStep` px (i3's 10 px) |
| K4 | Resize Mode (Meta+R), then Shrink Width / Grow Height / Shrink Height / Grow Width | Meta+R; in the mode J Left, K Down, L Up, ; Right, by key position (evdev code, no layout refit), on press and repeat; Return, Escape or Resize Mode's own key leave (Meta+R by default; the helper asks kglobalaccel for it at each entry, as i3's default config leaves on the key it enters by, `config.keycodes:180`); the four actions themselves unbound (a user who wants them flat binds them) | ≠ | i3's `mode "resize"` (`etc/config.keycodes`), in the helper (`plugin/resizemode.cpp`): its key filter sits ahead of KWin's global shortcuts only while the mode is on; Meta+R exactly, as i3 matches modifiers exactly (`bindings.c`), so Meta+Shift+R doesn't leave; every other key goes on, and kwin-i3's own keys do nothing meanwhile (`KEY … ignored: the resize mode is on`). ≠: **Plasma's shortcuts still run** (volume, screenshot, the launcher), where i3's mode leaves only its own keys bound and every other key reaches the window: reason (e), another component's shortcut stays its own (`philosophy.md`, Plasma does hardware and the rest). The screen locking doesn't leave the mode, as i3. The sign: a banner at the top of the tree's focused window (`SetFocused`), drawn by the effect (`SetMode`), in the frame's active colour, reading "Resize (Esc)", reason (b): i3's bar shows only the mode's name, `resize` (i3bar's binding mode button, `xcb.c:2172`), here with the way out. Tiling resizes by `resizeStep` % (i3's 10 ppt), floating by `floatingStep` px. Without the helper the key does nothing (§13) |
| K5 | Split H / Split V | Meta+H / Meta+V | = | |
| K6 | Toggle Split | Meta+E | = | `layout toggle split` |
| K7 | Layout Stacking, Layout Tabbed | Meta+S, Meta+W | = | `layout stacking`, `layout tabbed` (§2 T25). Meta+W is Plasma's Overview on a stock install: with the key override on (the default), Meta+W runs kwin-i3's (§8, "Shared keys"; the Overview stays on the top-left screen corner and Grid View on Meta+G) |
| K8 | Focus Parent | Meta+A | = | `focus parent` (§2 T27) |
| K9 | Floating Toggle | Meta+Shift+Space | = | |
| K10 | Focus Mode Toggle | Meta+Space | = | |
| K11 | Fullscreen | Meta+F | ≠ | KWin's Window Fullscreen; how it differs from i3's is §10. With a container focused (focus parent): its focused window, where i3 makes the container fullscreen; reason (a), KWin makes only a window fullscreen |
| K12 | Close | Meta+Shift+Q | = | KWin's Window Close: asks the window to close, as i3's `kill`. With a container focused (focus parent), every window in it; with a workspace, every window on it, floating ones too (`con_close`) |
| K13 | Workspace 1 … 10 | Meta+1 … Meta+0 | = | |
| K14 | Move to Workspace 1 … 10 | Meta+! @ # $ % ^ & * ( ) | = | the US Shift+digit symbols; refitted by position (below), as i3's `bindcode` |
| K15 | Reload Settings | Meta+Shift+C | ≠ | i3's `reload`. KWin's reconfigure, so all of KWin's settings are re-read: ≠ kept, it is the only way a script re-reads its own. Reason (a). |
| K16 | Restart (i3: Meta+Shift+R) | none | ≠ | i3's in-place restart, for a new binary; here an install reloads kwin-i3. **Kept**: none. Reason (d). |
| K17 | Exit | Meta+Shift+E | = | Leaving, Plasma's way, as `endSession` says (N22): `logout` (the default) Plasma's log out prompt (`org.kde.LogoutPrompt` `promptLogout`), its confirmation as `i3-nagbar`'s save that it goes ahead after 30 s; `shutdown` its shut down prompt (`promptShutDown`, the same countdown); `ask` its logout screen (`promptAll`, every choice, no countdown); `sleep` PowerDevil's `suspendToRam`, unasked. i3's exit ends the session because i3 is the session; inside Plasma, leaving has several forms, and picking one is still exit. |
| K18 | Terminal, Launcher | Meta+Return, Meta+D | ≠ | i3's `i3-sensible-terminal` and `dmenu_run`: Plasma's default terminal (kdeglobals' `TerminalService`, Konsole when unset), launched by the helper through kglobalaccel's `_launch` for its desktop file so it gets its own systemd scope, not KWin's (probe 92; without the helper the key does nothing, §13); KRunner (`org.kde.krunner.App` `display`). A Plasma default on Meta+D (Show Desktop, where set) loses to it with the key override on (§8). i3 starts its terminal with startup notification (`config.keycodes:51`), so its window opens on the workspace it was launched from (`manage.c:336`); here where the focus is when it maps: reason (d), the launch workspace (`plan.md` "Out"; `LATER.md` item 28) |
| K19 | Back-and-forth, next/prev, output moves (§4), the no-back-and-forth forms (S5), next and primary outputs (S8, S9), Focus Child (§2 T27a) | none | = | unbound in i3's config too |
| K20 | Release | Meta+Ctrl+Shift+Q | + | the safety valve (§12) |
| K21 | Dump State | none | + | `tools/capture`, on a key the user binds (README, Install step 6) |
| K22 | Any other command on a key (`bindsym`, arguments, `mode`, chains) | none | ≠ | kept: no command language, so a key's action takes no arguments, `mode` or chain (§4 S5, S8). Reason (d). |
| K23 | The volume and media keys (i3's config binds them to `pactl`) | Plasma's | ≠ | hardware is Plasma's (`plan.md` Out), and another component's shortcut stays its own: reasons (d), (e) |

- **Move Right's second key is Meta+:** because Shift+; arrives as `:`; Meta+Shift+; never fires.
- **Floating windows by key**: a move is refused only if the window would leave every output;
  crossing to another output joins the workspace visible there. A resize grows or shrinks to the
  right and down; a window that isn't resizable doesn't. A floating window that is fullscreen or
  maximized ignores these keys.
- **Debug actions** (`Selftest …`) are registered only when `debugLog` is on at load.

### Keyboard layouts

KWin matches a shortcut by the typed symbol, not the key's position. With the helper, the 40
position keys are refitted to the current layout at load, on every layout change and on the
script's `FitKeys`: Workspace 1-10, Move to Workspace 1-10, Focus Right (;), Move Right (:), and
the letters i3 binds by keycode: Focus and Move Left,
Down, Up (J K L), Split H, Split V, Toggle Split (E), Layout Stacking (S), Layout Tabbed (W), Focus Parent (A), Fullscreen (F), Resize Mode (R), Launcher
(D), Close (Shift+Q), Reload Settings (Shift+C), Exit (Shift+E). So on Dvorak or AZERTY the keys
keep their QWERTY places, as i3 4.24's `etc/config.keycodes` through `i3-config-wizard` gives them
(a shifted key types its Shift symbol where the place holds no letter: Close on Dvorak is
Meta+"). ≠ i3 in one point: the wizard fits once, at the first run; here every layout switch
refits, reason (a): KWin matches the current layout's symbol, and a fit done once breaks at the
first switch. A key is changed only if it still holds the US default or what the helper set
last (recorded in `~/.config/kwini3helperrc`, `[LayoutKeys]`); a key the user bound is theirs. A
key with no symbol on the layout is emptied. A key set by hand to the US default counts as kwin-i3's. One fit runs
at a time; a change during one queues another.

### Shared keys

**Which holder wins a shared key**: kglobalaccel gives the key to every action that asks
(`registerShortcut` never fails), and a press runs **the active holder registered first, ever**:
each action gets a serial at its first registration, kept across logins
(`~/.local/state/kglobalshortcutsstaterc`), and the lowest serial among the active holders runs
(kglobalacceld 6.7.5, `GlobalShortcutsRegistry::activeShortcutByKey`). So Plasma's own actions
beat kwin-i3's (live: Quick Tile Left 141, kwin-i3 Focus Left 504); an app installed after
kwin-i3 that asks for one of its keys loses to it; a holder that isn't active (its app not
running) doesn't block. `KGlobalAccel.action(key)` names the holder that runs.

**The key override** (`keysOverride`; the Keys tab's "On a key conflict, kwin-i3's key wins", on
by default). i3 grabs its own bound keys (`bindings.c:155`), so its binding runs whatever else
wants the key; so does kwin-i3's, the setting there for a user who wants Plasma's shortcut
instead (`plan.md`, "Keys and Plasma's shortcuts"). While on, every key one of kwin-i3's actions holds
runs that action, and no other holder's, with **no other shortcut changed**. The helper
(`plugin/keyoverride.h`) does it: a filter ahead of KWin's global shortcut filter triggers kwin-i3's
action on the press and lets the press on with its key changed to one no shortcut has, so
kglobalacceld runs nothing and its modifier-only state resets (Meta alone, the launcher, doesn't
fire on Meta's release, probe 92); a filter right after takes that press, its repeats and its
release, so no window sees them. kwin-i3's keys are the ones kglobalaccel holds for its actions now
(a key bound on the Keys tab, a layout refit), read again when a layout fit ends, on KWin's
reconfigure and when the page applies keys. Not while a window inhibits shortcuts (as KWin's own
filter), nor during Alt+Tab or the lock screen (their filters come first). An action gone (kwin-i3
unloaded) takes no key. Without the helper there is no override: a shared key runs its first
holder's. The tile editor's keys (KWin's Edit Tiles, Meta+T) are held the same way while the
override is on, with no action run (one kwin-i3 also binds runs kwin-i3's), so the editor never
changes the tiles kwin-i3 lays out; Plasma's shortcut is left as it is. kwin-i3 takes no key from
another shortcut.

---

## 9. The mouse

The helper (`plugin/tilingdrag.cpp`, `plugin/framefocus.cpp`) takes the presses; the script
decides (`startDrag`, `dropPlan`, `drop`, `startResize` in `src/kwin.js`, `src/tree.js`). Checked
against i3 4.24's `click.c` (`route_click`'s steps, numbered there), `tiling_drag.c`, `drag.c`
(`drag_pointer`) and `resize.c` (`resize_graphical_handler`).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**G. Tiling drag (i3's `tiling_drag`)**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| G1 | Meta+left anywhere in a tiling window | the drag starts at once, **without activating** the window; after the drop the focus stays where it was unless the dragged window had it (`Tree.drop`) | = | i3 starts the drag before it focuses anything (step 2 before 3; `tiling_drag`, `set_focus`). A title-bar drag still activates first (step 3 then 8). Any further modifier held is a Meta press too, as i3's `(state & mod) == mod` (`click.c:166`): Meta+Ctrl+left drags. Meta+Shift+left is the float modifier instead (G5, G13) |
| G2 | Left on a tiling window's title bar (the title-bar look), no modifier | activated and raised as KWin's title-bar click; the drag starts after the **drag distance**; a title-bar button keeps its click | ≠ | i3: focuses (step 3), then drags after **15 logical px** in a straight line (`drag.c`, `threshold_exceeded`); here Plasma's drag distance (System Settings, default 10 px), measured along the axes added together. **Kept**: Plasma's own setting, so it follows what the user set. Reason (e). |
| G3 | Which presses start a drag | `tilingDrag`: `modifier titlebar` (default, i3's shipped config), `modifier`, `titlebar`, `off`; read by the helper from kwinrc. A Meta press the setting leaves out still activates and is swallowed on a tiling window; a Meta+Shift press it leaves out goes to the app, the float modifier's included (G5, G13); floating windows are otherwise KWin's (F1) | ≠ | i3's `tiling_drag` (=); i3 replays the left-out press to the app (`click.c`, `allow_replay_pointer`), as here with Meta+Shift. Meta's swallowed for G4's reason: KWin's window-action filter runs after the helper's, and a Meta press let through would be KWin's move, floating the window, reason (a); KWin's action fires on Meta alone (6.7.5 `input.cpp:1299`), so Meta+Shift's needn't be |
| G4 | Nowhere to drop (`has_drop_targets`: fewer than two tiling windows and empty visible workspaces, all outputs counted) | no drag; a Meta press is **swallowed**; a press with more than Meta (Meta+Shift, Meta+Ctrl) goes to the app, KWin activating the window | ≠ | the count is i3's (=, `click.c:254`), told to the helper after each pass (`SetDropTargets`). This is the tiling drag's; G5's and G16's floats need no target. For the float modifier's tiling drag (G13) one target is enough (`SetFloatDropTargets`), and with none its press goes to the app. i3 then focuses the window and passes the press on to the app (steps 3 and 10, `allow_replay_pointer`), as here with more than Meta. Meta alone: reason (a), KWin's window-action filter runs after the helper's, so a Meta press let through would be KWin's move, floating the window |
| G5 | Meta+Shift+left on a tiling window (one KWin can move) | **floats it**, Shift being the float modifier (inside a container selected with focus parent, the container whole: G16): KWin's own move, started by the helper, pulls it out of its tile, and it floats where dropped. **That move runs without Shift**: Shift held during a KWin move is its drop into a custom tile (6.7.5 `window.cpp:1245` draws an outline over each tile passed, `:1108` tiles the window at a release with Shift down), and every kwin-i3 tiling window sits in one; the helper's `TilingDragFloat`, just ahead of KWin's move filter, passes the move's motions, keys and release with Shift taken out. It is the one move X5 lets through. **Escape** puts the window back in its place, tiled, with every share as it was, as every drag's cancel reverts (the place is its neighbour in its parent; were it alone there, it comes back where the Floating Toggle would put it). With `tilingDrag`'s `modifier` left out, the app's (G3). **Once per press of the keys**: once a Meta+Shift+left press is taken, this or G13's, another does nothing until Meta or Shift is released, so the window just changed, still under the pointer, isn't changed straight back. A window KWin won't move: the tiling drag of G1 | + | i3 changes no window's kind by the mouse (`click.c:251`, only `floating toggle` or a rule does), and its Shift there is the swap modifier (`tiling_drag swap_modifier`, `tiling_drag.c:341`), out of scope here: G11's Swap band swaps at every centre drop. Reason (c), judged live: with Meta and Shift the mouse alone moves, swaps, groups, floats and tiles (`plan.md` "The mouse") |
| G6 | While dragging | the effect draws the drop indicator, the cursor is the move cursor, the pointer reaches no window and focus doesn't follow it | = | i3 masks enter events and maps an indicator window with the move cursor. The indicator's colour, `frameActive` at half opacity (i3: `client.focused.indicator`, opaque), is §7's |
| G7 | How a drag ends | **any button's release** drops at the pointer (another button's press is swallowed); **any key press** cancels and the key goes on (its binding still runs): a key filter ahead of KWin's shortcuts, installed while a press is held (`TilingDragKeys`); **a window closing on the focused workspace** ends it at once and drops where the pointer last was (kwin-i3 tells the helper `Cancel`, then drops), unless the dragged window or the target is the one closing; **a release taken before the helper** (the lock screen, a screen edge) cancels at the next motion or press, which KWin reports with the button no longer held, so the pointer is never left grabbed | = | i3 4.24 drops on any button's release (`drag.c:67-69`; i3's `next` branch only on the drag button's), and its grab hides another button's press, as here; a key is `DRAG_REVERT` (`:70-73`), as here; an unmap on the focused workspace is `DRAG_ABORT` (`:76-87`), no revert, so the drop happens at the last target if it exists (`tiling_drag.c:325`). Z7's resize the same |
| G8 | What is under the pointer (`find_drop_target`) | the tiling windows of every visible workspace, any output, not under another's fullscreen, never a window inside a floating container (`is_tiling_drop_target`); over no window (a gap), **the focused tiling window of the workspace shown there**, else that workspace if empty | ≠ | Reason (f), twice. Over a gap the pointer is outside that window, and which side it lands on is judged from the pointer: i3's `drag_callback` takes the pointer's distance to each side as unsigned (`uint32_t`, `tiling_drag.c:195-199`), which wraps when the pointer is outside the target. And i3's `is_tiling_drop_target` (`tiling_drag.c:14-34`) means tiling targets, but `con_is_floating` is true of a floating container's direct child alone, so a window deeper in a floated split passes and a drop would change its kind |
| G9 | Where on the target (`drag_callback`) | within 30 % of its smaller side (at least 2 px) of an edge: beside it on that side; within the **parent strip** (50 px, capped 1 px inside the side zone) on a side its parent shares: beside the highest ancestor on that side; else the centre, at most 1.25 times as tall as wide and as wide as tall, in the window's middle: on a narrow or a flat window what lies beyond it is beside the window that way, the indicator reaching the centre | ≠ | i3's parent strip is `render_deco_height()` + 5 px, about 25: too thin to notice or hit with a mouse, and it is the only way out of a tabbed group by drag (its sides join the group); reason (c), judged live. Dropped onto itself: only a parent drop does anything. The centre's cap: i3's centre on a tall narrow window is a column and on a flat wide one a strip, which cut in three by G11 read badly; reason (c), judged live |
| G10 | A side or parent drop | as i3: a split where the orientation differs (or the two-window parent flips), then inserted; a parent drop moves it out with i3's move | = | `DT_SIBLING`, `DT_PARENT` |
| G11 | A centre drop onto a window | outside a tabbed or stacked container, the centre is three bands of equal height, each kept on a small window: the **top** makes the two a tabbed group, the **middle** a stacked one (the dragged window after the target and shown; two windows alone in a split turn that split instead of being wrapped), the **bottom** swaps them (for a floating window or container being tiled, G13, it puts the dropped one after the target: Beside); with the plugins the whole centre is drawn as one rounded outline cut in three, the third under the pointer filled as the indicator, each with a small picture of its result and its name (Tabbed, Stacked, Swap or Beside). Onto a window in a group: it joins the group, after that window. Onto an empty workspace it moves there | ≠ | i3 moves it after the target (`con_move_to_target`), which joins a group and is a side drop elsewhere, and swaps with the swap modifier; it never makes a group by dragging. Reason (c), judged live, a mouse feature for the Plasma audience: making a group needs no key |
| G12 | The dragged window fullscreen | it leaves fullscreen for the drop and gets it back, unless the target workspace has a fullscreen window and it didn't have focus | = | the end of `tiling_drag` |
| G13 | Meta+Shift+left on a floating window of kwin-i3's (not fullscreen), or on a window of a container floated whole | **tiles it**: a tiling drag (G1, G6-G10, G12) of the window, or of the container whole, which stays where it is until the drop. At the drop it is tiled (as the Floating Toggle: a sticky window unstuck, the floating look gone) and placed, in one step: the centre's top and middle bands group it (G11), the bottom one (Beside) puts it after the target, no swap. A drop that can't land (a centre drop the workspace's fullscreen focus refuses) leaves it floating where it was, as do a cancel and a release over no target. With `tilingDrag`'s `modifier` left out, or nowhere to drop (one target is enough, G4), the app's. Once per press of the keys (G5). A floated container down to one window is that window's | + | i3 never tiles by dragging (`click.c:251-258`, `!floatingcon`; `tiling_drag.c:340-360` has no `floating_disable`); the tiling step is `floating_disable` (`floating.c:420-448`). Beside, not a swap: after tiling, a swap would send the target to the tiles' focus, nowhere the reader chose. A container moves whole under Meta (F1a), so Meta+Shift tiles it whole, as the Floating Toggle on the container does (T16); the Floating Toggle on one of its windows floats that window out alone instead, the one place the drag and the key differ (`plan.md` "The mouse"). G5's reason (c) |
| G14 | A press on a group's **bar** (with the plugins), over no other window, any modifiers | as i3's `route_click` on a decoration, the tab's container (a split tab whole): **Meta+left** (Meta+Shift+left too: on a bar Shift changes nothing) with `tilingDrag`'s `modifier`: a tiling drag of that tab at once, nothing focused (G1); **any other press** (any button, i3's `click.c:261-275`) focuses by i3's tab rule (that tab's focused window; when the focus is inside that tab already, the tab itself, a group of windows chosen by a second click; a click on the tab focused that way focuses its window again), then: a left press with `tilingDrag`'s `titlebar`, past the drag distance, a tiling drag of that tab (with Meta, at once); else, and for every right press, a resize against the neighbour above (Z5-Z7), nothing if there is none; another button, the focus only. A split tab dropped onto one of its own windows: nothing (`hasParent`) | ≠ | i3's steps 2, 3, 8 and 10 (`click.c:251-256`, `:260-275`, `:331-341`, `:355-358`; `:432-437` route a tab's press to its con). i3 waits for its threshold before a decoration's resize only if the tab wasn't focused (`click.c:302`, `:358`); here always: the helper decides at the press, and the focus is the tree's (reason (a), as G4). The right press is i3's, not Z4's window menu: the bar is kwin-i3's, not KWin's title bar (`plan.md` "The mouse") |
| G15 | Scroll over a group's bar | the next (down, right) or previous (up, left) tab's focused window, any modifier held; none past the ends; one tab a wheel notch, a touchpad's scroll adding up to a notch's distance as X's wheel buttons do | = | `route_click` step 1 (`click.c:232-247`), `get_tree_next_sibling`, before any modifier is looked at |
| G16 | Meta+Shift+left on a window of the selected container (a tiled container focused by focus parent, Meta+A) | **floats the container whole**, as Meta+Shift+Space would (T16): a drag that moves nothing while it lasts, an outline (as F1b's) showing the container at its current size following the pointer, unbounded, as a floated container's move; the outline is the container as drawn, the bars of groups inside it included. At the release the container floats whole at the outline, keeping its size, laid out inside as a floated container is (L10a: no gaps inside), the focus staying on it. A press moved less than 10 px floats nothing; any key cancels, Escape too, nothing changed; a window of it closing mid-drag floats what is left. The press keeps the selection: no "Window Pressed" is told (B3); with focus follows mouse, entering another window first collapses it, as in i3 (B1). A container of one window is that window's (G5). With `tilingDrag`'s `modifier` left out the press is the app's, and on a fullscreen member, over a bar or a floated window it is that press's as before; each of these, as B3 says, collapses the selection to the pressed window. A selection that changed since the helper was told refuses the drag (logged). Once per press of the keys (G5). Plain Meta+left on a member stays the window's (G1). Floated, it is Meta+dragged and resized whole (F1a), and Meta+Shift+Space tiles it (T16) | + | i3 floats only by command (`floating_enable` of the focused container, `floating.c:233-342`); its tiling drag drags the clicked con and moves nothing until the release (`tiling_drag.c`), as this drag. The rect is the container as it is, not Meta+Shift+Space's (own sizes, centred, T16): a drag places what is seen. Dropped over another output, it floats on that output's shown workspace, as a floated container moved there (F1a). G5's reason (c): Meta+Shift does with the mouse what Meta+Shift+Space does with the keys |

**Z. Tiling resize (Meta+right-drag)**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| Z1 | Meta+right in a tiling window | activated; **the nearest edge** is resized, against the nearest ancestor with a sibling on that side (climbing, as `resize_find_tiling_participants`, `resize.c:72-120`); nothing if none has, or at a tie (the press swallowed) | = | i3's `floating_mod_on_tiled_client` (a press nearer the screen's edge than the boundary does nothing). Extra modifiers held: as G1 |
| Z2 | Meta+right in the gap, within half the inner gap + 1 px of a tiling window, or on its ring | as Z1, on the nearest tiling window | ≠ | i3's gap is the root window, where a press focuses that output's workspace (`click.c:398-415`). Reason (c), judged live: a press anywhere near the edge should resize |
| Z3 | **Left or right press on the ring** (i3's border), no modifier | activated and raised (F3), and a drag resizes against the neighbour on **the side pressed** (top, then left, right, bottom at a corner), at the release as Z5-Z7; no neighbour on that side: only the activation | = | i3's `tiling_resize`, `CLICK_BORDER`. The ring is the target, 1 px at the default width; the helper's `pressRing` reports the side with the press. Also over a tiled window's own input area past its frame (an app drawing its own frame, VS Code: an invisible resize border, kept since KWin reports no tiled edges for a padded tile, `tile.cpp` `Tile::anchors`): the ring is Z3, never the app's resize, which KWin ran as its live tile resize |
| Z3b | **A plain left or right press in the gap** (over the desktop or such a margin), within Z2's reach | as on the nearest tiling window's ring (Z3), on its side facing the press; the gap is a handle, not desktop | ≠ | as Z2: i3's root click focuses the output (`click.c:398-415`); reason (c), judged live |
| Z4 | Right press on a tiling window's title bar (title-bar look); or a left press there with no drag | KWin's: the window menu; the title-bar click | ≠ | i3 resizes against the neighbour above (`CLICK_DECORATION`, `BORDER_TOP`). **Kept**: the window menu is how Plasma reaches its window actions (keep above, KWin rules, activities), which i3 has none of. Reason (e). |
| Z5 | While resizing | the pointer is warped onto the boundary (the middle of the gap between the two descended-focused leaves), the cursor shows the direction, a 2 px bar follows the pointer; nothing moves until release | ≠ | `resize_graphical_handler`. The bar stays within both participants' minimum sizes: ≠ kept, KWin's tiles refuse a tile below its window's minimum (i3 keeps it 25 px inside the output). Reason (a). |
| Z6 | A fullscreen window on the workspace | refused | = | i3 refuses between containers of different fullscreen modes, which is the same here: the fullscreen window covers the rest |
| Z7 | Release | the two shares change by the distance (`resize_neighboring_cons`); if the layout changed meanwhile, nothing. Ending otherwise: as G7 (any key cancels, any release drops, a close on the focused workspace ends it and resizes from where the pointer last was, unless a participant is the one closing) | = | as G7 (`resize.c:274` reverts only on `DRAG_REVERT`); the layout check is + (KWin's tiles are rewritten under the drag, reason (a)) |
| Z8 | A drag on a tiling window's edge in the title-bar look (KWin's resize) | KWin resizes, and the result is read back into the shares (§6) | + | |
| Z9 | **The gaps are kwin-i3's** (the pointer over a gap or a ring, anywhere between tiled windows and at the outer edges, within Z2's reach) | the arrow; a press there is Z2/Z3's, never an app's: transparent strips of kwini3helper's own (`gapstrips.h`) cover the gaps, above every app's invisible resize band (VS Code's default title bar, Chromium, Electron, GTK header bars hold the pointer up to 10 px past their frame); never over a floating window, panel, popup or notification, none on an output with a fullscreen window. A tiling window under the pointer is raised among the tiling ones (invisible; floating windows stay above; the raise asks its focus too, B1), so a neighbour's band can't take its own frame's pixels; a plain press there before the raise lands does nothing, and a Meta press goes to the window whose frame holds the point (`frameOwner`) | = | i3 reparents each client into its frame window (`manage.c:557`): clipped by X11, no client takes a pixel of the gap, the arrow on frames and root (`x.c:171`), a resize cursor only once a resize has started (`resize.c:238`). |

**F. Floating windows, the ring, and the rest**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| F1 | A floating window | KWin's own: the modifier (Meta by default) and left activates, raises and moves (Meta+Shift+left tiles it, G13), Meta+right resizes, the title bar moves, the edges resize, Meta+middle raises or lowers; a click raises | ≠ | i3's `floating_modifier` drag focuses and moves (`click.c`, step 3): kwin-i3 wins the left drag's action at runtime (KWin's `commandAll1` "Activate, raise and move", `winOptions`); the modifier stays Plasma's setting, as i3's `floating_modifier` is the user's. Differences kept, as Plasma's (KWin's window actions): i3's Meta+Shift+right keeps the proportions and its title-bar right press resizes, where KWin opens the window menu; on KWin 6.7 Meta+right resizes without focusing. **Kept**: one floating window is KWin's (`plan.md` "The mouse", reason (e)) |
| F1a | A split or a group floated whole (T16) | kwin-i3's, by the helper: Meta+left moves it whole (Meta+Shift+left tiles it whole, G13; with `tilingDrag`'s `modifier` left out, that press is the app's) and Meta+right resizes it whole from the corner nearest the press (an outline while it lasts, F1b); a title-bar press resizes against the neighbour above, else moves it whole; a press on a floated group's bar focuses the tab (G14's rule), then Meta+left (Shift or not) moves the container whole and Meta+right resizes it whole, and a plain press resizes against the neighbour above inside it, else a right press resizes it whole and a left one moves it, with no tiling drag; the bar takes its presses over whatever lies beneath the container, a window stacked above it keeping them; a left or right press on a window's ring resizes against its neighbour on that side inside the container, else (the container's outer ring) resizes the whole from the corner nearest the press; a press raises the whole container; the drag shows i3's cursor, the move's or the diagonal of the corner a resize moves (`floating.c:606`, `:719-722`), and a floated group's bar keeps to its window's width; a client's own move request (a header bar) is refused; Escape or a key puts it back | = | i3's `route_click` (`click.c`, steps 3, 5-7), `floating_drag_window`, `floating_resize_window`; `handlers.c:936` refuses `_NET_WM_MOVERESIZE` on a window whose own con isn't floating. KWin moves and resizes one window, never several (reason (a)), so the helper does it, each motion placing every window, and kwin-i3 reads the rect back at the release. Each window's ring is inside its share of the rect, as i3's border inside its con, so it lies over whatever is beneath the container and is found from the top of the stacking order |
| F1b | A move or resize of a container floated whole (F1a), with the effect drawing | **an outline only while it lasts**: the container as drawn (its windows and its groups' bars), its edge 2 px in the indicator's colour, nothing inside, follows the pointer; at the release the windows are placed once, where the outline is; Escape or a key leaves them where they were. The outline goes once the pass has laid them out, and by itself 500 ms after the drag's last renewal (no end can leave it). Without the effect, the windows step together as before. A single floating window keeps KWin's live move and resize (F1) | ≠ | i3 moves and resizes a floating container live (`floating_drag_window`, `floating_resize_window`): on X11 the container is one frame. Here each window is its own surface: a resize reconfigures every client at every step, reason (a), rough on real hardware; the move, reason (c), judged live: one way for both, and calmer for a large container. The places come from the helper (`GroupPlaced`), not the frames, which a client may not have committed yet |
| F2 | Hovering the ring, focus follows mouse | focuses its window (KWin's delay) | = | The ring is its window's, as i3's border |
| F3 | A click on the ring | activates and raises the window as KWin's window-click commands say; swallowed | = | i3 focuses on a border press (step 3). With Z3 decided, a drag resizes |
| F4 | A scroll on the ring, no modifier | focuses the window (activated); swallowed | = | i3's step 3 on a border |
| F5 | A modified click on the ring (Meta+drag) | passes on, to G1, Z2 | + | |
| F6 | Floating windows' rings | count for F2-F5 only with `frameOnFloating` | + | |
| F7 | Mouse bindings (i3's `bindsym button1`, `--whole-window`, `--border`, `--release`) | none | ≠ | KWin's window actions (System Settings) set what Meta+buttons do; the left drag's action is kwin-i3's while it runs (F1). **Kept**: none; i3's are commands bound to buttons, and kwin-i3 has no command language (§8: a key takes no arguments). Reason (d). |
| F8 | No drag or resize starts while a game holds the pointer or shortcuts are inhibited | the press is the app's | + | |
| F8b | A window Show Desktop hides (Plasma's edit mode turns it on), or one on another activity | has no ring, frame or gap: a click or hover where it sits reaches what is shown there (KWin's `isShown`, not `isHidden`, which leaves Show Desktop out) | = | i3 routes clicks to mapped windows only |
| F9 | **Without the helper** | Meta+drag is KWin's own move: the window leaves its tile and floats where dropped | + | |
| F10 | **Popup grace**: a panel popup active | KWin's focus delay is 1.5 s, so crossing the gap between a floating panel and its popup doesn't focus the window beneath (KDE bug 511162); any other activation puts back kwin-i3's: none with `focusFollowsMouse` on (B1), else Plasma's `DelayFocusInterval`, read fresh from kwinrc (KWin's default, 300 ms, when the key isn't there) | + | i3's popups grab the pointer (§5 B7) |

---

## 10. Edge cases

Checked against i3 4.24's `con.c` (`con_enable_fullscreen`, `con_get_fullscreen_con`) and
`handlers.c` (client messages: fullscreen, desktop, iconic).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**V. Fullscreen, minimize, maximize, KWin's own tools**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| V1 | A window goes fullscreen (Meta+F is KWin's, or the app asks) | it stays in the tree and covers its output, panels too; KWin takes it out of its tile, and its place is kept as an empty tile, its siblings keeping their sizes behind it; it gets the focus if its workspace is the focused one (an app going fullscreen on its own included); it rejoins when fullscreen ends. No ring, no gaps | = | i3's `fullscreen` (`CF_OUTPUT`): the container keeps its place, covers the output and the bar, gets the focus (`con_enable_fullscreen`, `con.c:1286`) unless it is on another workspace (`:1287-1289`), no border; its siblings keep their rects (`render.c:127-144` renders it alone and returns) |
| V2 | A second window goes fullscreen on the same workspace | the first one's fullscreen ends, in the model and then in KWin: the pass ends KWin's fullscreen of any window the tree doesn't hold fullscreen (`endFullscreen`; also after a move brings a fullscreen window where one is, T10, T24) | = | "disable any fullscreen container that would conflict" (`con_enable_fullscreen`, `con.c:1269-1276`). KWin itself allows several |
| V3 | Fullscreen across all outputs (i3's `fullscreen enable global`) | none | ≠ | reason (a): KWin's fullscreen is one output's area |
| V4 | A floating window fullscreen (a game, `mpv --fs`) | its workspace's fullscreen window, as a tiling one; a tiling one at the top level wins a tie. Inside a split or group floated whole (T16): the container's other windows keep their places, the fullscreen window keeping its share, and it comes back to it | = | `con_get_fullscreen_con` searches the floating windows too; `render_con` renders the fullscreen con alone and returns (`render.c:127-144`), its siblings keeping their rects |
| V5 | A fullscreen window floated or tiled again, or moved | it stays fullscreen; focus and moves across it are blocked (§2, §5) | = | |
| V6 | A new window on a workspace with a fullscreen window | `popupDuringFullscreen`: `smart` (default), `ignore`, `leave_fullscreen`, `all`, as §5 C5 says | ≠ | i3's setting and values; the fullscreen window's own modal dialog takes the focus under `ignore` too (C5: KWin's modal rule). Reason (a). |
| V6b | The other windows of a workspace with a fullscreen window, tiling or floating | an activation of one by KWin (Alt+Tab, the task manager, an app's request KWin lets through) ends the fullscreen and focuses it (`unblocksFullscreen`, the model's `activateUnblock`); the focus mode toggle the same. Not KWin's pick at a close (C7 decides), not a window still opening (adopted since the last pass: KWin's second activation of a newcomer is C5's, `opening`), and not the fullscreen window's own modal dialog, which KWin activates in its parent's place (KWin's modal rule, C5): reason (a). A floating window is never drawn over a fullscreen one meanwhile, but by `popupDuringFullscreen` (C5) | ≠ | i3's `con_activate_unblock` (`con.c:302-309`): a pager's request and an app's under `focus_on_window_activation smart` on a visible workspace (`handlers.c:782-804`), and `focus mode_toggle` (`commands.c:1421`); its focus commands won't pass a fullscreen window (`con_fullscreen_permits_focusing`, T22). Drawing: `render.c:253-270`. ≠ only in the modal dialog, reason (a) |
| V7 | Minimize | out of the layout, its share to its siblings; back where it was when restored (the leaf stays in the tree, marked `_` in the tree log); never the focus's choice (§5 C9), never what a move swaps with or counts as company (a window whose other siblings are all minimized moves as a lone child, T10), and no part of a resize's shares; a close that leaves a split holding only minimized windows sends the focus on up, as from that split. Across a reload without the plugins a minimized window loses its place (P3) | ≠ | i3 rejects a minimize, whoever asks, a taskbar included (`handlers.c:849-858`, `WM_CHANGE_STATE` iconic reset to normal). Reason (g): Plasma's minimize and restore are the user's. Its nearest i3 shape is the scratchpad's, which leaves the layout too, though `scratchpad show` brings the window back floating (`scratchpad.c`); the scratchpad itself is out (`plan.md`). |
| V8 | Maximize | no handler: it leaves its tile, the next pass puts it back, and that clears the maximize | = | i3 has no maximize and ignores the request |
| V9 | A window moved to another desktop by someone else (Overview, a window rule, KWin's Move to Screen) | kwin-i3 follows: a move to that workspace | = | i3 moves the window on `_NET_WM_DESKTOP`. Not the window's own move (V11) |
| V10 | A window put on all desktops, or on two (outside kwin-i3's own relocate) | all: sticky floating (§3 R3, X4), an already floating one too; two: leaves the tree until it is on one (R13) | ≠ | i3 floats it and makes it sticky only if `floating_enable` succeeds (`handlers.c:890-895`), so an already floating window isn't made sticky (X4 is this row's tiling half). Reason (a): KWin applies the request itself before kwin-i3 hears of it, so refusing it means undoing it, and KWin's own "On All Desktops" menu entry would snap back. |
| V11 | A tiling window resizes or moves itself; a fullscreen window, tiling or floating, moves itself | put back (§6); a move to another output that KWin answered with that output's desktop is not followed: it stays on its workspace | = | i3 ignores a tiling window's size and position requests (`handlers.c:302-448`: only a floating window or a dock moves). KWin runs an X11 client's own move only before the window's first tile (it ignores one from a window in a tile), and swaps its desktop for the new output's (`finishInteractiveOutputChange`); kwin-i3 puts both back (a game centring itself on the other monitor). A floating window's move is followed, as i3's `floating_maybe_reassign_ws`, except a fullscreen one's: i3 ignores every request of the fullscreen container (`handlers.c:347`). KWin refuses a fullscreen X11 window's ConfigureRequest but applies its `_NET_MOVERESIZE_WINDOW`, in a tile too when the window has no decoration; told from a user's Move to Screen by its frame, which then covers the new output (a client asking for exactly that rect is followed) |
| V12 | KWin's quick tile by key; Meta+T's tile editor; a drag out of a tile (a screen-edge drag included); a Shift-drag into KWin's tiles | a quick tile by key: pulled back into its tile; Meta+T held from the editor while the key override is on (§8), else the editor's tiles are overwritten on the next pass; screen-edge tiling and maximizing off while kwin-i3 runs (`winOptions`); a drag: refused with the helper (X5); **without the helper**, KWin untiles the window at the move's first step, so it floats (and a screen-edge drag then quick-tiles it, floating); the Shift-drag puts two windows in one tile until the next pass (`plan.md` "Plasma's window actions") | ≠ | i3 ignores a request that would place or size a tiling window (`handlers.c:722-723`, `:936`), as kwin-i3 does with the helper. The drag without it: reason (a), as X5 |
| V13 | A modal dialog | floats (§3); KWin moves it with its parent; kwin-i3 waits while either is dragged | + | |
| V14 | **An output returning to a fullscreen window on a hidden workspace** (known limit, accepted; fuzzer I9, seeds 214 and 28) | KWin asks the window to be fullscreen again and to move back, but a hidden window gets no frame callbacks, never acknowledges, and KWin applies nothing until it does. Meanwhile KWin calls it not resizable and refuses the tile, so kwin-i3 floats it where it stands, out of sight. Meta+Shift+N, or closing it, brings it back. The same holds for a hidden floating window smaller than KWin's 150 px decorated minimum | + | |

### Known limits

Accepted, as the code stands: facts about the behaviour, not a list of work.
One that should change becomes an `OPEN.md` or `LATER.md` item.

- **A desktop rebuild** (desktops removed or reordered, §4) rebuilds from KWin's tiles: a window
  that was never in a tile (sent to a hidden workspace) loses its place in its tree, and each
  workspace's focus history is lost. A window added in the moment before the rebuild comes back as
  if found at load.
- **A window adopted late** (it was kept out of the tree, or had no workspace, when it appeared, and a later
  change of class or title adopted it) is not handed back under a fullscreen window: it shows over
  it with the focus.
- **Keep Above as the floating mark**: a window kept out of the tree at first and adopted later
  with Keep Above set comes in floating where the rules would tile it; at a login, a window whose
  session restored Keep Above and that arrives after kwin-i3 loaded is tiled with the flag left
  on.
- **A rare wallpaper flash** for a few frames, after closing a tiling window beside another, at
  or after kwini3hold's release (i3 has it on every close: it pushes the new layout to X at once,
  `x_push_changes`, and nothing waits for the clients). Two causes, from captures: **a slow client** outlasting
  `holdTimeoutMs` (an Alacritty busy with a terminal UI took ~250 ms, the hold released at 200,
  the wallpaper showed for 37 ms), and, likely, **Firefox's content subsurface** resizing after its
  toplevel: the hold checks only the toplevel's frame geometry (Sway hit the same, Mozilla bug
  1585314). Accepted: 200 ms (Sway's) catches nearly every close cleanly, and
  longer would feel stale.
- **Frame focus** with `frameOnFloating` takes the clicks around any borderless normal window,
  including one the user made borderless: frame focus doesn't consult the floating set the
  helper's tiling drag is told.
  A floating window's border taken or given back may move it by the border's height (untested).
- **A minimum size set late** (some GTK and Electron clients after their first frame) is noticed at
  the next pass, not when it changes (`minSizeChanged` isn't connected).
- **Meta+drag out of a tile, without the helper**, floats the window only if KWin reports the drag
  started before the window left its tile; in the other order it is tiled again (never seen).
- **No output at all**: KWin puts a placeholder output in (`Workspace::updateOutputs`), so the code
  sees an ordinary output change: the workspaces move to it and back, as i3's root output
  (`plan.md` decision 10). Read from the source, not yet seen.
- **The workspace widget** on a thin panel with many workspaces in use has no overflow (each
  button shrinks to an 8 px floor; "Numbers only" helps); visible and focused workspaces differ only
  by their fill.
- **A window adopted late on a workspace with a `[workspace=…] floating enable` rule** (as above)
  opens tiling: only a window new to kwin-i3 takes the workspace's floating.
- **Keep Above is kwin-i3's on its windows**: a user's own Keep Above is cleared when the window is
  tiled, and unticking it on a floating window doesn't stick (won't-fix, i3 has no such flag;
  `LATER.md` item 27).
- **Release leaves the effect's floating marks**: after a release and a reload, the windows that
  were floating come back floating. The marks for a container floated whole (`SetFloated`)
  are cleared by Release.
- **After a reload a fullscreen window comes back at the end of its row** (accepted, pinned by a
  test). A fullscreen request not yet applied reads as a fixed
  size, so such a window opens floating.
- **A window kept out of the tree, quick-tiled by KWin into one of kwin-i3's tiles**, loses that
  tile at the next pass.
- **Internal, harmless**: each closed window leaves a small entry in the script's signal
  bookkeeping for the session; every key places all workspaces again (idempotent, but logged).

---

## 11. Settings

**Where they live**: kwinrc `[Script-kwin-i3]`. `src/settings.js` is the table (types, defaults,
ranges); `package/contents/config/main.xml` follows it (`tests/unit/` keeps the two together);
the settings page builds its config from `main.xml`, and is the one place to change them
(`philosophy.md`; KWin Scripts' cog opens it too, `package/metadata.json`). A value that doesn't parse
logs a `WARN` and uses the default.

**When a change applies**: the script reads its settings at load and at every KWin reconfigure.
The settings page sends one on Apply; after a hand edit of kwinrc, press Meta+Shift+C (i3's
reload). The plugins read kwinrc again on that reconfigure, and at once on a `--notify` write. On a reconfigure with changes: the rules reclassify every window
if a rule list changed, the ring is told if `tiledLook` changed, and every workspace is placed
again.

| setting | default | range | effect | applies |
|---|---|---|---|---|
| `gapsInner` | 2 | 0-100 | gap between tiling windows (even; an odd value counts as the one below) | next pass |
| `gapsOuter` | 0 | -100-200 | added at the output's edges; below 0 taken, down to half the inner gap (§6) | next pass |
| `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` | -1 | -1 (as `gapsOuter`), 0-200 | that edge's outer gap (i3's `gaps top` …; §6) | next pass |
| `workspaceGaps` | empty | `N gaps inner \| outer \| horizontal \| vertical \| top \| right \| bottom \| left M`, one per line or `;`- or `,`-separated, `workspace` optional | i3's `workspace N gaps …`: in place of the global gaps on that workspace, as i3; an outer M below 0 as `gapsOuter`'s (§6) | next pass |
| `smartGaps` | `off` | `off`, `on`, `inverse_outer` | i3's `smart_gaps` (§6) | next pass |
| `hideEdgeBorders` | `none` | `none`, `vertical`, `horizontal`, `both`, `smart`, `smart_no_gaps` | i3's `hide_edge_borders` (§7 L6) | next pass |
| `defaultOrientation` | `auto` | `auto`, `horizontal`, `vertical` | a new workspace's direction | new workspaces |
| `workspaceLayout` | `default` | `default`, `stacking`, `tabbed` | a new workspace's windows open in a stacked or tabbed group (§2 T25) | new workspaces |
| `resizeStep` | 10 | 1-50 % | resize by key, tiling | next press |
| `floatingStep` | 10 | 1-200 px | move and resize by key, floating | next press |
| `focusWrapping` | `yes` | `yes`, `no`, `force`, `workspace` | §2 | next press |
| `focusFollowsMouse` | true | true, false | §5 B1: the pointer entering a window focuses it at once (KWin's live options); false: click to focus | at once (a reconfigure) |
| `keysOverride` | true | true, false | §8 "Shared keys": kwin-i3's keys win a key a Plasma shortcut shares, and Meta+T is held from the tile editor (the helper) | at once |
| `mouseWarping` | `output` | `output`, `none` | §5 A2: the pointer follows the focus to another output, or never | next focus change |
| `tilingDrag` | `modifier titlebar` | `modifier titlebar`, `modifier`, `titlebar`, `off` | i3's `tiling_drag`: which presses start a tiling drag (§9 G3); read by the helper | the helper at once |
| `popupDuringFullscreen` | `smart` | `smart`, `ignore`, `leave_fullscreen`, `all` | §5 C5: what a new window may do on a workspace with a fullscreen window | new windows |
| `workspaceOutputs` | empty | `N=OUTPUT [OUTPUT …], …`, N 1-10 | workspace outputs, the first connected wins (§4 W5) | at login, when an output appears, and for a workspace first used after |
| `workspaceAutoBackAndForth` | off | | §4 | next press |
| `forWindow` | Spectacle, the password prompt, KRuler, plasmashell's Normal windows, the desktop portal's dialogs: `floating enable` | i3's `for_window` rules, one per line or `;`-separated (§3 R9) | the kinds | every rule anew on every window |
| `assign` | empty | i3's `assign` rules (§3 R19) | where a new window opens | new windows |
| `floatingMinimumSize` | `75x50` | `WxH`, 0 i3's default, -1 none | §3 R20 | a window becoming floating |
| `floatingMaximumSize` | `0x0` (all outputs together) | `WxH`, -1 none | §3 R20 | a window becoming floating |
| `tiledLook` | `frame` | `frame`, `titlebars`, `bare` | §7 | next pass |
| `frameWidth` | 1 | 1-10 px | the ring | next pass; the effect at once |
| `frameActive`, `frameInactive` | `#4c7899`, `#333333` | `#rrggbb` | the ring's colour classes, i3's `focused`, `unfocused` (§7 L3) | the effect at once |
| `frameIndicatorActive`, `frameIndicatorInactive` | `#3daee9`, empty | `#rrggbb`, or empty for the class's frame colour | the indicator side's colour per class (§7 L4) | the effect at once |
| `frameOnFloating` | off | | ring on floating windows, in the same classes (§7 L11) | next pass |
| `roundedCorners` | on | | §7 | the effect at once |
| `holdEnabled` | on | | §7 | the effect at once |
| `holdTimeoutMs` | 200 | 10-2000 ms | §7 | the effect at once |
| `endSession` | `logout` | `logout`, `sleep`, `shutdown`, `ask` | how Exit leaves (§8 K17) | next press |
| `debugLog` | off | | the D-Bus log, the debug actions; no control on either form | at once (debug actions: next load) |

The plugins accept any colour Qt parses; the script only `#rrggbb` (lowercased). A number out of
its range falls back to the default whole, in the script and the plugins alike (`frameWidth`,
`holdTimeoutMs`). A list skips a bad entry and keeps the rest.

**N. Against i3's config** (i3 4.24 `parser-specs/config.spec`, the full
list). Only the options that place, focus or look; `bar`, `exec`, `font`, `ipc-socket`,
`set`, `include` are Plasma's or have nothing to set.

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart

| # | i3 option | Here | i3 | Note |
|---|---|---|---|---|
| N1 | `gaps inner \| outer` | `gapsInner`, `gapsOuter` (outer added to inner at the edges, as i3) | = | the defaults differ: §7 L5 |
| N2 | `gaps horizontal \| vertical \| top \| right \| bottom \| left`, and `workspace N gaps …` | `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` (each `gapsOuter` unless set), and `workspaceGaps` in i3's words and meaning, in place of the global values (§6) | ≠ | as i3 but a negative edge: down to half the inner gap, reason (a) (§6); the per-side keys from 0 |
| N3 | `default_orientation` | `defaultOrientation` | = | |
| N4 | `workspace_layout default \| stacking \| tabbed` | `workspaceLayout`; Meta+W or Meta+S on an empty workspace sets it too (§2 T25) | = | |
| N5 | `focus_wrapping` | `focusWrapping` | = | |
| N6 | `focus_follows_mouse` | `focusFollowsMouse` (Tiling tab), won at runtime over KWin's focus policy | = | §5 B1 |
| N7 | `mouse_warping output \| none` | `mouseWarping`, `output` (default) or `none` (§5 A2) | = | |
| N8 | `focus_on_window_activation smart \| urgent \| focus \| none` | KWin's, with focus stealing prevention won at Low while kwin-i3 runs (a new window takes the focus) | ≠ | reason (a): §5 C4 |
| N9 | `popup_during_fullscreen` | `popupDuringFullscreen`: `smart`, `ignore`, `leave_fullscreen`, `all` (§5 C5, §10 V6) | ≠ | as i3 but a modal dialog: V6, reason (a) |
| N10 | `workspace_auto_back_and_forth` | `workspaceAutoBackAndForth` | = | |
| N11 | `workspace N output X …` | `workspaceOutputs`, a list per number | = | |
| N12 | `assign [criteria] → workspace N \| output X` | `assign` (§3 R19) | = | |
| N13 | `for_window [criteria] floating enable \| disable` | `forWindow` (§3 R9; the Workspaces tab's per-workspace floating writes `[workspace="^N$"] floating enable` there) | = | |
| N14 | (no i3 option) the ignore lists | none: Plasma's system windows are built in (§3 R5) | + | |
| N15 | `floating_minimum_size`, `floating_maximum_size` (75x50; all outputs combined) | `floatingMinimumSize`, `floatingMaximumSize` (§3 R20) | = | |
| N16 | `floating_modifier` | Meta, fixed | ≠ | kept: KWin's window-action modifier, which kwin-i3 needs as Meta (§9 F7). Reason (a). |
| N17 | `tiling_drag`, `swap_modifier` | `tilingDrag` (§9 G3); no swap modifier: Shift is the float modifier | ≠ | `tilingDrag` as i3's; the swap modifier is out of scope, the centre's Swap band swapping at every centre drop (G11); Shift floats and tiles instead (G5, G13, reason (c)) |
| N18 | `default_border`, `default_floating_border`, `hide_edge_borders`, `smart_gaps`, `client.*` | `tiledLook`, `frameWidth`, `frameOnFloating`; `hideEdgeBorders` and `smartGaps` as i3's; `client.focused`, `client.unfocused` as the two frame colours and two indicator colours (`client.focused_inactive` left out, §7 L3) | ≠ | §7 L1-L11, reason (b) |
| N19 | `force_display_urgency_hint`, `show_marks`, `title_align`, `for_window … title_format` | none | ≠ | kept: urgency, marks and i3's own title bars are out. Reason (d). |
| N20 | `resize … 10 px or 10 ppt` (in a binding) | `resizeStep`, `floatingStep` | = | a setting, as a key takes no arguments |
| N21 | (no i3 option) `roundedCorners`, `holdEnabled`, `holdTimeoutMs`, `debugLog` | kwin-i3's own (§7) | + | `holdTimeoutMs` and `debugLog` are internal values: kwinrc only (`plan.md`, Settings), not on the page |
| N22 | `bindsym $mod+Shift+e exec i3-nagbar … exit` (in i3, rebinding the key) | `endSession` (`logout`, `sleep`, `shutdown`, `ask`), on the Keys page in End session's row | = | how Exit leaves, §8 K17 |

### The settings page

`kcm/`, `docs/style-settings-page.md` for how it looks and reads.

- **Banners**, above the tabs: kwin-i3 off (with Turn On, which enables it and reconfigures); on
  but not running (pointing at the journal); running without the plugins (one banner for either:
  what goes without them, §13); while per-output desktops are off, "Plasma switches workspaces on every screen together, which
  works against kwin-i3", with Review… to the Workspaces tab.
- **Tabs**, as Plasma's Window Behavior page, worded and laid out by the style guide (each
  checkbox's name its row's label, the box marked "(recommended)" (the hold, the pointer) or
  "(optional)", its full name its screen reader name): **Plasma** first (below), **Tiling** (the key step, tiling and
  floating; `focusFollowsMouse` and `mouseWarping` as checkboxes; focus at an edge; `tilingDrag`; the hold), **Gaps** (the
  gaps; then the outer gap per screen edge, `smartGaps`, and each workspace's own inner and outer
  gap), **Workspaces** (how new workspaces open
  (`workspaceLayout`), their split direction, auto back-and-forth; then each workspace's screens
  and new windows), **Window Rules**, **Frame** (`tiledLook`, width; the two colour classes (§7
  L3), a row each with the frame's colour and the next-window side's, the latter "same as the
  frame" when empty; `hideEdgeBorders`; corners; frame on floating windows; greyed without the
  effect), **Keys**. **A help button** beside each setting with an i3 counterpart
  (§11's N table): what it does in a sentence or two, then i3's directive ("i3:
  focus_wrapping"). Each is the next Tab stop after its control, as on Plasma's pages.
- **Workspaces tab**, each workspace: for each of the ten, its outputs in order (the page says screens) (the first, and a second
  used when the first isn't connected; any, a connected one, or a stored one listed as not
  connected; a longer list in kwinrc keeps its tail) and new windows tiling or floating (the
  rule `[workspace="^N$"] floating enable` in `forWindow`).
- **Window Rules tab**: one box per rule of `forWindow` and `assign`, in the order the
  script runs them, in a framed list with a line between rules, every box the same: its
  application and what it does (floats, tiles, opens on workspace N, opens on output X) on the
  first line, its title and role (a pattern each) and window type always on the second. The
  shipped rules, when they run first, are a list of their own ("Defaults") above "Your rules",
  else one "Rules" list with them marked "default"; an empty list says so, with Add Rule. A rule
  with other criteria is shown as text and edited there. Add Rule and Pick a Window… (KWin's
  window picker: a rule with the clicked window's class, matched whole) sit in the tab's
  footer, always in view; a new rule scrolls into view with its application box focused. Above the rules, new windows over a fullscreen one (`popupDuringFullscreen`), the floating sizes (`floatingMinimumSize`,
  `floatingMaximumSize`) and Plasma's window animations (below).
- **Keys tab**: every command from `kcm/ui/commands.json`, current keys from kglobalaccel; a
  key another component also holds is set all the same, with no note (which runs is the key
  override's, §8 "Shared keys", its checkbox above the list, greyed without the helper); Apply
  asks the helper to read kwin-i3's keys again; a
  shifted symbol appears with the keys that type it on the current layout; End session's row has
  `endSession` as a dropdown beside its label (Sleep only where logind's `CanSuspend` is "yes", or
  it is already the setting). Not visible while kwin-i3 isn't running.
- **Plasma's own settings** (the first-run step, `plan.md` "Install and first run";
  `kcm/setup.cpp`), the two kwin-i3 can't win at runtime (`plan.md` reason (e)), each a row on the
  tab it belongs with: **Workspaces** "Screens switch workspaces separately: (recommended)" (per-output desktops) and **Window Rules** "Window animations: Set window
  animations to none (optional)" (Plasma's Animations page: every effect of the open/close,
  maximize, minimize, full screen and desktop-switching groups off in `[Plugins]`, and unloaded;
  the global speed untouched). Ticked is kwin-i3's way; the help says why, that the setting is
  Plasma's, and that changing it here is the same as in System Settings. A tick is an edit like
  any setting: **Apply** makes it (each key's old value, or its absence, and the value written
  saved first in `~/.local/state/kwin-i3/plasma-settings.json`; KWin reconfigured), **Reset**
  drops it, **Defaults** on its tab gives it back if kwin-i3 changed it. Unticked where kwin-i3
  changed it, Apply writes the old value back only where Plasma still has the one kwin-i3 wrote;
  a value changed since stays, its record dropped; unticked where kwin-i3 changed nothing, Plasma's
  stock value, saving nothing. Giving per-output desktops back puts every output on one desktop
  (KWin's, `kwin-notes.md`). `make uninstall` gives all of it back (`tools/plasma-settings.py`). A
  stock default is read from the installed `kwin.kcfg`. What kwin-i3 wins at runtime has no row:
  focus follows mouse (B1), a new window's focus (C4), screen-edge tiling and maximizing, the left
  drag's window action (F1), shared keys and Meta+T (§8).
- **Apply** writes kwinrc and the keys, and reconfigures if a setting changed; a setting at its
  default is removed from kwinrc rather than written. **Reset** drops every edit. **Defaults**
  resets the tab shown, and greys when it is at its defaults: a kwin-i3 tab's settings to
  `main.xml`'s (the Keys tab's keys to the US keys and `endSession`'s), Window Rules' rules to the
  shipped ones and Workspaces' floating workspaces to none (both kept in `forWindow`, each tab
  its own part) and each tab's Plasma row given back as above. `debugLog` and `holdTimeoutMs`, on no tab,
  are never reset by it.

### The workspace widget

`widget/`: a button for each workspace in use (with windows, or visible), drawn at its output's
shape with its windows as rectangles; the focused workspace bold, the visible ones highlighted; a
named desktop shows "N name". A click runs `kwin-i3 Workspace N` (as Meta+N); the wheel steps
through workspaces in use, wrapping. One setting, "Numbers only". The widget is kwin-i3's:
without kwin-i3 it draws, and a click does nothing: it doesn't fall back to KWin's own switch, as
the pager is the tool there.

---

## 12. Start, reload, release

Checked against i3 4.24's `main.c` (start, `tree_restore`, `manage_existing_windows`).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**P. Start, reload, release**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| P1 | A login: workspaces onto outputs | §4 M1 | = | `init_ws_for_output` |
| P2 | A login: where focus starts | the output under the pointer, at its workspace's focus (`focusUnderPointer`): at the load with no windows, and again after Plasma's first activity event numbers the outputs | = | i3: `main.c`, after `tree_init` |
| P3 | A reload (kwin-i3 loaded with windows open) | nothing renumbered; with the plugins, each workspace whose windows are the ones it had comes back whole from the tree kwin-i3 left with the effect (its splits, groups and split tabs, shares, focus orders, last split layouts, `workspace_layout`, and its splits or groups floated whole, with their rects); any other from KWin's tiles (a group from its tile, several windows in tab order, its bar's rows saying which; one whose shown tab was a split as that tab's windows). Floating from the effect, focus on KWin's active window | ≠ | i3's `restart`, which keeps the tree (`tree_restore`) and the focus. i3's `reload` keeps the tree too (§8 K15). From the tiles alone (no plugins, or a window changed in between) less comes back: reason (a), the tiles hold no focus order or last split layout; a workspace that is one group comes back as that group in a container under it, as `con_set_layout` wraps a workspace's windows (`con.c:2024`), never as the workspace's own layout. The tree outlives a new effect (an install, KWin's own reload): the effect asks a reconfigure when it loads, and kwin-i3 tells it every tree again; a window's fullscreen and minimized outlive the rebuild. Across a login nothing is kept, as in i3 |
| P4 | Windows open at load that no tile holds | adopted bottom of the stack first, each as a new window, so the focus order follows the stacking | = | `manage_existing_windows`, in the X server's stacking order |
| P5 | Release (Meta+Ctrl+Shift+Q), or a load or rebuild failing | every window out of its tile, KWin's state put back; kwin-i3 does nothing more until reloaded | + | the safety valve; i3's `exit` ends the session |
| P6 | The plugins loaded or unloaded | below | + | |

### Load (`start`, `startRest`)

1. Register Release and Dump State first, so the safety valve exists whatever fails next.
2. **A login** (no normal windows): number the outputs (§4). Focus goes to the output under the
   pointer, at the load and again after Plasma's first activity event (P2). **A reload**: no
   renumbering.
3. **Adopt the tiles** (`adoptTiled`): windows already in KWin's tiles keep their layout
   (`docs/plan.md`, decision 5).
4. Win what i3 decides through KWin's live options (`winOptions`: focus follows mouse, a new
   window's focus, screen-edge tiling and maximizing, the left drag's window action), again
   after every reconfigure. Connect KWin's signals; register the hidden drag actions; turn the
   tiling drag on.
5. **Ask the effect** for its stats (the answer waited for up to 250 ms, then step 7 runs).
6. Meanwhile, at once: register the keys, ask the helper to fit them, check layout keys, the plugins and per-output desktops (logged, §13), place everything. So the keys exist
   before step 7 has run.
7. **Adopt every other window**, bottom of the stack first (so the focus order follows
   stacking), and focus KWin's active window.

An exception during load releases (below). The effect is asked again at every reconfigure: two
missed answers (1 s each) turn the frame off; an answer turns it on and borders are given back
where no frame replaces them.

### Reload

Unloading the script runs nothing: tiles, paddings, taken borders and Keep Above stay as they
are, and the next load adopts them (step 3; the floating set from the effect; borders sorted at
the first answer). KWin's live options stay kwin-i3's until the next reconfigure (the live
reload's own; any System Settings Apply; a login): turning kwin-i3 off on the KWin Scripts page
reconfigures nothing (KWin 6.7.5 `kcms/scripts/module.cpp` `save`), so Plasma's focus and
window-action settings return only then. The live reload is AGENTS.md's.

### Release (Meta+Ctrl+Shift+Q)

The safety valve, also run on a load or rebuild failure: turn the tiling drag off, and end one
that is under way (its drop indicator cleared); a window crossing to another output put on its
workspace's desktop, not left on all of them; every window out of its tile, Keep Above cleared where kwin-i3 set it, its border given back; every root tile
kwin-i3 touched, and any other not exactly the full screen (one a previous instance left inset
by gaps and holding no tiles; a layout of the user's is left, §6 Y4), emptied and reset to the full screen with no padding; the effect told to drop the
resize banner, every ring's class and the focused window; KWin reconfigured, so Plasma's own
values return for what kwin-i3 won at runtime. Logs `RELEASED`. After it the script does
nothing until reloaded.

### The plugins

The effect, loaded or unloaded, tells the script by queueing a reconfigure; unloaded, it releases
holds and resets radii it set. The helper, loaded, queues a reconfigure (so the script turns the
drag on) and a key fit; unloaded, it removes its filters and D-Bus objects and puts back the
user's focus delay. If the script doesn't poll a started drag within 500 ms, the helper turns the
tiling drag off; the drag cursor ends by itself 500 ms after the script stops renewing it.

---

## 13. Reports

i3 tells a user only of a config error, with `i3-nagbar`; otherwise it writes to its log. kwin-i3
likewise: a setting that doesn't parse logs a `WARN` and uses its default (§11), and what the user
should fix in their setup is checked at load and logged, where a capture shows it. The user meets
it on the settings page's banners (§11, "The settings page"). A script's notification can't reach Plasma (KWin's `callDBus` can't send `Notify`'s
signature, `docs/kwin-notes.md`), and the banners carry everything one would say.

- **Layout keys**: without the helper, any keyboard layout other than US (`LAYOUTS … not
  fitted`), as kwin-i3's position keys are set for US (a layout KWin names `""`, its xkb default
  where the system sets none, counts as US). The page: the plugins' banner.
- **Per-output desktops off** with two or more outputs (`PEROUTPUT`), at load and at each change
  of the outputs or the setting. The page: the Plasma settings banner, to its tab (§11).
- **kwin-i3's plugins aren't loaded** (`HELPER not loaded`, `EFFECT not loaded`; `plan.md`: the
  product is the script and both plugins). The page: the plugins' banner, naming the frame, mouse
  dragging and the resize mode (§1's table has all that goes without each). The helper from KWin's loaded plugins,
  the effect from its loaded effects.

`Dump State` (the capture key's, K21) sends the outputs, the tree, the windows, a JSON state and the
in-memory log to `net.local.kwini3.dump`; `tools/capture` saves it with the effect's `Events`
(`docs/debugging.md`).

---

## 14. The KWin seam

What KWin 6.7 does that kwin-i3 works around: the main ones. Each is in the code's comments, with
the capture or fuzzer finding that showed it. Others sit in the rows they shape (§5 C2, C3, C5,
C7, C9, D7) and in `docs/kwin-notes.md`.

| KWin does | kwin-i3 does |
|---|---|
| `Tile::unmanage` restores the pre-tiling size | keeps the frame when the window is fullscreen, hidden or leaving its workspace |
| a tile managed while its desktop is hidden lists the window but never places it | unmanages and manages it again once visible |
| on a hidden desktop `w.tile` is null though the tile lists it | finds the tile from its own record |
| an outer side dragged with gaps pins the tile to the output's edge for good | rebuilds the tiles when an outer edge isn't the layout's |
| gives a full padding at an edge it judges exactly 0 or 1 | insets the root by a hair |
| pins a tile's side to the border when float noise "changes" it | judges the edge by the root, writes the window back |
| rounds tile position and width separately | rounds edges to whole pixels itself |
| a 15 % default minimum per tile | sets minimums from the window |
| moves a window only when its tile changes | writes the window to its tile when it's off |
| answers a returning output's placement with the old geometry, late | re-fits until the window shows its tile |
| a hidden client may never answer a move | moves via sticky, then gives the desktop on arrival |
| moves a modal dialog with its parent, with two desktops for a moment | ignores that moment; waits while either is dragged |
| activates a new window before telling scripts | hands focus back to a fullscreen window |
| activating a window can switch another output's desktop | switches it back |
| calls every fullscreen window not resizable | uses min/max size for fullscreen windows |
| refuses to tile a fullscreen window | keeps it in the tree out of the tiles |
| KPackage caches a package linked while KWin runs | it can't be turned on until the next login (README) |
| shortcuts match the typed symbol, not the key | the helper refits the position keys |
| Shift+; arrives as `:` | Move Right's second key is Meta+: |
| a GTK 4 client keeps within bounds sent only with its first configure | asks 0 × 0, then its tile |
| `print()` from a script is dropped on this machine | logs over D-Bus |
| plugin libraries are never unloaded | a new file name per build |
| a `KConfigWatcher` subscription outliving its plugin crashed KWin | subscriptions owned by the plugin's own object |
