# Spec: a different frame colour for floating windows

Asked by Paul, 2026-10-24: "make the outline highlight of floating windows a different colour,
like green instead of blue, so they were easy to tell apart". Status: **draft; decisions 1-3
below are Paul's. Not built, not reviewed, not live.** An addition to `docs/spec-decoration.md`
(kwini3frame); i3 itself has no floating colour (its `client.*` classes are focused, unfocused,
focused-inactive, urgent, placeholder), so this is a deliberate addition, not a port.

Sources: `plugin/frame.cpp` (53 lines), `plugin/hold.cpp` (the config pattern), KDecoration3
`decoratedwindow.h` (installed headers), `tests/live/54-frame.sh`, `tools/plugin-install.sh`.

## Today

The frame paints one of two constants (`frame.cpp:19-20, 51`): `#4c7899` when the window is
active, `#333333` when not, and repaints on `activeChanged`. It knows nothing about floating.

kwin-i3 marks every floating window with KWin's keep-above flag and nothing else gets it from
kwin-i3 (`kwin.js` `setFloatingLook`: set when a window floats, cleared when it tiles again, only
on flags kwin-i3 set itself). KDecoration3 hands a decoration that flag:
`DecoratedWindow::isKeepAbove()` with the `keepAboveChanged(bool)` signal
(`decoratedwindow.h:86, 206, 297`). So "floating" is readable from inside the frame with no new
channel between the script and the plugin.

## The rule

A window whose keep-above flag is set paints in the floating colours; otherwise in today's
colours. Four colours, active and inactive for each:

| state | default | today |
|---|---|---|
| tiled, active | `#4c7899` (unchanged) | `#4c7899` |
| tiled, inactive | `#333333` (unchanged) | `#333333` |
| floating, active | `#4c995a` (a green of the same weight as the blue) | `#4c7899` |
| floating, inactive | `#2f4f38` (a dim green: a floating window is told apart unfocused too) | `#333333` |

## Decisions

1. **The two greens.** The defaults above are a proposal; any `#rrggbb` works. Should the
   inactive floating frame be green at all, or stay i3's grey (then only the focused floating
   window is told apart)? Proposed: dim green, as in the table.
2. **Config keys, or constants?** Proposed: keys, in a new kwinrc group `[kwin-i3-frame]`:
   `Active`, `Inactive`, `FloatingActive`, `FloatingInactive`, each `#rrggbb`, defaults as the
   table, watched with `KConfigWatcher` as `hold.cpp:23-29, 68-76` does, so `kwriteconfig6
   --notify` changes them live (README, Configuration: the `--notify` rule applies). Constants
   would be a 10-line change but a rebuild per colour.
3. **The keep-above trap, accepted?** A window Paul sets keep-above himself (Alt+F3 menu, or a
   KWin rule) also paints green, since the frame can't tell his flag from kwin-i3's. The clean
   alternative, a property kwin-i3 sets and the frame reads, has no channel: KDecoration3 exposes
   no custom window properties, so it would go through kwini3mouse and D-Bus. Proposed: accept
   the trap and write it in the README row.

## The change

- `plugin/frame.cpp`: four `QColor` members read from config (`loadConfig()`, `KConfigWatcher`
  on kwinrc, group `kwin-i3-frame`, `readEntry` with the defaults; an unparsable value falls
  back to the default). `paint` picks by `isActive()` and `isKeepAbove()`. `init` connects
  `keepAboveChanged` to `update()` beside `activeChanged`. `plugin/CMakeLists.txt`: link
  `KF6::ConfigCore` for the decoration as the other two plugins do (`:26, :32`).
- `README.md`, Configuration: four rows for the keys, with the trap in the meaning column.
- `~/.dotfiles/setup.sh`: `kset kwinrc kwin-i3-frame ...` lines only if Paul picks non-default
  colours (the defaults need no entry).
- `CHANGELOG.md`, Unreleased.

## What stays

The frame's input behaviour (no cursor, no drag, no menu), its 1 px at any scale, focus on the
frame through kwini3mouse, Breeze as the fallback, `tools/frame-guard.sh`.

## Risks

- A repaint per keep-above change: as cheap as the active repaint; keep-above changes only when a
  window floats or tiles.
- The fallback decoration (Breeze) shows no floating colour; nothing to do.
- `make plugin-install` re-decorates every window in the running KWin (spec-decoration, check 7:
  a refit may follow since the minimum size can differ for a moment). Same as every frame
  install so far.

## Tests

`tests/live/54-frame.sh`, after the existing colour checks:
- `Floating Toggle` on `b`: its corner pixel turns floating-active green (`76,153,90`); `a`
  stays inactive grey. Focus `a`: `b`'s corner turns floating-inactive (`47,79,56`), `a`'s
  active blue. Toggle `b` back: active blue again.
- Config: `kwriteconfig6 --notify --file kwinrc --group kwin-i3-frame --key FloatingActive
  '#ff0000'`, then a floating window's corner is `255,0,0`; reset the key.
- Watched red before it counts: (A) `paint` ignoring `isKeepAbove()` (today's code): the first
  green check. (B) `keepAboveChanged` not connected: the toggle check, since the frame would
  repaint only on the next focus change. (C) the watcher not connected: the config check.

## Order

Decide (1-3) → second agent reviews this spec (short) → change → `make test` (54-frame among
them) → review of the change → Paul says go → `make plugin-install`.
