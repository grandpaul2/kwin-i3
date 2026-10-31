# kwin-i3's docs: what each is for

Each kind of fact has one home. A fact found in two places is a bug in the docs: keep it in its
home and point there from the other.

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
| why kwin-i3 builds on KWin's own tile tree (the probe that chose it) | `kwin-tiles.md` |
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
- **`behaviour.md`**: the behaviour as built, from the code. Where a doc disagrees, the code
  decides and this page follows it.
- **`testing.md`**, **`debugging.md`**, **`style-settings-page.md`**: procedures.
- **`kwin-notes.md`**: KWin's behaviour as found, by topic; a new trap gets a line, a wrong one is
  corrected in place.
- **`fuzz-design.md`**: the fuzzer and the capture key (tools still in use).
- **`input-tests-design.md`**: the real-input live tests (libei; scenarios 50, 51).
- **`i3-feature-map.md`**: dated, but its row ids are cited across the docs; a row that goes stale
  is corrected in place.

- **`kwin-tiles.md`**: the probe that chose KWin's tiles; dated, kept for the reasons.

## Writing one

- A new decision goes straight into its home above (a standing decision in `plan.md`, a
  behaviour in `behaviour.md`), with its reason in a clause. The proposal and the options weighed
  belong in the pull request or the conversation, not in a file in the tree.
- A review's findings land in the code, `behaviour.md`, `OPEN.md` or `LATER.md`; the review
  itself is not kept as a file.
- The words a user reads: `style-settings-page.md` (the glossary) and `philosophy.md`, "How it
  presents itself".
- State, not history, in the standing docs and the open lists; history is git's.
- The voice: the project's, not a person's (`AGENTS.md`, "Working rules"): no names, quotes or
  decision stamps.
