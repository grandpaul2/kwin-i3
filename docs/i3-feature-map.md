# i3 feature map: who fulfils what in kwin-i3 + Plasma

Written 2026-10-25 (research only, not committed). The feature list in step 1 was taken from i3's
user guide, the IPC docs, the i3status man page and the i3bar protocol page before this repo was
read. Owners are checked against `src/`, `plugin/`, `widget/`, `kcm/`, live config
(`~/.config/kglobalshortcutsrc`, the session bus) and `~/.dotfiles/setup.sh`, README "Plasma" table.

Evidence tags: **[C]** confirmed in code or live config, **[D]** taken from docs only.
Owner key: **K** kwin-i3 (script / plugins / widget / settings page), **KW** stock KWin,
**P** Plasma, **DF** dotfiles only, **none** a hole, **OOS** out of scope by decision
(`docs/plan.md`, "Scope").

## The table

| # | i3 feature | Owner here | How, and evidence | Tag |
|---|---|---|---|---|
| **Tree and layouts** | | | | |
| 1 | Container tree (outputs / workspaces / splits / leaves), insertion after focus | K | `src/tree.js`, ported from i3 `src/tree.c`, `con.c` | C |
| 2 | `split h` / `split v` | K | Meta+H / Meta+V, `KEYS` in `src/kwin.js:1158` | C |
| 3 | `layout toggle split` (splith/splitv) | K | Meta+E | C |
| 4 | `layout stacking` / `tabbed` | OOS | plan "Scope": "Paul's decisions, 2026-10-21" ("I don't use tabbed") | C |
| 5 | `focus parent` / `focus child` | OOS | same row; `tree.js:18` | C |
| 6 | Flatten of nested splits | K, deliberate break | plan decision 8: single-child splits removed after moves, unlike i3 | D |
| 7 | `workspace_layout`, `default_orientation` | K | setting `defaultOrientation` (auto / h / v), README config table | C |
| 8 | Split percentages, `con_fix_percent` | K | model keeps i3's shares, written to KWin tiles (plan decision 3) | D |
| **Focus and movement** | | | | |
| 9 | `focus left/down/up/right` (tree based) | K | Meta+arrows, Meta+J/K/L/; (`KEYS`) | C |
| 10 | Focus across monitors at the edge | K | `Focus*` actions, `focusWrapping` setting | C |
| 11 | `focus_wrapping` yes/no/force/workspace | K | `focusWrapping` setting | C |
| 12 | `move left/down/up/right` (`tree_move`) | K | Meta+Shift+arrows / J K L, Meta+: | C |
| 13 | `focus mode_toggle` (tiling/floating) | K | Meta+Space | C |
| 14 | `focus output`, `move container to output`, `move workspace to output` | none | no such actions in `KEYS`; moving across monitors works only by walking the edge (Meta+Shift+arrow) or by workspace number | C |
| 15 | `focus_follows_mouse` | KW | `kwinrc FocusPolicy=FocusFollowsMouse`, set by DF `setup.sh:145`; kwin-i3 only reads the activation (plan "focus follows mouse") | C |
| 16 | `mouse_warping` | K + KW | kwin-i3 warps on a monitor change (`kwin.js:1013`, `MoveMouseToCenter`); no warp within a monitor | C |
| 17 | `focus_on_window_activation`, `no_focus` | KW | KWin's focus-stealing prevention and window rules | D |
| 18 | `focus` by criteria / "jump to window" | KW / P | Overview (Meta+W, DF keeps it), task manager, KRunner window search; nothing from kwin-i3 | C |
| **Workspaces and outputs** | | | | |
| 19 | `workspace N` (Meta+1..0), created on demand | K | `gotoWorkspace`, `Workspaces.ensure`, `docs/spec-desktops-on-demand.md` | C |
| 20 | `move container to workspace N` | K | Meta+!..Meta+) (US symbols only, OPEN item 9) | C |
| 21 | Workspace lives on one output; separate per monitor | K + KW | kwin-i3 `src/workspaces.js` on KWin 6.7 `PerOutputVirtualDesktops`; DF sets it (`setup.sh:193`) and kwin-i3 warns if off (`spec-per-output-desktops.md`) | C |
| 22 | `workspace N output X` | K | `workspaceOutputs` setting | C |
| 23 | Monitor unplug / replug: workspaces move and return | K | plan decision 10 | D |
| 24 | `workspace next/prev`, `back_and_forth`, `workspace_auto_back_and_forth` | none | no actions (grep for backAndForth / next / prev in `src/` finds nothing). Scroll on the widget cycles used workspaces (`widget/`), the only route | C |
| 25 | `rename workspace`, named workspaces | none | workspaces are numbers 1..10 only (`NAMES`, `kwin.js:1155`); more than 10 not reachable by key | C |
| 26 | `move workspace to output` | none | see row 14 | C |
| **Floating** | | | | |
| 27 | `floating toggle` | K | Meta+Shift+Space | C |
| 28 | Floating windows above tiled | K | `keepAbove` (plain script) or the effect's set (plugins), `kwin.js:758-785`; off on `floatingWorkspaces` | C |
| 29 | Floating move/resize with `floating_modifier` | KW | Meta+drag, Meta+right-drag are KWin's own (plan Scope table, last row). Resize writes back to the tree | C |
| 30 | Floating by default (dialogs, `for_window ... floating enable`) | K | `src/rules.js` classify: transient / modal / fixed size / dialog / splash / utility, plus `floatingClass`, `floatingTitle` | C |
| 31 | Floating min/max size, `move position center` / `to cursor` | KW | KWin placement and window rules | D |
| 32 | `sticky enable` | KW | a window on all desktops is "never managed" (`rules.js:30`, `kwin.js:944`) | C |
| 33 | Plasma-window workspaces (not an i3 feature) | K | `floatingWorkspaces`, see (e) | C |
| **Fullscreen** | | | | |
| 34 | `fullscreen toggle` (per output) | K + KW | Meta+F is kwin-i3's, runs KWin's "Window Fullscreen" (`kwin.js:1099`); the tree keeps the window; focus constraints in `spec-fullscreen-tree.md` | C |
| 35 | `fullscreen global` | none | not offered; KWin has no multi-output fullscreen either | D |
| 36 | `popup_during_fullscreen` | KW | stock behaviour; kwin-i3 floats dialogs and ignores popups | D |
| **Scratchpad, marks, criteria, rules** | | | | |
| 37 | Scratchpad (`move scratchpad`, `scratchpad show`) | OOS | plan: "features the author never used are not built (Paul, 2026-10-24)" | C |
| 38 | Marks (`mark`, `[con_mark=]`, `swap`) | OOS | same row | C |
| 39 | Criteria `[class= title= ...]` | KW | KWin Window Rules; kwin-i3 has only four lists (`ignoreClass`, `ignoreRole`, `floatingClass`, `floatingTitle`) | C |
| 40 | `for_window` | OOS (to KW) | plan: "KWin's Window Rules already do them" | C |
| 41 | `assign` (window to workspace on map) | OOS (to KW) | same; KWin rules can set a desktop, but see (c) on interplay with the tree | D |
| 42 | `swap container with` | none | not in `KEYS`; the tree has no swap action | C |
| 43 | Urgency, `urgent` colours, `force_display_urgency_hint` | OOS | plan: "urgent windows (i3 showed them in its bar)". Plasma's task manager flashes demand-attention windows | C |
| **Modes, borders, gaps** | | | | |
| 44 | Binding modes in general | none, by limit | "a script cannot register keys that exist only inside a mode" (plan, Behaviour) | D |
| 45 | `mode "resize"` | K, as direct keys | Meta+Ctrl+arrows / J K L ; with `resizeStep` (10 %) | C |
| 46 | Borders: `default_border pixel N`, `border none/normal` | K (plugin) | `kwini3hold` draws a frame outside tiled windows, `frameWidth` 1..10, colours; no frame without the plugin (Breeze title bars stay) | C |
| 47 | `hide_edge_borders`, `smart_borders`, per-window `border` toggle | none | no per-window or per-edge border control | D |
| 48 | Title bars, title format, tabs' titles | KW | Breeze on floating; tiled windows have none with the plugin | C |
| 49 | Gaps inner/outer | K | `gapsInner`, `gapsOuter` (OPEN item 2 planned them; in README) | C |
| 50 | `smart_gaps`, per-workspace gaps | none | not offered | D |
| 51 | Colours (`client.focused` ...) | K | `frameActive`, `frameInactive` (+ floating pair) | C |
| 52 | Fonts, `title_align` | KW | n/a with Plasma's decoration | D |
| **Config, bindings, IPC** | | | | |
| 53 | Keybindings (`bindsym`) | KW | KWin global shortcuts `kwin-i3 <verb>`; rebind in the settings page "Keys..." or System Settings (`kcm/keys.cpp`) | C |
| 54 | Mouse bindings (`bindsym button`) | KW / P | System Settings > Window Management > Window Behavior; plan Scope | D |
| 55 | Config file, `set`, `include`, variables | OOS | plan: "settings belong in System Settings (and kwinrc)" | C |
| 56 | `reload` | K | Meta+Shift+C asks KWin to reconfigure (`kwin.js:1106`) | C |
| 57 | `restart` (in-place, keeps layout) | K, partly | the script reloads via `unloadScript`+`reconfigure` and rebuilds the tree from the tiles (plan decision 5); no key for it. Minimised windows lose their place | C |
| 58 | `exit` | P | logout; DF power menu (Meta+Shift+/) | C |
| 59 | `kill` | K + KW | Meta+Shift+Q runs KWin "Window Close"; Alt+F4 stays (DF `setup.sh:276`) | C |
| 60 | IPC: `i3-msg` / `GET_TREE`/`GET_WORKSPACES` / subscribe | OOS (to KW) | plan: "KWin's D-Bus is the scripting surface". Partly present: `Dump State` action, debug log over D-Bus (`kwin.js:1481`); the widget reads KWin directly | C |
| 61 | IPC events (`workspace`, `window`, `mode`, `binding`) | KW | KWin scripting signals; no external subscriber API from kwin-i3 | D |
| **Bar, status, launcher** | | | | |
| 62 | i3bar: workspace buttons | K (widget) | `widget/` "kwin-i3 Workspaces", replaces Plasma's pager on the panel | C |
| 63 | i3bar: tray, clock, `status_command` | P | Plasma panel, tray, digital clock; DF `setup.sh` adds the stock panel | C |
| 64 | i3bar: binding-mode indicator | none, moot | there are no modes (row 44) | D |
| 65 | i3bar: hide / dock / invisible modes | P | panel auto-hide | D |
| 66 | i3status: battery, volume, network, disk, load, time | P | system tray, System Monitor widgets | D |
| 67 | dmenu / `$mod+d` | DF (on P) | Meta+D runs fuzzel through `fuzzel-menu` (`setup.sh` `net.local.fuzzel.desktop`); Plasma's own is KRunner (Alt+Space, or Meta+Space if unbound), which DF unbinds | C |
| 68 | `$mod+Return` terminal | DF | Alacritty `_launch=Meta+Return` | C |
| **Session** | | | | |
| 69 | Lock (i3lock) | P + DF | Plasma's locker; Meta+L is taken by kwin-i3 focus-up, so DF reaches Lock through the power menu (Meta+Shift+/) | C |
| 70 | Exit / reboot / shutdown (i3-nagbar "Exit i3?") | P + DF | `org.kde.Shutdown` via DF `power-menu` with its own confirm | C |
| 71 | i3-nagbar (config errors, urgent prompts) | P | Plasma notifications; kwin-i3's load report goes through `org.freedesktop.Notifications` (`kwin.js:1232`) | C |
| 72 | Notifications | P | none in i3; Plasma's tray widget since 2026-10-25, plasmashell owns the bus name now (read-only `busctl list`). Meta+N is the bell, set by DF | C |
| 73 | Screenshots, clipboard, volume | P + DF | not i3 features; Spectacle via DF `screenshot` script, Meta+F12 `audio-toggle` | C |
| **Startup** | | | | |
| 74 | `exec` / `exec_always` | P | Plasma autostart (System Settings > Autostart), systemd user units | D |
| 75 | `startup_notification`, `--no-startup-id` | KW / P | stock | D |
| 76 | `i3-config-wizard`, `i3-dump-log`, `i3-save-tree` | OOS / K | no wizard; `Dump State` + `tools/capture` stand in for `i3-dump-log` | C |

