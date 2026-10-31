# Style guide: kwin-i3's settings page

How the System Settings page (`kcm/ui/`) and the cog's form (`package/contents/ui/config.ui`)
look, read and behave. A change to either follows this; a rule that needs changing is changed
here first, with Paul's go. Gathered 2026-10-26 from the sessions that built and reworked the
page (2026-10-24 to 26), `docs/records/spec-settings-page.md`, `docs/records/spec-settings-cleanup.md` and the
code as it stands.

**Where it comes from.** Paul gave few style rules of his own (the ones he did are marked
*Paul*); most of what follows is KDE's Human Interface Guidelines (develop.kde.org/hig) and
Plasma's own pages (KWin's Virtual Desktops page, `src/kcms/desktop/ui/main.qml`), proposed and
approved with his "go with 1-5" (2026-10-25). His aim: "as clean as Plasma's other configuration
screens" (2026-10-24), "more accessible and better organized" (2026-10-25). When this guide says
nothing, do what Plasma's own pages do.

## 1. Layout

- **One `Kirigami.FormLayout`** per page: a centred column, labels right-aligned in one shared
  column, no group boxes. A sub-page with lists (Window Rules) is a centred column at most
  34 `gridUnit`s wide.
- **Sections** are an empty `Item` with `Kirigami.FormData.isSection: true` and a sentence-case
  title ("Tiling", "Window rules"). Never a section called "Advanced" (HIG: it says nothing about
  what's inside), and no section for one control that does nothing for the user (*Paul*,
  2026-10-26: the debug log checkbox went, "hide it").
- **Rows that belong together share one shape** (*Paul's screenshot*, 2026-10-26): each kind of
  window in Frame has its colours on one line and its option on the next. Don't pack a checkbox,
  its long label and other controls onto one line.
- **Compound rows** are a `RowLayout`, `spacing: Kirigami.Units.smallSpacing`, with a
  `largeSpacing` gap between groups ("[4 px] between windows   [2 px] more at the edges").
- **A checkbox with its value** sits on one row, as Virtual Desktops does: "[x] Wait for every
  window to resize, at most [100 ms]".
- **Grids are even** (*Paul's screenshot*, 2026-10-25): uniform cells, rows of equal length. A
  binding or other non-visual item never goes inside a layout, where it takes a cell.
- **Check every layout change on a screenshot** of the page before calling it done.

## 2. Wording

- **The page's words and their tone** (Paul, 2026-10-28: "friendly, cohesive and still
  descriptive"): the glossary and the eleven tone rules in `docs/records/spec-settings-words.md` §3 and §4
  (they move here when its rewrite is built). Short over explicit; the explaining goes in help.
- **Sentence case** everywhere: headings, labels, buttons, list entries ("Next workspace",
  "Move to workspace 1").
- **Field labels end in a colon** and are short ("Gaps:", "Resize step:", "Each workspace:").
  Several checkboxes go under one label, "Options:".
- **Checkboxes are imperative and positive**: "Draw the frame on floating windows too", "Round
  the corners of tiling windows"; never "When disabled, …".
- **Name a thing for what it does**, not for how it's built: "Wait for every window to resize",
  not "Atomic layout".
- **No label longer than "Configure Keyboard Shortcuts"** (HIG). A label shortened by its context
  ("focused", "others") gets the full text as its accessible name (§6).
- **A button that opens a sub-page** ends in "…" and names what it opens: "Configure
  Workspaces…", "Configure Window Rules…", "Configure Keys…".
- **Twins are told apart by their words**, not a long parenthesis: "Move back and forth
  (previous workspace)" beside "Move to the previous workspace".
- **A window is named by its i3 kind, and only these** (Paul, 2026-10-27/28; redo stage 10
  supersedes `docs/records/spec-window-words.md`, which `docs/behaviour.md` §3 now holds): **tiling**
  ("tiles", "a tiling window"), **floating** ("floats", "a floating window"), **sticky
  floating** (floating, on every workspace of its output), and where a page ever names them,
  **dock**, **root**, **override-redirect**. A rule's action is "Float" or "Tile". "Plasma" describes a look ("its own title bar, as a Plasma
  window"), never a mode. Never "places itself", "leave alone", "don't manage" or "unmanaged":
  none is true, and "not managed" sends the user looking for where it is.
- **Every string through `i18nc`** with KDE's context tag (`@label`, `@option:check`,
  `@action:button`, `@title:group`, `@item:inlistbox`); a number with a unit through `i18ncp`.

## 3. Controls

- **The control that can't be wrong** (HIG: a text field only where a validating control can't
  be used). An output is a ComboBox of the connected ones, not typed `1=DP-4`; a rule is a list
  with Pick a Window, not comma-separated text.
