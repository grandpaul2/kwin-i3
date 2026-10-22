# Review of the real-input test design (2026-10-22)

Scope: `docs/input-tests-design.md`, read against src/kwin.js, src/workspaces.js, tests/live/lib.sh,
10-tiling.sh, 40-monitors.sh, tools/testkwin.sh, tools/inject.py, tools/ei-send.c, tests/live/mutate.py
and the earlier review (docs/test-review-2026-10-22.md, not repeated). Only this file was written.
Probes ran in the isolated harness only, from throwaway scripts in /tmp/claude-1000/probe (a scratch copy of
testkwin.sh with extra config; nothing in the repo was changed, nothing ran against the live desktop).
Focus-follows-mouse flakiness was dropped from scope at the coordinator's request, so the design's first open
question is not answered here.

Verdict: NO-GO as written. Two harness faults make the key sweep and every input test fail or lie, and test 5's
mutation does not do what the design says. All are cheap to fix. With the changes below: go.

## Findings, ranked

### 1. The test KWin inherits Paul's real session lock state through the system bus (determinism, breaks everything)
Evidence (measured): at about 01:00 the live suite went from 6 s green to every geometry check failing
(`make live` / `run.sh 10-tiling.sh`: 17 FAILs, then 100 s timeouts). Paul's session was locked
(`loginctl show-session` LockedHint=yes). In the test KWin: `workspace.windowList()` showed two extra windows of class
`kwin_wayland` (the lock-screen surfaces, one per output), windows never took a tile geometry or any
`frameGeometry` set from a script, injected keys and pointer did nothing. `testkwin.sh` unsets DISPLAY but
leaves `DBUS_SYSTEM_BUS_ADDRESS` and the system bus reachable, so KWin reads logind's session state. Clearing
`XDG_SESSION_ID` did not help; making the system bus unreachable did:
`DBUS_SYSTEM_BUS_ADDRESS=unix:path=/nonexistent/none` restored 0,0 1280x720 at once, and 00/10/20/30/40 all
passed afterwards with it.
Consequences: every live scenario, and above all `make mutate-live` (a 2-minute battery, which Paul will start
and walk away from) is coupled to whether his screen is locked. A locked screen means the baseline is red and
mutate.py aborts, or worse, partway through a lock a mutant looks "caught". The input tests are hit hardest:
a locked test KWin swallows all injected input, so every test in 50-input fails for an unrelated reason.
Change: in `testkwin.sh` (next to the `export KI3_TMP...` line, before the private bus starts) export
`DBUS_SYSTEM_BUS_ADDRESS=unix:path=/nonexistent/none`. Add a check to 00-harness: `workspace.windowList()` has no
window of class `kwin_wayland` and `org.freedesktop.ScreenSaver GetActive` is false, so a locked test KWin
fails loudly with a name instead of as 17 unrelated geometry failures. Do this before anything else; it affects
the existing suite today.

### 2. The stock KWin/KDE shortcuts collide with kwin-i3's keys in the test KWin, so the sweep fails (or locks the KWin)
Evidence (measured with `getGlobalShortcutsByKey` in the test KWin, and by pressing the chords): these keys have a
second owner and kwin-i3's action never fires:
- Meta+Left/Right/Up/Down: "Window Quick Tile Left/Right/Top/Bottom"
- Meta+Ctrl+Left/Right/Up/Down: "Switch One Desktop ..."
- Meta+Shift+Left (and Right): "Window to Previous/Next Screen"
- Meta+E: launches Dolphin (`_launch` of org.kde.dolphin.desktop). It really started Dolphin inside the test
  KWin and a Dolphin window was adopted into the tree ("ADD Home - Dolphin tile ws 1").
- Meta+L: "Lock Session" (ksmserver component). Pressing it LOCKED the test KWin; every later key in the same
  run was swallowed (my first sweep: 19 misses from Meta+L onward).
Paul's real kglobalshortcutsrc has all of these set to `none` (Quick Tile, Switch One Desktop,
Window to Next/Previous Screen, Lock Session via setup.sh), plus the Meta+V clipboard entry and the
Meta+1..9 task-manager entries, so his keys work and the stock test KWin is the wrong one. Verified fix: writing
`$XDG_CONFIG_HOME/kglobalshortcutsrc` in testkwin.sh before KWin starts with
`[kwin] Window Quick Tile Left/Right/Top/Bottom=none,Meta+<dir>,x`, the four `Switch One Desktop ...`,
`Window to Previous Screen`, `Window to Next Screen` set to `none,<default>,x`, `[ksmserver] Lock Session=none,Meta+L,Lock Session`
and `[services][org.kde.dolphin.desktop] _launch=none` makes every arrow/Ctrl/Shift chord fire.
Changes:
- Mirror Paul's unbindings in testkwin.sh (copy the list from his file; it is one source of truth for "what his
  session clears").
