# Spec: the settings page's words (a vocabulary, then a rewrite)

**Status: steps 1-4 decided (Paul, 2026-10-28) and built on branch `words`** (main page, the four
sub-pages, the key commands with a `note` role for the resize mode's keys, and the cog's labels);
the help buttons wait for `OPEN.md` item 47 (a); step 5 (§7) live

The steps: (1) inventory every string a user reads; (2) a glossary of the core words, each decided
once; (3) tone rules, replacing `docs/style-settings-page.md` §2's "super descriptive and explicit"
(a foundation change, put to Paul as one); (4) a page-by-page before/after, Paul choosing line by
line; (5) the Window Rules layout, its own pass after the words.

## 1. Inventory (2026-10-28)

`kcm/ui/*.qml` and `commands.json`: **278 strings shown, ~30 more as accessible names only**. 25
shown strings are over 40 characters (the HIG's longest control label, "Configure Keyboard
Shortcuts", is 28); 22 carry a parenthesis. The long ones, by kind:
- **Help and notes** (100-390 characters): Window Rules' header and help, Workspaces' header and
  help, Gaps' header and help, the helper banner (235), the empty rules list.
- **Controls with an explanation inside the label**: "Floats (a floating window)", "Show the
  window on every workspace of its output, or stop (sticky)", "Shrink width (in the mode: J,
  Left)", "Back and forth (the previous workspace)", "Open the launcher (KRunner)".
- **Checkboxes written as sentences**: "Pressing the current workspace's key returns to the previous
  one" (64), "Warn when kwin-i3 starts about keys other shortcuts already use" (63), "Move the pointer
  to an output that gets the focus" (49).
- **Choices written as sentences**: "All of it, when a workspace has one window", "The same, only
  with no gap at the edges", "Side by side, or stacked on a tall output".

The cog's form (`config.ui`) keeps i3's syntax on purpose (`philosophy.md`); it takes the page's
labels when step 4 is built (style guide §8) and its tooltips stay i3's.

## 2. Where the words come from

- **i3** has no settings page, so it gives nouns, not a tone: its directives and user-guide
  headings (`gaps inner|outer`, `border`, `floating`, `sticky`, `focus_wrapping`, `mouse_warping`,
  `workspace_auto_back_and_forth`, `popup_during_fullscreen`, `hide_edge_borders`, `indicator`,
  `mode "resize"`, `default_orientation`, `for_window`, `assign`).
- **KDE's HIG** ("Text and labels", develop.kde.org/hig/text_and_labels): as short as possible
  without losing meaning; plain language, minimal jargon ("folder", not "directory"); imperative,
  positive controls; omit the subject when context gives it; a shared verb moves into the label
  ("Options:"); a shortened control carries the full text as its accessible name; help text to a
  `ContextualHelpButton`; units as words where room allows ("200 ms", better "200 milliseconds");
  "×" for sizes. GNOME's HIG adds: a three-word label that is clear beats a one-word one that is
  vague, and the user's words, not the system's.
- **Plasma's own window pages** (KWin 6.7.5's strings, read from its `.mo` catalogues): terse
  noun-phrase labels ("Snap windows:", "Separate screen focus", "Navigation wraps around",
  "Multiscreen behavior:", "Focus stealing prevention:"); **"screen"** for an output everywhere;
  "Active" / "Inactive" for focus; "Titlebar" in one word; "frame" for a window's border
  ("Titlebar and Frame Actions", "No titlebar and frame"); Window Rules' "Window class
  (application)", "Window title", "Window role", "Window types", "Whole window class", "Detect
  Window Properties", "Minimum Size" / "Maximum Size". **"Screen Edges"** is a Plasma page of its
  own (hot corners and edges).

## 3. The glossary (decided 2026-10-28, every row as recommended)

Each word checked three ways (`feedback`: user words): true of what the code does; no implied
opposite the user would hunt for; no collision with another word on the page or in Plasma.

