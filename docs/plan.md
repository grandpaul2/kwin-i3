# kwin-i3 — plan

The scope, what is left out, the reasons a difference from i3 may have, and the standing
decisions. The history (the phases, the switch-over checklist, the first plan inside Krohnkite) is
in git: `git show f3fa510:docs/plan.md`.

## Goal

i3's window management inside a stock Plasma Wayland session: windows are entities in a tree that
move among each other, not contents moved between fixed divisions. One KWin script and two KWin
plugins, behaving as i3 does wherever KWin lets them (`docs/philosophy.md`).

## Scope

kwin-i3 gives Plasma i3's feel and basic window management, and leaves the rest to Plasma. It is
not i3 on KWin: the more of i3 it takes on, the more of it duplicates Plasma. The work now is
making what is here **configurable and reliable**, on any machine and setup (`OPEN.md`), not adding more of i3.

**Supported:** Plasma and KWin 6.7 or later, in a Wayland session (per-output desktops and
`Tile.manage` are 6.7's). Xwayland apps are in, first-class: they are
common. How the plugins reach a beta user: `LATER.md` item 51; what kwin-i3 does on an older
Plasma, and the plugins in a release: `LATER.md`, "Release prep".

**i3 means the 4.24 release** (its tag `4.24`: `https://raw.githubusercontent.com/i3/i3/4.24/src/<file>.c`,
`etc/config.keycodes` for the keys), the version an i3 user meets in their distribution. Its `next`
branch differs in places (a drag ends only on its own button's release there): a citation of
`next` is checked against 4.24 before it decides anything.

**The test for anything new**, in this order:
1. **In the "In" list below: i3's**, as i3 does it, even where Plasma has something similar
   (`assign` though KWin has Window Rules, Exit though Plasma has logout).
2. **Anything else of i3's is out** unless the maintainer adds it to "In"; "not more of i3" means this list
   does not grow by itself.
3. **Not i3's at all** (a widget, a notification, a tool): in only if it shows or serves
   something of the "In" list that Plasma's own can't. The workspace widget is in because Plasma's
   pager can't show per-output workspaces; the hold, because KWin's tile moves would otherwise show
   torn layouts; an OSD or an animation Plasma already has is out.

**In:** i3's tree, with its focus (`focus parent` and `focus child` too), move, split, tabbed and stacked layouts
with their bar, layout toggle and resize (by key, its resize mode,
and by mouse); workspaces that live on an output, with i3's workspace output and `assign`;
floating (a window, or a container floated whole), sticky floating and the focus mode toggle;
i3's keys (`docs/behaviour.md` §8); the frame, gaps and the split indicator; i3's mouse ("The
mouse", below: the tiling drag, the resize, the floating move); i3's window kinds and its `for_window`
floating rules (`docs/definitions.md`); i3's settings for all of these (below). With them, i3's
commands that reach a state or a place no bound key reaches, left unbound as i3 leaves them
(workspace back and forth, next and previous, outputs, Sticky Toggle, the forms with no back and
forth: `behaviour.md` §4 and §8): a user who wants one binds it. Around them,
kwin-i3's own: the settings page, the workspace widget, the capture key
and the release key. What each does, exactly: `docs/behaviour.md`.

**Out, with the reason:**

| left out | why |
|---|---|
| urgency | it was shown in i3's bar, and there is no bar |
| marks, the scratchpad, i3's restart | outside the core of i3's feel that kwin-i3 copies (the scratchpad is an open question for a release, `LATER.md` item 51); restart is for a new i3 binary, and an install reloads kwin-i3 |
| i3's explicit forms of a bound command (`focus next sibling`, `focus tiling`, `layout splith`, `split toggle`, `floating enable`) | the bound toggles already reach every state they set; a command reaching a state or place no bound key reaches is in (above) |
| a bar, notifications, lock, session control | Plasma's panel, notifications, screen locker and logout (kwin-i3's Exit key leaves Plasma's way, as `endSession` says) |
| i3's config file, `i3-msg` IPC and a command language (`bindsym`, `mode`, chains) | settings belong in System Settings (and `kwinrc`); a key's action takes no arguments, `mode` or chain (a setting may still shape what an action does, as `resizeStep` does for resize). No scripting surface is promised during the Stage (`LATER.md`, "Release prep") |
| workspace names, and workspaces past 10 | decision 9 |
| fullscreen's global mode (`fullscreen global`) | KWin's fullscreen is per output; one window across all outputs isn't something its tiles or fullscreen can hold (reason (a)) |
| an X11 session | Plasma's direction is Wayland, and the plugins are Wayland-only |
| the launch workspace (i3's `startup_ws`, `manage.c:336`: a window opens where it was launched, for programs i3 started with startup notification) | a window opens on the workspace focused when it appears (`behaviour.md` C1, reason (d)); for programs a launcher, Steam or a game client starts, i3 did the same. A maybe for the release, kwin-i3's own Terminal key first: `LATER.md`, item 28 |
| mouse chords beyond i3's, but for the float modifier; i3's swap modifier (`tiling_drag swap_modifier`) | i3's own mouse is in instead ("The mouse", below), with Shift as the float modifier; the centre's Swap band (`behaviour.md` G11) swaps at every centre drop, so a swap modifier would add nothing |

**The reasons a difference from i3 may have** (each ≠ row in `docs/behaviour.md` names one):
- **(a) KWin or Wayland can't do i3's**: KWin tells a script no activation's source, a Wayland
  client can't be drawn below its minimum size, KWin's tiles can't hold a window that won't resize.
- **(b) The look**: an i3 element (the frame, gaps, the indicator) drawn to sit in a Plasma
  desktop, where it costs no performance (`docs/philosophy.md`, "How it presents itself").
- **(c) The feel in use**: the verdict on the live desktop, after push back
  (`docs/philosophy.md`, "How a decision is made"), recorded as "judged live".
- **(d) Out of scope**: the "Out" list above, or what rests on it.
- **(e) A Plasma setting kwin-i3 can't win at runtime is the user's**: kwin-i3 makes i3's
  behaviour so at runtime over any Plasma setting that also covers it, leaving the setting as it
  is (`docs/philosophy.md`, "The line between i3 and Plasma"): focus follows mouse over KWin's
  focus policy, a new window's focus over focus stealing prevention, the tree over screen-edge
  tiling, i3's modifier drag that focuses over the window actions' left-drag action (the
  modifier stays the user's, as i3's `floating_modifier`), all through KWin's live options, which a reconfigure resets and kwin-i3 sets again
  (`docs/kwin-notes.md`, "Config and D-Bus"); kwin-i3's keys over Plasma's shortcuts and Meta+T
  over the tile editor, through the helper's key filter. Where it can't win at runtime
  (per-output desktops; window animations, the look, reason (b)), Plasma's setting stands in for i3's, and kwin-i3 changes it only
  as "Install and first run" (below) allows: named, asked, saved first, given back.
- **(f) i3's result comes from a defect in its code, not from a rule**: an unsigned value that
  wraps, a size never set, a path that breaks an invariant i3's own code enforces elsewhere (both
  places cited). The ≠ row cites the defect's file:line and follows what i3's code evidently intends; copying the defect
  would give a glitch, not i3's feel.
- **(g) Plasma's minimize and restore are the user's**: i3 rejects a minimize (`handlers.c:849-858`),
  but a task manager button that snaps back is a fault a Plasma user can't undo without knowing
  i3 (`docs/philosophy.md`, "Who it is for"). It covers an action that takes a window out of the
  layout while its place stays in the tree; one that places, sizes, stacks or changes a window's
  kind is not covered, and a new way to hide a window argues its own case.

Not reasons: "minor", "simpler", "someone's old config", "it was already built that way". A row
whose only reason is one of these goes back to i3's, or finds a real reason. **The list of
differences is `docs/behaviour.md`'s ≠ rows**; there is no second copy here.

**Settings:** each i3 directive inside the scope gets a setting, named for i3's (`behaviour.md`
§11, the N rows); kwin-i3's own machinery gets one only where a user would reasonably want it
different. Internal values (timeouts, debug switches) live in `kwinrc`, never on the settings
page. Rule fields (`for_window`, `assign`, `workspace … gaps`) take i3's syntax, for
i3 users (`docs/philosophy.md`, "Who it is for").

**Keys and Plasma's shortcuts:** kwin-i3's default keys are i3's (`behaviour.md` §8). A key
another Plasma component also holds runs kwin-i3's command, as i3 grabs its own keys, and **no
other shortcut is changed**: the helper catches kwin-i3's keys ahead of Plasma's shortcuts
(`behaviour.md` §8, "Shared keys"), and Meta+T likewise ahead of Plasma's tile editor. The user
can turn the override off, "On a key conflict, kwin-i3's key wins". kwin-i3 never takes a key
from another shortcut.

**Popup grace** (the helper) is kwin-i3's own, for the Plasma audience: with focus follows
mouse, crossing the gap between a floating panel and its popup would focus the window beneath
and close the popup (KDE bug 511162), so the helper lengthens KWin's focus delay while a popup is
up and puts kwin-i3's value back (none); it changes no saved setting (reason (e); `behaviour.md` F10).

**Plasma's window actions** on a window in the tree, on a desktop kwin-i3 has placed (one it
never placed keeps KWin's tiles, `behaviour.md` Y4), follow i3's handling of requests from outside
its model (`handlers.c:675-991`):
- one i3 translates into the tree is translated as i3 does: fullscreen (V1), a desktop (V9), all
  desktops (V10);
- one that would place, size or change the kind of a tiling window is refused, as i3 ignores
  those (`:722-723`, `:936`): maximize, a quick tile by key and Move to Screen are put back (V11), Meta+T's editor
  overwritten (decision 7; V8, V12), a move KWin starts cancelled by the helper (X5), floating
  only without it; Keep Above and Keep Below are kwin-i3's on its windows (L12);
- minimize takes the window out of the layout, its place kept (V7, reason (g));
- a floating window's own actions are KWin's ("The mouse", F1);
- Show Desktop changes nothing in the tree: the hidden tiles are only not hit (B2, F8b).

Not covered yet, each its own item or row: activities (R15, `LATER.md` "Reliability"), a user's
Keep Above on a floating window (`LATER.md` item 27), and KWin's window rules, No Border and shade
(`LATER.md` item 105).

## The mouse

i3 4.24's `route_click` (`click.c:169-362`) is the model, step by step; `docs/behaviour.md` §9
has a row for each case. Where the line runs between kwin-i3 and Plasma:

- **Shift is the float modifier**, beyond i3, reason (c), judged live. In i3 only a command or a
  rule floats or tiles a window (`floating toggle`, `for_window`): a tiling drag never starts from
  anything floating (`click.c:251`, `!floatingcon`), a drop never floats, and a client's own
  request to move a tiling window is ignored (`handlers.c:936`). Here Meta+Shift+drag does with the
  mouse what Meta+Shift+Space does with the keys, on what the press is in: a tiling window floats
  where it is dropped (KWin's move, which the helper starts; `behaviour.md` G5); a container
  selected with focus parent, pressed on one of its windows, floats whole where its outline is
  dropped (G16); and a floating window, or a container floated whole, is dragged as a tiling one
  and tiled where it is dropped (G13). Plain Meta+drag stays i3's, the pressed window. **One
  exception, judged live**: in a container floated whole, the drag takes the whole container
  (it tiles it whole, as a Meta drag moves it whole, F1a), while Meta+Shift+Space on one of its
  windows floats that window out alone (T16, i3's `floating_enable` of the focused window). The reason: with Meta
  and Shift the mouse alone moves, swaps, groups, floats and tiles, a large gain in reach for an
  audience whose common tool is the mouse, at no loss: i3's swap modifier, the only meaning Shift
  had, is what the centre's Swap band does at every drop. Meta+Shift+Space stays the key between
  them, and no other press changes a window's kind: a client's own move request on a tiling
  window is refused, as in i3. KWin's window actions fire only on their exact modifier (6.7.5
  `input.cpp:1299`), so these presses are the helper's to take.
- **kwin-i3 takes every press on the tree**: tiling windows, a group's bar and its tabs, and
  floating containers, each as i3 routes it. Meta+left is a tiling drag of the pressed container
  at once, without focusing it (step 2): on a tab, that tab's container, a split tab whole
  (`click.c:432-437`). A left press on a title bar or a tab focuses (step 3, the tab rules), then
  drags past the drag distance (step 8). Meta+right and a press on a border resize against the
  neighbour (steps 9, 10); on a group's bar, a right press resizes against the neighbour above, the
  bar being kwin-i3's, not KWin's title bar.
- **The gaps are kwin-i3's handles**: a press in a gap, or Meta+right there, resizes against the
  nearest tiling window (`behaviour.md` Z2, Z3b), where i3's gap is the root window and a press
  focuses the output (`click.c:398-415`): reason (c), judged live. Its own strips cover the gaps
  so no app's invisible resize band takes them (Z9), as i3's frames clip every client.
- **One floating window is KWin's**: KWin's window actions move and resize it (Meta+left,
  Meta+right, the title bar, the edges), which is i3's floating modifier for one window, with
  Plasma's title bar and window menu (reason (e): the window actions are Plasma's settings, their
  left drag's action kwin-i3's while it runs). The differences are `behaviour.md` F1's.
- **A split or a group floated whole is kwin-i3's** (i3's floating container holding more than
  one window, `floating.c:291`; `docs/definitions.md`): its windows are KWin floating windows
  whose frames kwin-i3 lays out as a tiled tree inside the container's rect, in the tiling look
  (`behaviour.md` L10a: i3's windows inside keep their tiling border). A press anywhere in
  it focuses and raises the whole container (step 3, `con_raise`); Meta+left moves it whole
  (step 5); a left press on a title bar or tab inside it first resizes against the neighbour
  above, and moves it whole only where there is none (steps 6, 7); Meta+right, or its outer edge,
  resizes it whole (step 6); a border between two of its windows is a tiling resize inside it.
  The helper takes all of these, title bars and edges included, ahead of KWin, as KWin moves and
  resizes one window, never several as one (reason (a)). Floating Toggle on a window inside it
  floats that window alone (`floating_enable`: only the container's child carries the floating
  flag); on the container, it tiles it whole (`floating_disable`). Without the helper, floating a
  container does nothing (logged; the settings page's banner says the plugins are missing), as
  `behaviour.md` K4 and K18; one saved
  floating comes back tiled.
- **A tiling drag drops onto tiling windows and empty visible workspaces only**
  (`is_tiling_drop_target`), never onto a window inside a floating container. i3's check is meant
  for tiling targets, but `con_is_floating` is true of a floating container's direct child alone,
  so a window deeper in one passes, and whichever window comes first in i3's list of every
  container wins: an accident of i3's code, not a rule, and following it would make a drop change
  a window's kind. Not followed, reason (f), as `behaviour.md` G8.
- **The centre of a drop** is `behaviour.md` G11's three bands (Tabbed, Stacked, Swap; reason
  (c), judged live), whatever is dragged. **i3's swap modifier is out of scope**
  (`tiling_drag.c:341`, read at the press): it would make the whole centre a swap, which the bottom
  band already is, and Shift is the float modifier (above). A floating window or container being
  tiled (G13) has Beside in the bottom band instead: after the target, as i3's centre drop, since
  after tiling a swap would send the target to the tiles' focus.
- **KWin's own tools on the tiles** (quick tile, a screen-edge drag, Meta+T's tile editor, a
  Shift drag into a tile) place a tiling window, so the tree puts it back ("Plasma's window
  actions", above). **A move KWin starts itself** without the helper (Meta+drag, `behaviour.md`
  F9) floats the window, reason (a). A client
  asking to be moved by its own header bar (GTK, Electron) would float a tiling window too, where
  i3 ignores the request (`handlers.c:936`). With the helper, kwin-i3 refuses those on a tiling
  window as i3 does, KWin's Move Window and the window menu's Move with them: KWin runs each as its
  own move before any input filter, and the helper cancels it once started (`behaviour.md` X5).
- **Where it can't match**, each a ≠ row with its reason: a Meta press with nothing to do is
  swallowed, not passed on to the app (G3, G4: KWin's window actions run after the helper and
  would float the window); the drag distance is Plasma's setting, not i3's 15 px (G2); a
  floating container's resize waits on each app, as the hold does; no mouse bindings (F7, reason
  (d)).