- The sweep's first step asserts uniqueness: for each key, `getGlobalShortcutsByKey` returns exactly one owner,
  `kwin-i3 ...`. That turns "a stock default grabbed my key" into a named failure instead of a 5 s timeout and
  silence, and survives future KDE defaults.
- The same uniqueness check, read-only, belongs in the phase-5 switch-over against the LIVE KWin (Paul's file
  still has i3ws on every one of these keys, and Meta+V/Meta+1..9 held by plasmashell). The harness cannot see
  that; this is an unverified gap: check that after i3ws is disabled, `getGlobalShortcutsByKey` on the live bus returns
  only kwin-i3 for each key. Do it by hand at the switch-over, not from a test.
- Also set `[ModifierOnlyShortcuts] Meta=` in the test kwinrc, as Paul's has; a bare Meta tap otherwise opens
  the launcher by D-Bus.

### 3. The key sweep will find a real bug on its first run: `Meta+Shift+;` never fires
Evidence (measured, after fixes 1 and 2): of 29 chords, 28 fire; `Meta+Shift+;` produces no ACTION. kglobalaccel
holds `Meta+Shift+;` for "kwin-i3 Move Right (;)" but nothing for `Meta+:`, which is what a US keyboard
produces. Paul's i3ws registered both (`i3ws Move Right (:)=Meta+:` and `... (;)=Meta+Shift+;`); kwin-i3's KEYS table
has the SHIFTED symbol list only for the digit keys. So on his desktop Meta+Shift+; (move right, the old i3
`$mod+Shift+semicolon`) will be dead after the switch-over.
Change: this is a kwin.js fix, not a design fix: register `Meta+:` for Move Right (and check any other Shift+key
binding the same way, e.g. none other in the table today). The sweep then turns green and guards it. Keep the sweep
as the proof: it is the first test in the design that has found a defect before being written.

### 4. Test 5 ("a following real Meta+V splits b") does not test `windowActivated`; its listed mutation survives
Evidence (reading kwin.js:493-500): `act()` calls `focusedCon()` first, which copies `workspace.activeWindow`
into the model (`model.focusWin`) before every action. So with the `windowActivated` handler removed, pressing
Meta+V after hovering b still splits b. The design's "windowActivated not followed -> 5 and 7" would stay green.
(The existing 10-tiling fault "KWin focus not followed" is caught only through other paths.)
What `windowActivated` is actually needed for: model focus read by anything that is not an action: `forgetWindow`
-> `wantFocus` -> `applyFocus(model.focused)`. Replacement for 5 and 7: windows a b c (c focused), hover or click
a (KWin activates a), then close b through `kclose` (not a key, so `focusedCon` never runs); require the
next `TREE` line to mark a as focused (`a*`) and KWin's active window to stay a. With the handler removed the model
still says c, `applyFocus` activates c, and the check goes red for the right reason. Keep a Meta+V variant only as an
end-to-end smoke check, labelled as not covering the handler.

### 5. Test 2: the "force a reconcile" step is unnecessary, and the geometry check can pass vacuously
Evidence (measured, a|b, Meta+right-drag 600,360 -> 760,360): a = 760 wide at the drop. With `readBack`
disabled (patched copy of main.js), `dragEnd` still calls `schedule(ws)`, so the reconcile runs on its own
right after the button is released and a snaps back to 640 within the same TREE line. Two consequences:
- Pressing Meta+Left to force a reconcile is not needed; and it makes the test pass for a different reason
  than the claim if the press itself also triggers something.
- A `wait_geom a 0,0 760x720` that polls will succeed during the 10-30 ms before the snap-back, with
  `readBack` disabled. The assertion must come after the reconcile: take a `mark` before the drag, wait for the
  drag-end signal (see 7), then for a `TREE` line after it, then assert the geometry once (and optionally again
  after 300 ms for stability).
- Better, assert the model rather than the pixels: read the tile (`workspace.rootTile(...).tiles[0].relativeGeometry.width`
  is about 0.594 after the drag, 0.5 if reverted). That value is synchronous and independent of client ack timing.
