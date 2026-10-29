# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, twelfth session** (item 48 fixed and live; item 47's float to tile
live and its seven stages done; main's `package/` and plugins are what KWin runs).

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
session: 60/60, 222 s; eleventh: green, 228 s; twelfth: not run, the changes covered by their scenarios); 39, 57, 70, 80 still watched. 53-hold's `--notify` kill switch: closed unless it comes back.

**47. The refinement pass** (Paul, 2026-10-28, eleventh session): the redo's method again. The
foundations rewritten from four agents' review and a second round (531b86b, a3951fb; Paul's role
lightened: `philosophy.md`, "How a decision is made"; i3 means 4.24, `plan.md`); the code read
against them (46 findings) and brought into line by `docs/spec-refine-build.md`'s seven stages,
**all live 2026-10-28** (outputs in i3's order and directions, the effect following the tree, the
words and settings, kinds, the tree, a close mid-drag, the letter keys by position, floating
windows behind fullscreen); no "Being fixed" left in `behaviour.md`. Left: (a) stage 3's i3-directive
help beside each control, **held**: wrapping a form control moves its label off it and 37's keyboard
path fails; a design and one diagnostic run of 37 (Paul's go) first. (b) Float to tile: done
2026-10-28, twelfth session (b2fa04d, §9 G13; Paul: "works well"). (c) Stages 1-7: done (Paul,
2026-10-28, twelfth session). Next: (a) when Paul wants it.

**41. A wallpaper flash again: with Firefox, and with just two terminals** (Paul's captures
`2026-10-27_233113.474`, note "Another wallpaper flash involving ff", not yet read; and
`2026-10-28_062151.334`, ninth session, note "wallpaper flash with just two terminals": a close on
workspace 3 left Alacritty alone, and kwini3hold's hold **timed out after 210 ms** waiting for
Alacritty to reach 2546x1386, released at 06:21:37.443, Alacritty's frame landing 37 ms later). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on both at the start of a
session, a diagnosis for Paul (no fix without his go); the captures stay until then.
