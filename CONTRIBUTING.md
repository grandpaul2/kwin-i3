# Contributing to kwin-i3

kwin-i3 is Paul's project: i3's window management as a KWin script for Plasma 6 on Wayland. He
runs it as his only window manager, so a broken change breaks a real desktop. Most of the work
here is done through Claude Code; `CLAUDE.md` is the full rulebook, for agents and people alike.
This page is the short version.

## Getting set up

1. Install and build by `README.md` (its package list is Fedora's; on Arch the KWin headers are in
   `kwin`, and add `vulkan-headers` and `python-xlib`). `make plugin` and `make kcm` build the
   optional plugins and the settings page.
2. Read `docs/philosophy.md` (what it is for), `docs/plan.md` (scope and the decisions) and
   `docs/behaviour.md` (what the code does). `docs/README.md` maps the rest.
3. `make unit`, then `make test`: the live scenarios, each in its own headless KWin
   (`tools/testkwin.sh`). Nothing touches your desktop.

If you run kwin-i3 yourself, the checkout your `~/.local/share/kwin/scripts/kwin-i3` links to is what
your KWin loads: do your work in a git worktree, never on a branch there.

## How a change lands

- Pick an item from `OPEN.md` (work for now) or propose something new. `LATER.md` is held until
  the current development Stage ends.
- Work on a branch in a worktree, push it, and open a pull request to `main`. One item per PR;
  say which `OPEN.md` item it is, and update that item (only) in the PR.
- A behaviour change updates `docs/behaviour.md` in the same PR. Run what `docs/testing.md` P1
  lists for the change (it is deliberately lean). No new tests without Paul's agreement.
- `package/contents/code/main.js` is built by `make build` and committed: after rebasing on
  `main`, rebuild it rather than merging it by hand.
- Paul reviews and merges. A merge is his go; going live on his desktop is a separate step he takes.

## What we care about

- **i3 first.** Every bug or design question starts with how i3 does it, from i3's source, then
  how kwin-i3 copies it, then what KWin or Wayland get in the way. A difference from i3 needs a
  specific reason.
- **The cause before a fix.** `docs/kwin-notes.md` holds what KWin really does where it surprised
  us; add to it when you find something.
- **Bug captures**: Meta+Shift+B saves the last minute of kwin-i3's, the plugins' and the pointer's
  events with a screenshot; `tools/capture-read DIR` reads it (`docs/debugging.md`).

Licence: GPL-2.0-or-later (`LICENSE`, `NOTICE`).
