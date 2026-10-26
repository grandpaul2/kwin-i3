---
description: Start a kwin-i3 session
allowed-tools: Read, Bash, Glob, Grep
---

Starting a kwin-i3 session. Please:

1. Read `OPEN.md`, and the status line at the top of `README.md` (CLAUDE.md is already loaded).
2. Check this repo: `git fetch -q`, then `git status -sb` (uncommitted changes, ahead/behind
   `origin`), and `git worktree list` (a leftover worktree from a trace or the battery).
3. Check the live desktop, read-only:
   - kwin-i3 is running: `busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting isScriptLoaded s kwin-i3`
   - KWin errors from it since boot: `journalctl --user -b --no-pager -o short-iso _COMM=kwin_wayland | grep -E 'kwin-i3|main.js' | grep -v kwin-i3-test | tail -5`
     (`/tmp/kwin-i3-test.*` lines are test KWins). Compare the times with `git log`: a warning
     logged before the commit that fixed it is history, not a finding (2026-10-22: stale "used
     before its declaration" lines from before 2dacb58).
4. **Paul's bug captures**: `ls -t ~/.local/state/kwin-i3/captures/`. Each is a Meta+Shift+B press,
   that is, something he saw go wrong. Say how many there are and when the newest is from, and offer
   to diagnose them. Diagnosing one starts with `tools/capture-read DIR`: the timeline before the
   press, with his note (`docs/debugging.md`). A fix needs Paul's go (CLAUDE.md, "Nothing goes live"). Captures already
   worked on are deleted at the end of the session that handled them, so all of these are new,
   except those an `OPEN.md` item names as kept.

Then a brief status:
- repo: clean / dirty / ahead / behind, and any leftover worktree
- live: kwin-i3 loaded, with any errors since login
- captures waiting (count, newest), and the open items from `OPEN.md` in a line each
- ready for tasks

**If the repo is BEHIND `origin`, say so and ask what produced those commits before pulling.**
Only Paul's sessions push here, so a commit he didn't make is worth understanding first.

Keep it concise.
