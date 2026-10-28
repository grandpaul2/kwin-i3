# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, ninth session** (stage 7 live with its ring fix; main's
`package/` is what KWin runs).

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
2026-10-28, eighth session: 60/60, 213 s); 39, 57, 70, 80 still watched. 53-hold's `--notify` kill switch: closed unless it comes back.

**40. i3's rules: stages 1-8 live, 9-10 waiting** (Paul,
2026-10-27/28; the build plan `docs/spec-i3-redo-build.md`, each stage's spec
`docs/spec-redo-N-*.md`, its "Now" says what was built and what came up). **Done 2026-10-28**
(merged, live, Paul's "it works"): stage 1 new windows and outside switches (the 17:05 capture
closed and deleted), 2 the pointer, 3 i3's kinds and rules (its Window Rules page waits for stage
10's `make kcm-install`), 5 keys (in `hotkeys` and dotfiles' Plasma table; the banner's look is
item 42), 6 clicks, closes, minimize (its two resizes are item 43), 7 the look (its split
indicators are item 44). **Stage 4** (outputs) merged and
live, **its live check deferred by Paul, still owed**: the unplug, an assignment, and a Meta+Shift+B
the morning after a night with the monitors asleep (stage 4's spec).

**Stage 7 (the look), done 2026-10-28, ninth session** (Paul: "looks good"): `redo-7b` (i3's
`focused_inactive` left out) plus `redo-7c`'s fix, the ring not following a focus change KWin made
on its own (focus follows mouse, a click, Alt+Tab: no pass after, so `tellRings` never ran; now
told from `windowActivated`; 57's new case watched red, then green).

**Stage 8** (popupDuringFullscreen) live 2026-10-28, ninth session: `redo-8b`, the pick of `redo-8`
onto main (unit 172/172, 32 green), Paul's go; the default `smart` changes nothing seen.

**Stages 9-10** (`redo-9` sticky floating, `redo-10` the settings page) are stacked on `redo-7`:
next, picked onto main, each with Paul's go. Paul,
2026-10-28: they're small; if stage 7's fix moves a lot, throwing them away and rewriting is fine
(under ten minutes). Stage 10 needs `make kcm-install`; its "done when" is Paul's pass over the
pages' screenshots (`~/.local/state/kwin-i3/redo-10-shots/`). Found while building 7-10 and kept:
KWin's own: a window's modal dialog takes the focus whatever `popupDuringFullscreen` says
(`activation.cpp findModal`, §5 C5), and a desktops change puts a window first in KWin's focus
chain (40). Not driven in a test: F4's ring scroll (`tools/ei-send` has no scroll verb; a verb is a
tool proposal); a unit test for the page's rule parser (`kcm/ui/settings.js`) is a proposal too.

**44. The split indicators: reassess them** (Paul, 2026-10-28, after stage 7 went live: "I'm not
completely happy with them"). i3's `indicator` (`behaviour.md` §7 L4): on a window alone in its
split, the side where the next window opens, in `frameIndicatorActive`/`frameIndicatorInactive`.
Next: Paul says what bothers him (or a screenshot), then a proposal; no change without his go.

**41. A wallpaper flash again, with Firefox** (Paul's capture `2026-10-27_233113.474`, Meta+Shift+B
during the fifth session, note: "Another wallpaper flash involving ff"; not yet read). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on it at the start of a
session, a diagnosis for Paul (no fix without his go); the capture stays until then.

**42. The resize mode's banner: clean up its look a bit** (Paul, 2026-10-28, after stage 5 went
live and worked). The banner is the effect's `paintBanner` (`plugin/hold.cpp`): a textured quad of
QPainter text, since KWin 6.7's `OffscreenQuickView` gives an effect no texture access (stage 5's
spec, "Now"). Next: Paul says what bothers him (or a screenshot of it), then a proposal; a change
is a plugin change, so `make plugin-install` with his go.

**43. Two tiling resizes that look different** (Paul, 2026-10-28, on stage 6's live check, which
otherwise passed). A plain drag on the ring or in the gap moves the windows live, as a KWin/Plasma
resize; Meta+right-drag shows i3's blue bar and resizes at the release (`behaviour.md` §7 Z5, Z7).
Stage 6 decided the ring drag is i3's `tiling_resize` too (Z3: "at the release as Z5-Z7"), so the
live-moving one is not the decided behaviour. Not yet diagnosed: which press reaches the helper's
`pressRing` and which KWin takes instead (a 1 px ring at the default width; a plain press in the gap
is no Z row at all, likely KWin's own tile resize, Z8's kind). Next: a diagnosis for Paul from the
code and KWin's source (no change without his go), then whether the gap drag should be Z3's too.
