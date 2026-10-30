# Spec: `make plugin` leaves no stale outputs (OPEN.md item 12)

**Now (2026-10-27):** Done 2026-10-25 (build hygiene; no behaviour).

Paul's go 2026-10-25; done the same day (checked: a stray `.so` and the retired `kwini3frame.so`
gone after one `make plugin`, 0.7 s; 55-helper and 57-effect-frame green).

## The gap

CMake writes the plugins to `plugin/build/bin` (`CMAKE_LIBRARY_OUTPUT_DIRECTORY`,
`plugin/CMakeLists.txt:15`) and never removes a file it no longer builds. The test KWins and the
fuzzer load plugins from there, so a renamed or retired plugin stays loaded in every test:
`kwini3mouse.so` until 2026-10-24, and `org.kde.kdecoration3/kwini3frame.so` there now (harmless:
nothing selects it).

The installed copies are already handled: `tools/plugin-install.sh` removes older files by name,
`kwini3mouse*` included, and the retired decoration.

## The change

`plugin/CMakeLists.txt`, beside the output directory: empty `bin` at configure time
(`file(REMOVE_RECURSE ${CMAKE_BINARY_DIR}/bin)`). `make plugin` configures every time, so after
each run `bin` holds exactly what CMake builds now. The cost is a relink of the two plugins per
`make plugin` (seconds; `make test` runs it).

## Check

No new test (a build-hygiene step): checked once by hand. A stray `.so` placed in `bin` is gone
after `make plugin`, `bin` lists exactly `kwini3helper.so` and `kwini3hold.so`, and `make test`
stays green.
