@AGENTS.md

## Claude Code only

- `/sessionstart` and `/sessionend` are `.claude/commands/`; the long-run timer is `CronCreate`.
- Auto memory (`~/.claude/projects/.../memory/`) is one machine's and one person's: it never holds
  a fact about this project (that goes in the repo, `AGENTS.md` "Working rules"), only pointers and
  personal feedback.
