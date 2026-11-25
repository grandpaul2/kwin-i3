# Testing: the procedure (lean, for the Stage)

During the Stage kwin-i3 runs on a handful of desktops whose owners use it all day: they will
find what's wrong. Testing has one job: **don't break a live desktop catastrophically.** Real
harm here is a crashed or hung KWin, a desktop its user can't work on (windows lost or out of
reach, the tree, focus, workspaces or keys broken), or a user's Plasma settings lost or not given
back; a glitch the user sees and can report with the capture key is not. A test exists only for
real harm that nothing cheaper (the unit tests, lint) catches. Everything beyond that waits for the Stage's end (`LATER.md`, "Reliability"). No improvising:
the runs below are the only runs.

## Rules

**"The go"** below: in the maintainer's own sessions, their word; for a contributor, asked in the
pull request (its description, or a comment) and given there. The merge is the go for the
change; the reload of a desktop is its owner's go.

1. **Only the runs listed here.** No extra run "to be sure", no whole-suite run but P3's, no run
   to chase a flake.
2. **No run over 5 minutes, ever.** A longer one is split into runs of 5 minutes or less.
   **Anything over a few seconds runs in the background**: `make unit` in the foreground, every
   scenario run and `make test` in the background. A run is checked by reading its result files,
   never by a notification or silence: while `make test` or a scenario runs,
   `$TMPDIR/tmp.*/NN-*.sh.log` (`/tmp` when unset); after the run, a red scenario's output and
   kwin-i3's log in `tests/live/out/`, and `.status`.
3. **A case not covered here: ask the maintainer** before running anything for it.
4. **The desktop owner's "it works" ends it** (AGENTS.md): the checks left are dropped, and no
   result is owed after it.
5. **No new test without the go, and only with a strong case**: the suite grows by decision, not
   because a test can be written. A new test is any new scenario, check, unit test, fault, probe or test tool. Before writing
   one, say in a few lines what catastrophic breakage of a live desktop it guards against that its
   user wouldn't see, and what it costs to run; write it only after the go. "It would be good to cover", "the procedure has a gap" or "a
   change should have a test" are not reasons. Updating an existing check that a decided change
   makes wrong is not a new test.

## Formatting and lint

Style is each language's formatter's; nothing about style is written anywhere else.
`make format` rewrites every tracked file to it; `make lint` (`tools/lint.sh`) checks formatting
and runs each language's linter, in about 15 seconds, and `make unit` runs it first, so every
change is checked by it (a check inside the tests, added with the go, rule 5).
`tools/lint.sh check js` (or `cpp`, `qml`, `py`, `sh`) does one language.

| language | formatter | linter | config |
|---|---|---|---|
| C++, C | clang-format 22 | the compiler's warnings | `.clang-format`, KDE's (ECM's `KDEClangFormat`), as Plasma's repos use it |
| QML | qmlformat 6.11 | qmllint 6.11 | `.qmllint.ini` |
| JS, JSON | prettier | eslint, recommended rules | `prettier.config.mjs`, `eslint.config.mjs` |
| Python | ruff 0.17 | ruff | `ruff.toml` |
| shell | shfmt 3.7, `-i 4` | shellcheck 0.11 | `.shellcheckrc` |

- **The versions are pinned.** prettier's and eslint's are in `package-lock.json`, fetched into
  `node_modules/` by `make lint-tools`, once per checkout or worktree (the only step that uses
  the network). The rest are the distribution's packages, at the versions above (`tools/lint.sh`
  names them). A tool that is missing, or at another version, is skipped with a line saying so,
  because another version formats differently, and a machine must not go red with nothing to
  fix. Moving to a new version is its own commit: the version changed in `tools/lint.sh` and here,
  and the tree reformatted. qmllint is skipped, too, when a KDE QML module the files import
  isn't installed, and prettier and eslint when node is older than eslint needs.
- **Where a config differs from the tool's default, the reason is in the config.** In short: a
  4-space indent for JS and shell, as the C++ and QML beside them; no comma after a call's last
  argument, which an older Qt's engine may not parse; qmllint's unqualified-access check off,
  because the settings page's `kcm` and the widget's `plasmoid` are context properties it can't
  see; shellcheck's SC2016 off (a literal `$` in single quotes, on purpose here) and SC2012 (`ls`
  lists only directories the scripts name themselves), and sourced files followed; ruff's rule set
  written out, because its default set changes between releases; eslint told which names
  `src/`'s files share, because `build.sh` makes them one script.
- **A real bug a linter finds** is not fixed under the lint: the line gets the linter's disable
  comment with the `OPEN.md` item that fixes it.
- **Not formatted**: CMake (no standard formatter; KDE formats none of its CMake), Markdown
  (prose wrapped by hand at 100 columns; no standard formatter) and XML (KConfigXT and Wayland
  protocol files, written by hand in KDE and Wayland too).

## P1. A change

1. `make unit`.
2. The scenario(s) that drive what changed, alone: `tests/live/run.sh NN-name.sh`. A scenario
   whose expectation the change alters on purpose (a decided change) is updated in the change.
   None drives it: nothing to run here; P3's `make test` is the guard.