## Findings

### (a) Holes (no owner, and not decided away)

1. **Workspace cycling and back-and-forth**: no next/prev workspace key and no `workspace back_and_forth`. i3 users use it constantly; Plasma has desktop-switch keys, but DF unbinds all of them and they would act on the global desktop, not per output (row 24). Only the widget's scroll cycles. [C] No grep hit in `src/`, no entry in `KEYS`.
2. **Output commands**: `focus output`, `move container to output`, `move workspace to output` (rows 14, 26). With two monitors the edge walk covers focus and move; moving a whole workspace to the other monitor has no route except `workspaceOutputs` plus a reload, which "moves no workspace that exists" (README). [C]
3. **Swap container**, **more than 10 workspaces**, **workspace names** (rows 25, 42). The latter two follow from "desktop N is workspace N" and the ten NAMES keys. [C]
4. **Non-US layouts: the move-to-workspace keys** do not fire (OPEN item 9). This is a hole for a stranger, not for Paul. [C, from OPEN.md; the code at `kwin.js:1155` registers US symbols only]
5. **Border options beyond width and colour** (`hide_edge_borders`, `smart_borders`, per-window `border none`) and **smart gaps** (rows 47, 50). Minor; the plan's test ("if Plasma already does it") does not cover them because Plasma cannot. [D]
6. **A Lock key**: Meta+L is kwin-i3's focus-up, so a stranger who runs `make take-keys` removes Plasma's lock key and has none left. README names the collision but offers no replacement; the author's power menu is DF only. [C: README install step 2; `setup.sh` power menu]
7. **Windows `assign` to a workspace** is "KWin's Window Rules", but a KWin rule that sets a desktop moves the window outside the tree. Whether kwin-i3 then adopts it into the right workspace was not checked; no test was seen for it in `docs/`. [D, unverified]

