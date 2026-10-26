# i3 feature map: every i3 feature against kwin-i3, KWin and Plasma

Written 2026-10-25 (Paul asked for a more granular map than the morning's, which this replaces;
that one is in git history). Built from i3 4.24's **source** rather than its guide: the command
grammar (`parser-specs/commands.spec`, slice A), the config grammar and criteria (`config.spec`,
slice B), the behaviour its code applies by itself (`src/*.c`, slice C), and its IPC, bar and tools
plus the reverse direction, KWin and Plasma features acting on kwin-i3's windows (slice D, rows D
and R). 461 rows by four agents reading i3, kwin-i3 (`src/`, `plugin/`, `widget/`, `kcm/`, docs),
KWin 6.7.5's source and the live config read-only; merged and spot-checked here. Nothing was run.

**Purpose**: holes (i3 does it, nobody here does) and redundancy (two owners acting on one thing,
where fights come from), against the heading in `OPEN.md`: i3's feel and basic window management,
with Plasma doing the rest, **not** all of i3. A hole is not a to-do: what to do with each is Paul's
call; nothing here is in `OPEN.md` or `LATER.md` until he says so.

Owner key: **K** kwin-i3 (script / kwini3hold / kwini3helper / widget / settings page), **KW** stock
KWin, **P** Plasma, **DF** Paul's dotfiles only, **none** a hole, **OOS** out of scope by
`docs/plan.md` "Scope", **n/a** no meaning here (X11 or i3-internal). Tags: **C** confirmed in code
or live config, **D** docs or inference only. In part R, "Owner" is who acts on the window and
"Also done by" says what kwin-i3 does about it.

## What it found (spot-checked 2026-10-25)

Checked by hand against code or config before writing this summary: 1 (`tree.js:503`), 4
(`kwin.js:1394`: the goto forms only), 6 (`kwin.kcfg` default `SwitchToOtherDesktop`), 9 (live
`Edit Tiles=none,Meta+T`: unbound here, Meta+T on a stock install), 11 (live `kwinrc`
`FocusPolicy=FocusFollowsMouse`, `NextFocusPrefersMouse=true`). The rest are as the agents found
them, with their tags.

**Holes in i3's feel**
1. **Floating windows don't move or resize by key** (A21, A40, A41). **Done** 2026-10-25 (OPEN.md
   item 23, `docs/spec-float-keys.md`): they move and resize by `floatingStep` px, 10 by default.
2. **No launch workspace** (C19): an app opens on the workspace current when its window appears,
   not the one it was launched from; KWin ignores the startup notification's desktop.
3. **Urgency shows nowhere** (C97): i3 marks the workspace in the bar; the widget has no urgent state.
4. **No `move container to workspace next/prev`** (A27): the goto forms exist, the move forms don't.
5. **Small explicit forms missing** (A10, A11, A14, A54, A56, A62): `focus next/prev sibling`,
   `focus tiling/floating`, `layout splith/splitv`, `split toggle`, `floating enable/disable`. The
   toggles reach every state, so only for completeness or key-for-key i3 configs.

**Where KWin decides instead of kwin-i3 (redundancy)**
6. **Activation switches a monitor's workspace** (C4, C67): KWin's `ActivationDesktopPolicy`
   default is `SwitchToOtherDesktop`, so a link opened in a running Firefox on a hidden workspace
   switches to it; i3 marks it urgent (`focus_on_window_activation smart`). **Won't fix** (Paul,
   2026-10-25: KWin's policy stays). Every activation reaches `Workspace::activateWindow`
   (`activation.cpp:294`, v6.7.5): an app's xdg-activation (`xdgactivationv1.cpp:118`), Alt+Tab
   (`tabbox.cpp:840`), a task manager click, kwin-i3's own `workspace.activeWindow`
   (`workspace_wrapper.cpp:262`). The policy applies to all of them alike, and a script can't
   tell which one it was. `DoNothing` would break Alt+Tab and the task manager across workspaces,
   and even an app's activation would show nothing: an allowed activation skips `demandAttention`,
   and `requestFocus` refuses a hidden window. There would be nothing to mark urgent, so finding 3
   stays out of scope. kwin-i3 follows KWin's switch (`shownOutside`).
7. **Which monitor a new window opens on** (C2, C75): KWin follows the pointer, i3 keyboard focus;
   with an empty workspace under the pointer on the other monitor, keys act on one monitor and the
   new window opens on the other.
8. **Focus after a close**, at the top level and for floating windows (B51, C26): KWin chooses
   (`NextFocusPrefersMouse`), kwin-i3 overrides only inside splits.
9. **Meta+T's tile editor, Shift+drag into a tile, drag to a screen edge** (R14, R12, R11): KWin
   features acting on the tiles kwin-i3 owns; edits are overwritten at the next pass, Shift+drag can
   put two windows in one leaf, edge-snapping isn't "floats where dropped". Meta+T is unbound on
   Paul's desktop, KWin's default on a stock one. Inferred from code, no test.
10. **KWin window rules that force** a desktop, maximize, size or "no titlebar" (R42, R43, B105, A63)
   can ping-pong with kwin-i3's placement or frame. Untested (also `LATER.md` item 10's "a forcing
   window rule").
11. **Keep Above / Below** (R18, R19): kwin-i3 owns Keep Above on floating windows, so a user can't
   turn it off there; Keep Below is overwritten.

**Stock-install gaps** (the README pass, `LATER.md` item 4)
12. **Focus follows mouse comes from the dotfiles** (B48, C82): a stock Plasma is click-to-focus
   (already `LATER.md` item 4(e)).