3. **A change under `plugin/`: `64-plugin-reload.sh` too, before every live install** (alone,
   with step 2's scenarios; it needs `make plugin` first, or `run.sh` skips it). A plugin bug takes down the whole desktop, and 64 unloads and
   reloads the plugins, then uses the mouse: the only kind of break that is catastrophic here
   (a filter a destroyed object leaves installed crashes KWin on the next mouse move; 64 catches
   that).
4. Update `docs/behaviour.md` in the same commit. Commit (on a branch if it isn't live yet). No
   new checks for the new behaviour (rule 5).

**A check that moves the pointer** (written or changed): a move onto a window other than the
active one is an action, since focus follows mouse activates it a turn later
(`docs/kwin-notes.md`, "The pointer"). Wait for that activation before pressing, never press
straight after the move, and never move between a focus-parent selection and the press it tests:
place the pointer first, then set focus by key or script.

## P2. A bug fix

Diagnosis first (the capture, `tools/capture-read`; KWin's source for KWin's part), the go;
then the fix and P1. A check for the bug only under rule 5.

## P3. Before anything goes live

1. **`make test` once per change, at its end, only when the change reaches what many scenarios
   drive** (the tree, placement, the KWin seam; ~4 min, in the background). A limit, not a duty:
   a run is never listed as owed, and a change P1's scenarios cover needs none.
2. A red scenario the change drives: fix it, then rerun only that scenario.
3. A red scenario it doesn't: one run of it alone. Green: its red log diffed against the green
   one first, since green alone is no proof of a flake; a cause in the scenario is fixed (below),
   and only a cause in load or timing moves it to the alone tail (`# timing: alone`, with that
   cause named beside it), not another guessed fix. Red: report
   it, don't fix it. A red whose cause the logs name in the scenario itself (a check reading
   state before it has settled) is a wrong check, not a flake: the check is corrected, as any
   existing check a change shows wrong, and not moved.
4. The maintainer's go to merge, then the desktop owner's go to reload (AGENTS.md, "Nothing goes live").

## P4. A probe

A question about KWin that blocks a design, with the go (rule 5): the smallest scenario that
answers it, in a worktree on branch `probe-<name>`, numbered 90 and up, run alone. The answer goes into `docs/kwin-notes.md`; the branch is never merged.
A probe of a live report is set up as the live desktop is: the plugins loaded when it runs them
(the hold delays a newcomer's first pass, and a bug can live in that delay), and the workspaces
shown and hidden as they were. It reproduces the report red before a fix is believed: a probe
that passes on the unfixed code tested something else.

## P6. A promotion to `stable`

Users run the `stable` branch; the work lands on main, which the maintainer's desktop runs first,
so every change is used daily before anyone else gets it (`CONTRIBUTING.md`). A promotion, when
main is ready rather than on a schedule, and at least once a week while main has code changes
`stable` lacks (session start says when one is due), moves `stable` to main once all of these
hold:

1. **The maintainer's use**: main's script and plugins run on the maintainer's desktop, and the
   maintainer says the changes since `stable` work, with no capture of kwin-i3's open. During
   the beta no set time goes with it: a fix for the beta's users is better out the same day.
2. **`make test`** on the host, green (P3's one for the session).
3. **Every scenario in both containers** (P5), `KI3_BOX=arch` and `KI3_BOX=pika`, green: one
   container at a time, each in runs of 5 minutes or less (thirds by first digit: `0-4`, `5-6`,
   `7-9`; PikaOS's halves took over 5), in the
   background, read as rule 2 says. A red: P3 steps 2-3. The images build no settings page, so its
   scenarios (37, 76) run on the host only: it is QML, the same on every distribution.

Then on main: `CHANGELOG.md`'s "Unreleased" gets the version and date, `package/metadata.json`'s
`Version` the same (`1.N.0`); commit, tag `v1.N.0`, push, and `git push origin main:stable`.
`stable` only moves forward: never a force-push, since users `git pull` it.

**A fix for a beta user's bug** doesn't wait for the next promotion: it lands on main (P2), then
goes onto `stable` in a worktree (`git worktree add ../kwin-i3-stable stable`, never the live
checkout, whose `package/` KWin loads): cherry-pick it, `make build` for `main.js` rather than
merging that file, run the changed scenarios in both containers, tag `v1.N.M`, push. The next
promotion then merges main into `stable` in the same worktree (`git merge main`, `main.js` taken
from main) instead of the plain push.

## Not during the Stage

In `LATER.md`, "Reliability": fault runs (`make mutate-live`, `make mutate`, faults by hand), the
fuzz campaign (`make fuzz`). When they come back, each is split into runs of 5
minutes or less. `tests/live/mutate.py` keeps the faults already written (86-tiling-drag's 59) for
then.

## P5. Another KWin (`tools/box.sh`)

A question about another distribution's KWin (a beta user's bug there, a red seen only there):
the scenarios P1 or P2 would run, in an Arch container with Arch's KWin 6.8.2 (an Arch-based
user's, CachyOS's) on the host (`tools/box.sh build` once, then
`tools/box.sh run bash -c 'make tools plugin && tests/live/run.sh NN-name.sh'`, in the
background; `KI3_BOX_OUT=<dir>` keeps a red's output). It copies the checkout and writes nothing
to it. It renders through Mesa on the host's AMD or Intel GPU (`tools/box.sh` passes only those), so
its pixels are Mesa's, never NVIDIA's.
`KI3_BOX=pika`: PikaOS's KWin 6.7.4 and Debian's package names, the same way, the gate's 6.7
when the host runs 6.8. Nothing in either
reaches a live desktop: a fix still goes live by P3.
