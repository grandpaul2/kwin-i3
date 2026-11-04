# Style suggestions: kwin-i3's settings pages

How the System Settings page (`kcm/ui/`) and the cog's form (`package/contents/ui/config.ui`)
look and read. **These are suggestions, just enough to set a page up**: the maintainer gives each
page its look on the live page, and that look is final. Where a live page and this file differ,
the page wins and this file is brought in line. No set of rules makes a page feel right, so a
change is built from these suggestions, checked on a screenshot, and handed over; it is not
polished by more rules, reviews or test readers. When this guide says nothing, do what Plasma's
own pages do (Virtual Desktops, Window Behavior, Display Configuration, Window Rules): open the
Plasma page and match it. The finished tabs are the best example: Tiling, Gaps, Mouse & Focus,
Workspaces, Window Rules, Frame, Keys and Plasma.

## Layout

- **A form page is one `Kirigami.FormLayout`** (Tiling, Gaps, Mouse & Focus, Workspaces, Frame): a centred
  column with the labels right-aligned in one column, and no group boxes. Sections are headings in
  sentence case ("Tiling", "Frame"). There is never an "Advanced" section. A page of items that a
  `Repeater` makes in another shape (Window Rules, Plasma Settings) is a centred `ColumnLayout` at
  most 34 grid units wide instead, since a FormLayout re-sorts a Repeater's rows.
- **One label and one control a row.** Two values are two rows, each with its own label ("Gap
  between windows:", "Extra gap at edges:"). Never put captions, a second control or an icon that
  comes and goes on the same line. A control's help button sits after it, in a `RowLayout` with
  `spacing: Kirigami.Units.smallSpacing`.
- **The same few values for each of a set** (each workspace's screens, each screen edge's gap)
  are one row per member, labelled by it ("Workspace 3:"), with **column headings** above the
  boxes: a level-5 `Kirigami.Heading` in sentence case ("Screen", "Else", "New windows"), each as
  wide as the box under it. The boxes then hold plain values ("8 px", "same", "Tile", a screen's
  name), with no words before or after them. Where a heading is longer than its box, the column
  widens and the columns move apart (a grid unit between them) until the headings read apart.
- **A list the reader adds to** (Window Rules) is a framed list: the View colours, a border of
  `Kirigami.ColorUtils.linearInterpolation(background, text, Kirigami.Theme.frameContrast)`,
  rounded by `Kirigami.Units.cornerRadius`, a `Kirigami.Separator` between items. Every item has
  the same shape: no line that shows only when it is set, no toggle that opens more. Groups (the
  shipped items, the reader's) are a list each under a heading. Adding sits in the page's footer
  (a `QQC2.ToolBar`, right-aligned), in view at any scroll; a new item scrolls into view with its
  first field focused. An empty list says so in a `Kirigami.PlaceholderMessage` with the add
  action in it.
- **Two columns of checkboxes** (Plasma Settings) have their column titles as level-5 headings
  over the boxes, and each box is centred on its row's first line (the name and its help button),
  not on the row's top.
- **A straight right edge.** A section's dropdowns share the width of its widest choice. Every
  spin box has one compact width. A colour is a bar as wide as its section's dropdowns, Default
  button included. Wide reads better than narrow.
- **Disabled, not hidden.** A control that can't apply (no plugins, its checkbox off, already
  right) stays on the page, greyed. A page whose rows come and go can't be learned.
- **A way back from a slip.** Every edit waits for Apply. Reset drops every edit; Defaults
  resets the tab shown (`docs/philosophy.md`, "How it presents itself"). A row where a slip is easy and hard to undo by hand (a colour) also gets a Default
  button of its own, greyed at the default.
- **The page is tabs**, as Plasma's Window Behavior: Tiling, Gaps, Mouse & Focus, Workspaces,
  Window Rules, Frame, Keys, Plasma, in Window Behavior's tab bar (flat, as wide as the page, drawn
  to Breeze's document-mode recipe, `kcm/ui/main.qml`), each a page of its own file under the banners and the tab bar. A tab
  may open with one line saying what it is for, in its header, with its help button at its end.
- **No paragraphs on the page.** An explanation goes in a `Kirigami.ContextualHelpButton`
  beside its control. A state goes in a banner at the top (`Kirigami.InlineMessage`): kwin-i3
  off, not running, the plugins not loaded.

## Words

- **Sentence case** everywhere. A field label is short and ends in a colon ("Resize step:").
- **A checkbox on a form tab** has its name as the row's label, on the left as the other rows,
  and says "(recommended)" or "(optional)" beside the box; the full name is its screen reader
  name. Recommended: a box whose off state breaks part of how kwin-i3 works or feels.
- **A checkbox's name says what is true when it's ticked**, positively: "Round the corners of tiling
  windows", never "Disable…" or "When unticked…".
- **Name what a setting does**, not how it is built: "Show layout changes all at once", not
  "Atomic layout".
- **A window is named by its i3 kind**: tiling, floating, sticky (floating on every workspace of
  its screen), and where needed dock, override-redirect, the root window. Never "unmanaged",
  "places itself" or "leave alone": none is true.
- **No "you", "your", "now" or "please"**, and no "kwin-i3" in a control's own text (a banner may
  name it).
