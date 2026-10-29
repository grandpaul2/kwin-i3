---
description: End a kwin-i3 session - tidy, report what's owed, commit and push
allowed-tools: Read, Write, Edit, Bash
---

End of a kwin-i3 session. **A wrap-up: it starts no work**, not even a short test run. Leave the
repo clean and pushed, and everything still owed written in `OPEN.md`.

## 1. Memory

If a fact about this repo came up (a KWin trap, a decision of Paul's), update
`~/.claude/projects/-home-paul-kwin-i3/memory/` now. Routine fixes need no memory; the commit says
what changed.

## 2. OPEN.md

Rewrite `OPEN.md` to the state now: done items come out, new ones go in with a next action. Every
finding from this session (a fuzz failure, a capture, a review comment) leaves **fixed**,
**won't-fix with a written reason**, or **as a line there**. A find that can wait for the end of the
Stage goes in `LATER.md` instead (its header has the rules). Nothing else may carry an open list.
A change that went live this session is **done** unless Paul reported a problem with it: never
leave it waiting for his "it works" (Paul, 2026-10-28).

## 3. Tidy

- No debug trace lines in `src/` (`git diff src/ | grep -n TRACE` is empty), and `./build.sh`
  leaves `package/` unchanged from what will be committed.
- No leftover worktrees: `git worktree list` shows only this checkout (`git worktree remove --force`
  the rest, after a look at what's in them).
- No leftover test runs: `pgrep -af 'tests/fuzz/|tests/live/|testkwin.sh'` is empty. Stop any by
  PID, never with a pattern that matches your own shell.
- Captures handled this session (a test exists for each) are deleted from
  `~/.local/state/kwin-i3/captures/`. Ones not reached stay, and get a line in `OPEN.md`.

## 4. Tests

Report which tests ran since the last change and which didn't (CLAUDE.md, "Testing"). Owed is only
a change's tier 1 check, or tier 3's one `make test` for something not yet live; it goes in
`OPEN.md` as "next: at the start of a working session". Start none. Tier 4 (fuzz, the full fault
battery, `make live-stock`) is never owed: it runs every week or two with Paul's go.

## 5. The live desktop

If `package/` differs from what KWin last loaded, say so. Reload only on Paul's go.

## 6. Commit and push

- This repo: commit what's left in related groups, with the *why*, and push.
- `~/.dotfiles`, if this session touched it (launchers, setup.sh, health-check, README, `hotkeys`):
  commit and push there too. Its `CLAUDE.md` rules apply to those files.
- Back up this project's memories into the dotfiles repo now. Its own `/sessionend` does it too,
  but Paul may work only here for days. Copy live to repo only (never the reverse), mirroring
  deletions, and skip an empty dir:

  ```bash
  m=~/.claude/projects/-home-paul-kwin-i3/memory
  d=~/.dotfiles/claude-config/project-memories/-home-paul-kwin-i3
  [ -n "$(ls -A "$m")" ] && mkdir -p "$d" && rsync -a --delete "$m/" "$d/" &&
    git -C ~/.dotfiles add "$d" && { git -C ~/.dotfiles diff --cached --quiet ||
    git -C ~/.dotfiles commit -qm "state: kwin-i3 project memories" -- "$d"; } &&
    timeout 30 git -C ~/.dotfiles push -q
  ```

  If the dotfiles repo is behind `origin`, the push is refused: don't pull. Say so (its CLAUDE.md:
  find out what landed there first).

## 7. Report

A few lines: what changed (with commit hashes), whether the desktop runs what is committed, what's in
`OPEN.md`, and anything waiting on Paul. Then confirm both repos are clean and pushed.
