# What kwin-i3 does: the behaviour as built

**The one description of what kwin-i3 does today**, exactly, read from the code (2026-10-27). A
spec records a decision and why; this page says what the code does now. Where they disagree,
this page is checked against the code and the spec is the one that's stale. A change to
behaviour updates this page in the same commit (`docs/testing.md` P1).

Long and exact on purpose during the Stage (Paul, 2026-10-27); the user's documentation will be
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
| hold: atomic layout | moved windows switch to their new places in one frame; a closing tiling window stays drawn until its neighbours have resized; a new tiling window is hidden until placed | windows move one by one; the wallpaper can show for a frame |
| hold: the frame | the 1 px ring outside tiling (and optionally floating) windows, rounded corners, the drop indicator, the drag cursor; keeps the floating set across a script reload | tiling windows keep their title bars whatever `tiledLook` says; no drop indicator |
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
| `/kwini3hold` | `net.local.kwini3hold` | `Stats`, `Events`, `SetFloating(id, on)`, `SetRing(id, class, indicator, hidden)`, `SetTiledRing(on)`, `ShowIndicator(id)`, `SetDropIndicator(x, y, w, h)`, `SetDragCursor(on, shape)`, `SetMode(mode)`, `HoldNew(id, ms)` | the script (`Events`: `tools/capture`; `SetMode`: the helper) |
| `/kwini3drag` | `net.local.kwini3drag` | `State`, `SetOn(on)`, `SetResizeGap(px)`, `Warp(x, y)`, `Cancel` | the script |
| `/kwini3helper` | `net.local.kwini3helper` | `FitKeys`, `Plan` | the script (`Plan`: tests) |
| `/kwini3mode` | `net.local.kwini3mode` | `SetMode(mode)`, `Mode`, `LaunchTerminal`, `TerminalService` | the script |
| `/kwini3helper/pointer` | `net.local.kwini3helper.Pointer` | `Probe(x, y)`, `Map(x, y, w, h)` (at most 10000 px a call), `Windows`, `Events` | `tools/pointer-map`, `tools/capture` (`docs/pointer.md`) |

The helper calls back into the script through kglobalaccel: it invokes the hidden shortcuts
`kwin-i3 Tiling Drag` and `kwin-i3 Tiling Resize` (registered with no key), and the script then
polls `State()`. Only `Stats` and `State` are asked for a reply. Settings reach the plugins
directly from kwinrc `[Script-kwin-i3]`, each with its own watcher, except the tiling ring, which
the script tells the effect (`SetTiledRing`).

The script also runs five of KWin's own shortcuts by name (`invoke`): **Window Fullscreen** and
**Window Close** (Meta+F, Meta+Shift+Q), **Switch to Screen N**, to make an output with an empty
workspace KWin's active one, and **MoveMouseToCenter** / **MoveMouseToFocus**, the pointer warp
when focus changes output (§5 A2).

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
  scratchpad (`docs/plan.md`, "Scope"); a minimized window stays in the tree, skipped by every
  descent, focus move and insertion (`reachable`), i3's scratchpad stand-in (§5 C9, §10 V7).

### Tidying

- **A split left empty closes**, and so on upward (`onRemoveChild`).
- **`flatten`** is i3's `tree_flatten`: a split whose only child is a split of the other
  direction, inside a parent of that same direction, is dissolved into the parent.
- **`tidy`** **≠** i3 (`docs/spec-nested-boxes.md`; `plan.md` decision 8): a split whose only child is a split is
  replaced by that child, repeatedly: every such shape, flatten's included, so after a close it
  removes at once what i3's flatten would remove only at the next move. A one-child split holding
  a window stays. Run after a move (`flatten` calls it), a close, floating a window, sending one to a workspace, a drop and the
  adoption at load; not after tiling a floating window.

### Operations

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart. The "=" rows are
ports: the i3 function is named, and the code follows it, edge cases included, **on the tidied
tree**: after the first `tidy` the tree is no longer the one i3 would have, so a long sequence of
moves can end differently from i3's, and a replay in real i3 matches only with that allowed for
(kept, Paul, 2026-10-27, knowing this).

| # | Operation | Result | i3 | Note |
|---|---|---|---|---|
| T1 | **Open** (`open`) | the new leaf goes after the focused container of its workspace, in that container's parent; focus on a floating window: after the focused tiling container; an empty workspace: at the top level. It takes the average share and goes to the bottom of its parent's focus stack; KWin's activation then focuses it (§5). Under a fullscreen window it goes second in the focus stack, so it gets focus when the fullscreen window closes | = | `tree_open_con`, `manage.c` |
| T2 | **Close** (`close`) | the next focus is `con_next_focused`: the previous focus in the same container, descending | = | `tree_close_internal`. Whether it or KWin's choice wins today: §5 C6, C7 |
| T3 | **Split** (`split`; Meta+H, Meta+V) on a window | its parent has one child: the parent takes the direction; else the window is wrapped in a new split of that direction, even when the parent already has it | = | `tree_split` |
| T4 | Split with the workspace focused (an empty workspace) | under two children: the workspace takes the direction; else its children are wrapped first (`workspace_encapsulate`), then as T3 | = | `tree_split` |
| T5 | Split on a floating window | nothing | = | `tree_split`: "Floating containers can't be split" |
| T6 | **Toggle split** (`toggleSplit`; Meta+E) | the window's parent flips direction (after i3's #3001 rule: a parent and grandparent each holding one child are collapsed first); at the workspace's top level, the workspace's children are wrapped in a split of the other direction, then flattened (and tidied) | = | `layout toggle split`. i3's bare `layout toggle` also cycles tabbed and stacked: out of scope |
| T7 | **Move** (`move`; Meta+Shift+direction), a leaf beside it in the same split | the two swap | = | `tree_move` |
| T8 | Move, a split beside it | enters that split at the edge facing the move, then `flatten` (and tidy) | = | `tree_move` |
| T9 | Move, no sibling that way | climbs out to the nearest ancestor of that direction, creating one at the top if none (`ws_force_orientation`) | = | `tree_move` |
| T10 | Move at the workspace's edge; or a fullscreen window; or the workspace's only child; or the lone child of a split at the workspace's edge that way | to the workspace visible on the neighbouring output, at its top level, at the near edge (first when moving right or down); it keeps focus | = | `move_to_output_directed`, `attach_to_workspace` |
| T11 | Move that would climb out across a fullscreen window | refused | = | `tree_move` checks only the climb-out path, as here; a swap inside the fullscreen window's own split isn't checked by either |
| T12 | **Resize by key** (`resize`; Meta+Ctrl+arrows, J K L ;) on a tiling window | the nearest ancestor-or-self in a split of that direction with more than one child grows or shrinks by `resizeStep` percent of the split; every sibling gives up or gains an equal part, so which edge moves depends on its place (the last child growing moves its left or top edge); refused if any share would go below one pixel of the split (`percent_for_1px`, `resize.c:131-136`) | ≠ | `cmd_resize_tiling_width_height` (`commands.c:505`), in ppt, as i3's default config gives on a tiling window ("10 px or 10 ppt"). ≠ only in what can't be said: a px-only resize, as a key runs one fixed action (`plan.md` reason (d)). The 1 px floor since refinement stage 5 (before, 0.1 %) |
| T13 | Resize by key on a floating window | by `floatingStep` px, if KWin lets it resize | = | `cmd_resize_floating`, 10 px (§8) |
| T14 | Move by key on a floating window | by `floatingStep` px; refused only if no part would be on an output; landing on another output joins the workspace visible there, keeping focus | = | `cmd_move_direction`, `floating_reposition`, `floating_maybe_reassign_ws` |
| T15 | **Swap** (`swap`) | two tiling windows exchange places, shares and fullscreen flags; the tiling drag's centre drop uses it (§9) | = | `con_swap` |
| T16 | **Float** (`floatingEnable`; Meta+Shift+Space) | the leaf becomes a floating node at the top of the workspace's floating list, taking its branch's place in the focus stack; a fullscreen window stays fullscreen | = | `floating_enable` |
| T17 | **Tile** (`floatingDisable`) | after the workspace's focused tiling container, or at the top level of an empty workspace; a fullscreen window stays fullscreen; no tidy afterwards | = | `floating_disable` |
| T18 | **Focus a direction** (`focusDir`; Meta+arrows, J K L ;) from a tiling window | the sibling that way in the nearest split of that direction; at the workspace's edge, the workspace visible on the neighbouring output, at its **tiling** focus (its fullscreen window if it has one); else wrapping by `focusWrapping` | = | `tree_next`, `get_tree_next` |
| T19 | `focusWrapping` | `yes` (default): the next output first, else wrap inside the **innermost** container of that direction; `no`: the next output, never wrap; `force`: wrap inside the container, never leave it; `workspace`: wrap, never leave the workspace | = | `focus_wrapping` |
| T20 | Focus a direction from a floating window | left and right cycle the workspace's floating windows, wrapping; up and down do nothing | = | The list is i3's stacking order: a window that opens floating goes to its head (`floating_enable`, `floating.c:295`), an activated one to its tail (`con_activate`'s `floating_raise_con`, `floating.c:478`), and a step left or right rotates it so the one reached is last, the cycle keeping its order (`tree.c:615-625`). `get_tree_next`: "up/down does not change floating containers". Refinement stage 5; before, new ones joined the end and the list never changed |
| T21 | Focus a direction with the (empty) workspace focused | the next output, in every `focusWrapping` mode, `force` too; nothing if there is none | = | `get_tree_next`, `handle_workspace` |
| T22 | Focus a direction past a fullscreen window | only to the next output, in all four directions, tiling or floating (with `focusWrapping` `workspace`: nowhere) | = | `con_fullscreen_permits_focusing` (`con.c:2327-2364`), from the focus's own fullscreen ancestor: with the focus on another window of that workspace (after an activation), it moves on, as i3 (refinement stage 5; before, the workspace's fullscreen window refused it, here and in T11) |
| T23 | **Focus mode toggle** (`focusModeToggle`; Meta+Space) | between the workspace's most recent floating window and its most recent tiling one | = | `focus mode_toggle` |
| T24 | **Move to a workspace** (`moveToWorkspace`) | after the target's focused container; focus stays on the source, on i3's next focus there. A fullscreen window arriving where another is fullscreen clears the other's flag; a window arriving under a fullscreen window doesn't take that workspace's focus | = | `con_move_to_workspace` |

---

## 3. Window kinds

### i3's kinds (Paul, 2026-10-27: follow i3, down to the names)

Every window has one of i3's four kinds (`definitions.md`), a floating one may be sticky, and the desktop window is the root, not a kind; the rules (focus first, §5) are written in them:

| i3's kind | in i3 | here |
|---|---|---|
| **tiling** | in the tree's layout | the tree places it |
| **floating** | in the tree, on its workspace's floating list | you place it |
| **sticky floating** (floating, sticky) | floating, visible on every workspace of its output (`sticky enable`) | a window on all virtual desktops (R3): floating, moved in the model to whatever its output shows |
| **dock** | i3bar; never focused (`manage.c`) | Plasma's panels |
| **root window** (not a kind) | the background; a click or a crossing focuses its output | the desktop window |
| **override-redirect** | not in the tree: i3 never places or focuses it; it takes the keyboard itself, and focus is where it was when it goes (`manage.c`) | on Wayland: popups and Plasma's shell surfaces |

**The code's kinds are i3's** (redo stage 3, 2026-10-28; `src/rules.js` `classify`, `keptOut`,
`i3Kind`): tiling and floating in the tree; dock, root and override-redirect kept out by type or by
the built-in class list; **sticky** (on all desktops) in the tree as sticky floating (redo stage 9).
The i3 kind of each window Plasma shows, and how the code gets there:

| window | i3's kind | how |
|---|---|---|
| KRunner, panel popups, menus, notifications, OSDs | override-redirect | by KWin's type (popups, menus, tooltips, notifications, OSDs, applet popups); KRunner by class |
| `kded5`/`kded6`, `xwaylandvideobridge`, `ksplashqml`, `kwin_wayland` (system windows, never meant to have focus) | override-redirect | the built-in class list (Normal windows on Wayland, where i3 would never see them) |
| Plasma's panels, and its panel configuration window (a layer-shell surface in scope `dock`, `panelconfigview.cpp`) | dock | KWin's type |
| the desktop window | root | KWin's type |
| Yakuake (on all desktops) | sticky floating | `classify`: on all desktops (R3). On Wayland Yakuake's hide is a close: Qt drops the surface's role and unmaps it (`QWaylandWindow::setVisible(false)`: `resetSurfaceRole`, Qt 6.9), so each show is a new window (§5 C1) and §5 C7's close focus applies when it hides |
| Spectacle's window, the password prompt (polkit), KRuler | floating | the default `forWindow` rules, by class (a user can delete one and see the tool tile) |
| Spectacle's region overlays (a Normal fullscreen window per output, probe 93) | override-redirect | by class and fullscreen (Paul's call 60: in the tree they would gather on the focused workspace) |
| the logout screen (`ksmserver-logout-greeter`) | override-redirect (as i3lock: it holds the keyboard itself) | the built-in class list |
| `plasmashell`'s shell surfaces (panels, popups) | dock / override-redirect, by type | KWin's type |
| `plasmashell`'s ordinary windows (Configure Desktop and Wallpaper, a widget's settings) | floating | the default rule `[class="^(org\.kde\.)?plasmashell$" window_type="normal"]` |

