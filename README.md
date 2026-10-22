# kwin-i3

i3's window management as one KWin script, for Plasma 6.7+ on Wayland: i3's window tree,
workspaces that live on a monitor, and i3's keys, inside an ordinary Plasma session.

**Status: not started.** It replaces two pieces in Paul's dotfiles (`~/.dotfiles`), which stay
running as the fallback until this matches them:

- `i3ws`, a plain-JS KWin script: i3's workspaces on per-screen desktops, focus and moves across
  monitors;
- a patched copy of Krohnkite 0.9.9.2, which tiles each workspace.

Why one script and not more patches to those: the window state was split between the two (i3ws
owns workspace and monitor, Krohnkite owns position and order, and they talk by D-Bus shortcut
calls), and i3's tree needs to be the single truth. Krohnkite is also a QML script (each reload is
a logout), and its `script.js` is compiled upstream output we were patching by hand.

`docs/plan.md` is the plan; `docs/spike-kwin-tiles.md` is why it builds on KWin's own tile tree.
