# Spec: a reload keeps owning the floating windows' keep-above flags

From Paul's question, 2026-10-24 ("even when I unfloat it, it stays green"). Status: **decided by Paul, 2026-10-24
(1: spec and change reviewed together; 2: a hand-floated window stays floating across a reload,
by the flag). Built 2026-10-24; reviewed (second agent,
`docs/review-reload-keepabove-2026-10-24.md`), its must-fix applied with Paul's decision (16:
the rules' re-tiling of a hand-floated window on a caption change, below) and its login edge
documented (17). Not live.**

Sources: `src/kwin.js` (`setFloatingLook`, `adoptWindow`, the load path, `release`, the
"Floating Toggle" action), `tests/live/60-load.sh`.

## The problem

i3 draws floating windows above tiled ones. KWin has no such layer, so kwin-i3 sets KWin's
keep-above flag on a window when it floats and clears it when it tiles again
(`setFloatingLook`). It remembers which flags it set in `keptAbove`, a table in memory, so that
it never clears a flag it did not set.

That table dies with a reload. After today's two reloads (the reverted fix and its revert) Paul's
Firefox on workspace 2 still carried the flag the previous instance had set; the new instance
adopted it with the flag already on and, since it did not have to set it, did not record it:

```js
if (on && !w.keepAbove) { w.keepAbove = true; keptAbove[id(w)] = true; }   // kwin.js:606
if (!on && keptAbove[id(w)]) { w.keepAbove = false; delete keptAbove[id(w)]; }
```

So un-floating cleared nothing: the window stayed above everything, which was invisible before
and is green since the frame colours (`docs/spec-frame-colours.md`). Every reload leaves every
floating window's flag orphaned the same way; `release` (Meta+Ctrl+Shift+Q) clears only the
recorded ones, so it leaves them too.

## The rule

A window kwin-i3 makes floating owns its keep-above flag: `setFloatingLook(w, true)` records
`keptAbove` whether or not it had to set the flag. Un-floating and `release` then always clear
it. A tiled window with a flag Paul set by hand is untouched, as today: nothing calls
`setFloatingLook(w, true)` on a tiled window. A floating window with a hand-set flag has it
cleared when it tiles again; Paul accepted that reading when he accepted the frame colours' trap
(decision 3 there), and he does not use the flag.

## Decisions (Paul, 2026-10-24)

1. **Reviews: together.** One review of this spec and the change.
2. **A reload keeps a hand-floated window floating.** Today a load takes the windows in KWin's
   tiles as tiled and classifies the rest by the rules, so a resizable window Paul floated by
   hand came back tiled (the likely reason his Firefox was tiled again by the revert's reload
   while keeping the flag). Nothing in KWin records kwin-i3's tree, but the keep-above flag is
   set by kwin-i3 on every floating window and on nothing else, and it survives on the window:
   at a load, a window in no tile that carries the flag was floating and is adopted as such.
   Paul: "why can't they just stay floating?" The edge: a login with a session-restored window
   that KWin brings back with keep-above set would float it; no app of Paul's does that, and
   the floating toggle undoes it.

## Found by the review: a hand float lasted one caption change

`reclassify` ran the rules on every caption, class, transient or ready change and toggled the
window whenever their verdict differed from its floating state. A window floated by hand (the
rules say "tile") went back to tiled at its next retitle, reload or not; Firefox retitles within
seconds of any navigation. Pre-existing, reproduced by the reviewer in the test KWin, and the
reason the reload rule above would have held only for seconds. Paul, 2026-10-24: fix it here.

The rule: the rules act when their **verdict changes**, not when it differs from the window's
state. kwin-i3 keeps each managed window's verdict (`ruleKind`, set at adoption); `reclassify`
compares the new verdict with it and toggles only on a change. A `floatingTitle` word appearing
still floats a tiled window (`20-rules.sh`), a hand float survives a retitle (`20-rules.sh`,
`60-load.sh` after a reload).

## The login edge (review finding 3, documented, Paul: agree)

KWin's session management restores keep-above on Wayland as well (sm.cpp, xdgshellwindow.cpp):
a session-restored window that arrives after kwin-i3 loads is a fresh window, tiled by the
rules with a flag kwin-i3 did not record, the original symptom at login. No app of Paul's is
session-restored with the flag; left as is, noted in the README's trap row.

## The change

- `src/kwin.js`, `setFloatingLook`: `if (on) { if (!w.keepAbove) w.keepAbove = true;
  keptAbove[id(w)] = true; }`. The comment says why (this spec).
- `src/kwin.js`, `adoptWindow`: a window that did not just appear (`fresh` false: a load, a
  window re-adopted after a desktop change), is in no tile and carries keep-above is adopted
  floating whatever the rules say (decision 2).
- `tests/live/60-load.sh`: after the load, float `a` by the toggle; unload and load kwin-i3
  again: `a` is still floating; toggle `a` back to tiled: its keep-above is off; `fixed` is
  still floating and kept above; `release`: no window is kept above. Red today at "still
  floating" and at "keep-above off" / "nothing kept above".
- `src/kwin.js`, `reclassify`: acts on a verdict change only (`ruleKind`, above).
- `tests/live/20-rules.sh`: a window floated by hand, retitled: still floating. Red before.
- `tests/live/mutate.py`: the old `setFloatingLook` line back, the adoption rule removed
  (scenario `60-load.sh`), the verdict-change guard removed (`20-rules.sh`).
- `CHANGELOG.md`.

## What stays

The keep-above mechanism itself, the frame reading it, `release`'s other steps, the rules.

## Risks

None found: the change widens what kwin-i3 clears to flags on windows it is floating, which it
already treats as its own in every other way.

## Order

Change → `make test` → one review of spec and change → Paul says go → live reload.
