# Fuzzer and capture key — design (2026-10-22)

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
(`FUZZ_JOBS`, default 4) for `FUZZ_MINUTES` (default 20), each seed in its own test KWin.

**Actions** (weighted, chosen from the seed's RNG; every argument recorded in the trace):

| action | how | weight |
|---|---|---|
| open a window | `testclient.py`, kind drawn from: plain; `--fixed --size WxH`; `--min WxH` (some large, e.g. 900x500, to stress fit); `--dialog`; `--map-delay`; `--retitle`. At most 8 open | high |
| close a window | `closeWindow()` | medium |
| kill a client | `kill -9` (a window that vanishes without a close) | low |
| a kwin-i3 action | `invokeShortcut`, any name in `tests/keys.json`, plus Workspace / Move to Workspace 1–4 | high |
| focus by pointer | `inject.py abs` to the centre of a random window (focus follows mouse) | medium |
| resize by drag | drag the shared edge of two adjacent tiled windows by a random amount (as 51-input.sh does) | low |
| move by drag | Meta+drag a tiled window onto another | low |
| monitor unplug / replug | `kscreen-doctor output.Virtual-1.disable/enable` (as 40-monitors.sh) | rare |

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
  output's area (with I2 and I3, an exact cover).
- **I5 minimum size**: every tiled window's client size is at least its `minSize`.
- **I6 none lost**: every open normal window is named in exactly one workspace's TREE (tiled or
  `~` floating), and its KWin desktop is that workspace's desktop.
- **I7 tree matches screen**: the number of tiled leaves in a shown workspace's TREE equals the
  number of tiled windows on that output.
- **I8 focus visible**: the active window, if any, is on a desktop its output is showing and not
  minimized.
- **I9 floating reachable**: a floating window overlaps some output by at least 50x50 px.

Fullscreen windows are excluded from I3/I4 for their output; a "tiled" window is one TREE names
without `~`.

**On a failure:** save `trace.json` (seed and every action with its arguments), `ki3.log`, the
last probe, and which invariant failed, under `tests/fuzz/out/<seed>/`. Then:

1. **Replay** the trace in a fresh test KWin. If it doesn't fail again, mark it `flaky` (kept:
   a timing bug is still a bug) and stop.
2. **Shrink** (delta debugging over the action list, a fresh KWin per try, at most 40 tries):
   keep the shortest trace that fails *the same invariant*. Window names stay as recorded; an
   action whose window no longer exists in the shorter trace is skipped.
3. Write `repro.sh`, a `tests/live`-style scenario from the shrunk trace, ready to become a test.

Failures are grouped by invariant + first log line so 20 seeds hitting one bug are one report.

**How we know it works** (CLAUDE.md: trusted once a fault turns it red): the fuzzer must find the
historical bugs it was built for. Run it against `ae6867f^` (the 1 px hole) and `c0d6183^`
(minimum sizes) in a worktree; both must fail on I4 / I5 within the default budget. Plus
`make mutate` style faults for I3 (overlap), I6 (lose a window), I8 (focus to a hidden desktop).

## 2. The capture key (Meta+Shift+B)

On the live desktop `debugLog` is off, so nothing is logged anywhere today.

- **kwin-i3 keeps a ring of its last 300 log lines in memory**, always: `log()` pushes to the
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
