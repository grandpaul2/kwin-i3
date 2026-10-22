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

## Working rules

- Edit `src/`, then `make test`. `package/contents/code/main.js` is built; never edit it by hand,
  but commit it (the dotfiles will link `package/`).
- A test counts only once a deliberate fault has been seen to turn it red (`make mutate`,
  `make mutate-live`).
- **New tests are designed first, reviewed by a second agent, then implemented** (Paul,
  2026-10-22: "make sure the tests get reviewed before they are implemented"). The design is a
  short doc under docs/ (what each test asserts, how it waits, which faults it must catch); the
  reviewer gets the code and the design, not my conclusions.
- **Any test or suite that takes longer than about a minute also gets a review of the
  implementation**, for faults and for speed (Paul, 2026-10-22: in his Minecraft projects this
  "found a lot of faults and made things a lot faster"; slow tests bog a project down).
- **Behaviour that needs real input is tested with real input**, injected (`tools/inject.py`), not
  left for Paul to try by hand (Paul, 2026-10-22: "set the precedent now"). Only what exists solely
  in his real session (his monitors, login, his running Plasma) is checked by hand, at switch-over.
- i3 behaviour is ported from i3's source (`src/move.c`, `src/tree.c`, `src/con.c`), not from memory.