- **Help is one or two sentences** saying what the setting does, then i3's directive in code
  ("i3: `focus_wrapping`").
- **The glossary's words** (below), one word per thing. A new word joins the glossary first.
- **Every string goes through `i18nc`** with KDE's context tag, and a number with a unit through
  `i18ncp`.

## Saying what to pick

- **What is recommended is marked on the control**: a checkbox's "(recommended)" (above), the
  Plasma tab's kwin-i3 column. Defaults is the default, not the recommendation: on a kwin-i3 tab
  i3's default where i3 has one, else kwin-i3's own; on the Plasma tab, Plasma's own values back.
- **Where the page changes Plasma's own settings** (the Plasma tab), the choice is
  marked: two columns, "Plasma" and "kwin-i3 (recommended)", with one box ticked a row. The kwin-i3
  box says "Enable" in small text. The Plasma box says nothing, because the page doesn't claim to
  know Plasma's value. One muted line under each name says what the Plasma column means for it:
  "Plasma: " and the value in the words of Plasma's own settings ("Plasma: Click to focus"), never
  what the setting does. That, and where Plasma keeps it, goes in its help. The user makes every change, through the page's Apply.

## Controls

- **The control that can't be wrong**: choose from a list rather than type an identifier (a
  screen from the connected ones, an application from the installed ones, Pick a Window for a
  rule). i3's patterns sit behind a button, for those who want them.
- **A control never takes a value that means something else**: the gap between windows steps by
  2, because an odd one would be drawn as the even one below.
- **Numbers show their unit** ("4 px", "100 ms"). Choices show plain words and store the
  script's. Colours are `ColorButton`s.

## Accessibility

- **Every control has a name of its own** through its form label, else an `Accessible.name`
  in full, its row and its column together ("Workspace 3 screen", "Workspace 2 gap between
  windows"); a main-page checkbox's is its full name. Side labels that only repeat it are `Accessible.ignored`.
- **Tab reaches every control in reading order.** Fonts, colours and contrast come from
  Kirigami, never hard-coded.

## The Keys tab

- **One row per command**, with one to three key slots, in groups for what it acts on
  (`kcm/ui/commands.json`). Every action the script registers has a row, and an action with no
  default key has an empty slot.
- **A command's label** says what it does from the user's side and fits the label column (about
  40 characters).
- **A key another shortcut also holds is set like any other**, with no note: which of the two
  runs is the key override's (the Plasma tab), never asked per key.
- A setting that shapes a command (End session) is a dropdown in that command's row.

## The cog's form (`config.ui`)

Plain Qt widgets that work with no compiled page installed. It follows the page's sections and
wording, one `QFormLayout` a section, with a short tooltip on every control. Where a tab has a
list (rules, each workspace's screens), the form keeps a typed field. Its Defaults is KWin's,
over the whole form, which a script can't scope: its first line points to the System Settings
page.

## Checking a change

Take a screenshot of each page the change touches, in each state it can be in (plugins loaded
or not, a setting already right). Read it yourself, then hand it over. Scenarios `37` and `76`
cover changes they drive (`docs/testing.md`). The test KWin has no plugins, so its Frame
section is all greyed.

## The glossary

| thing | i3 | the page's word | why |
|---|---|---|---|
| a monitor | output | **screen** | Plasma's word; help names i3's directive. The docs keep "output" |
| a workspace's next screen | `workspace N output A B` | **Else** (the column), **None** | the first connected one is used |
| window kinds | tiling, floating | **tiling, floating**; actions **Tile, Float** | i3's kinds |
| on every workspace | sticky | **sticky** | i3's word; Plasma's "all desktops" would be untrue (one screen only) |
| the window's border | border | **frame** | Plasma's word; "border" is a decoration's size in Plasma |
| where the next window opens | indicator | **split indicator** | |
| focus classes | focused, unfocused | **Focused frame, Unfocused frame** | i3's classes |
| the two gaps | inner, outer | **between windows, extra at edges** | i3's outer is added to inner; "extra" says so |
| split direction | splith, splitv | **side by side, top to bottom** | "horizontal" is read both ways |
| previous workspace by history | back_and_forth | **back and forth** | "previous" is taken by number order |
| a group's layout | default, stacking, tabbed | **Split, Tabbed, Stacked** | "default" names nothing |
| the resize mode | mode "resize" | **resize mode** | |
| a rule | for_window, assign | **rule; application, title, role, type** | Plasma's rule words |
| a window's title bar | | **titlebar** | Plasma's spelling |
| kwin-i3's plugins | | **kwin-i3's plugins**, never which one | installed together |
| a workspace | workspace | **workspace** | i3's; help may say "a virtual desktop" once |
