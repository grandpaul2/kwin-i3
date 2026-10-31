# Testing: the procedure (lean, for the Stage)

During the Stage kwin-i3 runs on a handful of desktops whose owners use it all day: they will
find what's wrong. Testing has one job: **don't break a live desktop catastrophically.**
Everything beyond that waits for the Stage's end (`LATER.md`, "Reliability"). No improvising:
the runs below are the only runs.

## Rules

**"The go"** below: in the maintainer's own sessions, their word; for a contributor, asked in the
pull request (its description, or a comment) and given there. The merge is the go for the
change; the reload of a desktop is its owner's go.

1. **Only the runs listed here.** No extra run "to be sure", no whole-suite run but P3's, no run
   to chase a flake.
2. **No run over 5 minutes, ever.** A longer one is split into runs of 5 minutes or less.
   **Anything over a few seconds runs in the background**, so the person can keep
   talking to the agent: `make unit` in the foreground, every scenario run and `make test`
   in the background, and you stay free to talk. Over ~30 seconds, also a 2-minute recurring
   timer from the moment it starts, `AGENTS.md`'s "Long runs": at each firing
   read the run's result files yourself (while `make test` or a scenario runs: `$TMPDIR/tmp.*/NN-*.sh.log` (`/tmp` when unset); a red scenario's output and kwin-i3's log are kept in `tests/live/out/` after the run
   and `.status`) and give the person one line; delete the timer when it ends
   and give the outcome. A notification or silence is not a check.
3. **A case not covered here: ask the maintainer** before running anything for it.
4. **The person's "it works" ends it** (AGENTS.md): drop what's left, and don't chase them for
   results.
5. **No new test without the go, and only with a strong case**: an agent given a handle will grab
   it. A new test is any new scenario, check, unit test, fault, probe or test tool. Before writing
   one, say in a few lines what catastrophic breakage of a live desktop it guards against that its
   user wouldn't see, and what it costs to run; write it only after the go. "It would be good to cover", "the procedure has a gap" or "a
   change should have a test" are not reasons. Updating an existing check that a decided change
   makes wrong is not a new test.

## P1. A change

1. `make unit`.
2. The scenario(s) that drive what changed, alone: `tests/live/run.sh NN-name.sh`. A scenario
   whose expectation the change alters on purpose (a decided change) is updated in the change.
   None drives it: nothing to run here; P3's `make test` is the guard.
3. **A change under `plugin/`: `64-plugin-reload.sh` too, before every live install** (alone,
   with step 2's scenarios; it needs `make plugin` first, or `run.sh` skips it). A plugin bug takes down the whole desktop, and 64 unloads and
   reloads the plugins, then uses the mouse: the only kind of break that is catastrophic here
   (a destructor that reinstalled its filters once left a stale one in KWin, which crashed on a
   mouse move after the next plugin install; 64 would have caught it).
4. Update `docs/behaviour.md` in the same commit. Commit (on a branch if it isn't live yet). No
   new checks for the new behaviour (rule 5).

## P2. A bug fix

Diagnosis first (the capture, `tools/capture-read`; KWin's source for KWin's part), the go;
then the fix and P1. A check for the bug only under rule 5.

## P3. Before anything goes live

1. **At most one `make test` per session, at its start, when the work needs it** (~4 min, in
   the background). A limit, not a duty: no session owes one, and none is listed as owed: tests
   are tools, they don't run the show. **Not again before a live install later in the session**: a change made
   after it is covered by P1 (its scenarios, and 64 for a plugin change).
2. A red scenario the change drives: fix it, then rerun only that scenario.
3. A red scenario it doesn't: one run of it alone. Green: a flake, so it moves to the alone tail
   (`# timing: alone`), as 69 did (2026-10-28), not another guessed fix. Red: report
   it, don't fix it.
4. The maintainer's go to merge, then the desktop owner's go to reload (AGENTS.md, "Nothing goes live").

## P4. A probe

A question about KWin that blocks a design, with the go (rule 5): the smallest scenario that
answers it, in a worktree on branch `probe-<name>`, numbered 90 and up, run alone. The answer goes into `docs/kwin-notes.md`; the branch is never merged.

## Not during the Stage

In `LATER.md`, "Reliability": fault runs (`make mutate-live`, `make mutate`, faults by hand), the
fuzz campaign (`make fuzz`), `make live-stock`. When they come back, each is split into runs of 5
minutes or less. `tests/live/mutate.py` keeps the faults already written (86-tiling-drag's 59) for
then.

## P5. Another KWin (`tools/box.sh`)

A question about KWin 6.8 (a beta user's bug there, a red seen only on 6.8): the scenarios P1 or
P2 would run, in an Arch container with KWin 6.8.2 on the desktop (`tools/box.sh build` once, then
`tools/box.sh run bash -c 'make tools plugin && tests/live/run.sh NN-name.sh'`, in the
background; `KI3_BOX_OUT=<dir>` keeps a red's output). It copies the checkout and writes nothing
to it. It renders on the AMD iGPU through Mesa, so its pixels are AMD's, as the laptop's are.
`KI3_BOX=pika`: PikaOS's KWin 6.7.4 and Debian's package names, the same way. Nothing in either
reaches a live desktop: a fix still goes live by P3. (2026-10-30: 10, 53, 64 and 86 green on
both; 86 eight runs in a row on 6.8, where the laptop had two reds after a plugin rebuild, item
61, closed as no red reproduced: the next red's kept log reopens it.)