| # | thing | i3 | Plasma | page today | recommended | why |
|---|---|---|---|---|---|---|
| 1 | a monitor | output | screen | output (Gaps: "Screen edges") | **screen** | Plasma's word on every window page; costs an i3 user nothing, while "output" is jargon to a Plasma user (HIG: the user's words). A difference from i3 with a reason: the page only; docs keep "output" (`definitions.md`), help names i3's directive |
| 2 | window kinds | tiling, floating | (floating = normal) | "floats (a floating window)" | **tiling, floating; Tile, Float** as actions | the kinds stay i3's; the parenthesis goes (the row reads "app [..] → Float") |
| 3 | on every workspace | sticky | "all desktops" | "Show the window on every workspace of its output, or stop (sticky)" | **sticky**, explained once in help ("on every workspace of its screen") | i3's word, short; Plasma's "all desktops" would be untrue (one screen only) |
| 4 | the window's border | border | frame | frame | **frame** (keep) | already Plasma's word; "border" is a decoration's size in Plasma |
| 5 | the side the next window opens | indicator | — | "next-window side" | **split indicator** | i3's word plus "split", a word the page already uses; help says what it marks |
| 6 | focus classes | focused, unfocused | Active, Inactive | "Focused window:", "Other windows:" | **Focused:, Unfocused:** | i3's class names; in the Frame section "window" is given. "Active" is KWin's, qualified (`definitions.md`) |
| 7 | the two gaps | inner, outer | — | "between windows", "more at output edges" | **between windows, extra at edges** | "outer" reads as the whole edge gap to a Plasma user, but in i3 it is added to inner; "extra" says that. Never "screen edges" (Plasma's page) |
| 8 | split direction | splith, splitv; `default_orientation` | — | keys: "Split horizontally/vertically"; choice: "Side by side" / "Stacked" | **side by side, top to bottom** on both | "split horizontally" is read both ways by Plasma users; "stacked" collides with i3's stacking layout. Keys: "Split side by side", "Split top to bottom" |
| 9 | previous workspace, by history | back_and_forth | — | "Back and forth (the previous workspace)" | **back and forth** | i3's; "previous" is taken by Prev (by number). Help explains it once |
| 10 | the resize mode | mode "resize" | — | "the resize mode" | **resize mode** (keep) | |
| 11 | a rule | for_window, assign | "rule", "Window matching" | rule; app, title, role, type | **rule; application, title, role, type** | Plasma's rule words; "app" only where the row is tight |
| 12 | what a rule does | floating enable, assign → | — | "floats (…)", "tiles (…)", "opens on workspace…", "opens on output…" | **Float, Tile, Workspace…, Screen…** | the row says it; the column is labelled "Then:" or the like (step 5) |
| 13 | the layout held until windows resize | — (+) | — | "Wait for every window to resize" | **Show layout changes all at once** | named for what the user sees (style guide: "for what it does") |
| 14 | focus past the last window | focus_wrapping | "Navigation wraps around" | "Focus at an edge:" | **Focus wrapping:** | i3's and Plasma's verb agree |
| 15 | the pointer following focus | mouse_warping | — | "Move the pointer to an output that gets the focus" | **Pointer follows focus to another screen** | short, true (only across screens) |
| 16 | a window's title bar | — | Titlebar | "title bar" | **titlebar** | Plasma's spelling on its own pages |
| 17 | kwin-i3's plugins | — (+) | "plug-ins" (HIG) | "kwin-i3's plugins", "helper plugin" | **kwin-i3's plugins**, never which one | the user installs both together; a banner says what is missing, in a short list |
| 18 | a workspace | workspace | virtual desktop | workspace | **workspace** (keep) | i3's; Plasma users meet it in kwin-i3's widget. Help may say "a virtual desktop" once |

## 4. Tone rules (draft; they replace style guide §2's "super descriptive and explicit")

The style guide's other §2 rules stay (sentence case, colons, "Configure …", `i18nc`, the kinds).

1. **A field label is a noun phrase, about 3 words**: "Focus wrapping:", "Resize step:". The
   section heading gives its subject, so the label doesn't repeat it ("Focused:" under Frame).
2. **A checkbox says what is on, in about 6 words**: imperative ("Show layout changes all at
   once") or a plain statement, as Plasma's pages do ("Navigation wraps around"). One idea, no
   "when … returns …" sentence.
3. **A choice is 1-4 words** and never repeats its label ("Focus wrapping: [Next screen, then
   wrap]").
4. **No parenthesis in a control's text.** What it means goes in the help button (the resize
   mode's own keys, "J, Left", in the Resize group's help).
5. **Help (`ContextualHelpButton`): one or two sentences** saying what it does, then i3's directive
   in code ("i3: `focus_wrapping`"), as `philosophy.md` asks.
6. **A sub-page's top note is one sentence, or none**; the rest goes in its help button.
7. **A banner says what is wrong and what to do, in one sentence each**; what is missing is a
   short list of at most three, the rest in its help.
8. **A key command is a verb and its object, about 30 characters at most**: the group gives the
   rest ("Screens" group: "Move window to left screen").
9. **The glossary's words, and only them**; a new word joins the glossary first.
10. **No "you", and no "kwin-i3" in a control's text** (the page is kwin-i3's); a banner may name it.
11. **Units as now** ("4 px", "100 ms"; "×" in sizes, as the HIG asks).

