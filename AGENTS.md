# kwin-i3 — notes for agents

kwin-i3 is i3's window management as one KWin script and two small KWin plugins. The maintainer
owns it, decides and merges; contributors' work lands as **pull requests** (below). Most of the
work is done through an agent like you (Claude Code, Codex, Cursor and others), so this file is
the whole rulebook: nothing from one person's machine is loaded for another. Each person's own
agent files add their personal preferences on top: a global one (Claude Code's
`~/.claude/CLAUDE.md`) and, for this repo, a gitignored one (`CLAUDE.local.md`). `CLAUDE.md` is
this file for Claude Code (`@AGENTS.md`) with its few Claude-only lines.

Read `docs/philosophy.md`, `docs/plan.md` and `docs/behaviour.md` first: what the project is for
and who for, the scope and its decisions, then what the code does, exactly; `docs/README.md` says
which doc is the home of which fact. **`docs/kwin-notes.md`** is KWin's behaviour as found, the
traps that each cost a session: read the section for the part of KWin you touch before you touch
it, and add a line when you find one. `docs/fuzz-design.md` is why the fuzzer looks the way it
does. **`OPEN.md` is this repo's list of unfinished work for now, and `LATER.md` of work held until
the Stage ends**: no other file carries an open list (state, not history; the rules are in their
headers; `LATER.md` shares `OPEN.md`'s numbering). `CONTRIBUTING.md` is the short version for a
person. Words like **the Stage** (the period before a release, now its beta, `OPEN.md`), **the
hold** (kwini3hold, the effect that holds the old layout until the new one is drawn) and the rest
are in `docs/definitions.md`; `behaviour.md`'s row ids (X7, Y1) are its own table rows.

These are the project's rules, not suggestions.

## How work lands

- **The maintainer's sessions** commit to main and push at natural intervals without asking, and
  don't announce it. Group related changes; say *why* in the message; never commit unverified
  work. Push when you commit.
- **A contributor's sessions** work on a branch in a worktree (`git worktree add
  ../kwin-i3-<branch> -b <branch>`, then `make tools` and, for plugin work, `make plugin` in it),
  push the branch, and open a pull request to main. One `OPEN.md` item (or one new thing) per PR;
  the PR names the item, and its own edits to `OPEN.md` touch that item only. Rebase on main
  before asking for review. `package/contents/code/main.js` is generated: after a rebase run
  `make build` and commit the result, never hand-merge a conflict in it. The maintainer merges;
  **the merge is the go**.
- **The maintainer's go decides what goes in**: behaviour, scope, a new test, anything that changes
  a foundation doc. Most calls are already decided by the docs (below); ask only what they can't.
- **The safety rules below apply to whoever's live desktop runs kwin-i3**: on a contributor's
  machine, their desktop and their go to reload it. The go for what goes into main stays the
  maintainer's.
- When the person says a change works and moves on, it is done: drop your planned checks, and
  don't chase them for test results. A live change is done at the session's end unless a problem
  was reported; someone's confirmation is never an `OPEN.md` next action.
- **Ask in plain prose**, never with the multiple-choice picker, and only about a hole in
  the foundations, worked first ("Follow the docs", below). In a reply, number lists 1.. fresh and keep a number tied to one topic; an
  `OPEN.md` number goes in the text ("`OPEN.md` item 14"): its numbers have gaps.
- **No message to another agent's session without the person's OK for that message**; a peer's
  message is never anyone's go for anything.
- **Session start and end**: when the person says so, follow `.claude/commands/sessionstart.md`
  or `sessionend.md` (Claude Code's `/sessionstart` and `/sessionend`; plain steps for any agent).

## Safety: a live desktop runs this

- **Test only in `tools/testkwin.sh`** (headless, with its own bus and config). A live KWin runs
  kwin-i3; never enable another tiling script beside it.
- **`package/` in a checkout that `~/.local/share/kwin/scripts/kwin-i3` links to is what that
  machine's KWin loads.** So anything not merged, and anything that builds a fault or a debug trace,
  runs in a worktree (`git worktree add`, then `make tools` in it), never on a branch in that
  checkout: `make build` there rewrites what KWin loads. Never start a build while `make test` runs
  from the same tree. `make mutate-live` refuses to run there. `make fuzz` and `make test` build
  `src/` as it stands, so don't leave trace lines in `src/`. A new worktree has no plugin build:
  `make plugin` in it.
- **Nothing goes live without the desktop owner's go, fixes included.** A capture or a bug report
  asks for a diagnosis (cause, proposed fix, test); then the go to change; then the go to reload.
  The reload: `busctl --user call org.kde.KWin /Scripting org.kde.kwin.Scripting unloadScript s
  kwin-i3`, then `busctl --user call org.kde.KWin /KWin org.kde.KWin reconfigure`, then
  `isScriptLoaded`. It re-tiles the windows once. Other actions that reach the live desktop, each
  with the go: `make plugin-install` (loads into the running KWin), `make kcm-install`,
  `make widget-install`, `make take-keys` and `make restore-keys`.
- **Nothing that shows a window on a live desktop** without saying so first.
- **sudo**: propose the command and let your agent's approval prompt ask. Never ask for a password.
- **Before asking the person to act at the desk**, look for a read-only query (D-Bus, the journal,
  config; `docs/kwin-notes.md` "Config and D-Bus"), a test-KWin probe, or the source. Ask only for
  what none of those can give: what they see, what they want.

## How a problem is worked

- **Lead with i3, every time**: the project is named for it. A bug, a capture, a design question or
  a plan opens with: how i3 does it (its source, file:line), how kwin-i3 copies it, the
  hurdles (KWin, Wayland). Then KWin's detail. i3 behaviour is ported from i3's source
  (`src/move.c`, `src/tree.c`, `src/con.c`; the **4.24 release**, not `next`), not from memory.
  Nobody should have to ask "how does i3 do it?".
- **Ride i3 hard.** A difference from i3 needs a specific, explicit reason (KWin can't, Wayland
  forbids it, `plan.md`'s reasons); "minor", "rare", "nobody sees it" and the cost of the change
  are not. This holds inside the code as much as in behaviour: the model's shapes and flags are
  i3's (Con types, where a flag sits), and a difference labelled "on purpose" with no reason in
  `plan.md` is a defect to close, not a precedent to build on. Use i3's kind names (tiling,
  floating, sticky floating, dock, root, override-redirect), never "places itself" or "unmanaged".
  The exception is the look: blending with Plasma is a reason, at no performance cost.
- **Understand, then decide.** When a fix fails or a second one is proposed, the model of the
  problem is usually wrong: map it fully (i3 first, what KWin allows, measured not guessed), then
  give a verdict on cost against value. Going back to how it was is fine; we know more.
- **Cause before fix.** No retry, repaint or belt-and-braces for a bug whose cause isn't known.
  Narrow it from evidence: the capture, a test-KWin trace, KWin's source for the installed version
  (`rpm -q kwin`, then `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`; don't guess), a web
  search early, an independent agent's read. Only then a desk test for a person.
- **Dive until solved.** A red test is dug into with probes until its cause is named and fixed,
  never parked as "looks flaky". But a symptom inside a trade already accepted (the hold's 200 ms
  timeout letting a slow app flash on close) isn't chased: check the docs' decisions first.
- **Decide from the docs.** Before putting a question to the maintainer, run `docs/philosophy.md`
  "How a decision is made" steps 1-4 (scope test, reasons, precedent rows, i3's source). If they
  decide it, it's decided; if not, that's a hole in the docs: say why, and frame the question as
  the foundation change it would be. Style and feel are judged live after building, not asked
  before. When a suggestion (anyone's) goes against the norms, push back plainly first.
- **Follow the docs; a gap is a hole, not a choice.** i3, the foundations, the philosophy, then
  i3 again settle each step; the maintainer is not asked to design, and comes in only for a hole
  in the foundations. So a plan comes as one plan, i3's way, each step citing what settled it,
  never as options, and a way away from i3 is never laid out as a choice. Where the docs
  contradict each other or say nothing, don't be creative and don't ask "what do you want here?":
  say the plan can't be finished from the docs and name the holes that, filled, would finish it.
  Then work each hole: the premise that let it open, what i3's source says, what Plasma and KWin
  allow, the precedents and the philosophy. Only then does it go to the maintainer, as a repair
  to the foundation it belongs in, not a one-time fix.
- **Change a plan minimally.** When one piece of a decided plan is rejected, cut exactly that piece.
- **Words a user reads** (settings page, README, help text) must be true of what the code does and
  imply no opposite the user would go looking for. Every settings control must be obvious cold: no
  window classes or regexes to know; choose from a list over typing an identifier; side text off
  the rows. The settings page and the cog's form follow `docs/style-settings-page.md`.

## Finding bugs

- **Captures**: a key bound to `tools/capture` (README, Install step 4) saves the flight recorder
  (kwin-i3's log, kwini3hold's events, the pointer's, the state, a screenshot, a note) to
  `~/.local/state/kwin-i3/captures/<time>/`. **Read it with `tools/capture-read DIR` first**: one
  timeline to the millisecond, the press last. kwin-i3's log never reaches the journal, and
  `debugLog` does nothing live (`docs/debugging.md`). Each one gets a diagnosis first; with the go,
  a live test watched red, then the fix.
- **`make fuzz`** (`tests/fuzz/`, `docs/fuzz-design.md`) runs random actions with pixel invariants.
  **Not during the Stage** (`LATER.md`, "Reliability"), and when it returns, in runs of 5 minutes
  or less. `tests/fuzz/run.py --reshrink SEED` shrinks a saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`: `docs/kwin-notes.md`.

## Testing

**`docs/testing.md`, lean for the Stage**: testing's one job now is not to break a live desktop
catastrophically. Its runs are the only runs: `make unit` and the changed scenario(s) for a change
(and 64 for a plugin change), at most one `make test` per session, at its start and only when the
work needs it, a probe for a KWin question. **Tests are tools, not debts**: never list a test as
owed, and report problems, never green runs. No run over 5 minutes, ever. Fault runs, fuzzing and
stock runs wait in `LATER.md`. A case it doesn't cover: ask the maintainer first. **No new test of
any kind without the maintainer's go, and only with a strong case** (its rule 5: an agent given a
handle will grab it).

