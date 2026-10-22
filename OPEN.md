# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. The dotfiles' `OPEN.md` keeps only what touches the system (phase 6).

Last reconciled: **2026-10-22**.

## Open

- **`51-input.sh` failed once in the full parallel suite** ("solo fills the monitor again": 1176
  wide after the resize drag, wanted 1280), 1 of 4 full runs on 2026-10-22, never alone (3/3). Next:
  if it recurs, look at the post-drag refit (`src/kwin.js`, "A tiled window fills its tile") under
  load rather than raising waits.

`tests/fuzz/out/` is gitignored: those traces live only on this disk.
