# kwin-i3's words: one name per thing

Every other doc, every commit message and every reply uses these words in these senses. Rules
have gone wrong on words that meant two things ("manage", "places itself", "active", "desktop",
"home"); this page is why they don't now.

**The rules for words**
- **i3's word wherever i3 has the thing** (ride i3, hard). KWin's word only for things that
  are KWin's alone, and named as KWin's. Plasma's word only for Plasma's things.
- **One name per thing, one thing per name.** A word that would mean two things gets qualified
  every time ("KWin's active window", never just "active").
- **A difference from i3 is written ≠ with its reason**; = when it is as i3; + when i3 has no
  counterpart. The reasons a difference may have are `docs/plan.md`'s, "Scope".
- Code keeps its identifiers (`wins`, `ignore`, `currentDesktopForScreen`); the docs say the word
  here and give the identifier in backticks when it helps.
- **px** is a logical pixel (KWin's, before an output's scale) wherever a size is given.

## Windows: the kinds and their states (i3's)

**A window's kind** is one of these four; it says who arranges the window.

| word | means | i3 | KWin / Plasma |
|---|---|---|---|
| **tiling window** | a window in the tree's layout; the tree places it | `tiling` (criteria), "tiling window" | a window in one of KWin's tiles |
| **floating window** | a window in the tree, on its workspace's floating list; you place it | `floating` | a window KWin places; kept above the tiling ones |
| **dock** | a panel: reserves space, never focused, not in a workspace | dock client (`_NET_WM_WINDOW_TYPE_DOCK`, `manage.c:248`), i3bar | Plasma's panels |
| **override-redirect window** | not in the tree: never placed or focused by the window manager; it takes the keyboard itself, and focus is where it was when it goes | override-redirect (`manage.c:139`: "Don't manage") | on Wayland: popups, menus, tooltips, Plasma's notifications and OSDs, Plasma's shell surfaces (KRunner), and Plasma's system windows (`kded5`, the video bridge; a built-in list, `behaviour.md` §3) |

