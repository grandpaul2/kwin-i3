# Spec: the settings page, reorganized and made accessible

Requested by Paul, 2026-10-25: the page (`kcm/ui/main.qml`, `docs/spec-settings-page.md`) "a bit
more accessible and better organized", the cleanup being general rather than a list of his own.
Status: **decisions 1-5 approved by Paul (2026-10-25), built**; see "As built" at the end.

## What it rests on

- **KDE's Human Interface Guidelines** (develop.kde.org/hig, read from its source,
  `documentation/develop-kde-org` `content/hig/`, 2026-10-25). The parts that apply here:
  - Sentence case for labels in front of controls, and imperative, positive wording for checkboxes
    ("Allow the system to sleep", not "When disabled, prevent…"); no label longer than "Configure
    Keyboard Shortcuts".
  - No page or section called "Advanced": the word says nothing about what's inside. Rarely needed
    settings go behind a sub-page *named for what it holds* (progressive disclosure).
  - Text fields only where a validating control can't be used; up to 10 choices in a ComboBox.
  - Long explanations in a `Kirigami.ContextualHelpButton`, not paragraphs in the form.
  - Every control says something distinct to a screen reader, tooltips included (`Accessible`);
    no name used twice in one window. A label shortened by its context gets the full text as
    `Accessible.name`.
  - Numbers with units through `i18ncp` (plurals), and `i18nc` contexts for translators.
- **Plasma's own pages** (KWin 6.7.5 `src/kcms/desktop/ui/main.qml`, the Virtual Desktops page):
  several checkboxes under one label ("Options:"), a checkbox with its value beside it on one row
  ("Show on-screen display when switching: [1000 ms]"), inline messages for state, `%1 ms`.
