# The fuzzer and the capture key

Two tools for finding bugs faster than daily use does:

1. **`make fuzz`**: random action sequences in the headless test KWin, with pixel-level invariants
   checked after every step; a new failure is replayed, recorded, and shrunk to a short repro.
2. **The capture key** on a live desktop: writes kwin-i3's state to a file, so a bug a user sees
   becomes a repro without them describing it. How to read one: `docs/debugging.md`.

The fuzzer is held for the Stage (`LATER.md`, "Reliability") and runs in runs of 5 minutes or less.

## Why pixel invariants

`checkInvariants` (`src/kwin.js`) checks KWin's *relative* tile geometry (fractions) and tile
membership. A 1 px hole between windows and windows below their minimum size are in real
pixels: neither shows in fractions. The fuzzer checks what is on screen, read from KWin.

## The fuzzer (`tests/fuzz/fuzz.py`, `tests/fuzz/run.py`)

Python, inside `tools/testkwin.sh` (two virtual 1280x720 outputs, focus follows mouse, the plugins
loaded). One run is one seed: actions drawn from the seed's RNG for a time budget, every argument
recorded in `trace.json` (window captions and coordinates, never indexes). A run stops at the
first step whose invariants fail. `make fuzz` runs seeds in parallel (`FUZZ_JOBS`, default 6) for
`FUZZ_MINUTES` (default 5), each in its own test KWin.

**Actions** (weighted):

| action | how | weight |
|---|---|---|
| open a window | `testclient.py`, kind drawn from: plain; `--fixed --size WxH`; `--min WxH` (some large, to stress fit); `--dialog`; `--map-delay`; `--retitle`. At most 8 open | high |
| close a window | `closeWindow()` | medium |
| kill a client | `kill -9` (a window that vanishes without a close) | low |
| a kwin-i3 action | `invokeShortcut`: a name in `tests/keys.json`, Workspace and Move to Workspace 1-4 (the latter's id ends in "(symbol)"), and a quarter of the time an unbound one (sticky, back-and-forth, next/prev, the output moves, no-back-and-forth); never a Selftest action. Fullscreen is KWin's own Window Fullscreen | high |
| focus by pointer | `inject.py abs` to the centre of a random window | medium |
| resize by drag | the shared edge of two adjacent tiled windows, by a random amount, drawn only when a tiled window shows | low |
| move by drag | Meta+drag a tiled window onto another: the helper's tiling drag | low |
| a window resizing itself | a tiled test client asks for another size | low |
| monitor unplug / replug | `kscreen-doctor output.Virtual-1.disable/enable` | rare |
| the effect unloaded / loaded | `org.kde.kwin.Effects` `unloadEffect`/`loadEffect kwini3hold` | rare |
| a desktop added, removed or moved | `workspace.createDesktop` / `removeDesktop` / `moveDesktop` at a random index | rare |

Real key presses are covered by `51-input.sh`; the fuzzer uses `invokeShortcut` for speed and
determinism. Pointer actions and drags are real input, through libei. After a failed inject every
modifier and button is released, so nothing stays held for the next action.

**The probe is Dump State**: one in-process snapshot with window ids (its `JSON` line), so a stale
`TREE` line mid-unplug or a retitled caption can't mislead it.

**Settling.** After each action (350 ms first after a pointer action, since focus follows the
mouse after 150 ms): kwin-i3's log quiet for 250 ms, the probe's own `kjs:` lines aside, then two
dumps 100 ms apart that agree. A run that hasn't settled in 10 s is a *harness* result, reported
apart from invariant failures; so is an inject failure.

**Invariants** after each step. A "tiled" window is one the tree names without `~`; fullscreen
windows are left out of I3 and I4 for their output.

- **I1 log clean**: no INVARIANT, ERROR or WARN line; KWin still running.
- **I2 inside**: every tiled window shown lies inside its output.
- **I3 no overlap**: tiled windows shown on one output overlap by zero pixels.
- **I4 no hole**: on an output whose shown workspace has tiled windows, their areas sum to the
  output's area (with I2 and I3, an exact cover). A tiled window sits inside its tile's padding
  (the 1 px frame), so each frame is grown back by its tile's padding first: a right frame then
  covers its tile, and a frame 1 px short still leaves a hole. Summing the tiles instead would
  miss that, since KWin keeps tiles gapless.
- **I5 minimum size**: every tiled window's client size is at least its minimum.
- **I6 none lost**: every open normal window is in exactly one workspace's tree (tiled or `~`
  floating), and its KWin desktop is that workspace's. Ignored, minimized and multi-desktop
  windows are skipped. It covers the tree matching the screen too, so there is no I7.
