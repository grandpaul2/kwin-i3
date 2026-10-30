# Spec: redo stage 8, `popup_during_fullscreen` (OPEN.md item 40)

**Now (2026-10-28):** Built on branch `redo-8` (on `redo-7`) as designed: `popupDuringFullscreen`
read in `keepsFullscreenFocus` (with the newcomer's kind for `all`; `leave_fullscreen` sets the
fullscreen window's `fullScreen` false, its `fullScreenChanged` clearing the tree's flag), the
cog's form has it, the settings page gets it with stage 10. 32's new checks: four values, each
with another window's dialog and the fullscreen window's own. **Found**: under `ignore` the
fullscreen window's own modal dialog takes the focus all the same: KWin activates a window's
modal dialog in its place (`activation.cpp:373`, `findModal`, read for 6.7.5); kept as ≠ in C5
and V6 (i3 has no modal dialogs; a non-modal transient behaves as i3's). And under `leave_fullscreen`, once the fullscreen has ended, a GTK dialog's own
activation request (xdg-activation, sent as GTK presents it) is honoured by KWin (`mayActivate`,
`allowWindowActivation`: nothing fullscreen protects the focus any more), as i3's default
`focus_on_window_activation smart` would honour a `_NET_ACTIVE_WINDOW` on the visible workspace:
the dialog ends up focused after kwin-i3's hand-back. 32 expects that.

**The row**: `behaviour.md` §10 V6 (i3's setting, default `smart`), decided (Paul, 2026-10-28).
Stage 1 makes `smart` exact (§5 C5); this stage adds the other three values.

## What happens today, from the sources

**kwin-i3**: `keepsFullscreenFocus` (`src/kwin.js`) hands the focus straight back to the
workspace's fullscreen window when a new window opens there, except for a transient or a window
opening fullscreen itself; after stage 1, only for a transient **of the fullscreen window**.
KWin keeps a fullscreen window above the panels only while it is active
(`Window::isActiveFullScreen`), so whichever window has the focus is the one you see.

**i3 4.24** (`manage.c:424-528`), with a fullscreen window on the new window's workspace:

- the new window never takes the focus (`fs != NULL, not focusing`), except:
- **`smart`**: a transient **of the fullscreen window** does: `con_find_transient_for_window`
  follows `transient_for` only; the group leader test only gates the branch (`manage.c:487-489`;
  wording corrected at the review of 2026-10-28, the code was right);
- **`leave_fullscreen`**: any such transient **ends the fullscreen** (`con_disable_fullscreen`,
  `:502-503`); nothing sets the focus, so it opens without it;
- **`all`**: any window that floats (`want_floating`: dialogs, transients, fixed sizes, `for_window`
  floats) takes the focus;
- **`ignore`**: nothing more;
- and in every case a window that opens fullscreen itself takes the workspace's fullscreen over
  (`con_toggle_fullscreen`).

## Design

`popupDuringFullscreen` (`smart` default, `ignore`, `leave_fullscreen`, `all`), read in
`keepsFullscreenFocus`, for a window just adopted onto a workspace with a fullscreen window
(stage 1's C):

| value | the newcomer takes the focus | otherwise |
|---|---|---|
| `smart` | if its `transientFor` chain reaches the fullscreen window | focus handed back |
| `ignore` | never | focus handed back |
| `leave_fullscreen` | never; but a transient (any parent) ends the fullscreen window's fullscreen (`setFullScreen(false)`, the tree's flag with it), so it shows | focus handed back |
| `all` | if it is floating (stage 3's kinds) | focus handed back |

Opening fullscreen itself: it takes over, whatever the value (as today). "A transient" is KWin's
`transient` (which includes X11 group transients, as i3's leader test).

## Tests

- **Run**: `make unit`; 32 (fullscreen open), 46 (replug fullscreen), 25 (settings).
- **New checks, approved (Paul, 2026-10-28)**: in 32, one case per value with a dialog of another window and a
  dialog of the fullscreen one (four values, two newcomers each); about 10 s.

## Live check (Paul)

Firefox fullscreen, a Prism dialog appears: with `smart` it stays behind (Firefox keeps the
focus); Firefox's own download dialog shows over it.

## Done when

Live and Paul's "it works": V6 and §5 C5 rewritten as built; §11 gains `popupDuringFullscreen`,
and N9 says its four values.

## Paul's review (2026-10-28)

As specced.