**The product is the script and its two plugins** (the plugins lock
in i3's feel; without them the script still runs, with what §1 of `docs/behaviour.md` lists as
lost). The script alone runs the tree, workspaces, keys and floating; a scenario that doesn't
need a plugin runs without one (`# needs: plugin`, `tests/live/run.sh`), which keeps that case
from breaking, not a test chosen for it. The helper adds the
mouse (tiling drag, resize, frame focus), the resize mode, the position keys and the terminal key;
the effect draws the frame and holds layout changes. Without either, the settings page's banner
says what is missing (`behaviour.md` §13). The plugins cost a rebuild after every Plasma update.

## Install and first run

The install is the first thing a new user meets, and the one place kwin-i3 asks to change what
is theirs: a Plasma user stays only if trying it costs nothing they can't get back. i3's model
(4.24): its shipped config starts `i3-config-wizard` once (`etc/config:214`), which says what it
will do, does it only on Enter, quits having changed nothing on Esc
(`i3-config-wizard/main.c:607`), and exits if a config already exists (`:827-831`). kwin-i3
follows it:

- **One command, one log-out, one first-run step.** `make install` does every step that needs no
  choice (the script's link and its enabling, the plugins, the settings page) and is safe to run
  again; the log-out is KWin's, which reads a new script's and plugins' paths only at login; every
  choice waits for the first-run step. Packaging is `LATER.md`'s "Release prep".
- **The first-run step is the settings page**, its banner shown while anything kwin-i3 needs
  differs and opening the tab that holds it. Each Plasma setting on the list (below) is a row on
  the tab it belongs with (per-output desktops on Workspaces, the animations on Window Rules),
  its help saying why, and plainly that it is **Plasma's, not kwin-i3's**. A tick is an edit like
  any setting on the page: its Apply makes it, and nothing changes without it; **Defaults** on
  its tab puts Plasma's back where kwin-i3 changed it, as Defaults on any Plasma page does
  (`docs/philosophy.md`).
  The install's last line points there.
- **The list**: only what kwin-i3 can't win at runtime (reason (e)): the Plasma settings kwin-i3
  needs (per-output desktops, with more than one output); and the optional (window animations set to None, not the global speed; i3 has
  none).
- **What kwin-i3 wins at runtime asks nothing**: focus follows mouse with no delay and the next
  focus under the pointer, a new window's focus, screen-edge tiling and maximizing off, the window
  actions' left drag activating and raising, kwin-i3's keys over the Plasma shortcuts that share them, Meta+T kept from the tile editor. Each is in
  force while kwin-i3 runs and Plasma's own again when it is released or removed; focus follows
  mouse and the key override are settings of kwin-i3's own (i3's `focus_follows_mouse`; the
  override on, as i3 grabs its keys), the others are the tree's.
