---
description: End a kwin-i3 session - tidy, make the live desktop match, commit and push
allowed-tools: Read, Write, Edit, Bash
---

End of a kwin-i3 session. **Leave the repo clean and pushed, and Paul's desktop running what is
committed.** Nothing is deferred to "later".

## 1. Memory

If something notable came up (a KWin trap, a decision of Paul's, how he wants to work), update
`~/.claude/projects/-home-paul-kwin-i3/memory/` now. A lesson about working with Paul in general
belongs in the dotfiles project's memory too (`~/.claude/projects/-home-paul--dotfiles/memory/`):
the two sets are copies. Routine fixes need no memory; the commit says what changed.

## 2. OPEN.md

Rewrite `OPEN.md` to the state now: done items come out, new ones go in with a next action. Every
finding from this session (a fuzz failure, a capture, a review comment) leaves **fixed**,
**won't-fix with a written reason**, or **as a line there**. Nothing else may carry an open list.

## 3. Tidy

- No debug trace lines in `src/` (`git diff src/ | grep -n TRACE` is empty), and `./build.sh`
  leaves `package/` unchanged from what will be committed.
- No leftover worktrees: `git worktree list` shows only this checkout (`git worktree remove --force`
  the rest, after a look at what's in them).
- No leftover test runs: `pgrep -af 'tests/fuzz/|tests/live/|testkwin.sh'` is empty. Stop any by
  PID, never with a pattern that matches your own shell.
- Captures handled this session (a test exists for each) are deleted from
  `~/.local/state/kwin-i3/captures/`. Ones not reached stay, and get a line in `OPEN.md`.

## 4. Tests, if `src/` changed

`make test`, green. A change with no test of its own gets one, watched red first. `make fuzz`
only after a major change or a batch of minor ones (Paul): it takes ~20 min; poll it in the turn.

## 5. The live desktop runs what is committed

If `src/` changed since kwin-i3 was last reloaded, reload it now: `busctl --user call org.kde.KWin
/Scripting org.kde.kwin.Scripting unloadScript s kwin-i3`, then `busctl --user call org.kde.KWin
/KWin org.kde.KWin reconfigure`, then `isScriptLoaded`. This re-tiles his windows once; say that you
did it.

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

A few lines: what changed (with commit hashes), whether the desktop was reloaded, what's in
`OPEN.md`, and anything waiting on Paul. Then confirm both repos are clean and pushed.
