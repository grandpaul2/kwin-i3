# The fuzzer and the capture key: design and as built

**Now (2026-10-30):** both built 2026-10-22. The fuzzer is held for the Stage (Paul, 2026-10-26;
`LATER.md` item 36) and runs in runs of 5 minutes or less; Paul lifted the hold for one session on
2026-10-30, which brought it up to date: I11 (the frame's pixels), the effect and desktop actions,
the unbound keys, and Meta+Shift+N's action id (its moves to a workspace had invoked nothing since
2026-10-24). I4 already allowed for the frame (its padding, below). The capture key is how Paul reports bugs: `docs/debugging.md`. The design
below is kept for its reasons; "As built" at the end is what the code does where they differ.

Paul has been finding bugs one at a time in daily use. Two tools to find them faster:

1. **`make fuzz`**: random action sequences in the headless test KWin, with pixel-level invariants
   checked after every step; a failing sequence is replayed and shrunk to a short repro.
2. **Meta+Shift+B** on the live desktop: writes kwin-i3's state to a file, so a bug Paul sees
   becomes a repro later without him describing it.

## Why the existing invariants are not enough

`checkInvariants` (src/kwin.js) checks KWin's *relative* tile geometry (fractions) and tile
membership. The last two bugs Paul found were in real pixels: a 1 px hole between windows
(ae6867f) and windows below their minimum size (c0d6183, 58be5d9). Neither shows up in fractions.
The fuzzer checks what is on screen, read from KWin: each window's `frameGeometry`.

## 1. The fuzzer (`tests/fuzz/fuzz.py`)