- **Every change outside kwin-i3's own settings can be undone.** Before kwin-i3 changes a Plasma
  setting, it saves the old value (`~/.local/state/kwin-i3/`). Each one is
  given back alone or all at once, unticked and applied, and all on removal. A give-back writes
  the old value only where the current one is still what kwin-i3 set: a change the user made
  since is theirs, and stays.
- **An upgrade carries no migration** before a public release: state an earlier version left
  (an old setting, a record, a Plasma value it wrote) is not read, converted or given back. The
  beta's users are few and reachable, and a migration is code kept for one upgrade.
- **Removal deletes what the install wrote**: `make uninstall` gives back every saved change, disables the
  script, and deletes everything the install wrote (the script's link, `~/.local/lib/kwin-i3/`,
  KWin's drop-in, the session's environment file), naming each.

## Decisions

1. **One plain-JS KWin script** (`KWin/Script`, `X-Plasma-API: javascript`). No QML: a plain-JS
   script reloads with `unloadScript` + reconfigure in seconds; a QML one needs a logout and can
   leave a stale copy running. Plain JS has everything needed: `registerShortcut`, `callDBus`,
   `QTimer` (registered for scripts in `scripting.cpp`).
2. **Plain JavaScript, no compiler.** `build.sh` concatenates `src/` into the one file KWin loads,
   with a `// ---- src/<file>.js` marker at each file start so KWin's line numbers can be mapped back.
