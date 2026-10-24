# Review: spec-frame-colours.md and the change (commit 18bb638), 2026-10-24

Read against KConfig 6.31.0 (installed `kf6-kconfig-6.31.0`; `kconfigwatcher.cpp`, `kconfig.cpp` fetched
from invent.kde.org `v6.31.0`), KDecoration 6.7.5 and KWin 6.7.5 (`decoratedwindow.cpp`), plus the installed
headers. Nothing in the repo changed except this file; nothing built or loaded; the suite was not run
(results taken from the spec).

Verdict: **correct, small, and sound.** The config path, the signal, the paint and the lifetime all hold.
No must-fix. One should-fix (an alpha value in a key breaks the opaque promise), and a handful of notes.

## Findings

1. **A key with an alpha channel (or `transparent`) paints translucent pixels in a decoration declared
   opaque. Severity: should fix.**
   Claim: `colourOf` accepts anything `QColor(QString)` parses and checks only `isValid()`
   (`frame.cpp:29-33`). `QColor(QString)` accepts `#RGB`, `#RRGGBB`, `#AARRGGBB`, `#RRRGGGBBB`, SVG colour
   names and `transparent`. `#80ff0000` or `transparent` is valid, `fillRect` composes it over nothing,
   and `setOpaque(true)` (`frame.cpp:46`) tells KWin the decoration needs no blending under it.
   Why it matters: spec-decoration's "opaque, 1 px, no stray translucent pixel" rule (review 2 of
   2026-10-23) is a stated invariant, and this is the one way a config key can break it. Fix: in
   `colourOf`, `c.setAlpha(255)` before returning (one line), or treat alpha != 255 as invalid and use the
   default. README says `#rrggbb` already, so rejecting is consistent.

2. **`KConfigWatcher::create` returns one shared watcher per `KSharedConfig`, so the N decorations share a
   single D-Bus subscription; the per-decoration `reparseConfiguration` is redundant but cheap.
   Severity: note.**
   Evidence: `kconfigwatcher.cpp:33-51` keeps a per-thread `QHash<KSharedConfig*, QWeakPointer>` and hands
   back the existing watcher while one is alive. `openConfig("kwinrc")` returns the same `KSharedConfig`
   each call, so the frame, `kwini3hold` and `kwini3mouse` all share one watcher (and one config object).
   `onConfigChangeNotification` already calls `reparseConfiguration()` before emitting `configChanged`
   (`:110`), once per group in the notification; the header says the same ("the config will be reloaded
   before this signal is emitted").
   Consequence: one `--notify` on `kwin-i3-frame` makes each of N decorations run `loadConfig`, i.e. N
   re-reads of a few-KB `kwinrc` plus N `update()` calls; and `init()` re-reads once per new window. With
   dozens of windows that is milliseconds, on a rare event. Not a problem. If it is ever tidied: drop the
   `reparse` from `loadConfig` (the watcher has done it) and keep it only if init must see a plain write
   (see 7). `hold.cpp:70-71` and `mousechords.cpp:131-132` do the same, so this is consistent, and the
   reparse also discards unsaved in-memory changes on KWin's shared `kwinrc` object, a risk the other two
   plugins already carry.

3. **`kwriteconfig6 --notify --delete` does produce a `configChanged` for the group, which is why the
   "key deleted: default" check passes. Severity: note (answer to the question).**
   Evidence: `kwriteconfig6 --delete` calls `deleteEntry(key, Notify)`; the entry stays in the map as
   dirty with `bDeleted` and `bNotify` set. `KConfig::sync` collects every dirty entry with `bNotify` into
   `notifyGroupsLocal[group] << key` (`kconfig.cpp:465-471`) without testing `bDeleted`, then sends the D-Bus
   `ConfigChanged` with those names. The watcher reparses, finds the key gone, and `readEntry` returns the
   default. The frame ignores the `names` argument and reloads all four colours, so a delete and a change
   are handled identically. Deleting the last key also removes the group header from the file; the
   notification still names the group. Good.

4. **`QColor(QString)` is the right parse, and the fallback works as the spec says. Severity: note.**
   `readEntry(key, def.name())` selects the `QString` overload and returns the raw string; an unparsable
   string gives an invalid `QColor` and `colourOf` returns the per-key default (`frame.cpp:29-33`). Two
   things to know: it is per key (one bad key does not reset the others, good), and KConfig's own
   `QColor` entry form `76,120,153` is not accepted (it is not a `QColor(QString)` format), so it falls
   back silently. README says `#rrggbb`, which is enough. No test covers the fallback (see 8).

5. **Paint uses the state at paint time; `update()` on `keepAboveChanged` repaints all four parts.
   Severity: note (answer).**
   `isKeepAbove()` is a live delegate to `Window::keepAbove` (`decoratedwindow.cpp:141`), and the signal is a
   direct forward of `Window::keepAboveChanged` (`:63`), emitted after the flag is stored, so a paint after
   the signal sees the new value. `Decoration::update()` emits `damaged(rect().toAlignedRect())`
   (`decoration.cpp:648-656`): the whole decoration rect, so every border part the renderer builds is
   redrawn, the same as the existing `activeChanged` path. `paint` still fills `repaintArea`, not `rect()`
   (`frame.cpp:83-88`), so the review-2 constraint holds.
   Before `init`: `m_active` etc. are default `QColor` (invalid), and nothing paints before `init()`
   returns, and `loadConfig()` runs in `init` (`:56`) before the connections. A `fillRect` with an invalid
   colour would be undefined-ish (Qt draws black or nothing), so this is safe only through that ordering.
   Optional hardening: initialise the members from the `s_*` defaults in the header
   (`QColor m_active = s_active` is not possible there, but a constructor init list is). Not needed today.

6. **Lifetime is safe. Severity: note (answer).**
   `connect(m_watcher.get(), &KConfigWatcher::configChanged, this, [this](...){...})` is the form with a
   context object (`frame.cpp:49`), so Qt drops the connection when the `Frame` is destroyed; the shared
   watcher outliving it cannot call a dangling `this`. The two `window()` connections also use `this` as
   receiver. The lambda takes one argument of a two-argument signal, which Qt allows.

7. **The test is sound; some checks are thinner than their messages. Severity: note.**
   - Keep-above by hand: `src/kwin.js` has no `keepAboveChanged` handler. `keepAbove` appears only in
     `setFloatingLook` (`:592-595`, reads `!w.keepAbove` only when floating a window), `release` (`:917`) and
     the dump (`:985`). So kwin-i3 does not react, nothing moves, and the check really isolates the signal
     (this is why fault B was caught only here). `on b ...` runs with b active (after `Focus Right`), so
     the 1279,719 pixel is b's active corner: correct.
   - `corner_is`: `frameGeometry` x+w-1, y+h-1 is the frame's own outermost pixel (the 1 px frame lies
     inside `frameGeometry`; test 1 shows the client is inset by 1,1,2,2), so the pixel is the frame, not
     content. `geom` rounds with `Math.round`; a fractional floating geometry could land one pixel off,
     but the checks passed and a fractional position would show as a wrong colour, not a false pass.
   - "a, tiled and inactive: grey" at 0,0: after b floats, `a` is the only tiled window and still starts at
     0,0, so the pixel is a's frame. Correct.
   - The `--delete` leaves the test KWin's `kwinrc` without the group (the test KWin is created fresh by
     `tools/testkwin.sh`, line 85), so later sections are unaffected. If the run died between set and
     delete, the red key would persist only in the throwaway config.
   - Gaps (all small): only the floating corner is sampled, not a side or the opposite corner; only
     `FloatingInactive` is exercised through the config (`Active`, `Inactive`, `FloatingActive` rely on the
     same `colourOf` line, so one typo in a key name would go unseen); the invalid-value fallback and
     an alpha value (finding 1) are not tested. One extra line each, if wanted: set `FloatingActive` to
     `notacolour` and expect `76,153,90`.

