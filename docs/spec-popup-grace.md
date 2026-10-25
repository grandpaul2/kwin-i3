# Spec: panel popups forgive a stray pointer (OPEN.md item 11, the floating panel's gap)

Paul's go 2026-10-25; built the same day (`plugin/popupgrace.cpp`, `tests/live/71-popup-grace.sh`,
the stand-in `tools/popupclient.py`: the X11 route worked, probed first).

Paul, the same day: the popups closing is a design problem, not the bug: they should forgive a pointer that strays for a second or so, without delaying every
other focus change. Grace: **1.5 s**.

## The cause (KWin 6.7.5, read 2026-10-25)

- With a floating panel, Plasma floats its popups too (`floatingApplets`, plasma-workspace
  `shell/panelview.cpp:420`): a gap between the panel and the popup.
- Crossing it, the pointer passes over the window under the gap (a tiled one). With focus follows
  mouse, `Window::pointerEnterEvent` (`src/window.cpp:2838`) calls `requestDelayFocus` for it;
  with `DelayFocusInterval` 0 that is at once, the popup loses focus, and Plasma closes it. The
  desktop itself is never focused this way (`isDesktop()` returns early).
- KDE bug 511162: RESOLVED INVALID ("you'll have to change one of them"). The global delay was
  tried (150 ms, until 2026-10-23) and dropped: it slowed every focus change for this one case.

## The change

`kwini3helper` (plugin/, a new `popupgrace.{h,cpp}`), using KWin's own delay only while a panel
popup has the focus:

- **On `Workspace::windowActivated`**: when the active window is a panel popup
  (`Window::isAppletPopup()`), `options->setDelayFocusInterval(1500)`. When it is anything else,
  the user's own value again.
- **The user's own value** is read from kwinrc `[Windows] DelayFocusInterval` (default 0) each
  time it is restored, so a change in System Settings is never lost; KWin's reconfigure rereads it
  anyway.
- **What it gives**: a pointer crossing the gap or resting on a window for under 1.5 s doesn't
  take the focus; back on the popup, the popup is the pending focus again, and the popup stays.
  A click on a window, Escape, or the panel button still close it at once (activation by click
  doesn't wait for the delay). Every focus change with no popup open stays instant.
- **Plugin unloaded** (`make plugin-install` replacing it, or released): the user's value is put
  back in the destructor.
- **A setting?** No, for now: a constant, `1500`, named in the code. One can follow if anyone
  wants another value.

Without the plugins nothing changes: KWin's stock behaviour, and the floating panel's gap as
today (README: turn off the panel's floating, or install the plugins).

## Tests

The test KWins have no Plasma panel, so a **stand-in popup**: a test window KWin classes as an
applet popup. First a probe of the cheapest route: an X11 window (the harness's Xwayland, `# needs:
xwayland`) with `_NET_WM_WINDOW_TYPE` `_KDE_NET_WM_WINDOW_TYPE_APPLET_POPUP`, checked with
`isAppletPopup` through the scripting API; if KWin doesn't class it so, a Wayland client setting
the Plasma surface role (`org_kde_plasma_surface.set_role(applet_popup)`), as plasmashell does.

Live, with focus follows mouse and the plugin (`tests/live/71-popup-grace.sh`, `# needs: plugin`):

- the stand-in active: the pointer moves onto a tiled window; after 0.5 s the stand-in still has
  the focus; back onto the stand-in within 1.5 s: still the stand-in's, and the window never
  took it;
- left on the window: it takes the focus after about 1.5 s (between 1.3 and 2.5 s);
- the stand-in closed: the pointer onto a window focuses it at once (under 0.3 s): the user's 0
  is back;
- a click on a window while the stand-in is active: focus at once;
- the plugin unloaded with the stand-in active: `DelayFocusInterval` is the user's value.

Watched red first: the scenario before the code (focus moves at once), then faults (never raised;
never restored).

**A trap the tests met** (KWin's, not this change's): a window that appears under a pointer that
doesn't move isn't counted as under it. KWin keeps the pointer on the window it last entered, so
the next move inside the old window's area is no move at all. The scenario moves the pointer once
inside a new window before it measures. Watched red: grace never raised (step 2 and the timing
fail), never restored, not restored on unload.