3. **The tree owns structure, focus and shares; KWin's tiles are the display.**
   - The tree is i3's: containers with an orientation, leaves holding windows, i3's focus stack.
     That is what `tree_move`, `tree_flatten` and tree-based focus need, and it can be tested in
     node with no KWin.
   - **It keeps i3's shares (`percent`)**, because i3's rules for them are exact and testable: a
     new window gets the average share, a closed one's share is spread proportionally
     (`con_fix_percent`). Reconcile writes them to the tiles. A size changed *in KWin* (a border
     drag) is read back into the tree once, when the drag ends, not on every
     `relativeGeometryChanged`.
   - Considered and rejected for now: tiles as the only structure. It removes the
     projection, but i3's flatten and move rules would then be written against a structure that
     collapses on its own and can't be tested without a fake. Revisit if the projection proves costly.
4. **One idempotent `reconcile(workspace)`** applies the tree to KWin: compute the wanted tile tree
   and which window goes in which tile, diff against the live tiles, change only what differs.
   Every event handler updates the tree and schedules a reconcile; a zero-interval `QTimer`
   coalesces a burst into one pass. Nothing else writes to tiles.
5. **A reload keeps the tree.** With the plugins, the effect keeps a copy of the tree and gives
   it back whole (`behaviour.md` P3). Without them, start-up reads the live tiles back (structure
   from layout tiles and their directions, focus from `workspace.stackingOrder`); only tiles that
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
   its cases, `tree_flatten` where i3 calls it (after a move that re-parents and after a layout
   change; not after a close or a plain swap), tree-based `focus` (`tree_next`, descend by focus
   stack), insertion after the focused container, `split`, `layout toggle split`, close and
   focus-after-close (`tree_close_internal`), in `src/tree.js`. Flatten removes only the redundant
   shape (`docs/definitions.md`, "flatten"); a split holding one window stays, as in i3. KWin
   collapses those itself; the projection must tolerate that.
   No tidying beyond i3's: a one-child split holding a split stays, as in i3. With `focus parent`
   such a level is one i3 users select and act on (a layout key, a split, a move), and the focus
   can rest on it, so removing it behind the user's back would act on a container they chose.
   **Atomic layout changes**: a KWin effect, `kwini3hold` (plugin/hold.cpp),
   holds the old layout on screen until every moved window has its new frame, as Sway's
   transactions do; i3 on X11 never had the gap.
