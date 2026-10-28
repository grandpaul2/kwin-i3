# Spec: redo stage 5, keys (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §8 K4 (i3's resize mode), K17 (exit), K18 (terminal, launcher), §4 S5
(the no-back-and-forth actions), S8/S9 (`next`, `primary`), all decided (Paul, 2026-10-27).

## What happens today, from the sources

**kwin-i3**: `KEYS` in `src/kwin.js` registers each action with kglobalaccel; Shrink/Grow Width
and Height sit on Meta+Ctrl+arrows and Meta+Ctrl+J K L ;. There is no mode, no exit, terminal or
launcher key, and outputs are reached by direction only. The helper (`plugin/`) already filters
keys during a drag (`tilingdrag.cpp` `keyboardKey`: Escape) and calls the script back through
hidden kglobalaccel actions.

**i3 4.24** (`etc/config.keycodes`): `mode "resize"` on Meta+R; in it `j`/Left shrink width, `k`/
Down grow height, `l`/Up shrink height, `;`/Right grow width, each `10 px or 10 ppt`; Return,
Escape and Meta+R back to `default`. In a mode **only the mode's bindings are active**: every
other key, Meta+N included, goes to the focused window, and the bar shows the mode's name.
Bindings are by key code (`bindcode`), so the layout doesn't matter. Meta+Shift+E: `i3-nagbar`
asks, then `exit`. Meta+Return: `i3-sensible-terminal`; Meta+D: `dmenu_run`. `workspace N` and
`move … workspace N` take `--no-auto-back-and-forth`; `focus output` and `move … to output` take
`next` and `primary` besides directions.

**Plasma 6.7** (live, read-only): no Plasma default holds Meta+R, Meta+Return or Meta+Shift+E;
Meta+D is Show Desktop's default (Paul's is `none`). `org.kde.LogoutPrompt` and `org.kde.krunner`
are on the session bus. The default terminal is kdeglobals' `[General] TerminalService`
(Konsole when unset; Paul's is unset). kglobalacceld launches an application's shortcut through
its `<name>.desktop` component and KIO's `ApplicationLauncherJob`
(`globalshortcutsregistry.cpp` `getOrCreateComponent`, `kserviceactioncomponent.cpp`), so the app
gets its own systemd scope.

## Design

### A. The resize mode (K4), in the helper

- **Entering**: a kwin-i3 action **Resize Mode** (default Meta+R) asks the helper over D-Bus,
  `SetMode("resize")`. Without the helper the action does nothing and the load report says the
  mode needs it (§13).
- **The filter's place**: KWin runs its input filters in order (`/usr/include/kwin/input.h`:
  … TabBox, **GlobalShortcut**, Effects, … WindowAction …); the helper's drag filter is at
  Effects, after the shortcuts, so a bound key (Meta+R itself) never reaches it. The mode's key
  filter goes **before GlobalShortcut** (at TabBox's order), installed only while the mode is on.
- **In the mode** the helper's keyboard filter takes, by **key code** (evdev, as i3's `bindcode`,
  so no layout refit): J and Left → Shrink Width, K and Down → Grow Height, L and Up → Shrink
  Height, ; and Right → Grow Width, on press and key repeat (holding a key keeps resizing, as in
  i3); it runs each by invoking the kwin-i3 action (as the drag does). Return, Escape and Meta+R
  leave the mode. **Every other key goes to the focused window**, as in i3.