- **A control never accepts a value that means something else** (*Paul*, 2026-10-25: "so people
  don't feel deceived"): the gap between windows steps by 2 because an odd one would be drawn as
  the even one below.
- **Numbers show their unit** ("4 px", "100 ms", "5%"), through `UnitSpinBox`.
- **Choices show plain words, store the script's words** ("Tiling" / "Floating"; "auto" /
  "force"), through `ChoiceBox`. Up to 10 choices in a ComboBox.
- **Colours** are `ColorButton`s (`org.kde.kquickcontrols`).

## 4. Sub-pages

- **Rarely needed or long settings go behind a sub-page named for what it holds** (HIG,
  progressive disclosure), opened by a button that pushes it (`kcm.push`).
- **A sub-page button shows a one-line summary** beside it in grey ("2 on a set output, 1
  floating"), through `SubPageButton`; a screen reader reads it as the button's
  description.
- **One row per item** with its settings side by side (Workspaces: output and new windows per
  workspace). Each row's controls name their row (§6).
- **Defaults are shown, not hidden**: the window rules Plasma ships are listed like any other,
  marked "default", so Defaults visibly restores them.

## 5. Explanations, messages, disabled state

- **No paragraphs in the form and no label-only rows.** An explanation goes in a
  `Kirigami.ContextualHelpButton` beside its control, or in the control's
  `Accessible.description`. The main page has no tooltips.
- **State goes in inline messages in the page header** (`Kirigami.InlineMessage`,
  `Position.Header`): kwin-i3 off (with Turn On), on but not running, the plugins not loaded
  (one message for all the controls they govern). A sub-page's transient result (Pick a Window)
  is an inline message too, its type saying how it went.
- **Disabled, not hidden.** A control that can't apply (no plugins, its checkbox off) stays
  visible and greyed: `KCM.SettingStateBinding` with `extraEnabledConditions`, and its side
  labels greyed with it by the same condition. The one exception is a note that only applies
  in one state (the "bare" tiling look's note), shown only then.

## 6. Accessibility

- **Every control has a name of its own, distinct in its window.** Through its form label
  (Kirigami gives it as labelled-by), else an `Accessible.name` in full: "Frame colour of the
  focused tiling window", "Workspace 3 output", "Focus left, key 2: Meta+J".
- **Visual-only side labels** ("focused", "others", "between windows") are `Accessible.ignored`,
  the control carrying the full name.
- **No empty headings**: Kirigami makes a heading for every row's label, so a row with no label
  that isn't a control (a bare note) adds one; don't make such rows.
- **Keyboard**: Tab reaches every control in reading order; sub-page rows by Tab, their buttons by
  Space. Follows the system's font size, colours and high-contrast scheme (Kirigami, not
  hard-coded colours or sizes).

## 7. The Keys sub-page

- **Rows are commands, not actions**: one row per command with its one to three key slots, in
  groups, in `kcm/ui/commands.json`; every action the script registers has a row
  (`tests/unit/kcm.test.js`). An action with no default key gets a row with an empty slot.
- **A command's label** is sentence case and says what it does from the user's side ("Next
  workspace on this output", "Move to workspace 3"); it goes in the group for what it acts on
  (focus, move, workspaces, move to workspace, outputs, …), next to its twin form (a go-to's
  move form in "Move to workspace", in the same order).
- **A command's label fits the label column**: about 40 characters at the default font, or it is
  cut off with "…" (2026-10-26: seven rows were). Checked on a screenshot of the group.
- **A shifted symbol is named by its keys** beside its button, in muted text: "Meta+! →
  Meta+Shift+1" (`docs/records/spec-keys-shifted-labels.md`).
- **Clashes are shown in the row, never prompted**: "Meta+E is used by Dolphin (Launch); it will
  be taken from it on Apply." No modal dialog.
- **Keys apply with Apply**, so Reset and Defaults cover them like any setting.
- **A setting that shapes a command** sits in its row as a dropdown beside its label, inside the
  label column, the label then ending in a colon ("End session: [Log out]"), so the keys stay in
  their column and the page no wider (Paul, 2026-10-31). The dropdown as wide as its widest
  choice, with an accessible name of its own ("End session: what its key does"); its
  explanation in the accessible description.

## 8. The cog's form (`config.ui`)

Plain Qt widgets, no sub-pages: it works with no compiled page installed. It takes the page's
section order and wording, one `QFormLayout` per section with labels right-aligned, bold
headings with a line under each, no group boxes, and a short tooltip on every control (the one
place tooltips carry the explanations). Where the page has a sub-page, the form keeps its typed
field.

## 9. Checking a change

A screenshot of each page changed, read before it's called done; `37-settings-page` and
`76-settings-subpages` for a change they drive (`docs/testing.md`). The page in the test KWin
has no plugins, so its frame section is all greyed; the full look is Paul's pass at the end of
the Stage (`LATER.md`, "The settings page").
