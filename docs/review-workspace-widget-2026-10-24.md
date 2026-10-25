# Review: the workspace widget (2026-10-24)

A second agent's review of `git diff main...workspace-widget` against `docs/spec-workspace-widget.md`,
the installed task manager QML types and Plasma 6.7.5's sources. Read-only. No must-fix.
Handling in brackets.

1. **Scroll on stale state, no accumulation**: quick notches all stepped from the last gather's
   focus; a touchpad's small deltas each switched. [Fixed: deltas added up, one step per 120; steps
   before the answer go on from the one last asked for. Unit tests.]
2. **Every gather rebuilt every delegate** (a title change; a click lost mid-rebuild). [Fixed: the
   thumbnails change only when the computed list does.]
3. An empty workspace on the focused monitor is never marked focused (focus known only through
   windows). [Documented in workspaces.js; scroll starts from the first shown one then; unit test.]
4. Screens not watched. [Fixed: `Qt.application.screensChanged`.]
5. A window without a geometry would throw. [Fixed: skipped.]
6. Vertical size bound to its own width. [Fixed: from the panel's thickness.]
7. Many workspaces in a thin panel: no overflow handling; the number's 8 px floor. [Noted: fine
   for 2-6 workspaces; "Numbers only" for small panels.]
8. Accessibility: no name, role or tooltip. [Fixed: a button named "Workspace N", a tooltip.]
   Shown vs focused differ by fill only. [Noted.]
9. The D-Bus call's form unverified by reading. [Verified live: a click runs kwin-i3's Workspace N.]
10. Skip-taskbar windows aren't counted (TasksModel's default filter). [Noted: dialogs; a tiled
    skip-taskbar window wouldn't show on its thumbnail.]
11. The config page's Defaults. [Fixed: `cfg_numbersOnlyDefault`.]

Checked and right: desktop ids (QVariant/UUID strings, `String()`), `currentDesktopByScreenName`,
the signals, the roles and their coordinate space (logical, the same as `Qt.application.screens`),
screen names, the filters, the click action and its component, the packaging, the layout's flow,
the 30 ms debounce.
