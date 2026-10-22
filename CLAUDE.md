# kwin-i3 — notes for agents

Paul's project: i3's window management as one KWin script, running his desktop (`pauls-desktop`,
Fedora 44, Plasma 6.7 Wayland) since 2026-10-22. **kwin-i3 work happens in sessions started here**
(Paul, 2026-10-22); `~/.dotfiles` keeps the system around it (below). Read `docs/plan.md` first: it is
the plan and records Paul's decisions. `docs/spike-kwin-tiles.md`, `docs/review-2026-10-21.md` and
`docs/fuzz-design.md` are why it looks the way it does. **`OPEN.md` is this repo's only list of
unfinished work** (state, not history; the rules are in its header).

## How to work with Paul here

The shared rules in `~/.claude/CLAUDE.md` load in every session (numbering, answer questions as
questions, no Workflow tool, clipboard). These come from `~/.dotfiles/CLAUDE.md`, which does not load
here:

- **Commit and push at natural intervals without asking**, and don't announce it. This overrides
  Claude Code's default of committing only when asked. Group related changes; say *why* in the
  message; never commit unverified work.
- **Ask in plain prose**, never with the multiple-choice picker. Lay out the options and a recommendation.
- **sudo** is passwordless, gated by Claude Code's own approval prompt: propose the command and let the
  prompt ask. Never ask Paul for a password.
- **Long work runs in the background and is polled in the turn**: a one-line status every couple of
  minutes. Ending a turn is not a check schedule, because nothing wakes you to report.
- **When Paul says it works and moves on, it is done.** Drop your planned checks, and don't chase him
  for test results.

## Safety — the desktop is Paul's live session

- **Test only in `tools/testkwin.sh`** (headless, with its own bus and config). The live KWin runs
  kwin-i3. i3ws and Krohnkite stay disabled there; never re-enable either beside it, or three scripts
  would place the same windows.
- **`package/` here is what Paul's KWin loads** (`~/.local/share/kwin/scripts/kwin-i3` links to it).
  Anything that builds a fault or a debug trace into it runs in a worktree
  (`git worktree add`, then `cp -r tools/bin` into it). `make mutate-live` refuses to run here.
  `make fuzz` and `make test` build `src/` as it stands, so don't leave trace lines in `src/`.
- **Deploying a fix**: `make test` green and committed, then reload it live with `busctl --user call
  org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3` followed by `busctl --user
  call org.kde.KWin /KWin org.kde.KWin reconfigure`, and check with `isScriptLoaded`. The reload
  re-tiles his windows once. That is accepted for fixes; say that you did it.
- **Nothing that shows a window on Paul's desktop** without telling him first.

## Finding bugs

- **Paul's own finds**: Meta+Shift+B (`tools/capture`) saves state, the journal and a screenshot to
  `~/.local/state/kwin-i3/captures/<time>/`. Each capture becomes a live test, watched red, then a fix.
- **`make fuzz`** (`tests/fuzz/`, `docs/fuzz-design.md`) runs random actions with pixel invariants.
  Run it after a major change or a batch of minor ones, not after every fix (Paul, 2026-10-22):
  `make test` covers a small fix. It takes ~20 min. `tests/fuzz/run.py --reshrink SEED` shrinks a
  saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`. For KWin's real behaviour, read its source for the installed version
  (`rpm -q kwin`, then `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`). Don't guess.

## Working rules

- Edit `src/`, then `make test`. `package/contents/code/main.js` is built; never edit it by hand,
  but commit it.
- Testing, as defaults rather than ritual (Paul, 2026-10-22: keep room for creativity): a
  substantial new set of tests gets a second agent's look before it's relied on — at the design
  stage when that's cheap — especially if it's slow; behaviour that needs real input gets injected
  input (`tools/inject.py`) rather than a manual session; and a test is trusted once a deliberate
  fault has turned it red (`make mutate`, `make mutate-live`, from a worktree). Use judgment about scale.
- i3 behaviour is ported from i3's source (`src/move.c`, `src/tree.c`, `src/con.c`), not from memory.

## Where things live outside this repo

These are in `~/.dotfiles` (its own repo, pushed the same way). Edit them from here when a change
spans both, and commit there too:

- the launchers: `plasma/.local/share/applications/net.local.ki3-capture.desktop` (Meta+Shift+B);
  plus `setup.sh` (links, the shortcut keep-list), `scripts/Documents/health-check.sh` and README's
  "Plasma" table, which describes the keys;
- `localbin/.local/bin/hotkeys`, Paul's cheat sheet: update it when a key changes;
- phase 6 of the plan (setup.sh installs kwin-i3, i3ws and Krohnkite retired), which is the
  dotfiles' `OPEN.md` item, after Paul's OK.

Backups need nothing from here: dotfiles' `/sessionend` copies this project's Claude memories too.
