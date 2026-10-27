# kwin-i3 — notes for agents

Paul's project: i3's window management as one KWin script, running his desktop (`pauls-desktop`,
Fedora 44, Plasma 6.7 Wayland) since 2026-10-22. **kwin-i3 work happens in sessions started here**
(Paul, 2026-10-22); `~/.dotfiles` keeps the system around it (below). Read `docs/plan.md` first: it is
the plan and records Paul's decisions. `docs/spike-kwin-tiles.md`, `docs/review-2026-10-21.md` and
`docs/fuzz-design.md` are why it looks the way it does. **`OPEN.md` is this repo's list of
unfinished work for now, and `LATER.md` of work held until the Stage ends**: no other file carries
an open list (state, not history; the rules are in their headers).

If **`CONTROL-TOWER-NOTES.md`** exists in the repo root, consider its suggestions and delete it.

## How to work with Paul here

The shared rules in `~/.claude/CLAUDE.md` load in every session (numbering, answering questions,
messages to other sessions, outside review of slow tests, cost, push on commit, clipboard). These
come from `~/.dotfiles/CLAUDE.md`, which does not load here:

- **Commit and push at natural intervals without asking**, and don't announce it. This overrides
  Claude Code's default of committing only when asked. Group related changes; say *why* in the
  message; never commit unverified work.
- **Ask in plain prose**, never with the multiple-choice picker. Lay out the options and a recommendation.
- **sudo** is passwordless, gated by Claude Code's own approval prompt: propose the command and let the
  prompt ask. Never ask Paul for a password.
- **Testing follows `docs/testing.md`** ("Testing" below), which applies the global "Long runs"
  rule here; its table says where each run writes its results.
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
- **Nothing goes live without Paul's go, fixes included.** A capture or a bug report asks for a
  diagnosis (cause, proposed fix, test); then his go to change; then his go to reload. Unapproved
  changes stay in a worktree or branch: `package/` on main is what he approved. The reload:
  `busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s kwin-i3`, then
  `busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure`, then `isScriptLoaded`. It
  re-tiles his windows once.
- **Nothing that shows a window on Paul's desktop** without telling him first.

## Finding bugs

- **Paul's own finds**: Meta+Shift+B (`tools/capture`) saves the flight recorder (kwin-i3's log,
  kwini3hold's events, the state, a screenshot, his note) to `~/.local/state/kwin-i3/captures/<time>/`.
  **Read it with `tools/capture-read DIR` first**: one timeline to the millisecond, the press last.
  kwin-i3's log never reaches the journal, and `debugLog` does nothing live (`docs/debugging.md`).
  Each one gets a diagnosis first; with Paul's go, a live test watched red, then the fix.
- **`make fuzz`** (`tests/fuzz/`, `docs/fuzz-design.md`) runs random actions with pixel invariants.
  **Not during the Stage** (Paul, 2026-10-26; `LATER.md`, "Reliability"), and when it returns, in
  runs of 5 minutes or less. `tests/fuzz/run.py --reshrink SEED` shrinks a saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`. For KWin's real behaviour, read its source for the installed version
  (`rpm -q kwin`, then `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`). Don't guess.

## Testing

**`docs/testing.md`, lean for the Stage** (Paul, 2026-10-26: the code runs on his desktop and
nowhere else; testing's one job now is not to break it catastrophically). Its runs are the only
runs: `make unit` and the changed scenario(s) for a change (and 64 for a plugin change), one
`make test` per session at its start (not again before each live install), a probe for a KWin
question. No run over 5 minutes, ever. Fault runs, fuzzing and stock runs
wait in `LATER.md`. A case it doesn't cover: ask Paul first. **No new test of any kind without
Paul's go, and only super justified** (its rule 5: "if you give an agent a handle, it will grab it").

## Working rules

- Edit `src/`, then `docs/testing.md` P1. `package/contents/code/main.js` is built; never edit it by hand,
  but commit it.
- During the Stage (`OPEN.md`), a new test tool is its own proposal.
- The settings page (`kcm/ui/`) and the cog's form follow `docs/style-settings-page.md`.
- i3 behaviour is ported from i3's source (`src/move.c`, `src/tree.c`, `src/con.c`), not from memory.

## Where things live outside this repo

These are in `~/.dotfiles` (its own repo, pushed the same way). Edit them from here when a change
spans both, and commit there too:

- the launchers: `plasma/.local/share/applications/net.local.ki3-capture.desktop` (Meta+Shift+B);
- a key or setting change goes in dotfiles README's "Plasma" table (set by hand on a rebuild and
  read back live; `setup.sh` is only the mechanical restore and changes only for a new link), and
  dotfiles' `/health` picks up anything else;
- `localbin/.local/bin/hotkeys`, Paul's cheat sheet: update it when a key changes.

Backups need nothing from here: dotfiles' `/sessionend` copies this project's Claude memories too.