Decided 2026-10-28 (Paul: "agree"); pointed to from the style guide §2, and moved there when the
rewrite is built.

## 5. The main page, before and after (decided 2026-10-28, Paul: "agree")

The words go in first; the help buttons wait for `OPEN.md` item 47 (a)'s design (Paul, same day).

Accessible names stay full sentences (style guide §6), rewritten in the glossary's words. A
"help" is a new `ContextualHelpButton` naming i3's directive (rule 5); one sits beside each
setting that has an i3 counterpart (the held `OPEN.md` item 47 (a) is that very help; its
keyboard problem in 37 comes with it).

| # | where | today | after |
|---|---|---|---|
| 1 | banner, off | kwin-i3 is turned off, so these settings do nothing yet. [Turn On] | kwin-i3 is turned off. [Turn On] |
| 2 | banner, not running | kwin-i3 is turned on but not running. The system log says why (journalctl --user -b \| grep kwin-i3). | kwin-i3 is on but not running. Its errors are in the system log: journalctl --user -b \| grep kwin-i3 |
| 3 | banners, plugins (two today) | The frame and waiting for windows to resize need kwin-i3's plugins. Without them, tiling windows keep their title bars. / kwin-i3's helper plugin isn't loaded: no dragging or resizing tiling windows with the mouse, no focus from the frame, no resize mode, no layout-dependent keys, and the Configure form's Apply doesn't reach kwin-i3 (make plugin-install). | one banner: kwin-i3's plugins aren't loaded: no frame, no mouse dragging, no resize mode. Install them: make plugin-install |
| 4 | section | Mouse and focus | Mouse & focus (HIG: "&" for two) |
| 5 | Gaps | [4 px] between windows [2 px] more at output edges | [4 px] between windows [2 px] extra at edges |
| 6 | Gaps summary | 1 output edge set; none with one window; edges only with one window; Same on every side and workspace | 1 edge set; none with one window; edges only with one window; Same everywhere |
| 7 | New workspaces split | Side by side, or stacked on a tall output / Side by side / Stacked | Automatic / Side by side / Top to bottom; help: "Automatic: top to bottom on a screen taller than wide. i3: `default_orientation`" |
| 8 | Focus at an edge | Focus at an edge: Next output, else wrap around / Next output, never wrap / Always wrap inside the container / Wrap, never leave the workspace | Focus wrapping: Next screen, then wrap / Next screen only / Always wrap / Stay on the workspace; help says "Always wrap" stays inside the split |
| 9 | Layout changes | [x] Wait for every window to resize | [x] Show all at once (accessible: "Show layout changes all at once") |
| 10 | Pointer | [x] Move the pointer to an output that gets the focus | [x] Follow focus to another screen |
| 11 | Drag | Drag a tiling window: By its title bar, or anywhere with Meta / Anywhere with Meta / By its title bar / Not at all | Drag tiling windows: Titlebar or Meta+drag / Meta+drag only / Titlebar only / Never |
| 12 | Fullscreen | New windows over a fullscreen window: Stay behind it, except its own dialogs / Always stay behind it / End the fullscreen, if a dialog / Come in front, if floating | New windows in fullscreen: Behind, except its dialogs / Always behind / Dialogs end fullscreen / Floating ones in front |
| 13 | Back and forth | Options: [x] Pressing the current workspace's key returns to the previous one | Options: [x] Repeat a key to go back and forth |
| 14 | Workspaces summary | All tiling, on any output; 1 on a set output | All tiling, any screen; 1 on a set screen |
| 15 | Tiling look | Tiling windows: i3's frame / Their own title bars / No frame or title bar | Tiling windows: Frame / Titlebars / Neither |
| 16 | its note | Nothing marks the focused window. The Dim Inactive desktop effect can. | Nothing marks the focused window; the Dim Inactive effect can. |
| 17 | colour rows | Focused window: frame [■] next-window side [■] / Other windows: … | Focused: frame [■] split indicator [■] / Unfocused: … |
| 18 | Hide frame sides | Never / At the output's left and right edges / At the output's top and bottom edges / At every output edge / All of it, when a workspace has one window / The same, only with no gap at the edges | Hide frame: Never / Left and right edges / Top and bottom edges / All edges / On a lone window / On a lone window without gaps |
| 19 | corners | [x] Round the corners of tiling windows | [x] Round corners of tiling windows |
| 20 | Floating windows | [x] Draw the frame on floating windows too | [x] Draw the frame too |
| 21 | Rules summary | 5 rules, 2 sending to a workspace or output | 5 rules, 2 to a workspace or screen |
| 22 | Keys option | [x] Warn when kwin-i3 starts about keys other shortcuts already use | [x] Warn about keys other shortcuts use |