**How the kind is decided** (i3's `manage.c`, in its order): override-redirect is never in the
tree; a dock type is a dock; anything else is tiling, unless it floats: by its window type
(dialog, utility, toolbar, notification, splash), by being modal, by a fixed size (minimum =
maximum), by being on all desktops (then also sticky), or by being transient, through
`transient_for` or (X11) a client leader that is already in the tree (`manage.c:462-497`). A
`for_window` rule runs after and has the last word (`floating enable` / `floating disable`).

**A window's states**, which a window in the tree may have (several at once):

| word | means | i3 | KWin / Plasma |
|---|---|---|---|
| **sticky** | a floating window visible on every workspace of its output (a **sticky floating window**; `behaviour.md` and the code call it a kind, `sticky`). A floating window's state only: i3 ignores it on a tiling one | `sticky enable` | KWin's "on all desktops" (`onAllDesktops`) |
| **transient window** (a dialog) | a window that belongs to another, its **parent** | `transient_for`, or the client leader (X11) | `transient`, `transientFor` |
| **modal dialog** | a transient window the app marks modal; i3 floats it and does nothing more | `_NET_WM_STATE_MODAL` | `modal`; KWin keeps it and its parent on the same virtual desktop and gives it the parent's focus |
| **fullscreen window** | a window covering its output, on top, its workspace's focus kept on it | `fullscreen` (output mode; global mode is out of scope) | `fullScreen` |
| **window type** | what the app says a window is (an input to the kind, not a kind): normal, dialog, utility, splash, … | `window_type` | `windowType`; **KWin's "normal window"** (`normalWindow`) means type Normal only, so an X11 dialog is not one |

**The root window** is not a kind (`behaviour.md` lists it with them, as `root`): it is the background; a click or a crossing there focuses its
output (i3: the X root window; KWin/Plasma: the **desktop window**, Plasma's wallpaper and icons,
`desktopWindow`).

**Manage** (i3's word): to put a window in the tree when it appears, deciding its kind and
workspace (i3's `manage_window`). kwin-i3's docs and code say **adopt** for it (+), because
"manage" is already KWin's for putting a window in a tile (`Tile.manage`, decision 6).

**Not used any more:** "places itself" (now: override-redirect, or floating), "unmanaged" and
"managed" as a kind, "Plasma window(s)" for a kind, "left alone", "tiled" (now:
**tiling**, i3's).

## The tree (i3's)

| word | means | i3 |
|---|---|---|
| **tree** | kwin-i3's model of every output's workspaces and their containers (`src/tree.js`); "the model" in older docs is the tree | the tree (`tree.c`) |
| **container** | any node: a workspace, a split container or a window's container | con |
| **split container** | a container holding others, side by side (`splith`) or one above the other (`splitv`); it draws nothing | split con |
| **layout** | a container's or workspace's `splith`, `splitv`, `tabbed` or `stacked`; its **orientation** is h or v, tabbed counting as h and stacked as v | `layout`, `con_orientation` |
| **leaf** | a container holding a window | a window's con |
| **share** | a child's fraction of its parent along the split | `percent` |
| **focus stack** | each container's children, most recently focused first | `focus_head` |
| **the focus** | the one container the tree has focused: a window, a container (after focus parent), or an empty workspace | `focused` |
| **group** | a tabbed or stacked container: its children share its place, one shown, under its **bar** (one row of tabs, or one row per child) | a tabbed or stacked con |
| **floating container** | a container on its workspace's floating list: one floating window, or a split or a group floated whole, its windows laid out inside its rect as a tiled tree and moved and resized as one (`docs/plan.md`, "The mouse": one floating window is KWin's to move, a split or group floated whole kwin-i3's) | `CT_FLOATING_CON` (`floating_enable`, `floating.c:291`) |
| **flatten** | i3's removal of a redundant split: a one-child split whose child is a split of the other orientation, where the child's orientation matches the grandparent's (`tree.c:657-690`) | `tree_flatten` |

## Workspaces and outputs

| word | means | i3 | KWin / Plasma |
|---|---|---|---|
| **output** | a monitor (i3's word; not "monitor" or "screen"). ≠ on the settings page, which says **screen**, Plasma's word on its window pages | output | KWin's output (`LogicalOutput`); the script API's **screen** |
| **workspace** | workspace N, 1 to 10; it is virtual desktop N (≠ i3: numbers only, `plan.md` decision 9) | workspace | **virtual desktop** |
| **virtual desktop** | KWin's object behind a workspace; said only when KWin's side matters | — | virtual desktop (`workspace.desktops`) |
| **per-output desktops** | KWin showing a different virtual desktop on each output; kwin-i3 needs it | (i3's normal) | `perOutputVirtualDesktops` |
| **a workspace's output** | the output a workspace is on | the workspace's output | — |
| **visible** | the workspace an output is showing; one per output (i3's word; not "shown") | visible workspace | `currentDesktopForScreen(output)` |
| **the focused workspace / output** | the workspace (and its output) that holds the focus | focused workspace / output | — |
| **workspace output** | `workspaceOutputs`: the output a workspace is set to live on, i3's `workspace N output X` (not "assignment", which would collide with i3's `assign`) | `workspace N output X` | — |
| **assign** | a rule sending new windows matching its criteria to a workspace or output | `assign` | — |
| **back-and-forth** | going to the previously focused workspace | `workspace back_and_forth` | — |

**Not used any more:** "home" (it meant "a workspace's output", plus a remembered output that is
away; now: a workspace's output, or its workspace output); "assignment" for a workspace output;
"desktop" alone (say virtual desktop or desktop window); "monitor" or "screen" for an output.

## Focus, pointer and KWin's side of them

| word | means | i3 | KWin |
|---|---|---|---|
| **focus** | the tree's focus (above). The rules: `behaviour.md` §5 | focus | — |
| **KWin's active window** | the window KWin has given the keyboard; usually the focus's window, sometimes an override-redirect window, sometimes none | X input focus | `workspace.activeWindow` |
| **KWin's active output** | where KWin opens a new window; it follows every pointer move and every activation | — | `workspace.activeScreen` / `activeOutput()` |
| **activation** | KWin making a window its active window (a click, focus follows mouse, a new window, an app asking, a pager or task manager, kwin-i3 itself). KWin tells a script none of these sources apart | `_NET_ACTIVE_WINDOW`, with its source (application or pager) | `activateWindow` |
| **pointer** | the mouse cursor | pointer | cursor |
| **focus follows mouse** | the pointer entering a window focuses it | `focus_follows_mouse` (default yes) | KWin's focus policy (`FocusFollowsMouse`), the user's Plasma setting; stock Plasma is click to focus |
| **pointer warp** | kwin-i3 moving the pointer to the new focus | `mouse_warping` | KWin's MoveMouseToFocus / ToCenter |
| **passive pass** | a pass of placing (below) that no key started | — | — |

## kwin-i3's own machinery (+, no i3 counterpart)

| word | means |
|---|---|
| **pass** | one run of placing: each changed workspace reconciled, then the focus applied |
| **reconcile** | making one workspace's KWin tiles match the tree |
| **root tile** | KWin's top tile for one output and one virtual desktop |
| **the script** | kwin-i3 itself, `package/` (`src/` built into `main.js`) |
| **the helper** | the `kwini3helper` KWin plugin: frame focus, tiling drag and resize, the resize mode, popup grace, layout keys, the terminal key, settings watch |
| **the effect** | the `kwini3hold` KWin effect: the frame, rounded corners, the split indicator, the hold |
| **the frame** (ring) | the line the effect draws round a tiling window (`frameWidth`); i3's `pixel` border. "Frame" here never means KWin's `frameGeometry` or i3's X frame window; say those in full |
| **the hold** | the effect freezing a layout change until every window has its new size |
| **gaps** | space between windows (inner) and at the output's edges (outer); i3's `gaps`. The gap pixels are kwin-i3's: a press there is kwin-i3's, never the app's (in i3 a gap is the root window, where a press focuses the output, `click.c:410-426`; here a press there resizes, `behaviour.md` Z3) |
| **gap strip** | the helper's input-only window over a gap, so a press there reaches kwin-i3 (never over floating windows, panels or popups; `behaviour.md` Z9) |
| **capture** | Meta+Shift+B: kwin-i3's flight recorder saved with the user's note (`docs/debugging.md`) |
| **the Stage** | the period before a public release (`OPEN.md`): development from 2026-10-24, the beta from 2026-10-30; its rules (lean testing, `LATER.md`'s holds) hold through both. Capitalised; not the test app ("the test stage", a Xephyr window) |
| **the beta** | the Stage's second part: the repo public but unannounced, used by a few early users, their bugs fixed as they come (`OPEN.md`) |
| **`stable`** | the branch users run: main as of its last promotion, tagged `v1.N.0` (`v1.N.M` for a fix since). main is the development line, ahead of it |
| **a promotion** | moving `stable` to main after `docs/testing.md` P6's gate |
| **decision N** | `plan.md`'s numbered decision N; not to be confused with a `behaviour.md` row id |
