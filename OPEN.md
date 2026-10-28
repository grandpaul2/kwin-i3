# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, eleventh session** (item 40, i3's rules, done: all ten stages live,
stage 4's check included, Paul's word; main's `package/` is what KWin runs).

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
alone), so it now runs alone (~29 s on the alone tail; green in its first full `make test` that way,
2026-10-28, eighth session: 60/60, 213 s; ninth session: 57/60, the three red (30, 70, 73)
stale expectations from stages 3 and 9, fixed in `1801897`, so 70's red was no flake; tenth
session: 60/60, 222 s); 39, 57, 70, 80 still watched. 53-hold's `--notify` kill switch: closed unless it comes back.

**47. The refinement pass** (Paul, 2026-10-28, eleventh session): the redo's method again, as a
refinement. (1) Four agents poked holes in the foundations (59 findings, merged into 17 calls,
Paul: "all good", with his role lightened: `philosophy.md`, "How a decision is made"). (2) **Done**:
the three docs rewritten (531b86b); round 2's fresh agent found 10, none high, each fixed in the
docs or carried to (3). (3) The code against the docs, by `src/` area, each mismatch labelled
code / `behaviour.md` / docs wrong; carried in: every ≠ row's reason one of `plan.md`'s (a)-(e)
(L2's 1 px and L5's gaps rest on "Paul's old config"; N6 focus follows mouse becomes ≠ (e));
T12's i3 side (`commands.c:505`, a resize spreads over all siblings); Z1 against i3's climb
(`resize.c:72-120`); i3 hiding floating windows behind a fullscreen one (`render.c:253`); a
virtual desktop 11; no output left (decision 10); px logical in the code; internal settings off
the page; the i3-syntax fields below the plain controls; the README pointing laptop users at the
workspace output setting; "adopt" against i3's "manage"; an on-all-desktops window kept sticky
before any `for_window` rule runs (`src/rules.js:269`, where i3 runs rules last; R3 says =); an
X11 notification-type window kept out where i3 floats it (`manage.c:466`); behaviour.md's kinds
table (sticky, root) against definitions.md's four. (4) A build plan, `spec-refine-build.md`,
shaped as `spec-i3-redo-build.md`. Next: (3), its batch sized for Paul first.

**41. A wallpaper flash again: with Firefox, and with just two terminals** (Paul's captures
`2026-10-27_233113.474`, note "Another wallpaper flash involving ff", not yet read; and
`2026-10-28_062151.334`, ninth session, note "wallpaper flash with just two terminals": a close on
workspace 3 left Alacritty alone, and kwini3hold's hold **timed out after 210 ms** waiting for
Alacritty to reach 2546x1386, released at 06:21:37.443, Alacritty's frame landing 37 ms later). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on both at the start of a
session, a diagnosis for Paul (no fix without his go); the captures stay until then.
