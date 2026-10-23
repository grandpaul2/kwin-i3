# kwin-i3

i3's window management as one KWin script, for Plasma 6.7+ on Wayland: i3's window tree,
workspaces that live on a monitor, and i3's keys, inside an ordinary Plasma session.

**Status: Paul's window manager since 2026-10-22 (phases 0-6 done); the dotfiles' `setup.sh`
installs it.** It replaced two pieces of Paul's dotfiles, retired the same day and kept in their
git history:

- `i3ws`, a plain-JS KWin script: i3's workspaces on per-screen desktops, focus and moves across
  monitors;
- a patched copy of Krohnkite 0.9.9.2, which tiles each workspace.

Why one script and not more patches to those: the window state was split between the two (i3ws
owns workspace and monitor, Krohnkite owns position and order, and they talk by D-Bus shortcut
calls), and i3's tree needs to be the single truth. Krohnkite is also a QML script (each reload is
a logout), and its `script.js` is compiled upstream output we were patching by hand.

`docs/plan.md` is the plan; `docs/spike-kwin-tiles.md` is why it builds on KWin's own tile tree.
`CHANGELOG.md` says what changed between versions.

License: GPL-2.0-or-later (`LICENSE`). `src/tree.js` ports i3's tree code, which is BSD-licensed;
`NOTICE` carries its notice and the other credits.

## Working on it

```
make test        # unit tests (node) + live tests (each in its own headless KWin)
make build       # src/ -> package/contents/code/main.js
```

The live tests never touch the running desktop: `tools/testkwin.sh` starts a private KWin with two
virtual 1280x720 monitors, its own D-Bus session and its own config. `tools/testclient.py` opens the
awkward windows (fixed size, large minimum, dialog, slow to appear, retitled).