- **I8 focus visible**: the active window, if any, is on a desktop its output shows and not
  minimized.
- **I9 floating reachable**: a floating window overlaps some output by at least 50x50 px.
- **I10 frame is its tile**: a tiled window's frame is the rect kwin-i3 asks for in its tile
  (`want` in the dump, `windowRect`, just inside the padding), to within 1 px. This is the one that
  catches minimum sizes: KWin enforces a window's own minimum, so the window spills past its tile
  where I5 never fires.
- **I11 frame drawn**: a screenshot of each output (`tools/shot.py`) has each tiled window's frame
  in its focus class at the middle of each side of its tile's padding: the focused colour, or the
  split indicator on the right and bottom, for the active window; the unfocused colour for the
  rest. Skipped: points under a floating window or a dialog (a sticky one too, whose desktop list
  is empty), within 64 px of a floating window (its outline and shadow), reaching across from the
  other output, and the whole check while the resize mode is on (its badge on the focused window).
  A capture that fails is taken again 0.6 s on: the settle is the dumps', and the screen can lag
  them (the hold's old picture, a desktop's slide).

**A campaign and shrinking are separate.** `make fuzz` only runs seeds. A failure's *signature*
is its invariant and message with numbers and window names taken out. One whose signature is in
`tests/fuzz/known.txt` (the open bugs; a line goes when its bug is fixed, so the fuzzer proves the
fix) is counted and left alone. The first seed of a new signature is replayed twice (0 of 2 is
`flaky`, kept: a timing bug is still a bug) and recorded; later seeds with it are counted.
Results: `tests/fuzz/out/REPORT.md`, one section per signature, and `tests/fuzz/out/<seed>/`
(`trace.json`, `result.json`, the log, the last dump), with one console line per seed as it ends.
If the first 8 seeds to end all fail with one signature, the campaign stops: that is the setup (a
stale invariant, a broken build), not a bug. Shrinking inside the campaign would hold a job slot
for many minutes, most of it on bugs already known.

**Shrinking**, `make fuzz-shrink` (`FUZZ_SEEDS=214,215` for particular seeds, known or not): the
trace cut at the failing step, then delta debugging over the action list, a fresh test KWin per
replay, 3 at a time, at most 150 replays or 20 minutes, keeping the shortest list that fails with
the same signature. Only real reductions are tried: a candidate that drops nothing isn't
replayed. The result is replayed 3 times for a rate. An action whose window doesn't exist in a
shorter trace does nothing.

**`--skip I8,...`** (`FUZZ_SKIP`) keeps a run going past a known bug: a known signature still ends
its seed at that step, so later steps of that seed go unfuzzed without it.

**Validated** (watched red): with `snap()` disabled (the 1 px hole) the fuzzer reports I4 in 6
minutes on 2 jobs; with `fitMinimums` disabled (minimum sizes), I10.

## The capture key (`tools/capture`)

The design, for its reasons; what a capture holds and how to read one: `docs/debugging.md`.

- **kwin-i3 keeps a ring of its last 2000 log lines in memory**, always: `log()` pushes to the
  ring before the `DEBUG_LOG` check, and the `TREE` strings are built either way.
- **The "Dump State" action** (no key of its own) sends over D-Bus to `net.local.kwini3.dump`, a
  name apart from the test log sink so the two never mix: a BEGIN line, the ring, every
  workspace's tree with focus and shares, every window's facts, the outputs and which workspace
  each shows, then END. If nothing owns the name the call fails quietly, as `log()` does.
- **`tools/capture`**, bound to a key through a `.desktop` launcher (README, Install step 6): makes
  `~/.local/state/kwin-i3/captures/<time>/`, starts a sink on `net.local.kwini3.dump`, invokes
  Dump State, waits for END, and adds the rest of the flight recorder (`docs/debugging.md`).
  Silent: no notification.
- A capture becomes a diagnosis and, where one can show the bug, a live test (`AGENTS.md`,
  "Finding bugs").
