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
4. **No dependence on Paul's dotfiles.** (a)-(d) done and live 2026-10-24: workspaces created on
   demand (`docs/spec-desktops-on-demand.md`), per-monitor desktops reported and put right when
   turned on (`docs/spec-per-output-desktops.md`), taken keys reported with `make take-keys` /
   `restore-keys` (`docs/spec-taken-keys.md`), kwin-i3's own Meta+F / Meta+Shift+Q
   (`docs/spec-own-keys.md`); (b) and (c) share one notification at load. The stock test mode
   is done (`make live-stock`, `docs/spec-stock-mode.md`, 2026-10-24): the install as written
   (per-output on, `make take-keys`) works on a stock Plasma with click-to-focus; no real
   finding. Left:
   - (e) focus follows mouse and Meta-alone: README only, in the README pass (four scenarios,
     `# focus: mouse`, assume it);
   - **the README pass**: install read as a stranger on a stock Plasma. Next: do it.
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
   And 53-hold's "deleted: on again (the old key's default)" (the effect not hearing a
   `kwriteconfig6 --delete`) failed in 5 of 5 full runs on 2026-10-24, HEAD and stock mode alike,
   and passed 6 of 6 alone, so `make test` is red on that check now. Next: the same counters.
   Cosmetic: some scenarios print "lib.sh: line 25: …/ki3.log: No such file or directory" after
   their tally (seen 2026-10-24): a `mark` running after teardown removed the test dir. Next:
   find which background call does it.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
