# Spec: kwin-i3's own settings page, and a tidier form (OPEN.md item 7)

**Now (2026-10-27):** Built and live 2026-10-24, then reorganized (`spec-settings-cleanup.md`); the page is `kcm/ui/`, its look and words `style-settings-page.md`. Its layout lists and its "nothing built" line below are history. What it does: `behaviour.md` §11.

**Superseded in part** (2026-10-26): the page as it stands is `kcm/ui/`, and how it looks and reads is
`docs/style-settings-page.md`. This spec is the history of how the page was first built; where they differ (the "Atomic layout" and "Advanced" sections, `debugLog` on the page),
the guide and the code win.

Requested by Paul, 2026-10-24: convenience and accessibility before the README pass. The script's
Configure form doesn't look like Plasma's own pages, and its keys sit in KWin's long list under
Shortcuts > Window Management, apart from the rest of its settings.
Status: **draft, reviewed (second agent, 2026-10-24: findings folded in, marked *review*), for
Paul's go.** Nothing built.

## Paul's decisions (2026-10-24)

- kwin-i3 gets **its own entry in System Settings > Window Management**, a Plasma-style page.
- The script's existing form (the cog in KWin Scripts) is **tidied** too.

- A, B, C below: the recommendations, all three (Paul, 2026-10-24, with his go).

**The tidied form is built** (2026-10-24): one centred `QFormLayout` for every section, so the
labels share one right-aligned column (the group boxes each aligned their own, the main reason
the form looked untidy), bold headings, shorter labels, and a tooltip on every list. Checked on a
screenshot of the generic KCM in the test KWin (`kcmshell6
kwin/effects/configs/kcm_kwin4_genericscripted --args "kwin-i3 KWin/Script"` with the package
linked into the test's `XDG_DATA_HOME`), which also settles that the form can be run headless.

**The page is built** (2026-10-24): `kcm/`, `make kcm` / `kcm-install` (`tools/kcm-install.sh`),
tested by `tests/live/37-settings-page.sh` (30 checks, `# needs: kcm`) and
`tests/unit/kcm.test.js` (the Keys table against what the script registers). As built:
- **Installed in its own directory**, `~/.local/lib/kwin-i3/kcm-plugins`, not the plugins'
  (decision B said the same one): that directory goes on the whole session's `QT_PLUGIN_PATH`,
  and the plugins' holds the frame decoration, which every app that lists decorations would then
  load, unguarded by `tools/frame-guard.sh` (System Settings' Window Decorations page).
- **A package linked while KWin runs isn't seen** until KWin restarts: KPackage keeps the list
  of packages from KWin's first look, so turning such a script on (the page's Turn On, or KWin
  Scripts' checkbox) does nothing (found by the scenario; `tools/testkwin.sh` now links the package
  before KWin starts). For the README pass: an install made in a running session needs a login
  before kwin-i3 can be turned on.
- The key recording works with injected input in the test KWin (the shortcut-inhibit question in
  the review did not arise), so the Keys checks record real key presses.
- Turn On shows the new state one second after asking KWin, which starts scripts later and says
  nothing when it has.
- Keyboard: the scenario sets a value by typing, and reaches the focus choice with Tab from the
  resize step; a full Tab walk of the page is not checked.
- **KWin's own environment hid the page** (Paul's first look, 2026-10-24): the plugins' drop-in
  sets KWin's `QT_PLUGIN_PATH` with `Environment=`, which replaces the session's, and an app KWin
  launches (one on a global shortcut: kglobalaccel runs in KWin) inherits KWin's. Such a System
  Settings had no page. `tools/kwin-dropin.sh`, used by both install scripts, now writes both
  directories into the drop-in (tested in a scratch home).
- Code review (second agent, 2026-10-24), acted on: a key whose take fails (the record can't be
  written, or kglobalaccel refuses) is not given to kwin-i3 either, and the page names it
  (tested, watched red); a key edit updates only the rows it changed, so the edited item keeps
  the keyboard focus; Apply reconfigures KWin only when a setting changed; the CMake guard
  matches the filled-in tags. Left, as known limits: the colour buttons, Reset and clearing a
  key have no automated test (by hand); a holder's other key sequences are matched by their
  first key only; `refresh()` asks KWin over D-Bus synchronously; and like any compiled piece,
  the page may need `make kcm-install` again after a Qt or KF6 update.

