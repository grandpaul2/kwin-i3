# Review: spec-reload-keepabove.md and the change (commit 3544b0f), 2026-10-24

Read against `src/kwin.js` at HEAD, KWin 6.7.5 (`sm.cpp`, `x11window.cpp`, `xdgshellwindow.cpp`,
`window.cpp`, `rules.cpp`, fetched from invent.kde.org `v6.7.5` into the scratchpad). `tests/live/run.sh
60-load.sh` was run in the test KWin: 12 passed, 0 failed. A scratch scenario (outside the repo, in the
scratchpad) was run once in the test KWin for finding 1. Nothing in the repo changed except this file;
nothing committed; the live KWin was not touched.

Verdict: **the change does what the spec says, and the keep-above ownership half is sound. But the spec's
headline promise, "a hand-floated window stays floating", is false past the first caption change, and that
is a gap that already existed in-session.** One must-fix (or an explicit decision by Paul to accept it), two
should-fix, the rest notes.

## Findings

1. **`reclassify` re-tiles any floating window on its next caption/class/transient/ready change if the
   rules say "tile". The flag-floated window, and a hand-floated one even without a reload, do not stay
   floating. Severity: must fix.**
   Claim: `reclassify` (`src/kwin.js:679-690`) takes `kind = Rules.classify(w)` and, whenever
   `(kind === "float") !== (con.type === "floating")`, calls `model.toggleFloating(con)` and
   `setFloatingLook(w, false)`. It has no memory of why the con is floating. The rules' say is "tile" for a
   resizable ordinary window, so the toggle undoes the float. `connectWindow` wires it to `readyForPainting`,
   `caption`, `transient` and `windowClass` changes (`:699-702`).
   Evidence: scratch scenario, test KWin: `client --title b`; `client --title a --retitle 25:a2`; focus a;
   `Floating Toggle`. Tree after the toggle: `H[b] ~a*`. Tree after the retitle: `H[b a2*]`, and `a2
   above=false`. So Meta+Shift+Space on a window whose title changes is undone by the title change. The new
   code makes the same thing true for a window adopted floating by the flag after a reload (the
   `adoptWindow` override at `:644` changes `kind` locally; nothing records it, so `reclassify` compares the
   con with the raw rules). 60-load.sh does not see it: the test client never retitles.
   Why it matters: Firefox changes its caption on every page load or tab switch, so "stays floating" holds for
   seconds. Paul's own question ("why can't they just stay floating?") is not answered by this change for
   his main example, and he may read the in-session case as the reload's fault when it is older. The un-float
   direction is tested nowhere: `20-rules.sh:16-17` tests only tile-to-float on a retitle, and no test or
   doc wants rules to un-float a hand-floated window.
   Fix (small): record the rules' raw verdict per window (`ruled[key] = Rules.classify(w)` in `adoptWindow`,
   before the flag override) and in `reclassify` act only when the verdict *changes*:
   `if (kind === ruled[key]) return; ruled[key] = kind;` before the toggle (delete it in `dropWindow`). A
   hand toggle, a drag out of a tile, a can't-fit float, and the flag override then all survive a retitle,
   while a rule change (a retitle to a `floatingTitle` word, a dialog that gains a transient) still acts, and
   the reverse (the word leaves the title) still un-floats a window the rules had floated. Note this leaves a
   hand-*tiled* rule-float (toggled to tiled by hand) alone on a retitle too, which is the same stickiness
   and the right one. Add to 60-load.sh a client with `--retitle 1:a2` floated by hand, reloaded, and a
   `floating_is` check after the retitle (red now, as above). If Paul would rather leave `reclassify` alone,
   the spec must say "until the window's next caption change" and the CHANGELOG line must not say "stays".