### (b) Redundancy

1. **Two launchers**: fuzzel (Meta+D, DF) and KRunner (Plasma; DF unbinds its shortcut). Not a conflict; fuzzel wins because it is the only one bound. A stranger gets KRunner only. [C: keep list in `setup.sh:226-235`, no krunner entry]
2. **Two workspace displays**: Plasma's pager and the kwin-i3 widget do the same job; the widget replaces the pager by hand (Show Alternatives). No conflict. [C]
3. **Stale second owner of Meta+N** (confirm before relying on it): live `kglobalshortcutsrc` still holds `[services][net.local.dunst-history.desktop] _launch=Meta+N` beside `[plasmashell] activate widget 15=Meta+N`. The `.desktop` file is gone from `~/.local/share/applications`, so it is likely inert, but a stale holder is what `warnTakenKeys` reports for kwin-i3's own keys, and `setup.sh:50` removes the old links without removing the key entry. [C for the entry; inert-ness inferred]
4. **Resize**: kwin-i3 keys and KWin's Meta+right-drag both write sizes; the drag is read back once when it ends (plan decision 3). Designed, not a conflict. [D]
5. **Fullscreen and close**: kwin-i3 owns the keys but runs KWin's own actions. Both KWin and kwin-i3 can hold the same key, and then KWin's fires. `setup.sh:271-280` clears KWin's bindings; the settings page and `make take-keys` do it for a stranger. [C]
6. **Focus policy**: kwin-i3 expects focus-follows-mouse but does not set it; KWin owns it (`stock-mode` test runs click-to-focus). Two owners of one behaviour, the lesser one only documented ("README only", OPEN 4e). [C]
7. **Per-output desktops**: KWin setting, with kwin-i3 detecting and fixing it. DF also sets it. Triple coverage, no conflict. [C]

