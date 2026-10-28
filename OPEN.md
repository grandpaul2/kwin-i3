# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).

Last reconciled: **2026-10-28, tenth session** (the pointer probe live; item 43 done: the gaps are
kwin-i3's, live, Paul: "works great"; main's `package/` is what KWin runs).

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

**40. i3's rules: all ten stages live; stage 4's live check owed** (Paul,
2026-10-27/28; the build plan `docs/spec-i3-redo-build.md`, each stage's spec
`docs/spec-redo-N-*.md`, its "Now" says what was built and what came up). **Done 2026-10-28**
(merged, live, Paul's "it works"): stage 1 new windows and outside switches (the 17:05 capture
closed and deleted), 2 the pointer, 3 i3's kinds and rules (its Window Rules page came with stage
10), 5 keys (in `hotkeys` and dotfiles' Plasma table; the banner's look is
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
**Stage 9** (sticky floating) done 2026-10-28, ninth session: `redo-9b` (unit 173/173, 40 and 62
green), live, Paul's "worked fine" (Sticky Toggle tried on a temporary Meta+Shift+Y, unbound
again: it has no key, as i3's).

**Stage 10** (the settings page) live 2026-10-28, ninth session: `redo-10b`, the pick of `redo-10`
onto main with the "Focused on another monitor or split" colour row dropped (7b left i3's
`focused_inactive` out); unit 173/173, 25 37 76 green; merged, `make kcm-install`, reloaded,
Paul's go; then the helper banner's check fixed (`bdebbac`: the installed id carries a hash),
and Paul on the live page: "looks good". Done. Found while building 7-10 and kept:
KWin's own: a window's modal dialog takes the focus whatever `popupDuringFullscreen` says
(`activation.cpp findModal`, §5 C5), and a desktops change puts a window first in KWin's focus
chain (40). Not driven in a test: F4's ring scroll (`tools/ei-send` has no scroll verb; a verb is a
tool proposal); a unit test for the page's rule parser (`kcm/ui/settings.js`) is a proposal too.

**41. A wallpaper flash again: with Firefox, and with just two terminals** (Paul's captures
`2026-10-27_233113.474`, note "Another wallpaper flash involving ff", not yet read; and
`2026-10-28_062151.334`, ninth session, note "wallpaper flash with just two terminals": a close on
workspace 3 left Alacritty alone, and kwini3hold's hold **timed out after 210 ms** waiting for
Alacritty to reach 2546x1386, released at 06:21:37.443, Alacritty's frame landing 37 ms later). `behaviour.md`
§10's known limit (a rare flash, accepted 2026-10-27) says a capture would tell whether it falls
inside kwini3hold's hold or after its release. Next: `tools/capture-read` on both at the start of a
session, a diagnosis for Paul (no fix without his go); the captures stay until then.

**46. The redo's review, 2026-10-28: what's left** (9 agents, each finding checked against the
code; the batch fixed on branch `review-fixes`: the crash in `Hold::release`, the colour index,
strips taking KWin's window actions, the probe's `Map` stall, the 1x1 floating size, a crossing
window floated by a caption change, resize mode stuck after a plugin reload, old title rules with
`"`, strips with a floating ring; and 13-20 decided, written in `behaviour.md`). Left, each
suspected or minor, none seen live:
- **The suspected ones, done 2026-10-28** (branch `suspects`): fixed: tiling drag off after a
  slow poll, no sticky push on Move Workspace to Output, a monitor change taken for `workspace N`,
  a drag stuck if the helper dies, a warp at a close, the first key crossing not warping,
  `shownBefore` keeping the last switch, the focus read after the switch, and the minimize that
  left nothing focused (pointer in a gap; probed red then green); refuted by a probe: KWin's pick
  after a move to a hidden workspace (kwin-i3's stands).
- **Hardening** (hostile or broken callers only): `HoldNew` ms and `SetDropIndicator` unbounded,
  `holdTimeoutMs` unclamped, GL blend state not restored, `SetRing`/`SetFloating` for a window
  already gone, `m_indicatorShown` not cleaned on destroy, `isActive` per-frame allocations, the
  banner re-rendered at mixed scales.
- **Settings page**: a stray `"` breaks `;` splitting for later lines; an empty-pattern row
  dropped at the next edit; an unreadable `assign` row moved into `forWindow`; `isAssign` regex
  unanchored; Pick a Window duplicates; a blank row lost silently; `isDefault` badge
  order-dependent; `75 x 50` with spaces rejected; output names exact (no `primary`); one assign
  per window (i3 allows a workspace and an output one); `Workspaces.qml` monitor slot 0 "Any".
- **The i3 differences, decided 2026-10-28** (from i3's source and `philosophy.md`, written in
  `behaviour.md` C1, C5, D2, R19, S10): followed: `all` focuses on either output, the replacement
  workspace prefers one assigned to the source, `[floating]`/`[tiling]` never match in an assign;
  kept ≠: the launch workspace (KWin shows a script no launch's desktop), a kept-out window's
  desktop switch (undoing it hides Plasma's window).
Next: the hardening and the page's quirks, as one batch.
