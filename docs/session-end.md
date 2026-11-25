# kwin-i3: the end of a session

This project's part of a session's end. It runs after the shared steps (`OPEN.md` rewritten, what
was learned put in its home, commit and push); where those aren't installed, do them too.

1. **Homes**: a KWin trap goes in `docs/kwin-notes.md`, a decision in its home
   (`docs/README.md`), a working rule in `AGENTS.md`. Routine fixes need nothing; the commit says
   what changed.
2. **`OPEN.md`**: every finding from this session (a red test, a capture, a review comment) leaves
   **fixed**, **won't-fix with a written reason**, or **as a line there**; a find that can wait for
   the end of the Stage goes in `LATER.md` instead (its header has the rules). A change that went
   live this session is **done** unless a problem was reported with it. On a pull-request branch,
   edit only the item the PR is for.
3. **Tidy**:
   - No debug trace lines in `src/` (`git diff src/ | grep -n TRACE` is empty), and `./build.sh`
     leaves `package/` unchanged from what will be committed.
   - No leftover worktrees: `git worktree list` shows only this checkout (`git worktree remove
     --force` the rest, after a look at what's in them).
   - No leftover test runs: `pgrep -af 'tests/fuzz/|tests/live/|testkwin.sh'` is empty; stop any
     by PID.
   - Captures handled this session (fixed, or carried by an `OPEN.md` item that keeps none) are deleted from
     `~/.local/state/kwin-i3/captures/`. Ones not reached stay, and get a line in `OPEN.md`.
4. **The live desktop**: if `package/` differs from what KWin last loaded, say so. Reload only on
   the desktop owner's go.
5. **Pull requests**: on a pull request's branch, push it rebased on `main` and say whether the PR
   is ready for review.

The report adds: whether the desktop runs what is committed, and any pull request opened or
waiting.
