# Spec: the settings page's words (a vocabulary, then a rewrite)

**Status: step 3 of 5. The glossary (§3) is decided** (Paul, 2026-10-28: "agree", every row as
recommended); the tone rules (§4) are a draft (Paul, 2026-10-28, thirteenth session: "I like
explicit, but I think we are a little too wordy … develop a vocabulary that is friendly, cohesive
and still descriptive"). `OPEN.md` item 49.

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
