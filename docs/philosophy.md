# kwin-i3's design philosophy

What kwin-i3 is for, who it is for, the lines it draws, and how a decision is made. A decision
that goes against this page changes the page first; the detail lives in the docs it points to.

## What it is for

**i3's feel inside a full Plasma session.** i3's window tree, its keys, workspaces that live on an
output, and the frame, with Plasma doing everything else: hardware, panels, notifications,
settings, the screen locker, the apps that expect a desktop. Not all of i3: the parts that make
it feel like i3, made configurable and reliable (`docs/plan.md`, "Scope").

## Why on Plasma

A window manager that replaces a desktop has to carry the whole desktop: display and input
hardware, multi-monitor, scaling, portals, screen sharing, every update of the stack beneath it.
kwin-i3 carries none of it. KWin and Plasma are among the best-supported projects on Linux;
kwin-i3 rides on them and updates as one script and two plugins, where a standalone window
manager has to rebuild what a desktop environment already gives, at every update. Its windows live beside an ordinary Plasma session, with all the support that brings.

## Who it is for

1. **First: tiling window manager users** who want to have their cake and eat it too: i3's way of
   working with a desktop that just works. Many i3 users don't take to Hyprland or niri, and sway
   lacks i3's reach and doesn't work for everyone; with X11 going away, they need somewhere stable
   to land. They know i3's words and keys, and kwin-i3 keeps both. They carry
   their i3 config over by hand: the settings page has plain controls, each one's help naming its
   i3 directive, and shows as i3's own text a rule its rows can't hold; `kwinrc` takes i3's
   syntax (`for_window`, `assign`, `workspace … gaps`), on purpose.
2. **Second, and still important: Plasma users** who want a full-powered window manager without
   changing much. With what kwin-i3 adds and what Plasma already has, most of the experience is
   reachable with the Meta key and any two-button pointer alone:
   Meta+drag to rearrange tiles, Meta+Shift+drag to float or tile a window, Meta+right-drag to
   resize, Meta+Shift+Space between tiling and floating. The keys are the route for whatever a touchpad makes awkward.

What follows from the order: i3's behaviour and words win a tie, and nothing a Plasma user
meets first should need i3 knowledge to undo (a floating window looks like any Plasma window;
the settings page says what each word means, and shows i3's syntax only for a rule its rows can't
hold).

## How a decision is made

The foundations and their precedents decide; the maintainer decides when they run out.
In order:

1. **The foundations**: `docs/definitions.md` (the words), this page (the lines), `docs/plan.md`
   (the scope, the reasons a difference may have, the standing decisions).
2. **Precedent**: `docs/behaviour.md`'s rows and the reasons recorded in them, and the
   standing decisions in `docs/plan.md`. A case like one already decided is decided the same way, citing it. A row whose
   reason is a verdict judged live (`docs/plan.md`, reason (c)) is precedent only for the thing it
   names; a case merely like it follows i3, or another of the reasons.
3. **i3's source**, for *how* something already in scope behaves, where both are silent: do what
   i3 does. Whether something is in scope at all is `docs/plan.md`'s test; a feature not in is
   out, not a hole.
4. **A hole**: a case none of these settles, or one they settle two ways, is a gap in the docs,
   not a question and not a call to invent. Work it first: the premise that let it open, i3's
   source, what Plasma and KWin allow, the precedents. Then write the missing principle into the
   doc it belongs in, as a proposal, and say it was a hole: a repair to the foundation, not a
   one-time fix, shown to the maintainer, who takes it or makes it a step-5 question. If the two
   that settle it two ways are foundations that genuinely conflict, the
   worked recommendation goes to step 5, as the edit it would be.