## 6. The sub-pages, before and after (decided 2026-10-28, Paul: "agree")

Numbered on from §5. Today's text in the inventory; only what changes is listed.

**Workspaces**
| # | today | after |
|---|---|---|
| 23 | Any output | Any screen |
| 24 | top note (260 characters) and its help (200) | note: "Each workspace opens on its screen, or on its second when the first isn't connected." Help: "Others open on the first free screen. On a floating workspace new windows float (a rule in Window Rules). Meta+Shift+Space tiles a floating window or floats a tiling one. A screen that isn't connected is kept for when it returns. i3: `workspace N output`" |

**Gaps**
| # | today | after |
|---|---|---|
| 25 | top note (150) and help (153) | note: "Here a screen edge or a workspace can differ from the main page." Help: "A workspace's gaps add to the main page's; the sum never goes below 0. i3: `gaps top\|right\|bottom\|left`, `smart_gaps`, `workspace N gaps`" |
| 26 | Screen edges: [top: as outer] … | Edges: [top: same] … (glossary 7: never "screen edges") |
| 27 | One window on a workspace: Gaps as usual / No gaps at all / Edge gaps only there, none elsewhere | Lone window: Usual gaps / No gaps / Edge gaps only (help: "Edge gaps only: and none on other workspaces") |
| 28 | at output edges; at output edges (set per side) | at edges; at edges, set per side |