9. **Workspaces are KWin's virtual desktops** (`src/workspaces.js`): virtual desktop N is
   workspace N, 1 to 10, made on demand and never removed (a virtual desktop past 10, which
   Plasma's Overview can add, is not kwin-i3's: a window opened there goes to the focused
   workspace, as C1, and a switch to it is undone); a workspace lives on one output, kept
   by number; workspace outputs, login numbering, the pointer following focus across outputs
   (`docs/behaviour.md` §4). **≠ i3** (named, unbounded workspaces, an empty one closed when left,
   `workspace.c:526-535`), reason (a): Plasma's pager, Overview and the workspace widget show
   KWin's desktops, which are numbered, and removing one renumbers every desktop after it. The cap
   at 10 is not KWin's (it allows 25) but the keys' reach, i3's default config binding ten: past
   10 is out of scope, reason (d).
10. **Outputs come and go as in i3's `randr.c`** (replacing an earlier "every workspace goes
    back": a remembered output that isn't there was the state behind most
    replug bugs, scenarios 42, 45-48, fuzzer I2):
    - **an output goes away**: its workspaces all move to the first output, the primary first
      (KWin's `workspace.screenOrder`), for good, except an empty one that isn't focused, which i3
      closes and here simply stops having an output (`behaviour.md` W4) (as i3's `randr.c` "Move the content of an outputs container to the
      first output");
    - **an output appears**: it takes the workspaces whose workspace output names it (moving
      them back, the one exception to "for good"); else the lowest-numbered
      workspace whose workspace output names it (i3 takes the first in its config; the setting is
      keyed by number, so the lowest stands in); else the first free number (`randr.c` `init_ws_for_output`, 444-520);
    - **no output left**: as i3, which falls back to one output covering the root window
      (`randr.c:930`); here KWin's placeholder output, until one returns;
    - windows KWin moves on its own during a hotplug are ignored: the tree, not KWin's move, says
      where they belong. (Verified: a window KWin moves to another output loses its tile and is
      switched to the virtual desktop that output shows.)
    A laptop that docks daily shuffles its workspaces as i3 does; the setting that keeps them put is
    the workspace output.

## Repo layout

`docs/behaviour.md` §1: the script (`src/`, built into `package/`), the two plugins (`plugin/`),
the settings page (`kcm/`) and the widget (`widget/`); tests in `tests/unit`, `tests/live`,
`tests/fuzz`; tools in `tools/`.

## Keys

The keys are i3's default config (4.24's `etc/config.keycodes`, `$mod` as Meta), with kwin-i3's
own release key (the capture key is the user's own, bound to `tools/capture`); each one, with how it differs, is `docs/behaviour.md` §8.

**Action names are fixed** (they persist in `kglobalshortcutsrc`, and renaming leaves dead
entries): `kwin-i3 <verb>`, e.g. `kwin-i3 Workspace 1`, `kwin-i3 Move Left`, `kwin-i3 Split V`.

## Focus

**Focus follows i3**: every way focus changes is a row of `behaviour.md` §5 set against i3. That
table is the home of the rules; this is the why.

- **Why i3's rules, not exceptions**: the earlier rules asked "does kwin-i3 manage it?" and grew
  an exception for each answer; "places itself" held kinds i3 keeps apart. Asked "which of i3's
  kinds is it?", each row has i3's answer.
- **Why the pointer matters**: in i3 the focused output, the pointer's and (here) KWin's active
  output, where new windows open, are one. Crossing onto an output focuses it (B2), and focus
  moving to another output brings the pointer (A2); the rest follows.
- **What the user sees follows the tree.** The frame's colours, the split indicator, the resize
  banner and the widget are drawn from the tree's focus, never from KWin's active window. A focus
  change KWin makes on its own (focus follows mouse, a click, Alt+Tab) updates the tree and
  re-tells every one of them, the group bars' colours too, in the same turn.
- **The shape in code** (`src/kwin.js` "---- focus"): the tree owns focus (`src/tree.js`,
  `activate`/`focusUp`); KWin's activations come in at one handler; `applyFocus` sends it out
  after every pass, so a pointer warp lands on settled windows; handing focus back to a
  fullscreen window is the one activation that can't wait for a pass.

## Risks

- **KWin's tile API is young** (`tilingForScreen` deprecated in 6.3, `window.tile =` in 6.7,
  per-output desktops new in 6.7). The live tests run against the installed KWin, so `make test` after
  a `dnf upgrade` says whether it still holds.
- **Effect repaints**: on NVIDIA, a repaint of a region the effect asks for on its own (a timer,
  a fade) can stay stale on screen (2026-10-28, the indicator's fade). The look (the ring, the
  indicator, the banner) is drawn only on repaints that happen anyway; no timer-driven animation.
  The hold's own full repaints, at its release and while it holds, are the layout's, by design.
- **Reconcile churn**: windows jumping or resizing twice. The diff keeps it to what changed; the live
  tests count geometry changes per operation.
- **Apps not met yet** (what Krohnkite handled: Steam, Minecraft, Electron apps that re-parent,
  apps opening several windows at once). Each one met becomes a live test with the test client.
- **Input** is tested through libei in the headless KWin (`tools/inject.py`; scenarios 50, 51, 52,
  86); it can't send scroll.
- **kwinrc churn**: KWin rewrites `[Tiling]` on every tile change. Harmless; kwinrc is not captured.
- **Cost to KWin: measured small, not a risk** (probe 2026-10-30, test KWin with the plugins, not
  kept): loading kwin-i3 adds about 16 MB to KWin (8 MB heap, 4 MB libraries, 4 MB shared buffers),
  flat over windows closed and reopened; idle CPU is KWin's own (the script runs no polling timer);
  a new window's layout takes 2 ms on the desktop, its drawn layout 6.4 ms (capture,
  2026-10-30). The gap strips (about 3 per tiling window, never fewer, `plugin/gapstrips.cpp`)
  are tens of kB each. Performance work is in KWin, its effects and Plasma, not here.
