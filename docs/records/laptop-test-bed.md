# The laptop as second machine and Plasma 6.8 test bed

**Status: done 2026-10-30** (Paul: "50 can go"). Was `OPEN.md` item 50, kept here as it stood. The
laptop runs main with the plugins and the settings page; its captures (Meta+Shift+B) are read from
the desktop over ssh. Its monitor checks are `LATER.md` item 60.

**50. Paul's Arch laptop as the second machine, then the 6.8 test bed** (Paul, 2026-10-28,
fourteenth session). No release before Plasma 6.8 (out 2026-10-14, Wayland only) has been lived
through: Fedora 44 gets it only after Fedora 45's release; Arch already has it (6.8.0 in Extra
2026-10-15). Stages: (a) Plasma 6.7 on the laptop (Arch + i3, X11 today; i3 stays as the fallback
session) from an Arch Linux Archive snapshot dated before 2026-10-15, the whole system at one date
(no partial downgrade); kwin-i3 installed by following the README as a stranger would, every snag
noted for the release road; what a laptop adds: one internal output, docking, HiDPI, lid and
suspend, touchpad gestures, Intel/AMD graphics (is the wallpaper flash NVIDIA's?), Arch's package
names for the plugin build (headers in `kwin`, no `kwin-devel`). (b) Once it runs well there, the
mirrorlist back to current and `pacman -Syu` to 6.8: the laptop becomes the test bed for changes
(a few missing system apps are fine). (c) Regroup:
what was learned, and how to work with it on the desktop.
**The cross-system check** (Paul, 2026-10-29: the same suite on a second machine, not a bigger
one; i3 too runs one suite everywhere, `testcases/complete-run.pl` under Xephyr): `make plugin`
and one `make test` on the laptop at the end of (a), and again after the 6.8 update in (b); a
scenario red there and green on the desktop is a finding (Arch's build in (a), 6.8 in (b)).
**By hand on the laptop**, what the headless KWin can't reach, each noted as works / snag: the
lid, suspend and resume, the internal screen (frame 1 px, gaps, the margins' focus), touchpad
scrolling and gestures (Overview, desktop switch) beside kwin-i3's keys, and the workspace widget
on the laptop's panel. The checks that need an external monitor on the laptop (docking, the lid
with a monitor) and the wallpaper flash on AMD moved to `LATER.md` item 60 (Paul, 2026-10-29: a
tedious desk setup, one session toward release; his two monitors cover the rest).
**HiDPI in the test KWin** (Paul's go, 2026-10-29): `KI3_OUTPUTS` and `KI3_SCALE`
(`tools/testkwin.sh`); 10-tiling, 26-gaps, 54-frame and 85-tiled-look green at `KI3_SCALE=2`
the same day. The laptop adds no HiDPI: its panel is 1366x768 at scale 1 (read 2026-10-29), so
fractional scales stay untested on real hardware. Worked over ssh from here (one repo, one
`OPEN.md`); the laptop's live session under the same "nothing goes live without Paul's go".
**Done 2026-10-29**: the laptop (`pauls-laptop`, Tailscale; HP, AMD Radeon Vega, 2 cores, 17 GB)
on Plasma 6.7.5 Wayland from the 2026-10-14 snapshot (pinned; later pacman runs need
`--disable-download-timeout`), SDDM offering Plasma and i3; the clone, `make plugin`, `make kcm`
and the suite there, in four runs under 5 minutes (`run.sh` on two cores: ~11 minutes in all).
Fixed from it: the plugins' and settings page's ECM version (Qt 5's cmake files made ECM pick
Qt 5); KWin's unnamed `""` layout counted as US (a false notice where the system sets none);
Arch's AT-SPI paths; the test KWin given a Plasma session's variables (over ssh Qt loaded no
KDE platform theme: other fonts and style, a 36 px title bar, spin boxes that took no typing).
Release-road snags: in the README since 0a09562 (2026-10-30: versions, Arch's packages,
`vulkan-headers`, `python3-xlib`, `mkdir -p`, `kdialog`, the first plugin-install's message, a
cached failed configure, `make tools`). Left for the release pass (`LATER.md`): the repo is
private; Picture-in-Picture tiles (only Paul's own `floatingTitle` floats it).
Also fixed: the test terminals read the user's own alacritty config (the laptop's cursor colour
sat on 78's corner pixels); 59's arc pixel is the GPU's antialiasing (NVIDIA 55,48,48, AMD
68,33,33), judged as 78 judges it. 53-hold's two laptop findings fixed 2026-10-29 (6dd3a82: a
new window stays hidden until it lands; a kept closing window grabbed from Scale), 53 green on
both machines; installed live the same day. The suite once more on the laptop, 2026-10-29: 58 of
60 green; 39 and 69 red, both from `kwriteconfig6 --notify` losing its signal on the slower
machine (4 in 30; the tests now send it with gdbus, `lib.sh` `set_layouts`; upstream note in
`LATER.md`), green on both machines after. Stage (a)'s live install, 2026-10-29, Paul at the
laptop: the script, plugins, settings page and widget by the README, `make take-keys` (21 keys);
works: tiling and the frame, popups, the widget, touchpad scrolling and Overview, lid, suspend.
Found: (1) Meta+N with KWin's Slide left the incoming windows' frames at their final places:
fixed the same day (the effect's chain position, after Slide). (3) **Frames "not following the mouse"**: Paul's
capture 2026-10-29 16:09, the laptop is click to focus, so the focus (and the frame) moves only
on a click; correct, and item 52's question. (4) Frames seen **flashing** once, not seen since: dropped (Paul, 2026-10-29; a capture at the
moment reopens it). A small flash as Firefox closes is the hold's accepted trade (200 ms, Paul's decision), not
carried. Konsole's "New Tab / Split View" bar is Konsole's own toolbar (☰ > Show Toolbar). Then the laptop set
to `plan.md` (e)'s list as a user following the install would (2026-10-29): focus follows mouse
(mouse precedence, no delay), per-output desktops, animations off and Scale off; the keys taken earlier. Stage (a) is done.
**Stage (b), 2026-10-29**: the laptop on Plasma 6.8.2 (KWin 6.8.2, Qt 6.12; `pacman -Syu` from
current mirrors, the pinned list kept as `/etc/pacman.d/mirrorlist.pin-20261014`). The laptop
stays on SDDM (Paul, 2026-10-30): kwin-i3's setup (KWin's drop-in, `environment.d`) is read by the
systemd user session whichever login manager starts it, and Arch's 6.8 enables Plasma Login
Manager for no one, so switching would test nothing of ours; it returns only with a user's
login-manager problem. 6.8 findings, all fixed (main 8dec0da): kwini3hold's paint hooks
return bool in 6.8 (it didn't compile); ScreenShot2 sends RGBX8888 (`shot.py` refused it: 11 of
13 reds); `GLShader::setUniform(QColor)` premultiplies (the drop indicator at a quarter). The
suite then: green but 86 and 53, item 61. Installed there the same night (the plugins and the
settings page, 6.8 builds; Meta+Shift+B bound); main pulled and reloaded 2026-10-30.
