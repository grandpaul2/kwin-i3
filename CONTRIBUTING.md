# Contributing to kwin-i3

kwin-i3 is i3's window management as a KWin script for Plasma 6 on Wayland. People run it as
their only window manager, so a broken change breaks a real desktop. Most of the work
here is done through coding agents (Claude Code and others); `AGENTS.md` is the full rulebook, for
agents and people alike.
This page is the short version.

## Getting set up

1. Install and build by `README.md` (its package list is Fedora's; on Arch the KWin headers are in
   `kwin`, and add `vulkan-headers` and `python-xlib`). `make plugin` and `make kcm` build the
   optional plugins and the settings page.
2. Read `docs/philosophy.md` (what it is for), `docs/plan.md` (scope and the decisions) and
   `docs/behaviour.md` (what the code does). `docs/README.md` maps the rest.
3. `make unit`, then one scenario to see the harness work: `make tools`, then
   `tests/live/run.sh 10-tiling.sh` (each scenario runs in its own headless KWin,
   `tools/testkwin.sh`; nothing touches your desktop). Its log is `$TMPDIR/tmp.*/10-tiling.sh.log`.
   The whole suite (`make test`, several minutes) runs at most once a session, when the work needs
   it: `docs/testing.md` is deliberately lean.
4. `gh` installed and logged in (`gh auth login`): the session commands list pull requests with it.

If you run kwin-i3 yourself, the checkout your `~/.local/share/kwin/scripts/kwin-i3` links to is what
your KWin loads: do your work in a git worktree, never on a branch there.

## How a change lands

- Pick an item from `OPEN.md` (work for now) or propose something new. `LATER.md` is held until
  the current development Stage ends.
- Work on a branch in a worktree (`git worktree add ../kwin-i3-<branch> -b <branch>`, then
  `make tools` there), push it, and open a pull request to `main`
  (`gh pr create --base main --title "OPEN.md 54: ..."`). One item per PR;
  say which `OPEN.md` item it is, and update that item (only) in the PR.
- A behaviour change updates `docs/behaviour.md` in the same PR. Run what `docs/testing.md` P1
  lists for the change (it is deliberately lean). No new tests without the maintainer's agreement.
- `package/contents/code/main.js` is built by `make build` and committed: after rebasing on
  `main`, rebuild it rather than merging it by hand.
- A new test, a scope change or a foundation-doc change needs the maintainer's agreement: ask in the PR.
- The maintainer reviews and merges. A merge is the go for main; reloading a live desktop is a
  separate step, taken by whoever's desktop it is.
- Users run the `stable` branch, not main: a merged change reaches them at the next promotion,
  after a day on the maintainer's desktop and every scenario on two other KWins
  (`docs/testing.md` P6). README's install clones `stable`; for work here, `git checkout main`.

## Which command for which change

| you changed | build | test (`docs/testing.md` P1) |
|---|---|---|
| `src/` (the script) | `make build` (commit `package/`) | `make unit`, the scenario(s) that drive it: `tests/live/run.sh NN-name.sh` |
| `plugin/` | `make plugin` | the scenarios, and `64-plugin-reload.sh` |
| `kcm/` (settings page) | `make kcm` | the settings scenarios |
| `widget/` | nothing (QML) | its scenario |

## What we care about

- **i3 first.** Every bug or design question starts with how i3 does it, from i3's source, then
  how kwin-i3 copies it, then what KWin or Wayland get in the way. A difference from i3 needs a
  specific reason.
- **The cause before a fix.** `docs/kwin-notes.md` holds what KWin really does where it surprised
  us; add to it when you find something.
- **Bug captures**: a key bound to `tools/capture` (README, Install step 4) saves the last minute of kwin-i3's, the plugins' and the pointer's
  events with a screenshot; `tools/capture-read DIR` reads it (`docs/debugging.md`).

Licence: GPL-2.0-or-later (`LICENSE`, `NOTICE`).
