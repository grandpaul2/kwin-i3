# For the control tower: setting up a repo that several people's agents work in

From the kwin-i3 session, 2026-10-30, at Paul's word: a precedent for any repo of his that another
person works in, through their own agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, ...).
kwin-i3 is the first (a3d21a2; dotfiles 0069b42). Facts are from Claude Code's docs as fetched on
2026-10-30 (code.claude.com/docs/en/memory, /settings, /worktrees) and agents.md; opinion is
marked as such.

## The principle

Each piece of agent context has one owner and one scope, and lives where that scope is:

| scope | what goes there | where (Claude Code) | where (other agents) |
|---|---|---|---|
| **the repo, everyone** | the rulebook: how work lands, safety, method, testing, pointers to docs | `AGENTS.md`, imported by a short `CLAUDE.md` | `AGENTS.md` |
| **the repo, facts** | decisions, traps found, open work | the repo's docs (`docs/`, `OPEN.md`) | the same |
| **one person, this repo** | their machines, paths, dotfiles, launcher keys, coordinating-session hooks | `CLAUDE.local.md` (gitignored), best as a link into their dotfiles | their agent's local file |
| **one person, all repos** | style, how to talk to them, cost rules, clipboard per machine | `~/.claude/CLAUDE.md` | their agent's global file (e.g. `~/.codex/AGENTS.md`) |
| **one person, one machine** | what the agent learned about the person | auto memory (`~/.claude/projects/<repo>/memory/`) | the agent's own |

The test for a line: **who acts on it?** If every agent in the repo must, it is shared. If only one
person's agents ever act on it, it is theirs, and in the shared file it is noise in someone else's
context (and can be read as a rule for them).

## How Claude Code loads it (documented)

1. **Files add up, none overrides another**: managed, then `~/.claude/CLAUDE.md`, then the repo's
   `CLAUDE.md` (or `.claude/CLAUDE.md`), then `CLAUDE.local.md`, read last at its level.
   Contradictions between them may be resolved arbitrarily: keep them from contradicting.
2. **AGENTS.md**: Claude Code reads it (v2.1.277+) only where **no** `CLAUDE.md` or
   `CLAUDE.local.md` exists in the working directory or above. With a `CLAUDE.md`, it must import
   it: a `CLAUDE.md` whose first line is `@AGENTS.md`. Trap: a person adding a `CLAUDE.local.md`
   to a repo with `AGENTS.md` alone silently stops Claude reading `AGENTS.md` (the setting
   "Project instructions: `claude-md-and-agents-md`" fixes that). A symlink `CLAUDE.md -> AGENTS.md`
   also works, but Claude's Edit/Write refuse to write through a link, and Windows checkouts break.
3. **`CLAUDE.local.md`** is supported; you gitignore it yourself. It exists only in the checkout
   where it was made, so a worktree doesn't have it. For personal notes in every worktree, the docs'
   own answer is an import from home: `@~/.claude/<file>.md` (a one-time approval per person).
4. **Auto memory is machine-local**, per repository, shared across that machine's worktrees, with
   no team scope; only the first 200 lines (25 KB) of its index load. So anything about the project
   in one agent's memory is invisible to every other agent: project facts go in the repo.
5. **Settings**: `.claude/settings.json` shared and committed; `.claude/settings.local.json`
   personal, gitignore it. Commands are now skills; `.claude/commands/x.md` still works.
6. **Size**: target under 200 lines per `CLAUDE.md`; an import doesn't reduce the context cost.
   `/doctor prompt-audit` (v2.1.283+) checks all of them, global included, for stale or
   contradicting lines.

## The setup, step by step (as done in kwin-i3)

1. `git mv CLAUDE.md AGENTS.md`. Note that git won't follow it as a rename once step 2 recreates
   `CLAUDE.md`: the history before stays under `git log -- CLAUDE.md`.
2. A new `CLAUDE.md`: `@AGENTS.md`, then a short "Claude Code only" section (slash commands, the
   timer tool, auto memory's limit). kwin-i3's is 8 lines.
3. In `AGENTS.md`: name the tools neutrally ("your agent's approval prompt", "another agent's
   session"); say once at the top that each person's own global and local files add their
   preferences; name any procedure kept as a Claude slash command as plain steps for any agent
   ("when the person says session start, follow `.claude/commands/sessionstart.md`").
4. `.gitignore`: `CLAUDE.local.md` and `.claude/settings.local.json`.
5. The owner's personal section out of the shared file, into their dotfiles
   (`~/.dotfiles/claude-config/<repo>.local.md`), linked in as `<repo>/CLAUDE.local.md` and
   relinked by `setup.sh` on a rebuild. Edit the dotfiles file, not the link.
6. The live docs that say `CLAUDE.md` for the rulebook say `AGENTS.md`; frozen records keep theirs
   (they still resolve, through the import).
7. Next session, check the load: the rulebook and the local file both came through.

## What we judged (opinion, ours and the write-ups')

- Keep the shared file short and pointing at docs rather than copying them (HumanLayer,
  2025-11-25: under ~300 lines, theirs under 60). kwin-i3's is 153, dense; the facts are in `docs/`.
- A rule only one person's agent acts on but the other must not break (a safety rule about the
  owner's live desktop) stays shared, written for whoever is in that seat.
- The repo's own rule: "facts about this project belong in the repo, not in one agent's private
  memory, so both agents have them". Memory keeps pointers and feedback about the person.

## For the tower

- A swept repo's `CLAUDE.md` may now be `@AGENTS.md` plus a few lines: follow the import.
- `CLAUDE.local.md` is personal and gitignored; a `CONTROL-TOWER-NOTES.md` pointer line belongs
  there or in the global file, since it concerns only Paul's sessions (kwin-i3's moved there).
- Open: a person's own non-Claude agent (a Codex session of Paul's) sees neither
  `CLAUDE.local.md` nor `~/.claude/CLAUDE.md`. If Paul uses one, his global rules need its file too.
