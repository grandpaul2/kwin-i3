# Review: the window-modes change, pieces (i)+(ii) (2026-10-24)

A second agent's code review of `git diff main...window-modes` (branch at 25b537f) against
`docs/spec-window-modes.md` and KWin 6.7.5's source. Read-only; nothing was run. No must-fix.
How each finding was handled is noted in brackets.

## Should-fix

1. **The Stats check can't tell the new effect from the old one**: the loaded kwini3hold already
   answers `supported`, so a script reloaded before `make plugin-install` turns the frame on with
   the old effect: borderless windows, no frame. [Fixed: requires `frameWidth` in the answer,
   which only the new build has. Live order: plugin-install, then the script.]
2. **A first "no effect" answer never gives borders back**: `setFrame` returns early when the
   answer equals the initial `false`, and windows adopted from KWin's tiles at a reload skip
   `adoptWindow`'s rule; tiled windows would stay borderless. [Fixed: the first answer, either
   way, sweeps every managed window: borders given back where no frame will be drawn.]
3. **The effect-gone path takes ~1.2 s, not one event**, and the same 1 s fallback would flip the
   frame off and on (a re-tile) if KWin were slow to answer `Stats`. [Fixed: off only after two
   unanswered asks in a row; on at once.]
4. **`later()` timers may be garbage-collected before they fire** (held only in a local).
   [Fixed: kept in a table until they fire.]
5. **A release swallowed by an earlier filter leaves `m_taken` stuck**, eating the next release
   of that button anywhere. [Fixed: a press clears its button's bit first.]
6. **The ring ignores opacity and minimize**: full strength while its window fades, a static box
   during a minimize. [Fixed: alpha follows `data.opacity()` with blending; no ring on a
   minimized window.]
7. **The spec claims a chain position (R1-16) the effect doesn't ask for.** It works because the
   ring reads the paint data after the rest of the chain has run. [Fixed: the spec says so, and
   a comment in `paintFrame`.]

## Notes

8. `edgesIntact` detects a lost hair with zero margin (`< 1e-6` against a 1e-6 hair; on y the
   hair is larger). [Fixed: 1e-7.]
9. `sameRect` switches to 1e-9 for any rect with x in (0, 1e-4): fine for roots, its only use; a
   trap if reused. [Comment.]
10. A user's own no-border choice is cleared by kwin-i3 (R1-4's documented trade-off). [As
    specced.]
11. Migration on Paul's machine works: the old drop-in's `ExecStartPre=-` on a deleted file is
    harmless and is rewritten; `kwini3frame*` matches the selected library and is deleted (KWin's
    default is Breeze); nothing records a previous decoration (the spec said it would). `~/.dotfiles`
    still describes the old setup (`setup.sh` 179-187 incl. `BorderSize Tiny`, README line 90).
    [Spec text corrected; dotfiles to update with the go-live.]
12. Test gaps: reload/unload checks are end-state only (a flash of title bars would pass); the
    clip is untestable by screenshot (recorded); no second output with an offset (R1-17); scroll
    untested; `ringWindow` ignores the activity. [Recorded in the spec's test section.]

## Checked and found right

No reconfigure loop (`Workspace::slotReconfigure` reloads no effect; load and unload queue one
reconfigure each; `effectAsk` drops stale replies). `noBorder` read-back sees forcing rules. The
clip: a transformed window paints `visible & deviceRect`, `visible` reduced only by opaque windows
above. Coordinates (`scaledRenderRect().topLeft()` with the projection). `repaintRing` covers its
bars. Signal signatures match 6.7.5. Held snapshots keep their ring. Input order: the Decoration
filter runs after Effects, InteractiveMoveResize and Popup; `hover()` null-or-desktop keeps clicks
for floating windows and panels; `isOnCurrentDesktop()` uses the window's own output's desktop.
`tookBorder`/`borderGone` cleared on forget, release, float.
