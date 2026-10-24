# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24**.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". Suggested order: 3, 2, 4, 5 (1, the scope fence, is done).

## Open

2. **Settings.** Next: inventory what is hard-coded (resize step 10 %, no gaps, 1 px frame width,
   new-window split, focus wrapping, workspace-to-monitor start), choose the few worth a setting
   (gaps, default 0, is the one new feature that fits), then the stock `contents/config/main.xml`
   + `contents/ui/config.ui` so it gets a Configure button in System Settings, including the keys
   that exist today.
3. **The script alone is the product.** Next: a live-test pass with none of the three plugins
   loaded, to learn what degrades; then make that a supported mode in `make test`, the plugins an
   optional extra.
4. **No dependence on Paul's dotfiles.** Next: list what `setup.sh` does that kwin-i3 relies on
   (clashing Plasma keys unbound, focus follows mouse, per-output virtual desktops, border size);
   for each, handle it, detect and report it, or document it in README's install. Then a run in
   `testkwin.sh` with a stock Plasma config.
5. **Wider reliability.** Next: fuzz configurations for one and three monitors, mixed scaling,
   more than one activity; Plasma 6.8 when it lands. Rare and deliberate, as the fuzzer is now.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