### How a window gets its kind

`src/rules.js` `classify` runs on every judgement (settings read each time), first match wins;
then `src/kwin.js` `adoptWindow`. **=** as in i3 · **≠** differs · **+** no i3 counterpart.

| # | When | Kind today | i3 | Note |
|---|---|---|---|---|
| R1 | KWin's type: a panel (dock), the desktop window (root); popups, menus, tooltips, OSDs, applet popups, and Plasma's notifications (class `plasmashell`; override-redirect); another type that is neither Normal nor dialog, utility, toolbar, splash or notification; kwini3helper's own gap strips (Z9: kwin-i3's, as i3's frames are i3's) | kept out of the tree, by its i3 kind | = | `i3Kind`, `keptOut`; built 2026-10-28 (redo stage 3) |
| R2 | An X11 dialog, utility window, toolbar, splash screen or notification (an Xwayland app's) | floating | = | `manage.c`: dialog, utility, toolbar, splash; and another app's notification-type window (an X11 toast) floats too, as `manage.c:466`, Plasma's own being told apart by class (KWin shows a script no X11-only property; refinement stage 4, before: all kept out). Built 2026-10-28; before, kept out, as KWin's `normalWindow` is false for these types |
| R3 | On all desktops | **sticky floating**: in the tree, floating, on whatever workspace its output shows (the model moves it there after every switch, i3's `output_push_sticky_windows`; KWin draws it there by itself; not after a move: sent to a hidden workspace it stays there until that output next shows a workspace, as i3; Move Workspace to Output pushes on both outputs, as its two workspace_show do); it keeps the focus across a switch if it had it, else joins without it | = | The `forWindow` rules run after, as i3's (`manage.c:588`): `floating disable` tiles it, taking it off all desktops onto its workspace (X4: KWin's tiles belong to one desktop, where i3 keeps the flag); `floating enable` leaves it sticky (refinement stage 4; before, the rules never reached it). Otherwise as i3: i3: `_NET_WM_DESKTOP` all: "float it and make it sticky" (`manage.c:486-490`); `output.c:83-120`. Built 2026-10-28 (redo stage 9); Yakuake comes in this way |
| R4 | Skips the taskbar | decides nothing | = | i3 ignores the hint. Read on Paul's desktop 2026-10-28: the only Normal window that sets it is `xwaylandvideobridge`, on the built-in list. Built 2026-10-28 |
| R5 | The built-in class list: `krunner`, `kded5`/`kded6`, `xwaylandvideobridge`, `ksplashqml`, `kwin_wayland`, `ksmserver-logout-greeter` (class or instance); Spectacle's windows that are fullscreen | override-redirect | ≠ | On Wayland Plasma makes its system windows Normal windows, where i3 would never see them; not a setting (a user can't make a window override-redirect). A user's own `ignoreClass`/`ignoreRole` entries are read as `floating enable` rules (R9) and named once at load (Paul's call 43). Built 2026-10-28; before, the `ignoreClass`/`ignoreRole` lists with Krohnkite's defaults |
| R6 | Transient, modal, or a fixed size (not resizable; a fullscreen window: fixed unless its minimum and maximum differ) | floating | = | `manage.c`: transient_for (or a leader that is managed), `_NET_WM_STATE_MODAL`, min = max |
| R7 | KWin's type is dialog, utility, toolbar or splash (R2) | floating | = | `floatsByDefault`; before stage 3 never reached |
| R8 | Its title is exactly `kwin-i3 capture note` | floating | + | `tools/capture`'s box |
| R9 | The `forWindow` rules, i3's `for_window [criteria] floating enable \| disable`, in order, each at most once per window (X2): `class`, `instance`, `title`, `window_role`, `window_type` (a keyword, case-insensitive, as i3's `match.c`: `normal`, `dialog`, `utility`, `toolbar`, `splash`; `notification` (another app's notification-type window, R2); i3's `menu`, `dropdown_menu`, `popup_menu`, `tooltip` are read but never match, those windows being kept out of the tree, R1; the page offers the five), `workspace` (the number it opens on), `floating`, `tiling`, `all`; the others regular expressions, case-sensitive, read as i3's PCRE2 as far as JavaScript can: JavaScript's strict syntax first, then a leading `(?i)` as case-insensitive and loose escapes (`\-`, `\ `); all in one rule must match | as the last matching rule says | = | `Rules.classify`; a pattern still unreadable (possessive quantifiers, atomic groups), or another command, skips the rule with a `WARN` (≠: i3 reads those). The old `floatingClass` (class or instance, whole), `floatingTitle` (a substring) and `floatingWorkspaces` (`[workspace="^N$"]`) are read on as rules before `forWindow`'s. Built 2026-10-28 |
| R10 | Otherwise | tiling | = | |
| R11 | A new window on a workspace in `floatingWorkspaces` | floating | = | read as `for_window [workspace="^N$"] floating enable` (R9, §11 N13); for the windows of Plasma's own tools (`plan.md` decision 1) |
| R12 | After a reload: the rules say tiling, but it is in no tile and kept above (or in the effect's floating set) | floating | + | It was floating before the reload |
| R13 | On two or more desktops, not all | not adopted until it is on one (or all: R3) | ≠ | i3 has no such state (`_NET_WM_DESKTOP` is one or all); reason (a): a workspace is one virtual desktop and KWin's tiles belong to one, so such a window has no one place in the tree |
| R14 | Maximized when adopted | unmaximized | = | i3 has no maximize and ignores the request (V8) |
| R15 | On another activity | judged like any other | + | Plasma's activities; no check |
| R16 | A window kept out of the tree | not in the model; watched for a later change of class, title or transience **only if it is a Normal window** | = | i3 manages every window but docks and override-redirect ones; the sticky kind is R3's |
| R17 | A window already closing when kwin-i3 first sees it (`deleted`) | kept out of the tree (override-redirect) | + | nothing to place |
| R19 | `assign` (§11 N12): `[criteria] → N` (`workspace N`, `number N`; 1-10) or `[criteria] output X`, at adoption only, before every other choice of workspace (§5 C1's `placeNew`): the first matching workspace rule, then the first matching output rule on top of it, as i3 applies both (`manage.c:289`, `:354`); X as i3's `get_output_from_string`: a name (case-insensitive), `primary` (KWin's first screen), `nonprimary`, `current`, `left`/`right`/`up`/`down` from the focused output | opens on N, shown or not, without switching an output and without the focus if N is hidden; then, with an output rule, on X's visible workspace; an output that isn't connected leaves that rule aside (the workspace one stands) | = | i3 marks a hidden target urgent; there is no urgency here, so the window waits there. A never-used N is created on the focused output. A `floating` or `tiling` criterion never matches in an assign, as in i3, where assignments are read before the window has a container (`match.c` window_mode; review 2026-10-28). Built 2026-10-28 |
| R20 | A window becoming floating (adoption, a rule, Meta+Shift+Space, KWin's refusal to tile) | sized within `floatingMinimumSize` (75x50) and `floatingMaximumSize` (0x0: all outputs together; -1x-1: none), then KWin's own floor (~150 px wide with a title bar) | = | i3's `floating_minimum_size`/`floating_maximum_size` (`floating.c`); `clampFloating`. Built 2026-10-28 |
| R18 | A window adopted with no border, not to be framed (a session restore of one kwin-i3 had taken, or a reload after the effect went) | its border given back; a KWin rule forcing no border wins | + | |

### Changing kind

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| X1 | Meta+Shift+Space (`Floating Toggle`) | tiling and floating swap; a window floated this way comes back at its untiled size (below) | = | `floating toggle` |
| X2 | A change of title, class, transience or readiness to paint (`reclassify`) | the `forWindow` rules not yet run on the window run, each at most once, only to apply it: a window whose title stops matching stays as it is, and so does one floated or tiled by hand; a window now kept out of the tree (sticky, a type change) leaves the model | = | i3's `run_assignments` (`assignments.c`). Built 2026-10-28; before, a changed verdict was followed both ways |
| X3 | A rule setting changed (`forWindow`, `assign`, the old lists) | every rule runs anew on every window (each window's record cleared), as a reload would in i3 | = | §11 |
| X4 | Put on all desktops (the window menu, a client, a KWin rule, Sticky Toggle) | floated if tiling, marked sticky, pushed to what its output shows (R3). Off all desktops onto one: no longer sticky, it stays floating on that desktop's workspace. **Made tiling** (Floating Toggle): taken off all desktops onto its workspace's first | ≠ | i3: `sticky enable` (`cmd_sticky`), and a tiled sticky con keeps its flag. Kept: KWin's tiles belong to one desktop's root, so a tiling window can't stay on all of them. Sticky Toggle is an unbound action, as i3's `sticky toggle` (Paul, 2026-10-28). Built 2026-10-28 (redo stage 9) |
| X5 | Meta+Shift+drag on a tiling window | out of its tile, floating where dropped (§9) | + | Paul, 2026-10-26 |
| X6 | KWin refuses to tile it (not resizable, or not on the tile's desktop) | floating; a fullscreen window stays in the tree, out of the tiles, until fullscreen ends | ≠ | i3 tiles any window; KWin's tiles can't hold one that won't resize **Kept** (Paul, 2026-10-27): KWin's tiles can't hold a window that won't resize |
| X7 | The tiling windows' minimum sizes don't fit the output | the one with the largest minimum along that axis floats, repeatedly (`floatWhatCannotFit`) | ≠ | i3 ignores size hints on tiling windows (`plan.md` reason (a)) **Kept** (Paul, 2026-10-27): a Wayland client can't be drawn smaller than its minimum; it would hang outside its tile |

### A floating window's size

- **The untiled record** (`recordUntiled`): when kwin-i3 first sees a window untiled, it records
  its frame and its output's geometry.
- **Floating a tiling window** (`floatAtRecord`) gives it the recorded size, clamped to the output's
  area. On a different output its centre is mapped by fraction onto the new one (i3's
  `floating_fix_coordinates`); a rect that doesn't fit is centred. On a hidden workspace, KWin's
  own restore applies instead.
- **An app that last closed tiling** opens at its tiling size and floats at that size, as in i3
  (`docs/spec-float-size.md`).

### What each kind gets

| | tiling | floating | kept out of the tree |
|---|---|---|---|
| placed by | the tree | the user | the app or Plasma |
| on a workspace | yes | yes | yes, KWin's |
| moved between outputs by kwin-i3 | with its workspace | with its workspace | no |
| look | per `tiledLook` (§7) | its own decoration; the frame instead if `frameOnFloating` | untouched |
| kept above tiling windows | — | yes, except on a Floating workspace while the effect marks floating windows | untouched |
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
reports when it is off with two or more outputs and never sets it (§13).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**W. What a workspace is**

| # | Rule | i3 | Note |
|---|---|---|---|
| W1 | Workspace N is desktop N, numbers only, 1 to 10; Plasma's desktop names are display only. A virtual desktop past 10 (the Overview can add one) is not a workspace: a window opened on it, or asking for it, goes to the focused workspace (C1); one moved there leaves the tree; the Overview showing it is undone (refinement stage 4; before, windows there were half in a workspace no key reached) | ≠ | i3 has named, unbounded workspaces: `plan.md` decision 9, reason (a) |
| W2 | Desktops are created on demand up to the one asked for (Meta+7 on one desktop makes 2 to 7), never removed; KWin saves the count (`docs/spec-desktops-on-demand.md`) | + | i3 creates a workspace when asked and closes it when empty and hidden; here the desktop stays, and W4 gives the same effect |
| W3 | **A workspace with windows** lives on a connected output: when its output goes, it moves to the first output (the primary first: KWin's `workspace.screenOrder`, as i3's `get_first_output`; `Workspaces.ordered`), workspace outputs not read, for good; one whose workspace output names a returning output comes back (W5, M2) | = | i3's `move_content` (`randr.c:860`); `src/outputs.js` `homesAfterLoss`. Built 2026-10-28 (redo stage 4); until the review that day it went to its next connected assigned output, marked = but not i3's (Paul: follow i3); before, the output's name was kept while it was away and the workspace went back |
| W4 | **An empty workspace** has no lasting output: it takes the output it is next visible on (S3) | = | i3 closes an empty workspace when it is hidden, and makes it again where asked |
| W5 | **Assignment** (`workspaceOutputs`, i3's `workspace N output A B …`): a list of outputs per number, space-separated (`1=DP-4 HDMI-A-1, 2=DP-6`), the first connected one wins; when it appears, its workspaces go there. An output name can't contain a space (i3's can't either) | = | i3's `get_assigned_output`. Built 2026-10-28; before, one output per number, kept while away |
| W6 | A new workspace's direction (`defaultOrientation`): `auto` is side by side unless its output is taller than wide | = | `default_orientation` |

**S. Showing and sending (the actions)**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| S1 | Meta+N, N visible on the focused output | nothing; with `workspaceAutoBackAndForth`, the previous workspace | = | |
| S2 | Meta+N, N visible on the other output | focus goes to that output (§5 A2 for the pointer) | = | |
| S3 | Meta+N, N hidden, with windows | N shows on its output; focus to its fullscreen window, else its last focus | = | |
| S4 | Meta+N, N hidden and empty | N shows on its assigned output, else the **focused output** (the focused workspace's; KWin's active output only with nothing focused), which becomes its output | = | `workspace_show`. Built 2026-10-28 (redo stage 1); before, KWin's active output, which follows the pointer |
| S5 | Meta+Shift+N | the window goes to N on N's output; focus stays behind, on i3's next focus there. An empty hidden N takes the window's output as its own. Auto back-and-forth applies; the unbound **Workspace N (no back-and-forth)** and **Move to Workspace N (no back-and-forth)** actions skip it | = | i3's `--no-auto-back-and-forth` flag, as actions (a key takes no arguments). Built 2026-10-28 (redo stage 5) |
| S6 | Back-and-forth, and moving a window there (unbound) | the previous workspace, if it still exists | = | Unbound by default, as in i3 (`docs/spec-workspace-commands.md`) |
| S7 | Next and previous, overall or on this output, and moving a window there (unbound) | over workspaces with windows or visible, wrapping | = | |
| S8 | Focus the output in a direction (S11, wrapping), or **next** (the outputs' order, primary first, wrapping) or **primary** (the first in that order) (unbound) | its visible workspace, at its last focus | = | i3's `focus output left|right|up|down|next|primary`; by name stays out: KWin's shortcuts are registered once, at load, under fixed names. Built 2026-10-28 (redo stage 5) |
| S9 | Move a window to the output in a direction, next or primary (unbound) | to the workspace visible there; focus stays | = | as S8; Move Workspace to Output takes next and primary too (Paul's call 35) |
| S10 | Move the workspace to the output in a direction (unbound) | it shows there, with the focus; the source shows the workspace it most recently showed that has windows, else its lowest with windows, else an unused one: one assigned to the source and not yet in use first, then the lowest not assigned elsewhere (i3's `workspace_move_to_output`, then `create_workspace_on_output`; review 2026-10-28); none left (all ten in use): refused. A workspace with a workspace output moves too. The previous workspace (back-and-forth) is then the one the source shows | ≠ | i3's has no "refused": it makes a new workspace; here there are ten (`plan.md` decision 9, reason (a)) **Decided, not built** (Paul, 2026-10-28): `next` and `primary` too, unbound, as i3 |
| S11 | Which output is "in a direction" | one that way by origin, overlapping on the other axis, the nearest by origin (a diagonal one never qualifies); for the commands (S8-S10, a direction in `assign`), none that way: the farthest the other way (wrapping); for the tree's edge (T10, T18), none: nothing | = | i3's `get_output_next` (`randr.c:259-317`), and `get_output_next_wrap` for the commands (`output.c:33-51` `get_output_from_string`); `Workspaces.screenToward`. Built 2026-10-28 (refinement stage 1); before, the nearest by edge distance, diagonals included, never wrapping |

**M. Outputs and desktops changing**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| M1 | Login (no normal windows) | the workspaces with workspace outputs get their outputs; then each output, primary first (`screenOrder`), shows its first assigned workspace (the lowest number set to it), else the lowest free workspace not set to another output | = | i3's `init_ws_for_output` (`randr.c:497-507`, then `create_workspace_on_output`); i3 takes its config's first assignment, the setting here is keyed by number, so the lowest stands in. Built 2026-10-28 (refinement stage 1); before, outputs in KWin's backend order and no assigned workspace first |
| M2 | A reload | nothing renumbered; each workspace's output comes back from which output's tiles hold the windows | + | |
| M3 | An output lost | its workspaces with windows, and the focused one, move to the first output for good, assigned or not (W3); empty unfocused ones have no output left; the first output keeps showing what it showed, unless the focus was on a moved workspace, which it shows then; focus as §5 D5 | = | i3's `move_content`. Built 2026-10-28 |
| M4 | **The lost output back** (or any output appearing) | the existing workspaces assigned to it (W5) move to it (one not made yet is made only when shown or used, as i3's loop over existing workspaces, `randr.c:462-486`; until refinement stage 1 every assigned number was made), their windows with them; a source left showing one of them shows the workspace it most recently showed that has windows, else its lowest with windows, else an unused one (S10's rule); then the output shows its lowest workspace, else its first assigned one, else the lowest free one | = | i3's `init_ws_for_output` (`randr.c`); `src/outputs.js` `movingTo`, `sourceShows`, `newShows`. Built 2026-10-28; before, each output showed again what it showed before the loss |
| M5 | **An output never seen before** | as M4: its assigned workspaces go to it, and it shows its lowest, else its first assigned, else the lowest free one, over whatever KWin picked (the desktop it last showed in the activity, else desktop 1) | = | Built 2026-10-28; before, KWin's choice stood, which could be a workspace another output showed |
| M6 | After any output change | every window is re-fitted to its tile as its geometry settles (`armRefit`) | + | |
| M7 | A desktop switched outside kwin-i3 (the Overview, a pager, KWin's own desktop keys, an activation) | §5 D2/D3 | | |
| M8 | Desktops removed or reordered (`desktopListChanged`) | appending changes nothing; anything else rebuilds the model from KWin's tiles and windows, as at load, and with per-output desktops each output showing another's workspace switches to one of its own (`docs/spec-desktop-changes.md`). Nothing is placed while it rebuilds. A removed desktop's windows join the workspace KWin moved them to. The numbered settings stay positions: after a removal, "3" names whatever is now workspace 3 | + | |
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
| A2 | A key moves focus to another output (an edge, Meta+N on the other, focus/move workspace to output); also an outside desktop switch (D2) or an activation (Alt+Tab, the task manager, an app); not KWin's own pick at a close (i3 sets no warp at a close, `tree.c`; review 2026-10-28) | kwin-i3 | the workspace's fullscreen window, else its last focus | to the focused window's centre, an empty workspace's output centre, **unless the pointer is on that output already**; `mouseWarping none` (§11 N7): never | = | i3's `x_set_warp_to` from `workspace_show` and the focus commands, `x_push_changes` warping only if the pointer isn't there (`workspace.c`, `x.c`). Never from a close (`applyFocus`'s `byKey`; the start menu closing sent the pointer across, Paul, 2026-10-25). Built 2026-10-28 (redo stage 2); before, from keys only, whenever the focus changed output |
| A3 | Any key of kwin-i3's while an **override-redirect** window has the keyboard (KRunner, a menu, a panel popup, a notification; §3 `i3Kind`) | — | nothing: the key does nothing (`KEY … ignored` in the log); Escape first | stays | = | i3's bindings don't fire while dmenu holds the keyboard; panel popups included (Paul's call 59). Built 2026-10-28 (redo stage 2); before, a focus key took the keyboard from it |
| A4 | A key that doesn't move focus while a window in no tree and not override-redirect has the keyboard (R13: on two or more desktops) | — | that window keeps it | stays | ≠ | reason (a), as R13; an override-redirect window's keyboard is A3's |
| A5b | Meta+F, Meta+Shift+Q | KWin | unchanged; acts on KWin's active window, whatever its kind, unless it is override-redirect (A3) | stays | = | i3 acts on its focused container; `docs/spec-own-keys.md` |

| A6 | Move window to workspace N / to an output | kwin-i3 | stays on the source workspace, i3's next focus there | stays | = | |
| A7 | Any key, first | kwin-i3 | the model takes KWin's active window, if it is in the tree | — | + | Not stale-checked: a key in the millisecond after an output unplug takes a stale activation (accepted, 2026-10-26) |

**B. The mouse**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| B1 | The pointer enters a window (focus follows mouse), or its ring (§9) | KWin | that window | — | ≠ | i3's default is focus follows mouse; stock Plasma is click to focus, and KWin's focus policy is the user's Plasma setting: reason (e). As i3 with `FocusPolicy=FocusFollowsMouse` (Paul's setup). The pointer reaching a tiled window's frame under a neighbour's margin raises that window (Z9's part B), and the raise asks its focus too: KWin's own enter at the stored position counts as a pointer that hasn't moved and asks nothing (probe 94, 2026-10-29) |
| B2 | The pointer moves over the root window or a dock (an empty workspace, a gap, a panel) on another output than the focus's: at a crossing, or later (the focus moved there by a key with `mouseWarping none`), as i3 checks on every such motion | kwin-i3 (`pointerMoved`, from `cursorPosChanged`; one comparison per motion, the hit test only while focus and pointer are on different outputs) | that output's visible workspace: its fullscreen window, else its last focus, or the empty workspace; over an override-redirect window the model's focus moves and that window keeps the keyboard (D7); nothing with focus follows mouse off, during a tiling drag, or until a monitor change has settled | stays | = | i3's `check_crossing_screen_boundary` (`handlers.c`); a dock counts as root. Over a tiling or floating window, KWin's focus follows mouse activates it a turn later (B1, probe 91). Focus and pointer never come apart across outputs now. Built 2026-10-28 (redo stage 2) |
| B3 | A click on a window | KWin | that window, raised | — | = | |
| B4 | A click on the root window or a dock | KWin, then kwin-i3 (`desktopActivated`) | the desktop: that output's visible workspace at its last focus (or the empty workspace), the desktop window given up at once; a panel: unchanged (KWin never activates a dock), what it opens is override-redirect (A3); with Show Desktop on, the desktop keeps the keyboard (+, Plasma's edit mode) | — | = | i3's root click (`click.c`). Known limit kept: typing into the desktop itself (an icon rename) loses the keyboard on the next pass. Built 2026-10-28 (redo stage 2) |
| B5 | The pointer still, a window grows under it (after a close, a resize) | — | unchanged | — | = | i3 ignores enter events its own re-layout caused (`add_ignore_event`); KWin acts only on motion |
| B6 | A tiling drag drops | kwin-i3 | the dropped window | stays | = | |
| B7 | The pointer crosses the gap to a panel popup (override-redirect) | helper | the popup keeps it (KWin's delay 1.5 s) | — | + | i3's popups grab the pointer; `docs/spec-popup-grace.md` |

**C. Windows opening and closing**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| C1 | A new window | kwin-i3: **the focused workspace**, wherever KWin's active output (the pointer's) put it; moved there, hidden until it is placed (`src/placement.js`, `placeNew`) | the new window, if its workspace is visible on the focused output (`manage.c:437`); else what had it | — | = | i3: the focused container's workspace (`manage.c`). KWin opens it on its active output's current desktop and activates it before kwin-i3 hears of it; kwin-i3 moves it. ≠ in one step: i3 first opens a window on the workspace it was **launched** from (`manage.c:333`, `startup_ws`, X11 startup notification); on Wayland that link is an xdg-activation token, and KWin shows a script nothing of which desktop a launch came from (the rule: ride i3 unless KWin can't; review 2026-10-28), so a window opens where the focus is when it maps. **Known limit**: a window that asks for exactly the desktop KWin would give it anyway (a session restore, a rule) can't be told from one that didn't ask, so it goes to the focused workspace; only when the pointer's output and the focused one differ. "Asked" is read wider than the spec's "not the active output's current desktop": a desktop no output was showing before the window's own switch (`placement.js` `target`), so a restored window whose desktop another output shows also counts as not asking. Built 2026-10-28 (redo stage 1) |
| C2 | A new window whose desktop isn't the one its output shows (a dialog placed over its parent on the other output, with the active output's desktop) | kwin-i3 | as C1 or C3 | — | = | KWin switches that output first (`SwitchToOtherDesktop`), in the same call as `windowAdded`: kwin-i3 records the switch, the window's adoption claims it, and the output shows what it did again. A new window never switches what an output shows, except under C4. Capture 2026-10-27 17:05. Built 2026-10-28 |
| C3 | A new modal dialog whose parent is in the tree | kwin-i3 | the dialog, if the parent's workspace is visible on the focused output (`manage.c:437`); else what had it (the capture: the focus stayed on the other output's empty workspace) | — | ≠ | **The dialog opens on its parent's workspace**, given the parent's desktop directly; the parent stays. i3's rule (dialog on the focused workspace, parent stays) can't hold on KWin: `Window::setDesktops` moves a window's transients with it and a modal dialog's parent with it (`window.cpp:730-742`, 6.7.5; probe 90). Capture 2026-10-27 17:05: Prism Launcher moved output. A non-modal dialog follows C1. Decided 2026-10-27, built 2026-10-28 |
| C4 | A new window on a hidden workspace (an app asking, a session restore) | KWin | the new window; its output switches to it | — | ≠ | i3 neither focuses nor shows a new window on a hidden workspace (`manage.c:432-441`); an app's activation request marks it urgent (`focus_on_window_activation smart`); a pager's or task manager's request switches to it, as here (`handlers.c:780`). **Accepted** (Paul, 2026-10-25, confirmed 2026-10-27): every activation (Alt+Tab, the task manager, an app, kwin-i3's own) reaches KWin through one policy a script can't tell apart; "do nothing" breaks Alt+Tab and the task manager across workspaces and leaves nothing to mark urgent (`i3-feature-map.md` finding 6, C4). Seen as: its desktop was shown on no output before its own switch (`Placement.target`) |
| C5 | A new window on a workspace with a fullscreen window | kwin-i3 | handed straight back to the fullscreen window, as `popupDuringFullscreen` says (§10 V6): `smart`, not if the newcomer is a transient **of the fullscreen window** (its `transientFor` chain reaches it); `ignore`, always; `leave_fullscreen`, always, but a transient of any window ends the fullscreen; `all`, not if the newcomer floats, and a floating one takes the focus wherever its workspace is visible, on either output (`manage.c:520`; i3's invisible-workspace rule, `manage.c:609`, still holds; review 2026-10-28). One that opens fullscreen itself takes over whatever the value. The fullscreen window's own **modal** dialog takes the focus under every value: KWin activates a window's modal dialog in its place (`activation.cpp:373`, `findModal`) | — | ≠ | i3's `popup_during_fullscreen` (`manage.c:424-528`, `con_find_transient_for_window`); another app's dialog opens behind it under `smart`. Kept: the modal exception, KWin's (i3 has no modal dialogs). Built 2026-10-28 (redo stages 1 and 8); before, any transient took the focus |
| C6 | A tiling window closes, in a split with others | kwin-i3 | the previous focus in that split, recorded as it closes | — | = | `con_next_focused` |
| C7 | A window at a workspace's top level, or a floating one, closes | kwin-i3 | i3's next focus (`con_next_focused`): the workspace's most recently focused window other than it, minimized ones skipped, over KWin's choice (here the window under the pointer, `NextFocusPrefersMouse=true`; stock Plasma: KWin's most recently used) | — | = | As C6, for every close now. Built 2026-10-28 (redo stage 6). Found on the way (step A): a parent whose modal dialog KWin activates in its place never entered the model's focus order; it takes its place right behind the dialog now (`activatedNow`, `windowActivated`), as i3 focuses a window at its opening before its dialog |
| C8 | The last window of a workspace closes | kwin-i3 | the empty workspace; no window active | — | = | |
| C9 | The focused window is minimized | kwin-i3 | i3's next focus (C7) over KWin's choice: KWin activates its own inside `doMinimize`, before `minimizedChanged`, so `windowActivated` sees the focused window's flag set while the model's isn't, and takes it for the minimize | — | = | i3's `move scratchpad`: the window leaves the layout (§10 V7), and the focus kwin-i3 chooses never lands on a minimized window (`tree.js` `reachable`: `nextFocused`, `descendFocused`, the focus keys, the mode toggle skip it); restoring it is an activation (the task manager, Alt+Tab). Also when KWin's own pick is no window of the tree (none, the desktop, a gap strip under the pointer): the minimize itself moves the focus to i3's next (before the review of 2026-10-28, nothing had the focus then). Built 2026-10-28 (redo stage 6) |

**D. Workspaces and outputs changed from outside**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| D1 | KWin activates a window its output isn't showing, without switching (stale) | kwin-i3 | refused; the model's focus is put back | — | + | |
| D2 | An output's virtual desktop switched outside kwin-i3 to N (the Overview, a pager, KWin's own desktop keys, an activation by Alt+Tab or the task manager, C4), **on the output with the focus** | kwin-i3 | i3's `workspace N` (`workspace_show`): N's fullscreen window, else its last focus, else the empty N (`shownOutside`) | to the focus, when it changed output (A2) | = | N living on another output (windows there, that output connected): the switched output shows what it did again and N shows on its own, so two outputs never show one workspace (capture 2026-10-27 17:05: DP-4 and DP-6 both on 5; the Overview included, Paul's call 58). Else N is the switched output's. Recorded at the signal and handled a turn later, after C2's claim. Also when KWin switched to activate a window kept out of the tree (a dialog of KWin's, a Plasma window): ≠, i3's override-redirect windows never switch a workspace, but undoing the switch would hide the window that asked to be seen, which is Plasma's (`philosophy.md`; review 2026-10-28). Built 2026-10-28 |
| D3 | The same, **on the other output** | kwin-i3 | as D2 | as D2 | = | Built 2026-10-28; before, unchanged |
| D4 | A desktop switch kwin-i3 made itself | KWin, then kwin-i3 | KWin activates that desktop's last window; the model's choice replaces it on the same pass | — | = | |
| D5 | An output lost, or back | kwin-i3 | the first output's visible workspace (the primary, `screenOrder`'s first): its fullscreen window, else its last focus, or the empty workspace | to it, if it isn't on that output (A2) | = | i3 focuses the primary output's workspace at the end of every output change, when an output is flagged primary (`randr.c:1040-1048`); KWin's `screenOrder` always has a first, so here always (until refinement stage 1 the code took `workspace.screens[0]`, the backend's order). Built 2026-10-28; before, the model's focus was kept |
| D6 | Desktops removed or reordered | kwin-i3 | rebuilt from KWin's active window (§4) | — | + | |
| D7 | A window kept out of the tree takes the keyboard (KRunner, a popup) | KWin | it keeps it through passive passes and, if override-redirect, through every key (A3), until it closes: then the model's focus again, **not** KWin's own next choice (`closingOutside`: the activation KWin makes before `windowRemoved` is set aside) | — | = | A floating one is in the tree and follows C1 and C7, as i3. Not root or a dock: those get B4 |

**E. Start**

| # | When | Who decides | Focus after | Pointer | i3 | Note |
|---|---|---|---|---|---|---|
| E1 | A login | kwin-i3 | the output under the pointer, at its workspace's focus (§12 P2) | — | = | Built 2026-10-28 (redo stage 2); before, workspace 1 |
| E2 | A reload | kwin-i3 | KWin's active window | — | + | |

### In from KWin

- **`windowActivated`**: KWin activated one of kwin-i3's windows (a click, focus follows mouse, a
  new window): the model focuses it. **Refused** when the window's workspace isn't the one visible
  on its output (a stale activation): focus is put back.
- **Before every key action** the model re-syncs from KWin's active window, without the stale
  check: a key inside the millisecond after an output unplug would take a stale activation (known,
  accepted, 2026-10-26).

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

kwin-i3 places tiling windows with KWin's own custom tiles (`docs/spike-kwin-tiles.md`); KWin's
tiles are the display, the model is the truth. `project` turns the model into a shape KWin's tiles
can hold:

- minimized windows, and fullscreen windows KWin has taken out of their tile, are left out; their
  share goes to their siblings;
- one-child splits collapse; a split inside one of the same direction merges into it, shares
  multiplied through.

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
  either look, as i3's borders sit inside its rects (Paul's capture, 2026-10-29: 2 px of a 4 px
  gap showed).
- The **outer gap per side**: `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft`, each `gapsOuter`
  unless set (-1); a workspace's own lines (`workspaceGaps`: i3's `workspace N gaps …`)
  **replace** the global values there, as i3's `gaps_for_workspace` (`gaps.c:124-160`; Paul,
  2026-10-29: before, added). **A negative outer gap** takes from the edge as i3's, but only down
  to half the inner gap, where i3 goes to 0 and past: KWin gives a tile at least half its padding
  against the screen (`tile.cpp` `windowGeometry`) and its root can't leave the output, reason
  (a); below that it is held, logged once (`WARN gaps`). The per-side keys stay 0 and up, as -1
  means "as `gapsOuter`" there.
- **`smartGaps`** (i3's `smart_gaps`): `on`, no gaps at all on a workspace with one visible tiling
  window (i3's `con_num_visible_children <= 1`: the projection is one leaf); `inverse_outer`,
  the outer gaps only on such a workspace. The ring keeps its room either way.
- Every tile has the inner padding; the root is inset on each side by that side's outer gap plus
  half the inner gap. So between windows: the inner gap; at the output's edge: that side's outer
  gap plus the inner gap (the root's inset plus the tile's own half), as i3.
- A side with an inset of 0 and a padding to halve is inset by a hair, as KWin gives a full
  padding at an edge it judges exactly 0 or 1.
- Edges are rounded to whole pixels (thirds of 2560 left a 1 px hole).

### Minimum sizes

A leaf tile's minimum is its window's minimum size plus its decoration plus the inner gap (which
holds the ring's room); splits have none (KWin's default 15 % minimum would block i3's sizes). The
display bends to fit minimums (the model keeps i3's shares, until a border drag KWin runs reads
every share of the workspace back, §9); if they can't fit at all, the window with the largest
minimum along the overflowing axis, width first, floats, repeatedly (§3 X7).

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
  the output waits 150 ms in case it is going fullscreen (`docs/spec-self-resize.md`).
- **After an output change or a resize drag**, a window whose geometry lands on its old place is
  fitted again (KWin's placement tracker and slow clients answer late).
- **A fullscreen window KWin keeps in its tile** (no rebuild since it went fullscreen) is resized
  to the tile by KWin whenever the tile's padding or geometry is written (a reload's first pass,
  a gap or frame-width change); each pass puts it back on its whole output, and so does its frame
  changing to anything else while it is still fullscreen (a client answering the resize after the
  pass, as on a reload).
- **A GTK 4 window short of its tile** after its border was taken is asked for 0 × 0, then its tile,
  so KWin resends its bounds.

**Y. Against i3** (i3 4.24 `render.c`; the rest of this section is how KWin's tiles are driven, with
no i3 counterpart)

| # | What | Here | i3 | Note |
|---|---|---|---|---|
| Y1 | The area tiled | the output's work area (`MaximizeArea`: panels left out) | = | i3 leaves out its docks (the bar) |
| Y2 | A tiling window's minimum size | respected: the display bends to fit, the model keeps i3's shares; too many to fit: the window with the largest minimum along the overflowing axis (width first) floats, repeatedly (§3 X7) | ≠ | i3 ignores size hints on tiling windows. Kept: a Wayland client draws at least its minimum whatever it is sent, and KWin's tiles won't size a window below it (§9 Z5) |
| Y3 | A window resizing itself; KWin's pack and grow keys, a maximize | put back on the next pass | = | i3 refuses a tiling window's own geometry |
| Y4 | A root tile kwin-i3 never placed (a desktop it hasn't shown) | keeps KWin's saved tiles | + | |

---

## 7. The frame and the look

Checked against i3 4.24's `config.c` (defaults) and `x.c` (`x_draw_decoration`). The text after
the table is how it works. **The look is where kwin-i3 differs from i3 most, to blend with
Plasma** (Paul, 2026-10-27), as long as it costs no performance: a look difference's reason can be
that it fits Plasma better.

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**L. The look**

| # | What | Here | i3 | Note |
|---|---|---|---|---|
| L1 | A tiling window's default look | `frame`: no title bar, a ring | ≠ | i3's default is `normal`: its own title bar (a tab) and a border. Kept: the only title bar here is KWin's decoration (Breeze, with buttons), not i3's tab; `frame` is i3's `pixel`, `bare` its `none`, `titlebars` the nearest to `normal` |
| L2 | The ring's width (`frameWidth`) | 1 px | ≠ | i3: 2 px (`default_border_width`, `config.c:213`). Reasons (b) and (c): **Paul, live, 2026-10-28**, after push back (i3's 2 px): "a mix of what I think looks good in plasma, and the general look that is popular with modern WM users" |
| L3 | The ring's colours | two classes, from the tree (`x.c:498-512`): `focused` (`frameActive` #4c7899) for the focused window; `unfocused` (`frameInactive` #333333) for every other, the other output's focused window included. The ring follows the tree's focus, not the keyboard: with KRunner or a menu open the focused window keeps its colour | ≠ | i3 has a third, `focused_inactive`, for a parent's last focus (the other output's focused window, a split's last focus, an unfocused floating window). **Left out** (Paul, 2026-10-28, after it went live: a third colour confused more than it told). i3 draws the border in `child_border`, by default the class's **background**: #285577, #5f676a, #222222. Kept: Plasma-friendly defaults (Paul, 2026-10-27/28, call 36); `urgent` stays out with urgency. Built 2026-10-28 (redo stage 7): the script sends each shown window's class to the effect at the end of a pass, only when it changes; the script also tells the effect the tree's focused window (`SetFocused`, whatever the frame), and a window not yet told its class is `focused` only if it is that window; after a release, none is. Built 2026-10-28 (refinement stage 2); before, the effect coloured KWin's active window `focused` until told |
| L4 | A window alone in a split | the side where the next window opens (right in a horizontal split, bottom in a vertical one; the workspace counts, so a window alone on its workspace has it too) is drawn in the class's indicator colour after Split H, Split V or Toggle Split on it (the effect's `ShowIndicator`), until the tree's focus moves to another window (`SetFocused`; refinement stage 2, before: any activation, KRunner's or a popup's too) or the window is no longer alone in its split; otherwise in the frame's colour. No timer: it goes with the repaint of a focus change or a layout change (a fade's own repaints left the side stale on Paul's NVIDIA monitors, 2026-10-28). `frameIndicatorActive` #3daee9, `frameIndicatorInactive` empty, the class's frame colour | ≠ | i3's `x.c:585-599` (its #2e9ef4, #484e50, #292d2e) draws it always. Built 2026-10-28 (redo stage 7); the defaults Paul's call 36 and review 67; only after a split key, until the focus leaves or the split happens, Paul's call 2026-10-28 (OPEN.md item 44) |
| L5 | Gaps (`gapsInner`, `gapsOuter`) | 4 px between, 2 px more at the edges | ≠ | i3: 0 and 0 (`config.c:218-222`). Reasons (b) (the inner 4 is KWin's own tile padding, `tile.h:181`) and (c): **Paul, live, 2026-10-28**, as L2 |
| L6 | `hide_edge_borders`, `smart_gaps` (i3's `smart_borders` is a deprecated alias of `hide_edge_borders smart \| smart_no_gaps`) | `hideEdgeBorders` (`none` default): `smart` draws no ring on a workspace with one visible tiling window, and its tile leaves no room for it; `smart_no_gaps` the same when that workspace has no outer gap; `vertical`, `horizontal`, `both` leave out the ring's left and right, top and bottom, or all sides where the window's tile is at the root's edge and the inner gap is 0 (i3's `con_adjacent_borders` on the rendered rects: an outer gap moves the workspace's rect, an inner gap moves the window off it). `smartGaps`: §6. Floating windows never | ≠ | i3's `con.c:1821-1879`. Built 2026-10-28 (redo stage 7). `vertical`, `horizontal`, `both` leave a strip of the ring's width where the side was: ≠, KWin's tiles have one padding for all sides and a root inside its output (Paul's call 41, 2026-10-28) |
| L7 | A window's own look (i3's `border normal \| pixel N \| none`, `border toggle`, `for_window … border`) | one look for all tiling windows | ≠ | kept: no command language (§8 K22), and §3 R9's criteria set floating only |
| L8 | `titlebars`: maximize button, title-bar double-click | nothing | + | the tree places it, as sway (`docs/spec-tiled-look.md` B) |
| L9 | Rounded corners (`roundedCorners`) | on: Breeze's 5 px on tiling framed windows | ≠ | i3 has square corners. **Kept** (Paul, 2026-10-27): rounded by default, square a choice (the setting off): the floating windows around them are Breeze's, rounded |
| L10 | A floating window | its own decoration (KWin's title bar and border) | ≠ | i3's `default_floating_border normal 2`: i3's title bar and border; here Plasma's, reason (b), as L1 |
| L11 | A floating window's ring (`frameOnFloating`, off) | L3's classes: `focused`, else `unfocused` (i3's would be `focused_inactive`, left out as L3); no indicator | ≠ | i3's `x.c`. Built 2026-10-28 (redo stage 7): `frameFloatingActive` and `frameFloatingInactive` are no longer read (the load report says so once to a user who set them); by default (`frameOnFloating` off) a floating window keeps Plasma's styling, its title bar and no ring |
| L12 | Floating above tiling | kept above (kwin-i3 owns Keep Above), except on a Floating workspace while the effect marks floating windows | = | i3 keeps floating windows above tiling ones. Keep Below overwritten: + |
| L13 | No ring on a fullscreen window | none | = | i3 draws no border on a fullscreen window |
| L14 | No ring on a minimized window, or on a floating one with a client-side decoration (a tiling one is framed like any other) | none | + | i3 refuses minimize; it borders every window, as X11 apps there draw no shadow |
| L15 | Colours, width | colours forced opaque; width 1-10 | + | |
| L16 | The hold: windows that change together switch in one frame | `kwini3hold` | + | i3 has no compositor and draws one tree at once; the hold gives that on KWin |
| L17 | Without the effect | every tiling window keeps its title bar | + | |

### Tiling windows

`tiledLook`, with the effect loaded:

- `frame` (default): no title bar; the effect draws a ring `frameWidth` px outside the window, in
  its colour class's colour (L3) with the indicator side, after a split key, in the class's indicator colour (L4), and
  the tiles leave room for it;
- `titlebars`: the window's own decoration; its maximize button and a title-bar double-click do
  nothing, as in sway (decided, `docs/spec-tiled-look.md` B: the tree places it);
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
given back. It reasserts this every pass (the window menu, `borderlessMaximizedWindows`).

### Floating windows

- Keep their own decoration. With `frameOnFloating`, their border is taken and the effect draws
  the ring in the colour classes (L11), except on a window that draws its own title bar: no
  border is taken, so no ring and no frame focus (`takeBorder`, `floatingFramed`).
- Are **kept above** tiling windows (kwin-i3 owns their Keep Above flag, including one left by a
  previous instance; `docs/spec-reload-keepabove.md`), except on a Floating workspace while the
  effect marks floating windows. Keep Below is overwritten (`LATER.md` item 27).
- The effect knows which windows are floating (`SetFloating`); the set survives a script reload.

### The hold (atomic layout)

`kwini3hold`, `docs/spec-atomic-layout.md`. When a tiling window on a visible workspace is about to
move or resize, the effect snapshots it and draws the snapshot at the old place. Every other
window moving within 3 ms joins. When every held window's frame geometry equals what it was asked for, all
switch at once in one frame; after `holdTimeoutMs` (default 200, Sway's `txn_timeout_ms`) they switch regardless. A held
window that is no longer visible counts as settled.

- **A tiling window closing** stays drawn: inside an open hold it joins it; otherwise it waits 20 ms
  for a neighbour to start moving, then goes.
- **A new normal window** (not a dialog, modal or transient) is hidden for up to 20 ms; if a tile
  places it, it joins the hold and appears at its place.
- Direct scan-out is blocked while holding.
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
| K4 | Resize Mode (Meta+R), then Shrink Width / Grow Height / Shrink Height / Grow Width | Meta+R; in the mode J Left, K Down, L Up, ; Right, by key position (evdev code, no layout refit), on press and repeat; Return, Escape or Meta+R leave; the four actions themselves unbound (a user who wants them flat binds them) | ≠ | i3's `mode "resize"` (`etc/config.keycodes`), in the helper (`plugin/resizemode.cpp`): its key filter sits ahead of KWin's global shortcuts only while the mode is on; Meta+R exactly, as i3 matches modifiers exactly (`bindings.c`), so Meta+Shift+R doesn't leave; every other key goes on, and kwin-i3's own keys do nothing meanwhile (`KEY … ignored: the resize mode is on`). ≠: **Plasma's shortcuts still run** (volume, screenshot, the launcher), where i3's mode leaves only its own keys bound and every other key reaches the window: `philosophy.md`, Plasma does hardware and the rest (review 2026-10-28). The screen locking doesn't leave the mode, as i3. The sign (Paul's call 34): a banner at the top of the tree's focused window (`SetFocused`; refinement stage 2, before: KWin's active window, so KRunner took it), drawn by the effect (`SetMode`), in the frame's active colour, reading "Resize (Esc)": i3's bar shows only the mode's name, `resize` (i3bar's binding mode button, `xcb.c:2172`), here with the way out (Paul, 2026-10-28). Tiling resizes by `resizeStep` % (i3's 10 ppt), floating by `floatingStep` px. Without the helper the key does nothing and the load report says so (§13). Built 2026-10-28 (redo stage 5); before, Meta+Ctrl+arrows and Meta+Ctrl+J K L ; |
| K5 | Split H / Split V | Meta+H / Meta+V | = | |
| K6 | Toggle Split | Meta+E | = | `layout toggle split` |
| K7 | Stacking, Tabbed (i3: Meta+S, Meta+W) | none | ≠ | Out (`plan.md` Scope, Paul 2026-10-21). Meta+W is Plasma's Overview |
| K8 | Focus Parent (i3: Meta+A) | none | ≠ | Out (Paul, 2026-10-21: "never used this"); tidy's removal of a split holding only a split rests on it (`plan.md` decision 8). **Kept** (Paul, 2026-10-27): out: it needs a focused group of windows drawn and tidy revisited, a feature, not a key |
| K9 | Floating Toggle | Meta+Shift+Space | = | |
| K10 | Focus Mode Toggle | Meta+Space | = | |
| K11 | Fullscreen | Meta+F | = | KWin's Window Fullscreen; how it differs from i3's is §10 |
| K12 | Close | Meta+Shift+Q | = | KWin's Window Close: asks the window to close, as i3's `kill` |
| K13 | Workspace 1 … 10 | Meta+1 … Meta+0 | = | |
| K14 | Move to Workspace 1 … 10 | Meta+! @ # $ % ^ & * ( ) | = | the US Shift+digit symbols; refitted by position (below), as i3's `bindcode` |
| K15 | Reload Settings | Meta+Shift+C | ≠ | i3's `reload`. KWin's reconfigure, so all of KWin's settings are re-read: ≠ kept, it is the only way a script re-reads its own |
| K16 | Restart (i3: Meta+Shift+R) | none | ≠ | i3's in-place restart, for a new binary; here an install reloads kwin-i3. **Kept** (Paul, 2026-10-27): none |
| K17 | Exit | Meta+Shift+E | = | Plasma's logout prompt (`org.kde.LogoutPrompt` `promptLogout`), its confirmation as `i3-nagbar`'s. Built 2026-10-28 (redo stage 5) |
| K18 | Terminal, Launcher | Meta+Return, Meta+D | = | i3's `i3-sensible-terminal` and `dmenu_run`: Plasma's default terminal (kdeglobals' `TerminalService`, Konsole when unset), launched by the helper through kglobalaccel's `_launch` for its desktop file so it gets its own systemd scope, not KWin's (probe 92; without the helper the key does nothing, §13); KRunner (`org.kde.krunner.App` `display`). A Plasma default on Meta+D (Show Desktop, where set) is reported as a taken key; a holder that launches the same thing (KRunner's own `_launch`, the default terminal's) is not (call 63). Built 2026-10-28 |
| K19 | Back-and-forth, next/prev, output moves (§4), the no-back-and-forth forms (S5), next and primary outputs (S8, S9) | none | = | unbound in i3's config too |
| K20 | Release | Meta+Ctrl+Shift+Q | + | the safety valve (§12) |
| K21 | Dump State | none | + | `tools/capture` (Meta+Shift+B, from the dotfiles) |
| K22 | Any other command on a key (`bindsym`, arguments, `mode`, chains) | none | ≠ | kept: a key runs one fixed action; no command language (§4 S5, S8) |
| K23 | The volume and media keys (i3's config binds them to `pactl`) | Plasma's | ≠ | hardware is Plasma's (`plan.md` Out), and another component's shortcut stays its own: reasons (d), (e) |

- **Move Right's second key is Meta+:** because Shift+; arrives as `:`; Meta+Shift+; never fires.
- **Floating windows by key**: a move is refused only if the window would leave every output;
  crossing to another output joins the workspace visible there. A resize grows or shrinks to the
  right and down; a window that isn't resizable doesn't. A floating window that is fullscreen or
  maximized ignores these keys.
- **Retired actions** are unregistered at every load.
- **Debug actions** (`Selftest …`) are registered only when `debugLog` is on at load.

### Keyboard layouts

KWin matches a shortcut by the typed symbol, not the key's position. With the helper, the 37
position keys are refitted to the current layout at load, on every layout change and on the
script's `FitKeys`: Workspace 1-10, Move to Workspace 1-10, Focus Right (;), Move Right (:), and
since refinement stage 6 (Paul's call 36) the letters i3 binds by keycode: Focus and Move Left,
Down, Up (J K L), Split H, Split V, Toggle Split (E), Fullscreen (F), Resize Mode (R), Launcher
(D), Close (Shift+Q), Reload Settings (Shift+C), Exit (Shift+E). So on Dvorak or AZERTY the keys
keep their QWERTY places, as i3 4.24's `etc/config.keycodes` through `i3-config-wizard` gives them
(a shifted key types its Shift symbol where the place holds no letter: Close on Dvorak is
Meta+"). ≠ i3 in one point: the wizard fits once, at the first run; here every layout switch
refits, reason (a): KWin matches the current layout's symbol, and a fit done once breaks at the
first switch. A key is changed only if it still holds the US default or what the helper set
last (recorded in `~/.config/kwini3helperrc`, `[LayoutKeys]`); a key the user bound is theirs. A
key with no symbol on the layout is emptied. A key set by hand to the US default counts as kwin-i3's. One fit runs
at a time; a change during one queues another (`docs/spec-keyboard-layouts.md`).

### Taken keys

**Which holder wins a shared key**: kglobalaccel gives the key to every action that asks
(`registerShortcut` never fails), and a press runs **the active holder registered first, ever**:
each action gets a serial at its first registration, kept across logins
(`~/.local/state/kglobalshortcutsstaterc`), and the lowest serial among the active holders runs
(kglobalacceld 6.7.5, `GlobalShortcutsRegistry::activeShortcutByKey`). So Plasma's own actions
beat kwin-i3's (live: Quick Tile Left 141, kwin-i3 Focus Left 504); an app installed after
kwin-i3 that asks for one of its keys loses to it; a holder that isn't active (its app not
running) doesn't block. `KGlobalAccel.action(key)` names the holder that runs.

At load (with `warnTakenKeys`), kwin-i3 asks kglobalaccel which of its keys another active
component holds, and reports them (§13); a holder that launches what the kwin-i3 action launches
(KRunner's own `_launch` on Meta+D, the default terminal's on Meta+Return) is logged
(`TAKEN-SAME`), not reported: both fire the same thing (Paul's call 63, redo stage 5). `make take-keys` frees them, recording the holders in
`~/.local/state/kwin-i3/taken-keys.json`; `make restore-keys` gives them back. The settings page's
Keys page takes a key the same way on Apply, recording it in the same file
(`docs/spec-taken-keys.md`).

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
| G1 | Meta+left anywhere in a tiling window | the drag starts at once, **without activating** the window; after the drop the focus stays where it was unless the dragged window had it (`Tree.drop`) | = | i3 starts the drag before it focuses anything (step 2 before 3; `tiling_drag`, `set_focus`). A title-bar drag still activates first (step 3 then 8). Built 2026-10-28 (redo stage 6) |
| G2 | Left on a tiling window's title bar (the title-bar look), no modifier | activated and raised as KWin's title-bar click; the drag starts after the **drag distance**; a title-bar button keeps its click | ≠ | i3: focuses (step 3), then drags after **15 logical px** in a straight line (`drag.c`, `threshold_exceeded`); here Plasma's drag distance (System Settings, default 10 px), measured along the axes added together. **Kept** (Paul, 2026-10-27): Plasma's own setting, so it follows what the user set |
| G3 | Which presses start a drag | `tilingDrag`: `modifier titlebar` (default, i3's shipped config), `modifier`, `titlebar`, `off`; read by the helper from kwinrc. A press the setting leaves out still activates and is swallowed on a tiling window; floating windows are KWin's, but for Meta+Shift+left (G13) | ≠ | i3's `tiling_drag` (=); i3 replays the left-out press to the app (`click.c`, `allow_replay_pointer`). Swallowed for G4's reason: KWin's window-action filter runs after the helper's, and a Meta press let through would be KWin's move, floating the window (review 2026-10-28: was marked =). Built 2026-10-28 (redo stage 6) |
| G4 | Nowhere to drop (`has_drop_targets`: fewer than two tiling windows and empty visible workspaces, all outputs counted) | no drag; a Meta press is **swallowed** | ≠ | the count is i3's (=). i3 then focuses the window and passes the press on to the app (steps 3 and 10, `allow_replay_pointer`). Decided as i3 on 2026-10-27, then **kept** (Paul, 2026-10-28): KWin's window-action filter runs after the helper's, so a Meta press let through would be KWin's move, floating the window (`docs/spec-redo-6-clicks-closes.md`) |
| G5 | Meta+Shift+left | not a tiling drag: KWin's own move pulls the window out of its tile, and it floats where dropped. **That move runs without Shift**: Shift held during a KWin move is its drop into a custom tile (6.7.5 `window.cpp:1245` draws an outline over each tile passed, `:1108` tiles the window at a release with Shift down), and every kwin-i3 window sits in one; the helper's `TilingDragFloat`, just ahead of KWin's move filter, passes the move's motions, keys and release with Shift taken out (Paul's capture, 2026-10-29: the gray outlines over each window passed) | ≠ | i3's Shift there is the swap modifier (`tiling_drag swap_modifier`, default Shift, `tiling_drag.c:341`); here it is a **float modifier**, as the centre drop swaps anyway (G11). Reason (c): **Paul, live, 2026-10-28**, a deliberate mouse feature for the Plasma audience, working both ways: its other half is G13. Once per press of the keys, as G13 |
| G6 | While dragging | the effect draws the drop indicator, the cursor is the move cursor, the pointer reaches no window and focus doesn't follow it | = | i3 masks enter events and maps an indicator window with the move cursor. The indicator's colour, `frameActive` at half opacity (i3: `client.focused.indicator`, opaque), is §7's |
| G7 | How a drag ends | **any button's release** drops at the pointer (another button's press is swallowed); **any key press** cancels and the key goes on (its binding still runs): a key filter ahead of KWin's shortcuts, installed while a press is held (`TilingDragKeys`); **a window closing on the focused workspace** ends it at once and drops where the pointer last was (kwin-i3 tells the helper `Cancel`, then drops), unless the dragged window or the target is the one closing | = | i3 4.24 drops on any button's release (`drag.c:61-65`; i3's `next` branch only on the drag button's), and its grab hides another button's press, as here; a key is `DRAG_REVERT`, as here; an unmap on the focused workspace is `DRAG_ABORT` (`drag.c:77-87`), no revert, so the drop happens at the last target if it exists (`tiling_drag.c:325`). Refinement stage 6; before, a close cancelled. Built 2026-10-28 (redo stage 6); before, Escape and another button's press cancelled. Z7's resize the same |
| G8 | What is under the pointer (`find_drop_target`) | the tiling windows of every visible workspace, any output, not under another's fullscreen (`is_tiling_drop_target`); over no window (a gap), **the focused tiling window of the workspace shown there**, else that workspace if empty | ≠ | Was written as "the visible workspace there", which the code doesn't do. Over a gap the pointer is outside that window, and which side it lands on is then judged from the pointer: ≠ kept, i3's own result there comes from unsigned arithmetic going negative, not a rule |
| G9 | Where on the target (`drag_callback`) | within 30 % of its smaller side (at least 2 px) of an edge: beside it on that side; within the **parent strip** (`render_deco_height()` + 5 px, capped 1 px inside the side zone) on a side its parent shares: beside the highest ancestor on that side; else the centre | = | `render_deco_height()` is the title bar's height in the title-bar look, else 20 px (about i3's default font's). Dropped onto itself: only a parent drop does anything |
| G10 | A side or parent drop | as i3: a split where the orientation differs (or the two-window parent flips), then inserted; a parent drop moves it out with i3's move | = | `DT_SIBLING`, `DT_PARENT` |
| G11 | A centre drop onto a window | the two **swap**, Shift or not; onto an empty workspace it moves there | ≠ | i3 moves it after the target (`con_move_to_target`), and swaps with the swap modifier. Kept (Paul, 2026-10-26: "I love swap"): without tabs, i3's centre move is the same as a side drop, so the centre would add nothing |
| G12 | The dragged window fullscreen | it leaves fullscreen for the drop and gets it back, unless the target workspace has a fullscreen window and it didn't have focus | = | the end of `tiling_drag` |
| G13 | **Float to tile**: Meta+Shift+left on a floating window of kwin-i3's (with `tilingDrag`'s `modifier`; otherwise KWin's move) | a tiling drag of it, as G1 and G6-G10, G12: no activation, the indicator, any key cancels; dropped, it is tiled first (as the floating toggle, T17: unstuck, the floating look gone), then placed as a tiled window would be; **a centre drop puts it after the target**, no swap. Cancelled: it stays floating where it was. **Once per press of the keys**: after a Meta+Shift drag ends, either way (this or G5), a further Meta+Shift+left press does nothing until Meta or Shift is released. With nowhere to drop (no tiled window or empty workspace shown), the press does nothing | + | i3 never tiles a floating window by dragging (`click.c:251-258` guards the tiling drag with `!floatingcon`; Shift only means `proportional`, `:221`). Reason (c): **Paul, 2026-10-28**, G5's other half (`docs/spec-float-to-tile.md`). The centre is i3's own centre drop (`con_move_to_target`): G11's swap is for two tiled windows, and here it would float the target |

**Z. Tiling resize (Meta+right-drag)**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| Z1 | Meta+right in a tiling window | activated; **the nearest edge** is resized, against the nearest ancestor with a sibling on that side (climbing, as `resize_find_tiling_participants`, `resize.c:72-120`); nothing if none has, or at a tie (the press swallowed) | = | i3's `floating_mod_on_tiled_client`. Built 2026-10-28 (redo stage 6; Paul's call 66: a press nearer the screen's edge than the boundary does nothing); before, the nearest edge that had a neighbour |
| Z2 | Meta+right in the gap, within half the inner gap + 1 px of a tiling window, or on its ring | as Z1, on the nearest tiling window | + | i3's gap press only focuses that output's workspace. Kept: Paul, 2026-10-26, asking for i3's "anywhere near that area" (spec decision B) |
| Z3 | **Left or right press on the ring** (i3's border), no modifier | activated and raised (F3), and a drag resizes against the neighbour on **the side pressed** (top, then left, right, bottom at a corner), at the release as Z5-Z7; no neighbour on that side: only the activation | = | i3's `tiling_resize`, `CLICK_BORDER`. The ring is the target, 1 px at the default width (Paul's call 65); the helper's `pressRing` reports the side with the press. Built 2026-10-28 (redo stage 6). Also over a tiled window's own input area past its frame (an app drawing its own frame, VS Code: an invisible resize border, kept since KWin reports no tiled edges for a padded tile, `tile.cpp` `Tile::anchors`): the ring is Z3, never the app's resize, which KWin ran as its live tile resize (OPEN.md item 43, 2026-10-28). **A plain left or right press in the gap** (over the desktop or such a margin), within Z2's reach: as on the nearest tiled window's ring, on its side facing the press; the gap is a handle, not desktop: + (i3's gap is the root window, where a press focuses the output, `click.c:410-426`), reason (c), Paul, live, 2026-10-28 |
| Z4 | Right press on a tiling window's title bar (title-bar look); or a left press there with no drag | KWin's: the window menu; the title-bar click | ≠ | i3 resizes against the neighbour above (`CLICK_DECORATION`, `BORDER_TOP`). **Kept** (Paul, 2026-10-27): the window menu is how Plasma reaches its window actions (keep above, KWin rules, activities), which i3 has none of |
| Z5 | While resizing | the pointer is warped onto the boundary (the middle of the gap between the two descended-focused leaves), the cursor shows the direction, a 2 px bar follows the pointer; nothing moves until release | ≠ | `resize_graphical_handler`. The bar stays within both participants' minimum sizes: ≠ kept, KWin's tiles refuse a tile below its window's minimum (i3 keeps it 25 px inside the output) |
| Z6 | A fullscreen window on the workspace | refused | = | i3 refuses between containers of different fullscreen modes, which is the same here: the fullscreen window covers the rest |
| Z7 | Release | the two shares change by the distance (`resize_neighboring_cons`); if the layout changed meanwhile, nothing (`docs/spec-tiling-resize.md`). Ending otherwise: as G7 (any key cancels, any release drops, a close on the focused workspace ends it and resizes from where the pointer last was, unless a participant is the one closing) | = | as G7 (`resize.c:274` reverts only on `DRAG_REVERT`); the layout check is + (KWin's tiles are rewritten under the drag, reason (a)) |
| Z8 | A drag on a tiling window's edge in the title-bar look (KWin's resize) | KWin resizes, and the result is read back into the shares (§6) | + | |
| Z9 | **The gaps are kwin-i3's** (the pointer over a gap or a ring, anywhere between tiled windows and at the outer edges, within Z2's reach) | the arrow; a press there is Z2/Z3's, never an app's: transparent strips of kwini3helper's own (`gapstrips.h`) cover the gaps, above every app's invisible resize band (VS Code's default title bar, Chromium, Electron, GTK header bars hold the pointer up to 10 px past their frame); never over a floating window, panel, popup or notification, none on an output with a fullscreen window. A tiled window under the pointer is raised among the tiled ones (invisible; floating windows stay above; no focus change), so a neighbour's band can't take its own frame's pixels; a press there before the raise lands does nothing | = | i3 reparents each client into its frame window (`manage.c:554`): clipped by X11, no client takes a pixel of the gap, the arrow on frames and root (`x.c:171`), a resize cursor only once a resize has started (`resize.c:238`). Built 2026-10-28 (`docs/spec-gap-ownership.md`, OPEN.md item 43) |

**F. Floating windows, the ring, and the rest**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| F1 | A floating window | KWin's own: Meta+left moves, Meta+right resizes, the title bar moves, the edges resize, Meta+middle raises or lowers; a click raises | = | i3's `floating_modifier` drag and resize. Differences kept, as Plasma's (KWin's window actions): i3's Meta+Shift+right keeps the proportions and its title-bar right press resizes, where KWin opens the window menu. **Kept** (Paul, 2026-10-27): floating windows are KWin's (`plan.md` Scope) |
| F2 | Hovering the ring, focus follows mouse | focuses its window (KWin's delay) | = | The ring is its window's, as i3's border |
| F3 | A click on the ring | activates and raises the window as KWin's window-click commands say; swallowed | = | i3 focuses on a border press (step 3). With Z3 decided, a drag resizes |
| F4 | A scroll on the ring, no modifier | focuses the window (activated); swallowed | = | i3's step 3 on a border. Built 2026-10-28 (redo stage 6); before, swallowed only |
| F5 | A modified click on the ring (Meta+drag) | passes on, to G1, Z2 | + | |
| F6 | Floating windows' rings | count for F2-F5 only with `frameOnFloating` | + | |
| F7 | Mouse bindings (i3's `bindsym button1`, `--whole-window`, `--border`, `--release`) | none | ≠ | KWin's window actions (System Settings) set what Meta+buttons do, and the Meta+left/right ones must stay as kwin-i3 needs them. **Kept** (Paul, 2026-10-27): none; i3's are commands bound to buttons, and kwin-i3 has no command language (§8: a key takes no arguments) |
| F8 | No drag or resize starts while a game holds the pointer or shortcuts are inhibited | the press is the app's | + | |
| F9 | **Without the helper** | Meta+drag is KWin's own move: the window leaves its tile and floats where dropped | + | |
| F10 | **Popup grace**: a panel popup active | KWin's focus delay is 1.5 s, so crossing the gap between a floating panel and its popup doesn't focus the window beneath (KDE bug 511162); any other activation puts back the user's `DelayFocusInterval`, read fresh from kwinrc (KWin's default, 300 ms, when the key isn't there; refinement stage 3, before: 0) | + | i3's popups grab the pointer (§5 B7) |

---

## 10. Edge cases

Checked against i3 4.24's `con.c` (`con_enable_fullscreen`, `con_get_fullscreen_con`) and
`handlers.c` (client messages: fullscreen, desktop, iconic).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**V. Fullscreen, minimize, maximize, KWin's own tools**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| V1 | A window goes fullscreen (Meta+F is KWin's, or the app asks) | it stays in the tree (`docs/spec-fullscreen-tree.md`) and covers its output, panels too; KWin takes it out of its tile, its siblings fill the space; it gets the focus; it rejoins when fullscreen ends. No ring, no gaps | = | i3's `fullscreen` (`CF_OUTPUT`): the container keeps its place, covers the output and the bar, gets the focus (`con_enable_fullscreen`), no border |
| V2 | A second window goes fullscreen on the same workspace | the first one's fullscreen ends | = | "disable any fullscreen container that would conflict". KWin itself allows several |
| V3 | Fullscreen across all outputs (i3's `fullscreen enable global`) | none | ≠ | kept: KWin's fullscreen is one output's area |
| V4 | A floating window fullscreen (a game, `mpv --fs`) | its workspace's fullscreen window, as a tiling one; a tiling one at the top level wins a tie | = | `con_get_fullscreen_con` searches the floating windows too |
| V5 | A fullscreen window floated or tiled again, or moved | it stays fullscreen; focus and moves across it are blocked (§2, §5) | = | |
| V6 | A new window on a workspace with a fullscreen window | `popupDuringFullscreen`: `smart` (default), `ignore`, `leave_fullscreen`, `all`, as §5 C5 says | ≠ | i3's setting and values; the fullscreen window's own modal dialog takes the focus under `ignore` too (C5: KWin's modal rule). Built 2026-10-28 (redo stage 8) |
| V6b | The other floating windows of a workspace with a fullscreen window | an activation of one (Alt+Tab, the task manager, an app) is handed back: the fullscreen window keeps the focus and stays on top, as C5 for a new window; `popupDuringFullscreen` `all` lets every floating window over, `smart` the fullscreen window's own transients, and its modal dialog always (KWin's modal rule, C5) | = | i3 draws no floating window above a fullscreen one (`render.c:253-270`, `fullscreen_blocks_floating_render`, the same exceptions) and won't focus one (`con_fullscreen_permits_focusing`). Refinement stage 7; before, KWin raised the activated one over it |
| V7 | Minimize | out of the layout, its share to its siblings; back where it was when restored (the leaf stays in the tree, marked `_` in the tree log); never the focus's choice (§5 C9). Across a reload a minimized window loses its place | ≠ | i3's scratchpad leaves the layout too, but `scratchpad show` brings the window back floating (`scratchpad.c`). **Kept** (Paul, 2026-10-28): restored to its place; Plasma's minimize is a restore, not a scratchpad. Built 2026-10-28 (redo stage 6) |
| V8 | Maximize | no handler: it leaves its tile, the next pass puts it back, and that clears the maximize | = | i3 has no maximize and ignores the request |
| V9 | A window moved to another desktop by someone else (Overview, a window rule) | kwin-i3 follows: a move to that workspace | = | i3 moves the window on `_NET_WM_DESKTOP` |
| V10 | A window put on all desktops, or on two (outside kwin-i3's own relocate) | all: sticky floating (§3 R3, X4), an already floating one too; two: leaves the tree until it is on one (R13) | ≠ | i3 floats it and makes it sticky only if `floating_enable` succeeds (`handlers.c:890-895`), so an already floating window isn't made sticky. Kept (review 2026-10-28, the rule of `philosophy.md`: ride i3 unless KWin can't): KWin applies the request itself before kwin-i3 hears of it, so refusing it means undoing it, and KWin's own "On All Desktops" menu entry would snap back. Built 2026-10-28 (redo stage 9) |
| V11 | A tiling window resizes itself | put back (§6) | = | i3 ignores a tiling window's size requests |
| V12 | KWin's quick tile; Meta+T's tile editor; a Shift-drag into KWin's tiles | pulled back into its tile; the editor's tiles are overwritten on the next pass (`LATER.md` item 26); the Shift-drag puts two windows in one tile until the next pass | + | |
| V13 | A modal dialog | floats (§3); KWin moves it with its parent; kwin-i3 waits while either is dragged | + | |
| V14 | **An output returning to a fullscreen window on a hidden workspace** (known limit, accepted, Paul 2026-10-22; fuzzer I9, seeds 214 and 28) | KWin asks the window to be fullscreen again and to move back, but a hidden window gets no frame callbacks, never acknowledges, and KWin applies nothing until it does. Meanwhile KWin calls it not resizable and refuses the tile, so kwin-i3 floats it where it stands, out of sight. Meta+Shift+N, or closing it, brings it back. The same holds for a hidden floating window smaller than KWin's 150 px decorated minimum | + | |

### Known limits

Accepted, as the code stands (Paul, 2026-10-27): facts about the behaviour, not a list of work.
One that should change becomes an `OPEN.md` or `LATER.md` item. Most were found by the reviews of
2026-10-22 to 10-24 (git history) and checked against the code 2026-10-27.

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
  on (`docs/spec-reload-keepabove.md`, "The login edge").
- **Focus keys over a fullscreen window** are judged per workspace: with a floating window focused
  over a fullscreen app, a focus key is refused where i3 (which judges from the focused window's
  own fullscreen ancestor) allows it. Kept, Paul 2026-10-27: i3's form would let a key focus a
  window behind the fullscreen one, which KWin then shows above it.
- **Focus mode toggle under a fullscreen window** (Meta+Space) focuses the other kind and leaves
  the fullscreen flag on, where i3 drops it (`con_activate_unblock`). Accepted, Paul 2026-10-27.
- **A rare wallpaper flash** for a few frames, after closing a tiling window beside another, at
  or after kwini3hold's release (i3 has it on every close: it pushes the new layout to X at once,
  `x_push_changes`, and nothing waits for the clients). Two causes, from Paul's captures
  (2026-10-27, 2026-10-28; `OPEN.md` items 21 and 41 in git history): **a slow client** outlasting
  `holdTimeoutMs` (an Alacritty busy with a terminal UI took ~250 ms, the hold released at 200,
  the wallpaper showed for 37 ms), and, likely, **Firefox's content subsurface** resizing after its
  toplevel: the hold checks only the toplevel's frame geometry (Sway hit the same, Mozilla bug
  1585314). Accepted, Paul 2026-10-29: 200 ms (Sway's) catches nearly every close cleanly, and
  longer would feel stale.
- **Frame focus** with `frameOnFloating` takes the clicks around any borderless normal window,
  including one the user made borderless, as the helper can't read the effect's floating set.
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
- **A window adopted late on a Floating workspace** (as above) opens tiling: only a window new to
  kwin-i3 takes the workspace's floating.
- **Keep Above is kwin-i3's on its windows**: a user's own Keep Above is cleared when the window is
  tiled, and unticking it on a floating window doesn't stick (won't-fix, i3 has no such flag;
  `docs/spec-windows-placing-themselves.md`, `LATER.md` item 27).
- **Release leaves the effect's floating marks**: after a release and a reload, the windows that
  were floating come back floating.
- **After a reload a fullscreen window comes back at the end of its row** (accepted, pinned by a
  test; `docs/spec-fullscreen-tree.md`). A fullscreen request not yet applied reads as a fixed
  size, so such a window opens floating.
- **A window kept out of the tree, quick-tiled by KWin into one of kwin-i3's tiles**, loses that
  tile at the next pass.
- **Internal, harmless**: each closed window leaves a small entry in the script's signal
  bookkeeping for the session; every key places all workspaces again (idempotent, but logged).

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
| `gapsInner` | 4 | 0-100 | gap between tiling windows (even; an odd value counts as the one below) | next pass |
| `gapsOuter` | 2 | -100-200 | added at the output's edges; below 0 taken, down to half the inner gap (§6) | next pass |
| `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` | -1 | -1 (as `gapsOuter`), 0-200 | that edge's outer gap (i3's `gaps top` …; §6) | next pass |
| `workspaceGaps` | empty | `N gaps inner \| outer \| horizontal \| vertical \| top \| right \| bottom \| left M`, one per line or `;`- or `,`-separated, `workspace` optional | i3's `workspace N gaps …`: in place of the global gaps on that workspace, as i3; an outer M below 0 as `gapsOuter`'s (§6) | next pass |
| `smartGaps` | `off` | `off`, `on`, `inverse_outer` | i3's `smart_gaps` (§6) | next pass |
| `hideEdgeBorders` | `none` | `none`, `vertical`, `horizontal`, `both`, `smart`, `smart_no_gaps` | i3's `hide_edge_borders` (§7 L6) | next pass |
| `defaultOrientation` | `auto` | `auto`, `horizontal`, `vertical` | a new workspace's direction | new workspaces |
| `resizeStep` | 10 | 1-50 % | resize by key, tiling | next press |
| `floatingStep` | 10 | 1-200 px | move and resize by key, floating | next press |
| `focusWrapping` | `yes` | `yes`, `no`, `force`, `workspace` | §2 | next press |
| `mouseWarping` | `output` | `output`, `none` | §5 A2: the pointer follows the focus to another output, or never | next focus change |
| `popupDuringFullscreen` | `smart` | `smart`, `ignore`, `leave_fullscreen`, `all` | §5 C5: what a new window may do on a workspace with a fullscreen window | new windows |
| `workspaceOutputs` | empty | `N=OUTPUT [OUTPUT …], …`, N 1-10 | workspace outputs, the first connected wins (§4 W5) | at login, when an output appears, and for a workspace first used after |
| `workspaceAutoBackAndForth` | off | | §4 | next press |
| `forWindow` | Spectacle, the password prompt, KRuler, plasmashell's Normal windows: `floating enable` | i3's `for_window` rules, one per line or `;`-separated (§3 R9) | the kinds | every rule anew on every window |
| `assign` | empty | i3's `assign` rules (§3 R19) | where a new window opens | new windows |
| `floatingMinimumSize` | `75x50` | `WxH`, 0 i3's default, -1 none | §3 R20 | a window becoming floating |
| `floatingMaximumSize` | `0x0` (all outputs together) | `WxH`, -1 none | §3 R20 | a window becoming floating |
| `floatingWorkspaces` | empty | numbers 1-10 | read as `[workspace="^N$"] floating enable` (R11) | as `forWindow` |
| `ignoreClass`, `ignoreRole` | empty (the old defaults are the built-in kinds now) | list | the old lists: a user's entries read as `floating enable` rules, named once at load (R5) | as `forWindow` |
| `floatingClass` | empty | list | read as `[class="^X$"]` and `[instance="^X$"] floating enable` (R9) | as `forWindow` |
| `floatingTitle` | empty | list | read as `[title="X"] floating enable`, X escaped: a substring (R9) | as `forWindow` |
| `tiledLook` | `frame` | `frame`, `titlebars`, `bare` | §7 | next pass |
| `frameWidth` | 1 | 1-10 px | the ring | next pass; the effect at once |
| `frameActive`, `frameInactive` | `#4c7899`, `#333333` | `#rrggbb` | the ring's colour classes, i3's `focused`, `unfocused` (§7 L3) | the effect at once |
| `frameIndicatorActive`, `frameIndicatorInactive` | `#3daee9`, empty | `#rrggbb`, or empty for the class's frame colour | the indicator side's colour per class (§7 L4) | the effect at once |
| `frameOnFloating` | off | | ring on floating windows, in the same classes (§7 L11) | next pass |
| `roundedCorners` | on | | §7 | the effect at once |
| `holdEnabled` | on | | §7 | the effect at once |
| `holdTimeoutMs` | 200 | 10-2000 ms | §7 | the effect at once |
| `warnTakenKeys` | on | | the load-time key reports (§13) | next load |
| `debugLog` | off | | the D-Bus log, the debug actions; no control on either form | at once (debug actions: next load) |

The plugins accept any colour Qt parses; the script only `#rrggbb` (lowercased). A number out of
its range falls back to the default whole; a list skips a bad entry and keeps the rest.
`holdTimeoutMs`'s range is kept by the forms and the script, not by the effect. The effect still
reads `[kwin-i3-hold] Enabled` and `TimeoutMs` where the new keys are missing.

**N. Against i3's config** (i3 4.24 `parser-specs/config.spec`; the feature map's B rows are the
full list). Only the options that place, focus or look; `bar`, `exec`, `font`, `ipc-socket`,
`set`, `include` are Plasma's or have nothing to set.

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart

| # | i3 option | Here | i3 | Note |
|---|---|---|---|---|
| N1 | `gaps inner \| outer` | `gapsInner`, `gapsOuter` (outer added to inner at the edges, as i3) | = | the defaults differ: §7 L5 |
| N2 | `gaps horizontal \| vertical \| top \| right \| bottom \| left`, and `workspace N gaps …` | `gapsTop`, `gapsRight`, `gapsBottom`, `gapsLeft` (each `gapsOuter` unless set), and `workspaceGaps` in i3's words and meaning, in place of the global values (§6) | = (≠ for a negative edge: down to half the inner gap, §6; the per-side keys from 0) | Built 2026-10-28 (redo stage 7); on the settings page with stage 10 |
| N3 | `default_orientation` | `defaultOrientation` | = | |
| N4 | `workspace_layout default \| stacking \| tabbed` | none | ≠ | kept: tabbed and stacked are out (§8 K7) |
| N5 | `focus_wrapping` | `focusWrapping` | = | |
| N6 | `focus_follows_mouse` | KWin's focus policy (System Settings) | ≠ | reason (e): Plasma's own setting stands in; the default differs (§5 B1) |
| N7 | `mouse_warping output \| none` | `mouseWarping`, `output` (default) or `none` (§5 A2) | = | Built 2026-10-28 (redo stage 2); in the Configure form, on the settings page with stage 10 |
| N8 | `focus_on_window_activation smart \| urgent \| focus \| none` | KWin's (focus stealing prevention) | ≠ | reasons (e) and (a): §5 C4 |
| N9 | `popup_during_fullscreen` | `popupDuringFullscreen`: `smart`, `ignore`, `leave_fullscreen`, `all` (§5 C5, §10 V6) | = (≠ for a modal dialog: V6) | Built 2026-10-28 (redo stage 8); on the settings page with stage 10 |
| N10 | `workspace_auto_back_and_forth` | `workspaceAutoBackAndForth` | = | |
| N11 | `workspace N output X …` | `workspaceOutputs`, a list per number | = | Built 2026-10-28 (redo stage 4) |
| N12 | `assign [criteria] → workspace N \| output X` | `assign` (§3 R19) | = | Built 2026-10-28 (redo stage 3) |
| N13 | `for_window [criteria] floating enable \| disable` | `forWindow` (§3 R9); the old `floatingClass`, `floatingTitle`, `floatingWorkspaces` read as rules | = | Built 2026-10-28 |
| N14 | (no i3 option) the ignore lists | `ignoreClass`, `ignoreRole`: empty, read as floating rules for a user's own entries (§3 R5) | + | the defaults went 2026-10-28; the settings page writes rules (redo stage 10) |
| N15 | `floating_minimum_size`, `floating_maximum_size` (75x50; all outputs combined) | `floatingMinimumSize`, `floatingMaximumSize` (§3 R20) | = | Built 2026-10-28 |
| N16 | `floating_modifier` | Meta, fixed | ≠ | kept: KWin's window-action modifier, which kwin-i3 needs as Meta (§9 F7) |
| N17 | `tiling_drag`, `swap_modifier` | `tilingDrag` (§9 G3); no swap modifier | = / ≠ | `tilingDrag` as i3's; Shift floats instead of swapping (G5, G11) |
| N18 | `default_border`, `default_floating_border`, `hide_edge_borders`, `smart_gaps`, `client.*` | `tiledLook`, `frameWidth`, `frameOnFloating`; `hideEdgeBorders` and `smartGaps` as i3's; `client.focused`, `client.unfocused` as the two frame colours and two indicator colours (`client.focused_inactive` left out, §7 L3) | ≠ | §7 L1-L11; the look's differences kept, the settings built 2026-10-28 (redo stage 7) |
| N19 | `force_display_urgency_hint`, `show_marks`, `title_align`, `for_window … title_format` | none | ≠ | kept: urgency, marks and i3's own title bars are out |
| N20 | `resize … 10 px or 10 ppt` (in a binding) | `resizeStep`, `floatingStep` | = | a setting, as a key takes no arguments |
| N21 | (no i3 option) `roundedCorners`, `holdEnabled`, `holdTimeoutMs`, `warnTakenKeys`, `debugLog` | kwin-i3's own (§7, §13) | + | `holdTimeoutMs` and `debugLog` are internal values: kwinrc only (`plan.md`, Settings), on neither the page nor the form (refinement stage 3; before, `holdTimeoutMs` was on both) |

### The settings page

`kcm/`, `docs/style-settings-page.md` for how it looks and reads.

- **Banners**: kwin-i3 off (with Turn On, which enables it and reconfigures); on but not running
  (pointing at the journal); running without the effect (the frame and the hold need the
  plugins); running without the helper (the mouse drag and resize, frame focus, the resize mode,
  the layout keys, the Configure form's Apply; redo stage 10).
- **Main page**: Tiling (gaps, with **Configure Gaps…**: a sub-page with the outer gap per
  screen edge, `smartGaps`, and each workspace's own inner and outer gap; the new-workspace
  direction, both steps, focus at an edge, the hold), Mouse and focus (`mouseWarping` as a
  checkbox, `tilingDrag`, `popupDuringFullscreen`), Workspaces (auto back-and-forth, and the
  Workspaces sub-page), Frame (`tiledLook`, width; the two colour classes (§7 L3), a row each with the
  frame's colour and the next-window side's, the latter "same as the frame" when empty;
  `hideEdgeBorders`; corners; frame on floating windows; greyed without the effect), Window
  Rules, Keys (the sub-page, and `warnTakenKeys`). **A help button** beside each setting with an
  i3 counterpart (§11's N table): what it does in a sentence or two, then i3's directive ("i3:
  focus_wrapping"); the sub-pages' help names theirs. Each is the next Tab stop after its
  control, as on Plasma's pages (2026-10-29, `OPEN.md` items 47 (a) and 49 in git history).
- **Workspaces sub-page**: for each of the ten, its monitors in order (the first, and a second
  used when the first isn't connected; any, a connected one, or a stored one listed as not
  connected; a longer list in kwinrc keeps its tail) and new windows tiling or floating (the
  rule `[workspace="^N$"] floating enable` in `forWindow`).
- **Window Rules sub-page**: one row per rule of `forWindow` and `assign`, in the order the
  script runs them: what it matches (application, title, role: a pattern each; the window type)
  and what it does (floats, tiles, opens on workspace N, opens on monitor X); the shipped rules
  listed like any other, marked "default"; a rule with other criteria shown as text and edited
  there; Add Rule and Pick a Window… (KWin's window picker: a row with the clicked window's
  class, matched whole). Below, the floating sizes (`floatingMinimumSize`,
  `floatingMaximumSize`). **The old list settings** (`ignoreClass`, `ignoreRole`,
  `floatingClass`, `floatingTitle`, `floatingWorkspaces`) become rules when the page reads them,
  as the script reads them (§3 R5, R9, R11), so the rows show them and the first Apply writes
  the rules and takes the old keys out of kwinrc.
- **Keys sub-page**: every command from `kcm/ui/commands.json`, current keys from kglobalaccel; a
  key held by another component is named and taken on Apply (recorded for `make restore-keys`); a
  shifted symbol appears with the keys that type it on the current layout. Not visible while
  kwin-i3 isn't running.
- **Apply** writes kwinrc and the keys, and reconfigures if a setting changed; a setting at its
  default is removed from kwinrc rather than written. **Defaults** resets both to `main.xml`'s and
  the US keys. A key whose holder can't be recorded or freed isn't given to kwin-i3 either.

### The workspace widget

`widget/`: a button for each workspace in use (with windows, or visible), drawn at its output's
shape with its windows as rectangles; the focused workspace bold, the visible ones highlighted; a
named desktop shows "N name". A click runs `kwin-i3 Workspace N` (as Meta+N); the wheel steps
through workspaces in use, wrapping. One setting, "Numbers only". The widget is kwin-i3's (Paul, 2026-10-27):
without kwin-i3 it draws, and a click does nothing; the spec's fallback to KWin's own switch was
not built, as the pager is the tool there.

---

## 12. Start, reload, release

Checked against i3 4.24's `main.c` (start, `tree_restore`, `manage_existing_windows`).

**=** as in i3 · **≠** differs (the reason in the note) · **+** no i3 counterpart (Plasma's)

**P. Start, reload, release**

| # | When | Result | i3 | Note |
|---|---|---|---|---|
| P1 | A login: workspaces onto outputs | §4 M1 | = | `init_ws_for_output` |
| P2 | A login: where focus starts | the output under the pointer, at its workspace's focus (`focusUnderPointer`): at the load with no windows, and again after Plasma's first activity event numbers the outputs | = | i3: `main.c`, after `tree_init`. Built 2026-10-28 (redo stage 2); before, workspace 1 |
| P3 | A reload (kwin-i3 loaded with windows open) | nothing renumbered; the layout comes back from KWin's tiles, floating from the effect, focus on KWin's active window | = | i3's `restart`, which keeps the tree (`tree_restore`) and the focus. i3's `reload` keeps the tree too (§8 K15) |
| P4 | Windows open at load that no tile holds | adopted bottom of the stack first, each as a new window, so the focus order follows the stacking | = | `manage_existing_windows`, in the X server's stacking order |
| P5 | Release (Meta+Ctrl+Shift+Q), or a load or rebuild failing | every window out of its tile, KWin's state put back; kwin-i3 does nothing more until reloaded | + | the safety valve; i3's `exit` ends the session |
| P6 | The plugins loaded or unloaded | below | + | |

### Load (`start`, `startRest`)

1. Register Release and Dump State first, so the safety valve exists whatever fails next.
2. **A login** (no normal windows): number the outputs (§4). Focus goes to workspace 1 after
   Plasma's first activity event. **A reload**: no renumbering.
3. **Adopt the tiles** (`adoptTiled`): windows already in KWin's tiles keep their layout
   (`docs/plan.md`, decision 5).
4. Connect KWin's signals; register the hidden drag actions; turn the tiling drag on.
5. **Ask the effect** for its stats (the answer waited for up to 250 ms, then step 7 runs).
6. Meanwhile, at once: register the keys, ask the helper to fit them, check taken keys, layout
   keys and per-output desktops (one notification, §13), place everything. So the keys exist
   before step 7 has run.
7. **Adopt every other window**, bottom of the stack first (so the focus order follows
   stacking), and focus KWin's active window.

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
kwin-i3 touched, and any other not exactly the full screen (one a previous instance left inset
by gaps), emptied and reset to the full screen with no padding; the effect told to drop the
resize banner, every ring's class and the focused window. Logs `RELEASED`. After it
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
  kwin-i3's position keys are set for US. Its part waits at most 3 s for KWin's answer, so a D-Bus call
  that never answers can't hold back the rest of the report.
- **Per-output desktops off** with two or more outputs: reported at load, and once later if it
  becomes a problem; never set.
- **kwin-i3's plugins aren't loaded**: what goes without each, named (`plan.md`: the product is the
  script and both plugins): without the helper, the tiling drag and resize, frame focus, the
  resize mode (Meta+R), the terminal key (Meta+Return), the layout-fitted keys and the form's
  Apply (§8 K4, K18); without the effect, the frame, the drag highlight and the hold. The helper
  from KWin's loaded plugins, the effect from its loaded effects. Refinement stage 3; before,
  only the two keys.
- **Ignore entries now float**: a user's own `ignoreClass`/`ignoreRole` entries, read as floating
  rules since redo stage 3 (§3 R5), named once (Paul's call 43).

i3 has no counterpart: it reports a config error with `i3-nagbar`; here a setting that doesn't
parse logs a `WARN` and uses its default (§11).

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
| a tile managed while its desktop is hidden lists the window but never places it | unmanages and manages it again once visible |
| on a hidden desktop `w.tile` is null though the tile lists it | finds the tile from its own record |
| an outer side dragged with gaps pins the tile to the output's edge for good | rebuilds the tiles when an outer edge isn't the layout's |
| gives a full padding at an edge it judges exactly 0 or 1 | insets the root by a hair |
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
| the generic script config form tells KWin nothing on Apply | the helper's settings watch reconfigures |
| shortcuts match the typed symbol, not the key | the helper refits the position keys |
| Shift+; arrives as `:` | Move Right's second key is Meta+: |
| a GTK 4 client keeps within bounds sent only with its first configure | asks 0 × 0, then its tile |
| `print()` from a script is dropped on this machine | logs over D-Bus |
| plugin libraries are never unloaded | a new file name per build |
| a `KConfigWatcher` subscription outliving its plugin crashed KWin | subscriptions owned by the plugin's own object |