13. **22 keys clash with Plasma's defaults until `make take-keys`** (R1-R7, A96): Meta+arrows,
   Meta+Ctrl+arrows (the resize keys, KWin's desktop switch), Meta+Shift+Left/Right, Meta+1..0,
   Meta+V, Meta+L, Meta+E. README overstates the zoom clash: only Meta+0 (R-rows).
14. **No Meta+Return terminal** outside the dotfiles (D74).

**Corrections to docs**
15. `docs/plan.md` decision 10 says workspaces return to a replugged monitor "as in i3"; i3 4.24
   returns only assigned ones (`randr.c`, C74). kwin-i3's is better; the wording is wrong.
16. The old map and memory said Meta+D runs fuzzel; live it is KRunner (D72, A97).
17. ~150 inert `HyprKwin *` entries from another tiling script sit in `kglobalshortcutsrc`
   (A100): unbound, harmless, clutter.

**Out of scope, confirmed** (plan "Scope"): binding modes and `$mod` (B89, B93-B95), tabbed and
stacking, scratchpad, marks, `append_layout` / `i3-save-tree` (D76), arbitrary i3 commands on keys
(B79), the i3 IPC (D-rows), tiling drag (B45, C37), removing empty workspaces (C56).

## Slice A: i3's command grammar (`parser-specs/commands.spec`) against kwin-i3 + Plasma

Sources read: i3 4.24 `parser-specs/commands.spec` (all 554 lines, every state) and the matching
`src/commands.c` functions (`cmd_focus_sibling`, `cmd_split`, `cmd_layout_toggle`, `cmd_reload`, and
the rest skimmed for behaviour); kwin-i3 `README.md`, `docs/plan.md` ("Scope", "Behaviour"),
`docs/spec-workspace-commands.md`, `OPEN.md`, `LATER.md`, `src/kwin.js` (`actions`, `KEYS`, `UNBOUND`,
`registerKeys`, border/sticky/minimise handlers), `src/tree.js` (`split`, `toggleSplit`, `resize`,
`move`, `focusDir`, `focusModeToggle`, `toggleFloating`); live `~/.config/kglobalshortcutsrc` (73 kwin-i3
actions; KWin's own actions and every other component holding a Meta key) and `~/.config/kwinrc`;
the previous `docs/i3-feature-map.md` (stale on workspace commands, as the brief says). Not checked:
KWin 6.7.5 source for each "KW" row (I tag those [D] where I rely on the action's name and
description in `kglobalshortcutsrc` rather than its code); the widget/kcm/plugin sources (only
README-level knowledge); `src/commands.c` bodies for the rarely used commands (`title_window_icon`,
`bar`, `gaps`, `swap`, `append_layout`) were taken from the spec's grammar and i3's userguide
knowledge, not read line by line. "Live" = the file as read today (2026-10-25): in the live
`kglobalshortcutsrc` the first field of a KWin entry is the current key, and KWin's stock
Meta+arrow / Meta+Ctrl+arrow / Meta+Shift+Left/Right entries are currently `none`, so there is no
collision on Paul's desktop today (a stranger's stock Plasma has them: README Install step 2 and
`make take-keys`). Criteria keys themselves are slice B's; here only "needs criteria" is noted.

Owner key: K kwin-i3 (script unless said), KW stock KWin, P Plasma, DF Paul's dotfiles, none a hole,
OOS out of scope by `docs/plan.md` "Scope", n/a no meaning here.

### 0. Command line shape

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A1 | `cmd1; cmd2` and `,` chaining, `end` token | several commands in one line / one binding | n/a | | kwin-i3 has no command language: each action is one registered KWin shortcut (`registerKeys`, `src/kwin.js:1411`) | C | No gap in itself: it follows from "i3's config file and i3-msg IPC out" (plan Scope). Consequence: no scripting of compound actions, and no command is reachable except through a KWin shortcut |
| A2 | `[criteria] <command>` prefix (`[`, `class`, `con_id`, `title`, ... `]`) | select windows (default: focused) then run the command on each match | none (for commands); KW (for rules) | KW Window Rules cover "act on a window when it appears", not "act on a window now" | no kwin-i3 action takes a target; every action uses `model.focused` (`act()` in `src/kwin.js`) | C | Commands that need criteria to be useful at all are marked per row below (`swap`, `focus` by name, `move ... mark`, `kill` of a non-focused window). Plan Scope: `for_window`/`assign` -> KWin Window Rules |
| A3 | `[tiling]`, `[floating]`, `[all]` criteria words | restrict a criteria set by container kind | none | | no criteria | C | Slice B |
| A4 | `exec [--no-startup-id] <cmd>` | run a program (startup notification unless disabled) | P | DF (Meta+Return Alacritty, Meta+B Firefox, Meta+D KRunner, Meta+T Dolphin, Meta+I Settings as `.desktop` `_launch` shortcuts, live `[services]` entries); KRunner/Plasma autostart | live `kglobalshortcutsrc` `[services][...] _launch=`; plan Scope "a bar, launcher ..." | C | Plasma's `.desktop` shortcuts are the exec equivalent; startup-notification handled by KDE for `.desktop` launches. Nothing in kwin-i3. Not a gap per plan |
| A5 | `exec --no-startup-id` | skip startup notification | P | KW | `.desktop` `StartupNotify=false` | D | n/a to kwin-i3 |
| A6 | `exec_always` (config only, not in this spec) | rerun on reload | n/a | | not a command in `commands.spec` | C | Listed for completeness; config slice |

### 1. focus

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A7 | `focus left` / `right` / `up` / `down` | tree-based directional focus, wrapping per `focus_wrapping`, crosses outputs at the edge | K (script) | KW has geometric `Switch Window <dir>` (Meta+Alt+arrows default, live `none`): a different algorithm, harmless duplicate | `Focus Left/Down/Up/Right` in `KEYS`, `src/kwin.js:1374`; `Tree.focusDir` `src/tree.js:709`; setting `focusWrapping` | C | Keys Meta+arrows and Meta+J/K/L/;. On a stock Plasma Meta+arrows are quick-tile (conflict; `make take-keys`, README step 2) |
| A8 | `focus left/right/up/down` on a floating window | i3 moves focus among floating windows (left/right cycle) | K | | `focusDir` floating branch cycles `ws.floating` for h only; up/down do nothing (`src/tree.js:717`) | C | Matches i3's floating case closely enough |
| A9 | `focus left/...` into a fullscreen / empty workspace edge | cross to neighbouring output, or onto its empty workspace | K | | `focusDir` header comment, `spec-fullscreen-tree.md` | C | |
| A10 | `focus prev` / `focus next` | cycle to the previous/next sibling in the focus-direction sense (4.24: `cmd_focus_direction` with prev/next) | none | KW: `Walk Through Windows` (Alt+Tab / Meta+Tab, live default keys present) switches by recency, not tree order | no action; `src/tree.js` has no sibling stepping | C | Hole but minor: Alt+Tab in KWin follows focus, kwin-i3 follows activation, so it is a different tool. i3's default config binds neither |
| A11 | `focus prev sibling` / `focus next sibling` | focus the previous/next child of the same parent | none | | `cmd_focus_sibling` `commands.c:1365`; no kwin-i3 equivalent | C | Not bound by i3's default config; negligible |
| A12 | `focus parent` | move focus to the parent container | OOS | | plan Scope: "`focus parent`, Paul's decisions 2026-10-21 ('never used this')" | C | Needs tabbed/stacked or a split-selecting `split` to matter |
| A13 | `focus child` | move focus down to the focused child | OOS | | same | C | |
| A14 | `focus tiling` / `focus floating` | focus the most recent tiling/floating window | none (the toggle is K) | | only `mode_toggle` exists | C | Explicit forms are a trivial gap; toggle covers the default binding |
| A15 | `focus mode_toggle` | swap between the tiling and floating layer | K (script) | | `Focus Mode Toggle`, Meta+Space; `Tree.focusModeToggle` `src/tree.js:654` | C | Live bound |
| A16 | `focus output <name>` / `<dir>` / `primary` / `next` | focus the named/directional output | K (script), directional forms only | | `Focus Output Left/Right/Up/Down` in `UNBOUND`, `src/kwin.js:1393`; live entries exist, unbound | C | Named-output, `primary`, `next` absent. By-name is the part with no equivalent; directional is what a user wants. Unbound by default, as in i3 (spec-workspace-commands) |
| A17 | `focus output` with several outputs listed (`focus output left right`) | try each in turn (the `FOCUS_OUTPUT` loop) | none | | | C | Rare |
| A18 | `focus workspace` (`cmd_focus(1)`) | focus the workspace container (moves focus to the workspace itself) | none | | tree has `ws` as focusable only when empty (`fromWs` in `focusDir`) | C | Only used with `focus parent`-style climbing; same fate as A12 |
| A19 | bare `focus` (with criteria) | focus the window matched by criteria, switching workspace/output if needed | none; partly KW/P | P: Overview (Meta+W, bound live), task manager click, KRunner "Windows"; KW activation is followed by the tree (`Tree.activate`) | no criteria addressing; but any KWin-side activation is followed (`desktopsChanged`, activation hooks) | C | "Jump to window by name" has owners in Plasma, harmless duplicate: kwin-i3 follows whatever activates |

### 2. move

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A20 | `move left` / `right` / `up` / `down` (tiled) | `tree_move`: move the container within the tree, across outputs at the edge | K (script) | KW `Window to Next/Previous Screen` default Meta+Shift+Left/Right (live `none`) and quick-tile: conflict on a stock Plasma only | `Move Left/Down/Up/Right`; `Tree.move` `src/tree.js:501`; `Move Right` second key is Meta+: (US layout shift quirk, `src/kwin.js:1380`) | C | `ws_force_orientation` cases ported |
| A21 | `move left` ... on a floating window | move the window 10 px | none; KW (partial) | KW: `Window Pack Left/Right/Up/Down` (unbound live) packs to the edge, not 10 px | `Tree.move` returns for floating (`src/tree.js:503`), so Meta+Shift+arrows do nothing to a floating window | C | Real small hole: Meta+Shift+arrows on a floating window silently does nothing. i3's default config binds exactly those keys. A floating window can still be moved by Meta+drag |
| A22 | `move <dir> <n> px` / `<n> ppt` | move by an amount (floating); tiled ignores it | none | KW partly (see A21) | | C | Default config uses neither |
| A23 | `move window to` / `move container to` / `move to` filler words | optional words | n/a | | grammar noise | C | |
| A24 | `move [--no-auto-back-and-forth] [container to] workspace <name>` | send the window to a named workspace (auto back-and-forth honoured unless `--no-...`) | none for names; K for numbers | | workspaces are numbers only (desktop N = workspace N); names are Plasma's desktop names, display only (`spec-workspace-commands` §4: "Name-based commands ... not asked for") | C | By name absent; fine under "numbered workspaces" |
| A25 | `move ... workspace number <n>` | send window to numbered workspace | K (script) | | `Move to Workspace N`, bound as Meta+Shift+N via the symbol form (Meta+! ... Meta+)), `src/kwin.js:1428` | C | US symbols only without the helper plugin (OPEN 9 / README); `workspaceAutoBackAndForth` honours `--no-auto-back-and-forth`'s counterpart. No per-call `--no-auto-back-and-forth` switch |
| A26 | `move ... workspace number <n>` with `--no-auto-back-and-forth` | override the auto back-and-forth setting for this call | none | | the setting is global | C | Trivial |
| A27 | `move ... workspace next` / `prev` / `next_on_output` / `prev_on_output` | send window to the adjacent workspace | none | KW `Window to Next/Previous Desktop` (unbound live; not per output, ignores kwin-i3's "exists" rule) | `UNBOUND` has only the Workspace Next/Prev (goto) actions, not move | C | The goto forms are built (A44); the move forms are not. A KWin action moving the window is followed by the tree via `desktopsChanged` (`src/kwin.js:1040`) but may land on a workspace kwin-i3 would not choose (a never-used desktop) |
| A28 | `move ... workspace current` | move to the current workspace (matters with criteria) | none | | | C | Needs criteria to be meaningful |
| A29 | `move ... workspace back_and_forth` | send window to the previously focused workspace | K (script) | | `Move to Workspace Back and Forth` in `UNBOUND` | C | Unbound by default, as in i3 |
| A30 | `move workspace to output <name>` / `<dir>` / `primary` / `next` | move the whole workspace to another output | K (script), directional only | | `Move Workspace to Output Left/Right/Up/Down` (`moveWorkspaceToOutput`, `src/kwin.js:1340`) | C | Named/`primary`/`next` absent |
| A31 | `move [container\|window] to output <name>` / `<dir>` / `next` / `primary` | send window to another output's visible workspace | K (script), directional only | KW `Window One Screen to the Left`, `Window to Screen N`, `Window to Next/Previous Screen` (unbound/live default): KWin would move the window out from under the tree; the tree follows via the `outputs` relocation, not the "visible workspace" rule | `Move to Output <dir>` in `UNBOUND` | C | Harmless duplicate if the user binds KWin's; kwin-i3's Meta+Shift+arrows already crosses at the edge |
| A32 | `move [window] to mark <mark>` | send the window into the container with that mark | OOS | | marks out (plan Scope) | C | |
| A33 | `move scratchpad` | hide the window into the scratchpad | OOS | KW: minimise (`Window Minimize`, Meta+PgDown) is the nearest Plasma idea | plan Scope | C | Scratchpad: "features the author never used" |
| A34 | `move position center` | centre a floating window | none; KW | KW `Window Move Center` (unbound live) | | D | Floating only; KWin does it. Not bound, but available in Shortcuts |
| A35 | `move position <x> [px\|ppt] <y> [px\|ppt]` | place a floating window exactly | none; KW (window rules, "Position") | | | D | Not a feel feature |
| A36 | `move absolute position <x> <y>` / `... center` | absolute coordinates across all outputs | none | | | D | |
| A37 | `move position mouse` / `cursor` / `pointer` | move a floating window to the pointer | none | | | D | |

### 3. resize

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A38 | `resize grow\|shrink width\|height [<n> px] [or <m> ppt]` (tiled) | change a tile's share against its siblings | K (script) | KW: Meta+right-drag; the drag is read back into the tree (plan decision 3), so it is a deliberate split | `Grow/Shrink Width/Height`; `Tree.resize` `src/tree.js:674` takes ppt only; step is `resizeStep` (default 10 ppt) | C | The px form is not honoured (always ppt). Keys are Meta+Ctrl+arrows and Meta+Ctrl+J/K/L/;. Default config binds these inside a `mode "resize"`, which kwin-i3 flattens into direct keys (`KEYS` comment). On a stock Plasma Meta+Ctrl+arrows are desktop-switch keys (conflict; `take-keys`) |
| A39 | `resize grow\|shrink up\|down\|left\|right [<n>]` | grow/shrink by edge, not by axis (grows towards that side) | none | | only width/height axes exist; the four keys map to width/height | C | The four directional forms differ from width/height when the container is not at an edge. kwin-i3's Left=shrink width, Right=grow width mimics the old config's resize mode, which uses these forms. Minor |
| A40 | `resize grow\|shrink ...` on a floating window | change the floating window's size by px | none | KW: `Window Grow/Shrink Horizontal/Vertical` (unbound live), `Window Resize` (keyboard resize), Meta+right-drag | `Tree.resize` returns false unless `con.type === "con"` | C | Same shape as A21: the keys silently do nothing to a floating window |
| A41 | `resize set <w> [px\|ppt] [<h> [px\|ppt]]`, `resize set width ...`, `resize set height ...` | set an exact size (px for floating, ppt for tiled) | none | KW window rules (Size, "Apply Initially"/"Force") for floats | no action | C | README's float-size note recommends a Plasma rule for this. Exact tiled sizes via ppt: a hole nobody asked for |

### 4. workspace

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A42 | `workspace <name>` | show a named workspace (created on demand) | none; K for numbers only | P: desktop names in System Settings, shown in the widget as "2 mail" | named workspaces: display only (`spec-workspace-commands` §4) | C | Name-based switching absent, deliberately ("a way to type a name"). Names beyond display do not exist |
| A43 | `workspace number <n>` | show workspace N | K (script) | KW has `Switch to Desktop N` (Ctrl+F1..F4 default, live `none` for the Meta+digit-free ones): global, not per output | `Workspace N` actions, Meta+1..Meta+0, `gotoWorkspace`; desktops created on demand (`spec-desktops-on-demand`) | C | Ten workspaces max (`NAMES`). On a stock Plasma Meta+1..9 can be the task manager's (README step 2) |
| A44 | `workspace next` / `prev` | go to next/prev existing workspace (all outputs) | K (script) | KW `Switch to Next/Previous Desktop` (unbound live): ignores kwin-i3's "exists" rule, not per-output | `Workspace Next/Prev` in `UNBOUND` | C | Unbound by default. If a user binds both, they behave differently (KWin steps through empty desktops) |
| A45 | `workspace next_on_output` / `prev_on_output` | the same, on the focused output only | K (script) | | `Workspace Next/Prev on Output` | C | |
| A46 | `workspace back_and_forth` | go to the previously focused workspace | K (script) | | `Workspace Back and Forth`; `Tree.previousWs` | C | |
| A47 | `workspace --no-auto-back-and-forth <...>` | ignore `workspace_auto_back_and_forth` for this call | none | | the setting is global | C | Trivial |
| A48 | `workspace_auto_back_and_forth` effect on `workspace N` | the same workspace again goes back | K (script) | | setting `workspaceAutoBackAndForth` (default false, as i3) | C | |
| A49 | `workspace <n>` creating the workspace on the focused output | new workspace appears on the output where the command ran | K | KW per-output desktops | `Workspaces.ensure`; README Install step 3 (per-output desktops must be on; DF sets `PerOutputVirtualDesktops`) | C | A stock Plasma has per-output switching off; kwin-i3 only warns and says so |
| A50 | `rename workspace <old> to <new>` / `rename workspace to <new>` | rename | P | | System Settings > Virtual Desktops (`kwinrc [Desktops] Name_N`); kwin-i3 never renames (spec-workspace-commands §4); widget labels "N name" | C | Split by design: Plasma owns the name |
| A51 | workspace number > 10, or `workspace 0`, named-only workspaces | unlimited, any string | OOS / n/a | | Paul: "more than ten no" (spec-workspace-commands header) | C | |

### 5. layout, split, container structure

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A52 | `split horizontal` / `h` | next window opens beside the focused one | K (script) | | `Split H`, Meta+H; `Tree.split` `src/tree.js:304` | C | Ported incl. the single-child case |
| A53 | `split vertical` / `v` | next window opens below | K (script) | | `Split V`, Meta+V | C | |
| A54 | `split toggle` / `t` | tree_split in the opposite orientation of the parent | none | | not bound; `Toggle Split` (A55) is `layout toggle split`, a different operation (it flips the parent's orientation, `split t` wraps the con) | C | Different effect from A55; negligible |
| A55 | `layout toggle split` (and `layout toggle`, `layout toggle default`) | flip the parent between splith and splitv | K (script) | | `Toggle Split`, Meta+E; `Tree.toggleSplit` `src/tree.js:352` | C | On a stock Plasma Meta+E is Dolphin's. Bare `layout toggle` in i3 cycles tabbed/stacking too; here splith/splitv only |
| A56 | `layout splith` / `splitv` | set the parent's orientation explicitly | none | | no action (only the toggle) | C | Tiny gap; the toggle plus `Split H/V` reaches every state |
| A57 | `layout default` | restore the default layout | none | | | C | Same |
| A58 | `layout stacked` / `stacking`, `layout tabbed` | stacked / tabbed container | OOS | | plan Scope: "I don't use tabbed" (Paul, 2026-10-21) | C | Largest i3 feature left out; deliberate |
| A59 | `layout toggle all`, `layout toggle split <mode list>` | cycle through chosen layouts | OOS | | tabbed/stacked out | C | |
| A60 | `layout toggle <a b c>` | user-defined cycle | none | | | C | |

### 6. floating, fullscreen, sticky, border, title

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A61 | `floating toggle` | tile/float the window | K (script) | KW: Meta+drag out of a tile floats it (`tileChanged` path) | `Floating Toggle`, Meta+Shift+Space; `Tree.toggleFloating` | C | Dragging out of a tile floats where dropped (`src/kwin.js:1106`); a deliberate dual route |
| A62 | `floating enable` / `disable` | explicit forms | none | | only the toggle is an action | C | Trivial |
| A63 | floating by rule (`for_window ... floating enable`) | float matching windows on map | K (settings) + KW | KW Window Rules | `floatingClass`, `floatingTitle`, dialogs/transients/fixed size (`src/rules.js`); Paul's live `floatingTitle=STAGE (streamed),Picture-in-Picture`, `floatingWorkspaces=1` | C | Overlap of two rule systems: kwin-i3's four lists vs KWin rules. A KWin "force position/size" rule on a tiled window is fought by the tile |
| A64 | `fullscreen` / `fullscreen toggle` / `fullscreen enable` (output) | fullscreen on the output | K (script key) running KW | | `Fullscreen`, Meta+F -> KWin's `Window Fullscreen` (`actions["Fullscreen"]`, `src/kwin.js`; `KWIN_OWN`); tree keeps the leaf (`spec-fullscreen-tree.md`) | C | Two owners by design: kwin-i3 owns the key, KWin the state. KWin's own `Window Fullscreen` is unbound live; if a user binds it too, both fire the same action |
| A65 | `fullscreen disable` | leave fullscreen | KW | K | same toggle; app-driven exits tracked via `fullScreenChanged` | C | |
| A66 | `fullscreen [enable\|toggle] global` | span all outputs | none | | KWin has no multi-output fullscreen | D | Hole, no Plasma equivalent; rarely used |
| A67 | `sticky enable` / `disable` / `toggle` | window on all workspaces | KW | K (drops it from the tree) | KWin `Window On All Desktops` (unbound live; also the title-bar menu); a sticky window is "never managed" (`rules.js:30`, `src/kwin.js:1043`) | C | Interaction: making a tiled window sticky un-tiles it and removes it from the tree. Reasonable but different from i3 (a sticky floating window stays in the tree). No key by default |
| A68 | `border normal` / `pixel [n]` / `none` / `toggle` / `1pixel` (per window) | set window border/title style | none; K for the global frame | KW `Window No Border` (unbound live): toggles the decoration. Conflict with the script: it re-asserts `noBorder` on tiled windows on every pass (`takeBorder`, `src/kwin.js:846-870`), so a toggle on a tiled window is undone | `frameWidth`, `frameOnFloating` settings; kwini3hold draws the frame | C | Per-window border control is a gap (README says tiled windows have the frame, floating the user's decoration). The conflict with `Window No Border` shows if the user binds it |
| A69 | `border pixel <n>` | n-px border | K (plugin), global | | `frameWidth` 1-10, kwini3hold | C | Per-window width absent; global only |
| A70 | `title_format <fmt>` | per-container title template (`%title`, `%class`, ...) | none | KW Window Rules ("Window title" is a settable property); i3bar-less | | D | No title bars on tiled windows with the plugin; only floating windows show titles. Matters little |
| A71 | `title_window_icon <on\|off\|toggle> [padding <n>]` | icon in the title bar | n/a | KW Breeze/title bar | | D | No i3-style title bar |
| A72 | `kill` / `kill window` | close politely | K (key) running KW | | `Close`, Meta+Shift+Q -> KWin `Window Close`; Alt+F4 stays live (`Window Close=Alt+F4`) | C | Two keys, one KWin action: harmless |
| A73 | `kill client` | destroy the client connection | KW | | KWin `Kill Window` (Meta+Ctrl+Esc, default key, current live `none`) | C | Different mechanism (click-to-kill) than i3's, but the capability exists |
| A74 | `kill` of a criteria-selected window | close any window | none | | needs criteria | C | |

### 7. marks, swap, scratchpad, open

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A75 | `mark [--add\|--replace] [--toggle] <name>` | label a container | OOS | | plan Scope: marks "features the author never used are not built" | C | |
| A76 | `unmark [<name>]` | remove marks | OOS | | same | C | |
| A77 | `swap [container] [with] id\|con_id\|mark <arg>` | swap two containers | none (decided) | | spec-workspace-commands header: "skip swap" (Paul, 2026-10-25); `HyprKwin swap*` entries in kglobalshortcutsrc belong to a different, unrelated script (see A100) | C | Hole by decision; needs criteria-like addressing anyway (`id`/`con_id`/`mark`) |
| A78 | `scratchpad show` | show/hide the scratchpad window | OOS | | plan Scope | C | |
| A79 | `open` | open an empty container (placeholder) | none | | | C | Only used with `append_layout` |
| A80 | `append_layout <file>` | restore a saved JSON layout with placeholders | none | KW/P: session restore, Plasma activities; KWin Tiles | `docs/layout-saving` | D | Not in scope; the tree is rebuilt from KWin's tiles on a script reload (plan decision 5) |

### 8. modes, bar, gaps, config-like commands

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A81 | `mode <name>` (incl. `mode "resize"`, `mode default`) | switch the binding set | none, by limit | | plan Behaviour: "a script cannot register keys that exist only inside a mode"; resize flattened to Meta+Ctrl keys | C | Consequence: any i3 mode idea (resize, system, gaps) must become always-on keys. The Meta+Ctrl+arrows cost keys a stock Plasma uses |
| A82 | `bar mode dock\|hide\|invisible\|toggle [<bar_id>]` | change the bar's mode | P | | Plasma panel visibility (Edit Mode > Auto Hide / Dodge windows) | D | Plasma owns the panel; kwin-i3 only supplies the workspace widget |
| A83 | `bar hidden_state hide\|show\|toggle [<bar_id>]` | show/hide a hidden-mode bar | P | | Plasma panel auto-hide; no key by default | D | Panel auto-hide is mouse-triggered; i3 bound a key. Minor |
| A84 | `gaps inner\|outer\|horizontal\|vertical\|top\|right\|bottom\|left  current\|all  plus\|minus\|set\|toggle <n> [px]` (runtime) | change gaps live | none; K for the static values | | `gapsInner` (default 4), `gapsOuter` (default 2) in settings and the settings page; no runtime command (`src/kwin.js:293` gaps) | C | Static inner/outer exist; per-side, per-workspace and runtime changes are absent. Live: `gapsInner=4`, `gapsOuter=2` in `kwinrc [Script-kwin-i3]` |
| A85 | `gaps ... current` (this workspace only) vs `all` | per-workspace gaps | none | | | C | |
| A86 | `reload` | reread the config | K (script) | | `Reload Settings`, Meta+Shift+C -> D-Bus `reconfigure` (`actions["Reload Settings"]`) | C | The `reconfigure` is KWin's: it reloads every KWin config (rules, shortcuts), not only kwin-i3. With the helper plugin a Configure-form save applies without the key |
| A87 | `restart` | re-exec i3 in place, keeping layout | K (partly) | | the script can be reloaded with `unloadScript` + `reconfigure` and rebuilds from tiles; no key (README "To reload the script"; plan decision 5) | C | No key by design: it re-tiles every window once. A dev action, not a feel one |
| A88 | `exit` | quit i3 | P | DF power menu (Meta+Shift+/ in the dotfiles notes) | Plasma logout | C | Plan: "session control" is Plasma's |
| A89 | `debuglog toggle\|on\|off` | toggle debug logging | K | | setting `debugLog`; `Dump State` action; last 2000 lines kept in memory, `tools/capture` (`docs/debugging.md`) | C | Different shape (a setting plus capture) but same purpose |
| A90 | `shmlog <size>\|toggle\|on\|off` | shared-memory log | n/a | K: in-memory ring of 2000 lines | the capture bundle plays the role | C | |
| A91 | `nop [comment]` | do nothing (marks a binding for tools) | n/a | | no command layer | C | |
| A92 | `exec` of i3-msg-style commands from outside (not in spec) | IPC | OOS | | plan Scope: KWin's D-Bus is the surface | C | |

### 9. Safety valves and kwin-i3's own commands with no i3 equivalent

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A93 | none: `kwin-i3 Release` (Meta+Ctrl+Shift+Q) | hand every window back to KWin and stop | K (script) | | `src/kwin.js:1743`; live bound | C | Not an i3 command; safety valve |
| A94 | none: `kwin-i3 Dump State` | bug-report dump | K (script) | | `src/kwin.js:1746`; unbound | C | Shell `tools/capture` (dotfiles launcher Meta+Shift+B) calls it |
| A95 | none: `Selftest Throw`, `Selftest Break Reconcile` | tests | K (debug only) | | registered only with `debugLog` | C | |

### 10. Observations on collisions and stale entries found while mapping

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| A96 | KWin's stock keys on kwin-i3's Meta+arrows / Meta+Ctrl+arrows / Meta+Shift+Left/Right / Meta+E / Meta+L | (n/a, default shortcut collision) | K vs KW/P | KW default `Window Quick Tile *`, `Switch One Desktop *`, `Window to Next/Previous Screen`; Dolphin (Meta+E); Lock (Meta+L) | live `kglobalshortcutsrc`: each KWin action's current key is `none` today, the default column still lists them; so no live conflict now | C | A conflict on a stock Plasma: the other holder's action fires, not kwin-i3's. `make take-keys` handles it; README step 2. Paul's setup avoids it by clearing |
| A97 | Meta+D (live: `[services][org.kde.krunner.desktop] _launch=Meta+D`) vs `Show Desktop` default Meta+D | (not an i3 command) | P | KW `Show Desktop` default Meta+D (current `none`) | live `kglobalshortcutsrc` | C | Note only: the earlier feature map and Paul's memory say Meta+D is fuzzel; the live file shows KRunner on Meta+D (Stage rule: defaults). No conflict today |
| A98 | Meta+Alt+arrows `Switch Window <dir>` (KWin) | geometric directional focus | KW | K Focus (tree-based) | live: current `none`, default Meta+Alt+arrows | C | If left bound, two directional focus systems: harmless, but they disagree on which window is "left" in nested layouts |
| A99 | Alt+Tab `Walk Through Windows` | cycle recency | KW | K follows activation | live: Alt+Tab / Meta+Tab bound | C | Not a conflict; kwin-i3's focus stack follows |
| A100 | `[kwin] HyprKwin *` actions (about 130 entries, all `none`) in live `kglobalshortcutsrc` | (stale registrations of another tiling script) | none | | live `kglobalshortcutsrc` `[kwin]` section | C | Dead registrations from a script that is not loaded; unbound, so inert today. If that script were re-enabled beside kwin-i3 they would add a third tiler (CLAUDE.md warns against); worth cleaning with `kglobalaccel unregister` when Paul agrees |
| A101 | `kwin-i3 Move Right (;)` (RETIRED) and the old `Move to Workspace N` ids | (kwin-i3 internal) | K | | `RETIRED` list, `src/kwin.js:1371`, unregistered on each load | C | Fine |

### Count by owner (first-named owner, approximate: pipes inside cells blur the tally)

Rows A1-A101. K about 31, none about 33, OOS about 11, P about 6, KW about 6, n/a about 5, DF 0 as primary (it appears only under "also").

## Slice B: i3's config grammar (`parser-specs/config.spec`) and criteria, against kwin-i3 + Plasma

Sources read: i3 4.24 `parser-specs/config.spec` (every non-`bar` state, every value), `docs/userguide` (assign/workspace output, floating size); kwin-i3 `README.md` (config table), `docs/plan.md` ("Scope", Behaviour, Policies), `src/rules.js`, `src/settings.js` (the TABLE), `src/kwin.js` (KEYS, fullscreen/popup, warp, noBorder, keepAbove), `LATER.md`, `docs/i3-feature-map.md` (cross-check only); live `~/.config/kwinrc` (read-only; `kwinrulesrc` does not exist, so Paul has no KWin window rules); KWin v6.7.5 `src/kwin.kcfg` and `src/rules.cpp` (matching) over curl. Not checked: the kcm Keys list (whether it lets one action carry more than two keys), the plugin sources (frame colour per monitor-focus), behaviour of a KWin rule that sets a desktop against the per-output tree (the feature map flagged it unverified; I did not test, read-only), the dotfiles `setup.sh` focus-policy line (grep found no match, but the live kwinrc shows `FocusPolicy=FocusFollowsMouse`, `DelayFocusInterval=0`, `NextFocusPrefersMouse=true`). KWin rule *setters* (position, desktops, etc.) are tagged D: I read the match code, not the apply code. `bar {}` is another slice. Owner key: K kwin-i3, KW stock KWin, P Plasma, DF dotfiles only, none (hole), OOS (plan "Scope"), n/a.

Plan "Scope" row quoted below as **Scope-config**: "i3's config file and `i3-msg` IPC: settings belong in System Settings (and `kwinrc`)" and **Scope-rules**: "`assign`, `for_window` and other per-window rules beyond managed / floating: KWin's Window Rules already do them".

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|

**File-level syntax**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B1 | config file as a whole (`~/.config/i3/config`) | one text file holds every setting and binding | OOS | K settings page, `kwinrc [Script-kwin-i3]` | Scope-config; `src/settings.js` TABLE | C | Deliberate. Settings live in System Settings and kwinrc; keys in KWin's shortcut list. |
| B2 | `# comment` | line ignored | n/a | | no file | C | |
| B3 | `set $var value` / `set\t` | defines a variable | n/a | | no file | C | |
| B4 | `set_from_resource $v name default` | variable from X resource | n/a | | X resources are an X11 concept | C | |
| B5 | `include <pattern>` | splits a config across files, globs, shell expansion | OOS | | Scope-config | C | |
| B6 | reload (`reload` command, Meta+Shift+C) re-reads config | re-parse config, keep layout | K script | KW (`reconfigure`) | Meta+Shift+C asks KWin to reconfigure; script re-reads `Settings.load()` (`src/settings.js` header, README keys table) | C | Deliberate split: KWin owns the config signal, kwin-i3 reacts. Without kwini3helper, the settings form needs this key (README). |
| B7 | config errors reported (i3-nagbar, `-C` check) | bad line shows a bar | K, in part | | `parse()` logs `WARN setting <key>: not a valid ...` and uses the default (`src/settings.js:563`) | C | Log only (journal / debug log); no on-screen error. Small gap, fits "basic" only if a user hand-edits kwinrc. |
| B8 | `bar { ... }` block | | other slice | | | | |

**Fonts, borders, gaps, colours**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B9 | `font <font>` (`pango:...`) | title bar and bar font | P | | System Settings > Fonts > Window title font; Breeze decoration | D | Tiled windows have no title bar with the plugin, so nothing to set; floating windows use Plasma's. |
| B10 | `title_align left\|center\|right` | title text alignment in the title bar | P | | Window Decorations > Breeze > Configure > title alignment (KDecoration setting) | D | Moot for tiled windows (no bar). Floating: Plasma's. Not a hole. |
| B11 | `default_border normal [<n>]` / `new_window normal` | tiled window gets a title bar plus border | K (no plugin) | | without kwini3hold, tiled windows keep Plasma's title bar (README plugins table) | C | The "normal" look is what you get with no plugin; no switch to choose it with the plugin loaded except unloading it. |
| B12 | `default_border pixel <n>` / `new_window pixel` / `1pixel` | n-px border, no title bar | K (kwini3hold) | | setting `frameWidth` 1-10, colours `frameActive/Inactive`; frame is drawn outside the window in tile room (README config table) | C | Needs the plugin (rebuild after each Plasma update). i3's `pixel` default is 2 px; here 1 px. Also `1pixel` form maps to frameWidth=1. |
| B13 | `default_border none` / `new_window none` | no border, no title bar | none | | `frameWidth` min is 1 (`settings.js:496`) | C | Real but small gap: a frameless tile is the "none" look. Nobody has asked; Paul runs 1 px. |
| B14 | `default_floating_border normal\|pixel\|none` / `new_float` | border style of floating windows | K (setting) | P/KW decoration | `frameOnFloating` (false = Plasma decoration, true = frame without title bar); `frameFloatingActive/Inactive` | C | Two states only (normal / frame); `none` and a distinct pixel width for floating (the width is `frameWidth`, shared) do not exist. |
| B15 | `hide_edge_borders none` | borders everywhere | K | | the frame is always drawn, outside the window | C | Equals `none`; the only mode available. |
| B16 | `hide_edge_borders vertical\|horizontal\|both` | hides borders touching screen edges | none | | no code (`grep` finds no edge logic); the frame sits in tile room, so hiding it would change tile geometry | C | Not a gap for "feel"; i3 users on one 1 px border rarely use it. |
| B17 | `hide_edge_borders smart` / `smart_no_gaps` (and `<bool>` forms) | no border when only one window / no gaps | none | | none | C | Mild gap: a lone window keeps its 1 px frame. |
| B18 | `smart_borders on\|off\|no_gaps` | hide borders when only one tiled window | none | | none | C | Same as B17. |
| B19 | `gaps inner <n>[px]` | gap between windows | K script | | `gapsInner` (default 4, 0-100, even) | C | i3 default is 0; here 4 (Paul's choice). Odd values count as the even below. |
| B20 | `gaps outer <n>` | extra gap at screen edge | K script | | `gapsOuter` (default 2, 0-200); edge gap = inner + outer (README) | C | |
| B21 | `gaps horizontal\|vertical\|top\|right\|bottom\|left <n>` | per-side outer gaps | none | | none | C | Possible reason to want it: a panel is a reserved area already (KWin work area), so per-side gaps are rarely needed. |
| B22 | `gaps ... <n>` with a negative / relative value (`+5`, `-5` via commands) | adjust gaps live | none | | | D | Command side; belongs to the commands slice. |
| B23 | `workspace <n> gaps inner\|outer <px>` | gaps per workspace | none | | none | C | Not needed for basic. |
| B24 | `smart_gaps on\|off\|inverse_outer` | no gaps when one window | none | | none | C | Mild gap, like B17. |
| B25 | `client.focused` (border bg text indicator child_border) | colours of the focused window | K (kwini3hold) | | `frameActive` (`#4c7899`), floating `frameFloatingActive` | C | One colour only (the frame): bg/text/indicator have no meaning without a title bar. |
| B26 | `client.unfocused` | colours of unfocused windows | K (kwini3hold) | | `frameInactive` (`#333333`), `frameFloatingInactive` | C | |
| B27 | `client.focused_inactive` | focused in its container, but a different container has the focus | none | | only active / inactive exist | D | I did not read plugin/ to see whether an unfocused monitor's last-focused window gets the active colour. Unchecked. Probably invisible to most users. |
| B28 | `client.focused_tab_title` | tab title colour | OOS | | tabbed layout is out (Scope) | C | |
| B29 | `client.urgent` | colour of an urgent window | OOS | P (task manager flash) | urgency out (Scope) | C | |
| B30 | `client.placeholder` | restore-layout placeholder | n/a | | no `append_layout` here | C | |
| B31 | `client.background` | colour behind windows | P | | wallpaper / Plasma | C | Paul's DF sets a dark wallpaper `#181818`. |
| B32 | colour values `#rrggbb` / `#rrggbbaa` | | K | | `parse()` accepts `#rrggbb` only (`settings.js:522`) | C | No alpha. |
| B33 | `show_marks yes\|no` | marks shown in title | OOS | | marks out of scope (Scope) | C | |

**Layout and orientation**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B34 | `default_orientation horizontal` | new workspaces split side by side | K script | | `defaultOrientation` = horizontal | C | |
| B35 | `default_orientation vertical` | new workspaces split top-down | K script | | `defaultOrientation` = vertical | C | |
| B36 | `default_orientation auto` | by monitor shape (wide = horizontal) | K script | | `defaultOrientation` = auto (default); README: side by side unless monitor taller than wide | C | Workspaces that exist keep theirs, as in i3. |
| B37 | `workspace_layout default` | new workspaces start as splith/splitv | K script | | same as B34-B36 | C | |
| B38 | `workspace_layout stacking` / `stacked` / `tabbed` | new workspaces start stacked/tabbed | OOS | | Scope: tabbed and stacked left out ("I don't use tabbed", Paul 2026-10-21) | C | Decision. |

**Floating**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B39 | `floating_modifier <mod>` (Mod1-5, Shift, Control, Ctrl, joined by `+`) | modifier+left drag moves, +right drag resizes a window | KW | | Window Behavior > Window Actions "Modifier key", `kwin.kcfg CommandAllKey` default `Meta`, `CommandAll1=Move`, `CommandAll3=Resize`; Paul's kwinrc sets nothing, so the default applies | C | kwin-i3 does not set it; KWin's default already is Meta (same as `$mod`). A user who changed it to Alt breaks the "Meta+drag" the README promises. Only one modifier, no `Shift`+. KWin also gives middle-click "Toggle raise and lower" (not in i3). |
| B40 | `floating_modifier` applied to a tiled window | i3: drag a tiled window with the modifier makes it float? (no: with `tiling_drag` it rearranges; otherwise only floating windows move) | KW (+K) | | plan Policies "foreign untile": a Meta+drag of a tiled window floats it where dropped; Meta+Shift+Space tiles again | C | Differs from i3 (i3 ignores the drag on tiled windows without `tiling_drag`). Deliberate in plan. |
| B41 | `floating_minimum_size <w> x <h>` | clamps floating window size from below (default 75x50) | KW | | client's own min size; KWin's decoration minimum (150 px, plan Policies row "monitor returns") | D | Windows with a larger min than the tile, or non-resizable, float (`rules.js:35`). No kwin-i3 setting. |
| B42 | `floating_maximum_size <w> x <h>` (`-1` unlimited, `0` default) | clamps floating window size from above | KW | | KWin Window Rules "Maximum size" or the client | D | i3 default max is a fraction of the output; KWin has none. Harmless. |
| B43 | automatic floating of dialogs, `transient_for`, utility, splash, toolbar | i3 floats these windows | K script | | `rules.js:34-36`: transient, modal, fixed size, dialog, splash, utility; toolbar/menu are popups or special, which are ignored | C | On Wayland there is no window type, so mostly the transient/modal tests apply (plan Policies). |
| B44 | `floating_modifier` default when unset | none: floating windows cannot be dragged with a key | KW | | n/a: KWin's default is on | C | |

**Mouse and focus**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B45 | `tiling_drag modifier\|titlebar` (default `modifier`) | drag a tiled window onto another to move it in the tree | K (helper + script + kwini3hold) | | 2026-10-26: Meta+drag, and a title-bar drag in the title-bar look (`plugin/tilingdrag.cpp`, `docs/spec-tiled-look.md` part B); KWin's untile-and-float moved to Meta+Shift+drag (decision D) | C | Closed. |
| B46 | `tiling_drag off` | disables the above | n/a | | nothing to disable | C | Effectively what is here. |
| B47 | `tiling_drag swap_modifier <mod>` | modifier toggles swap vs. move during the drag | K (helper) | | 2026-10-26: no swap modifier: a centre drop always swaps; Meta+Shift+drag floats instead (`docs/spec-tiled-look.md`, decision D) | C | A deliberate break from i3. |
| B48 | `focus_follows_mouse yes` (default) | pointer into a window focuses it | KW | DF sets it | kwinrc `[Windows] FocusPolicy=FocusFollowsMouse`, `DelayFocusInterval=0`, set by dotfiles (the live kwinrc); kwin-i3 only follows `windowActivated` (plan Policies) | C | A stock install is `ClickToFocus` (KWin default), so i3's default feel is NOT provided by kwin-i3 or by stock Plasma. README does not tell a new user to set it. Candidate hole for a user who is not Paul. |
| B49 | `focus_follows_mouse no` | click to focus | KW | | stock default (`FocusPolicy=ClickToFocus`) | D | |
| B50 | focus follows mouse and a raise | i3 never raises (floating always above) | K + KW | | `AutoRaise` false (kwin.kcfg), `ClickRaise` true default; kwin-i3 keeps floating windows `keepAbove` (`kwin.js:758-833`) | C | Harmless duplicate: `ClickRaise` is KWin's, floating-above is kwin-i3's. |
| B51 | after a focus loss (window closes) focus goes to the previous in the container | | K script | KW (`NextFocusPrefersMouse=true` in Paul's kwinrc) | kwin.js closingNext (962-980): kwin-i3 puts the container's previous focus; KWin activates its own choice first | C | Possible fight: with `NextFocusPrefersMouse=true` KWin picks the window under the pointer; kwin-i3 overrides after. The comment at kwin.js:960-966 shows kwin-i3 knows. Paul's value is not the KWin default (false). |
| B52 | `mouse_warping output` (default) | pointer jumps to the new output when focus changes monitor | K script | KW action | `MoveMouseToCenter` / `MoveMouseToFocus` called only on a key-driven monitor change (kwin.js:1161, 1183); README keys table | C | Matches i3 (i3 warps only from commands, `kwin.js:49` comment). |
| B53 | `mouse_warping none` | never warp | none | | no setting; the warp is always on | C | Small: nobody has asked for the off switch. |
| B54 | `focus_wrapping yes` | wrap at the container edge, cross monitor first | K script | | `focusWrapping=yes` (default) | C | |
| B55 | `focus_wrapping no` | never wrap | K script | | `focusWrapping=no` | C | |
| B56 | `focus_wrapping force` | always wrap inside the container | K script | | `focusWrapping=force` | C | |
| B57 | `focus_wrapping workspace` | wrap, never leave the workspace | K script | | `focusWrapping=workspace` | C | |
| B58 | `force_focus_wrapping <bool>` (deprecated alias) | same as `focus_wrapping force` | K script | | `focusWrapping=force` | C | |
| B59 | `focus_on_window_activation smart` (default) | activate a window on a visible workspace, mark the rest urgent | KW | K (fullscreen case) | KWin `FocusStealingPreventionLevel` (default 1, Low; 0-4) and xdg-activation; kwin-i3 hands focus back only under a fullscreen window (`keepsFullscreenFocus`, kwin.js:879-895) | C | KWin's rule differs: an allowed activation of a window on another desktop switches that monitor's desktop (activation.cpp, cited in kwin.js:884, 1172), where i3 `smart` only flags it. kwin-i3 absorbs it afterwards (`kwin.js:2000`), so it is a follow-on, not a fight. |
| B60 | `focus_on_window_activation urgent` | never focus, only flag | KW | | Focus Stealing Prevention "Extreme" | D | |
| B61 | `focus_on_window_activation focus` | always focus | KW | | Focus Stealing Prevention "None" | D | |
| B62 | `focus_on_window_activation none` | ignore activation requests | KW | | "Extreme" (+ demands-attention) | D | |
| B63 | `no_focus <criteria>` | new matching windows don't take focus | KW | | KWin Window Rule, "Focus stealing prevention" (`fsplevel`) or "Accept focus: Force No"; matches by class / role / title / machine / type | D | A Force-No "accept focus" window cannot be focused by kwin-i3's tree focus either: its `workspace.activeWindow =` is refused. Not tested. |
| B64 | `force_display_urgency_hint <ms> ms` | keep urgency hint on for n ms after focusing | OOS | P (Plasma task manager "demands attention") | Scope: urgency out (plan Behaviour: "no bar") | C | |
| B65 | `popup_during_fullscreen smart` (default) | popups of the fullscreen app show; others stay behind | K script | KW (fullscreen on top while active) | `keepsFullscreenFocus` (kwin.js:879), transient exempt | C | |
| B66 | `popup_during_fullscreen ignore` | popups never show | none | | no setting; kwin-i3 always does `smart` | C | |
| B67 | `popup_during_fullscreen leave_fullscreen` | a popup ends fullscreen | none | | | C | |
| B68 | `popup_during_fullscreen all` | popups of others show too | none | | | C | The above three are values a user "would reasonably want different" only rarely; settings policy in plan forbids a setting without need. |
| B69 | i3 rule: a new window on a fullscreen workspace gets no focus | | K script | | same as B65 | C | |

**Workspaces and outputs**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B70 | `workspace <n> output <name>` | pins workspace n to a monitor | K script | KW (per-output desktops) | `workspaceOutputs` = `1=DP-4, 2=DP-6` (connector names); needs `PerOutputVirtualDesktops=true` | C | Deliberate split: KWin supplies per-output desktops; kwin-i3 adds the pin. Numbers 1-10 only. |
| B71 | `workspace <n> output <o1> <o2> ...` (fallback list) | first output that exists | none | | `parse()` takes one connector per number (`settings.js:530`) | C | Gap only for a laptop that docks: one name per workspace. |
| B72 | `workspace <name> output ...` with a named workspace | | none | | workspaces are numbers 1-10 (`settings.js:530`; feature map row 25) | C | Plasma desktop names show in the widget but are not identities. |
| B73 | `workspace <n> output primary\|left\|right\|up\|down\|nonprimary` | output roles | none | | only connector names | D | In 4.24 userguide for `assign ... output` (line 950); `workspace ... output` accepts them too. Gap mild. |
| B74 | `workspace_auto_back_and_forth yes` | pressing the shown workspace's key goes back | K script | | `workspaceAutoBackAndForth` (default false) | C | i3's default is no. |
| B75 | `workspace <n> gaps ...` | see B23 | none | | | C | |
| B76 | `fake_outputs` | test-only fake monitors | n/a | | tests use the headless KWin with virtual outputs (`tools/testkwin.sh`) | C | |
| B77 | `force_xinerama` / `force-xinerama` | use Xinerama instead of RandR | n/a | | X11 | C | |
| B78 | `disable_randr15` | use old RandR | n/a | | X11 | C | |

**Bindings**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B79 | `bindsym <mods>+<key> <command>` | key runs an i3 command | KW (KGlobalAccel) + K | | each kwin-i3 action is a KWin global shortcut named `kwin-i3 <verb>`, default keys from `KEYS` (kwin.js:1373); rebind in System Settings > Shortcuts or the settings page "Keys..." | C | Binding is fixed to the list of actions; a user cannot bind a key to an arbitrary i3 command (e.g. `move scratchpad`, `resize shrink width 5 px`). Deliberate (Scope-config). |
| B80 | `bindcode <code>` | binds a keycode | K (kwini3helper) | | layout keys: digit row and `;` follow the key position on non-US layouts (README plugins table) | C | Only for the keys kwin-i3 ships; no user bindcode. |
| B81 | `bind` (alias of bindsym) | | KW | | | C | |
| B82 | bindsym `--release` | fires on key release | none | | KGlobalAccel has press only | D | |
| B83 | bindsym `--border` | binding fires on a click on a window border | K (kwini3helper), in part | KW | the 1 px frame: hover and click focus the window; bindings on it do not exist (README "Mouse") | C | |
| B84 | bindsym `--whole-window` | binds mouse buttons on the whole window (`bindsym button4 ...`) | KW | | System Settings > Window Behavior > Window Actions (`CommandAll*`, `CommandWheel`), or Plasma's input actions | D | Scope: "mouse chords" out, Paul 2026-10-24. |
| B85 | bindsym `--exclude-titlebar` | | n/a | | tiled windows have no title bar with the plugin; floating use Plasma's | C | |
| B86 | modifiers `Mod1` (Alt), `Mod4` (Meta), `Shift`, `Control`/`Ctrl` | | KW | | Qt key names `Alt`, `Meta`, `Shift`, `Ctrl` in KGlobalAccel | C | Names only. |
| B87 | modifiers `Mod2` (NumLock), `Mod3`, `Mod5` | | n/a | | Qt has no such modifiers | C | |
| B88 | modifiers `Mode_switch`, `Group1`-`Group4` | XKB group switch in a binding | n/a | | | C | Layout switching is Plasma's keyboard layouts. |
| B89 | `$mod` variable (`set $mod Mod4`) | one place sets the main modifier | none | | every default is `Meta+...` in `KEYS`; no single `$mod` setting | C | A user who wants Alt as the modifier rebinds ~40 keys by hand. Real gap for "different modifier" users; the Keys list has no bulk change. |
| B90 | several keys for one command | two `bindsym` lines for one action | K | | `KEYS` entries have 2 keys (Meta+Left and Meta+J); KGlobalAccel keeps alternates | C | |
| B91 | `bindsym ... exec <cmd>` | key starts a program | P (+DF) | | a `.desktop` file with a `_launch` global shortcut (Plasma); DF does Meta+Return, Meta+D, etc. | C | A stock install: Plasma's own menu / KRunner key. |
| B92 | `bindsym ... exec --no-startup-id` | no launch feedback | n/a | | | D | |
| B93 | `mode "name" { bindsym ... }` / `mode --pango_markup "name"` | a binding mode with its own keys | none, by limit | | plan Behaviour: "a script cannot register keys that exist only inside a mode" | C | Known limit. The resize mode is built as direct keys (Meta+Ctrl+arrows). Others (system mode, passthrough/Hide mode) have no route. |
| B94 | `mode` bindings inside the block (`bindsym` / `bindcode` / `bind` flags) | | none | | follows B93 | C | |
| B95 | `bindsym Mod+r mode "resize"` + `resize` keys | step 10 ppt | K | | direct keys Meta+Ctrl+arrows / J K L ;, `resizeStep` 1-50 % | C | Difference: no mode, no Escape. Two owners hold Meta+Ctrl+arrows in a stock Plasma: KWin "Switch One Desktop" (README Install step 2); `make take-keys` frees them. A conflict on a stock install (the held key fires, not kwin-i3's). |

**Startup, IPC, misc**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B96 | `exec <cmd>` | start a program at startup | P | DF | Plasma autostart, systemd user units | D | |
| B97 | `exec_always <cmd>` | also at every reload | none | | | D | No equivalent; a reload of kwin-i3 does not start programs. Not needed for a window manager inside Plasma. |
| B98 | `exec --no-startup-id` | | n/a | | | D | |
| B99 | `ipc-socket` / `ipc_socket <path>` | path of the IPC socket | OOS | | Scope-config (IPC); KWin's D-Bus is the surface | C | |
| B100 | `ipc_kill_timeout <ms>` | wait before killing an IPC client | n/a | | | C | |
| B101 | `restart_state <path>` | test-only restart file | n/a | | state is rebuilt from KWin's tiles at load (plan decision 5) | C | |
| B102 | `force_xinerama`, `fake_outputs` etc. | see B76-B78 | n/a | | | C | |

**for_window and assign (config side)**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B103 | `for_window [criteria] floating enable` | float matching windows | K script | KW | `floatingClass` (class or instance), `floatingTitle` (substring) in kwinrc; Paul's kwinrc: `floatingTitle=STAGE (streamed),Picture-in-Picture` | C | A KWin rule cannot make kwin-i3 float a window except by forcing a size (refusal then float) or "skip taskbar" (ignored, not floated). Two lists of "floats" (kwin-i3 lists and KWin rules) is the feature map's redundancy 8. |
| B104 | `for_window [criteria] floating disable` / `tiling` | force tiling | none | | `Rules.classify` has no "tile" override; ignore list makes the window unmanaged, not tiled | C | Can't override the transient / fixed-size float. Mild. |
| B105 | `for_window [criteria] border none\|pixel N\|normal` | per-window border | KW | K | KWin Window Rule "No titlebar and frame" (`noborder`); kwin-i3 itself sets `noBorder` on tiled windows | D | Conflict: a Force rule wins over kwin-i3's `w.noBorder` (`kwin.js:859-860` returns, review-window-modes finding 4). Only for a window the user wants to differ. |
| B106 | `for_window [criteria] move to workspace N` / `assign` | puts the window on N | KW | K | KWin Window Rule "Desktop(s)" / "Screen" (Apply initially or Force) | D | Interplay with the tree is unverified (feature map): kwin-i3 adopts by the window's desktop (`adoptWindow`), so probably works, not tested. Per-output desktops: a rule's desktop is a UUID, and the window appears on whichever monitor shows... unverified. |
| B107 | `for_window [criteria] fullscreen enable` | | KW | | Window Rule "Fullscreen" | D | kwin-i3 handles the result (fullscreen tree spec). |
| B108 | `for_window [criteria] sticky enable` | on all workspaces | KW | K (ignores it) | Window Rule "All desktops"; kwin-i3 never manages `onAllDesktops` (`rules.js:30`) | C | Deliberate: such a window leaves the tree. |
| B109 | `for_window [criteria] move position center\|... / resize set` | placement and size | KW | | Window Rule Position / Size | D | If the rule sets a size on a tiled window, KWin refuses the tile and kwin-i3 floats it (spec-fullscreen-tree R-7). |
| B110 | `for_window [criteria] move scratchpad` / `mark` | | OOS | | marks and scratchpad out (Scope) | C | |
| B111 | `for_window [criteria] opacity` / `title_format` | | KW / n/a | | Window Rule "Opacity"; no title bar | D | |
| B112 | `for_window [criteria] focus` / other commands | run any command on map | none | | | C | The command language is not here (Scope-rules). |
| B113 | `assign [criteria] [→] workspace <name>` | window opens on the workspace | KW | | Window Rule "Desktop(s)", Apply initially | D | See B106. Workspace names are not supported (B72). |
| B114 | `assign [criteria] → workspace number <n>` | match by workspace number | KW | | same, desktop N | D | |
| B115 | `assign [criteria] → output <name\|left\|right\|up\|down\|primary\|nonprimary>` | opens on a given monitor | KW | | Window Rule "Screen" | D | |
| B116 | `no_focus [criteria]` | see B63 | KW | | | D | |

**Criteria keys** (what a user does here to match windows that way)

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| B117 | `[class="regex"]` | X WM_CLASS class, PCRE, case-sensitive | K (lists) | KW | kwin-i3: `ignoreClass` and `floatingClass` compare `w.resourceClass` or `w.resourceName` for **exact equality**, case-sensitive (`rules.js:10, 28, 40`). KWin Window Rules: "Window class" with Exact / Substring / Regex (`rules.cpp:385`, also "complete" class+name) | C | On Wayland resourceClass is the app_id. No regex or substring in kwin-i3's lists. For regex use a KWin rule, which kwin-i3 only sees through side effects. |
| B118 | `[instance="regex"]` | WM_CLASS instance | K (lists) | KW | the same lists also test `resourceName`, so class and instance cannot be told apart | C | |
| B119 | `[window_role="regex"]` | WM_WINDOW_ROLE | K (ignore only) | KW | `ignoreRole` (default `quake`) vs `w.windowRole` (`rules.js:29-30`); no `floatingRole`; KWin rule "Window role" (`rules.cpp:405`) | C | Can ignore by role, can't float by role. Roles don't exist on Wayland windows, so only X11/Xwayland. |
| B120 | `[window_type="..."]` normal, dialog, utility, toolbar, splash, menu, dropdown_menu, popup_menu, tooltip, notification | match `_NET_WM_WINDOW_TYPE` | K (fixed) | KW | `rules.js:27-36`: popup, special, not-normal = ignored; dialog, splash, utility = float; no user setting; KWin rule "Window types" (`rules.cpp:372`) | C | A user can't *choose* by type in kwin-i3; only a KWin rule can, with the above-named effect. Wayland has no types (plan), so mostly moot. |
| B121 | `[title="regex"]` | window title, PCRE | K (float only) | KW | `floatingTitle`: substring of `w.caption` (`rules.js:12-15`); no `ignoreTitle`; KWin rule "Window title" Exact / Substring / Regex (`rules.cpp:421`) | C | Substring, not regex; a Wayland caption change re-judges (`captionChanged`, plan Policies). Can float by title, can't ignore. |
| B122 | `[urgent=latest\|oldest]` | the latest / oldest urgent window | OOS | | urgency out (Scope) | C | |
| B123 | `[workspace="name"]` | all windows on that workspace | K (partly) | | `floatingWorkspaces` ("3, 7"): every new window there floats (Plasma-window mode); `README` config table | C | Different meaning: the kwin-i3 setting is about *new* windows, not a selector for commands. No workspace criterion for ignore. |
| B124 | `[con_mark="regex"]` | by mark | OOS | | marks out (Scope) | C | |
| B125 | `[con_id="..."]` | internal container id | n/a | | no IPC id; KWin has window UUIDs via `workspace.windowList()` | C | |
| B126 | `[id="..."]` | X window id | n/a | | Wayland has no window ids shared with clients | C | |
| B127 | `[floating]` / `[tiling]` | current mode | none | | kwin-i3 state (`wins[id]`, tile membership) isn't a rule input | C | A KWin rule cannot see it either. |
| B128 | `[floating_from="auto\|user"]` / `[tiling_from="auto\|user"]` | how the window came to float / tile | n/a | | no equivalent; the "told[key]" record in kwin.js is internal | C | |
| B129 | `[machine="regex"]` | WM_CLIENT_MACHINE | KW | | KWin Window Rule "Client machine" (`rules.cpp:437`) | C | kwin-i3 lists have no host test. |
| B130 | `[all]` | matches every window | n/a | | the rules apply to every window by default | C | |
| B131 | `[__focused__]` | the focused window (command criteria) | n/a | | commands act on the focus by default | C | |
| B132 | several criteria in one `[ ]` (AND) | all must match | KW | | KWin Window Rule has class, role, type, title, machine fields that must all match (`rules.cpp:486-506`); kwin-i3's lists are independent OR conditions | C | e.g. "class X and title Y" has no kwin-i3 form. |
| B133 | wayland `app_id` / desktop file | (not an i3 key) | KW | K | KWin rule "Desktop file name" (`rules.cpp:605`), kwin-i3 uses `resourceClass`, which on Wayland holds the app_id | D | Mentioned for completeness. |
| B134 | regex features: `^...$`, `(?i)`, alternation | PCRE | KW | | KWin regex = QRegularExpression, case-sensitive by default | C | |


## Slice C: i3's behaviour that is not a command or a directive

Sources read: i3 4.24 `src/manage.c`, `handlers.c`, `workspace.c`, `randr.c`, `floating.c`, `click.c`, `render.c`, `gaps.c`, `con.c` (fullscreen, urgency, on_remove_child), `ewmh.c` (function list), the userguide's behaviour sections and `docs/multi-monitor` (historical: it only covers the nVidia/Xinerama workaround, so it gets one row). kwin-i3: all of `src/kwin.js`, `rules.js`, `settings.js`, `workspaces.js`, the model parts of `tree.js`, `plugin/hold.cpp` and `framefocus.cpp` (parts), `README.md`, `docs/plan.md`, `spec-unmanaged-windows`, `spec-fullscreen-tree`, `spec-float-size`, `spec-desktops-on-demand`, `spec-popup-grace`, the earlier `docs/i3-feature-map.md`, and the live `~/.config/kwinrc` (no `kwinrulesrc` rules exist). KWin 6.7.5 source fetched and read: `activation.cpp`, `placement.cpp`, `workspace.cpp` (`addWaylandWindow`, `updateOutputs`), `virtualdesktops.cpp`, `xdgshellwindow.cpp`, `x11window.cpp` (startup notification, initial desktops), `window.cpp` (demandAttention, fullscreen layer), `pointer_input.cpp`, `kwin.kcfg` defaults. Not checked: anything needing a running session (all KWin behaviour is from source, and kwin-i3 behaviour from code and the test names, not run); KWin rules (none in use); `x.c`/`startup.c`/`xcb.c` details were skimmed through the handlers that call them, not read line by line; Xwayland-specific paths in KWin only where named. "Owner" is the party that decides the behaviour; the first token is the primary owner for counting. Tag C = code or live config read, D = docs/inference only.

Key to evidence: `kwin.js:N` etc. are in `/home/paul/kwin-i3/src/`; i3 files are in i3 4.24 `src/`; KWin files are v6.7.5 `src/`.

### Header facts the rows rely on

- Live kwinrc `[Windows]`: `FocusPolicy=FocusFollowsMouse`, `DelayFocusInterval=0`, `NextFocusPrefersMouse=true`, `PerOutputVirtualDesktops=true` (all DF, `setup.sh`); KWin's defaults are click-to-focus, delay 300, prefers-mouse false. `FocusStealingPreventionLevel` and `ActivationDesktopPolicy` are not set, so KWin's defaults hold: level 1 (Low), `SwitchToOtherDesktop` (`kwin.kcfg`).
- A new Wayland toplevel starts on `workspace()->activeOutput()` and that output's current desktop (`xdgshellwindow.cpp:1885-1887`), and the active output follows every pointer motion (`pointer_input.cpp:950`) and every activation (`activation.cpp:266`). i3 uses the focused container's workspace.

Columns in every table: # | i3 item | What i3 does | Owner here | Also done by | How / evidence | Tag | Note.

**A. A new window: where it goes, whether it floats, whether it gets focus**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C1 | New tiled window inserted after the focused container, in its parent (`tree_open_con`, `_con_attach`) | Goes right after the most recently focused tiling child; falls back to the end | K script (`tree.js`) | KW places it too (default placement is "centered", `placement.cpp:34-55`); the tile overrides it. Harmless duplicate | `M.open` `tree.js:246`, `attach` `tree.js:184`; `adoptWindow` `kwin.js:897` | C | `PlacementTracker`/placement only matter until the tile is applied. |
| C2 | Which workspace/output a new window lands on | The workspace of the focused container | KW decides (activeOutput + its current desktop); K adopts it into that workspace | K: `wsForWindow` follows `w.desktops[0]` (`kwin.js:98`). Disagreement possible when pointer and keyboard focus are on different monitors (KWin follows the pointer, i3 the focus) | `xdgshellwindow.cpp:1885-1887`, `pointer_input.cpp:950`; `kwin.js:98,926` | C | Mostly invisible: focus-follows-mouse and key-driven pointer warps (`kwin.js:1161,1183`) keep the two together. See C75 for the one case that is not. |
| C3 | Focus the new window if its workspace is visible and on the focused output (`manage.c` `set_focus`) | New window gets focus normally | KW (`addWaylandWindow` activates at FSP level Low, always) | K follows the activation: `w.active` -> `model.focusWin` | `workspace.cpp:930-935`; `kwin.js:924`; level not set in kwinrc so default Low | C | Same result as i3 for Wayland windows. For X11 windows KWin applies timestamp rules (`activation.cpp:66-115`), so a background X11 app's window may not take focus where i3's would. |
| C4 | No focus, no workspace switch for a window put on an invisible workspace (assignment, `_NET_WM_DESKTOP`, startup workspace) | Opens there silently, urgent flag set | KW | none from K. K only adopts the window into that desktop's tree | `activateWindow` switches the output's desktop with the default `SwitchToOtherDesktop` (`activation.cpp:305-318`); `kwin.kcfg` default | C | **Difference, not a conflict.** A window KWin activates on a hidden workspace (a window rule, a session restore, a link opened in a running browser) switches that monitor to its workspace; i3 would mark it urgent. kwin-i3 only follows (`shownOutside`, `kwin.js:2005`). Won't fix: finding 6 has the reason (Paul, 2026-10-25). |
| C5 | `_NET_WM_USER_TIME` = 0 means do not focus | Window stays unfocused | KW (X11/Xwayland windows only) | none | `activation.cpp:78-115` comment, `X11Window::readUserTimeMapTimestamp` | D | n/a for native Wayland windows. |
| C6 | New window while a fullscreen window is on the workspace (`manage.c` "fs != NULL, not focusing") | Opens behind, no focus, second in the focus stack | K script | KW activates it first; K hands focus back from the `windowAdded` handler (one event-loop turn) | `keepsFullscreenFocus` `kwin.js:887`; `tree.js:246-262` (second in the stack); live test `32-fullscreen-open.sh`; plan Meta+F row | C | Deliberate split: KWin acts, kwin-i3 reverses within the same turn. A brief KWin activation does happen. |
| C7 | `popup_during_fullscreen smart` (default) | A transient of the fullscreen app is shown and focused; other windows are not | K script (any `transient` window keeps KWin's focus) | KW lets an active window sit above a fullscreen one (`isActiveFullScreen`, `window.cpp:2280-2290`) | `kwin.js:887-895` (`w.transient` check); spec-fullscreen-tree "The transient check" | C | Slightly wider than i3: i3 requires the transient to belong to the fullscreen window, kwin-i3 accepts any transient (documented in the spec as a deliberate cheap reading). |
| C8 | `popup_during_fullscreen ignore \| leave_fullscreen \| all` | Alternative handling of popups under fullscreen | none | none | not built | C | Not a gap for "basic window management"; smart is the default and the only mode. |
| C9 | A newcomer that opens fullscreen itself (mpv `--fs`) takes the workspace's fullscreen over (`manage.c` `con_toggle_fullscreen`) | New fullscreen window wins | K script | KW honours the client's request | `keepsFullscreenFocus` returns null when `w.fullScreen` (`kwin.js:890`); `tree.js:765-775` `setFullscreen` clears the other flag | C | KWin itself allows several fullscreen windows on one desktop; only the model's single flag limits it (C47). |
| C10 | Floating by window type: `DIALOG`, `UTILITY`, `TOOLBAR`, `NOTIFICATION`, `SPLASH` | Floated automatically | K script (`w.dialog`, `w.splash`, `w.utility` -> float) | KW: toolbar and notification windows are not "normal windows", so `classify` returns "ignore" and KWin handles them | `rules.js:29,35` | C | Wayland has no window type; xdg dialogs show up only as `transient`/`modal` (C11/C12). Toolbars end up unmanaged, not floated: same visible result. |
| C11 | `_NET_WM_STATE_MODAL` floats the window | Floated | K script (`w.modal`) | none | `rules.js:34` | C | |
| C12 | Window is transient for another (`WM_TRANSIENT_FOR`) or has a managed client leader -> float | Floated | K script (`w.transient`) | KW places a transient centred over its parent (`placeDialog`, `placement.cpp:41-50`); X11 transients also open on the parent's desktop (`x11window.cpp:661-690`) | `rules.js:34` | C | The "client leader" half (group transients) is D: KWin's `transient` for X11 group members was not checked. |
| C13 | Fixed-size window (min == max both axes) floats | Floated | K script (`fixedSize`: `!w.resizeable`, or min<max test while fullscreen) | none | `rules.js:23-26,34` | C | KWin's `resizeable` is also false for other reasons (fullscreen); the fullscreen special case exists because of that (spec-fullscreen-tree part B). |
| C14 | Placement of a floating window at map: its requested geometry, centred if it asked for 0,0 (over the leader, else the workspace); moved onto the right output if off it | `floating_enable`, `floating_fix_coordinates` | KW (default placement "centered"; dialogs on their main window) | K only records the geometry for a later tile->float round trip (`recordUntiled`) | `floating.c:330-380`; `placement.cpp:34-80`; `kwin.js:645` | C | Not a conflict: tiles never touch a floating window. KWin's output choice (activeOutput) can differ from the workspace's monitor in the C2 case. |
| C15 | Floating size limits: at least 75x50, at most the combined outputs, plus `floating_minimum/maximum_size` | `floating_check_size` clamps | KW (its own client minimum/maximum handling; the decorated minimum is ~150 px per plan.md) | none | plan.md policy row on hidden floating windows below 150 px | D | Different numbers, same effect. |
| C16 | Dock windows (`_NET_WM_WINDOW_TYPE_DOCK`, struts) get a dock area and are never floated or focused | Space reserved at screen top/bottom | KW (panels via layer-shell/plasma shell, struts in `clientArea`) | K sizes tiles from `clientArea(MaximizeArea)` | `areaOf` `kwin.js:309` | C | The panel's reserved space is respected; tiles never cover the panel. |
| C17 | `_NET_WM_DESKTOP = 0xFFFFFFFF` or `_NET_WM_STATE_STICKY`: float and make sticky | Floated, shown on every workspace | K script ignores it (not managed) | KW keeps it on all desktops | `rules.js:30`; sticky later: `desktopsChanged` -> `dropWindow` `kwin.js:1042-1046` | C | A window that turns sticky mid-life is dropped from the tree but not floated or raised by kwin-i3; it just leaves. Reasonable. |
| C18 | Window that asks for a specific workspace at map (`_NET_WM_DESKTOP`, session restore) opens there | Honoured unless an assignment overrides | KW (initial desktops, `x11window.cpp:649-690`; Wayland: rules/session) | K adopts the window into whichever desktop it ended on | `wsForWindow` `kwin.js:98` | C | OK. Plasma's session restore of windows' desktops on Wayland not checked (D). |
| C19 | **Startup notification**: a window launched with a startup id opens on the workspace it was launched from, even if you switched away (`startup.c`, `manage.c` `startup_ws`) | Per-launch workspace | none | none | KWin's X11 path reads only the xinerama index and timestamp from startup info (`x11window.cpp:483,4237`), never a desktop; a Wayland toplevel gets the active output's current desktop (`xdgshellwindow.cpp:1885-1887`) | C | **Real gap for i3's feel**: start Firefox, switch workspace while it loads, it opens on the new workspace. Plan.md/OPEN do not mention it. |
| C20 | Override-redirect windows, tooltips, menus, popups are not managed | Left alone | K script (`popupWindow`, `specialWindow`, non-normal -> "ignore") | KW | `rules.js:29` | C | |
| C21 | Windows existing when the WM starts are managed | `manage_existing_windows` | K script (`adoptTiled` then `adoptRest`) | KW keeps the tiles themselves across a reload | `kwin.js:1753,1780`; plan decision 5 | C | Minimised windows lose their place on a reload (known, plan). |
| C22 | KWin window rules (not an i3 concept) acting on a window in the tree | n/a | KW | K: a rule-forced border wins (`takeBorder`, `kwin.js:860`); a rule-set desktop is followed (`desktopsChanged`) | `kwinrulesrc` holds no rules today | D | Interplay with `for_window`/`assign` is in the other slices; here only the note that rules fire before kwin-i3 sees the window. |
| C23 | Managed-window focus of non-managed windows (KRunner, popups, dialogs) | i3 has no such windows (dmenu is a normal window) | K script (Paul's 2026-10-25 rule: only key actions override what you see) | KW | `applyFocus` `kwin.js:1126-1127`; `act()` `kwin.js:1214`; `spec-unmanaged-windows.md` | C | Not i3 behaviour; the required Plasma adaptation. |

**B. Closing and focus afterwards**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C24 | Close a tiled window: leaf removed, `fix_percent`, empty split containers removed upward | `tree_close_internal`, `con_on_remove_child` | K script | KW collapses one-child tile layouts itself | `closeCon` `tree.js:277`, `onRemoveChild` `tree.js:296`, `project` `kwin.js:190` | C | Duplicate but harmless (projection tolerates it). |
| C25 | Focus after closing a tiled window with siblings (`con_next_focused`: the container's own focus stack first) | Previous focus in that container | K script (records i3's choice at the `closed` signal, re-applies it after KWin's activation) | KW chooses first (`activateNextWindow`: window under mouse if `NextFocusPrefersMouse`, else the focus chain) | `kwin.js:1014-1017,974-983`; `activation.cpp:435-488`; test `79-close-focus.sh` | C | Both act, kwin-i3 wins in the split case. |
| C26 | Focus after closing a window at the workspace's top level, or a floating one | `con_next_focused` from the workspace's focus stack | KW decides | K does not override here (deliberate: KWin's chain "knows more") | comment `kwin.js:959-968` | C | **Possible divergence**: with `NextFocusPrefersMouse=true` (DF) KWin prefers the window under the pointer, i3 takes the recency order. With focus-follows-mouse the two usually coincide; a flat row (all windows directly under the workspace) takes this path every time. Not seen as a bug. |
| C27 | Focus history inside a split (per-container focus stacks) | Each container remembers its own order | K script (model's `focus` arrays) | KW keeps one global MRU chain per desktop | `focusUp` `tree.js:203`; `windowActivated` -> `model.focusWin` `kwin.js:1856` | C | Two histories; the model is the truth for key actions, KWin's for close fallbacks (C26) and Alt-Tab. |
| C28 | Closing the last window of a workspace: the empty workspace gets focus, no window has keyboard focus | `con_focus` on the workspace | K script | KW's last resort is the desktop window (`activation.cpp:476`) | `applyFocus` `kwin.js:1155-1168` | C | Aligned. |
| C29 | `kill`: `WM_DELETE_WINDOW` if supported, else destroy the window | Polite close; hard kill only for clients without the protocol | KW ("Window Close": xdg-toplevel close or `WM_DELETE_WINDOW`; unresponsive client gets KWin's own "not responding" prompt) | K only invokes it (`kwin.js:1236`) | `Fullscreen`/`Close` run through `invokeShortcut` | C for K, D for KWin | `kill client` (xcb_kill_client) has no equivalent key; KWin's prompt covers a hung app. |
| C30 | Client closes/unmaps its own window | Container closed | K script via `windowRemoved` | KW | `kwin.js:1855` `forgetWindow` | C | |

**C. Containers, splits, sizes**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C31 | A split with one child | Container kept when it holds a window; `tree_flatten` only removes a one-child split whose child is a split of the right orientation | K script, deliberate deviation: a split whose only child is another split is also removed | KW collapses one-child tile layouts | `tidyCon` `tree.js:397`; plan decision 8 | C | Needed because there is no `focus parent`/tabbed. |
| C32 | New workspace's orientation by monitor shape (`_workspace_apply_default_orientation`) | Wide = horizontal, tall = vertical | K script | none | `wsModel` `kwin.js:93`; setting `defaultOrientation` | C | |
| C33 | New window's share = average, others rescaled (`con_fix_percent`) | | K script | KW's tiles display it (K writes the sizes) | `fixPercent` `tree.js:158`; `setSizes` `kwin.js:436` | C | |
| C34 | Size hints of tiled windows (min, max, increments, aspect) are ignored (`render.c` comment: since 0db93d9) | A window is cropped/overflows if it will not shrink | K script, deviation: a leaf tile's `minimumSize` is the window's minimum, and a window that cannot fit floats | KW enforces the client's minimum in the configure; X11 increments are rounded by KWin | `prepareTiles` `kwin.js:357`; `floatWhatCannotFit` `kwin.js:685`; plan policies "minimum size" | C | Intended (plan: "a window that can't fit floats"). X11 resize-increment slack in a tile: D. |
| C35 | Tiled window asks to move/resize itself (`ConfigureRequest`) | Ignored for tiled, applied for floating | K script re-fits a tiled window to its tile after certain changes (`refit`, `armed`) | KW: a tiled window's size is the tile's (Tile::manage) | `fitToTile` `kwin.js:510`; `refitOnFrameChange` `kwin.js:551` | C | Needed because clients can answer a resize late or not at all. |
| C36 | Tiling resize by dragging the border or title bar between tiles; Mod + right-drag on a tiled window | Resizes the nearest border | KW (Meta+right-drag, or a decoration border drag) | K reads the shares back once when the drag ends | `interactiveMoveResizeFinished` `kwin.js:1060-1074` `readBack` | C | **With the plugins the 1 px frame starts no drag** (README), so border-drag resize is gone and only Meta+right-drag and the keys resize. Fine for Paul's i3 (pixel 1). |
| C37 | Tiling drag (i3 4.21+: Mod+left-drag or title-bar drag drops the container into the tree with drop indicators) | Re-arranges the tree by mouse | none | KW's Meta+drag floats the window instead; K accepts it as a float | `tileChanged` handler `kwin.js:1103-1108`; plan policies "foreign untile" | C | Known and deferred ("later, if wanted" in plan). Real feel gap for mouse users of 4.21+ defaults. |

**D. Floating windows**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C38 | Floating windows always above tiling | Floating layer is above | K script (`keepAbove`), except on Plasma-window workspaces | KW honours the flag; with the plugin the effect also keeps the set | `lookFloating` `kwin.js:829-838` | C | A user's own keep-above is overwritten by design (won't-fix, spec-unmanaged-windows). |
| C39 | Toggle to floating returns to the geometry the window first opened with (`con->geometry`) | Fixed record | K script | KW would use its own tile-restore (wrong after a hidden move; hence the record) | `recordUntiled`/`floatAtRecord` `kwin.js:645-669`; spec-float-size | C | |
| C40 | Floating window changes output: keep its relative place (`floating_fix_coordinates`) | Fractions of the old output | K script for floats it floats; KW (PlacementTracker, `desktopResized`) when a monitor goes or returns | both | `floatAtRecord` `kwin.js:658-663`; `workspace.cpp:1435-1485` | C | Duplicate by necessity; K ignores KWin's tiled-window moves on hotplug (decision 10). |
| C41 | Floating window dragged onto another output moves to that output's visible workspace (`floating_maybe_reassign_ws`) | Reassigned, keeps focus | K script (`dragEnd`) | KW changes the window's desktop when it crosses outputs; K's `desktopsChanged` also follows it | `kwin.js:1075-1083,1036-1055` | C | Deliberate duplicate; `dragging` stops the desktopsChanged path acting mid-drag. |
| C42 | Click raises/focuses a floating window; no raise on hover | | KW (`ClickRaise` default true, `AutoRaise` false) | K reads the activation | `kwin.kcfg`; `window.cpp:1999` | C | |
| C43 | Title-bar drag, border resize of floating windows; `floating_modifier` drag/right-drag | | KW (Breeze decoration, Meta+drag/right-drag) | none | plan Scope last row | C | |
| C44 | `_NET_WM_MOVERESIZE` / client-side drag of a floating window only | CSD apps start a drag | KW (xdg `move`/`resize` for every window) | K: a drag that pulls a tiled window out of its tile floats it | `kwin.js:1096-1110` | C | i3 ignores it for tiled windows, KWin does not. Same outcome as Meta+drag (C37). |
| C45 | Maximise (i3 has none) | n/a | K script undoes maximise at adoption; a later maximise drops the tile and the foreign-untile path re-tiles | KW maximise works freely on Plasma windows | `kwin.js:917,1032-1035` | C | |
| C46 | Minimise: `WM_CHANGE_STATE` iconic is refused (`handlers.c`) | No minimised windows | KW allows it | K keeps the leaf in the tree, drops the tile, restores in place; lost on reload | `visibleLeaf` `kwin.js:186`; plan policies "minimize" | C | Deliberate. Minimise exists here because Plasma's task manager offers it. |

**E. Fullscreen**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C47 | Fullscreen per output (`CF_OUTPUT`), one per workspace | Covers its output | K script (model flag; others cleared) | KW supports fullscreen on any number of windows | `setFullscreen` `tree.js:765-775` | C | KWin's second fullscreen window on the desktop is unflagged in the model only (code review noted). |
| C48 | Client's own fullscreen request (`_NET_WM_STATE_FULLSCREEN`, F11) toggles it | `con_toggle_fullscreen` | KW | K tracks `fullScreenChanged` and keeps the window in the tree, out of the tiles | `kwin.js:1027-1031`, `visibleLeaf` | C | |
| C49 | Focus is confined while fullscreen (`con_fullscreen_permits_focusing`) | Other windows on that workspace cannot be focused by keys | K script (keys, newcomers, workspace switch) | KW does not block the mouse; a window covered by the fullscreen one cannot be hovered anyway | `permitsFocusing` `tree.js:92`; plan Meta+F row; `gotoWorkspace` `kwin.js:1273` | C | |
| C50 | Fullscreen covers bars | Draws above i3bar | KW (active fullscreen is on the top layer, above panels) | none | `Window::isActiveFullScreen` `window.cpp:2280` | C | |
| C51 | Fullscreen window has no border/title bar | | KW (fullscreen drops decoration) | K and the effect skip fullscreen windows | `takeBorder` `kwin.js:852`; `hold.cpp:202,229` | C | |
| C52 | Leaving fullscreen returns the window to its place in the tree | | K script keeps it in the tree; KW returns it to its tile | both | `manageInto` `kwin.js:243-246`; spec-fullscreen-tree | C | |
| C53 | A window that opens already fullscreen with output-sized geometry is moved to that output (LibreOffice presentations) | | KW (xdg fullscreen output) | none | `xdgshellwindow.cpp:1378-1385` | D | |
| C54 | Workspace switch onto a workspace with a fullscreen window keeps the focus on it | | K script | KW would activate the last-used window there | `kwin.js:1273-1274` | C | |

**F. Workspaces: creation, removal, history**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C55 | Workspace created on first use | `workspace_get` / `create_workspace_on_output` | K script (appends KWin desktops up to the number asked, max 10) | KW stores them (`createDesktop`) | `Workspaces.ensure` `workspaces.js:16`; spec-desktops-on-demand | C | |
| C56 | Empty workspace that is not visible is removed (`workspace_show`, `con_on_remove_child`) | Disappears | none, by decision | KW keeps desktops | spec-desktops-on-demand section 3 "Never removed" (Paul, 2026-10-24); not in plan Scope | C | Consequence: `workspace next` ("those in use") and the widget compute "in use" themselves (`existingWorkspaces` `kwin.js:1310`). Plasma's pager still lists all. Documented. |
| C57 | More than ten workspaces / names | Unlimited, named | none | | `NAMES` `kwin.js:32`, `MAX` `workspaces.js:10` | C | Number-keys only reach ten. Deliberate (desktop N is workspace N). |
| C58 | `previous_workspace_name` bookkeeping (feeds back_and_forth) | Set in `workspace_show` | K script | none | `M.activate` `tree.js:213-220` | C | Updated on any focus change, not only key switches: same as i3. |
| C59 | Switching to a workspace focuses its last-focused window | `con_descend_focused` | K script | **KW activates the desktop's own last-used window on a desktop switch first** and K's model takes that in before applying its own | `gotoWorkspace` `kwin.js:1254-1275` comment; spec-fullscreen-tree "Deviations" last bullet | C | Two histories, KWin's wins when nothing is fullscreen. Documented as an open question for Paul. |
| C60 | Switching to a workspace visible on another output focuses that output | | K script | none | `Workspaces.showing` in `gotoWorkspace` | C | |
| C61 | `workspace N` for an empty hidden N opens on the current output | | K script | none | `gotoWorkspace` `kwin.js:1259-1266` | C | |
| C62 | Moving a window to a hidden workspace does not follow it and shows no workspace | | K script | KW moves desktops | `moveToWorkspace` `kwin.js:1279`; `tree.js:559` | C | |
| C63 | Every output always has a workspace (no output without) | Guaranteed by `init_ws_for_output` | KW (per-output desktops give every output a current desktop, `virtualdesktops.cpp:928-943`) | K `showHomes`/`unusedWorkspace` fix doubles | `kwin.js:1580,1977` | C | |
| C64 | `_NET_CURRENT_DESKTOP` request from a pager | `workspace_show` | KW (`setCurrent` for the active output) | K follows via `shownOutside` (focus moves with it) | `kwin.js:2005-2019` | C | Covers the Overview and Plasma's own switchers. |
| C65 | `_NET_WM_DESKTOP` message moves a window to a workspace | `con_move_to_workspace` | KW | K `desktopsChanged` follows as a move (`kwin.js:1036-1055`) | | C | |
| C66 | `_NET_ACTIVE_WINDOW` from a pager (source 2): always focus, show the workspace | | KW (`activateWindow` switches desktop) | K follows (C64) | `activation.cpp:285-318` | C | Same as i3. |
| C67 | `_NET_ACTIVE_WINDOW` from an application, `focus_on_window_activation smart` | Focus if its workspace is visible, else mark urgent (never switch workspace) | KW (xdg-activation/`mayActivate`; refused ones get `demandAttention`) | K ignores demands of attention | `activation.cpp:576-630`, `workspace.cpp:947-951` | C | **Difference**: an allowed activation switches the monitor to the window's workspace (see C4). A refused one only blinks in the task manager (no workspace urgent mark). Won't fix: finding 6 (Paul, 2026-10-25). |
| C68 | Urgency hint handling (`WM_HINTS`, `DEMANDS_ATTENTION`), urgent colours and the workspace flag | Window and workspace flagged | OOS (plan Scope: "urgency", Paul 2026-10-21) | KW sets `demandsAttention` and Plasma's task manager shows it | `window.cpp:684-696` | C | Plasma covers the window half; the workspace widget shows nothing. Decided away. |
| C69 | `force_display_urgency_hint` timer | Delays urgency reset | OOS | | with C68 | D | |
| C70 | EWMH desktop properties (`_NET_NUMBER_OF_DESKTOPS`, names, viewport) | Exported for pagers | KW (virtual desktops to Xwayland) | | | D | Per-output desktops mean KWin's export is global; kwin-i3's own widget reads KWin directly. |

**G. Monitors**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C71 | At start each output gets a workspace: first output 1, second 2 (`init_ws_for_output`, userguide "Multiple monitors") | Lowest free number, assigned ones skipped | K script (`numberScreens`, at login only) | KW gives a new output `activities`' last desktop or the first, and restores desktops at the activity event; K renumbers on that first event | `workspaces.js:77`; `kwin.js:1879-1887`; `virtualdesktops.cpp:940-952` | C | Sequential, not simultaneous: KWin first, kwin-i3 corrects. |
| C72 | Hotplug of a new output: it gets the first free workspace | `randr_query_outputs` -> `init_ws_for_output` | K script (`unusedWorkspace`, `screensChanged`) | KW assigns an initial desktop first | `kwin.js:1977,2020`; `virtualdesktops.cpp:128-133` | C | Brief window where two monitors may show the same desktop until kwin-i3 settles it. |
| C73 | Output removed: its workspaces move to the first output, empty unfocused ones are closed, floating coordinates fixed (`move_content`) | | K script (homes kept by name; `outputOf` falls back to the first screen; reconcile relocates) | KW evacuates the tiles of the gone output and moves windows (`workspace.cpp:1437-1485`); K ignores KWin's own window moves (decision 10) | `workspaces.js:38-45`; `kwin.js:722` `relocate` | C | Empty workspaces are not closed (C56). |
| C74 | Output returns | **Not moved back by i3** unless assigned (`workspace N output X`); the returning output gets a new workspace. Source: `randr.c:455-536`, `move_content` `randr.c:864-930` | K script moves workspaces back and re-shows what the monitor showed | KW's PlacementTracker restores window geometry | `screensChanged` `kwin.js:2020-2047` | C | **plan.md decision 10 says "as in i3"; i3 4.24 does not do this** (only the moved-meanwhile fallback is i3's). Deliberate improvement; the plan's wording is wrong. |
| C75 | Pointer crossing to another output's empty workspace (or a click on empty root) focuses that output (`check_crossing_screen_boundary`, `click.c` root click) | Focus moves to the empty workspace | none | KW: FFM never focuses the desktop window (`window.cpp:2848` returns for desktop), and the active output follows the pointer | `tests/live/72-pointer-stays.sh` case 1 ("b keeps the focus (nothing under the pointer)"); `applyFocus` `kwin.js:1126` | C | **Gap/difference**, tested deliberately. Keys then act on the old monitor's workspace (`focusedCon`), while a window started now opens on the pointer's monitor (KWin's active output, C2). Unverified live as a bad experience. |
| C76 | Pointer enters/clicks a window on another output: focus and workspace follow | | KW (FFM / click) | K (`windowActivated` -> model; `shownOutside`) | `kwin.js:1856-1860` | C | |
| C77 | Mouse warping on focus change across outputs (`mouse_warping output`) | Pointer to the centre of the new focus; only from commands | K script (keys only, `MoveMouseToCenter`/`ToFocus`) | none | `kwin.js:1159-1161,1183` | C | A closing window never warps (2026-10-25 fix). |
| C78 | After an output change, focus the primary output's workspace | `randr_query_outputs` end | K script keeps the model's focus | | `wantFocus()` in `screensChanged` | C | Different, harmless. |
| C79 | Output mode/position change re-renders | | KW | K `screensChanged` -> `armRefit`, `scheduleAll` | `kwin.js:2044-2046` | C | |
| C80 | Cloned/mirrored outputs: i3 disables the clone and uses the lowest common mode | | KW (replicated outputs are not managed, `workspace.cpp:1365-1371`) | none | | D | `docs/multi-monitor` itself is historical (nVidia/Xinerama), no row needed. |
| C81 | `workspace N output X` applied when the output appears | Assigned workspaces move to it | K script (`claimAssigned`) | none | `workspaces.js:55`; `kwin.js:2024` | C | |

**H. Focus and mouse**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C82 | Focus follows mouse (default yes): entering a window focuses it (descends to its focused child) | `handle_enter_notify` | KW (`FocusPolicy=FocusFollowsMouse` set by DF) | K takes each activation into the model, "last focus event wins" | live kwinrc `[Windows]`; `kwin.js:1856` | C | **A stranger gets KWin's default, click-to-focus.** Not set by kwin-i3 (OPEN 4e README-only). |
| C83 | Click focuses; click on the other workspace focuses it | | KW | K | | C | |
| C84 | Ignored enter events caused by the WM's own re-layout (`add_ignore_event`) | Avoids focus jumping when windows move under a still pointer | KW (`NextFocusPrefersMouse`, "moved" checks in `pointerEnterEvent`) | K: the plugin popup grace; test client note about a pointer that does not move | `window.cpp:2838-2860`; `spec-popup-grace.md` | D | i3's explicit sequence-number scheme has no counterpart; KWin only focuses on real pointer motion. |
| C85 | Scroll over titles of tabbed/stacked containers | Cycles tabs | n/a (OOS: no tabbed/stacked) | | plan Scope | C | |
| C86 | Client takes the keyboard focus on its own (`handle_focus_in`), i3 re-asserts its focus | | KW (focus-stealing prevention; `restoreFocus`, `activation.cpp` `restoreFocus`) | none | | D | |
| C87 | Panel popups vs focus-follows-mouse | not an i3 concern (i3bar has no popups) | K helper plugin (popup grace 1.5 s) | KW's `DelayFocusInterval` is set to 0 by DF | `spec-popup-grace.md` | C | Plasma adaptation. |

**I. ICCCM/EWMH hints and client properties**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C88 | `WM_NORMAL_HINTS` min/max/aspect/increments for floating windows | `floating_check_size` | KW (X11: constrainClientSize; Wayland: min/max from the client) | none | | D | |
| C89 | `_MOTIF_WM_HINTS` (client wants no decorations) sets the border style | | KW (noBorder / CSD) | K only takes a border that exists (`serverDecorated`) | `takeBorder` `kwin.js:851-868` | C | |
| C90 | `_NET_FRAME_EXTENTS` / `_NET_REQUEST_FRAME_EXTENTS` | Estimate for Java | KW (Xwayland) | | | D | n/a for Wayland clients. |
| C91 | Window title updates | `remanage_window` re-runs assignments; title event | KW (caption) | K `captionChanged` -> `reclassify` (rules that match the title) | `kwin.js:1020` | C | Same idea as i3. Tiled windows show no title with the plugin; i3's "pixel 1" does not either. |
| C92 | Class/role change | Re-runs assignments | K script (`windowClassChanged` -> reclassify) | | `kwin.js:1022` | C | |
| C93 | `WM_TAKE_FOCUS`, `input=False` hint | i3 sets focus accordingly | KW (`wantsInput`) | | | D | |
| C94 | Windows on invisible workspaces are unmapped | Not drawn | KW (hidden by desktop) | K works around that hidden windows get no frame callbacks | plan "known limit"; `unmanageFrom` comments | C | The cost of KWin's model: hidden windows stay alive but do not acknowledge resizes. |

**J. Borders, title bars, gaps, colours**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C95 | Border style of new tiled windows (default `normal` title bar; Paul's config `pixel 1`) | Drawn by i3 around the window | K plugin kwini3hold (1..10 px frame outside the window) | KW's Breeze title bars when the plugin is absent | `hold.cpp`; README plugin table | C | Without the plugin the i3 look is gone (tiles keep title bars). Plugins are rebuilt after every Plasma update (README). |
| C96 | Border style of floating windows | `default_floating_border normal` | KW (the user's decoration) | K option `frameOnFloating` | README config | C | |
| C97 | Focus colours (`client.focused`, `focused_inactive`, `unfocused`, `urgent`) | Four states | K plugin (two: active vs inactive; plus floating pair) | | `hold.cpp:752`; `settings.js` `frameActive`/`frameInactive` | C | **Partial**: the other monitor's focused window shows as plain inactive, not `focused_inactive`; urgent has no colour. |
| C98 | Gaps inner/outer geometry (`gaps_should_inset_con`: inner/2 per side between windows, inner + outer at the screen edge) | `render.c:54-73`, `gaps.c` | K script (tile padding = inner, root inset) | KW tile padding does the per-side halving | `gaps()` `kwin.js:303`; `rootRect` `kwin.js:310` | C | Same arithmetic. Defaults differ (i3: 0, kwin-i3: 4/2). `smart_gaps` has no equivalent. |
| C99 | Fullscreen window: no gaps, no border | | KW + K | | C51 | C | |
| C100 | `smart_borders`, `hide_edge_borders` behaviour (borders hidden with one window or at edges) | | none | | not offered | D | Frame always drawn; minor. |
| C101 | Window decoration rendering (fonts, title text, `title_align`) | i3's own drawing | KW (Breeze) | | | D | |

**K. Startup, restart, session**

| # | i3 item | What i3 does | Owner | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| C102 | In-place restart keeps the layout (restart state JSON) | | K script (reload rebuilds the tree from KWin's tiles, floating set from the effect) | KW keeps the tiles | plan decision 5; `adoptTiled` `kwin.js:1753` | C | Minimised windows and an out-of-tile fullscreen window come back at the end of their row. |
| C103 | Session restore after logout | none in i3 (`exec`) | KW/P (session restore of apps) | K adopts what appears | | D | Not an i3 behaviour. |
| C104 | HiDPI | Xft.dpi | KW (output scale; tiles in logical px) | | | D | |
| C105 | Presentations / mirrored outputs (userguide) | xrandr | KW | | | D | |
| C106 | Show Desktop, Overview, Alt-Tab (no i3 counterpart) | | KW | K tolerates: asks KWin whether Show Desktop is on before re-focusing | `applyFocus` `kwin.js:1137-1145`; `shownOutside` | C | Plasma additions kwin-i3 accommodates. |

## Map D: i3's surrounding pieces (IPC, bar, tools) and the reverse direction (KWin/Plasma acting on kwin-i3's windows)

Sources read: the brief; i3 4.24 `docs/ipc`, `docs/i3bar-protocol`, `docs/i3bar-workspace-protocol`, `docs/layout-saving`, `man/` (i3-msg, i3-input, i3bar, ...), `parser-specs/config.spec` (the `bar` states); kwin-i3 `README.md`, `docs/plan.md` ("Scope", policies), `docs/spec-taken-keys.md`, `docs/spec-stock-mode.md`, `docs/debugging.md`, `docs/i3-feature-map.md` (cross-check only), `src/kwin.js` (adopt, connectWindow handlers, reconcile, dump, report), `src/rules.js`, `widget/contents/ui/main.qml` + `workspaces.js`, `tools/capture`, `plugin/*.h` (D-Bus slots); live read-only: `~/.config/kwinrc`, `~/.config/kglobalshortcutsrc` (stock defaults = its third field; I diffed every non-kwin-i3 entry's current and default keys against kwin-i3's 53 current keys), `~/.config/plasma-org.kde.plasma.desktop-appletsrc` (applet list only), `busctl --user introspect` of `/KWin`, `/VirtualDesktopManager`, `/Scripting`, `/kwini3hold`, `/kwini3helper`, `/component/kwin`; KWin v6.7.5 source (`window.cpp`, `kwin.kcfg`, `tilemanager.cpp`, `xdgshellwindow.cpp`, `placement.cpp`, `activation.cpp`) fetched with curl and grepped. NOT checked: i3status's own man page (it is a separate repo, not in the tarball; module list is from memory, tagged D); Plasma applets' behaviour (panel visibility modes, system tray, task manager clicks: Plasma source not read, tagged D); the stock default of the Overview hot corner (the kcfg URL 404'd); nothing was run or invoked, so "kwin-i3 reacts by ..." rows are from reading `src/kwin.js`, not from watching it, unless a test is named. No `~/.config/kwinrulesrc` exists (no KWin window rules live). Notable live finding: `kglobalshortcutsrc` still has ~150 inert `HyprKwin ...` actions (all unbound, left by another tiling script; `kwinrc [Plugins]` does not enable it).

Owner key: K kwin-i3 (script / kwini3hold / kwini3helper / widget / settings page), KW stock KWin, P Plasma other than KWin, DF dotfiles only, none = hole, OOS = out of scope (`docs/plan.md` "Scope"), n/a = X11/i3-internal concept.

### Part 1: i3's surrounding pieces

**IPC: transport and `i3-msg`**

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D1 | IPC socket (`I3SOCK`, `ipc-socket`, `I3_SOCKET_PATH`, magic string + length + type framing) | One UNIX socket every tool talks to | OOS | KW: the session D-Bus is the surface | plan "Scope": "i3's config file and `i3-msg` IPC ... KWin's D-Bus is the scripting surface". kwin-i3 owns no bus name except per-plugin objects `/kwini3hold`, `/kwini3helper` | C | Deliberate. Consequence: nothing external can ask kwin-i3 for state except through Dump State (D12) |
| D2 | `i3-msg [message]` / `-t command` | Send a command string to the running i3 | K (partly) | KW (`kglobalaccel`) | Every kwin-i3 verb is a KWin global shortcut `kwin-i3 <Verb>`; run it with `busctl --user call org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component invokeShortcut s "kwin-i3 Focus Left"` (used by `widget/contents/ui/main.qml:78` and `tools/capture`; the method is on `/component/kwin`, introspected) | C | Closest thing to `i3-msg`: a fixed verb list, no arguments (no `move left 20 px`, no `workspace 12`), no criteria, no reply. Fine for "i3's feel"; a hole only for scripting |
| D3 | `i3-msg -t get_*` (`-t`, `-r`, `-q`) | Query and pretty-print JSON | none | P: `busctl`/`qdbus6` on KWin's objects | see D8-D19 for what each query could use | C | no kwin-i3 CLI; OOS by D1 |
| D4 | `i3-msg -m` / `-t subscribe -m` | Stay connected and print events | none | `busctl --user monitor` / `dbus-monitor` on the signals in D22-D26 | | D | Only KWin desktop signals exist (D22); no window signals |
| D5 | `-s <socket>` / `$I3SOCK` | Pick a socket | n/a | | one session bus | D | |

**IPC: message types**

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D6 | `RUN_COMMAND` (0): the command grammar over the wire, incl. `;`/`,` chaining and criteria | Run any command string | OOS | K: D2 for single verbs | plan "Scope"; no parser in `src/` | C | |
| D7 | `RUN_COMMAND` reply `[{"success":bool,"error":...}]` | Say which command failed | none | | `invokeShortcut` returns nothing; errors go to the log ring (`src/log.js`) and Dump State | C | Not a gap for feel |
| D8 | `GET_WORKSPACES` (1): num, name, visible, focused, urgent, rect, output | List workspaces with the visible/focused one per output | K (widget, internal) + KW | P: `org.kde.taskmanager` `VirtualDesktopInfo` (in-process QML) | `widget/contents/ui/main.qml:35-70` builds the list from the task manager model (`currentDesktopByScreenName`); over D-Bus only `/VirtualDesktopManager` `desktops a(iss)`, `current s`, `count`, `rows` exist (introspected). Per-output current desktop is not on D-Bus | C | An external tool (polybar, a script) cannot get "which workspace each monitor shows" without Dump State. Gap for third-party bars; the widget covers kwin-i3's own |
| D9 | `GET_WORKSPACES` field `urgent` | Mark a workspace whose window is urgent | OOS | P: task manager flashes demand-attention windows | plan "Scope": urgency out (Paul 2026-10-21); the widget has no urgent state (no `urgent`/`attention` in `main.qml`) | C | |
| D10 | `SUBSCRIBE` (2) | Register for event types | none | KW: D-Bus signals (D22-D28) | no subscription service in kwin-i3 | C | |
| D11 | `GET_OUTPUTS` (3): name, active, primary, rect, current_workspace | List monitors | P | K: Dump State "outputs" part (`kwin.js:1642-1650`) | `kscreen-doctor -o` / `-j` (the README tells users to use it for connector names); KWin scripting `workspace.screens` internal | C | Standard Plasma tool; no kwin-i3 role needed. `current_workspace` per output is only in Dump State |
| D12 | `GET_TREE` (4): the whole container tree with rect, window_rect, focus order, layout, percent | Dump the i3 tree | K (diagnostic only) | KW: `getWindowInfo`/`queryWindowInfo` for one window | Dump State (`dump()`, `src/kwin.js:1632-1713`): `TREE` lines, per-window flags, one `JSON` line (`tests/fuzz` reads it). Delivered by D-Bus call to `net.local.kwini3.dump`, so it works only while a listener (`tools/capture`, `logsink.py`) owns that name | C | Not a query API; nothing external can pull the tree on demand without starting a sink. Real gap only if a bar/tool needs it |
| D13 | `GET_MARKS` (5) | List marks | OOS | | marks out (plan "Scope") | C | |
| D14 | `GET_BAR_CONFIG` (6) | Hand a bar its config | n/a | P: panel config lives in `plasma-org.kde.plasma.desktop-appletsrc` / plasmashell scripting | the bar is Plasma's panel | C | |
| D15 | `GET_VERSION` (7) | Version, human string, loaded config path | P | K: version in `package/metadata.json` (`1.0.0`) only | `rpm -q kwin`; `/KWin supportInformation` (text); no runtime query of kwin-i3's version | C | |
| D16 | `GET_BINDING_MODES` (8) and `GET_BINDING_STATE` (12) | Names of modes / the active one | n/a | | no modes: plan "Behaviour": a script cannot register mode-only keys | C | |
| D17 | `GET_CONFIG` (9) | Return the loaded config text | K (settings) | KW: `kreadconfig6` | config is `kwinrc [Script-kwin-i3]` plus `[Tiling]`; settings page; `Meta+Shift+C` reloads | C | |
| D18 | `SEND_TICK` (10) / `tick` event | Synchronise external scripts | n/a | | no equivalent needed | D | |
| D19 | `SYNC` (11) | X11 client-message round trip used by i3's testsuite | n/a | K: tests wait on D-Bus + log lines | X11 concept (xcb window id); kwin-i3's tests use `tools/inject.py` + polling | D | |

**IPC: events**

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D22 | event `workspace`: `focus`, `init`, `rename` | A workspace was shown / created / renamed | KW | K reacts internally (`currentDesktopChanged` -> `shownOutside`, `kwin.js:1861`) | D-Bus signals `currentChanged s`, `desktopCreated`, `desktopDataChanged s(iss)`, `countChanged` on `/VirtualDesktopManager` (introspected) | C | `current` is KWin's global current desktop; with per-output desktops it does not say which monitor changed. A bar needing per-monitor focus cannot get it from D-Bus |
| D23 | event `workspace`: `empty`, `urgent`, `move`, `restack`, `reload` | Workspace emptied / urgent / moved to output | none | | KWin desktops are never removed by kwin-i3 (`docs/spec-desktops-on-demand.md`), so "empty" has no analog; no signal for a workspace moving to another monitor (kwin-i3 keeps `Workspaces.homes()` internally) | C | Fine for feel |
| D24 | event `window`: `new`, `close`, `focus`, `title`, `fullscreen_mode`, `move`, `floating`, `urgent`, `mark` | Window lifecycle | none (externally) | KW: scripting signals inside kwin-i3 (`windowAdded`, `windowActivated`, ...); P: `org_kde_plasma_window_management` Wayland protocol for taskbars | no window signals on KWin's D-Bus (introspected `/KWin`: only `reloadConfig`, `showingDesktopChanged`) | C/D | Third-party bars must use the Wayland protocol; not kwin-i3's job |
| D25 | event `output` | RandR change | K (internal) | P: kscreen | `workspace.screensChanged` -> `screensChanged` (`kwin.js:1866`) | C | |
| D26 | event `mode` / `binding` | Mode change; a binding fired | n/a / none | KW: `org.kde.kglobalaccel.Component` signal `globalShortcutPressed ssx` | introspected `/component/kwin`: signals `globalShortcutPressed/Released/Repeated` | C | `binding` has a real analog: any process can watch which `kwin-i3 ...` shortcut fired. Not used by anything |
| D27 | event `barconfig_update`, `shutdown`, `tick` | Bar config changed / i3 restarting / tick | n/a | | no bar protocol; script reload is `unloadScript` + `reconfigure` with no notification | D | |

**`bar { }` directives** (`parser-specs/config.spec`, state `BAR`): the bar is Plasma's panel; kwin-i3's contribution is the workspace widget.

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D30 | `bar { ... }` blocks, `id` | One or more bars, each with an id | P | | any number of Plasma panels, one per monitor possible | D | |
| D31 | `position top\|bottom` | Edge of the bar | P | | panel edge (live appletsrc `location=0/4`) and widget `Plasmoid.location` handling in `main.qml:105` | C | Plasma also allows left/right |
| D32 | `mode dock\|hide\|invisible` | Always shown / auto-hide / hidden until modifier | P | | panel visibility: Always Visible, Auto-Hide, Windows Can Cover, Windows Go Below [D: Plasma applet behaviour not read] | D | |
| D33 | `hidden_state hide\|show` | State when mode=hide | P | | auto-hide reveals at the screen edge | D | |
| D34 | `modifier <mod>\|off` | Hold a key to show a hidden bar | none | P: `cycle-panels` Meta+Alt+P (live default, plasmashell) | a key that focuses panels, not one that reveals an auto-hidden one | C | Minor gap for a user who hides the panel |
| D35 | `status_command <cmd>` | Pipe i3status/other JSON into the bar | P | | Plasma applets (clock, battery, volume, network, System Monitor); no arbitrary command-line output widget in stock Plasma | D | Hole only if someone relied on custom status text |
| D36 | `workspace_command <cmd>` | Custom program supplies workspace buttons (4.23) | K (built in) | | the widget is the workspace source; no pluggable command (D56) | C | |
| D37 | `i3bar_command`, `socket_path`, `verbose` | Which bar binary / socket / debug | n/a | | | D | |
| D38 | `wheel_up_cmd`, `wheel_down_cmd` | Scroll over the bar: default prev/next workspace | K (widget) | | `WheelHandler` in `main.qml:121-131`: one workspace per notch among those in use; not configurable | C | |
| D39 | `bindsym [--release] button<n> <cmd>` | Mouse buttons on the bar | K (widget, left only) | P | only `MouseArea.onClicked` -> `show(num)` (`main.qml:182-187`); no middle/right binding | C | i3bar's default is left=switch only too, so no loss |
| D40 | `output <name>\|primary\|nonprimary` | Show this bar on some outputs only | P | K: gap | a panel sits on one monitor; but the widget shows **every** workspace of every monitor on each panel (`TasksModel` with `filterByScreen: false`, `main.qml`), unlike i3bar which lists only its output's workspaces | C | Differs from i3bar by design (`docs/spec-workspace-widget.md`); not a conflict |
| D41 | `tray_output none\|primary\|<output>` | Which monitor holds the tray | P | | the system tray applet is in whichever panel carries it (live appletsrc: `org.kde.plasma.systemtray`) | C | |
| D42 | `tray_padding <px>` | Space between tray icons | P | | tray/panel icon size settings | D | |
| D43 | `font <font>` | Bar font | P | | Plasma fonts / theme | D | |
| D44 | `separator_symbol <str>` | Glyph between status blocks | n/a | | Plasma panel separators/spacers | D | |
| D45 | `binding_mode_indicator yes\|no` | Show the active mode | n/a | | no modes (D16) | D | |
| D46 | `workspace_buttons yes\|no` | Show workspace buttons | K | P: the stock Pager | add or remove the widget; the stock Pager does the same job: harmless duplicate, replaced by hand (README "Optional: the workspace widget") | C | |
| D47 | `workspace_min_width <px>` | Minimum button width | none | | button size follows the panel and the monitor's aspect (`main.qml`) | C | cosmetic |
| D48 | `strip_workspace_numbers yes\|no` | Show only the name after "N:" | K (partly) | | widget label is "N" or "N name" (`workspaces.js` `label`, `named`); `numbersOnly` (`config/main.xml`) is the opposite switch; no "name only" | C | cosmetic |
| D49 | `strip_workspace_name yes\|no` | Show only the number | K | | `numbersOnly` | C | |
| D50 | `height <px>`, `padding <...>` | Bar height / padding | P | | panel thickness / floating margin | D | |
| D51 | `colors { background statusline separator focused_background focused_statusline focused_separator }` | Bar and status colours | P | | Plasma colour scheme / panel background | D | |
| D52 | `colors { focused_workspace active_workspace inactive_workspace }` | Button colours: focused / shown on an unfocused output / other | K (widget) | | focused = highlight at 0.55 alpha, shown = 0.25, inactive = 0.08 (`main.qml:150-154`), from the Plasma theme; not configurable | C | Same three-state idea as i3bar |
| D53 | `colors { urgent_workspace binding_mode }` | Urgent / mode colours | OOS / n/a | | urgency out; no modes | C | |

**i3bar protocols and i3status**

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D55 | status line protocol: header `version`, `stop_signal`, `cont_signal`, `click_events`; JSON block array | A program streams the status line | none | P: native applets | no stdin-JSON status bar in Plasma; third-party "Command Output" widget could approximate | D | |
| D56 | block fields: `full_text short_text color background border* min_width align urgent name instance separator separator_block_width markup` | Style one status block | none | | | D | |
| D57 | click events (`name instance button x y relative_x ... modifiers`) | Status clients get clicks | P | | each applet handles its own clicks | D | |
| D58 | `i3bar-workspace-protocol` (4.23): an external command prints workspace objects | Replace/hide/rename/sort workspace buttons | none | K: widget logic is fixed ("in use" = has windows or is shown) | `widget/contents/ui/workspaces.js` | C | e.g. "hide workspace foo unless focused", "show empty workspaces foo,bar on LVDS1", reverse sort: not possible. Low priority |
| D59 | i3status `time` / `tztime` | Clock | P | | Digital Clock applet | D | |
| D60 | i3status `battery` | Battery | P | | `org.kde.plasma.battery` (live appletsrc) | C | |
| D61 | i3status `volume` | Volume | P | | `org.kde.plasma.volume` (live appletsrc) | C | |
| D62 | i3status `wireless`, `ethernet`, `ipv6` | Network state | P | | `org.kde.plasma.networkmanagement` (live appletsrc); no IPv6-address module | C | |
| D63 | i3status `cpu_usage`, `load`, `memory`, `disk`, `cpu_temperature`, `sysdata` | System load | P | | System Monitor sensor applets / Plasma System Monitor (`org.kde.plasma.systemmonitor` in services) | D | |
| D64 | i3status `run_watch`, `path_exists`, `read_file`, `ddate` | Misc | none | | | D | not basic window management |

**Companion tools**

| # | i3 item (exact form) | What i3 does (one line) | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| D70 | `i3-nagbar` (config errors, "Exit i3?" prompt) | A bar at the top with a message and buttons | P | K: one-way notification | `org.freedesktop.Notifications.Notify` from `kwin.js:1469` (load report: taken keys, layout keys, per-output). It passes `[]` for actions, so no buttons | C | Plasma notifications cover the message; confirm-before-exit is Plasma's logout screen and `org.kde.Shutdown` |
| D71 | `i3-input -F ... -P ...` | Prompt for a string and run it as an i3 command | none | P: KRunner, `/WindowsRunner` (KWin object, introspected) | KRunner cannot run kwin-i3 verbs; only window search | D | follows from marks and command IPC being OOS |
| D72 | `i3-dmenu-desktop` / dmenu on `$mod+d` | Launch an application | P | DF | KRunner (live: `[services][org.kde.krunner.desktop] _launch=Meta+D`, a dotfiles choice); stock: Alt+Space / Alt+F2, Meta tap = launcher (`activate application launcher=Meta, Alt+F1`) | C | The old map said fuzzel for Meta+D; the live file now says KRunner. A stranger gets Alt+Space |
| D73 | `i3-config-wizard` | First-run key/modifier chooser | none | K: settings page + Keys list | no first-run flow; `kcm/` page and the load notification | C | Not needed: keys default to i3's |
| D74 | `i3-sensible-terminal`, `$mod+Return` | Open a terminal | DF | P: Konsole | live `[services][Alacritty.desktop] _launch=Meta+Return` (DF); `org.kde.konsole.desktop _launch=none` | C | A stranger has no Meta+Return. Plan "Scope" leaves launchers to Plasma; still the first key an i3 user presses |
| D75 | `i3-sensible-editor`, `i3-sensible-pager`, `i3-migrate-config-to-v4` | Pick $EDITOR/$PAGER; convert old config | n/a | | | D | |
| D76 | `i3-save-tree` + `append_layout` + placeholder "swallows" | Save a workspace layout to JSON; recreate it with placeholders that adopt matching windows | none | KW: stores the tile tree; K: adopts it | KWin persists tile shape in `kwinrc [Tiling]` (live file has many roots); `adoptTiled`/`specOf` (`kwin.js:1719-1760`) rebuild the model from live tiles at a reload, windows included, but no way to save/restore a layout and no swallowing of future windows | C | Not asked for; nobody else (Plasma) does it. Hole for people who script their workspaces |
| D77 | `i3-dump-log` / shmlog / `debuglog on\|off`, `shmlog <size>` | Ring log in shared memory, dumped on demand | K | | flight recorder: last 2000 lines in memory, Dump State (Meta+Shift+B via DF launcher, `tools/capture`), `kwini3hold` last 500 events, `tools/capture-read`, `debugLog` setting for a live sink (`docs/debugging.md`) | C | Better than i3's; `kwin_wayland`'s own log is the journal |
| D78 | `i3 -C`, `-V`, `-d`, `--moreversion` | Config check / verbose / debug | n/a | K: settings page validates | | D | |

### Part 2: the reverse direction (KWin and Plasma acting on windows kwin-i3 manages)

"Owner" is who acts on the window (KW / P); "Also done by" is what kwin-i3 does about it. `Conflict?` is in the Note. Stock default keys are the third field of `kglobalshortcutsrc` entries on this install (Paul's current keys are mostly `none` because dotfiles unbinds them).

**Key collisions (stock Plasma shortcut on a kwin-i3 key)**

| # | i3 item (exact form) | What it does to a tiled window | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| R1 | Quick Tile Left/Right/Top/Bottom on **Meta+Left/Right/Up/Down** (stock) | Puts the window in KWin's quick-tile slot (left/right half, top = maximize, bottom) | KW | K: same four keys are Focus; a press runs the first holder | live default column: `Window Quick Tile Left=none,Meta+Left` etc.; kwin-i3 `Focus Left=Meta+Left`. Quick tiles live in a separate `QuickRootTile` per desktop (`tilemanager.cpp:69,128-138`), not kwin-i3's custom root. Load check names the keys (`kwin.js:1510-1540`, `docs/spec-taken-keys.md`); `make take-keys` frees them; Keys list takes them on Apply | C | Real conflict on a stock install until take-keys runs: Meta+Left tiles instead of focusing. Handled by report + opt-in fix, and only seen at load |
| R2 | Switch One Desktop Left/Right/Up/Down on **Meta+Ctrl+arrows** (stock) | Switch the current desktop of the active output | KW | K: Grow/Shrink Width/Height | live default col; same mechanism as R1 | C | Conflict until take-keys; if KWin wins, kwin-i3 sees an "outside" desktop switch (`SHOWN ... (outside)`) and follows, so nothing breaks but the resize key does nothing |
| R3 | Window to Next/Previous Screen on **Meta+Shift+Right/Left** (stock) | Moves the window to the other monitor | KW | K: Move Right/Left (tree_move) | live default col | C | Conflict until take-keys. If KWin wins the window moves outside the tree's logic; `desktopsChanged` follows it as a workspace move, so it ends consistent but not as i3's move |
| R4 | plasmashell "Activate Task Manager Entry 1..9" on **Meta+1..9** (stock) | Activate/launch the N-th task-manager entry (raises that window, may switch desktop) | P | K: Workspace N | live default col; plasmashell is an active component so its action wins (`spec-taken-keys.md`, "inactive holder doesn't block") | C | Nine of the 22 clashing keys. Conflict until take-keys |
| R5 | KWin "Zoom to Actual Size" on **Meta+0** (stock) | Zoom effect | KW | K: Workspace 10 | live default col `view_actual_size=none,Meta+0` | C | Conflict until take-keys. README also lists Meta+plus/minus (zoom) as colliding, but kwin-i3 has no such keys, so only Meta+0 collides (README line 76 overstates) |
| R6 | Klipper "Show Clipboard Items at Mouse Position" on **Meta+V** (stock) | Pops the clipboard menu | P | K: Split V | live default col `show-on-mouse-pos=none,Meta+V` | C | Conflict until take-keys |
| R7 | Lock Session on **Meta+L** (stock), Dolphin on **Meta+E** (Fedora KDE default, per `spec-taken-keys.md`; not in this file since DF moved Dolphin to Meta+T) | Lock the screen / open a file manager | P | K: Focus Up (L), Toggle Split | live default col `Lock Session=none,Screensaver\tMeta+L`; the spec for Meta+E | C (L) / D (E) | Conflict until take-keys, and the lock-key loss is a real cost (the old map's hole 6). In stock-mode tests Meta+L locked the test KWin (`spec-stock-mode.md`) |
| R8 | Walk Through Windows on **Alt+Tab / Meta+Tab**, `Alt+` ` for same app (stock) | Switch to the next window in KWin's focus chain, switching desktop if the window is elsewhere (`ActivationDesktopPolicy=SwitchToOtherDesktop`, `kwin.kcfg`) | KW | K: reacts | `windowActivated` (`kwin.js:1856`: `ACTIVE ... (KWin)` -> `model.focusWin`) and `currentDesktopChanged` -> `shownOutside` | C (code) | Harmless: i3 has no Alt+Tab, but the tree's focus follows whatever KWin activates. Order is KWin's chain, not the tree's. Not a key clash |
| R9 | Meta+Alt+arrows "Switch Window Left/Right/Up/Down" (stock) | KWin's geometric directional focus | KW | K: Meta+arrows (tree-based focus) | live default col | C | A second, geometric focus-direction owner on different keys: harmless duplicate; both end in `windowActivated`. Note the plan chose tree-based because geometric differs from i3 |
| R10 | Meta tap = Application Launcher; `Meta+Q` activity switcher; `Meta+W` Overview; `Meta+G` Grid; `Meta+D` Peek at Desktop; `Meta+T` Edit Tiles; `Meta+Alt+P` cycle panels (stock) | Plasma's other Meta shortcuts | KW / P | K: none on these keys | live default col; `kwinrc [ModifierOnlyShortcuts] Meta=` (DF) kills the tap | C | No kwin-i3 key on any of them, so no key clash; DF re-uses Meta+D and Meta+T for launchers (R38, R14) |

**Tiling features of KWin on the same tile tree**

| # | i3 item (exact form) | What it does to a tiled window | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| R11 | Edge-drop quick tile: drag a window to a screen edge/corner (`ElectricBorderTiling=true`, `ElectricBorderMaximize=true`, `kwin.kcfg`) | On drop: left/right half, quarter corners, or maximize at the top edge | KW | K: partly | `window.cpp:1100-1104` (`setQuickTileMode` on drop). The window lands in a `QuickRootTile` tile (non-null `w.tile`), so kwin-i3's `tileChanged` handler (`kwin.js:1096-1110`) does not take its "dragged out -> float" branch (`!tile`); it only `schedule`s a reconcile that puts the window back in its tile. Plan policies row says "KWin quick-tile: the window floats where it was dropped": that text does not match this path | D (reading code, no test: no live scenario drags to an edge) | Probable real conflict: a stock gesture the user will try. Likely outcome: the drop is silently undone (window pops back), with the quick-tile outline flashing; for a drop at the top edge, maximize then retile (R15). Needs a live test before calling it |
| R12 | Shift while dragging: custom-tile drop (`window.cpp:1108-1109`, `1245-1254`) | Shows an outline over **the tile under the pointer in the desktop's custom root** and on drop sets `QuickTileFlag::Custom`: puts the window in that tile | KW | K: none specific | `quickTileGeometry(Custom)` uses `workspace()->rootTile(output)->pick(pos)`, i.e. kwin-i3's own tiles | D | Conflict: a window dropped into an occupied leaf makes a tile with two windows, which kwin-i3's invariant check flags (`tile holds N windows`, `kwin.js:746`) and the next reconcile repairs; nothing blocks the gesture. Shift is not a modifier kwin-i3 uses (Meta+Shift+drag was retired, plan "Scope") but a user holding Meta+Shift for old habit would trigger it |
| R13 | Window Custom Quick Tile Left/Right/Top/Bottom (no default key) | Moves the window to the neighbouring custom tile | KW | K: same reconcile pull-back as R11/R12 | `Window Custom Quick Tile *=none,none` in live file | D | Unbound by default; same fate as R12 if a user binds it |
| R14 | Meta+T "Toggle Tiles Editor" (stock; live: `Edit Tiles=none,Meta+T`, DF gave Meta+T to Dolphin) | A full-screen editor that splits/removes/resizes the custom tiles of the active output and desktop, and writes them to `kwinrc [Tiling]` | KW | K: nothing | `kwin.js` has no listener for tile-layout edits (no `layoutModified`/`tilesChanged` in `src/`); `reconcileNow` rebuilds the root when its shape differs from the model (`kwin.js:600-615`) | D | Real conflict on a stock install: Meta+T edits the very tree kwin-i3 owns. The edit is overwritten at the next reconcile (any window event) or leaves windows in odd tiles until then; the user sees their layout "undo itself". Not mentioned in README or the load report (the taken-key check only covers kwin-i3's own keys). Suggest: say so in README, or take the key |
| R15 | Maximize: Window Maximize (stock Meta+PgUp), Maximize Horizontal/Vertical, Restore (Meta+Backspace), title-bar double-click (`TitlebarDoubleClickCommand=Maximize`), maximize button, `DoubleClickBorderToMaximize=true` | Removes the window from its tile and fills the work area | KW | K: handled | `kwin.js:917` `setMaximize(false,false)` at adopt; at run time the tile loss runs the foreign-untile path and re-tiles (comment `kwin.js:1031-1035`; plan policies "maximize: undone, and the window re-tiled"; `docs/spike-kwin-tiles.md` finding 4) | C | Handled by design; the user sees a flash. Without the plugin tiled windows keep title bars, so double-click is easy to hit. Floating (Plasma-mode) windows can be maximized freely |
| R16 | Minimize: Window Minimize (stock Meta+PgDown), title-bar/menu, task-manager click on the active task, "minimize all" | Hides the window | KW / P | K: handled | `minimizedChanged` -> reconcile (`kwin.js:1023`); leaf kept, tile removed, back in place on restore; **not across a script reload** (plan policies) | C | Handled; i3 has no minimize (scratchpad is OOS), so this is a Plasma thing kwin-i3 absorbs |
| R17 | Shade (roll up) | Rolls the window up to its title bar | n/a | | no `shade` in KWin 6.7.5 `window.cpp` (grep) | C | Gone from KWin; nothing to handle |
| R18 | Keep Above (Window Above Other Windows: no default key; title-bar button; window menu; task manager) | Raises the window's layer | KW | K: owns the flag on floating windows | kwin-i3 sets `keepAbove` on every floating window and treats it as its mark (`setFloatingLook`/`lookFloating`, `kwin.js:816-833`); re-asserted every pass (`if (!w.keepAbove) w.keepAbove = true`); no `keepAboveChanged` handler | C | Conflict, minor: the user cannot turn Keep Above off on a floating window (it comes back on the next pass), except on a Plasma-mode workspace with the plugin; on a tiled window the toggle is accepted but ignored until a reload, when a window in no tile with the flag is adopted as floating (`kwin.js:908`) |
| R19 | Keep Below (Window Below Other Windows: no default key) | Lowers the window's layer | KW | K: clobbers it on floats | `Window::setKeepAbove(true)` clears keepBelow (`window.cpp:597-600`); `lookFloating` sets keepAbove on floats | C (KWin source) / D (effect) | A floating window the user keeps below is moved above by kwin-i3 at the next pass. Minor |
| R20 | On All Desktops (pin button, window menu, Window On All Desktops: no key) | Window shown on every desktop | KW | K: unmanages | `rules.js:30` ("never managed"); `desktopsChanged` -> `dropWindow` (`kwin.js:1036-1050`) | C | Deliberate (plan "never managed"); a pinned tiled window leaves its tile and the layout reflows |
| R21 | Toggle Window Titlebar and Frame (Window No Border), borderless-maximized option | Removes/restores the decoration | KW | K: owns it on tiled windows | `takeBorder`/`giveBorder`, "re-asserted on every pass (the window menu, borderlessMaximizedWindows)" (`kwin.js:846-870`); a forcing window rule wins and is read back (`spec-window-modes.md` R1-4) | C | Handled by design: on a tiled window the toggle is undone; on floating it is the user's unless `frameOnFloating`. `BorderlessMaximizedWindows` is on `LATER.md` |
| R22 | Fullscreen: Window Fullscreen (no default key), F11 in apps, window menu | Fills the monitor | KW | K: tracks it | `fullScreenChanged` -> `model.setFullscreen` (`kwin.js:1027`); Meta+F is kwin-i3's key running the same KWin action; `docs/spec-fullscreen-tree.md` | C | Handled; two entry points, one effect: harmless duplicate |
| R23 | Window Close (Alt+F4, stock), Kill Window (Meta+Ctrl+Esc) | Close / kill | KW | K: Meta+Shift+Q runs the same KWin action | live `Window Close=Alt+F4` | C | Harmless duplicate; kwin-i3 records the focus choice at `closed` (`kwin.js:1012`) |
| R24 | Window Move / Window Resize / Pack Left/Right/Up/Down / Grow/Shrink Horizontal/Vertical (no default keys) | Keyboard-driven geometry change | KW | K: sees a drag or a refit | unbound in live file; Move/Resize raise `interactiveMoveResizeStarted` (handled as a drag, `kwin.js:1056`); the Pack/Grow ones set geometry directly and `refitOnFrameChange` pulls it back (`kwin.js:1091`) | D | Only if a user binds them |
| R25 | Window Operations Menu (Alt+F3; title-bar right-click) | Menu of Move / Resize / Maximize / Minimize / Keep Above/Below / Fullscreen / To Desktop / To Screen / No Border / rules | KW | K: each entry is one of the rows here | `CommandActiveTitlebar3=Operations menu` (`kwin.kcfg`) | C | "To Desktop"/"To Screen" end in `desktopsChanged` (R27) |

**Mouse**

| # | i3 item (exact form) | What it does to a tiled window | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| R26 | Meta+left-drag (`CommandAllKey=Meta`, `CommandAll1=Move`) | Moves a window anywhere; a tiled one comes out of its tile | KW | K: floats it where dropped; joins the workspace of the monitor it is dropped on | plan "Scope" (mouse chords: KWin's own); `kwin.js:1056-1090` (`dragStart`/`dragEnd`, `tileChanged` `!tile && dragging==="move"` -> `floatingEnable`) | C | Deliberate split. Meta+middle (`CommandAll2=Toggle raise and lower`) only restacks, within the keep-above layer: harmless |
| R27 | Meta+right-drag (`CommandAll3=Resize`), border drag between tiles | Resizes; KWin moves the shared tile edge | KW | K: reads the new shares back at drag end | `readBack(ws)` (`kwin.js:1068`), plan decision 3 | C | Deliberate split |
| R28 | Title-bar drag / double-click / border drag on a tiled window (no plugin) | Same as R26/R15 | KW | K: kwini3helper blocks it on the frame | README: "With the plugins, the 1 px frame starts nothing from the pointer"; tiled windows have no title bar there (`noBorder`) | C | Without the plugin the title bar is a second way in; both lead to the handled paths |
| R29 | Snap zones (`BorderSnapZone=10`, `WindowSnapZone=10`), edge switch-desktop-while-dragging (Plasma setting, default off [D]) | Magnetism while moving a floating window; switches desktop at the edge | KW | K: follows | `kwin.kcfg`; a switch while dragging ends in `desktopsChanged`, held back by the `dragging` guard (`kwin.js:1045`) | D | Harmless |

**Desktops, switching, panels**

| # | i3 item (exact form) | What it does to a tiled window | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| R30 | Switch to Desktop N: `Ctrl+F1..F4` and `Meta+F1..F4` (stock), 5-25 unbound; Switch to Next/Previous Desktop (no key) | Changes the active output's desktop | KW | K: tracks it | `currentDesktopChanged` -> `shownOutside` (`kwin.js:1861`); `docs/spec-unmanaged-windows.md` | C | Second way to switch workspaces besides Meta+N; both are handled. KWin's Ctrl+F5.. do not exist, so those workspaces are Meta+N only |
| R31 | Window to Desktop N / Window to Next/Previous Desktop / Window One Desktop Left/Right/Up/Down (`Meta+Ctrl+Shift+arrows`, stock) | Sends the window to another desktop | KW | K: follows as a move to that workspace | `desktopsChanged` (`kwin.js:1036-1055`): "Someone else (the Overview, KWin) moved it: follow"; `relocate` fixes the monitor | C | Handled. No key clash (kwin-i3's Release is Meta+Ctrl+Shift+Q) |
| R32 | Per-output desktops (`PerOutputVirtualDesktops`, default `false` in `kwin.kcfg`) | With it off a desktop switch changes every monitor | KW | K: warns at load | `checkPerOutput` (`kwin.js`), `docs/spec-per-output-desktops.md`; live kwinrc has it true (DF) | C | Required setting. Stock default breaks multi-monitor tiling: reported, not fixed (the notification says how) |
| R33 | Virtual Desktops settings: add/remove desktops, rename, rows | Changes the desktop list; removal renumbers | KW / P | K: rebuilds | `desktopListChanged` (`kwin.js:1868`), `docs/spec-desktop-changes.md`, `spec-desktops-on-demand.md` (kwin-i3 creates desktops on demand and keeps them) | C | Handled |
| R34 | Pager: click a desktop, wheel, drag a window thumbnail to another desktop, add/remove desktop | Switch desktop / move a window / change the list | P | K: handled (R30, R31, R33); K's widget can replace it | `spec-workspace-widget.md`; widget is "Show Alternatives" on the pager | C | The stock pager draws all monitors side by side (why the widget exists); harmless duplicate |
| R35 | Task manager: click inactive task (activate, switch desktop if needed), click active task (minimize), wheel, middle click, context menu (Move to Desktop/Screen, Maximize, Keep Above, Minimize, Close) | Activates / minimizes / moves | P | K: handled via the signals in R15, R16, R18, R31 | `windowActivated`, `minimizedChanged`, `desktopsChanged` | C | Handled. Clicking a task on another monitor's workspace switches that monitor's desktop: matches kwin-i3's model |
| R36 | Overview (Meta+W, stock; effect `overview`): activate a window, drag a window to another desktop, add/remove desktops | Shows all windows; switches desktop on activate | KW | K: handled | `docs/spec-unmanaged-windows.md` ("Overview switching to an empty desktop"), `desktopsChanged` follow comment mentions the Overview | C | Handled and tested |
| R37 | Present Windows (Ctrl+F9/F10/F7, Meta+F9/F10/F7), Grid View (Meta+G) | Visual window pickers | KW | K: activation path only | same as R8 | D | No geometry change; harmless |
| R38 | Show Desktop / Peek at Desktop (stock Meta+D; panel "Show Desktop" button; `show dashboard=Ctrl+F12`) | Hides all windows (`showingDesktop`) and focuses the desktop window | KW / P | K: special-cased | `applyFocus` asks `showingDesktop` over D-Bus before taking the focus back (`kwin.js:1138`); `tests/live/74-show-desktop.sh`; `docs/bug-panel-config.md` | C | Handled. DF gave Meta+D to KRunner, so stock Meta+D is not live here |
| R39 | Electric borders / hot corners (`[ElectricBorders]`, effect `BorderActivate`; live `[Effect-overview] BorderActivate=9`, `EdgeBarrier=0`, `CornerBarrier=false` set by DF) | Corner/edge triggers Overview, Present Windows, Show Desktop; edge barrier resists the pointer between monitors | KW | K: none | live kwinrc; stock Overview-corner default not verified (kcfg URL 404) | C (live) / D (stock) | Effects only change desktops or window visibility, not geometry: no conflict. The stock edge barrier (100 px) affects focus-follows-mouse crossing between monitors, not kwin-i3's key-driven pointer warp |
| R40 | Activities (Meta+Q switcher; windows can be assigned to activities) | Hides windows of other activities | KW / P | K: ignores them; renumbers once on the first activity event after a login | `rules.js` ("other activities never managed"), `kwin.js:1879-1890`; README | C | By design; one-activity assumed |

**Rules, placement, focus**

| # | i3 item (exact form) | What it does to a tiled window | Owner here | Also done by | How / evidence | Tag | Note |
|---|---|---|---|---|---|---|---|
| R41 | KWin window rule: Size (Force / Apply Initially), Position | Force makes the window non-resizable / non-movable | KW | K: classifies it floating | `XdgToplevelWindow::isResizable` returns false when `rules()->checkSize(QSize()).isValid()` (`xdgshellwindow.cpp:690`); `rules.js` `fixedSize` -> "float"; `docs/spec-float-size.md` recommends rules for float sizes | C | Works as a way to float a window; a Force-Size rule on a tiled app silently floats it. Position Force: `isMovable` false (`:659`); effect on the tile not read [D] |
| R42 | KWin window rule: Desktop / Screen / Activity (Force) | Re-applies a desktop whenever it changes (`window.cpp:704`, `:3881`) | KW | K: follows each change | `desktopsChanged` follow and `relocate` (`kwin.js:1036`, reconcile) | D | Risk of a fight: kwin-i3 moves a window to workspace N (Meta+Shift+N), the rule moves it back, `relocate` pushes again. Not tested; a loop is plausible. plan "Scope" sends `assign` to KWin's rules, so this is the documented route |
| R43 | KWin window rule: Maximized / Fullscreen / Minimized / Keep above / Keep below (Force) | Re-forces the state | KW | K: reads back only noBorder | `isMaximizable` false under a Maximize rule (`xdgshellwindow.cpp:716`); `setKeepAbove` through `checkKeepAbove` (`window.cpp:597`); kwin-i3 reads back only `noBorder` forced by a rule (`takeBorder`, R1-4) | D | A Force-maximize rule against kwin-i3's untile/retile is a likely fight (kwin-i3 retiles, KWin re-maximizes); not tested |
| R44 | KWin window rule: Minimum/Maximum size, Ignore requested geometry, Placement, Skip taskbar/pager/switcher, No titlebar | Adjust limits and placement | KW | K: consistent | `checkMinSize` (`window.cpp:1011`) feeds `minSize`, which kwin-i3 already uses for tile minimums; `skipTaskbar` = unmanaged (`rules.js:30`); noBorder read back | C | Compatible. "Skip taskbar" is the user's way to exclude a window besides `ignoreClass` |
| R45 | Window placement policy (`Placement`, default `Centered` when decorations are built, `kwin.kcfg`) | Chooses the first position of a new window | KW | K: tile placement overrides it; floats take their first-seen geometry | `docs/spec-float-size.md`, `recordUntiled` (`kwin.js`) | C | Harmless duplicate: both place, kwin-i3 last |
| R46 | Focus stealing prevention (`FocusStealingPreventionLevel` default 1 = Low) and `xdg-activation` | Decides whether a new window takes the focus | KW | K: re-focuses per the model | `docs/spec-fullscreen-tree.md` ("focus-stealing prevention is Low by default so the activation is ..."); `keepsFullscreenFocus`, passive-pass rule in `applyFocus` (`kwin.js:1110-1135`) | C | Two owners of focus on a new window, resolved by the tree (activation signals feed the model); i3's `focus_on_window_activation` has no setting here |
| R47 | Focus policy (stock `ClickToFocus`; live `FocusFollowsMouse`, `DelayFocusInterval=0`, `NextFocusPrefersMouse=true`), `ClickRaise=true`, `AutoRaise=false` | Who gets focus on pointer/click | KW | K: expects FFM for i3's feel, never sets it | README "Optional/pass (e)"; `spec-stock-mode.md` (live tests assume FFM; click-to-focus passes with take-keys) | C | Setting left to the user; i3 users will want FFM + no raise. Documented only |
| R48 | Activate Window Demanding Attention (Meta+Ctrl+A), task-manager attention flash | Jumps to / flashes the window | KW / P | K: urgency OOS | plan "Scope" | C | Meta+Ctrl+A is not a kwin-i3 key; the jump goes through R8's path |
| R49 | Client-initiated state changes (xdg `set_maximized`, `set_fullscreen`, `set_minimized`, Xwayland equivalents) | Apps maximize/fullscreen/minimize themselves | KW | K: same handlers as R15, R16, R22 | `kwin.js:1023-1035` | C | Handled uniformly, as the user-initiated ones |
| R50 | Plasma shell windows: panel (dock), desktop, KRunner, tray and applet popups, notification popups, OSDs | Take focus / sit on screen | P | K: ignores them; keeps the focus pass off popups; kwini3helper's popup grace | `rules.js` (`dock`/special/popup ignored, `ignoreClass` has krunner, plasmashell); `applyFocus` passive-pass rule (`kwin.js:1110`); `spec-popup-grace.md` | C | Handled; a long chain of fixes behind it (popup/tooltip bugs, Paul 2026-10-25) |
| R51 | Session restore (KWin remembers window desktop/geometry) | Re-places a window at login | KW | K: treats as a new window; gives back a stale `noBorder` | `spec-window-modes.md` R1-4; `adoptWindow` (`kwin.js:906-910`) | C | Harmless |
| R52 | Other KWin scripts (Krohnkite, i3ws, HyprKwin) and effects | Place windows | KW | K: README forbids them | `kwinrc [Plugins]` enables only `kwin-i3Enabled` (+ `hidecursor`, `scaleEnabled=false`); ~150 inert `HyprKwin` actions remain in `kglobalshortcutsrc` | C | No live conflict. KWin has no stock effect that changes real geometry (they are visual); `kwini3hold` is kwin-i3's own |
| R53 | KWin's saved tile layouts `kwinrc [Tiling]` and default roots (25/50/25, padding 4/6, new desktops) | Pre-existing tiles, padding on each root | KW | K: forces padding 0, rebuilds the root | live kwinrc: 14 roots with `padding=4/6` and 3-tile layouts for unused desktops; `reconcileNow` reinsets and rebuilds (`kwin.js:595-615`); plan: "every root gets padding = 0" | C | Harmless once touched. An untouched root keeps KWin's default 3 columns until a window lands there |

### Count and tally

121 rows, counted by the first owner named. Part 1 (D, 68): P 21, none 15, K 13, n/a 12, OOS 5, KW 1, DF 1. Part 2 (R, 53): KW 46, P 6, n/a 1. (Part 2's Owner is who acts on the window; kwin-i3's reaction is in 'Also done by'.)

