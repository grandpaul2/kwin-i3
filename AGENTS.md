# kwin-i3 — notes for agents

kwin-i3 is i3's window management as one KWin script and two small KWin plugins. The maintainer
owns it, decides and merges; contributors' work lands as pull requests (below). Most of the
work is done through an agent like you (Claude Code, Codex, Cursor and others), so this file is
the whole rulebook: nothing from one person's machine is loaded for another. Each person's own
agent files add their personal preferences on top: a global one (Claude Code's
`~/.claude/CLAUDE.md`) and, for this repo, a gitignored one (`CLAUDE.local.md`). `CLAUDE.md` is
this file for Claude Code (`@AGENTS.md`).

Read `docs/philosophy.md`, `docs/plan.md` and `docs/behaviour.md` first: what the project is for
and who for, the scope and its decisions, then what the code does, exactly; `docs/README.md` says
which doc is the home of which fact. `docs/kwin-notes.md` is KWin's behaviour as found, the
traps that each cost a session: read the section for the part of KWin you touch before you touch
it, and add a line when you find one. `OPEN.md` is this repo's list of unfinished work for now,
and `LATER.md` of work held until the Stage ends: no other file carries an open list (state, not history; the rules are in their
headers; `LATER.md` shares `OPEN.md`'s numbering). `CONTRIBUTING.md` is the short version for a
person. Words like **the Stage** (the period before a release, now its beta, `OPEN.md`), **the
hold** (kwini3hold, the effect that holds the old layout until the new one is drawn) and the rest
are in `docs/definitions.md`; `behaviour.md`'s row ids (X7, Y1) are its own table rows.

## How work lands

- **The maintainer's sessions** commit to main and push, never unverified work.
- **A contributor's sessions** work on a branch in a worktree (`git worktree add
  ../kwin-i3-<branch> -b <branch>`, then `make tools`, `make lint-tools` and, for plugin work,
  `make plugin` in it), push the branch, and open a pull request to main. One `OPEN.md` item (or
  one new thing) per PR; the PR names the item, and its own edits to `OPEN.md` touch that item
  only. Rebase on main before asking for review. `package/contents/code/main.js` is generated:
  after a rebase run `make build` and commit the result, never hand-merge a conflict in it. The
  maintainer merges; **the merge is the go**.
- **The maintainer's go decides what goes in**: behaviour, scope, a new test, anything that changes
  a foundation doc. Most calls are already decided by the docs (below).
- **Spec before work, the spec reviewed before building.** Every change to `src/`, `plugin/` or
  `tools/capture`, bug fixes included, starts as a spec, and an outside review of the spec comes
  before any code: it is where a wrong tree is caught, while turning back is cheap. Two workflows,
  by the change's size; the only changes outside both are docs alone and the settings page's look,
  judged live.

  **A smaller change** (one feature or one fix, in the script or in one plugin): **one review**.
  1. **Spec**: i3 first (its source, file:line); for a bug, the cause named from the evidence
     (the capture, a test-KWin trace, KWin's source). Then what changes, the `behaviour.md` rows
     and any foundation it touches, the blast radius (every path the change runs through: other
     modifiers, the helper's filters, floating containers, other outputs, every animation and
     effect, with and without the plugins), and the runs that will check it (existing scenarios;
     a new test only with the go).
  2. **The spec's review**: an outside agent given the spec and the code it touches, not your
     conclusions, asked what is wrong, what breaks, and the smallest version. Its report in a file.
  3. **The maintainer's go**: they hear the review's verdict and the adjusted plan; their go on
     the spec is the go to build. **An answer is not a go**: answering a question builds nothing.
  4. **Build** to the spec in a worktree; **test** as `docs/testing.md` says; **live** with the go
     ("Safety").

  **A larger change** (several features, or one that reaches across the script and the plugins
  in new ways): **two reviews**, the smaller workflow's steps 1-3, then:
  4. **Build** to the spec in a worktree.
  5. **The diff's review**: an outside agent given the spec and the diff, not your conclusions,
     its report in a file. Every finding is checked against the code before it is fixed or
     answered, and the maintainer hears what was found and done.
  6. **Test** as `docs/testing.md` says; **live** with the go ("Safety").

  When unsure which, it is the larger. The spec and its reviews are working notes, outside the
  tree: the maintainer's in their private notes, a contributor's in the pull request.
- **The safety rules below apply to whoever's live desktop runs kwin-i3**: on a contributor's
  machine, their desktop and their go to reload it. The go for what goes into main stays the
  maintainer's.
- A live change is done at the session's end unless a problem was reported; someone's
  confirmation is never an `OPEN.md` next action.
- An `OPEN.md` number goes in the text with its file ("`OPEN.md` item 14"): its numbers have
  gaps.
- **Session start and end**: when the person says so, follow `docs/session-start.md` or
  `docs/session-end.md` (plain steps for any agent; where shared session steps are installed,
  they run these).
- **The foundation sweep**: every so often, the foundations, `behaviour.md`, i3's source and the
  code are read against each other, and the maintainer gets only the conflicts between
  foundations: `.claude/skills/foundation-sweep/` (Claude Code's `/foundation-sweep`; plain steps).

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
  with the go: `make plugin-install` (loads into the running KWin), `make kcm-install` and
  `make widget-install`.
- **Nothing that shows a window on a live desktop** without saying so first.
- **What the live desktop can tell without a person**: a read-only query (D-Bus, the journal,
  config; `docs/kwin-notes.md` "Config and D-Bus"), a test-KWin probe, or the source. A desk test
  is for what none of those can give: what the person sees, what they want.

## How a problem is worked

- **Lead with i3, every time**: the project is named for it. A bug, a capture, a design question or
  a plan opens with: how i3 does it (its source, file:line), how kwin-i3 copies it, the
  hurdles (KWin, Wayland). Then KWin's detail. i3 behaviour is ported from i3's source
  (`src/move.c`, `src/tree.c`, `src/con.c`; the 4.24 release, not `next`), not from memory.
- **Ride i3 hard.** A difference from i3 needs a specific, explicit reason (KWin can't, Wayland
  forbids it, `plan.md`'s reasons); "minor", "rare", "nobody sees it" and the cost of the change
  are not. This holds inside the code as much as in behaviour: the model's shapes and flags are
  i3's (Con types, where a flag sits), and a difference labelled "on purpose" with no reason in
  `plan.md` is a defect to close, not a precedent to build on. Use i3's kind names (tiling,
  floating, dock, override-redirect; sticky is a floating window's state; and the root window,
  which is no kind), never "places itself" or "unmanaged".
  The exception is the look: blending with Plasma is a reason, at no performance cost.
- **Understand, then decide.** When a fix fails or a second one is proposed, the model of the
  problem is usually wrong: map it fully (i3 first, what KWin allows, measured not guessed), then
  give a verdict on cost against value. Going back to how it was is fine, once the full map says so.
- **Cause before fix.** No retry, repaint or belt-and-braces for a bug whose cause isn't known.
  Narrow it from evidence: the capture, a test-KWin trace, KWin's source for the installed version
  (`rpm -q kwin`, then `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`; don't guess), a web
  search early, an independent agent's read. Only then a desk test for a person.
- **Dive until solved.** A red test is dug into with probes until its cause is named and fixed,
  never parked as "looks flaky". But a symptom inside a trade already accepted (the hold's 200 ms
  timeout letting a slow app flash on close) isn't chased: check the docs' decisions first.
- **Decide from the docs; a gap is a hole, not a choice.** A question, and each step of a plan,
  is settled by `docs/philosophy.md` "How a decision is made" steps 1-4 (the foundations,
  precedent, i3's source, a hole). The maintainer decides only the foundations themselves: a
  conflict between two, or a hole's repair (steps 4-5). So a plan is one plan, i3's way, each step
  citing what settled it, never options. Where the docs contradict each other or say nothing, the
  holes that would finish the plan are named, and each is worked (the premise that let it open,
  i3's source, what Plasma and KWin allow, the precedents, the philosophy) into a repair to its
  foundation, not a one-time fix. Style and feel are judged live after building. A suggestion
  (anyone's) against the norms doesn't change them.
- **Change a plan minimally.** When one piece of a decided plan is rejected, cut exactly that piece.
- **Words a user reads** (settings page, README, help text) must be true of what the code does and
  imply no opposite the user would go looking for. Every settings control must be obvious cold: no
  window classes or regexes to know; choose from a list over typing an identifier; side text off
  the rows. **The settings page is finished**: anything added to it,
  moved or removed follows `docs/style-settings-page.md`, "Adding to the page" (its place and
  shape from the page as it stands, the whole tab screenshotted before and after), and is judged
  live by the maintainer before it is done.

## Finding bugs

- **Captures**: a key bound to `tools/capture` (README, Install step 6) saves the flight recorder
  (kwin-i3's log, kwini3hold's events, the pointer's, the state, a screenshot, a note) to
  `~/.local/state/kwin-i3/captures/<time>/`. Read it with `tools/capture-read DIR` first: one
  timeline to the millisecond, the press last. kwin-i3's log never reaches the journal, and
  `debugLog` does nothing live (`docs/debugging.md`).
- **A capture, a bug report or a red** gets a diagnosis first (i3, then the cause named from the
  evidence); its fix is a change like any other, through the smaller or larger workflow ("How
  work lands"), with a live test watched red before the fix where one can show it.
- **`make fuzz`** (`tests/fuzz/`; `docs/fuzz-design.md` is why it looks as it does) runs random
  actions with pixel invariants. Not during the Stage (`LATER.md`, "Reliability"), and when it
  returns, in runs of 5 minutes or less. `tests/fuzz/run.py --reshrink SEED` shrinks a saved failure again.
- Its finds cluster at the KWin seam (hidden desktops, monitor unplug/replug, fullscreen, modal
  dialogs), not in `tree.js`: `docs/kwin-notes.md`.

## Testing

`docs/testing.md`, lean for the Stage: testing's one job now is not to break a live desktop
catastrophically, and its runs are the only runs. No run over 5 minutes. A test is a tool, never
listed as owed. A case it doesn't cover is the maintainer's call, and no new test of any kind
(a tool included) comes without the maintainer's go and a strong case (its rule 5).

- **Before a rerun**: is what's under test rebuilt (`make build` for the script, `make plugin` for
  the plugins, `make kcm` for the settings page's QML)? Name the cause from the evidence first; one
  rerun per fix, never one per guess.
- "No scenario drives it" holds only once `tests/live` has been grepped for every setting the
  change reads.

## Working rules

- `make format` before each commit; style is the formatters' (`docs/testing.md`, "Formatting and
  lint").
- Edit `src/`, then `docs/testing.md` P1; a behaviour change updates `docs/behaviour.md` in the
  same commit. `make build` (`build.sh`) writes `package/contents/code/main.js`; never edit it by
  hand, but commit it.
- A new KWin trap goes in `docs/kwin-notes.md`; a decision in its home (`docs/README.md`). Facts
  about this project belong in the repo, not in one agent's private memory, so every agent has them.
- **The repo is public: it speaks for the project, not for a person.** A rule is stated as the
  rule; when it needs a reason, the reason in a clause of your own words. No names, no quotes from a
  conversation, no "X said" or "X decided", no decision numbers or session stamps, in docs, comments,
  test labels and commit messages alike. Nothing about anyone's machines, hardware, accounts or
  setup: that goes in the person's own `CLAUDE.local.md`. Git records who and when; a doc says what
  and why. A design record or a session's working notes stay out of the tree.