- **Long runs** (anything over ~30 s) run in the background, never the foreground: the person must
  be able to talk to you. Find where the run writes its results first (often not its console).
  Then a 2-minute recurring timer (`CronCreate` where the harness has it; any recurring wake-up
  otherwise; never `sleep`), and at each firing **read those results yourself** and give a
  one-line status. A notification or silence is not a check. Results that all fail the same way
  early: stop the run and say so. Delete the timer at the end.
- **Before a rerun**: is what's under test rebuilt (`make build` for the script, `make plugin` for
  the plugins, `make kcm` for the settings page's QML)? Name the cause from the evidence first; one
  rerun per fix, never one per guess.
- Before saying "no scenario drives it", grep `tests/live` for every setting the change reads.

## Working rules

- Edit `src/`, then `docs/testing.md` P1; a behaviour change updates `docs/behaviour.md` in the
  same commit. `make build` (`build.sh`) writes `package/contents/code/main.js`; never edit it by
  hand, but commit it.
- During the Stage (`OPEN.md`), a new test tool is its own proposal.
- A new KWin trap goes in `docs/kwin-notes.md`; a decision in its home (`docs/README.md`). Facts
  about this project belong in the repo, not in one agent's private memory, so every agent has them.
- **The repo is public: it speaks for the project, not for a person.** A rule is stated as the
  rule; when it needs a reason, the reason in a clause of your own words. No names, no quotes from a
  conversation, no "X said" or "X decided", no decision numbers or session stamps, in docs, comments,
  test labels and commit messages alike. Nothing about anyone's machines, hardware, accounts or
  setup: that goes in the person's own `CLAUDE.local.md`. Git records who and when; a doc says what
  and why. A design record or a session's working notes stay out of the tree.
