# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, sixth session** (build session: item 40's stages 1-6 built on
branches `redo-1` … `redo-6`, each stacked on the one before, all pushed; nothing merged, nothing
live changed; main's `package/` is what KWin runs).

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

**40. i3's rules: stages 1-6 built, waiting to go live one at a time** (Paul, 2026-10-27/28; from
the 17:05 capture: Prism Launcher's modal dialog and KWin took Prism to the other monitor; the
capture is kept until stage 1 is live). The build plan is `docs/spec-i3-redo-build.md` (each
stage's spec `docs/spec-redo-N-*.md`, its "Now" says what was built and what came up). **Built,
each on its own branch stacked on the one before, each with `make unit` and its scenarios green,
none merged** (Paul, 2026-10-28: build on through the stages; the session ended after stage 6):
`redo-1` new windows and outside switches (+ scenario 87); `redo-2` the pointer (the crossing, the
desktop click, override-redirect windows hold the keys, i3's warp with `mouseWarping`, login under
the pointer; a fix commit on it for a `focusOutput` name clash); `redo-3` i3's kinds and rules
(`forWindow`, `assign`, the floating sizes; the old lists read as rules; the Window Rules page as
text); `redo-4` outputs (a lost output's workspaces move for good; `workspaceOutputs` a list);
`redo-5` keys (the resize mode in the helper with the effect's banner, Exit, Terminal, Launcher,
the no-back-and-forth and next/primary actions); `redo-6` clicks, closes, minimize (i3's next focus
for every close, minimized windows out of the focus's reach, the Meta-drag without activation,
`tilingDrag`, i3's drag ending, the nearest edge, the ring's resize). **Next: Paul's go to merge
`redo-1` into main, then `make plugin-install` (the effect's `HoldNew`) and the reload, then his
live check (stage 1's spec); his "it works" ends the stage and the 17:05 capture goes. Then
`redo-2` the same way (each branch merges cleanly onto the one before), and so on.** Stage 5 going
live also changes `~/.local/bin/hotkeys` and dotfiles' Plasma table (the Meta+Ctrl resize keys
became Meta+R's mode; on a stock Plasma Meta+R and Meta+D collide with Spectacle's recording and
Peek at Desktop: reported as taken, `make take-keys`). **Still to build**: stages 7 (the look), 8
(`popupDuringFullscreen`), 9 (sticky), 10 (the settings page), as the plan says: branch `redo-7` on
`redo-6`, and so on. Left from the 2026-10-27 gap check, checked when its stage is built: §7 the
hold's exceptions (an output being dragged on, fullscreen windows, untiled closes; stage 7); §9's
helper details (stage 6: done); §11's settings-page details (stage 10). Not driven in a test:
F4's ring scroll (`tools/ei-send` has no scroll verb; a verb is a tool proposal).

**41. A wallpaper flash again, with Firefox** (Paul's capture `2026-10-27_233113.474`, Meta+Shift+B
during the fifth session, note: "Another wallpaper flash involving ff"; not yet read). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on it at the start of a
session, a diagnosis for Paul (no fix without his go); the capture stays until then.
