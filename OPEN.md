# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-27, third session** (item 39 done, live and checked by Paul; item 21 accepted as a known limit in `behaviour.md` §10, Paul: extremely rare now; the 04:35 capture was xwaylandvideobridge's invisible window, left as Fedora ships it, Paul's call).

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
rather than another guess. 53-hold's `--notify` kill switch: closed unless it comes back.

**40. The focus rules, complete and in i3's terms** (Paul, 2026-10-27, from the 17:05 capture:
Prism Launcher's modal dialog opened on the pointer's monitor and KWin took Prism along; the
capture is kept until this item ends). Rules first, no code (Paul). Done: `behaviour.md` §5 is
one table of every way focus changes, each row against i3; §3 names every window by i3's kind
(Paul: follow i3, down to the names; override-redirect for KRunner and popups). Decided: the
settings page uses i3's kind names, super descriptive and explicit, plainer later. Decided, not built: B2, A2, A3-A5, B4, i3's rules (the rows say them). Next: go through the table's
≠ rows with Paul: C1-C4, C7, D2, D3, D5, and the §3 rows
"to decide"; then `plan.md` "Focus" points to §5 instead of restating it (its "accepted" list
has B5 wrong: i3 doesn't focus a window that grows under a still pointer either). Code waits
for the rules.
