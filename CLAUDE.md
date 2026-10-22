# kwin-i3 — notes for agents

Paul's project: i3's window management as one KWin script. Read `docs/plan.md` first; it is the
plan and records Paul's decisions. `docs/spike-kwin-tiles.md` and `docs/review-2026-10-21.md` are
why it looks the way it does. The machine it runs on is described in `~/.dotfiles` (its CLAUDE.md
binds work here too: commit and push as you go, without asking).

## Safety — the desktop is Paul's live session

- **Test only in `tools/testkwin.sh`** (headless, private bus and config). Never load kwin-i3 into
  the running KWin while `i3ws` and Krohnkite are enabled there: three scripts would place the
  same windows.
- **Nothing that shows a window on Paul's desktop** (the nested KWin of plan phase 4 included)
  without telling him first.
- The switch-over (plan phase 5) happens only with Paul, at a logout.
- **`package/` here is what Paul's KWin loads** (linked since the switch-over). Anything that
  builds a fault or a debug trace into it runs in a worktree: `make mutate-live` refuses to run
  here. `make fuzz` and `make test` build `src/` as it stands, so don't leave trace lines in `src/`.
- **`make fuzz`** (`tests/fuzz/`, `docs/fuzz-design.md`) finds bugs; **`~/.local/state/kwin-i3/captures/`**
  holds the ones Paul hit (Meta+Shift+B, `tools/capture`). Each becomes a live test, watched red.

## Working rules

- Edit `src/`, then `make test`. `package/contents/code/main.js` is built; never edit it by hand,
  but commit it (the dotfiles will link `package/`).
- Testing, as defaults rather than ritual (Paul, 2026-10-22: keep room for creativity): a
  substantial new set of tests gets a second agent's look before it's relied on — at the design
  stage when that's cheap — especially if it's slow; behaviour that needs real input gets injected
  input (`tools/inject.py`) rather than a manual session; and a test is trusted once a deliberate
  fault has turned it red (`make mutate`, `make mutate-live`). Use judgment about scale.
- i3 behaviour is ported from i3's source (`src/move.c`, `src/tree.c`, `src/con.c`), not from memory.
