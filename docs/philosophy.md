# kwin-i3's design philosophy

What kwin-i3 is for, who it is for, and the lines it draws. A decision that goes against this
page changes the page first, with Paul's go. Written 2026-10-27 from Paul's words and the
decisions they rest on; the detail lives in the docs it points to.

## What it is for

**i3's feel inside a full Plasma session.** i3's window tree, its keys, workspaces that live on a
monitor, and the frame, with Plasma doing everything else: hardware, panels, notifications,
settings, the screen locker, the apps that expect a desktop. Not all of i3: the parts that make
it feel like i3, made configurable and reliable (`docs/plan.md`, "Scope").

## Why on Plasma

A window manager that replaces a desktop has to carry the whole desktop: display and input
hardware, multi-monitor, scaling, portals, screen sharing, every update of the stack beneath it.
kwin-i3 carries none of it. KWin and Plasma are among the best-supported projects on Linux;
kwin-i3 rides on them and updates as one script and a few plugins (Paul, 2026-10-27: "Everything
that those other WMs have to do when they update is insane because they are trying to replace a
DE"). Its windows live beside an ordinary Plasma session, with all the support that brings.

## Who it is for

1. **First: tiling window manager users** who want to have their cake and eat it too: i3's way of
   working with a desktop that just works. Many i3 users don't take to Hyprland or niri, and sway
   lacks i3's reach and doesn't work for everyone; with X11 going away, they need somewhere stable
   to land (Paul, 2026-10-27). They know i3's words and keys, and kwin-i3 keeps both.
2. **Second, and still important: Plasma users** who want a full-powered window manager without
   changing much. With what kwin-i3 adds and what Plasma already has, most of the experience is
   reachable with the Meta key and the mouse alone (Paul: "pretty much 90 percent"): Meta+drag to
   rearrange tiles, Meta+right-drag to resize, Meta+Shift+Space between tiled and floating.

What follows from the order: i3's behaviour and words win a tie, and nothing a Plasma user
meets first should need i3 knowledge to undo (a floating window looks like any Plasma window;
the settings page says what each word means).

## The line between i3 and Plasma

- **If Plasma already does it, kwin-i3 doesn't.** A feature belongs here only if it is part of how
  i3 arranges windows and Plasma can't do it; a setting only if a user would reasonably want it
  different (`docs/plan.md`, "Scope", with what is left out and why).
- **The seam is who arranges a window.** Tiled: the tree places it. Floating: you place it.
  Places itself: the app or Plasma does (KRunner, panel popups). Decoration, theme, panels and
  the rest are Plasma's (`docs/spec-window-words.md`, `docs/spec-window-modes.md`).

## How it presents itself

- **kwin-i3 is the window manager**, and says so. Its workspaces, monitors and keyboard focus
  apply to every window. No soft lies ("we won't touch your windows"): a user who meets something
  kwin-i3 does needs a model for why, and the truth is the only one that holds.
- **Every word a user reads is true.** Tiled, floating, places itself; never "leave alone" or
  "unmanaged" (`docs/style-settings-page.md`, §2). Explicit now; plainer later, still true.
- **It looks like Plasma** where Plasma has a convention (the settings page follows KDE's HIG and
  Plasma's own pages), and like i3 where the user is tiling (the frame, the keys).

## How it treats i3

- **Copy i3 by default**, ported from i3's source, not from memory (`CLAUDE.md`).
- **Check i3's real behaviour before calling something a gap**: twice on 2026-10-26/27 what looked
  like a gap was i3 itself (the resize keys move the bottom-right corner; a launcher-started game
  opened where you were in i3 too).
- **Diverge on purpose, and write it down**: in the README for a user, in `docs/plan.md` "Scope"
  for the reason. Today's: the centre drop swaps, Meta+Shift+drag floats, the launch workspace,
  windows that place themselves, and what is left out (tabbed and stacked, marks, the scratchpad).

## Defaults

- **The defaults are the product.** During the development Stage, Paul's desktop runs what a new
  user gets; his own customisations come back later.
- **The plugins are optional**: the script alone is the product and works without them; the
  plugins finish the feel (`docs/plan.md`, "Scope").
- **i3's defaults where i3 has one**: a command i3 binds to no key stays unbound here too.
