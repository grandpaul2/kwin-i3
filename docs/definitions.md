# kwin-i3's words: one name per thing

**Paul's, 2026-10-27.** Every other doc, every commit message and every reply
uses these words in these senses. (Paul, 2026-10-27: a day of rules went wrong on words that
meant two things: "manage", "places itself", "active", "desktop", "home".)

**The rules for words**
- **i3's word wherever i3 has the thing** (Paul: "ride i3, hard"). KWin's word only for things that
  are KWin's alone, and named as KWin's. Plasma's word only for Plasma's things.
- **One name per thing, one thing per name.** A word that would mean two things gets qualified
  every time ("KWin's active window", never just "active").
- **A difference from i3 is written ≠ with its reason**; = when it is as i3; + when i3 has no
  counterpart. A difference needs a specific, explicit reason, minor or not.
- Code keeps its identifiers (`wins`, `ignore`, `currentDesktopForScreen`); the docs say the word
  here and give the identifier in backticks when it helps.

## Windows: the kinds (i3's)

Every window is one of these. Today's code has fewer (`behaviour.md` §3 says which differ).

| word | means | i3 | KWin / Plasma |
|---|---|---|---|
| **tiling window** | a window in the tree's layout; the tree places it | `tiling` (criteria), "tiling window" | a window in one of KWin's tiles |
| **floating window** | a window in the tree, on its workspace's floating list; you place it | `floating` | a window KWin places; kept above |
| **sticky floating window** | a floating window visible on every workspace of its output | `sticky enable` | KWin's "on all desktops" (`onAllDesktops`) |
| **dock** | a panel: reserves space, never focused | dock client (`_NET_WM_WINDOW_TYPE_DOCK`), i3bar | Plasma's panels |
| **root window** | the background; a click or a crossing there focuses its output | the X root window | the **desktop window** (Plasma's wallpaper and icons; `desktopWindow`) |
| **override-redirect window** | not in the tree: never placed or focused by the window manager; it takes the keyboard itself, and focus is where it was when it goes | override-redirect (`manage.c`: "Don't manage") | on Wayland: popups, menus, tooltips, notifications, OSDs, Plasma's shell surfaces (KRunner), and Plasma's system windows (`kded5`, the video bridge) |
| **transient window** (a dialog) | a window that belongs to another, its **parent** (`transient_for`) | `transient_for` | `transient`, `transientFor` |
| **modal dialog** | a transient window that blocks its parent | `_NET_WM_STATE_MODAL` | `modal`; KWin keeps it and its parent on the same virtual desktop |
| **fullscreen window** | a window covering its output, on top, its workspace's focus kept on it | `fullscreen` (output mode; global mode is out of scope) | `fullScreen` |
| **window type** | what the app says a window is: normal, dialog, utility, splash, … | `window_type` | `windowType`; **KWin's "normal window"** (`normalWindow`) means type Normal only, so an X11 dialog is not one |

**Not used any more:** "places itself", "unmanaged", "managed" for a kind, "Plasma window(s)" for
a kind, "left alone", "tiled" (Paul, 2026-10-27: **tiling**, i3's).

## The tree (i3's)

| word | means | i3 |
|---|---|---|
| **tree** | kwin-i3's model of every output's workspaces and their containers (`src/tree.js`) | the tree (`tree.c`) |
| **container** | any node: a workspace, a split container or a window's container | con |
| **split container** | a container holding others, side by side (`h`) or stacked (`v`); it draws nothing | split con, `splith` / `splitv` |
| **layout** (direction) | a split container's or workspace's `h` or `v` | `layout`, orientation |
| **leaf** | a container holding a window | a window's con |
| **share** | a child's fraction of its parent along the split (`percent`) | `percent` |
| **focus stack** | each container's children, most recently focused first | `focus_head` |
| **the focus** | the one container the tree has focused: a window, or an empty workspace | `focused` |
| **tidy** | removing a split container whose only child is a split container (≠ i3, `plan.md`) | — |
| **flatten** | i3's removal of redundant split containers | `tree_flatten` |

## Workspaces and outputs

| word | means | i3 | KWin / Plasma |
|---|---|---|---|
| **output** | a monitor (Paul, 2026-10-27: i3's word; not "monitor" or "screen") | output | KWin's output (`LogicalOutput`); the script API's **screen** |
| **workspace** | workspace N, 1 to 10; it is virtual desktop N | workspace | **virtual desktop** |
| **virtual desktop** | KWin's object behind a workspace; said only when KWin's side matters | — | virtual desktop (`workspace.desktops`) |
| **per-output desktops** | KWin showing a different virtual desktop on each output; kwin-i3 needs it | (i3's normal) | `perOutputVirtualDesktops` |
| **a workspace's output** | the output a workspace is on | the workspace's output | — |
| **visible** | the workspace an output is showing; one per output (Paul, 2026-10-27: i3's word; not "shown") | visible workspace | `currentDesktopForScreen(output)` |
| **the focused workspace / output** | the workspace (and its output) that holds the focus | focused workspace / output | — |
| **assignment** | `workspaceOutputs`: a workspace's chosen output | `workspace N output X` | — |
| **back-and-forth** | going to the previously focused workspace | `workspace back_and_forth` | — |

**Not used any more:** "home" (it meant "a workspace's output", plus a remembered output that is
away, which goes with decision 10's rewrite); "desktop" alone (say virtual desktop or desktop
window).

## Focus, pointer and KWin's side of them

| word | means | i3 | KWin |
|---|---|---|---|
| **focus** | the tree's focus (above). The rules: `behaviour.md` §5 | focus | — |
| **KWin's active window** | the window KWin has given the keyboard; usually the focus's window, sometimes an override-redirect window, sometimes none | X input focus | `workspace.activeWindow` |
| **KWin's active output** | where KWin opens a new window; it follows every pointer move and every activation | — | `workspace.activeScreen` / `activeOutput()` |
| **activation** | KWin making a window its active window (a click, focus follows mouse, a new window, an app asking, kwin-i3 itself) | (focus) | `activateWindow` |
| **pointer** | the mouse cursor | pointer | cursor |
| **focus follows mouse** | the pointer entering a window focuses it | `focus_follows_mouse` | KWin's focus policy (`FocusFollowsMouse`); stock Plasma is click to focus |
| **pointer warp** | kwin-i3 moving the pointer to the new focus | `mouse_warping` | KWin's MoveMouseToFocus / ToCenter |
| **passive pass** | a pass of placing (below) that no key started | — | — |

## kwin-i3's own machinery (+, no i3 counterpart)

| word | means |
|---|---|
| **pass** | one run of placing: each changed workspace reconciled, then the focus applied |
| **reconcile** | making one workspace's KWin tiles match the tree |
| **root tile** | KWin's top tile for one output and one virtual desktop |
| **the script** | kwin-i3 itself, `package/` (`src/` built into `main.js`) |
| **the helper** | the `kwini3helper` KWin plugin: frame focus, tiling drag, popup grace, layout keys, settings watch |
| **the effect** | the `kwini3hold` KWin effect: the frame, rounded corners, the hold |
| **the frame** (ring) | the line the effect draws round a tiling window (`frameWidth`); i3's `pixel` border |
| **the hold** | the effect freezing a layout change until every window has its new size |
| **gaps** | space between windows (inner) and at the output's edges (outer); i3's `gaps` |
| **capture** | Meta+Shift+B: kwin-i3's flight recorder saved with Paul's note (`docs/debugging.md`) |
