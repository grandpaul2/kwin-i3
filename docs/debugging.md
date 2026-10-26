# Debugging kwin-i3: where each record lives

Written 2026-10-25, after a capture's own log was overlooked: its `journal.txt` was empty and was
read as "nothing recorded", while `state.txt` held the action that preceded the bug. Start here
before reading any of these.

## The records

| record | what it holds | on the live desktop | in the test KWin |
|---|---|---|---|
| **in-memory log** (`src/log.js`) | the last 300 `log()` lines: actions, trees, adds, closes, focus, settings, stamped `HH:MM:SS.mmm` | always on | always on |
| **Dump State** (shortcut "kwin-i3 Dump State", `src/kwin.js` `dump()`) | outputs, every workspace's tree, every window's geometry and flags, a JSON snapshot, then the in-memory log (`== log`) | sent to `net.local.kwini3.dump`, which only `tools/capture` listens on | the same |
| **`debugLog=true`** | the same `log()` lines, each sent over D-Bus as it happens to `net.local.kwini3.log` | **does nothing**: nothing owns that name, so the lines are dropped | set by `tools/testkwin.sh`; `tools/logsink.py` writes them to `$KI3_LOG`, stamped `HH:MM:SS ` (tests match `^.{9}`) |
| **KWin's journal** (`journalctl --user _COMM=kwin_wayland`) | KWin's own lines: script errors (`main.js`), QML warnings, the plugins' `kwini3*` lines | yes | the test KWin's lines carry `/tmp/kwin-i3-test.*` |
| **fuzz traces** (`tests/fuzz/out*/<seed>/`, gitignored) | `trace.json` (seed, every action), `ki3.log`, the last probe, the failed invariant (`docs/fuzz-design.md`) | — | `make fuzz` |

kwin-i3's own lines **never reach the journal**: KWin drops a script's `print()` on this machine
(the `kwin_scripting` category is off, and turning it on needs a KWin restart). So the journal
is only worth reading for errors and the plugins.

## A capture (Meta+Shift+B, `tools/capture`)

`~/.local/state/kwin-i3/captures/<time>/`, mode 700 (captions can be private):

1. **`state.txt`, the `== log` section first**: what Paul did in the minutes before he pressed
   the key (each line has two stamps: when the dump was written, then when the line was logged).
   Then `== tree` and `== windows` for the state at the press.
2. `screen.png`: both monitors, a second or so after the press.
3. `kwin-journal.txt`: only there when KWin logged something in the last 10 minutes.
4. `errors.txt`: only there when kwin-i3 didn't answer (not loaded).

The press comes after the thing Paul saw, often by several seconds, so the bug is in the log's last
lines before the press, not in the state at it. A capture is deleted at the end of the session
that handled it (`/sessionend`), or kept with an `OPEN.md` item that names it.

## What none of these show

- **Anything between two frames.** A flash, a frame drawn late, a window shown before its resize:
  the log says what kwin-i3 asked for and when, not what got drawn. Reproduce in the test KWin and
  read pixels (`tools/shot.py`), several times a second.
- **KWin's side of a call**: why KWin activated or moved a window. Read KWin's source for the
  installed version (CLAUDE.md, "Finding bugs"), or trace it from a helper probe in a worktree.

## Changing what is logged

A `log()` line is free when `debugLog` is off (one array push), so log decisions, not loops. A
temporary trace line goes in a worktree, never in `src/` on main (`make test` and `make fuzz`
build `src/` as it stands). The ring's size is `LOG_KEEP` in `src/log.js`; 2026-10-25's 18:51
capture held 26 minutes in about 120 lines, so 300 is most of an hour of ordinary use.
