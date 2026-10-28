# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, seventh session** (build session: item 40's stages 7-10 built on
branches `redo-7` … `redo-10`, each stacked on the one before, all pushed; all ten stages are now
built, nothing merged, nothing live changed; main's `package/` is what KWin runs).

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

**40. i3's rules: all ten stages built, stages 1-6 live, the rest going live one at a time** (Paul, 2026-10-27/28;
from the 17:05 capture: Prism Launcher's modal dialog and KWin took Prism to the other monitor;
stage 1 closed it, and the capture is deleted). The build plan is `docs/spec-i3-redo-build.md` (each
stage's spec `docs/spec-redo-N-*.md`, its "Now" says what was built and what came up). **Built,
each on its own branch stacked on the one before, each with `make unit` and its scenarios green,
none merged** (Paul, 2026-10-28: build on through the stages): `redo-1` new windows and outside
switches (+ scenario 87); `redo-2` the pointer; `redo-3` i3's kinds and rules; `redo-4` outputs;
`redo-5` keys (the resize mode, Exit, Terminal, Launcher); `redo-6` clicks, closes, minimize;
`redo-7` the look (three colour classes from the tree, the split indicator, `hideEdgeBorders`,
`smartGaps`, gaps per side and per workspace; the floating colours gone); `redo-8`
`popupDuringFullscreen`; `redo-9` sticky floating (a window on all desktops in the tree, Sticky
Toggle unbound); `redo-10` the settings page (the Gaps sub-page, Mouse and focus, the colour
classes, the Window Rules rows, two monitors per workspace, the helper banner, the old list keys
migrated to rules on the page's first Apply). **Found while building 7-10, each fixed in the
scenario to the decided behaviour**: 26 and 54 were red on `redo-6` from stages 4 and 6 (a
replugged monitor's workspace stays, a press on the ring resizes); 62 from stage 7 (the floating
frame in the tiled colours); KWin's own: a window's modal dialog takes the focus whatever
`popupDuringFullscreen` says (`activation.cpp findModal`, §5 C5), and a desktops change puts a
window first in KWin's focus chain (40). **Stages 1-3, 5 and 6 done 2026-10-28: merged, live, and Paul's
"it works" (stage 3's Window Rules page waits for stage 10's `make kcm-install`; stage 5's keys
are in `hotkeys` and dotfiles' Plasma table; its banner's look is item 42; stage 6's two resizes
are item 43). Stage 4 merged and live the same day, **its live check deferred by Paul (not set up
for it that night), still owed**: stage 4's spec (the unplug, an assignment, and the morning
capture after a night with the monitors asleep). Next: Paul's go to merge `redo-7` (plugin-install
again, the effect's `SetRing`); then the rest the same way (each
branch merges cleanly onto the one before), and so on; stage 7 needs `make plugin-install` again
(the effect's `SetRing`), stage 10 `make kcm-install`.** Stage 5 going live also changes
`~/.local/bin/hotkeys` and dotfiles' Plasma table (the Meta+Ctrl resize keys became Meta+R's
mode; on a stock Plasma Meta+R and Meta+D collide with Spectacle's recording and Peek at Desktop:
reported as taken, `make take-keys`). Stage 10's "done when" is Paul's pass over the pages'
screenshots: the ones 37 and 76 kept are in `~/.local/state/kwin-i3/redo-10-shots/` (the main
page, Keys, Workspaces, Window Rules, Gaps; no plugins in the test KWin, so the Frame section is
greyed). Not driven in a test: F4's ring scroll (`tools/ei-send` has no scroll verb; a verb is a
tool proposal); a unit test for the page's rule parser (`kcm/ui/settings.js`) is a proposal too.

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