### (c) Wrong side?

1. **Gaps**: in kwin-i3 now (tiles are the script's). Argument for staying: only the tile layout can inset tiles. Argument against: the plan says "if Plasma already does it, kwin-i3 doesn't"; Plasma doesn't, so it stays. Plan's own "one addition planned" confirms. [D]
2. **The frame** (borders, colours) is a compiled C++ effect. It is i3 look rather than window arrangement, which the Scope table lists as "in" ("and the frame"). Arguments for Plasma/KWin: it is a decoration concern, `kwin-i3`'s plugins break at each Plasma update and are off until rebuilt (README "The upkeep"). Argument for kwin-i3: KWin offers no per-state border colour for undecorated tiles. Leave as is; the cost is a known maintenance load. [D]
3. **Workspace widget (i3bar buttons)**: arguably a Plasma concern ("a bar ... Plasma's panel" is OOS). It stays because Plasma's pager is wrong for per-output desktops. It is the clearest case of kwin-i3 owning a shell piece; it passes only because of that reasoning (`spec-workspace-widget.md`). [D]
4. **Hold / atomic layout** (Sway-style transactions): it is a rendering feature i3 on X11 never had. Plan decision 8 records Paul's choice. [D]
5. **Taken-key reporting and `take-keys`**: touching Plasma's shortcut registry from a window manager. The reasoning in `spec-taken-keys.md`: a key two owners hold fires the other; only the user's setup can fix it. It could live in an installer or DF instead. [D]
6. **Notifications from kwin-i3** (`kwin.js:1232`): depends on a server. Correct side (Plasma shows them), but note the load report is invisible if no server runs; `plasma_waitforname` can hang the `Notify` call (spec-notifications "Checks"). [D]
7. **Launcher / terminal / lock / power menu keys** are DF scripts. They belong to Plasma (KRunner, Konsole, logout) and are DF only by choice; see (d). [C]
8. **Window rules for float / ignore**: kwin-i3 keeps four lists (`rules.js`) even though plan says Window Rules own per-window rules. Defensible: the script must decide "managed" before KWin's rule engine can express it as a tile policy. A stranger may expect both places to work. [D]

### (d) Dotfiles-only items a stranger would miss

All [C] in `~/.dotfiles/setup.sh` and README "Plasma" unless noted.

1. Focus follows the mouse, delay 0, no raise (`setup.sh:145-147`); kwin-i3 does not set it.
2. `PerOutputVirtualDesktops=true` (`:193`): kwin-i3 only warns (and a stranger is told in the README).
3. Plasma's default shortcuts all unbound (keep list `:226-235`): the stranger's Meta+arrows, Meta+Ctrl+arrows, Meta+E, Meta+L, zoom keys collide; `make take-keys` is the substitute for the colliding ones only.
4. Meta+Return (terminal), Meta+B (Firefox), Meta+D (fuzzel), Meta+Shift+/ (power menu with lock), Meta+Shift+S (screenshot), Meta+F12 (audio), Meta+T (Dolphin, because Meta+E is kwin-i3's), Meta+W (Overview), Meta+I (Settings).
5. Meta+N as the notifications bell (written into the tray's widget config, `setup.sh:293-302`; takes effect at the next plasmashell start).
6. `ModifierOnlyShortcuts Meta=` (Meta alone does nothing), so Plasma's launcher does not open on a Meta tap.
7. Panel default added where none exists (`:286-291`) and the pager swap, by hand.
8. `floatingTitle "STAGE (streamed),Picture-in-Picture"` in kwinrc (`:170`): kwin-i3's default is empty.
9. `holdTimeoutMs 200`, `hidecursor` 3 s, no hot corner, no animations, `EdgeBarrier=0`, Caps Lock none, dark wallpaper `#181818`.
10. Firefox `browser.tabs.inTitlebar=0` in `user.js` so the browser draws no second title bar.
11. The stage (`~/.dotfiles/stage/`): real i3 inside Xephyr, for streaming. i3 itself still runs there, and on the laptop. [D]
12. `tools/capture` launcher (Meta+Shift+B) lives in DF.

### (e) In kwin-i3 but not an i3 feature

1. **Plasma-window mode**: `floatingWorkspaces`, `frameOnFloating`, floating frame colours (`frameFloatingActive` is "a muted green; i3 has no such colour"). Deliberate (plan "Window modes"). [C]
2. **Atomic layout hold** effect (`kwini3hold`) and `holdEnabled`, `holdTimeoutMs`. Deliberate (Paul, 2026-10-23). [C]
3. **Release** safety key (Meta+Ctrl+Shift+Q), **Dump State**, debug log, `tools/capture`: a safety/diagnostic feature, no i3 equivalent beyond `i3-dump-log`. [C]
4. **Taken-keys check / `make take-keys` / `restore-keys`**, the per-output-desktops check, the load report notification: installer-like help for non-author setups (OPEN item 4). Scope creep toward "works on someone else's machine"; Paul's heading in OPEN.md approves it. [C]
5. **Settings page (kcm) and Keys list**, **workspace widget**, **plugin helper** (`kwini3helper`: hover/click on frame focuses, Apply applies): not i3 features but the replacement for the config file and bar. [C]
6. **GTK 4 re-sizing nudge** (README "Plain GTK 4 apps"): a workaround for an app quirk, not i3. [D]
7. **`ignoreClass` default list from Krohnkite**: a legacy of the migration, not i3's. [C `rules.js` header]
8. **Mouse chord plugin** (Meta+Shift+drag): retired 2026-10-24, noted in plan only. [D]

### Short list of things worth Paul's call

- Rows 24, 14/26 (workspace back-and-forth, output commands): the only holes where i3 muscle memory exists and Plasma gives nothing. Scope says "no more of i3", but workspace switching is "basic window management" under the plan's own test.
- Lock after `make take-keys` (hole 6) for non-author installs.
- The stale `net.local.dunst-history.desktop` Meta+N entry (redundancy 3): confirm and clear with the next `setup.sh` change.