- **What a screen reader gets today**, measured, not assumed: the page run in the test KWin with
  its own AT-SPI bus and the accessibility tree dumped (`QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`,
  python3-gobject's `Atspi`). Every field gets its form label as a labelled-by relation
  (Kirigami's FormLayout does it). What it shows wrong:
  1. The four colour buttons are all named **"Color button"** (their own name, which a screen reader
     prefers over the label), described only by "Current color is #4c7899."
  2. The ten Plasma-windows checkboxes are named **"1" … "10"**, with no label at all: the form
     label belongs to the grid around them.
  3. The four notes ("Comma-separated…", "Connected now…", the plugins notes, the Plasma windows
     explanation) are **rows of their own**: not attached to the field they explain, and each adds
     an empty heading to the form (Kirigami makes a heading for every row's label, empty or not).
  4. Plain text fields for structured data: `1=DP-4, 2=DP-6`, and the window-rule lists, which
     arrive pre-filled with 13 of Plasma's own window classes in one long line.
- **KWin can pick a window for a page**: `org.kde.KWin.queryWindowInfo` (`dbusinterface.cpp:157`,
  what Window Rules' "Detect Window Properties" calls) lets the user click a window and returns
  its `resourceClass`, `resourceName`, `role` and `caption`, the fields `src/rules.js` matches.

## The new page

Four sections and two new sub-pages. Every setting stays, under the same `kwinrc` key, so nothing
in the script or `main.xml` changes.

**Header** (inline messages, as now): kwin-i3 turned off (Turn On); turned on but not running.
New: **one** information message when the plugins aren't loaded, replacing the two notes in the
form: "The frame and waiting for resizes need kwin-i3's plugins." The controls they govern stay
visible and disabled.

**Tiling**
- *Gaps:* `[0 px] between windows`, `[0 px] more at screen edges`: two spin boxes on one row,
  each with its own accessible name ("Gap between windows", "Extra gap at screen edges").
- *New workspaces split:* the ComboBox, as now.
- *Resize step:* as now.
- *Focus at an edge:* as now.
- *Layout changes:* `[x] Wait for every window to resize, at most [100 ms]`: today's "Atomic
  layout" section (`holdEnabled`, `holdTimeoutMs`), named for what it does, as one row the way
  Virtual Desktops does its on-screen display. A help button: "Shows a new layout all at once
  instead of window by window. Needs kwin-i3's plugins."

**Workspaces**
- *Options:* `[x] Pressing the current workspace's key returns to the previous one`
  (`workspaceAutoBackAndForth`).
- *Each workspace:* `Configure Workspaces…`, a sub-page, with a summary line beside it
  ("2 on a set monitor, 1 for Plasma windows", or "All tiled, on any monitor").

**The Workspaces sub-page**: one row per workspace, 1-10, the two per-workspace settings side by
side:

    Workspace   Monitor                   New windows
    1           [Any monitor        v]    [Tiled           v]
    2           [DP-4               v]    [Tiled           v]
    3           [Any monitor        v]    [Plasma windows  v]

- *Monitor* (`workspaceOutputs`): "Any monitor" (unset), then each connected monitor by name and
  model ("DP-4 — DELL U2723QE"), then one already set but not connected now, kept and shown as
  "DP-6 (not connected)". Replaces typed `1=DP-4` text, which could be mistyped.
- *New windows* (`floatingWorkspaces`): "Tiled" or "Plasma windows". Replaces the ten unnamed
  checkboxes. A help button carries today's explanation (Meta+Shift+Space tiles one; a window keeps
  its mode when it moves).
- Each control's accessible name says its workspace: "Workspace 3 monitor", "Workspace 3 new
  windows".

**Frame** (disabled, with the header message, without the plugins)
- *Width:* as now.
- *Tiled windows:* `focused [■]  others [■]`: two colour buttons on one row.
- *Floating windows:* `[x] Frame floating windows too`, and on the next row
  `focused [■]  others [■]`, enabled with the checkbox.
- Each colour button named in full: "Frame colour for the focused tiled window", and so on.

**Windows kwin-i3 leaves alone or floats**: `Configure Window Rules…`, a sub-page, with a summary
("13 left alone, none floated").

**The Window Rules sub-page**: two lists, *Leave alone* (`ignoreClass`, `ignoreRole`) and *Always
float* (`floatingClass`, `floatingTitle`).
- Each entry shows what it matches: "Application: krunner", "Role: quake", "Title contains:
  Picture-in-Picture". Removable with a button on the row.
- *Add* under each list: **Pick a Window…** (`queryWindowInfo`: the user clicks a window and its
  application class is added; the page says which), or a typed entry with its kind chosen
  (application, role, or title text for *Always float*). No commas to get right.
- Plasma's own windows (the 13 defaults: krunner, plasmashell…) are listed like any other, marked
  "default", so Defaults visibly restores them.

**Keys**
- *Shortcuts:* `Configure Keys…`, as now.
- *Options:* `[x] Warn at login about keys other shortcuts already use` (`warnTakenKeys`).

**Troubleshooting**: removed 2026-10-25 (Paul). Its one control, *Debug log* (`debugLog`), does
nothing on a desktop; the log is always kept in memory for captures (`docs/debugging.md`).

### Wording (HIG: sentence case, imperative, positive)

| now | new |
|---|---|
| Back and forth: The key for the workspace you are on goes back to the previous one | Options: Pressing the current workspace's key returns to the previous one |
| Floating windows: Frame them too (else they keep their own title bar) | Floating windows: Frame floating windows too |
| Atomic layout: Show a new layout once every window has its new size | Layout changes: Wait for every window to resize, at most … |
| Taken keys: Say at login which of kwin-i3's keys other shortcuts hold | Options: Warn at login about keys other shortcuts already use |
| Never manage classes / roles, Float classes / titles containing | the Window Rules sub-page's two lists |
| Keys and more | Keys; Troubleshooting |

Units through `i18ncp` ("1 pixel" / "%1 px" as the translation needs); every string gets an
`i18nc` context (`@label:spinbox`, `@option:check`, …) as Plasma's pages do.

### Accessibility, made checkable

- No label-only rows: notes become help buttons or the field's `Accessible.description`.
- Every control has a distinct name of its own or through its label; colour buttons and per-row
  controls get full `Accessible.name`s.
- Keyboard: Tab reaches every control in reading order; the sub-pages' rows are reachable by Tab
  and their buttons by Space.
- The Keys sub-page is checked the same way (its key buttons are already named "Focus Left: key 1").

## Tests (each watched red against a deliberate fault)

- **New: an accessibility check of every page** (`tests/live/`, AT-SPI, a bus of the test's own):
  every focusable control has a non-empty name, its own or through labelled-by; no two share
  one; no empty headings; a full Tab walk reaches every control once. **It fails on today's page**
  (findings 1-3 above), which is its first red.
- **37-settings-page driven by name, not coordinates**: it clicks at fixed pixel positions, and
  this relayout moves everything. It would find each control through AT-SPI by its accessible name
  and click the centre of its on-screen box, so the next layout change doesn't break it, and a
  control it can't find by name is an accessibility failure too.
- The Workspaces sub-page: setting a monitor and Plasma windows, Apply, `kwinrc` holds
  `workspaceOutputs=2=Virtual-1` and `floatingWorkspaces=3`; a monitor set but not connected is
  kept through an Apply.
- The Window Rules sub-page: Pick a Window on a test client adds its class; Apply; the next such
  window is left alone. Removing a default and pressing Defaults brings it back.
- Unit: the summaries and the parsing of today's strings into rows and back (`kcm.test.js`).

## Out of scope

- The script's own Configure form (the cog, `package/contents/ui/config.ui`): plain Qt widgets, no
  sub-pages. It takes the new wording and section order only (decision 4).
- The workspace widget's settings.
- The README pass (`OPEN.md` item 4), which will describe the page as it ends up.

## Decisions for Paul

1. **The Workspaces sub-page**, merging monitors and Plasma windows per workspace. *Recommended.*
   The alternative keeps both on the main page: ten monitor ComboBoxes there make it longer than
   now.
2. **The Window Rules sub-page** with Pick a Window. *Recommended.* Defaults shown in the list and
   marked; the alternative hides Plasma's own behind "Show Plasma's own windows", tidier, but then
   removing one is hidden too.
3. **"Wait for every window to resize"** in Tiling, in place of the "Atomic layout" section.
   *Recommended.*
4. **The cog's form follows the wording and order** but not the sub-pages. *Recommended*: it
   keeps working with no compiled page installed.
5. **The accessibility check and 37 driven by name.** *Recommended*: the relayout breaks 37's
   coordinates anyway, and the check keeps the page accessible after this.

Cost: the page and two sub-pages in QML, the summaries and parsing in a small JS file with unit
tests, the AT-SPI helper for the tests, and 37 rewritten. A second agent reviews the result before
it goes live.

## As built (2026-10-25)

- `kcm/ui/main.qml` (sections Tiling, Workspaces, Frame, Window rules, Keys and
  Troubleshooting), `Workspaces.qml`, `WindowRules.qml`; the string handling in `kcm/ui/settings.js`
  (`tests/unit/kcm-settings.test.js`, main.xml's real defaults included). `kcm.cpp` gained
  `defaultValue(key)` (default entries are marked) and `pickWindow()` (`queryWindowInfo`, no
  D-Bus timeout: the user takes as long as they like to click).
- **The audit's first red, on the old page**: four controls named "Color button", ten check boxes
  named "1"-"10", five empty headings; on the Keys sub-page, 72 buttons named "Clear Key Sequence"
  and 19 named " None ". The last two are KDE's `KeySequenceItem` naming its inner buttons by key;
  `Keys.qml` names them per command and slot ("Focus left, key 2: Meta+J", "Clear Focus left,
  key 2") by reaching its three child buttons, guarded (a warning and KDE's names if the structure
  changes). The proper fix is upstream (deferred with the rest of upstream work).
- `tools/a11y.py` and `a11y_start` (`tests/live/lib.sh`): an AT-SPI bus of the test's own, in the
  test's runtime directory (a first probe put one in the live `$XDG_RUNTIME_DIR/at-spi/` beside
  the session's; nothing broke, and the leftover socket was removed). Learned on the way: Qt marks
  a control scrolled out of view as not visible, so the tool scrolls the page through its scroll
  bar's value and counts what is visible at any point; a list view deletes rows it scrolls past,
  so each control is recorded when first seen; Qt shows a window's tree twice (deduplicated by
  object path); a combo box's own name is its current choice, its label coming through
  labelled-by.
- Tests: **75-settings-a11y** (audit and Tab walk of the main page and both new sub-pages, audit
  of Keys, and the Keys buttons' names; passed, then removed from `make test` by Paul's call,
  light tests in development: OPEN.md item 18), **37-settings-page** clicking by name (its pixel checks
  stay on the header and the unchanged Keys rows), **76-settings-subpages** (monitors and Plasma
  windows to kwinrc with an unconnected monitor kept; Pick a Window on a test client, Apply, a new
  window of that class left alone; a default removed and brought back by Defaults).
- In 76, an open combo box's list didn't take arrow keys from injected input, so the test steps a
  closed combo box with Down. Whether a real keyboard has the same trouble is to be checked by hand.
- The cog's form (`config.ui`): the page's order and wording; the "Atomic layout" and "Advanced"
  headings are gone (Keys and Troubleshooting instead).
- Known limits (second agent's review, 2026-10-25, not acted on: light tests in development):
  after Remove on Window Rules the keyboard focus goes back to the page's start (the rows are
  rebuilt from the settings); 76's Pick a Window waits a fixed second for KWin's selection to
  start; an open combo box's list and arrow keys untested by hand.
