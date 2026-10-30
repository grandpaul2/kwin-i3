# kwin-i3's docs: what each is for

Each kind of fact has one home. A fact found in two places is a bug in the docs: keep it in its
home and point there from the other. (Paul, 2026-10-27.)

| a fact about | its home |
|---|---|
| what a word means (one name per thing, i3's where i3 has one) | `definitions.md` |
| what kwin-i3 is for, who for, the lines it draws, how a decision is made | `philosophy.md` |
| the scope, what is left out, the reasons a difference from i3 may have, the standing decisions | `plan.md` |
| what the code does today, exactly, with its known limits; each difference from i3 (its ≠ rows are the list) | `behaviour.md` |
| how to test, and which runs are the only runs | `testing.md` |
| how to read a bug capture | `debugging.md` |
| what KWin and Plasma actually do where they surprised us (the traps, from source and probes) | `kwin-notes.md` |
| how the settings page looks and reads | `style-settings-page.md` |
| i3's features against kwin-i3, KWin and Plasma (a study, 2026-10-25, cited as "finding N", "row X") | `i3-feature-map.md` |
| work for now / held until the Stage ends | `../OPEN.md` / `../LATER.md` (the only open lists) |
| installing and configuring, for a user | `../README.md` |
| how an agent works here, and how work lands (pull requests) | `../AGENTS.md` (`../CLAUDE.md` loads it for Claude Code) |
| the same, short, for a person | `../CONTRIBUTING.md` |
| what changed, by release | `../CHANGELOG.md` |

## Standing docs: kept true

Edited in place whenever what they describe changes, in the same commit as the change.

- **`definitions.md`**: the words, one name per thing, i3's where i3 has one.
- **`philosophy.md`**: the purpose, the lines, and how a decision is made; a decision against it
  changes it first.
- **`plan.md`**: goal, scope (the test, In, Out, the reasons a difference may have, settings,
  plugins), the numbered decisions, the keys' origin, the focus design, the risks. Its history
  (the phases, the switch-over) is in git.
- **`behaviour.md`**: the behaviour as built, from the code. Where a spec disagrees, the code
  decides and this page follows it.
- **`testing.md`**, **`debugging.md`**, **`style-settings-page.md`**: procedures.
- **`kwin-notes.md`**: KWin's behaviour as found, by topic; a new trap gets a line, a wrong one is
  corrected in place.
- **`fuzz-design.md`**: the fuzzer and the capture key (tools still in use).
- **`input-tests-design.md`**: the real-input live tests (libei; scenarios 50, 51).
- **`i3-feature-map.md`**: dated, but its row ids are cited across the docs; a row that goes stale
  is corrected in place.

## Records: why it is the way it is

In `records/`. Frozen once built: **only their status line changes**, saying what happened and where the
current truth is (`behaviour.md`, or the spec that superseded it). Read one for the reasons, the
alternatives weighed, the probes, Paul's words; not for what the code does now.

- **`spec-*.md`**: one decision each, with Paul's go. The name says the subject. Its `**Now:**` line, under
  the title, is the status. Item numbers inside are `OPEN.md`'s of the day: the item may since
  have moved to `LATER.md` (same number) or closed.
- **`spike-kwin-tiles.md`**: the 2026-10-21 probe that chose KWin's tiles.
- **`bug-*.md`**: an investigation too long for a commit message.
- **`mouse-plugin-design.md`**: the chord plugin, dropped 2026-10-24.

Reviews are not kept as files: a review's findings land in the spec, the code, `behaviour.md`,
`OPEN.md` or `LATER.md`, and the review itself is in git history (the ones before 2026-10-27:
`git show 3d98bd2:docs/<name>`).

## Writing one

- A new decision: a `records/spec-<subject>.md`, with Paul's go at its top. When built, its behaviour goes
  into `behaviour.md` and the spec's status line says so.
- The words a user reads: `records/spec-window-words.md` and `philosophy.md`, "How it presents itself".
- State, not history, in the standing docs and the open lists; history is git's.