- **kwin-i3's other keys do nothing in the mode** (i3: only the mode's bindings are active): the
  script's `act()` returns while the mode is on, as stage 2's override-redirect check does, except
  for the four resize actions the mode itself runs. **The mode's state is the helper's**; it tells
  the script on each change through a hidden action (`kwin-i3 Mode Changed`, then `State()`, as
  the drag does), and the script asks once at load, so a script reload can't lose step. Plasma's
  own shortcuts still run (i3 doesn't own them).
- **Leaving otherwise**: the helper unloading, kwin-i3 releasing, the screen locking.
- **The four actions** keep their names and go unbound (their Meta+Ctrl keys free); a user who
  wants them flat binds them on the Keys page. Their steps stay `resizeStep` and `floatingStep`
  (i3's `10 ppt` and `10 px`).
- **The sign** (i3's bar shows "resize"; call 34, Paul 2026-10-28): **a banner in the focused
  window itself**, in the style of the settings page's inline messages (Kirigami's
  `InlineMessage`): "Resize mode: J K L ; or the arrows; Escape to leave", drawn by the effect
  at the top of the focused window while the mode is on. It can: KWin 6.7.5
  exports `OffscreenQuickView` and `OffscreenQuickScene` to plugins (`/usr/include/kwin/effect/
  offscreenquickview.h:51, 161`, `KWIN_EXPORT`, `setSource` for a QML file), so the effect shows a
  small QML scene over the focused window. The ring's colour stays the fallback only if that
  fails in the build.

### B. Exit (K17)

A kwin-i3 action **Exit** (Meta+Shift+E): `org.kde.LogoutPrompt /LogoutPrompt
org.kde.LogoutPrompt.promptLogout`, Plasma's own dialog, its confirmation as `i3-nagbar`'s.

### C. Terminal and launcher (K18)

- **Terminal** (Meta+Return): the helper reads kdeglobals' `TerminalService` (default
  `org.kde.konsole.desktop`) and has kglobalacceld launch it as Plasma does for an app shortcut:
  that service's component (`doRegister` creates it) and its `_launch` action invoked
  (`invokeShortcut`). The terminal gets its own scope, not KWin's (a launch from inside KWin
  would put it in KWin's cgroup, and a KWin restart would end it). Paul's Alacritty then needs
  Default Applications > Terminal set to it; the live check says so.
- **Launcher** (Meta+D): `org.kde.krunner /App org.kde.krunner.App.display`. Show Desktop's
  default Meta+D, where it is set, is reported as a taken key (§8 "Taken keys": it wins until
  freed, its serial being older).

### D. The extra workspace and output actions (S5, S8, S9)

Unbound, as i3's config leaves them: **Workspace N (no back-and-forth)** and **Move to Workspace N
(no back-and-forth)**, 1 to 10; **Focus Output Next**, **Focus Output Primary**, **Move to Output
Next**, **Move to Output Primary**, and (call 35) **Move Workspace to Output Next**, **Move
Workspace to Output Primary**. `next` is KWin's output order, wrapping (i3's
`get_output_next_wrap` over its list); `primary` is the first in that order. Listed in
`kcm/ui/commands.json` so the Keys page shows them.

## Probe result (2026-10-28, probe 92, branch `probe-redo`)

In the test KWin (kglobalaccel runs inside it): `doRegister` of `Alacritty.desktop` (no
`X-KDE-Shortcuts`) then `invokeShortcut _launch` on `/component/Alacritty_desktop` **opened
Alacritty**; the same for `org.kde.konsole.desktop` opened Konsole. C's route works. Not shown:
the app's own systemd scope (the test bus has no systemd); KIO's launcher does that live.

## Tests

- **Run**: `make unit` (`keys.test.js` checks `KEYS` against the old i3 config: its Meta+Ctrl
  expectations change to Meta+R's mode), 33 (own keys), 35 (taken keys: Meta+D), 50 (keys), 55
  (helper), 64 (plugin reload, a helper change), 68 (workspace commands), 69 (layouts: the mode's
  keys need no refit), 76 (the Keys page lists the new actions).
- **New checks, approved (Paul, 2026-10-28)**: in 55, the mode (Meta+R, then J resizes, Meta+1 does nothing (kglobalaccel takes it, kwin-i3
  ignores it), a plain letter reaches the window, Escape leaves); in 68, a no-back-and-forth action and Focus Output Next.
  Exit, terminal and launcher open things on the test session's bus: checked by the D-Bus call
  made (logged), not by what opens.

## Paul's calls (2026-10-28)

34. The sign: a banner in the focused window, else the ring's colour (A).
35. `move workspace to output next | primary`: yes, unbound, as i3 (D).

## Live check (Paul)

Meta+R, then J/L/arrows resize, any other key types into the window, Escape leaves; Meta+Shift+E
asks to log out; Meta+Return opens the default terminal (set it to Alacritty first); Meta+D opens
KRunner.

## Done when

Live and Paul's "it works": K4, K17, K18, S5, S8, S9 rewritten as built; `localbin/.local/bin/
hotkeys` and dotfiles' Plasma table updated (CLAUDE.md: a key change).
