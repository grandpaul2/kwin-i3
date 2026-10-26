# Testing: the procedure

Paul, 2026-10-26: "we DO NOT improvise when it comes to testing." Every test run in this repo is a
step of one of the procedures below, done as written. Where they don't fit, the procedure changes
first (rule 3), then the run.

Why it looks like this: an audit of a session (2026-10-26) found ~10 min of coding and ~45 min of
test runs, almost all whole-suite runs that found nothing and flakes chased in scenarios the change
didn't touch. What found things was narrow and fast: unit tests, the change's own scenario, faults
against that scenario, KWin's source, and outside review. The same day a fault run skipped its
review and its smallest version, and was stopped and started over.

## Rules

1. **Name the step before the run.** Before each test run, one line to Paul:
   `Testing: P1.4, 86-tiling-drag alone`. A run that no step names is not done.
2. **Only the runs a step lists.** No extra run "to be sure", no whole-suite run outside P5 and
   P6, no second rerun of a flake, no run "to see what happens".
3. **A case no procedure covers stops the work.** Write the change to this file, show it to Paul,
   and run only after his go. The change is committed once he has said go.
4. **Results are read, not waited for.** Every run's results are read by you, from where the run
   writes them (table below). Silence is not success.
5. **Runs over 5 minutes follow L** (below), whatever procedure they belong to. A run under 5
   minutes runs in the foreground with no review and no smallest version.
6. **Paul's "it works" ends the procedure** (CLAUDE.md): drop the steps left, and don't chase him
   for results.

## The runs

| run | command | time | where its results are |
|---|---|---|---|
| unit tests | `make unit` | ~1 s | console |
| one or a few scenarios | `tests/live/run.sh NN-name.sh ...` | 5-60 s | console at the end; meanwhile `/tmp/tmp.*/NN-name.sh.log` and `.status` |
| a scenario's faults | `KI3_SCENARIO=NN-name.sh make mutate-live` | ~35 s a fault, ~60 s a plugin fault | console, a line per fault |
| model faults | `make mutate` | ~1 min | console |
| the whole suite | `make test` | ~4 min | console at the end; meanwhile as for scenarios |
| the fault battery | `make mutate-live` | 30+ min | console, a line per fault |
| fuzz campaign | `make fuzz` | ~20 min | `tests/fuzz/out/<seed>/result.json`, `tests/fuzz/out/REPORT.md`; nothing on the console |
| stock settings | `make live-stock` | ~4 min | as `make test` |

Anything that builds a fault into `package/` or `plugin/` runs in a worktree (`git worktree add`,
then `cp -r tools/bin` into it): `package/` on main is what Paul's KWin loads.

## L. A run over 5 minutes

1. **Review.** A separate agent gets the run's spec (what runs, why, how long, where results go)
   and answers: is it needed; what is its smallest version; anything to drop or add. What it
   suggests dropping or adding is listed to Paul in step 2's line, and done.
2. **The smallest version first**, in the foreground: the one the review names, else one fault or
   one seed. Its results must be what the review expected; if not, stop and report.
3. **The rest in the background**, its output redirected to a file you name. A 2-minute recurring
   timer (`CronCreate`), and at each firing: read that file and the run's own result files, one
   line to Paul. Results that all fail the same way early: stop the run, report.
4. **After**: delete the timer, report the outcome.

## P1. A change (src/, plugin/, or a test tool in tests/ or tools/)

A test tool's change has one step in place of 1-5: run it once on the smallest real input that
reaches each changed path, in a worktree, and read that each path did what it says. Then step 6.

1. **The scenarios it touches**: every scenario in `tests/live/` that names a changed function,
   action, key, setting or log word (grep for each). A change to `tree.js` names its unit tests
   too. If the grep finds none, no scenario covers the change: write one (step 3). The list goes in
   the commit message.
2. **Scenarios whose expectation it changes on purpose** (a decision of Paul's changes what a key,
   a click or a drag does): found by the same grep, before any run, and updated in this change;
   they join step 1's list and are named in the commit message. A scenario that fails later and
   was not on this list is a real failure, never "expected".
3. **New behaviour gets checks**: in the scenario that already drives the same key or action; a
   new scenario only if none does. Behaviour that needs real input uses injected input
   (`tools/inject.py`). A model change (`tree.js`) gets unit tests.
4. **Run**: `make unit`, then step 1's list alone (`tests/live/run.sh` with those files). Red: fix
   and run step 4 again. A screenshot only for a visual change.