8. **README row and CHANGELOG match the code; the trap is stated for one direction only. Severity: note.**
   The README row for `FloatingInactive` says a window you keep above yourself paints the same, which is
   true. The converse is also true and unstated: a floating window on which you clear keep-above (Alt+F3
   menu) paints as tiled until it tiles again (kwin-i3 only clears a flag it set, `kwin.js:593-594`).
   Also, because a user-set flag is never recorded in `keptAbove`, a window you keep above and then float and
   re-tile stays above and green when tiled. Both fall under decision 3 (accepted); a half sentence would
   cover them. The header sentence on `--notify` applies unchanged: the frame has no `Options::configChanged`
   fallback as `mousechords.cpp:114` does, so a plain write plus `reconfigure` leaves existing frames on the
   old colour, while a window opened afterwards re-reads at `init` and picks up the new one (an
   inconsistency, but harmless). The CHANGELOG entry is accurate.

9. **"What stays" holds. Severity: note.**
   `setTitleBar(QRectF())`, `setOpaque(true)`, no shadow, `updateBorders` and the hover/mouse handlers are
   untouched by the diff (`frame.cpp:44-46`; the hunks only add colour state). Input behaviour is unchanged.
   The one threat to opacity is finding 1.

10. **Install, naming, dotfiles. Severity: note.**
    - `make plugin-install` is enough: `plugin-install` depends on `plugin`, which rebuilds with the new
      `KF6::ConfigCore` link; `place` gives the `.so` a content hash name, so the changed frame is a new id,
      the old one is unlinked, and `frame-guard` data is unchanged (same KDecoration3 version). Expect the
      usual re-decorate of every window and the note in the spec's Risks. KF6 ConfigCore is already loaded
      in KWin, so no new runtime dependency.
    - Group `kwin-i3-frame` fits `kwin-i3-hold` and `kwin-i3-mouse`.
    - `~/.dotfiles/setup.sh` has no `kwin-i3-frame` line and needs none: `kset` is used there only for
      non-default values, and all four defaults live in `frame.cpp`. Confirmed (lines 139-188 hold the only
      kwinrc entries, none for the hold group either).
    - Spec nits: "Sources" still says `frame.cpp (53 lines)` (now 119); the status paragraph's bold markers
      are unbalanced (`**decided ... accepted). **Built ... Not live.**`), so the rendering bolds the wrong
      span; the `Order` section still lists the second-agent review as pending.

## Questions answered

| # | Answer |
|---|---|
| 1 | Shared watcher per `KSharedConfig` (finding 2); `--notify --delete` notifies (3); `QColor(QString)` right, falls back per key (4), alpha caveat (1) |
| 2 | Paint reads the live flag; `update()` damages the whole rect (5); invalid default colours never painted (5) |
| 3 | Context-object connect, no dangling `this` (6) |
| 4 | Checks match their messages; no `keepAboveChanged` handler in `kwin.js`; test `kwinrc` is throwaway; corner pixel is the frame (7) |
| 5 | README/CHANGELOG accurate, converse of the trap unstated (8); what stays holds (9) |
| 6 | Naming and setup.sh fine; `make plugin-install` is enough (10) |

Verdict: ready for Paul to decide about deployment; I would first take finding 1 (one line, `setAlpha(255)`), and the rest are optional.
