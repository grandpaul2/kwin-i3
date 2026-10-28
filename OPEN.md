# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, fifth session** (docs only: item 40's `behaviour.md` redo finished,
its build planned and specced in ten stages, reviewed by an agent and by Paul, probes 90-93 run;
69 moved alone; nothing built, nothing live changed).

## Stage (Paul, 2026-10-24, late)

**Development, for about 4-6 weeks**: Paul uses kwin-i3 daily and adjusts it along the way.
Reliability work, release prep and anything upstream wait in **`LATER.md`** (Paul, 2026-10-25),
with the settings page's finishing; it is added to as we go.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope"; the audience and the lines drawn: `docs/philosophy.md`. When the Stage ends: `LATER.md`, in the order its header suggests.

## Open

Work for now.

**34. Test speed, the rest of the study** (2026-10-25; the study's report was not kept, its
findings are here). Done: per-scenario timings in `run.sh`, many pixels per probe (78: 64 s to 29 s).
First timings: batch 46 s, alone tail 176 s, total 222 s. (a) done 2026-10-27: 72, 73, 74 run in
the batch, testkwin.sh finding each Xwayland's display under a lock; 71 stays alone for its 1 s
focus checks (the five green together; ~36 s off the alone tail). Left: (b) the alone scenarios
without millisecond timings (37, 57, 58, 59, 76, 78) two or three at a time (~30-60 s; five
repeat runs first, ~20 min); held until a few sessions' `make test` show the flake fixes below
holding, as it puts the screenshot scenarios back under load. (c) dropped: the fixed sleeps in
78 and 58 add up to ~11 s, a few seconds to gain for new races. Next: (b), when the flakes have
stayed away for a few sessions.

**Done 2026-10-27** (Paul's go): (e) `make mutate-live` with `KI3_ONLY` baselines only its faults'
scenarios; (d) the flakes, by causes read from the code (no failing run's log was kept, so not
proven): 39 and 69 waited 5 s for a layout change to reach the keyboard daemon and the helper
(now 20 s); 57's screenshot had to land inside a 400 ms hold (now 2 s, and polls in place of its
sleeps); 70 and 80 expected nothing after the press, which `capture-read` prints by design (now:
the press is there and the timeline in time order). All five green alone after the change.
**Watched**: if one of these fails again in a full run, it moves alone (`# timing: alone`)
rather than another guess. 69 did (2026-10-28: "the helper fitted French" red in the batch, 48/48
alone), so it now runs alone (~29 s on the alone tail; its first full `make test` that way is the
next session's); 39, 57, 70, 80 still watched. 53-hold's `--notify` kill switch: closed unless it comes back.

**40. i3's rules, decided and specced; the build next** (Paul, 2026-10-27/28; from the 17:05
capture: Prism Launcher's modal dialog and KWin took Prism to the other monitor; the capture is
kept until stage 1 is live). **Decided**: every section of `docs/behaviour.md` is a table, each
row against i3 4.24's source; the rows marked **"Decided, not built"** are the work (Paul's rule:
ride i3 hard, a difference needs a specific reason; the look may differ to blend with Plasma, at no
performance cost). Words: `docs/definitions.md`. **Planned**: `docs/spec-i3-redo-build.md`, ten
stages, one live at a time (new windows, pointer, kinds and rules, outputs, keys, clicks and
closes, look, fullscreen, sticky, settings page), each with its spec `docs/spec-redo-N-*.md`:
reviewed by a separate agent and by Paul (each spec's "Paul's calls" / "Paul's review"), every new
check, unit test and scenario approved, probes 90-93 run (branch `probe-redo`, never merged,
results in the specs). **Stage 1 built** (2026-10-28, sixth session) on branch `redo-1`
(`docs/spec-redo-1-new-windows.md`, "Now"): `src/placement.js` with its unit test, `placeNew`,
`shownOutside` and `holdNew` in `src/kwin.js`, `HoldNew` in `plugin/hold.cpp`, scenario 87; `make
unit`, scenarios 32, 40, 44, 56, 64, 72, 73, 79 and 87 green. **Next: Paul's go to merge, then
to reload (and `make plugin-install` for the effect's `HoldNew`), then his live check** (the
spec's "Live check"); his "it works" ends the stage and the 17:05 capture goes. Then stage 2.
Left from the 2026-10-27 gap check, checked when its stage is built: §7 the hold's
exceptions (an output being dragged on, fullscreen windows, untiled closes; stage 7); §9's helper
details (stage 6); §11's settings-page details (stage 10).

**41. A wallpaper flash again, with Firefox** (Paul's capture `2026-10-27_233113.474`, Meta+Shift+B
during the fifth session, note: "Another wallpaper flash involving ff"; not yet read). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on it at the start of a
session, a diagnosis for Paul (no fix without his go); the capture stays until then.
