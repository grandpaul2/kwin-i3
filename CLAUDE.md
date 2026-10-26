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
- **Testing follows "Testing" below**, which narrows the global "Long runs" rule here. Where runs
  write their results: `make test` prints each scenario's lines and a final `TIME` summary only
  when it ends, so while it runs read the batch's files (`tests/live/run.sh`:
  `/tmp/tmp.*/NN-*.sh.log`, and a `.status` each as it ends); `make fuzz` writes nothing to its
  console: `tests/fuzz/out/<seed>/result.json` per seed and `tests/fuzz/out/REPORT.md`.
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
  **Once every week or two, not as part of development** (Paul, 2026-10-26: "something we'll pull
  out once in a while"; a 20-minute campaign was stealing session time). No change, fix or merge
  waits on it, and nothing in `OPEN.md` is "a fuzz run owed" ("Testing", tier 4).
  Propose a campaign only when a week or two has passed since the last (`tests/fuzz/out/REPORT.md`'s
  date), and run it only with Paul's go. It takes ~20 min. `tests/fuzz/run.py --reshrink SEED`
  shrinks a saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`. For KWin's real behaviour, read its source for the installed version
  (`rpm -q kwin`, then `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`). Don't guess.

## Testing

Paul, 2026-10-26, after an audit of that session: part A of item 35 took ~10 min to code and ~45
min of test runs, almost all of it whole-suite runs that found nothing and flakes chased in
scenarios the change didn't touch, plus a fuzz campaign that found nothing. What found things was
narrow and fast: unit tests, the change's own scenario, its faults against that scenario, KWin's
source, and outside review. Testing is tiered by that:

1. **Every change** (seconds to a minute): `make unit`, and only the scenario(s) covering the
   change, alone (`tests/live/run.sh NN-name.sh`). New behaviour gets its scenario; behaviour that
   needs real input uses injected input (`tools/inject.py`). A screenshot only for a visual change.
   That is a change's check before its commit.
2. **A new scenario's faults**: applied by hand against that scenario only (a few lines of Python:
   apply, `./build.sh`, run the scenario, `git checkout` the file and `package/`), from a worktree.
   A test is trusted once a fault has turned it red. A fault nothing catches marks code to remove
   or a test to fix. Its lines still go in `tests/live/mutate.py` for the full battery.
3. **Once per session, before anything goes live**: one full `make test` (~4 min, in the
   foreground). A failure in a scenario the change doesn't touch: one rerun of that scenario alone;
   green alone passes, with a line in `OPEN.md` item 34. Nothing more that session.
4. **Every week or two, with Paul's go, never owed by a change**: the fuzz campaign (`make fuzz`),
   the full fault battery (`make mutate-live`, `make mutate`; commit first: it restores with
   `git checkout`), `make live-stock`. Results go to `OPEN.md`.
5. **Flakes are test-speed work** (`OPEN.md` item 34), never chased mid-session: one rerun alone, a
   note, move on.
6. **No ceremony for known runs**: no outside review or smoke run before `make test` or a single
   scenario; anything under ~5 min runs in the foreground. The global "Long runs" rule (review,
   smallest version first, a 2-minute timer, reading the results yourself) is for new or
   unfamiliar runs over a few minutes, and for tier 4.
7. **Bug fixes**: diagnosis, a test watched red, then the fix; the red test is tier 1's scenario.

## Working rules

- Edit `src/`, then tier 1 above. `package/contents/code/main.js` is built; never edit it by hand,
  but commit it.
- During the Stage (`OPEN.md`), a new test tool is its own proposal.
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
