# Review of the slow tests (2026-10-22)

Scope: tests/live/*, tools/testkwin.sh, tools/logsink.py, tests/live/mutate.py. Read-only review; only this
file was written. Measured on pauls-desktop with the private headless KWin.

## Measurements

| scenario | wall time |
|---|---|
| KWin start + teardown with nothing in it (`testkwin.sh /bin/true`) | 1.0 s |
| 00-harness | 4.7 s |
| 10-tiling | 14.5 s |
| 20-rules | 16.3 s |
| `make live` total (serial) | about 36 s (the brief says 2 min and 25-40 s per scenario; not true today) |
| 3 scenarios in parallel, unique socket names | 25 s with the bug in my patched copy that wastes 10 s, so about 16 s (the longest scenario) |
| `make mutate-live` estimate | 15 faults x 36 s, about 9 min |

Where the time goes: KWin start is 1 s of the 36, so "fewer KWin restarts" is NOT a win. The rest is fixed
sleeps: 28 `sleep` statements plus `key` (0.3 s x about 20 calls), `kclose` (0.5 s x 8), `client ...; sleep 1`
(x about 12), the 3.5 s sleep in 00-harness, and the 0.5-0.8 s sleeps in 20-rules. Roughly 25 of the 36
seconds is sleeping.

## Faults, ranked

### 1. `kjs` reuses the same marker and script name: the counter never persists (lib.sh:11-26)
`_kjs_n=$((_kjs_n + 1))` runs in a subshell whenever kjs is called as `$(kjs ...)` or `kjs ... | grep`,
which is how `geom`, `geom_is` and most reads call it. Verified with a probe: after one direct call, `_kjs_n`
stays 1, and two later `$(kjs ...)` calls both used `KJS2-END` and `kjs2.js`. Consequences:
- The wait loop (`grep -q "$mark" "$KI3_LOG"`) finds the marker left by the previous call at once and does
  not wait. The result is read before the script has run, and works only because loadScript/start/unload
  take a few ms. Under load (parallel runs, a busy box) it will return empty or truncated output.
  Every `geom_is` check is exposed to this.
- loadScript with an already used plugin name and file is also reused.
Fix: make the id unique without shell state, e.g. `n=$(date +%s%N)$RANDOM` or `$$-$RANDOM`, or a counter kept in a
file. Wait for the marker only in lines after `$before`, not in the whole log
(`tail -n +$((before+1)) "$KI3_LOG" | grep -q "$mark"`).

### 2. kjs swallows every failure and returns nothing (lib.sh:19-25)
A syntax error or exception in the injected script logs nothing; kjs waits the full 5 s and prints an empty
string; the busctl calls go to /dev/null and nothing checks their exit status. Verified: `kjs 'this is not js'`
returns an empty string after 5 s with no error. Checks that compare against a value fail anyway (good), but
checks that assert the ABSENCE of something pass:
- 20-rules.sh:56-57: `g=$(geom a); test "$g" != "0,0 427x720" -a "$g" != "0,0 1280x720"` is true when `g` is
  empty (window not found, kjs broken). It passes for the wrong reason. Assert it matches `^[0-9-]+,[0-9-]+ [0-9]+x[0-9]+$` first.
- 10-tiling.sh:49 `kjs ... | grep -qx true` and 20-rules.sh:26, 52 are positive and safe, but make kjs fail loudly
  anyway: wrap the script in try/catch that logs `kjs-error: ...`, make kjs `return 1` on timeout or error,
  and have the marker wait print a diagnostic.

### 3. Geometry checks are single-shot reads after a fixed sleep (10-tiling.sh, 20-rules.sh)
`geom_is` reads once. It relies on the preceding `sleep 1`, `key`'s 0.3 s, `kclose`'s 0.5 s or 20-rules'
0.6/0.8 s sleeps. KWin applies tile geometry asynchronously after the client acks a configure; a loaded
machine (a parallel run, or `mutate-live` while Paul works) will flake. Examples: 10-tiling.sh:27-29
(after `key "Move Left"`, waits for the tree but not the geometry), :58, :64, :66-68, :69-71;
20-rules.sh:21, 24, 29, 33, 35, 53.
Fix: `wait_geom caption "x,y wxh"` polling for up to 5 s like `wait_tree` does, and use it in `geom_is`.

### 4. Reload check can pass without a reload (20-rules.sh:44-50)
`wait_tree` reads the LAST `TREE 1` line in the whole log. Before the reload that line is already
`H[a main V[c d*]]`, so "after reload, same tree" passes the instant it is called, even if the reloaded
script adopted nothing. The 50 x 0.1 s loop before it waits for "kwin-i3 loaded" but then `sleep 0.5` is a
guess. Only the following `geom_is d` really tests the reload. Fix: record the log line count at unload and
make `tree()` and `wait_tree` search only lines after a given mark (add `mark_log`/`tree_since`). The same
stale-line weakness applies to any `wait_tree` whose expected value was already the last tree, e.g.
10-tiling.sh:41 ("b tiles again" equals an earlier state, saved only because a floating line came between).

### 5. Early checks and the end `clean_log` are the only invariant checks; 00-harness has none
00-harness.sh does not call `clean_log`. In the other two it runs once at the end, so an INVARIANT/ERROR line
is reported after the fact and not tied to the step that caused it. Cheap fix: print the first offending line
in `clean_log` (it only returns true/false now, lib.sh:63) and call it after each phase.

### 6. run.sh and testkwin.sh status handling: mostly right, with gaps
Good: nonzero exit from a scenario, a `timeout 100` (exit 124) or a crash all set `status=1`
(run.sh:8). Gaps:
- A scenario that never reaches `finish` or runs zero checks can exit 0 (nothing asserts that at least N checks
  ran). There is no `set -e` in the scenarios, and `source lib.sh` failing is ignored. Fix: have `finish`
  fail when `passed+failed == 0`, and have `run.sh` print and require the "N passed" line.
- run.sh does not build; `tests/live/run.sh` tests whatever `package/.../main.js` exists (stale if src/ was
  edited). Only `make live` builds. Put `../../build.sh` at the top of run.sh, or fail if main.js is older than
  src/.
- testkwin.sh:62-65: the KWin start wait loop falls through silently after 10 s when KWin never came up. The
  scenario then runs against nothing and its first `load_kwin_i3` fails with an unreadable busctl error. Add
  `|| { echo "testkwin: KWin did not start" >&2; exit 1; }`. (In my patched copy this loop did run the full
  10 s, which is how I noticed.)
- testkwin.sh:25: `timeout 120` kills `dbus-run-session`; whether the inner script's EXIT trap (kill of the
  bus-attached clients, kwin) runs on SIGTERM is NOT verified by me. After my own failed parallel run
  (timeouts hit) no kwin_wayland or testclient was left over, so teardown worked at least there.
- run.sh:8 `2> >(grep ...)` is an async process substitution; its output can arrive after the next
  scenario's header.
- 120 s (testkwin) vs 100 s (run.sh): the outer one always wins, so the 120 s is dead. Harmless; pick one.

### 7. mutate.py reports red for anything non-zero (tests/live/mutate.py:30-34)
- No baseline: it never checks that the unmutated suite is green first, so a broken environment makes all 15
  faults "red" and the battery looks perfect. Run `run.sh` once before the loop and abort if red.
- "Red" includes timeouts, KWin crashes and infrastructure failures. Require that output contains `FAIL` (a
  check failed) and print which check killed the fault.
- `subprocess.run(..., timeout=400)` raising `TimeoutExpired` is uncaught: the loop dies (src restored by
  `finally`, but the last `build.sh` is skipped, leaving `package/.../main.js` built from the mutant).
  Ctrl-C does the same. Move the rebuild into the `finally`.
- Mutants that need a specific scenario run all three. See speed item S3.

### 8. Test client timing: map-delay and retitle sleeps are exact-length guesses (00-harness.sh:13, 20-rules.sh:13)
`sleep 3.5` covers a 1.5 s map delay and a 1 s retitle with 1 s slack; `sleep 2.5` for a 1 s retitle in
20-rules. Passes today, and wastes time when KWin is fast. Replace with `wait_log`/poll on the caption (S1).

### 9. Fragile exact geometry
Thirds (427, 853, 213, 363x555) come from `Math.round` of 1280/3 etc. and the 10% grow arithmetic
(10-tiling.sh:28-30, 50-52, 68-70). They are stable only while the screen is 1280 wide and decorations are
off (headless KWin has none; if server-side decoration or a border is turned on in the test KWin the whole
file breaks at once). Accept +/-1 px, or compare fractions of the screen. The test client's 400x300 default
size is irrelevant because tiles override it, but a `--min` larger than the tile would silently break the
split checks (not currently exercised).

### 10. `key` bypasses the real shortcut path (lib.sh:50)
`invokeShortcut "kwin-i3 <action>"` proves the action works but not that `registerKeys` bound the
default keys (kwin.js:487-498). A typo in `KEYS` goes unnoticed. See coverage.

## Speed wins, ranked

- S1. Replace fixed sleeps with polls on the log. Estimated saving: 36 s -> about 12-14 s serial (about 22 s).
  - `key`: wait for the `ACTION <name>` line kwin.js logs (kwin.js:445) after a line-count mark instead of
    `sleep 0.3` (saves about 6 s per run), and also poll the geometry.
  - `client X; sleep 1` -> wait until `TREE` contains X (the tree already holds titles) (about 10 s).
  - `kclose` `sleep 0.5` -> wait until the window is gone from the tree (about 4 s).
  - 00-harness `sleep 3.5` -> poll until all five captions exist (about 2.5 s).
  - 20-rules 0.6/0.8/2.5 s -> `wait_geom`/`wait_tree` (about 5 s).
- S2. Run scenarios in parallel. Estimated: 36 s -> about 16 s with sleeps (the longest scenario), about 6 s
  after S1. Only one thing is actually shared: the Wayland socket name `ki3test`
  (testkwin.sh:22, 62, 66). I ran 00/10/20 together with the original script: ALL fail (the sockets
  collide; 00 failed 6/6, the others failed partway and took the full 120 s timeouts). With the socket named
  `ki3test$$` (my copy at the scratchpad, `tk/testkwin.sh`) all three passed in parallel. Everything else is
  private: the D-Bus session, `XDG_*` dirs in a mktemp dir, the log sink name (on the private bus). The X
  display (`KI3_XWAYLAND`) is unused by the scenarios; if turned on, the `/tmp/.X11-unix` before/after diff
  (testkwin.sh:55-60) will race under parallel runs. Fix: `export WAYLAND_DISPLAY=ki3test.$$` and change
  line 62 to use `$WAYLAND_DISPLAY` (and the socket in --socket). Then `run.sh` does
  `for t in ...; do ( ... ) & done; wait`, collecting each exit status and buffering output per scenario.
  Do S1 first or at least with 3 concurrent scenarios, since the geometry checks (fault 3) will flake under load.
- S3. Mutation battery: 9 min -> about 1-2 min.
  - Stop at the first FAIL (a red mutant needs only one failing check): have `finish`/`check` exit on first
    failure when `KI3_FAILFAST=1`. The mutants are caught quickly in most cases.
  - Map each fault to the scenario that can kill it (e.g. both `rules.js` faults -> 20-rules only; padding,
    sizes, merge, grow width, one size pass, focus -> 10-tiling; maximize/minimize/release/adopt -> 20-rules),
    and run that scenario first; run the others only if it stays green. Roughly a 2-3x cut.
  - Run faults in parallel with S2. The faults edit `src/` in place and `build.sh` writes
    `package/contents/code/main.js`, so each worker needs its own copy of the tree (`cp -r` to a mktemp dir,
    or `git worktree`), and `lib.sh` `root=` already derives from its own location so a copied tree works.
    4 workers x 4 scenarios in flight is fine on this box.
- S4. The 1 s KWin start is not worth merging scenarios: do not share one KWin across scenarios, state leaks
  (windows, tree, loaded script) would couple them.

## Coverage gaps in src/kwin.js (not exercised by any live test)

- Multiple monitors: `outputNeighbour: null` (kwin.js:540); the harness has 2 outputs but no test uses the
  second one (Move/Focus across outputs, windows opening on output 2, per-output desktops).
- Virtual desktops: `desktopsChanged` handler (kwin.js:374), windows moved between desktops, desktop switch,
  `deskNum`/`wsForWindow`; only workspace 1 is ever used although the test KWin has 4 desktops.
- Interactive move/resize: `interactiveMoveResizeStarted/Finished` and `readBack` (kwin.js:269-296, 385-395):
  a user dragging a tile edge must update the model percentages. Not tested.
- `tileChanged` (kwin.js:395-410): something outside the script moving a window into or out of a tile.
- Ignore path: `Rules.classify` "ignore" (ignored resource classes, `skipTaskbar`, `onAllDesktops`, popups) never
  tested; neither is `floatingClass`/`readConfig` overrides or `FLOAT_CLASS`.
- Focus: `Focus Up/Down`, `Move Up/Right/Down`, `Focus Mode Toggle`, `Shrink/Grow Height` have no live test
  (only tree.test.js covers the model side). `windowActivated` -> model focus (kwin.js:567) is covered only
  by the single "KWin's active window follows" check.
- Window lifecycle: closing a fullscreen or minimized window; fullscreen of a floating window; two clients
  on one workspace with the same caption (the tests find windows by caption, so they can't be told apart);
  X11 clients (`KI3_XWAYLAND` is never set by a scenario, and the real stage window is an X11 Xephyr).
- Real key bindings (see fault 10), and the `guard` error path (kwin.js:19-27): no test forces an exception
  to prove it logs `ERROR` and keeps running.
- Reload with floating windows, minimized windows or several workspaces (the reload test has one tiled tree).
- The mutation list in mutate.py has 13 of 15 faults in kwin.js but none for: desktopsChanged, readBack,
  tileChanged, ignore path, focus follow for Up/Down; adding a fault there would fail nowhere today, which is
  the evidence of the gap.
