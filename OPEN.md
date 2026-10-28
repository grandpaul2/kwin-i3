# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-27, fourth session** (docs only: Paul's 17:05 capture diagnosed and kept;
item 40 opened, the focus, workspace, tree and kinds rules redone against i3, `docs/definitions.md`
added; nothing built, nothing live changed).

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
rather than another guess. 69 did (2026-10-27, fifth session: "the helper fitted French" red in
the batch, 48/48 alone), so it now runs alone (~29 s on the alone tail); 39, 57, 70, 80 still
watched. 53-hold's `--notify` kill switch: closed unless it comes back.

**40. The focus rules, complete and in i3's terms** (Paul, 2026-10-27, from the 17:05 capture:
Prism Launcher's modal dialog opened on the pointer's monitor and KWin took Prism along; the
capture is kept until this item ends). **The rules are decided**: `behaviour.md` §5 is one
table of every way focus changes, each row against i3; §3 names every window by i3's kind
(Paul: follow i3, down to the names). The rows marked "Decided, not built" are the work: B2,
A2, A3-A5, B4, C1-C3, C7, C9, D2/D3, and the §3 kinds that differ (Yakuake, Spectacle, the
password prompt, KRuler and plasmashell's ordinary windows to floating). The settings page uses
i3's kind names, super descriptive and explicit, plainer later. Accepted ≠: C4, D5. C3 revised: the dialog opens on its parent's workspace (KWin ties them). Build plan agreed in
outline (new windows with D2/D3 first, then pointer, kinds, keys, clicks/closes, sticky last);
**held** (Paul): the rest of `behaviour.md` gets the same treatment first, and a gap check.
Done that way: §5; §4 as tables (W, S, M rows): S4 and M5 decided as i3 (not built); W1, W5,
S5, S8, S9 accepted. M3/M4 decided as i3 (plan.md decision 10
rewritten): lost workspaces move for good, a returning monitor gets its assigned ones. §2 drafted as table T
(24 rows, all ports of i3; checked against i3's source where the gap check doubted them); tidy
kept with its cost written down, ppt-only resize accepted. §3 drafted (tables R, X): R2 (X11
dialogs float) decided. **Paul's rule from here** (2026-10-27): ride i3 hard; a difference, minor
or not, needs a specific and explicit reason; "places itself" leaves the vocabulary. So the
"accepted, minor" rows of §2/§4 (W5, S5, S8, S9, T12) are reviewed again against that rule.
Confirmed in the redo (Paul, 2026-10-27), all decided, not built: D5 as i3 (the first output in
KWin's order); §3 R4 (the taskbar hint decides nothing), R5 (no user list; Plasma's system
windows built in), R9 (i3's `for_window` criteria and floating enable/disable), X2 (a rule runs
once, never undone); §4 W5 (a list), S5 (unbound no-back-and-forth actions), S8/S9 (`next`,
`primary`; by name ≠: shortcuts are registered at load). Kept with their reasons: T12, X6, X7.
`docs/definitions.md` is Paul's (output, tiling, visible), and `behaviour.md` uses its words.
§9 done (tables G, Z, F, against i3's `click.c`, `tiling_drag.c`, `drag.c`, `resize.c`;
Paul 2026-10-27, all as recommended): decided, not built: G1 (a Meta-drag doesn't move focus),
G3 (a `tilingDrag` setting, i3's four values, default both), G4 (no targets: the press focuses
and goes to the app), G7/Z7 (any key cancels, any button's release drops, an unmap on the
focused workspace aborts), Z1 (i3's nearest edge), Z3 (a ring drag resizes), F4 (a ring scroll
focuses). Kept with reasons: G2, G8's gap side, G11, Z2, Z4, Z5's limits, F1, F7.
§8 done (table K, against i3's shipped config; Paul 2026-10-27, all as recommended): decided,
not built: K4 (i3's resize mode, in the helper; the Meta+Ctrl actions stay, unbound), K17
(Meta+Shift+E: Plasma's logout prompt), K18 (Meta+Return: Plasma's default terminal, Meta+D:
KRunner). Kept with reasons: K7, K8 (focus parent), K15, K16, K22. A shared key: the active
holder registered first, ever, runs (kglobalacceld's serials, now in §8).
§7 done (table L; Paul 2026-10-27): **the look differs from i3 most, to blend with Plasma, at no
performance cost**. Decided, not built: L3 (i3's three colour classes as pickers, Plasma-friendly
defaults, focused #4c7899, the other two to pick), L4 (the lone-child split indicator), L6
(`hide_edge_borders`, `smart_gaps`), L11 (floating rings in L3's classes; floating windows keep
Plasma's styling by default). Kept: L1, L2 (1 px), L5 (4/2), L9 (rounded, square a choice).
**After the build, the settings page needs a rework** (Paul): the new settings clash with what is
there.
§12 done (table P): P2 decided as i3 (login focus on the output under the pointer). §11 done
(table N, i3's config options): decided, not built: N2 (outer gaps per side, gaps per
workspace), N7 (`mouse_warping`), N12 (`assign` to a workspace or output, R9's criteria), N15
(`floating_minimum_size`/`maximum_size`). Load order and release's roots corrected in §12.
§10 done as table V (kept in place, not folded): V6 decided (`popup_during_fullscreen`, i3's values,
default `smart`); V3 kept (KWin's fullscreen is one output's).
§6 (table Y: Y2, minimum sizes respected, kept: Wayland clients and KWin's tiles won't go below),
§13 and §14 checked for gaps (2026-10-28): nothing to decide. **The redo of `behaviour.md` is
complete.**
The feature map's stale rows brought up to date (2026-10-28). §5 C5 decided, not built (Paul,
2026-10-28): i3's `smart`, only the fullscreen window's own transients keep the focus.
The docs review (2026-10-28, a separate agent) found marks, contradictions and code facts; fixed.
The build plan: `docs/spec-i3-redo-build.md` (ten stages; order and calls 31-33 agreed).
**Paul's process (2026-10-28): all ten stages fully specced first, then a review and adjust pass,
then building.** Stage 1 specced (`docs/spec-redo-1-new-windows.md`, 2026-10-28). Stage 2 specced (`docs/spec-redo-2-pointer.md`). Next: stage 3's spec (kinds and rules).

**The gap check's findings** (2026-10-27: three read-only sweeps, `kwin.js`, the other sources
and the feature map, each against `behaviour.md`), by the section they go into. Worked through
section by section with Paul, as §5 was; (v) checked against the code, the rest checked when
their section is done. "i3≠" is a difference from i3 the doc doesn't mark.
- §1 (done 2026-10-28): the KWin shortcuts the script runs (Switch to Screen N, MoveMouseToCenter/ToFocus) are not in "How they talk".
- §2 (done 2026-10-27, table T): (v) `focusWrapping` wraps the **innermost** container, the doc says outermost; an empty workspace's focus keys go to the next monitor in every mode, `force` too; landing on another monitor focuses its tiled window, not a floating one; a move across monitors lands at the target's top level at the near edge; a top-level split's lone child moved to the edge goes to the next monitor; a window sent to a workspace with a fullscreen window doesn't take its focus; split on a floating window does nothing; the split rule's wording mixes the window and workspace cases; a swap with a leaf in the same split skips the fullscreen check. i3≠: resize in ppt only; up/down on a floating window do nothing; layout toggle only flips the split.
- §3 (done 2026-10-28: R9, R16, R17, R18 and the placement notes hold these): (v) a window that places itself is watched for a later change only if it is a normal window; the rule lists match exactly and case-sensitively, class against class and name, title as a substring, and are asymmetric (no ignore by title, no float by role); a deleted window counts as placing itself; nothing forces a window to tile; adoption gives a borderless window its border back; KWin places a new floating window (centred, dialogs over the parent) and sets its size floor (~150 px); a KWin forcing rule can fight kwin-i3 (size, desktop, maximize, no titlebar).
- §4 (done 2026-10-27, tables W, S, M): (v) moving a workspace to a monitor: the source shows its last shown workspace **with windows**, not "free"; focus goes to the moved workspace (not written); a rebuild runs showHomes; homes come back at load from the root tiles; a new monitor gets the first free workspace, KWin showing a duplicate for a moment (to check); i3≠: a returning monitor re-shows its workspaces (i3: only assigned ones; plan.md decision 10's "as in i3" is wrong); numbers only, names display only; `workspaceOutputs` one connector, no spaces in its name; auto back-and-forth global; KWin's own desktop keys (Ctrl+F1..) are a second route; KWin evacuates a lost monitor's tiles.
- §5 (done 2026-10-27; `applyFocus`'s trigger corrected 2026-10-28): (v) `applyFocus` runs only when a pass asked for focus, not after every pass; (v) C5 hands focus to **any** transient, i3 only to the fullscreen window's own (i3≠, marked "="); "Out to KWin" item 4 is looser than the code (the desktop stays active); the refusal skips windows on all desktops and kwin-i3's own switches, and asks for a pass; Meta+F/Q skip the key re-sync; a settings change runs a passive focus pass; KWin's focus-stealing level Low and X11 timestamps decide app activations; click raises, hover never; the edge barrier and hot corners shape crossings.
- §6 (done 2026-10-28, table Y): tiles sized from the work area (panels); an untouched root keeps KWin's saved tiles; KWin's pack/grow keys are pulled back; i3≠: i3 ignores size hints on tiled windows.
- §7 (done 2026-10-27 as table L; the hold's exceptions below still to check): (v) with `frameOnFloating` a floating window's border is taken too, "given back when it floats" is wrong then; the hold's exceptions (an output being dragged on, fullscreen windows, untiled closes); no ring on fullscreen, minimized or decorated windows, it follows opacity and corners; colours forced opaque, width clamped 1-10. i3≠: frame 1 px (i3 2), gaps 4/2 (i3 0), no smart_borders/smart_gaps, two colours not four, floating border two states.
- §8 (done 2026-10-27, folded into K and Taken keys): i3≠: resize mode flattened into keys; Close is KWin's (no kill); Meta+Shift+C reloads all of KWin's config; no arguments or flags; the "(symbol)" action names; which holder wins each taken key.
- §9 (done 2026-10-27, folded into G, Z, F; the rest checked when built): (v) a window dropped by KWin's own move on another monitor joins the workspace shown there; the parent strip is 25 px on a framed window and capped by the sibling zone, the parent test first; the resize reach grows with `frameWidth` (rounded up, Chebyshev, topmost wins); no drag or resize while a game holds the pointer or shortcuts are inhibited; a press activates and raises; Meta+Shift+right is KWin's; Escape is swallowed only after the drag starts; the ring's hit zone and when its click passes on; a fullscreen window dropped (flags), a drop on itself; KWin's window-action modifier must stay Meta. i3≠: centre always swaps (i3's swap_modifier); tiling_drag on by default.
- §10 (done 2026-10-28 as table V): (v) two desktops are ignored only during kwin-i3's own relocate, otherwise it is "made sticky"; fullscreen: KWin allows several, above panels, no ring or gaps; Shift-drag into KWin's custom tiles puts two windows in a leaf until the next pass; i3≠: minimize exists.
- §11 (done 2026-10-27; the settings page's details wait for its rework): list settings skip a bad entry rather than falling back; the script also enforces `holdTimeoutMs`'s range; an out-of-range number falls back whole, colours lowercased; the settings page's dependencies, steps, summaries, the "bare" note, the window picker, the key slots, the monitor list.
- §12 (done 2026-10-27): load: the other windows' adoption finishes after the keys are registered (to check); release resets any root that isn't exactly full-screen.
- §13 (done 2026-10-28): the report's notification shapes and its 3 s layout timeout.