## Facts this rests on (KWin 6.7.5, KF6 6.31; read in the source unless marked)

1. **A script's form is QtWidgets only.** `src/kcms/common/genericscriptedconfig.cpp` loads
   `contents/ui/config.ui` with `QUiLoader`; there is no QML route for a script.
2. **The cog opens whatever `X-KDE-ConfigModule` names.** KWin Scripts' `Module::configure`
   (`src/kcms/scripts/module.cpp:83`) puts that plugin in a `KCMultiDialog`. KPluginModel's
   `findConfig` (kcmutils `src/core/kpluginmodel.cpp:42`) resolves it with `QPluginLoader`, and
   `PluginDelegate.qml:56` hides the cog when that metadata is invalid. Whether a plugin that
   isn't installed gives invalid metadata is not proven (*review*); decision A doesn't depend on it.
3. **A script's keys go to KWin's component.** `registerShortcut` files every action under
   `kwin`, which is why they sit in KWin's list. A script can't choose another component.
4. **A System Settings page is a `KQuickConfigModule` plugin** (a C++ factory plus QML), in the
   plugin namespace `plasma/kcms/systemsettings`, with
   `"X-KDE-System-Settings-Parent-Category": "windowmanagement"` (as `kcm_kwin_scripts`, weight
   50). It is built with KF6KCMUtils (`kcmutils_add_qml_kcm`, `KF6KCMUtilsMacros.cmake:159`:
   `<target>.json` beside the CMakeLists, `ui/main.qml`): **`kf6-kcmutils-devel` and
   `kf6-ki18n-devel` are not installed** here (*review*). It links no KWin library, so unlike the
   three plugins **a KWin update doesn't refuse it**.
5. **Keys can be edited from outside KWin.** `org.kde.kglobalaccel.Component.allShortcutInfos`
   on `/component/kwin` lists kwin-i3's actions with their current and default keys (only while
   the script is loaded: its actions exist then), and `org.kde.KGlobalAccel.setForeignShortcutKeys`
   changes them with no conflict check (`kglobalacceld.cpp:541`); both are used by
   `make take-keys` (`docs/records/spec-taken-keys.md`). QML's `KeySequenceItem`
   (`org.kde.kquickcontrols`, installed) records a key. Its own conflict check is **not** usable
   here (*review*): on a clash it opens a modal dialog and, on Continue, removes the key from the
   other holders at once (`KGlobalAccel::stealShortcutSystemwide`), before Apply and beyond
   Reset, and never gives the key to the action being edited. So the page turns it off
   (`checkForConflictsAgainst: ShortcutType.None`) and does its own (below).
7. **`main.xml` is not a valid `.kcfg` as it stands** (*review*: `kconfig_compiler_kf6` stops at
   "Group without name"): KWin wants `<kcfgfile name=""/>` and `<group name="">` empty, and fills
   them in. With `kwinrc` and `Script-kwin-i3` filled in, it compiles. So the build makes that
   copy; `main.xml` itself stays as KWin reads it.
8. **Two reconfigures are one.** The page's `reconfigure` and the helper plugin's watcher
   (`plugin/settingswatch.cpp`, 100 ms debounce) both go through KWin's coalescing 200 ms timer,
   so one Apply should give one reload (*review*; tested below, not assumed).
6. **System Settings doesn't see KWin's `QT_PLUGIN_PATH`.** `tools/plugin-install.sh` puts the
   plugins in `~/.local/lib/kwin-i3/qt6plugins`, and a systemd drop-in gives that path to KWin's
   unit only. System Settings is a separate process, so the page needs its own route (B).

## The page (`kcm/`, `kcm_kwin_i3`)

Its own directory and CMake project, apart from `plugin/`: it needs KF6KCMUtils, Kirigami and
QtDBus, and **not** kwin-devel. `make kcm` builds it and `make kcm-install` installs it.

**Layout**, as Plasma's own pages: `Kirigami.FormLayout`, a centred column, labels right-aligned,
section headings instead of boxes, and the "Defaults", "Reset" and "Apply" buttons along the bottom.

