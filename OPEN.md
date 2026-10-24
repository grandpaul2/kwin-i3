# OPEN — kwin-i3's only list of unfinished work

**State, not history**: rewrite it as things change, never append. If it isn't here, it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action**. Phase 6 (the dotfiles side) is done.

Last reconciled: **2026-10-24**.

## Open

Nothing. Paul, 2026-10-24: the hold timeout of 200 ms is permanent (dotfiles' setup.sh), and the
rest was dropped as not worth the work: the Firefox fullscreen watch (if a video ever drops out
of fullscreen when a window opens beside it, that is a capture), the hold effect's dropped close
holds (a proxy for flashes Paul would see himself), the capture of 2026-10-23 17:43 (a one-off,
not seen since), the fuzz run with the frame selected (a day live without trouble) and the
fuzzer speed-ups (the fuzzer is rare).

`tests/fuzz/out*/` is gitignored: those traces live only on this disk (`out` is overwritten by each run).
