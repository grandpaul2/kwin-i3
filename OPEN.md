# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24**.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". Suggested order: 2, 4, 5 (1, the scope fence, and 3, the script alone, are done).

## Open

2. **Settings** (`docs/spec-settings.md`, Paul's go 2026-10-24 for the order). Step (a), the
   form and Meta+Shift+C, is live; (b) resize step, orientation, focus wrapping, (c) workspace
   outputs and (d) gaps are live too (2026-10-24; (a) and (b) hand-checked by Paul). Next: (e),
   in the `settings` worktree, live on Paul's go: frame width and the plugin hooks, and **Apply
   should apply** (Paul, 2026-10-24: Apply in the Configure form must take effect, not only
   Meta+Shift+C): the KWin plugin, renamed `kwini3helper` ("frame focus, settings apply"),
   watches `kwinrc` and has KWin reconfigure when `[Script-kwin-i3]` changes. Three plugins stay
   three (decoration, effect, KWin plugin: three loaders). Later, Paul's call: the one-line KWin
   fix upstream (`ScriptingConfig::reload` in `genericscriptedconfig.cpp`).
4. **No dependence on Paul's dotfiles.** Next: list what `setup.sh` does that kwin-i3 relies on
   (clashing Plasma keys unbound, focus follows mouse, per-output virtual desktops, border size);
   for each, handle it, detect and report it, or document it in README's install. Then a run in
   `testkwin.sh` with a stock Plasma config.
5. **Wider reliability.** Next: fuzz configurations for one and three monitors, mixed scaling,
   more than one activity, and with no plugins (the fuzzer loads them whenever they are built);
   Plasma 6.8 when it lands. Rare and deliberate, as the fuzzer is now. Also `53-hold.sh` is
   flaky under `run.sh` (2026-10-24: two failures in three runs, different checks: the kill
   switch's `--notify` not taking, "a hold is open"; 3 of 3 green run alone, old and new build).
   2026-10-24 again, step (e): "a hold is open" (section 13) failed ~2 in 20 solo runs with the
   new plugin build, 0 in 9 with the old; no failure caught in a 10-run loop with the counters
   printed. Next: find the timing it depends on (the counters at a failing run).

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
