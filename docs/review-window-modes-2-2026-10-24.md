# Review: the window-modes change, pieces (iii)+(iv) (2026-10-24)

A second agent's code review of `git diff main...window-modes-2` (at 2b6b10f) against
`docs/spec-window-modes.md` and KWin 6.7.5. Read-only. How each finding was handled is in brackets.

## Must-fix

1. **`told` goes stale when the effect reloads while the frame stays on**: `setFrame` returns early,
   so `told` isn't reset; the new effect's empty set is never told again (frames gone, the mark
   lost for the next reload). [Fixed: every answer's `floating` is compared with `told`; any
   window kwin-i3 told and the effect doesn't list resets `told` and schedules a pass. Test: the
   effect unloaded and loaded with p floating, then p's id in Stats.]
2. **Client-side-decorated windows were framed when floating**, against R1-5: `setDecorationPolicy`
   stores None for any xdg toplevel, so `takeBorder` read back true on zenity and the effect's
   `noBorder() && in the set` test passed. [Fixed: kwin-i3 takes only a border that exists (frame
   larger than the client); a CSD window's policy is never touched, so the effect never frames it
   floating. Test: a --csd floating window with frameOnFloating: no frame, noBorder false.]

## Should-fix

3. Adoption at load ran with `frameOn` false (the answer finished the adoption before `setFrame`):
   keep-above and title bars flickered at every reload. [Fixed: `setFrame` first.]
4. An older effect (frameWidth, no floating set) turned the frame on but has no mark: Plasma
   windows would lose floating at a reload. [Fixed: the Plasma-workspace layering and the mark
   need the answer to carry `floating`.]
5. `framefocus` took clicks around any borderless window, not only kwin-i3's. [Normal windows
   only, as the effect; the rest (a user's own No Border) accepted and noted.]
6. An error in the deferred adoption only retried: windows half adopted, no release. [Fixed: it
   logs and releases, as `start()` does.]
7. A monitor change inside the 250 ms gap could hand out a workspace whose windows aren't adopted
   yet. [Documented limit (spec).]
8. A window left kept above by an earlier load without the effect stays kept above on a Plasma
   workspace (kwin-i3 can't tell it from the user's own flag); and a user's own keep-above is
   cleared when kwin-i3 floats then moves the window. [Noted in the spec; old behaviour for the
   second part.]

## Notes

9. `borderGone` set on a floating window and never cleared. [Cleared in `lookFloating`.]
10. `frameOnFloating` off gives back a border the user removed by hand (R1-4's trade-off). [As specced.]
11. No unit test for the `workspaces` parse; the page's parse is looser ("3abc" ticks 3). [Unit
    test added; the page uses the script's rule.]
12. Windows classified late open tiled on a Plasma workspace (`fresh` only from windowAdded).
    [Documented.]
13. `release()` leaves the effect's marks. [Intended: a later load re-floats them; spec says so.]
14. A floating window going fullscreen and back: title bar until the next pass. [Checked:
    fullScreenChanged schedules its workspace.]
15. A frame-height change when the border toggles may move a floating window. [Untested; noted.]

Checked and right: `lookFloating` on every pass; un-floating, drop, setting changes through
`scheduleAll`; `setFrame(false)` restores keep-above through the next pass; `finish()` once, the
250 ms fallback; windows added or activated in the gap; `forgetWindow` and `onDeleted` drop ids;
the `workspaces` parser; main.xml/config.ui/page bindings; 62's reload step proves the mark.