- **Top:** an inline message when the script isn't enabled ("kwin-i3 is not running", with an
  **Enable** button that sets `kwinrc [Plugins] kwin-i3Enabled=true` and asks KWin to
  reconfigure; `Workspace::configChanged` starts newly enabled scripts, `scripting.cpp:683`),
  and when the plugins aren't loaded ("Frame and atomic layout need the kwin-i3 plugins", with a
  link to the README). The page asks KWin which are loaded over D-Bus, by id prefix since the
  installed ids carry a hash (*review*; the interface, `/Effects` and the plugin list, to probe).
- **Layout:** inner and outer gaps, default orientation, resize step, focus wrapping.
- **Workspaces:** the monitor for each workspace (today's `1=DP-4, 2=DP-6` text, with
  "Connected now: DP-4, DP-6" under it; a monitor that is unplugged isn't listed, said so).
- **Window rules:** the four lists.
- **Frame:** width, and the four colours as colour buttons (`ColorButton` from
  `org.kde.kquickcontrols`), disabled with a note when the plugins aren't installed.
- **Atomic layout:** on/off and the timeout, as Frame.
- **Advanced:** `warnTakenKeys`, `debugLog`.
- **Keys…**, a button that opens a sub-page (as Plasma pages open sub-pages). Described next.

### The Keys sub-page

- **Rows are commands, not actions.** kwin-i3 registers one action per key (`src/kwin.js`
  `registerKeys`: "Focus Left" and "Focus Left (J)", "Move to Workspace 1" and its "(symbol)"
  twin), so a row is one command with its one to three key slots, as the README's Keys table
  shows them. The rows, their order, groups (focus, move, resize, layout, workspaces, safety)
  and readable labels come from a table in the page, checked in `make test` against
  `tests/keys.json` and the workspace actions so a key added to the script can't be missing
  from the page. The self-test actions aren't listed.
- **Clashes are shown, not prompted.** On a recorded key, the page asks kglobalaccel who holds it
  (`KGlobalAccel.action`, as the taken-keys check does) and shows it in the row: "Meta+E is used
  by Dolphin (Launch); it will be taken from it on Apply." No modal dialog. A holder that isn't
  running is taken from too: the user chose this key, and that app would block it once it starts
  (unlike `make take-keys`, which skips inactive holders because it acts on defaults nobody chose).
- **Keys apply with Apply**, like the settings, so Reset and Defaults cover them: Apply first
  takes each clashing key from its holder (`setForeignShortcutKeys`, the holder's other keys
  kept), then writes kwin-i3's action. What it took is recorded in
  `~/.local/state/kwin-i3/taken-keys.json`, in the same format `make take-keys` uses, so
  `make restore-keys` gives it back. Defaults sets every row to `tests/keys.json`'s keys.
  `needsSave` and `representsDefaults` come from both the settings and the keys (the page
  overrides them; `KQuickManagedConfigModule` only knows the settings).
- **When the script isn't loaded**, its actions don't exist (fact 5): the sub-page shows the "not
  running" message with Enable, and no rows.
- No search field (*review*: about forty rows in groups don't need one).

**Settings** are read from and written to `kwinrc [Script-kwin-i3]` through a KConfigXT class
generated at build time from a copy of `package/contents/config/main.xml` (fact 7), so the page
and the script can't drift apart. Defaults then Apply removes a default-valued entry from the
file rather than writing it (KConfigSkeleton), which the script reads as the default.
**Apply** writes the file, then calls KWin's `reconfigure`. As with Meta+Shift+C, that reaches the
script and the plugins (`docs/records/spec-settings.md`, "Applying a change"). **So Apply takes effect
on the page, with or without the plugins**, which closes the gap left in OPEN.md item 2 for
anyone using the page.

**Accessibility** comes with Kirigami: every control is reachable by keyboard; each field's
`FormData.label` is its accessible name for a screen reader; it follows the system's font size,
colours and high-contrast scheme. Checked in the test (below), not assumed.

## The tidied form (`package/contents/ui/config.ui`)

It stays plain Qt widgets, with no designer plugins (`docs/records/spec-settings.md`, "The form"). It
looks as close to the page as widgets allow: no group boxes; one `QFormLayout` per section with
labels right-aligned, centred between spacers; bold section headings with a line under each; the
same section order and wording as the page; and shorter tooltips. Its top line says how to apply
(Meta+Shift+C, as now), plus "kwin-i3's own page in System Settings > Window Management also edits
its keys" when the page is installed. A widgets form can't check for that, so the line says it as a
fact about the page's existence, not about this install.

## Decisions for Paul

- **A. What the cog opens.** *Recommended:* the tidied form, as now. It works on every install,
  and the page is the System Settings entry. Pointing the cog at the page instead would mean that an
  install without `make kcm` loses the cog altogether (fact 2).
- **B. Where the page is installed.** *Recommended:* the same user directory as the plugins, plus
  `~/.config/environment.d/kwin-i3.conf` adding it to `QT_PLUGIN_PATH` for the whole session (takes
  effect at the next login, once; no sudo). The alternative is a system install to `/usr/lib64/qt6/plugins`
  with sudo: found at once with no login needed, but it writes outside the home directory and the
  package manager doesn't know about it. System Settings' list honours `QT_PLUGIN_PATH`
  (`kcmmetadatahelpers.h:114`, `KPluginMetaData::findPlugins`; *review*). With the path set for
  the whole session, the KWin-only drop-in `plugin-install.sh` writes is redundant; it stays
  for installs without the page. Install details (*review*): the `.so` is replaced by renaming a
  new file over it (System Settings may have the old one mapped; the id is the file name, so
  the plugins' hash suffix can't be used), and the `.desktop` file `kcmutils_add_qml_kcm`
  generates goes to `~/.local/share/applications`.
- **C. Name and icon.** *Recommended:* "kwin-i3" with the description "i3's window tree,
  workspaces and keys", and Plasma's tiling icon (`window-tile` or nearest).

## Tests (each watched red against a deliberate fault)

The page runs in the **test KWin**, never on Paul's desktop: `kcmshell6 kcm_kwin_i3` as a Wayland
client of the headless KWin, on its bus, driven by injected input (`tools/inject.py`) and checked
with `tools/shot.py`.

- **Settings round trip:** for each key in `main.xml`, set it on the page, press Apply, and check
  that `kwinrc` holds it and the script's log shows exactly one reload (fact 8) with no
  `UNTILE`; Defaults then Apply leaves no kwin-i3 entry in the file (absent = default).
- **Apply takes effect:** with the plugins *not* loaded, a gaps change on the page shows in the
  pixels after Apply, with no Meta+Shift+C.
- **Keys:** rebind one command on the Keys sub-page and Apply; the new key fires kwin-i3's action
  and the old one doesn't. Record a key that a stand-in component holds (as `35-taken-keys.sh`):
  the row names the holder, nothing changes before Apply, Reset leaves the stand-in untouched;
  after Apply the key fires kwin-i3's action, the stand-in keeps its other key, and
  `make restore-keys` gives the key back. Defaults then Apply restores `tests/keys.json`.
  If injected keys can't be recorded in the page (a shortcut-inhibit question in the test KWin,
  *review*), the key is set in the item by its property instead, and the recording is checked by
  hand once.
- **The table:** every action the script registers (`tests/keys.json` plus the workspace
  actions) has a row, in `make test`.
- **Not running / no plugins:** with the script disabled, the message shows on both pages, and
  Enable loads it; without the plugins, Frame and Atomic layout are disabled.
- **Keyboard only:** Tab from the top reaches every control, checked on screenshots (each Tab
  moves the focus ring to the next control, by pixels). A screen-reader check through AT-SPI is
  out (*review*: over-scoped for now).
- **The form:** `config.ui` and `main.xml` still agree key for key (the existing parse check), and
  the generic KCM loads it (by hand once with Paul if it can't be run headless).
- **Build:** `make kcm` in `make test` when KF6KCMUtils is installed; skipped and said so when not,
  as the plugins are.

## Docs

The README's install section gains `make kcm` / `kcm-install` beside `plugin-install`; its
Configuration section points to the page first; the Keys table says keys are edited on the page.
`docs/plan.md` Scope gains the page.
