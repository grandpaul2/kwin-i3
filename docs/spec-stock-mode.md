# Spec: the stock test mode (OPEN.md item 4)

Paul's go 2026-10-24, (i)-(v) below. The question: does kwin-i3 work on a stock Plasma, installed
by someone who is not Paul? `testkwin.sh` has always run Paul's desktop settings (ten desktops,
per-output desktops on, focus follows mouse, Plasma's clashing shortcuts unbound), so the suite
had never seen a stock setup.

## What a prototype sweep found (2026-10-24, a worktree, `src/` untouched)

Three runs of every live scenario, each a step closer to what the install tells a stranger to do:

1. **Pure stock** (one desktop, per-output desktops off, stock shortcuts, stock focus): almost
   everything fails from the first window. That is (b)'s known break: with two monitors and
   per-output off, a desktop switch changes both monitors (`docs/spec-per-output-desktops.md`),
   and kwin-i3 already reports it at load. Nothing new.
2. **Stock + per-output on**: 22 of 30 pass. 50-keys misses every key from Meta+L on: stock
   Meta+L is Lock Session, which locks the test KWin, and nothing fires after it. The keys
   before it that miss (Meta+E, Meta+arrows) are the ones (c) reports as taken.
3. **Stock + per-output on + `make take-keys`**, the install as written: 23 of 30 pass. The
   failures are all the tests' own assumptions:
   - **26-gaps, 41-unplug-focus, 51-input, 54-frame assume focus follows the mouse.** 26: after
     the script reload b keeps the focus, and the model and KWin agreed on b before it; with
     focus follows mouse a has it because the pointer is there. 41's own comment: "focused: it
     is under the pointer". 51 and 54 check hover focus.
   - **35-taken-keys and 36-per-output-off test the conditions stock mode changes**: a known
     set of taken keys, per-output off.
   - **53-hold** "deleted: on again (the old key's default)" failed once in the full run, then
     passed 3 of 3 alone in each mode: load, item 5's flaky family.

**No real finding.** With per-output on and take-keys run, kwin-i3 works on a stock Plasma with
click-to-focus.

## The change

- (i) **`KI3_STOCK=1`** for `testkwin.sh` is the README's install on a stock Plasma: one desktop,
  per-output desktops on (the README requires it with 2+ monitors), stock focus settings, no
  `[ModifierOnlyShortcuts]` line, Plasma's stock shortcuts (no `kglobalshortcutsrc`), and
  `make take-keys` once kwin-i3 has loaded (`load_kwin_i3`, the first load of a scenario only;
  a second run would take nothing, and keeps the first save anyway). `make live-stock` runs the
  sweep (`KI3_STOCK=1 tests/live/run.sh`).
- (ii) **`# focus: mouse`** in a scenario: in stock mode its test KWin gets focus follows mouse
  (the three `[Windows]` lines of the default mode). On 26, 41, 51, 54. The README pass ((e))
  says to turn it on for i3's feel. Rewriting those checks to click instead would test both
  policies, at twice the work; not now.
- (iii) **`# stock: own`** in a scenario: stock mode runs it as the default mode does, with its own
  headers. On 35 and 36.
- (iv) Pure stock, per-output off, stays covered by 36; no sweep of its own.
- (v) 53's "deleted: on again" goes on item 5's flaky list.

The default mode (`make live`) doesn't change.

## Tests

The change is to the harness, so the check is the sweep itself: `make live-stock` green apart from
item 5's known flakes, and `make live` unchanged. Turning it red: `make live-stock` with the
`# focus: mouse` header removed from one scenario fails that scenario (the assumption is real),
and with take-keys skipped fails 50-keys from Meta+L on.
