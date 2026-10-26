# Testing: the procedure (lean, for the Stage)

Paul, 2026-10-26: kwin-i3 runs on his desktop and nowhere else, and he uses it all day: he will
find what's wrong. Testing during the Stage has one job: **don't break his desktop
catastrophically.** Everything beyond that waits for the Stage's end (`LATER.md`, "Reliability").
And: "we DO NOT improvise when it comes to testing": the runs below are the only runs.

## Rules

1. **Only the runs listed here.** No extra run "to be sure", no whole-suite run but P3's, no run
   to chase a flake.
2. **No run over 5 minutes, ever.** A longer one is split into runs of 5 minutes or less, each in
   the foreground. Nothing runs in the background, so nothing needs a timer.
3. **A case not covered here: ask Paul** before running anything for it.
4. **Paul's "it works" ends it** (CLAUDE.md): drop what's left, and don't chase him for results.
5. **No new test without Paul's go, and it must be super justified** (Paul, 2026-10-26: "if you
   give an agent a handle, it will grab it"). A new test is any new scenario, check, unit test,
   fault, probe or test tool. Before writing one, tell Paul in a few lines what catastrophic
   breakage of his desktop it guards against that he wouldn't see himself, and what it costs to
   run; write it only after his go. "It would be good to cover", "the procedure has a gap" or "a
   change should have a test" are not reasons. Updating an existing check that a change of
   Paul's makes wrong is not a new test.

## P1. A change

1. `make unit`.
2. The scenario(s) that drive what changed, alone: `tests/live/run.sh NN-name.sh`. A scenario
   whose expectation the change alters on purpose (a decision of Paul's) is updated in the change.
   None drives it: nothing to run here; P3's `make test` is the guard.
3. Commit (on a branch if it isn't live yet). No new checks for the new behaviour (rule 5).

## P2. A bug fix

Diagnosis first (the capture, `tools/capture-read`; KWin's source for KWin's part), Paul's go;
then the fix and P1. A check for the bug only under rule 5.

## P3. Before anything goes live

1. One `make test` (~4 min), in the foreground, once per session.
2. A red scenario the change drives: fix it, then rerun only that scenario.
3. A red scenario it doesn't: one run of it alone. Green: a line in `OPEN.md` item 34. Red: report
   to Paul, don't fix it.
4. Paul's go to merge, then his go to reload (CLAUDE.md, "Nothing goes live").

## P4. A probe

A question about KWin that blocks a design, with Paul's go (rule 5): the smallest scenario that
answers it, in a worktree on branch `probe-<name>`, numbered 90 and up, run alone. The answer goes into the spec ("Probe
result"); the branch is never merged.

## Not during the Stage

In `LATER.md`, "Reliability": fault runs (`make mutate-live`, `make mutate`, faults by hand), the
fuzz campaign (`make fuzz`), `make live-stock`. When they come back, each is split into runs of 5
minutes or less. `tests/live/mutate.py` keeps the faults already written (86-tiling-drag's 59) for
then.