Python, run inside `tools/testkwin.sh` (two virtual 1280x720 outputs, Paul's focus settings).
One run = one seed = up to N steps (default 120). `make fuzz` runs seeds in parallel
(`FUZZ_JOBS`, default 6) for `FUZZ_MINUTES` (default 5), each seed in its own test KWin.

**Actions** (weighted, chosen from the seed's RNG; every argument recorded in the trace):

| action | how | weight |
|---|---|---|
| open a window | `testclient.py`, kind drawn from: plain; `--fixed --size WxH`; `--min WxH` (some large, e.g. 900x500, to stress fit); `--dialog`; `--map-delay`; `--retitle`. At most 8 open | high |
| close a window | `closeWindow()` | medium |
| kill a client | `kill -9` (a window that vanishes without a close) | low |
| a kwin-i3 action | `invokeShortcut`, any name in `tests/keys.json`, plus Workspace / Move to Workspace 1–4 | high |
| focus by pointer | `inject.py abs` to the centre of a random window (focus follows mouse) | medium |
| resize by drag | drag the shared edge of two adjacent tiled windows by a random amount (as 51-input.sh does) | low |
| move by drag | Meta+drag a tiled window onto another (with the helper loaded, as in the fuzzer's KWins, that is the tiling drag) | low |
| a window resizing itself | a tiled test client asks for another size (`docs/records/spec-self-resize.md`) | low |
| monitor unplug / replug | `kscreen-doctor output.Virtual-1.disable/enable` (as 40-monitors.sh) | rare |
| the effect unloaded / loaded | `org.kde.kwin.Effects` `unloadEffect`/`loadEffect kwini3hold` (as 53-hold.sh); only with the plugins | rare |
| a desktop added, removed or moved | `workspace.createDesktop` / `removeDesktop` / `moveDesktop` at a random index (as 65, 66) | rare |

Real key presses are covered by 51-input.sh; the fuzzer uses `invokeShortcut` for speed and
determinism. Pointer and drags must be real input (there is no other way).

**Settling.** After each action: wait until kwin-i3's log has been quiet for 200 ms *and* two
geometry probes 100 ms apart agree (5 s cap; not settling is itself a failure, "never settles").

**Invariants** after each step, from one probe script (every window: caption, frameGeometry,
clientGeometry, minSize, output, desktops, minimized, fullScreen, transient, active) plus the
latest `TREE` line of each workspace:

- **I1 log clean**: no INVARIANT / ERROR / WARN line; KWin still running.
- **I2 inside**: every tiled window shown lies inside its output.
- **I3 no overlap**: tiled windows shown on one output overlap by zero pixels.
- **I4 no hole**: on an output whose shown workspace has tiled windows, their areas sum to the
  output's area (with I2 and I3, an exact cover). Since the window modes (2026-10-24) a tiled
  window sits inside its tile's padding (the 1 px frame), so each frame is grown back by its
  tile's padding (tile minus `want`) first: a right frame then covers its tile, and a frame 1 px
  short still leaves a hole (summing the tiles instead missed that: KWin keeps tiles gapless).
- **I5 minimum size**: every tiled window's client size is at least its `minSize`.
- **I6 none lost**: every open normal window is named in exactly one workspace's TREE (tiled or
  `~` floating), and its KWin desktop is that workspace's desktop.
- **I7 tree matches screen**: the number of tiled leaves in a shown workspace's TREE equals the
  number of tiled windows on that output.
- **I8 focus visible**: the active window, if any, is on a desktop its output is showing and not
  minimized.
- **I9 floating reachable**: a floating window overlaps some output by at least 50x50 px.
- **I11 frame drawn** (2026-10-30): with the effect loaded, a screenshot of each output (`tools/shot.py`)
  has each tiled window's frame in its focus class at the middle of each side of its tile's padding:
  the focused colour, or the split indicator on the right and bottom, for the active window; the
  unfocused colour for the rest. Points under a floating window or a dialog (a sticky one too,
  whose desktop list is empty) are skipped. A capture that fails is taken again 0.6 s on: the
  settle is the dumps', and the screen can lag them (the hold's old picture, a desktop's slide;
  the first campaign's seeds 3 and 8, green on the second look). Also skipped: points within 64 px
  of a floating window (its outline and shadow), one reaching across from the other output, and
  the whole check while the resize mode is on (its badge on the focused window). Campaign 2.

Fullscreen windows are excluded from I3/I4 for their output; a "tiled" window is one TREE names
without `~`.

**On a failure:** save `trace.json` (seed and every action with its arguments), `ki3.log`, the
last probe, and which invariant failed, under `tests/fuzz/out/<seed>/`. Then:

1. **Replay** the trace in a fresh test KWin. If it doesn't fail again, mark it `flaky` (kept:
   a timing bug is still a bug) and stop.
2. **Shrink** (delta debugging over the action list, a fresh KWin per try, at most 40 tries):
   keep the shortest trace that fails *the same invariant*. Window names stay as recorded; an
   action whose window no longer exists in the shorter trace is skipped.
3. (Designed, not built: a `repro.sh` scenario written from the shrunk trace.)

Failures are grouped by invariant + first log line so 20 seeds hitting one bug are one report.

**How we know it works** (AGENTS.md: trusted once a fault turns it red): the fuzzer must find the
historical bugs it was built for. Run it against `ae6867f^` (the 1 px hole) and `c0d6183^`
(minimum sizes) in a worktree; both must fail on I4 / I5 within the default budget. Plus
`make mutate` style faults for I3 (overlap), I6 (lose a window), I8 (focus to a hidden desktop).
(As built, only I4 and I10 were validated this way: "Validated", at the end.)

## 2. The capture key (Meta+Shift+B)

What a capture holds now, and how to read one: `docs/debugging.md` (the flight recorder, since
2026-10-25). The design, for its reasons:

- **kwin-i3 keeps a ring of its last log lines in memory** (2000 now), always: `log()` pushes to the
  ring before the `DEBUG_LOG` check. The TREE strings are already built either way.
- **A new action, "Dump State"** (no key of its own), sends over D-Bus to
  `net.local.kwini3.dump` (a different name from the test log sink, so the two never mix): a
  BEGIN line, the ring, every workspace's tree with focus and shares, every window's facts (the
  same fields as the fuzzer's probe), outputs and which workspace each shows, then END. If nothing
  owns the name the call fails quietly, as `log()` does.
- **`tools/capture`**, bound to Meta+Shift+B through a `.desktop` launcher like `screenshot`: makes
  `~/.local/state/kwin-i3/captures/<timestamp>/`, starts a sink on `net.local.kwini3.dump` writing
  `state.txt` there, invokes "kwin-i3 Dump State", waits for END (2 s cap), stops the sink, adds
  `journalctl --user` lines from kwin_wayland for the last 10 minutes and a full-screen Spectacle
  shot (`spectacle -b -n -f -o`). Silent: no notification (dotfiles rule).
- Captures are read later by an agent and turned into live tests.

Making it live means rebuilding, reloading kwin-i3 in Paul's session (it re-tiles his windows
once), and registering the launcher shortcut through kglobalaccel (dotfiles CLAUDE.md table, the
App-launch row). That step is done with Paul's OK.

## As built (after the design review, 2026-10-22)

The review (24 findings) changed these; the code is `tests/fuzz/fuzz.py` and `tests/fuzz/run.py`.

- **The probe is Dump State**, not kjs plus the latest TREE line: one in-process snapshot with
  window ids, so a stale TREE (mid-unplug) or a retitled caption can't mislead it. Dump State has a
  `JSON` line for this.
- **Settling** ignores the probe's own `kjs:` lines, waits 350 ms after pointer actions (focus
  follows the mouse after 150 ms), caps at 10 s, and a run that never settles is a *harness*
  result, reported apart from invariant failures. So is an inject failure, after which every
  modifier and button is released.
