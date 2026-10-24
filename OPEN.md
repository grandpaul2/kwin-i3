# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24**.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". Suggested order: 4, 5 (1, 2 and 3 are done).

## Open

2. **Settings**: done and hand-checked (`docs/spec-settings.md`, 2026-10-24). Left, Paul's call,
   when he wants it: the one-line KWin fix upstream (`ScriptingConfig::reload` in
   `genericscriptedconfig.cpp`), so Apply applies without the plugins too.
4. **No dependence on Paul's dotfiles.** Inventory done 2026-10-24 (what `setup.sh` and
   `testkwin.sh`'s config give kwin-i3 that stock Plasma doesn't). Design agreed with Paul
   2026-10-24; next: the stock tests, then the README pass.
   (a) **Done, live** 2026-10-24 (`docs/spec-desktops-on-demand.md`): workspaces created on
   demand, up to 10, never removed.
   (b) **Done, live** 2026-10-24 (`docs/spec-per-output-desktops.md`): per-monitor desktops off
   with 2+ monitors reported (at load, and once later), never set; turned on, each monitor gets
   its own workspace back.
   (c) 21 stock shortcut defaults collide (Meta+arrows, Meta+Ctrl+arrows, Meta+Shift+Left/Right,
   Meta+1..9, Meta+0, Meta+V) plus Meta+E, Meta+L, and KWin gives a taken key away silently
   (`registerShortcut` always returns true): at load ask kglobalaccel which keys kwin-i3 got and
   report the taken ones. **Done, live** 2026-10-24 (`docs/spec-taken-keys.md`): the check at
   load (active holders only), one notification, `warnTakenKeys`, `make take-keys` /
   `make restore-keys`. On Paul's desktop all 64 keys fire kwin-i3's: no notification.
   (b) and (c) share **one notification at load** listing every problem (kwin-i3's first
   notification; everything else stays in the journal).
   (d) **Done** 2026-10-24 (`docs/spec-own-keys.md`): kwin-i3's own Meta+F / Meta+Shift+Q, live. (e) Focus follows mouse and Meta-alone: README only. Then a
   `KI3_STOCK=1` mode of `testkwin.sh` (stock config) with a scenario for (a)-(d) and a sweep of
   the existing ones.
6. **The desktop list changing mid-session.** kwin-i3 doesn't watch `workspace.desktopsChanged`:
   removing or reordering a desktop in System Settings renumbers KWin's desktops under the model
   (workspace 4's windows are on what is now desktop 3); appending is harmless. Found 2026-10-24
   (`docs/spec-desktops-on-demand.md`). Next: choose between re-adopting every window on a removal
   or move (as a reload does), and a README line; then a live scenario for it.
5. **Wider reliability.** Next: fuzz configurations for one and three monitors, mixed scaling,
   more than one activity, and with no plugins (the fuzzer loads them whenever they are built);
   Plasma 6.8 when it lands. Rare and deliberate, as the fuzzer is now. Also `53-hold.sh` is
   flaky under `run.sh` (2026-10-24: two failures in three runs, different checks: the kill
   switch's `--notify` not taking, "a hold is open"; 3 of 3 green run alone, old and new build).
   2026-10-24 again, step (e): "a hold is open" (section 13) failed ~2 in 20 solo runs with the
   new plugin build, 0 in 9 with the old; no failure caught in a 10-run loop with the counters
   printed. Next: find the timing it depends on (the counters at a failing run).
   And 53-hold's "a snapshot takes under a frame at 240 Hz" failed in 3 of 5 full runs on
   2026-10-24 (~100 ms; 31 scenarios, Firefox busy, load ~6-9), green alone. Next, with the
   counters: whether it measures the effect or the loaded machine.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
