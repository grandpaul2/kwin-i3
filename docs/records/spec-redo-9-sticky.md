# Spec: redo stage 9, sticky floating (OPEN.md item 40)

**Now (2026-10-28):** Built on branch `redo-9` (on `redo-8`) as designed. A: `classify` gives
the kind `sticky` (floating, `con.sticky`), adopted onto the workspace its output shows. B: the
model's `pushSticky` is i3's `output_push_sticky_windows` for one output (`moveToWorkspace` with
i3's `ignore_focus` unless the con was the focus before the switch), called from `gotoWorkspace`,
the outside switch (`shownOutside`), the outputs' change, a move and `makeSticky`; `relocate`
only sets a sticky window's output. C: `desktopsChanged` makes a window sticky (floated if tiling)
or takes the flag off; Floating Toggle on a sticky window puts it on its workspace's desktop
first (`unstick`). D as designed. Sticky Toggle: in `UNBOUND` and `commands.json`. **The
unknown, settled**: Yakuake on Wayland hides with `QWidget::hide`, which Qt does by dropping the
surface's role and unmapping it (`QWaylandWindow::setVisible(false)`: `resetSurfaceRole`, a null
buffer and a commit; Qt 6.9), so KWin sees a close and each show is a new window: stage 1's C at
each show, C7's close focus when it hides; no code of its own. **Found on the way**: 62 (plasma windows) expected the floating frame in the old
floating colour; stage 7 did not run it (updated: the focused class). And in 40, back on a
workspace after a window was taken off all desktops, KWin's own desktop-switch activation picks
that window (`window.cpp` `setDesktops` puts it first in KWin's focus chain), which the model
follows as for any such activation; the check allows it.

**The rows**: `behaviour.md` §3 R3, X4 (and R13's all-desktops half), §10 V10, and §3's kind for
Yakuake, all decided (Paul, 2026-10-27): a window on all virtual desktops is i3's **sticky
floating**, in the tree. Last of the behaviour stages, as agreed: it touches every workspace
switch.

## What happens today, from the sources

**kwin-i3**: a window on all virtual desktops is kept out of the tree (`rules.js`: `onAllDesktops`
→ ignore), and one that becomes so leaves the model (`dropWindow`, "made sticky"), except while
kwin-i3's own `relocate` makes a window sticky for a move across outputs (the `placing` guard).
Yakuake is kept out twice over (class `yakuake`, role `quake`). Not in the focus history: when
Yakuake hides, KWin picks the next focus.

**i3 4.24**: a window asking for all desktops (`_NET_WM_DESKTOP` all, at manage or later by a
client message) is **floated and made sticky** (`manage.c:486-490`, `handlers.c:887-897`). A sticky
floating window stays on its output and **moves to whichever workspace that output shows**
(`output_push_sticky_windows`, `output.c:83-120`), called after every `workspace_show`, a new
window, a move and the `sticky` command. If it had the focus it keeps it (the focused workspace
being the new one); otherwise it joins the new workspace without the focus. A sticky window made
tiling keeps its flag but isn't pushed (only floating cons are). `sticky enable | disable |
toggle` is a command, unbound in the shipped config.

**KWin 6.7.5**: a window on all virtual desktops is drawn on its output whatever virtual desktop
that output shows (per-output desktops), so KWin already shows it where i3 would; a custom tile
belongs to one virtual desktop's root.

## Design

### A. The kind (R3, Yakuake)

`classify` (stage 3's A5): on all virtual desktops → **sticky** (floating, `con.sticky` in the
model). Adopted onto the visible workspace of its output, floating, with the focus by stage 1's C.
Yakuake comes in this way: stage 3 has already dropped its class and role from the ignore lists.

### B. Following the workspace shown (i3's push)

After every change of what an output shows (kwin-i3's `showOn`, stage 1's outside switches, stage
4's output changes) and after a move or a new window, the model moves each sticky floating con on
that output's workspaces to its visible one, **in the model only**: KWin already shows it there,
so no virtual desktop is set (the reconcile's `relocate` and wrong-desktop check skip sticky
windows). Focus as i3: a focused sticky window keeps the focus on the new workspace; another
joins its floating list without it.

### C. Becoming sticky, or not (X4, V10)

- A window in the tree put on all virtual desktops (the window menu's "On All Desktops", a
  client, a KWin rule): floated if tiling, marked sticky, pushed (B). kwin-i3's own `relocate`
  moment stays excluded (the `placing` guard, as now).
- A sticky window taken off all virtual desktops (onto one): no longer sticky; it stays on the
  workspace of that virtual desktop, floating (i3's `_NET_WM_DESKTOP` index: moved there). Not on
  exactly one (two or more, not all): R13 as today.
- **Made tiling** (Meta+Shift+Space on a sticky window): kwin-i3 takes it off all virtual
  desktops, onto its workspace's, then tiles it. ≠ i3, which keeps the flag while it's tiled:
  KWin's tiles belong to one virtual desktop's root, so a window on all of them can't be in one.
  Written into §3's X rows as kept, with that reason.

### D. Moves

Meta+Shift+N on a sticky window: as i3, it moves to N (still sticky); the next push brings it back
to its output's visible workspace, so on its own output it stays where you see it, and to another
output's workspace it goes to that output. Sticky across outputs: it follows its own output only.

## Unknown, settled before building

**How Yakuake hides.** If it closes and reopens its window (a new id each time), each show is a
new window (stage 1's C, then C7's close focus when it hides); if it only hides it (minimize or an
unmapped surface), stage 6's minimize rules apply. Yakuake isn't installed on Paul's machine (found 2026-10-28), so this is
for other users: read from Yakuake's source before building (how its window hides).

## Tests

- **Run**: `make unit`; 20 (rules: its all-desktops case changes), 43 (hidden moves: `relocate`'s
  own sticky moment), 62, 63, 40, 41.
- **New checks, approved (Paul, 2026-10-28)**: in 20 or 40, a window put on all desktops floats and follows
  Meta+N on its output with the focus; one taken off all desktops stays on the shown workspace;
  tiling a sticky window takes it off all desktops.
- **Unit, approved (Paul, 2026-10-28)**: the push in `tests/unit/tree.test.js` (a sticky con moved to the
  visible workspace, focus kept only if it had it).

## Paul's calls (2026-10-28)

37. **Sticky Toggle**: yes, an unbound action, as i3's `sticky toggle`: it sets KWin's "on all
    desktops" flag (and floats a tiling window), and C does the rest. In `kcm/ui/commands.json`.

## Live check (Paul)

Yakuake: F12 shows it on the focused monitor, typing goes to it; Meta+2 there keeps it in view
and focused; F12 hides it and focus goes back to the window before. A window set "On All
Desktops" from its menu floats and follows workspace switches on its monitor.

## Done when

Live and Paul's "it works": R3, R13, X4, V10 and §3's Yakuake row rewritten as built; C's kept
difference written into §3.

## Paul's review (2026-10-28)

As specced.