- **Keys** come from `tests/keys.json` plus Workspace / Move to Workspace 1–4 (the latter's id ends
  in "(symbol)"), and a quarter of the time from the unbound ones (sticky, back-and-forth, next/prev,
  the output moves, no-back-and-forth), never from the
  registered list (Selftest Throw, Selftest Break Reconcile and Release are excluded). Fullscreen is
  KWin's own "Window Fullscreen", so the fullscreen exclusion is exercised. A Meta+left drag was a
  move-drag that floated the window; with the helper loaded it is now the tiling drag. A resize drag is only drawn when a tiled
  window is visible.
- **Invariants as built:** I1–I6, I8 and I9 as above, with I6 counting floating windows (`~`) and
  skipping ignored, minimized and multi-desktop windows; I7 was dropped (I6 covers it);
  **I10 added**: a tiled window's frame is its tile, to within 1 px; since the window modes, the
  rect kwin-i3 asks for in that tile (`want` in the state dump: `windowRect`, inside the padding).
  Left at the tile, every seed failed at its first window for two days unnoticed (2026-10-25). I10 is the one that caught the
  minimum-size bug: KWin enforces the window's own minimum, so the window spills past its tile and
  I5 never fires.
- **Shrinking** cuts the trace at the failing step, replays twice first (0 of 2 is `flaky`, kept,
  not shrunk), then ddmin with at most 40 replays or 10 minutes, matching the same signature (the
  invariant and its message with numbers and window names taken out). The result is replayed 3 times
  for a rate. Actions refer to windows by caption; one whose window is gone does nothing.
- **`--skip I8,...`** keeps a run going past a known bug that would otherwise end most seeds early.
- **The campaign and shrinking are separate (2026-10-23, after an efficiency review).** A
  failing seed used to shrink inside the campaign, holding one of its 4 job slots for up to 20
  minutes; 70-90 % of that re-shrank bugs already in OPEN.md, a "20-minute" run took 29, and 22
  seeds ran where ~50 fit. Now `make fuzz` only runs seeds: a failure whose signature is in
  `tests/fuzz/known.txt` (the open bugs; remove a line when its bug is fixed) is counted and left
  alone; a new one is replayed twice and recorded. `make fuzz-shrink` shrinks the new ones
  afterwards (`FUZZ_SEEDS=214,215` for particular seeds, known or not). The shrinker also used to
  loop on no-op candidates ("drop every pointer action" of a trace with none still "failed"), to
  the try limit: seed 14 spent 13 of its 17 minutes there. Only real reductions are tried now.
  A known signature still ends its seed at that step, so later steps of that seed go unfuzzed;
  `--skip` on its invariant is the way past that.
- **Validated** (watched red): with `snap()` disabled (the 1 px hole) the fuzzer reports I4 in 6
  minutes on 2 jobs; with `fitMinimums` disabled (minimum sizes), I10.
