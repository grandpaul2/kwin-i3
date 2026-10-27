# kwin-i3 — plan

Rewritten 2026-10-21 after the tile spike (`docs/spike-kwin-tiles.md`), then revised the same night
after an independent review (`review-2026-10-21.md` (git history: `git show 3d98bd2:docs/review-2026-10-21.md`); each finding's disposition is at its end).
The first version, a new layout inside Krohnkite, is in git history.

## Goal

i3's window management, as Paul used it, inside a stock Plasma 6.7 Wayland session: windows are
entities in a tree that move among each other, not contents moved between fixed divisions. One
KWin script, replacing `i3ws` + patched Krohnkite in `~/.dotfiles`, with the current behaviour
kept exactly where it already matches i3 (Paul called it "ideal").

## Scope (Paul, 2026-10-24)

kwin-i3 gives Plasma i3's feel and basic window management, and leaves the rest to Plasma. It is
not i3 on KWin: the more of i3 it takes on, the more of it duplicates Plasma. From v1.0.0 on, the
work is making what is here **configurable and reliable**, on a machine and a setup that are not
the author's (`OPEN.md`), not adding more of i3.

**In:** i3's tree, with its focus, move, split, layout toggle and resize; workspaces that live on
a monitor; floating and the focus-mode toggle; i3's keys; the frame; i3's tiling drag and resize
by mouse; the rules that decide which windows tile, float or place themselves. What each does,
exactly: `docs/behaviour.md`.

**Out, with the reason:**

| left out | why |
|---|---|
| tabbed and stacked layouts, `focus parent`, urgency | Paul's decisions, 2026-10-21 (Behaviour, below) |
| marks, the scratchpad | where the line is drawn: features the author never used are not built (Paul, 2026-10-24) |
| i3's explicit command forms (`focus next sibling`, `focus tiling`, `layout splith`, `split toggle`, `floating enable`) | i3 binds none of them by default; the bound actions cover them (i3 feature map, finding 5; 2026-10-27) |
| a bar, launcher, notifications, lock, session control | Plasma's panel, KRunner, notifications, screen locker and logout |
| i3's config file and `i3-msg` IPC | settings belong in System Settings (and `kwinrc`); KWin's D-Bus is the scripting surface |
| `assign`, `for_window` and other per-window rules beyond tiled / floating / places itself | KWin's Window Rules already do them |
| an X11 session | Plasma's direction is Wayland, and the plugins are Wayland-only. **Xwayland apps in a Wayland session are in, first-class** (Paul, 2026-10-24: "that's going to be common"; `docs/spec-window-modes.md`, decision 8) |
| the launch workspace (i3: a window opens where it was launched, for programs i3 started) | a window opens on the workspace current when it appears; for programs a launcher, Steam or a game client starts, i3 did the same (Paul, 2026-10-26: he relies on it). A maybe for the release: `LATER.md`, item 28 |
| mouse chords beyond i3's (a chord plugin, 2026-10-22 to 10-24) | one chord was ever used; i3's own tiling drag and Meta+right-drag resize came back in the helper plugin instead (2026-10-26, `docs/spec-tiled-look.md`, `docs/spec-tiling-resize.md`) |

**Different from i3, on purpose:**

| here | i3 | why |
|---|---|---|
| a centre drop swaps the two windows | `tiling_drag`'s centre drop moves the window into the target's container | Paul, 2026-10-26: "I love swap" (`docs/spec-tiled-look.md`) |
| Meta+Shift+drag pulls a tiled window out to float | no such chord | Paul, 2026-10-26 (`docs/spec-tiled-look.md`) |
| a window opens on the workspace current when it appears | on its launch workspace, for programs i3 started | as above, "Out"; `LATER.md` item 28 |
| windows that place themselves (Plasma's own, KRunner, panels, a user's list) | i3 manages every window but docks | the seam between i3 and Plasma (`docs/spec-window-words.md`) |
| a window on all desktops places itself | a sticky window floats and follows the workspace | in Plasma, a sticky window is Plasma's to place (a widget, a picture-in-picture) |
| a window that skips the taskbar places itself | the hint is ignored | Plasma's convention for its own helpers (Yakuake, OSDs); confirmed by Paul, 2026-10-27 |
| a tiled window never gets smaller than its minimum size; if the layout can't hold the minimums, the largest floats | minimum sizes apply only to floating windows (`floating_check_size`); tiled windows get what the split gives | a Wayland client can't be drawn smaller than its minimum; it would hang off its tile (2026-10-22) |
| Meta+right-drag resizes the nearest edge that has a neighbour, and works from the gap beside a window | the nearest edge, nothing if it has no neighbour; the press must be on a window | Paul, 2026-10-26: the area to grab was too small (`docs/spec-tiling-resize.md`) |
| a split holding only another split is removed | kept | each costs a move key press; they only matter with `focus parent` and tabbed/stacked, both out (`docs/spec-nested-boxes.md`) |
| a window KWin activates on a hidden workspace (a window rule, a session restore, a link opened in a running browser) switches its monitor to that workspace; kwin-i3 follows | the workspace is marked urgent, never switched to | KWin's activation policy; won't-fix (Paul, 2026-10-25; i3 feature map, finding 6, rows C4, C67) |

**Window modes** (Paul, 2026-10-24, `docs/spec-window-modes.md`): a window is tiled (the
tree places it) or floating (you place it; the user's own decoration, as a Plasma window), and a
workspace can open new windows floating; a third kind places itself (the ignore lists). The words
are `docs/spec-window-words.md` (2026-10-27). It passes the test below: who arranges a window, i3's tree or Plasma, is the seam
itself, and only kwin-i3 can decide it.

**The test for anything new:** if Plasma already does it, kwin-i3 doesn't. A feature belongs
here only if it is part of how i3 arranges windows and Plasma can't do it. A setting belongs here
only if a user would reasonably want it different, not because a constant exists.

**The plugins are optional** (Paul, 2026-10-24: "if you want to really lock in that i3 feel
completely, but it works fine without them"). The script alone is the product and is tested
alone (every scenario not marked `# needs: plugin` runs with no plugin and Breeze, `tests/live/run.sh`); the frame, frame focus and
the hold effect are extras that cost a rebuild after every Plasma update.

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
   the user untiled the window; `docs/behaviour.md` §3 and §10 say what happens.
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
9. **Workspaces are KWin's virtual desktops** (`src/workspaces.js`, begun as i3ws's code): desktop N
   is workspace N, made on demand and never removed; a workspace lives on one monitor, kept by name;
   assignment, login numbering, the pointer following focus across monitors. What it does:
   `docs/behaviour.md` §4.
10. **When a monitor goes away, its workspaces move to a remaining monitor for good; a returning
    monitor gets its assigned workspaces, else a new one**, as i3 4.24 (`randr.c`). Paul,
    2026-10-27, replacing the 2026-10-25 "every workspace goes back": a home on a monitor that
    isn't there was the state behind most replug bugs (scenarios 42, 45-48; fuzzer I2). Assignment
    (`workspaceOutputs`) brings workspaces home. Windows KWin moves on its own during a hotplug
    are ignored: the model, not KWin's move, says where they belong. (Verified: a window KWin
    moves to another monitor loses its tile and is switched to the desktop that monitor shows.)
    Not built yet (`OPEN.md` item 40).# kwin-i3 — plan

Rewritten 2026-10-21 after the tile spike (`docs/spike-kwin-tiles.md`), then revised the same night
after an independent review (`review-2026-10-21.md` (git history: `git show 3d98bd2:docs/review-2026-10-21.md`); each finding's disposition is at its end).
The first version, a new layout inside Krohnkite, is in git history.

## Goal

i3's window management, as Paul used it, inside a stock Plasma 6.7 Wayland session: windows are
entities in a tree that move among each other, not contents moved between fixed divisions. One
KWin script, replacing `i3ws` + patched Krohnkite in `~/.dotfiles`, with the current behaviour
kept exactly where it already matches i3 (Paul called it "ideal").

## Scope (Paul, 2026-10-24)

kwin-i3 gives Plasma i3's feel and basic window management, and leaves the rest to Plasma. It is
not i3 on KWin: the more of i3 it takes on, the more of it duplicates Plasma. From v1.0.0 on, the
work is making what is here **configurable and reliable**, on a machine and a setup that are not
the author's (`OPEN.md`), not adding more of i3.

**In:** i3's tree, with its focus, move, split, layout toggle and resize; workspaces that live on
a monitor; floating and the focus-mode toggle; i3's keys; the frame; i3's tiling drag and resize
by mouse; the rules that decide which windows tile, float or place themselves. What each does,
exactly: `docs/behaviour.md`.

**Out, with the reason:**

| left out | why |
|---|---|
| tabbed and stacked layouts, `focus parent`, urgency | Paul's decisions, 2026-10-21 (Behaviour, below) |
| marks, the scratchpad | where the line is drawn: features the author never used are not built (Paul, 2026-10-24) |
| i3's explicit command forms (`focus next sibling`, `focus tiling`, `layout splith`, `split toggle`, `floating enable`) | i3 binds none of them by default; the bound actions cover them (i3 feature map, finding 5; 2026-10-27) |
| a bar, launcher, notifications, lock, session control | Plasma's panel, KRunner, notifications, screen locker and logout |
| i3's config file and `i3-msg` IPC | settings belong in System Settings (and `kwinrc`); KWin's D-Bus is the scripting surface |
| `assign`, `for_window` and other per-window rules beyond tiled / floating / places itself | KWin's Window Rules already do them |
| an X11 session | Plasma's direction is Wayland, and the plugins are Wayland-only. **Xwayland apps in a Wayland session are in, first-class** (Paul, 2026-10-24: "that's going to be common"; `docs/spec-window-modes.md`, decision 8) |
| the launch workspace (i3: a window opens where it was launched, for programs i3 started) | a window opens on the workspace current when it appears; for programs a launcher, Steam or a game client starts, i3 did the same (Paul, 2026-10-26: he relies on it). A maybe for the release: `LATER.md`, item 28 |
| mouse chords beyond i3's (a chord plugin, 2026-10-22 to 10-24) | one chord was ever used; i3's own tiling drag and Meta+right-drag resize came back in the helper plugin instead (2026-10-26, `docs/spec-tiled-look.md`, `docs/spec-tiling-resize.md`) |

**Different from i3, on purpose:**

| here | i3 | why |
|---|---|---|
| a centre drop swaps the two windows | `tiling_drag`'s centre drop moves the window into the target's container | Paul, 2026-10-26: "I love swap" (`docs/spec-tiled-look.md`) |
| Meta+Shift+drag pulls a tiled window out to float | no such chord | Paul, 2026-10-26 (`docs/spec-tiled-look.md`) |
| a window opens on the workspace current when it appears | on its launch workspace, for programs i3 started | as above, "Out"; `LATER.md` item 28 |
| windows that place themselves (Plasma's own, KRunner, panels, a user's list) | i3 manages every window but docks | the seam between i3 and Plasma (`docs/spec-window-words.md`) |
| a window on all desktops places itself | a sticky window floats and follows the workspace | in Plasma, a sticky window is Plasma's to place (a widget, a picture-in-picture) |
| a window that skips the taskbar places itself | the hint is ignored | Plasma's convention for its own helpers (Yakuake, OSDs); confirmed by Paul, 2026-10-27 |
| a tiled window never gets smaller than its minimum size; if the layout can't hold the minimums, the largest floats | minimum sizes apply only to floating windows (`floating_check_size`); tiled windows get what the split gives | a Wayland client can't be drawn smaller than its minimum; it would hang off its tile (2026-10-22) |
| Meta+right-drag resizes the nearest edge that has a neighbour, and works from the gap beside a window | the nearest edge, nothing if it has no neighbour; the press must be on a window | Paul, 2026-10-26: the area to grab was too small (`docs/spec-tiling-resize.md`) |
| a split holding only another split is removed | kept | each costs a move key press; they only matter with `focus parent` and tabbed/stacked, both out (`docs/spec-nested-boxes.md`) |
| a window KWin activates on a hidden workspace (a window rule, a session restore, a link opened in a running browser) switches its monitor to that workspace; kwin-i3 follows | the workspace is marked urgent, never switched to | KWin's activation policy; won't-fix (Paul, 2026-10-25; i3 feature map, finding 6, rows C4, C67) |

**Window modes** (Paul, 2026-10-24, `docs/spec-window-modes.md`): a window is tiled (the
tree places it) or floating (you place it; the user's own decoration, as a Plasma window), and a
workspace can open new windows floating; a third kind places itself (the ignore lists). The words
are `docs/spec-window-words.md` (2026-10-27). It passes the test below: who arranges a window, i3's tree or Plasma, is the seam
itself, and only kwin-i3 can decide it.

**The test for anything new:** if Plasma already does it, kwin-i3 doesn't. A feature belongs
here only if it is part of how i3 arranges windows and Plasma can't do it. A setting belongs here
only if a user would reasonably want it different, not because a constant exists.

**The plugins are optional** (Paul, 2026-10-24: "if you want to really lock in that i3 feel
completely, but it works fine without them"). The script alone is the product and is tested
alone (every scenario not marked `# needs: plugin` runs with no plugin and Breeze, `tests/live/run.sh`); the frame, frame focus and
the hold effect are extras that cost a rebuild after every Plasma update.

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
   the user untiled the window; `docs/behaviour.md` §3 and §10 say what happens.
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
9. **Workspaces are KWin's virtual desktops** (`src/workspaces.js`, begun as i3ws's code): desktop N
   is workspace N, made on demand and never removed; a workspace lives on one monitor, kept by name;
   assignment, login numbering, the pointer following focus across monitors. What it does:
   `docs/behaviour.md` §4.
10. **When a monitor goes away, its workspaces move to a remaining monitor and go back when it
    returns**. Not quite i3: i3 4.24 moves back only workspaces assigned to that output
    (`workspace N output X`, its `randr.c`); kwin-i3 moves back every workspace that lived there, on
    purpose (i3 feature map, row C74, 2026-10-25). The model keeps each workspace's home output; reconcile re-tiles everything
    once the screens settle. Windows KWin moves on its own during a hotplug are ignored: the model,
    not KWin's move, says where they belong. (Verified: a window KWin moves to another monitor loses
    its tile and is switched to the desktop that monitor shows.)

## Repo layout

`docs/behaviour.md` §1: the script (`src/`, built into `package/`), the two plugins (`plugin/`),
the settings page (`kcm/`) and the widget (`widget/`); tests in `tests/unit`, `tests/live`,
`tests/fuzz`; tools in `tools/`.

## Behaviour (the spec is Paul's old i3 config, git `d3de958^` in `~/.dotfiles`)

| keys | i3 | notes |
|---|---|---|
| Meta+1…0 | workspace N | on its own monitor (decision 9) |
| Meta+Shift+1…0 (and the symbols) | move container to workspace N | lands after the focus there; a hidden workspace is fine (KWin places it when shown, verified) |
| Meta+arrows, Meta+J/K/L/; | focus dir | **i3's tree-based focus**, across monitors at the edge (i3 picks the most recently focused leaf of the neighbouring branch, not the geometrically nearest) |
| Meta+Shift+ same | move dir | i3 `tree_move`, all cases incl. `ws_force_orientation`; at the workspace edge, to the visible workspace of the neighbouring monitor (i3ws's `screenToward`), landing on the side it came from |
| Meta+H / Meta+V | split h / split v | new |
| Meta+E | layout toggle split | new |
| Meta+Shift+Space | floating toggle | new (Paul: yes, 2026-10-21) |
| Meta+Space | focus mode_toggle | new (Paul: yes, 2026-10-21) |
| Meta+Ctrl+arrows, Meta+Ctrl+J/K/L/; | resize | **not a mode**: a script cannot register keys that exist only inside a mode, so i3's Meta+R mode is not buildable (review S3-9). Steps of `resizeStep`, default 10 % as in the old config |
| Meta+F | fullscreen | kwin-i3's key, running KWin's own action (since 2026-10-24; `docs/spec-own-keys.md`); the window returns to its tile (verified). As in i3 (per-output fullscreen; the mouse is not blocked): `docs/behaviour.md` §5, §10 |
| Meta+Shift+Q | kill | kwin-i3's key, running KWin's own action (since 2026-10-24) |
| Meta+Ctrl+Shift+Q | **release** | safety valve: every window out of its tile, the tiles kwin-i3 touched reset to the full screen, nothing more until a reload (`docs/behaviour.md` §12) |

**Left out, Paul's decisions (2026-10-21):** tabbed and stacked ("I don't use tabbed"),
`focus parent` ("never used this"), urgent windows (i3 showed them in its bar; there is no bar here).
Also left out: i3's restart/exit keys (exit is Plasma's own). i3's reload is in since
2026-10-24: Meta+Shift+C re-reads the settings (`docs/spec-settings.md`).

## Policies the adapter applies

Moved to `docs/behaviour.md` (2026-10-27), which says what the code does: classification (§3),
the tiles, gaps and minimum sizes (§6), maximize, minimize, fullscreen and the known limits (§10).
The table that was here had drifted from the code (git history, before this line).

### Focus (written down 2026-10-26; the rules decided 2026-10-27, `OPEN.md` item 40)

**Focus follows i3** (Paul, 2026-10-27, from a capture where a modal dialog took its parent to
the other monitor): every window is one of i3's kinds, by i3's names (`behaviour.md` §3), and
every way focus changes is a row of `behaviour.md` §5 set against i3. That table is the home of
the rules; this is the why.

- **Why i3's rules, not exceptions**: the earlier rules asked "does kwin-i3 manage it?" and grew
  an exception for each answer; "places itself" held kinds i3 keeps apart. Asked "which of i3's
  kinds is it?", each row has i3's answer.
- **Why the pointer matters**: in i3 the focused monitor, the pointer's and (here) KWin's active
  monitor, where new windows open, are one. Crossing onto a monitor focuses it (B2), and focus
  moving to another monitor brings the pointer (A2); the rest follows.
- **Where it stays different**, each with its reason in its row: an activation switching a
  hidden workspace's monitor (C4, KWin's one policy); a monitor change keeping the focus (D5);
  Show Desktop, popup grace, and the floating-only keys being Plasma's (+ rows).
- **The shape in code** (`src/kwin.js` "---- focus"): the model owns focus (`src/tree.js`,
  `activate`/`focusUp`); KWin's activations come in at one handler; `applyFocus` sends it out
  after every pass, so a pointer warp lands on settled windows; handing focus back to a
  fullscreen window is the one activation that can't wait for a pass.

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
   Reconcile, the tile-event protocol, start-up from live tiles, rules,
   min sizes, the policies above, the release action. Live tests drive keys with `invokeShortcut`
   and read geometry back; the invariant check runs after each step.
3. **Workspaces and monitors. Done 2026-10-22** (`src/workspaces.js`; live scenario
   40-monitors with a real unplug/replug through `kscreen-doctor`; battery: 26 faults, all caught,
   3 min). `src/workspaces.js` from i3ws, cross-monitor focus and move,
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
   checklist is from the live-desktop review (`code-review-live-2026-10-22.md` (git history: `git show 3d98bd2:docs/code-review-live-2026-10-22.md`)):
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
- **Apps not met yet** (what Krohnkite handled: Steam, Minecraft, Electron apps that re-parent,
  apps opening several windows at once). Each one met becomes a live test with the test client.
- **Input** is tested through libei in the headless KWin (`tools/inject.py`; scenarios 50, 51, 52,
  86); what it can't send (scroll) is listed in `LATER.md` items 10 and 11.
- **kwinrc churn**: KWin rewrites `[Tiling]` on every tile change. Harmless; kwinrc is not captured.
