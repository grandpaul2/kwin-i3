# kwin-i3: the start of a session

This project's part of a session's start. It runs after the shared steps (repo state, `OPEN.md`
and `LATER.md`'s headings); where those aren't installed, do them first: `git fetch -q`,
`git status -sb`, `git worktree list` (a leftover worktree from a trace or the battery), and read
`OPEN.md` and `LATER.md`'s headings.

1. **The repo**: the status line at the top of `README.md`, and the open pull requests,
   `gh pr list` (one line each: number, branch, author, the `OPEN.md` item). On a feature branch,
   whether it is behind `main` (a rebase before review).
2. **The live desktop**, read-only (skip this step if this machine doesn't run kwin-i3: no
   `~/.local/share/kwin/scripts/kwin-i3`):
   - kwin-i3 is running: `busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting isScriptLoaded s kwin-i3`
   - KWin errors from it since the live KWin started: `journalctl --user -b --no-pager -o short-iso _PID="$(pgrep -o -f '^/usr/bin/[k]win_wayland .*--socket wayland-0')" | grep -E 'kwin-i3|main.js|kwini3' | tail -5`
     (by the live KWin's PID: test KWins log as `kwin_wayland` too, mostly without naming the
     test). Compare the times with `git log`: a warning logged before the commit that fixed it is
     history, not a finding.
3. **Bug captures on this machine** (if the directory exists): `ls -t ~/.local/state/kwin-i3/captures/`.
   Each is a press of the capture key, that is, something the person at this desk saw go wrong.
   Diagnosing one starts with `tools/capture-read DIR`: the timeline before the press, with its
   note (`docs/debugging.md`). A fix starts as a spec, reviewed before any code (`AGENTS.md`, "How
   work lands"). Captures already worked on are deleted at the end of the session that handled
   them, so all of these are new, except those an `OPEN.md` item names as kept.
4. **A promotion due** (the maintainer's sessions only): `git log -1 --format=%cs origin/stable`
   and `git log --oneline origin/stable..origin/main -- src plugin kcm widget package tools/capture | wc -l`.
   A week or more since `stable` last moved, with code changed on main since: a promotion is due,
   `docs/testing.md` P6.

The status adds: open pull requests and a promotion due; kwin-i3 loaded, with any errors since
login; captures waiting (count, newest).