5. **New checks or a new scenario: P3**, before the commit that claims them.
6. **Commit** on the change's branch (`package/` built). Not live: P5, then Paul's go.

## P2. A bug fix

1. **Diagnosis**: the capture first (`tools/capture-read DIR`), KWin's source for the installed
   version for KWin's part. Cause, proposed fix, proposed test: to Paul. His go.
2. **The test, red**: a check that fails on the unfixed code, in the scenario P1.3 names. Run it
   alone; it must fail for the reported reason. That red run is reported.
3. **The fix**, then P1 from step 4, then P5 before live.

## P3. Faults for new checks

In a worktree. Live scenarios' faults are in `tests/live/mutate.py`; `tree.js` faults in
`tests/unit/mutate.py` (`make mutate`), run whole.

1. **List the faults**: one per new function, per new `if` or `else` arm, and per new loop the
   new checks claim to cover; not per sub-expression. A fault removes the statement, or inverts or
   short-circuits the guard; its from/to text is copied from the diff. Each goes into `mutate.py`
   as (scenario, file, name, from, to), plugin files included. Code that gets no fault gets a line
   under `# Not covered:` in the scenario's header, with the reason (step 5's third case).
2. **Run them**: `KI3_SCENARIO=NN-name.sh make mutate-live`: that scenario alone first (it must
   be green), then each of its faults against it alone. Count a plugin fault as two: more than 8
   means L.
3. **Read each line**: `red` (a check printed FAIL: caught), `GREEN` (survived), `BROKEN` or
   `TIMEOUT` (harness trouble: not caught). BROKEN or TIMEOUT: one rerun of that fault alone
   (`KI3_ONLY=name`); still so, report it and stop.
4. **Report the table** to Paul: fault, result, the check that caught it.
5. **Each survivor, by this rule.** Visible means a window's geometry, focus, desktop or
   visibility, a key's or a click's effect, or a log line a scenario already reads.
   - Visible in the test KWin: a check is missing. Add it, rerun that fault alone; it must turn
     red. Still green: the check is wrong; fix it and rerun once more; still green, report to
     Paul.
   - Not visible at all: remove the code and its fault, then P1.4.
   - Visible, but not in the test KWin (it needs one monitor, a script unload, real hardware):
     the `# Not covered:` line with the reason, and the fault stays in `mutate.py` marked as
     expected to survive. It takes effect when Paul has answered step 4's report.
   - It only saves work or restores state no check can read (GL state put back, a duplicate call
     skipped, a call never overlapping): kept, with a `# Not covered:` line giving the reason, and
     no fault. Known before the run, it gets no fault in step 1 either. Code that does nothing at
     all (a call another one already makes) is not this case: it is removed.

## P4. A probe

An experiment answering a spec's open question; not a test, never merged.

1. In a worktree on branch `probe-<name>`, off the branch the feature will be built on.
2. Its scenario is `tests/live/9N-probe-<name>.sh` (90 and above: no clash with the suite's
   numbers); plugin code logs to `$KI3_TMP/<name>.log` (`qWarning` from a plugin reaches nothing in
   the test KWin).
3. Runs alone, in the foreground, as P1.4.
4. The answer goes into the spec under "Probe result" (the branch, the date, what it could not
   check), committed on main or the feature branch, not the probe's. The probe branch is pushed,
   and deleted when the feature merges.

## P5. Before anything goes live

1. One `make test`, in the foreground. Once per session, however many changes it covers.
2. **A red scenario on P1's lists**: a real failure. Fix it, P1 from step 4, then only the red
   scenarios again, alone.
3. **A red scenario not on them**: one run of it alone. Green: a line in `OPEN.md` item 34 (the
   scenario, the check, the date), and it passes. Red: a failure the change did not cause: stop and
   report to Paul; don't fix it.
4. Then Paul's go to merge, then his go to reload (CLAUDE.md, "Nothing goes live").

## P6. Every week or two

`make fuzz`, `make mutate-live` (the whole battery; commit first, it restores with `git
checkout`), `make mutate`, `make live-stock`. Each with Paul's go, never owed by a change; each
over 5 minutes goes through L. Results into `OPEN.md`. Propose a campaign only when a week or two
has passed since the last (`tests/fuzz/out/REPORT.md`'s date).

## Flakes

A scenario that fails and then passes alone is a flake: OPEN.md item 34, never chased
mid-session. The flakes are test-speed work, chosen by Paul from that item.
