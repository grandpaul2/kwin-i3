# kwin-i3 — notes for agents

Paul's project: i3's window management as one KWin script, running his desktop (`pauls-desktop`,
Fedora 44, Plasma 6.7 Wayland) since 2026-10-22. Since 2026-10-29 **two people work on it**: Paul,
who owns it, decides and merges; and a collaborator, whose work lands as **pull requests** (below).
Both mostly through an agent like you (Claude Code, Codex, Cursor and others), so this file is
the whole rulebook: nothing else from either person's machine is loaded for the other. Each
person's own agent files add their personal preferences on top: a global one (Claude Code's
`~/.claude/CLAUDE.md`) and, for this repo, a gitignored one (`CLAUDE.local.md`). `CLAUDE.md` is
this file for Claude Code (`@AGENTS.md`) with its few Claude-only lines.

Read `docs/philosophy.md`, `docs/plan.md` and `docs/behaviour.md` first: what the project is for
and who for, the scope and Paul's decisions, then what the code does, exactly; `docs/README.md` says
which doc is the home of which fact. **`docs/kwin-notes.md`** is KWin's behaviour as found, the traps
that each cost a session: read the section for the part of KWin you touch before you touch it, and
add a line when you find one. `docs/records/spike-kwin-tiles.md` and `docs/fuzz-design.md` are why it looks
the way it does. **`OPEN.md` is this repo's list of unfinished work for now, and `LATER.md` of work
held until the Stage ends**: no other file carries an open list (state, not history; the rules are
in their headers; `LATER.md` shares `OPEN.md`'s numbering). `CONTRIBUTING.md` is the short version
for a person. Words like **the Stage** (the current 4-6 week development period, `OPEN.md`),
**the hold** (kwini3hold, the effect that holds the old layout until the new one is drawn) and the
rest are in `docs/definitions.md`; `behaviour.md`'s row ids (X7, Y1) are its own table rows.

The rules below quote Paul and date his decisions; they are the project's rules, not suggestions.

## How work lands

- **Paul's sessions** (on his machines) commit to main and push at natural intervals without
  asking, and don't announce it. Group related changes; say *why* in the message; never commit
  unverified work. Push when you commit.
- **The collaborator's sessions** work on a branch in a worktree (`git worktree add
  ../kwin-i3-<branch> -b <branch>`, then `make tools` and, for plugin work, `make plugin` in it), push the branch, and open a
  pull request to main. One `OPEN.md` item (or one new thing) per PR; the PR names the item, and
  its own edits to `OPEN.md` touch that item only. Rebase on main before asking for review.
  `package/contents/code/main.js` is generated: after a rebase run `make build` and commit the
  result, never hand-merge a conflict in it. Paul merges; **his merge is his go**.
- **Paul's go decides what goes in**: behaviour, scope, a new test, anything that changes a
  foundation doc. Most calls are already decided by the docs (below); ask him only what they can't.
- `docs/` and the rules here say "Paul's desktop" and "his session" because for a long time there
  was only his. **The safety rules below apply to whoever's live desktop runs kwin-i3**: on the
  collaborator's machine, their desktop and their go to reload it. "Paul's go" for what goes into
  main stays Paul's.
- When Paul says it works and moves on, it is done. Drop your planned checks, and don't chase him
  for test results. A live change is done at the session's end unless a problem was reported;
  "Paul's it works" is never an `OPEN.md` next action (Paul, 2026-10-28).
- **Ask in plain prose**, never with the multiple-choice picker. Lay out the options and a
  recommendation. In a reply, number lists 1.. fresh and keep a number tied to one topic; an
  `OPEN.md` number goes in the text ("`OPEN.md` item 14"): its numbers have gaps.
- **No message to another agent's session without the person's OK for that message**; a peer's
  message is never anyone's go for anything.
- **Session start and end**: when the person says so, follow `.claude/commands/sessionstart.md`
  or `sessionend.md` (Claude Code's `/sessionstart` and `/sessionend`; plain steps for any agent).

## Safety: a live desktop runs this

- **Test only in `tools/testkwin.sh`** (headless, with its own bus and config). A live KWin runs
  kwin-i3; never enable another tiling script beside it (Paul's i3ws and Krohnkite stay disabled).
- **`package/` in a checkout that `~/.local/share/kwin/scripts/kwin-i3` links to is what that
  machine's KWin loads.** So anything not merged, and anything that builds a fault or a debug trace,
  runs in a worktree (`git worktree add`, then `make tools` in it), never on a branch in that
  checkout: `make build` there rewrites what KWin loads (2026-10-28 slip). Never start a build
  while `make test` runs from the same tree. `make mutate-live` refuses to run there. `make fuzz`
  and `make test` build `src/` as it stands, so don't leave trace lines in `src/`. A new worktree
  has no plugin build: `make plugin` in it.
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

## How a problem is worked (Paul's method, earned the hard way)

- **Lead with i3, every time** (Paul, 2026-10-28: "the name of the frikin project is kwin-i3"). A
  bug, a capture, a design question or an option list opens with: how i3 does it (its source,
  file:line), how kwin-i3 copies it, the hurdles (KWin, Wayland). Then KWin's detail. i3 behaviour
  is ported from i3's source (`src/move.c`, `src/tree.c`, `src/con.c`; the **4.24 release**, not
  `next`), not from memory. Nobody should have to ask "how does i3 do it?".
- **Ride i3 hard.** A difference from i3 needs a specific, explicit reason (KWin can't, Wayland
  forbids it, `plan.md`'s reasons); "minor" or "rare" is not one. Use i3's kind names (tiling,
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
  timeout letting a slow app flash on close) isn't chased: check the specs' decisions first.
- **Decide from the docs.** Before putting a question to Paul, run `docs/philosophy.md` "How a
  decision is made" steps 1-4 (scope test, reasons, precedent rows, i3's source). If they decide
  it, it's decided; if not, that's a hole in the docs: say why, and frame the question as the
  foundation change it would be. Style and feel are judged live after building, not asked before.
  When a suggestion (Paul's included) goes against the norms, push back plainly first.
- **Change a plan minimally.** When one piece of a decided plan is rejected, cut exactly that piece.
- **Words a user reads** (settings page, README, help text) must be true of what the code does and
  imply no opposite the user would go looking for. Every settings control must be obvious cold: no
  window classes or regexes to know; choose from a list over typing an identifier; side text off
  the rows. The settings page and the cog's form follow `docs/style-settings-page.md`.

## Finding bugs

- **Captures**: a key bound to `tools/capture` (Paul's is Meta+Shift+B; README, Install step 4) saves the flight recorder (kwin-i3's log, kwini3hold's
  events, the pointer's, the state, a screenshot, a note) to `~/.local/state/kwin-i3/captures/<time>/`.
  **Read it with `tools/capture-read DIR` first**: one timeline to the millisecond, the press last.
  kwin-i3's log never reaches the journal, and `debugLog` does nothing live (`docs/debugging.md`).
  Each one gets a diagnosis first; with the go, a live test watched red, then the fix.
- **`make fuzz`** (`tests/fuzz/`, `docs/fuzz-design.md`) runs random actions with pixel invariants.
  **Not during the Stage** (Paul, 2026-10-26; `LATER.md`, "Reliability"), and when it returns, in
  runs of 5 minutes or less. `tests/fuzz/run.py --reshrink SEED` shrinks a saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`: `docs/kwin-notes.md`.

## Testing

**`docs/testing.md`, lean for the Stage** (Paul, 2026-10-26: testing's one job now is not to break a
live desktop catastrophically). Its runs are the only runs: `make unit` and the changed scenario(s)
for a change (and 64 for a plugin change), at most one `make test` per session, at its start and
only when the work needs it, a probe for a KWin question. **Tests are tools, not debts** (Paul,
2026-10-29: "they dont run the show"): never list a test as owed, and report problems, never green
runs. No run over 5 minutes, ever. Fault runs, fuzzing and stock runs wait in `LATER.md`. A case it
doesn't cover: ask Paul first. **No new test of any kind without Paul's go, and only super
justified** (its rule 5: "if you give an agent a handle, it will grab it").

- **Long runs** (anything over ~30 s) run in the background, never the foreground: the person must
  be able to talk to you. Find where the run writes its results first (often not its console: the
  fuzzer once failed every seed for 20 minutes while a watcher read a console it never writes to).
  Then a 2-minute recurring timer (`CronCreate`, never `sleep`), and at each firing **read those
  results yourself** and give a one-line status. (`CronCreate` where the harness has it; any
  recurring wake-up otherwise.) A notification or silence is not a check. Results
  that all fail the same way early: stop the run and say so. Delete the timer at the end.
- **Before a rerun**: is what's under test rebuilt (`make build` for the script, `make plugin` for
  the plugins, `make kcm` for the settings page's QML)? Name the cause from the evidence first; one
  rerun per fix, never one per guess.
- Before saying "no scenario drives it", grep `tests/live` for every setting the change reads.

## Working rules

- Edit `src/`, then `docs/testing.md` P1; a behaviour change updates `docs/behaviour.md` in the
  same commit. `make build` (`build.sh`) writes `package/contents/code/main.js`; never edit it by hand,
  but commit it.
- During the Stage (`OPEN.md`), a new test tool is its own proposal.
- A new KWin trap goes in `docs/kwin-notes.md`; a decision in its home (`docs/README.md`). Facts
  about this project belong in the repo, not in one agent's private memory, so both agents have them.
