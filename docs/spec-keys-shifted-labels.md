# Spec: the settings page names a shifted symbol by its keys ("Meta+Shift+1", not only "Meta+!")

Paul's go 2026-10-25; built the same day. The live check is a screenshot count in
`37-settings-page.sh` (the label beside Move right's Meta+:, none beside Focus right's Meta+;), watched
red with the label emptied; the naming's unit tests watched red with the typed character dropped. Paul, the same day: the Keys table showing Meta+!, Meta+@ …
for Meta+Shift+1, 2 … should look better, on kwin-i3's own page (not Plasma's System Settings
page, whose drawing isn't ours, nor the `hotkeys` cheat sheet, which already says Meta+Shift+1..0).

## Why it reads Meta+!

A KDE shortcut is the symbol the keys type, not the keys held (`docs/spec-keyboard-layouts.md`):
Meta+Shift+1 on a US keyboard *is* Meta+! to kglobalaccel, and Plasma's own shortcut editor
records it so. The page shows each key in KDE's key button (`KQC.KeySequenceItem`, `Keys.qml:71`),
which draws the key's own text and has no way to set another. A button of our own that looks like
it would be a faked component; not done.

## The change

- **Beside the button**, a muted label (Kirigami's disabled text colour, small font) with the keys
  that type it: **"Meta+Shift+1"**, when the key's last part is a symbol that a key types with Shift
  on the current layout and isn't a letter (Meta+Shift+Ö already reads as keys). Nothing for
  any other key. The tooltip's default reads "Default: Meta+Shift+1 (Meta+!)" likewise.
- **The current layout's symbols** come from the page's C++ (`kcm/keys.cpp`): the keymap built
  with libxkbcommon from what KWin builds it from (kxkbrc `[Layout]` Model, LayoutList,
  VariantList, Options; "us" without one), at the layout KWin is on (`org.kde.keyboard`
  `getLayout`). Handed to QML as a table: for each key, its unshifted and Shift symbols as Qt keys.
- **The naming** is a pure JavaScript function (`kcm/ui/shifted.js`, imported by `Keys.qml`, as
  the widget's `workspaces.js`): key combination + table → "Meta+Shift+1" or "". Unit-tested in
  node with US, German and French tables: US `!` → Meta+Shift+1; German `"` (fitted by the helper)
  → Meta+Shift+2; French `1` (Shift on AZERTY) → Meta+Shift+& — the key's own unshifted symbol,
  since that's what's printed on it.
- **Live**: in `37-settings-page.sh`, ink beside Move right's second key (Meta+:) and none beside
  Focus right's (Meta+;), from the scenario's screenshot. The slots are wider (16 grid units, room
  for the label), so the scenario's second-column click moved (`KEY2_X` 530 → 620).

## Not here

Plasma's System Settings > Shortcuts page (not ours to draw). The stored keys don't change.