5. **The maintainer**, when out of moves: two foundations that genuinely conflict, or the
   product's direction. The maintainer is brought conflicts between foundations and the
   repairs holes need, never individual cases: the project is past the point where one person can make every individual
   call. **The maintainer's decisions live in these foundations**: a question
   put to them is a question about a foundation. Before asking, show that steps 1-4 don't
   decide it (the scope, the reasons (a)-(g), the precedent, i3's source), and ask it as the
   change to a foundation it would be. A question the docs already answer, asked anyway, can undo
   a decision already made there.

**The exception: overall style and feel.** How kwin-i3 looks (colours, sizes, gaps, decoration,
indicators, banners) and feels in use is judged on the live desktop, **after it is built**, and
that verdict carries weight (i3's three ring colours were specced, built, and dropped live: so
many colours confused more than they told). Even there,
a suggestion that goes against these norms gets **heavy push back first**: the norm it breaks,
the precedent, i3's way, said plainly before anything is built. If it stands, it is recorded as
a difference with "judged live" as its reason, or the norm itself changes, here, in the same commit.

The exception is for the verdict in use and for suggestions, never a reason to ask before
building: a behaviour the steps above decide is built as they decide it, and judged in use (a
question about floating windows over a fullscreen one was once asked, though i3, reason (a) and
the C5 precedent already decided it).

This is about deciding *what* kwin-i3 does. Putting anything on a live desktop still needs its owner's
go for that change (`AGENTS.md`, "Nothing goes live").

**The foundations stay true.** Work that changes a rule, the scope or a word edits the foundation
doc in the same commit, as a behaviour change edits `behaviour.md`; a change that skips it leaves
`plan.md` contradicting what is built. `.claude/skills/foundation-sweep/` reads the foundations
against i3 and the code every so often, to catch what slipped.

## The line between i3 and Plasma

- **i3 arranges, Plasma does the rest.** What is in, what is out and why, and the order the test
  is applied in: `docs/plan.md`, "Scope".
- **The seam is who arranges a window.** Tiling: the tree places it. Floating: you place it, in
  the tree. Override-redirect: the window manager doesn't (KRunner, popups, menus). Decoration,
  theme, panels and the rest are Plasma's (`docs/definitions.md`, the kinds).
- **What i3 decides, kwin-i3 decides at runtime; Plasma's settings stay as the user set them.**
  Where a Plasma setting covers something i3 decides itself (focus follows mouse, a new window's
  focus) or a Plasma feature fights the tree (screen-edge tiling), kwin-i3 wins while it runs, as
  i3 grabs its own keys whatever else wants them, and leaves the setting as it is. The setting is
  in force again when kwin-i3 is released or removed; until then a Plasma page may show a value
  kwin-i3 overrides, and kwin-i3's own page is where it is changed. kwin-i3 writes nothing of
  Plasma's for this, so there is nothing to give back.
- **What kwin-i3 can't win at runtime, the user changes.** Where it can't (per-output desktops,
  window animations, the window actions), Plasma's setting stays the user's: kwin-i3 names what it is designed
  around and why, and changes one only on the user's yes, in a place that says it is Plasma's
  setting, after saving the old value, and gives it back on one action: i3's `i3-config-wizard`
  asks once and never overwrites a config that exists (`docs/plan.md`, "Install and first run").

## How it presents itself

- **It says what to pick.** The page marks what is recommended on the control itself (a
  checkbox's "(recommended)", the Plasma tab's "kwin-i3 (recommended)" column), and the user
  makes every change (`docs/style-settings-page.md`, "Saying what to pick").
- **Defaults means "back to the default", as on every Plasma page**, for the tab shown and only
  it: what is Plasma's goes back to Plasma (each Plasma setting to what it was before kwin-i3
  changed it); what is kwin-i3's own goes to kwin-i3's default, i3's where
  i3 has one. Never kwin-i3's changes to Plasma's settings, and never the reader's data on another
  tab (their window rules, their workspaces' screens).
- **One place for its settings: the settings page.** Plasma's KWin Scripts page opens it too.
  `kwinrc` holds the same settings, in i3's syntax where i3 has one, for a user who writes it by
  hand.
- **kwin-i3 is the window manager**, and says so. Its workspaces, outputs and keyboard focus
  apply to every window in the tree. No soft lies ("we won't touch your windows"): a user who
  meets something kwin-i3 does needs a model for why, and the truth is the only one that holds.
- **Every word a user reads is true**, in `docs/definitions.md`'s words: tiling, floating,
  override-redirect; never "leave alone" or "unmanaged" (`docs/style-settings-page.md`, "Words").
  Explicit now; plainer later, still true.
- **It looks like Plasma where Plasma has a convention, at no performance cost.** The settings
  page follows KDE's HIG and Plasma's own pages; the frame, gaps and indicators are i3's elements
  drawn to sit in a Plasma desktop (`docs/plan.md`, reason (b)). A look that costs frame time, or
  needs repaints KWin wouldn't make anyway, isn't built (`docs/plan.md`, "Risks").

## How it treats i3

- **Copy i3 by default**, ported from i3's source, not from memory (`AGENTS.md`): "ride i3, hard"
 . i3's word for anything i3 has (`docs/definitions.md`).
- **Check i3's real behaviour before calling something a gap**: twice on 2026-10-26/27 what looked
  like a gap was i3 itself (a resize key changes a container's share against its siblings; a
  launcher-started game opened where you were in i3 too).
- **Diverge only for one of the reasons in `docs/plan.md`, and write it down**: the row in
  `docs/behaviour.md` marked ≠ carries the reason; those rows are the list of differences.

## Defaults

- **The defaults are the product.** During the Stage, the maintainer's desktop runs what a new
  user gets, kwin-i3's recommended Plasma settings included; personal customisations come back
  later.
- **The product is the script and its two plugins**, and it is designed for both: no default,
  rule, setting or test is chosen for the script running without them. It still runs the tree,
  workspaces, keys and floating then, and the settings page's banner names what is missing
  (`docs/plan.md`, "Scope").
- **i3's defaults where i3 has one**, unless a row gives one of `docs/plan.md`'s reasons: a
  command i3 binds to no key stays unbound here too.
