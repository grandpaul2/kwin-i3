# kwin-i3's design philosophy

What kwin-i3 is for, who it is for, the lines it draws, and how a decision is made. A decision
that goes against this page changes the page first. Written 2026-10-27 from Paul's words and the
decisions they rest on, revised 2026-10-28 after the redo; the detail lives in the docs it points to.

## What it is for

**i3's feel inside a full Plasma session.** i3's window tree, its keys, workspaces that live on an
output, and the frame, with Plasma doing everything else: hardware, panels, notifications,
settings, the screen locker, the apps that expect a desktop. Not all of i3: the parts that make
it feel like i3, made configurable and reliable (`docs/plan.md`, "Scope").

## Why on Plasma

A window manager that replaces a desktop has to carry the whole desktop: display and input
hardware, multi-monitor, scaling, portals, screen sharing, every update of the stack beneath it.
kwin-i3 carries none of it. KWin and Plasma are among the best-supported projects on Linux;
kwin-i3 rides on them and updates as one script and two plugins (Paul, 2026-10-27: "Everything
that those other WMs have to do when they update is insane because they are trying to replace a
DE"). Its windows live beside an ordinary Plasma session, with all the support that brings.

## Who it is for

1. **First: tiling window manager users** who want to have their cake and eat it too: i3's way of
   working with a desktop that just works. Many i3 users don't take to Hyprland or niri, and sway
   lacks i3's reach and doesn't work for everyone; with X11 going away, they need somewhere stable
   to land (Paul, 2026-10-27). They know i3's words and keys, and kwin-i3 keeps both. They carry
   their i3 config over by hand: the settings page names each setting as i3's directive, and its
   rule fields (`for_window`, `assign`, `workspace … gaps`) take i3's own syntax, on purpose.
2. **Second, and still important: Plasma users** who want a full-powered window manager without
   changing much. With what kwin-i3 adds and what Plasma already has, most of the experience is
   reachable with the Meta key and any two-button pointer alone (Paul: "pretty much 90 percent"):
   Meta+drag to rearrange tiles, Meta+right-drag to resize, Meta+Shift+Space between tiling and
   floating. The keys are the route for whatever a touchpad makes awkward.

What follows from the order: i3's behaviour and words win a tie, and nothing a Plasma user
meets first should need i3 knowledge to undo (a floating window looks like any Plasma window;
the settings page says what each word means; the i3-syntax fields sit below the plain controls).

## How a decision is made (Paul, 2026-10-28)

The foundations and their precedents decide; Paul is the trump card, played when they run out.
In order:

1. **The foundations**: `docs/definitions.md` (the words), this page (the lines), `docs/plan.md`
   (the scope, the reasons a difference may have, the standing decisions).
2. **Precedent**: `docs/behaviour.md`'s rows and the reasons recorded in them, and the specs'
   decisions. A case like one already decided is decided the same way, citing it. A row whose
   reason is Paul's live verdict (`docs/plan.md`, reason (c)) is precedent only for the thing it
   names; a case merely like it follows i3, or another of the reasons.
3. **i3's source**, for *how* something already in scope behaves, where both are silent: do what
   i3 does. Whether something is in scope at all is `docs/plan.md`'s test; a feature not in is
   out, not a hole.
4. **A hole**: a case none of these settles is a gap in the docs, not a question. Write the
   missing principle into the doc it belongs in, as a proposal, and say it was a hole.
5. **Paul**, when out of moves: two foundations that genuinely conflict, or the product's
   direction. Not each call (Paul, 2026-10-28: "It's getting way beyond where I can make every
   individual call").

**The exception: overall style and feel.** How kwin-i3 looks and feels in use is judged on the
live desktop, and Paul's verdict there carries weight (stage 7: i3's three ring colours were
specced, built, and dropped live, "all the different colors are just confusing"). Even there,
a suggestion that goes against these norms gets **heavy push back first**: the norm it breaks,
the precedent, i3's way, said plainly before anything is built. If it stands, it is recorded as
a difference with "Paul, live" as its reason, or the norm itself changes, here, in the same commit.

This is about deciding *what* kwin-i3 does. Putting anything on Paul's desktop still needs his go
for that change (`CLAUDE.md`, "Nothing goes live").

**The foundations stay true.** Work that changes a rule, the scope or a word edits the foundation
doc in the same commit, as a behaviour change edits `behaviour.md`. (The redo of 2026-10-27/28
did not, and left `plan.md` contradicting what it built.)

## The line between i3 and Plasma

- **i3 arranges, Plasma does the rest.** What is in, what is out and why, and the order the test
  is applied in: `docs/plan.md`, "Scope".
- **The seam is who arranges a window.** Tiling: the tree places it. Floating: you place it, in
  the tree. Override-redirect: the window manager doesn't (KRunner, popups, menus). Decoration,
  theme, panels and the rest are Plasma's (`docs/definitions.md`, the kinds).
- **Plasma's own settings are the user's.** kwin-i3 doesn't change them (focus policy, the
  shortcuts other components hold); it reports what it needs and the user decides
  (`docs/behaviour.md` §13). The one it needs, per-output desktops, it reports and never sets.

## How it presents itself

- **kwin-i3 is the window manager**, and says so. Its workspaces, outputs and keyboard focus
  apply to every window in the tree. No soft lies ("we won't touch your windows"): a user who
  meets something kwin-i3 does needs a model for why, and the truth is the only one that holds.
- **Every word a user reads is true**, in `docs/definitions.md`'s words: tiling, floating,
  override-redirect; never "leave alone" or "unmanaged" (`docs/style-settings-page.md`, §2).
  Explicit now; plainer later, still true.
- **It looks like Plasma where Plasma has a convention, at no performance cost.** The settings
  page follows KDE's HIG and Plasma's own pages; the frame, gaps and indicators are i3's elements
  drawn to sit in a Plasma desktop (`docs/plan.md`, reason (b)). A look that costs frame time, or
  needs repaints KWin wouldn't make anyway, isn't built (`docs/plan.md`, "Risks").

## How it treats i3

- **Copy i3 by default**, ported from i3's source, not from memory (`CLAUDE.md`): "ride i3, hard"
  (Paul, 2026-10-27). i3's word for anything i3 has (`docs/definitions.md`).
- **Check i3's real behaviour before calling something a gap**: twice on 2026-10-26/27 what looked
  like a gap was i3 itself (a resize key changes a container's share against its siblings; a
  launcher-started game opened where you were in i3 too).
- **Diverge only for one of the reasons in `docs/plan.md`, and write it down**: the row in
  `docs/behaviour.md` marked ≠ carries the reason; those rows are the list of differences.

## Defaults

- **The defaults are the product.** During the development Stage, Paul's desktop runs what a new
  user gets; his own customisations come back later.
- **The product is the script and its two plugins.** The script alone still runs the tree,
  workspaces, keys and floating, and its load notification names what is missing without them
  (`docs/plan.md`, "Scope").
- **i3's defaults where i3 has one**, unless a row gives one of `docs/plan.md`'s reasons: a
  command i3 binds to no key stays unbound here too.
