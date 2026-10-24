# Spec: a reload keeps owning the floating windows' keep-above flags

From Paul's question, 2026-10-24 ("even when I unfloat it, it stays green"). Status: **draft,
decided in substance by Paul (spec it, 2026-10-24); the two questions under "Decisions" are
open. Not built, not reviewed, not live.**

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

## Decisions

1. **Reviews.** One line of code, one check and one mutant: review the spec and the change
   together, as for the frame colours, or the spec first?
2. **A reload re-tiles a window floated by hand** (Meta+Shift+Space): at a load, kwin-i3 takes
   the windows in KWin's tiles as tiled and classifies the rest by the rules, so a resizable
   window Paul floated by hand comes back tiled; only rule-floated windows (dialogs, fixed size)
   come back floating. Pre-existing, separate from this spec, and the likely reason Paul's
   Firefox was tiled again by the revert's reload while keeping the flag. Leave it (a reload is
   rare and re-tiles everything anyway), or note it as a known limit in the plan?

## The change

- `src/kwin.js`, `setFloatingLook`: `if (on) { if (!w.keepAbove) w.keepAbove = true;
  keptAbove[id(w)] = true; }`. The comment says why (this spec).
- `tests/live/60-load.sh`: after the load, float `a` by the toggle; unload and load kwin-i3
  again; toggle `a` back to tiled: its keep-above is off. Then `release`: no managed window is
  kept above (`fixed` and the dialog were floated by the first instance). Red today at both.
- `tests/live/mutate.py`: the old line back (scenario `60-load.sh`).
- `CHANGELOG.md`.

## What stays

The keep-above mechanism itself, the frame reading it, `release`'s other steps, the rules.

## Risks

None found: the change widens what kwin-i3 clears to flags on windows it is floating, which it
already treats as its own in every other way.

## Order

Decide (1, 2) → review → change → `make test` → (review of the change, if 1 says separate) →
Paul says go → live reload.
