# Spec: the i3 frame as a KDecoration3 plugin (no edge resize, no edge drag)

Decided by Paul, 2026-10-23. Status: **draft for next session, not yet reviewed.** The facts below
were traced in KWin 6.7.5, KDecoration 6.7.5 and Aurorae 6.7.5 source by the dotfiles session on
2026-10-23 and handed over; verify against the source again (`invent.kde.org`, tag v6.7.5) before
anything here becomes code.

## The problem

The 1 px frame is the Aurorae theme `i3frame` (dotfiles, `plasma/.local/share/aurorae/themes/i3frame`,
i3's `default_border pixel 1`). KDecoration's library turns the border strip into resize sections
(`decoration.cpp`, `Decoration::Private::updateSectionUnderMouse`); KWin maps a section to a
cursor and starts a resize on an unaccepted left press (`window.cpp` `processDecorationButtonPress`,
`input.cpp` `DecorationEventFilter`). The top 1 px is the title bar: a left drag there starts a
move. Aurorae also adds an invisible resize-only strip of about 8 px above every window, whatever
the border size (`v2/decoration.cpp` `updateResizeOnlyBorders`), inside the bottom of the window
above: that is the cursor flip between tiled windows. No theme key switches any of it off, and the
only gate, `isResizable()`, is what decides tiling, so a window rule is out.

## Decision

After this, **the frame starts nothing from the pointer**: no resize, no move, the arrow cursor
everywhere on it. Resize is Meta+right-drag (KWin's stock `CommandAll3`) and the Meta+Ctrl keys;
move is kwin-i3's Meta+Shift+drag (kwini3mouse) and the Meta+Shift keys. A floating window
resizes only by Meta+right-drag and the keys (Paul asked, and accepted that). The border-drag
read-back (`readBack` in `src/kwin.js`, tested by 51-input) stays: it serves Meta+right-drag.

## What the frame must reproduce

The theme as it is today: a square 1 px border on all four sides of every window, `#4c7899` on
the active window, `#333333` on the rest; no title bar, no buttons, no rounding. kwinrc
`[org.kde.kdecoration2]` (still that group name in 6.7.5; the plugin namespace is
`org.kde.kdecoration3`) keeps `BorderSize=Tiny`, `BorderSizeAuto=false`. Firefox uses the
decoration too (`browser.tabs.inTitlebar=0`). Fullscreen windows have no decoration, as now.

## How, in KDecoration3 terms (traced, to verify)

- `sectionUnderMouse` is computed in KDecoration's library from `borders()` plus a corner zone of
  `2 * largeSpacing`, from `Decoration::hoverEnterEvent`, `hoverMoveEvent` and `mouseMoveEvent`.
  Override those three without calling the base: the section stays `NoSection`, so
  `Window::mouseGravity()` is None and `updateCursor()` gives the arrow. It must *stay* NoSection:
  `Window::processDecorationMove` re-reads the gravity on every hover.
- KWin calls `processDecorationButtonPress` only when the `QMouseEvent` it sent the decoration comes
  back unaccepted (`DecorationEventFilter::pointerButton`). Accept every press: no delayed move or
  resize is set up. `globalWindowAction` (Meta+button) runs before that in the same filter, so
  Meta+right-drag and the chords are untouched. Touch skips the decoration event and would still
  start a move through the same call; no touch here.
- `resizeOnlyBorders` at its default (zero) and `setTitleBar(QRectF())`: the top strip is a plain
  border like the others, and the double-click path (which switches on the section) sees NoSection.
- The input region is borders + resizeOnlyBorders (`Window::updateDecorationInputShape`): with
  both minimal the hit area is exactly the 1 px line.

## Building, installing, loading

- A third target in `plugin/` (one CMake project, already kwini3mouse and kwini3hold). Needs
  `kdecoration-devel`, not installed; dnf's cached metadata listed 6.6.4 against the installed
  6.7.5-1.fc44 library, so refresh the metadata and check the versions match. sudo, per command.
- The IID in `org.kde.breeze.so` is the plain string `org.kde.kdecoration3`, not versioned per
  KWin release like our two plugins: a rebuild is needed when kdecoration's own ABI changes, not at
  every Plasma update. Installed decorations live in `/usr/lib64/qt6/plugins/org.kde.kdecoration3/`.
- KWin loads it by `KPluginMetaData::findPluginById("org.kde.kdecoration3", <library=>)`
  (`decorationbridge.cpp`) through `QCoreApplication::libraryPaths`, so the existing QT_PLUGIN_PATH
  drop-in covers `<root>/org.kde.kdecoration3/<id>.so`, and `library=` must equal the file basename.
  If it fails to load, KWin falls back to Breeze and keeps running.
- Live reload: write `library=` and reconfigure; `DecorationBridge` re-reads the plugin
  (`readPlugin`). KWin never unloads a library, so a new build is a new file name (as
  `plugin-install.sh` does) with `library=` rewritten, or a stable name and a logout.
  `kwin-applywindowdecoration` is not needed.
- Then, in dotfiles (the dotfiles session does it once the id and path are settled): retire the
  Aurorae theme, drop setup.sh's theme link and its `kwin-applywindowdecoration` call (keep the
  BorderSize keys), drop health-check's theme link check, update README's Plasma table row.

## Tests

To design in the spec review. Candidates: a live test that loads the plugin into the test KWin
(`KI3_PLUGIN`, `library=` in the test kwinrc) and checks, with real input (`tools/inject.py`), that
a left drag from a window's edge changes nothing (no `DRAG start` line, frame unchanged) while
Meta+right-drag still resizes and reads back; a pixel check of the 1 px border colours on the
active and an inactive window.
