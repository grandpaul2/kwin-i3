# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24**.

## Heading (Paul, 2026-10-24)

Flesh out what is there: more configurable and more reliable, so it works on a machine that is not
Paul's, set up by someone who is not Paul. **Not** more of i3: the goal is i3's feel and basic
window management, with Plasma doing the rest. The scope and its reasons:
`docs/plan.md`, "Scope". Suggested order: 7, 4, 5 (1, 2 and 3 are done; Paul, 2026-10-24:
convenience and accessibility before the README pass).

## Open

7. **A settings page of its own, and a tidier form** (Paul, 2026-10-24: convenience and
   accessibility before the README pass). kwin-i3's own entry in System Settings > Window
   Management, with its keys on a sub-page, and the script's form tidied to match.
   Built and tested in the test KWin (`docs/spec-settings-page.md`, "The page is built"; form,
   page, `make kcm-install`, `37-settings-page.sh`, code-reviewed). Next: install it on Paul's desktop (`make
   kcm-install`, then a login) and his look at it.

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
   - **the README pass**: install read as a stranger on a stock Plasma. Next: do it. It must
     cover: a package linked while KWin runs can't be turned on until the next login (KPackage's
     cache, `docs/spec-settings-page.md`).
6. **The desktop list changing mid-session.** kwin-i3 doesn't watch `workspace.desktopsChanged`:
   removing or reordering a desktop in System Settings renumbers KWin's desktops under the model
   (workspace 4's windows are on what is now desktop 3); appending is harmless. Found 2026-10-24
   (`docs/spec-desktops-on-demand.md`). Next: choose between re-adopting every window on a removal
   or move (as a reload does), and a README line; then a live scenario for it.
5. **Wider reliability.** Fuzz configurations for one and three monitors, mixed scaling, more
   than one activity, and with no plugins (the fuzzer knows only two 1280x720 outputs at scale 1,
   unplugs only Virtual-1, and loads the plugins whenever they are built); Plasma 6.8 when it
   lands. Rare and deliberate, as the fuzzer is now. Next: a read-only check that
   kactivitymanagerd can run on a test KWin's bus (if not, activities are won't-fix here, with the
   reason), then a spec for the harness pieces (`KI3_OUTPUTS`, a scale per output, `run.py
   --no-plugins`, the invariants' two-output assumptions), then one campaign per configuration. 53-hold runs
   by itself after the parallel batch (`# timing: alone`, 2026-10-24), so its timing checks are
   strict in `make test`.
   53-hold's other early failure, the kill switch's `--notify` not taking (seen once, early
   2026-10-24), has not recurred in ~15 full runs since; closed unless it comes back.

Not decided: a release and its timeline (KDE Store `.kwinscript`, issue template asking for a
`tools/capture` bundle). Paul, 2026-10-24: not settled yet; this is not an item until he decides.

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