**Keys** (rule 8: a verb and its object, about 30 characters)
| # | today | after |
|---|---|---|
| 29 | kwin-i3 isn't running, so its keys can't be shown. | kwin-i3 isn't running. [Turn On] |
| 30 | %1 is used by %2; it will be taken from it on Apply. | %1 belongs to %2; Apply moves it here. |
| 31 | Focus between tiling and floating | Focus tiling or floating |
| 32 | Enter or leave the resize mode; Shrink width (in the mode: J, Left) … | Resize mode; Shrink width … with "in resize mode: J, Left" as muted text beside the key, as the shifted symbols' "Meta+! → Meta+Shift+1" is |
| 33 | Split horizontally; Split vertically | Split side by side; Split top to bottom |
| 34 | Float or tile the window; Show the window on every workspace of its output, or stop (sticky); Close the window | Float or tile; Toggle sticky; Close window |
| 35 | Back and forth (the previous workspace); Move back and forth (previous workspace) | Back and forth; Move back and forth |
| 36 | Workspace 3, no back-and-forth; Move to workspace 3, no back-and-forth | Workspace 3, no back and forth; Move to workspace 3, no back and forth (38 characters, over rule 8's 30 but inside the label column's 40; one word for one thing beats the count) |
| 37 | … on this output; Move to the next workspace; Move to the next on this output | … on this screen; Move to next workspace; Move to next on this screen |
| 38 | group "Outputs": Focus the output to the left; Move the window to the left output; Move the workspace to the left output; … the primary output | group "Screens": Focus left screen; Move window to left screen; Move workspace to left screen; … primary screen |
| 39 | Open the default terminal; Open the launcher (KRunner); Exit (Plasma's logout prompt); Release every window (safety valve); Dump state for a bug report | Open terminal; Open launcher; Log out; Release all windows; Save state for a bug report |

**Window Rules**
| # | today | after |
|---|---|---|
| 40 | top note (265) and help (388) | note: "Rules decide which windows float or tile, and where they open." Help: "A rule matches a window's application, title, role or type, each a regular expression (^…$ for a whole name), and runs when the window opens or changes its title. Dialogs, utility windows, splash screens and fixed-size windows float anyway; a rule can tile them. For float or tile the last matching rule decides; for workspace or screen, the first. A rule with other criteria shows as text. i3: `for_window`, `assign`" |
| 41 | Click the window to add a rule for. Escape cancels. | Click a window. Escape cancels. |
| 42 | Added a rule: windows of %1 float. Change what it does in its row. / %1 already has a rule: change it in its row. | Added a rule: %1 floats. / %1 already has a rule. |
| 43 | That window has no application class. / That window isn't one KWin manages: no rule can reach it. | That window has no application name. / No rule can reach that window. |
| 44 | floats (a floating window) / tiles (a tiling window) / opens on workspace… / opens on output… | Float / Tile / Workspace… / Screen… |
| 45 | not saved until it has a pattern | not saved: needs a pattern |
| 46 | No rules: every window tiles unless it is a dialog, a utility window, a splash screen or of a fixed size. | No rules. Dialogs and fixed-size windows float; the rest tile. |
| 47 | all outputs together / 75 × 50 px (i3's) / no limit / a size | All screens together / 75 × 50 px / No limit / Custom |

## 7. Step 5: the Window Rules layout (Paul, 2026-10-28: layout 1, "we don't need the icons")

- **One line per rule**: the application, "→", what the rule does and its value, the More toggle
  and Remove. Title, role and type on a second line, shown when one is set or More is open. Fits
  the style guide's 34-unit column, and half a 1280 px screen.
- **The application box is a chooser** (Paul: "i still dont know what would go in the 'any
  application' box"): an editable dropdown of the installed applications by name
  (`kcm.applications`, KService: a desktop file's name, or its StartupWMClass lowercased as KWin
  reads an X11 class). Choosing one stores its class whole; the box then shows the name
  ("Spectacle"), the class as its tooltip. Typed text: a plain name stored whole (as Pick a
  Window does), or with any of `* + ? ^ $ { } ( ) | [ ] \` i3's regular expression as typed,
  shown in monospace. Empty, it says "Choose an application", or "any application" on a rule that
  matches by title, role or type. (The launcher's name in grey beside the field, tried first,
  felt shoehorned.) Title and role stay patterns as typed; kwinrc and the cog keep i3's syntax.
- **The defaults a group of their own, above yours**, not below as first drafted: rules run top
  to bottom and the last float or tile wins, so a group shown below would misstate the order.
  The group shows only when the defaults run first (as shipped); otherwise each is marked
  "default" in place, as before.
- **"For float or tile, the last matching rule wins."** in small grey text under the list.
