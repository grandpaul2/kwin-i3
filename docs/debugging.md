# Debugging kwin-i3: the flight recorder

Every bug report comes after the fact: the user sees something, then presses the capture key
(README, Install step 4). So what matters is the recent past, kept cheaply all the time and saved only on the
press: a ring in memory, in kwin-i3 and in kwini3hold, stamped to the millisecond. Nothing is
written to disk or sent over D-Bus until the press.

## Reading a capture: `tools/capture-read DIR [SECONDS]`

One timeline, the SECONDS before the press (default 60; 0 for everything held): kwin-i3's lines
(`i3`), kwini3hold's (`hold`, with its frame count `fN`) and the pointer's (`ptr`) merged by time, the gap to the line
before, and the press with the user's note last. Start every diagnosis here. The bug is in the lines
before the press, often several seconds before it.

What a layout change looks like (test KWin, a close of b beside a, 2026-10-25):

```
21:40:34.482    +0.045 i3   ACTION Close
21:40:34.483    +0.000 i3   CLOSE b kept a
21:40:34.483    +0.000 i3   TILE a -> 1,1 1278x718           kwin-i3 asks
21:40:34.483    +0.000 hold f24 close b: kept 20 ms for a neighbour
21:40:34.483    +0.000 hold f24 snapshot a at 1,1 638x718
21:40:34.483    +0.000 hold f24 open (1 closing waited)
21:40:34.486    +0.002 i3   GEOM a 1,1 638x718 -> 1,1 1278x718   KWin did it
21:40:34.487    +0.001 hold f25 release after 4.0 ms, 2 held
```

A release that says `TIMED OUT waiting for ...` names the windows that never got their size.

## The records

| record | what it holds | where it goes |
|---|---|---|
| **kwin-i3's log** (`src/log.js`, `log()`) | the last 2000 lines, `HH:MM:SS.mmm`: actions, trees, adds, closes, activations (who made them), `TILE` (a window put into a tile, with the tile's rect at that moment: when the tile was just split that is KWin's even split, before kwin-i3 sets i3's shares, so the `GEOM` lines after it are what landed), `GEOM` (every geometry change KWin reported, not each step of a drag), `SHOWN` (a desktop switch, by kwin-i3 or outside it), settings | Dump State's `== log` section |
| **kwini3hold's events** (`plugin/hold.cpp`, `note()`) | the last 500: holds opened and released (how long, how many, a timeout and what it waited for), closes kept or dropped, snapshots, new windows hidden and shown; each with the frame count | D-Bus `Events` on `/kwini3hold` |
| **The pointer's events** (`plugin/pointerprobe.cpp`, `note()`) | the last 1000: each press and release as it enters KWin's filter chain (position, KWin's hover, the toplevel found afresh, the pointer focus, a decoration under it), `FrameFocus`'s decision on it, and each **crossing**: where the window KWin gives the pointer, or what a left press would do there, changes. A press with no `FrameFocus` line after it was taken by a KWin filter between the two (`docs/pointer.md`) | D-Bus `Events` on `/kwini3helper/pointer` |
| **Dump State** (shortcut "kwin-i3 Dump State", `dump()` in `src/kwin.js`) | outputs, every workspace's tree, every window's geometry and flags, a JSON snapshot (tests/fuzz read it), then the log | `net.local.kwini3.dump`, which only `tools/capture` listens on |
| **`debugLog=true`** | each log line sent over D-Bus as it happens | the test KWin's `$KI3_LOG` (`tools/testkwin.sh` runs `tools/logsink.py`; stamped `HH:MM:SS `, which tests match as `^.{9}`). **On a desktop nothing listens**, so it does nothing there |
| **KWin's journal** (`journalctl --user _COMM=kwin_wayland`) | KWin's own lines: script errors (`main.js`), QML warnings, the plugins' `kwini3*` messages. Never kwin-i3's log (KWin drops a script's `print()` here) | read it directly; captures don't copy it |
| **fuzz traces** (`tests/fuzz/out*/<seed>/`, gitignored) | `trace.json`, `ki3.log`, the last probe, the failed invariant (`docs/fuzz-design.md`) | `make fuzz` |

## A capture (Meta+Shift+B, `tools/capture`)

`~/.local/state/kwin-i3/captures/<date>_<HHMMSS.mmm>/` (the name is the press), mode 700 (captions
can be private): `state.txt` (Dump State), `hold.txt` (when kwini3hold is loaded), `pointer.txt` (when kwini3helper is), `screen.png`
(both monitors, a second or so after the press), `note.txt` (what the user typed in the box that
opens after the save; kwin-i3 floats it by its title, "kwin-i3 capture note"), `errors.txt` (only
when kwin-i3 didn't answer). A capture is deleted at the end of the session that handled it, or
kept with the `OPEN.md` item that names it.

## What none of these show

- **What got drawn between two frames.** The log says what was asked and reported, and when; a
  flash shows on screen only. Next step if a timeline can't settle one: a replay buffer of the last
  ~10 s of the screen saved on the same press (`gpu-screen-recorder`'s replay mode, untested here;
  its own proposal), or a reproduction in the test KWin read with `tools/shot.py`.
- **What is at a point now**: not a record but a question, `tools/pointer-map` (`docs/pointer.md`).
- **KWin's reasons**: why it activated or moved a window. Read KWin's source for the installed
  version (AGENTS.md, "Finding bugs"), or trace it from a helper probe in a worktree.

## Changing what is recorded

A `log()` or `note()` is one push into an array, so log decisions and KWin's answers, not loops
or per-frame work. A temporary trace line goes in a worktree, never in `src/` on main (`make test`
and `make fuzz` build `src/` as it stands). The sizes: `LOG_KEEP` in `src/log.js`,
`s_eventsKeep` in `plugin/hold.cpp` and `plugin/pointerprobe.cpp`. The pointer's crossings are
the one per-event cost: each motion runs `findToplevel` again (KWin runs it once already) and
`FrameFocus::decide`, two walks of the stacking order; a line only at a crossing. Tests: `70-capture` (the dump and the log), `80-capture-hold`
(kwini3hold's events and the merged timeline).