Pixel target: KWin's resize puts the dragged edge exactly where the pointer ends (a: 640 -> 760 with the pointer at
760; 15 of 15 repeated 60 px drags moved the edge by exactly the pointer's travel from the grab offset). Grab inside the
right third of a (x > 427 for a 640 px window) and the middle third vertically, or KWin picks a corner and
resizes two axes. 600,360 is inside both.

### 6. Test 3 numbers: the dropped window is NOT at "where it was dropped +-1 px"
Evidence (measured, b dragged by Meta+left from 960,360 to 760,360, 200 px left): b ended at
`606,196 400x328` (floating, size restored to the client's own 400x328 as before it was tiled), a filled
1280x720, tree `H[a] ~b*`. The position is not (640-200, 0) and the size changed. Assert instead: tree is
`H[a] ~b*`, b's frame does not equal its tile (`640,0 640x720`), b's frame contains the drop point (760,360) and
lies inside the monitor, a is `0,0 1280x720`, b is kept above (as 10-tiling already checks for toggled floats).
Do not assert exact x,y.
Mutation check: disabling the `dragging === "move"` branch falls through to `schedule(ws)`; reconcile re-manages b
into its tile, so the tree assertion catches it. Good as designed.

### 7. Drag timing: wait for the event, but kwin.js currently logs none
The design says "wait for `interactiveMoveResizeStarted` (logged by kwin.js)". It is not logged: the handlers at
kwin.js:433-448 only set/clear `dragging`. Add `log("DRAG start " + dragging)` / `log("DRAG end " + kind)` (the log is
gated on debug, as the other lines are) and use them: `wait_log '^.{9}DRAG end'` after the button-up, then the
`TREE` wait. Fixed waits are not needed at all: measured, the resize worked 15 of 15 with `wait 30`, `wait 5` and
`wait 0` between steps (inject time 330 / 230 / 205 ms). So: no pre-drag wait beyond one `wait 30` after the first
`abs` (KWin needs the pointer to arrive before the press) and 4 steps with `wait 0`; the DRAG lines carry the
synchronisation. Also use a short `wait 30` after the final move before button-up only if the DRAG start line is
not seen; do not tune it.

### 8. Test 4 (drag to the other monitor)
Not re-probed by me (the design reports it working; unverified by me). Review of the code path: while dragging,
`desktopsChanged` is ignored (`placing[key] || dragging`), and the join is done only in `dragEnd`. If the join is
disabled, `relocate()` moves the window back to the home monitor on the next reconcile, so the observable is
"b is in the tree of workspace 2 and on Virtual-1 after the drag" and it fails correctly. Assertions: wait for DRAG end, then
`wait_tree 2 "... ~b*"` (use the exact tree), `wait_tree 1 "H[a]"` (source re-tiled without it), b's `output.name`
is `Virtual-1`, and b's frame lies inside x >= 1280. Without a DRAG-end wait, a poll for the tree succeeds only
after the join, so it is fine; the geometry/`output` checks need it.

### 9. Test 6 (pointer follows focus, no bounce): sound, with one change
`applyFocus` warps via `MoveMouseToFocus` only when focus changed monitor, so asserting "still the left window after
300 ms" is the right shape, but 300 ms against `DelayFocusInterval=150` with a loaded machine (parallel scenarios) is
a timing assert on the absence of an event. Do it as: after the warp, wait for the pointer to arrive
(cursorPos inside the left window), then require the active window stays that window across a 400 ms hold, sampled
three times. Say in the comment that it only has force when focus-follows-mouse is on in that scenario.
Whether FFM is on everywhere is out of scope per the coordinator.

### 10. Sweep design details
- Count and time (measured): 29 chords + 10 workspaces x 3 (go, move, symbol move). One inject.py call per chord
  costs about 75 ms including the wait for the ACTION line (10 presses 756 ms). The whole sweep, no windows, ran in
  about 4 s. Do not batch chords into one inject call: a batch of 40 identical chords fires 40 ACTIONs but cannot be
  attributed to a chord.
- No windows vs with windows (answers the open question): run it with NO windows, but note it is not state-free:
  `Meta+Shift+N` creates workspaces and the tree (`TREE 2 H[]`), `Meta+N` switches the active workspace, Floating
  Toggle etc. are accepted on an empty workspace (measured: all 29 ACTION lines appear with no windows; no ERROR).
  Start with no windows, end the sweep with `Meta+1`, and make the sweep the LAST thing in its scenario or the
  first; put it first. A second pass with two windows is not worth the time; test 2-7 press real keys on windows.
- Match exactly one ACTION per chord: after each press, wait for the expected `ACTION <name>` after a per-chord
  mark and also require that no OTHER `ACTION` line appeared since the mark (a mis-bound key that fires the wrong action
  must fail, not just a missing one). The wrong-action fault is also what fires when a stock default wins (finding 2).
- The `Meta+N` and `Meta+Shift+N` chords can be satisfied by either of two registrations (`Meta+Shift+1` and `Meta+!`).
  Same ACTION name, so a typo in the symbol variant is invisible. Also press the symbol variant? The physical key
  chord is the same, so it cannot be tested separately with a real keyboard; accept that, state it in the file, and
  keep `tests/unit/keys.test.js` for the table.
- A key typo test: a typo that moves "Split V" to Meta+B makes Meta+V time out (5 s, WAIT). Lower `WAIT` to 2 inside the sweep
  so a broken table costs about 2 s per chord, not 5 s, and run it with `KI3_FAILFAST`.
- `Meta+O`-style unbound chords: add one negative control (a chord that no kwin-i3 key uses, e.g. Meta+O) and
  require NO ACTION line. This proves the sweep's wait is not satisfied by a stale line and the harness sees "nothing".

### 11. Differences between the headless KWin and Paul's session that make tests pass falsely
Measured facts about the test KWin versus what the design assumes; items marked "unverified" I did not check.
- Stock shortcut owners (finding 2): the largest difference; fix in testkwin.sh.
- The system bus and session lock (finding 1).
- Decorations: Paul's session uses the aurorae `i3frame` theme with Tiny borders (kwinrc). The test KWin has
  its own default (the GTK client has client-side decorations in the tests, frames equal tiles). Meta+drag works
  anywhere in a window so tests 2-4 are unaffected, but dragging by a title bar or a border (what he does without Meta)
  is untested. UNVERIFIED: whether his i3frame theme draws a title bar and whether KWin starts a resize from its
  thin border; check by one test with `BorderSize=Tiny` and a real theme if a similar one ships in the repo.
- Client type: the test clients are GTK4 Wayland. Paul's windows include X11 (the OBS/stage Xephyr, per the earlier review)
  and Firefox/Alacritty. Drag and focus on X11 windows go through different KWin code (enter events, input focus).
  UNVERIFIED; run 5/7 once with `KI3_XWAYLAND=1` and an X11 client to see whether focus follows.
- Two outputs of equal size side by side (1280x720); Paul's real pair may differ in size and scale. Drops near a seam
  and `screenToward` are untested in other arrangements. UNVERIFIED.
- Pointer acceleration: libei absolute motion bypasses acceleration; a relative-motion drag with acceleration can
  overshoot the grab thresholds. Not covered; low risk because KWin's resize uses absolute positions.
- Extra clients in the test KWin: KWin starts plasma-keyboard (the input method) and kscreenlocker_greet in each run
  (journal). Harmless in the cases seen, but it is a client Paul's session also has; mention it if a focus test ever
  flakes on "an unknown window took focus".
- No plasmashell: no panel, no krunner/fuzzel; Paul's fuzzel (layer-shell) taking keyboard focus when it opens
  while a window is hovered is not covered.

### 12. Parallelism and runtime
- Everything the new scenario touches is private to its KWin (EIS connection per `inject.py` call; the pointer is
  per KWin). Parallel runs are safe from the point of view of input. The shared things are CPU load and the single
  Dolphin-style surprises of finding 2, so apply 1 and 2 first.
- `inject.py` costs about 75-100 ms per call (a new EIS connection each time); the drags 205-330 ms. A scenario of
  about 30 chords (3 s), 3 drags (1 s), 2 hovers/clicks and the client start-ups should be 8-12 s: the same size as 10-tiling.
  Not a candidate for the "over a minute needs another review" rule.
- Tests 2, 3, 4 each need fresh windows; do not chain them on one tree. Use a `kclose` of every window between
  tests, or start the scenario with the two-window state it needs and restore it with `Meta+1`. Closing leaves
  `H[]` which the existing helper waits for.
- Do not leave the pointer where the previous test left it: every test starts with an `abs` to a stated neutral
  position (see 11 and the coordinator's FFM question).

### 13. Gaps in coverage the design misses (real input a user hits)
- Click-to-focus (test 7) is listed but only through the model; use the close-another-window form of finding 4.
- Dragging a FLOATING window (no model change except position): `dragEnd` with `con.type === "floating"` and a
  cross-monitor drop is the `moveToWorkspace` branch of `dragEnd`; add one drag of a floating window across monitors.
- Drag a window from workspace 2 on monitor 2 to monitor 1 (the reverse of test 4), since `deskNum` of the
  other screen differs.
- A resize drag on a stacked (V) layout and on the middle column of three (the border shared with both neighbours);
  `readBack`'s extent maths handles nested nodes (kwin.js:307-335) and test 2 covers only the simplest case.
  Suggest one drag on `H[a b c]` expecting a:b:c shares to match the new frames, and one on `H[a V[b c]]` for the
  horizontal border.
- Quick-tile/edge snapping: moving a window with Meta+drag to the screen edge can quick-tile it in stock KWin
  (the "drag to edge" option; Paul's file shows the Window Quick Tile entries cleared but the EdgeBarrier/electric
  border setting was not checked by me). UNVERIFIED: look in kwinrc for `ElectricBorders`/`BorderActivate...` and
  add a drag that ends within 5 px of a screen edge, expecting the model's float, not a KWin quick-tile.
- Real key repeat and a held modifier across two windows (sticky Meta between two chords) are untested; low value.

### 14. Mutation faults: right ones and additions
The listed ones are good, with these notes:
- `readBack` disabled -> test 2: red (measured: snap-back to 640 with the patched script). Needs the post-DRAG-end
  ordering of finding 5 to be red for the right reason.
- tileChanged move branch -> test 3: red by design (tree check).
- dragEnd join -> test 4: red by design.
- "windowActivated not followed" -> now needs the close-another-window form (finding 4), else it survives.
- "pointer warp disabled" exists (M `pointer doesn't follow`); make 50-input an additional scenario for it only if
  the FFM test 6 is the one that detects it, otherwise leave it with 40-monitors.
- a key table typo -> 1 (as designed). Add the typo class in finding 3: drop a registration (e.g. delete the
  `Meta+Ctrl+L` entry) -> the sweep fails by timeout. And a "wrong key bound to the right action" (two actions on one
  key) -> the exactly-one-ACTION rule in finding 10.
Additions:
- `dragStart` never sets `dragging` (the whole move branch needs it) -> test 3 (and 4).
- `kind === "resize"` condition inverted -> test 2.
- `placing[key] || dragging` guard in `desktopsChanged` removed -> test 4 (the in-flight desktop change would
  re-home the window mid-drag).
- Meta+: registration removed (after the fix of finding 3) -> sweep.
- Harness faults (not in mutate.py): a test with the system bus left reachable and a locked session should fail
  00-harness's new check; try it once when Paul's screen is next locked (unverified: it needs his lock).
Fault-battery mechanics: the three mutations that use `dragging` share a path; register each against 50-input first in
the `muts` table (the scenario that should catch it), as mutate.py already does.

## What was verified

| claim | how | result |
|---|---|---|
| Real chords reach kwin-i3 | inject.py in the test KWin, `ACTION` lines | 28 of 29 with fixes 1-2; `Meta+Shift+;` dead |
| Stock shortcut collisions | `getGlobalShortcutsByKey` in the test KWin | arrows, Ctrl+arrows, Shift+Left, Meta+E, Meta+L collide |
| Meta+L locks the test KWin | sweep reached Meta+L, all later keys swallowed | yes |
| Lock state leaks from the real session | scratch run with the system bus unreachable | suite green again; 00-40 all pass |
| Meta+right-drag resize and readBack | patched main.js copy | edge follows the pointer; with readBack off the reconcile snaps it back at drag end |
| Move-out float result | drag b 200 px left | `H[a] ~b*`, b floats at 606,196 400x328 |
| Drag step timing | 15 resizes at step waits of 30, 5, 0 ms | 15 of 15 correct |
| Press cost | 10 presses with ACTION wait | 756 ms |
| `interactiveMoveResizeStarted` logged | grep kwin.js | not logged (design is wrong) |

## Not verified (what I would check)
- Test 4 cross-monitor drag and test 5/7 hover and click focus under focus-follows-mouse: I did not run them (time,
  and the FFM question was taken over). Check by running the scenario once with `KI3_FFM`-style config and
  reading the DRAG and TREE lines.
- X11 clients, differing monitor sizes, i3frame decorations, ElectricBorders (finding 11, 13).
- That the lock-state fix is sufficient while Paul is away for hours (the idle autolock of the test KWin itself is a
  separate possibility: a long mutate-live run could trigger kscreenlockerrc's autolock in the private config; set
  `[Daemon] Autolock=false` in the test's kscreenlockerrc to be sure).