2. **The adoption condition is right in each caller without `fresh`, with one inconsistency and one login
   gap. Severity: should fix (the gap) / note (the inconsistency).**
   Claim and evidence, caller by caller:
   - Load path (`:1141-1143`): windows in KWin's tiles are adopted by `model.adopt` (`:1117-1124`) and never
     reach the condition, so every window kwin-i3 had tiled is safe from it. `!w.tile` leaves the rest:
     windows in no tile, which are floating ones, or tiled ones whose tile KWin dropped (the transient
     maximize/untile case, `:690-696` comment). Right.
   - `reclassify` for ignore-to-managed (`:681`, `adoptWindow(w)`): a window first seen as "ignore" (class
     not yet set, transient not yet set) and adopted later is not `fresh`, so if it carries keep-above it
     floats where the same window, classified correctly on `windowAdded`, would have tiled. Same window, two
     outcomes depending on event order. This is also where the fullscreen change's other `fresh` effects
     (no focus hand-back) already differ. Note, not a bug today: nothing of Paul's maps ignored-then-managed
     with the flag.
   - `desktopsChanged` re-adoption (`:722`): a floating window made sticky is dropped and its flag cleared
     (`dropWindow` clears recorded flags, `:670`); coming back to one desktop it has no flag, so it tiles
     (the rule's float is lost, as before this change: pre-existing). A *tiled* window made sticky and back:
     dropped, `untile`d, no flag unless Paul set one; adopted as "tile". Right. A tiled window carrying a
     hand flag, made sticky and back, floats: the one real false positive of the rule, and rare.
   - What can carry keep-above without kwin-i3: (a) a user action, KWin's menu, titlebar action or Plasma
     (`window.cpp:2034-2046`, the plasma-window-management request `:1791`); (b) a KWin window rule
     ("keep above", `rules.cpp:725`), applied at map (`xdgshellwindow.cpp:1462`, `x11window.cpp:794`);
     (c) an X11 client's `_NET_WM_STATE_ABOVE` (`x11window.cpp:794`; no Wayland client can ask for it);
     (d) session restore (finding 3). KWin itself never sets it otherwise (`setKeepAbove` callers in
     `window.cpp` are the mouse actions, `setKeepBelow`'s clearing, and the plasma request).
   - Paul's desktop: Firefox, Alacritty, KeePassXC (its "always on top" is off by default and, native
     Wayland, cannot work), Prism/Minecraft (GLFW does not set it), OBS (projector "always on top" is an
     X11 hint; a projector window is a float candidate anyway), the Xephyr stage (rule-floated; in the
     `else` branch it floats already). Risk: **low**. In every case the window is in no tile only when it is
     already floating or is being newly mapped, and `fresh` covers the latter. The worst case is one
     always-on-top X11 window that kwin-i3 had tiled being floated by a reload while *not in a tile*, which
     needs KWin to have dropped its tile first.
   Fix for the login gap: see finding 3.

3. **KWin restores keep-above on Wayland too, so the login edge is wider than the spec says, and it goes
   the other way. Severity: should fix (the spec's wording; decide the behaviour).**
   Evidence: `sm.cpp:172` writes `staysOnTop` for every saved window; `xdgshellwindow.cpp:448-449, 486,
   1260-1264, 1462` read `keepAbove` from the xdg-session data and apply it at map through
   `rules()->checkKeepAbove(initialKeepAbove(session), true)`. So at logout every kwin-i3 floating window
   is saved with the flag, and a session-restored app comes back with it. `x11window.cpp:758` does the same
   for X11.
   Consequences: (a) The spec says "no app of Paul's does that". Any app of his that KWin session-restores
   and that was floating at logout does, with no app involved. (b) A restored window arriving *after* the
   script loaded is `fresh`: it is tiled by the rules and keeps the restored flag, unrecorded: tiled, kept
   above, and green. The original bug again, via login rather than reload, and un-floating cannot
   happen as it is not floating; the frame shows it as floating-looking while it is tiled. (c) A restored
   window arriving *before* the script loaded (not `fresh`, in no tile) floats, which is the intended
   effect. The login edge therefore depends on arrival order; (b) is the more likely order, given the
   script starts at login with no windows.
   Options for Paul: leave it and say so in the spec (the "login edge" is "a restored window's saved
   keep-above is kept, unowned, and shows green"); or drop the flag on tiled `fresh` windows that have it
   and that are not rule-forced (cannot tell a user's flag from a restored one: the same trade as decision
   3 of the frame colours spec); or treat a `fresh` window with the flag as floating too (consistent with
   decision 2, but floats an always-on-top video window at open). I would write it down and do nothing:
   a one-off tiled-green window after a login is the smallest of the three evils and Meta+Shift+Space twice
   cures it (finding 4).

4. **`setFloatingLook(w, true)` records a flag it did not set; the callers are right, and `release` now
   clears more. Severity: note.**
   Evidence: callers are `floatWindow` (`:475`), the "Floating Toggle" action (`:862`), `reclassify`
   (`:687`), the drag-out path (`:776`) and `adoptWindow` for kind "float" (`:650`). All are kwin-i3 making
   the window floating, which is when it owns the flag. In the refusal and can't-fit paths of `floatWindow`
   the con is a tiled one made floating by kwin-i3: owning the flag is right, and a hand flag the window had
   while tiled is now cleared when it tiles again (the spec's accepted reading). A KWin rule that forces
   keep-above: `w.keepAbove = false` is ignored by the rule (`rules.cpp` `checkKeepAbove`), so the
   un-float does nothing and the window stays above, harmless and exactly as before.
   What `release` does now that it did not: `keptAbove[key]` is true for every floating window including
   ones with a flag set by an earlier instance or by Paul, so `release` clears those flags (before, only
   the ones this instance set). It is the safety valve and "nothing kept above" is the better state. Note
   a window that goes "ignore" at a reload (became sticky or `skipTaskbar` while floating) keeps its flag
   for good: never adopted, never owned. Rare, and `release` does not see it either.

5. **The test checks what its messages say, with one guard that is only a guard. Severity: note, with one
   small should-fix.**
   Evidence, check by check (`tests/live/60-load.sh:25-50`):
   - `floating_is a` matches `*"~a"*` in the TREE line: also `~a2`, `~aa`; here no other floating window
     starts with `a`. Fine at this size. `tiled_is` requires no `~a` and ` a ` as a whole word after
     stripping the brackets, `*`, `!`: right. `tree` returning empty fails both, as it should.
   - `prop_is a keepAbove false` after the toggle is the real "un-float cleared the flag" check; it is the
     one mutant 1 turns red, as the commit says. Good.
   - `fixed is still floating, kept above` (`:45`) checks only `keepAbove true`, not that fixed is floating
     in the tree, and it is not polled. It passes at HEAD~1 too (the old instance's flag simply survives),
     so as a *regression* check it is a guard; its message overstates it. The meaningful half is
     `none_above` after release, which needs fixed to be owned by the new instance (red under mutant 1,
     as the commit says). Should fix, trivially: add `floating_is fixed` to that line, or reword it.
   - `none_above` looks only at `normalWindow` windows; the test windows are all normal. It runs after the
     `prop_is` checks that put at least `fixed` above, so it cannot pass vacuously. Fine.
   - Mutant 2 ("a reload re-tiles a hand-floated window") is red at "a is still floating after the reload".
     The mutant pair is complete for what the change does; neither would catch finding 1.
   The release at the end: `release()` is guarded by `released` and untiles every window; 20-rules.sh ends
   the same way and then runs `clean_log`, and this run's `clean_log` passed. The test KWin is torn down
   by `testkwin.sh` after the scenario. No effect on `clean_log`.

6. **Wording: the README's trap row and the spec's trap sentence now omit what a reload does. Severity:
   note.**
   Evidence: `README.md:100` says "a window you keep above yourself paints the same, and a floating window
   whose keep-above you clear paints as tiled". Add: "and a reload takes a window that is kept above and in
   no tile for a floating one". The spec's "What stays" and "Risks" ("None found") should list findings 1
   (until the first retitle, unless fixed) and 3 (session restore). The CHANGELOG sentence "stays floating"
   needs the same qualifier if finding 1 is not fixed. `docs/spec-frame-colours.md` decision 3 (the trap) is
   consistent with the change and needs no edit beyond a pointer.

## What I checked and found fine

- The `!fresh` argument: `windowAdded` passes `true` (`:1146`), the load path, `reclassify` and
  `desktopsChanged` do not; the condition is the right one for "did not just appear".
- `kind === "tile"` first: a window the rules float or ignore is untouched; the override cannot un-float.
- `wins[key]` check at the top of `adoptWindow` and the order (override before `wsForWindow`): no state is
  written before the override, and `ws` null still returns after connecting.
- `dropWindow` clears the flag it owns (`:670`) and deletes `keptAbove[key]` (`:673`): a window that is
  floated, dropped and re-adopted floating gets its record again from the new `setFloatingLook(w, true)`.

## Verdict

**Not yet ready for Paul to decide on deployment as the spec describes it: the ownership fix is good, but
"stays floating" is untrue past the first retitle (finding 1).** Either make the small `reclassify` fix and
add its test (my recommendation), or ship as is with the spec and CHANGELOG saying "until the window's next
caption change".

Paul must decide: (1) fix `reclassify` so a window's float state changes only when the rules' verdict
does, or accept that a hand float lasts until the next retitle (this is also true today without any
reload); (2) what to do about session-restored keep-above at login (finding 3: my advice is to document it
and do nothing). Paul should be told: a deployment reload re-tiles his windows once, as usual, and
floats any window that is in no tile and kept above; on his desktop that is only his floating windows.
