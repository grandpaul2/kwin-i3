# Laying out a settings page

How a page is organised: what goes on it, in what order, in which control, and how changes are
committed. Source keys in `sources.md`. A KDE page follows KDE's HIG and Plasma's own pages where
the platforms differ (`kde.md`).

## Contents

1. What belongs on the page
2. Grouping and order
3. The row
4. Choosing the control
5. Dependent settings
6. Sub-pages and disclosure
7. Committing changes: Apply, Reset, Defaults
8. Messages on the page
9. Checking a layout

## 1. What belongs on the page

1. **Fewer settings beat better-worded settings.** Each one costs every reader a read. If a
   setting can't be explained to a newcomer in one line, ask whether it needs to exist or needs a
   better default. APPLE-SET ("Minimize the number of settings"), GN-CONF, SMASH rule 6.
2. **Ship the default most readers would choose; neutral and low risk.** M1, MS-CB, APPLE-SET.
3. **Detect, don't ask.** A value the system can read (theme, monitors, keyboard layout) is read,
   not asked for. APPLE-SET, MS-SETUP, GN-CONF.
4. **If you can't name a control clearly, the model is wrong.** Fix what the setting is before
   wording it. SMASH.

## 2. Grouping and order

5. **Group by topic, never by skill level or frequency.** GN-CONF.
6. **Most-used first.** AND, M1, GN-CONF.
7. **Specific short noun headings** ("Screen Edges", "Workspaces", "Multi-Monitor"); never
   "General", "Other", "Advanced", never a "Settings" suffix. MS-APPSET, GN-WS, M1.
8. **Small groups: about four to six rows; a screen of ten to fifteen at most.** Past that, a
   sub-page. MS-APPSET, AND, NNG-FORM.
9. **White space or dividers between groups, never between every row.** AND, M1.
10. **A heading must make sense alone; the headings read in order should tell the page's story.**
    SMASH, NNG-PL.
11. **No group for one control that does nothing for the reader.** (KDE: hide debug switches.)

## 3. The row

12. **Anatomy: name, control, optional one-line description; at most two controls on a row.**
    GN-BL, MS-APPSET (SettingsCard: header, description, control).
13. **In a KDE FormLayout: label right-aligned in the shared left column ending in a colon,
    control on the right; a checkbox's text is its own label.** Kirigami FormLayout; KDE pages.
14. **A row whose label column is filled must read as one thing with its control**, not half a
    sentence each (`wording.md` 16). If the label is a category ("Keys:"), the control's own text
    must stand alone.
15. **The description sits directly under the control it explains, in smaller muted text**,
    never in a paragraph above the group. NNG-HELP ("pull" over "push"), MS-APPSET.
16. **Labels near their controls (proximity); never a placeholder as the label.** NNG-FORM,
    PRI-FORM, CAR-FORM.
17. **Same kind of choice, same control, everywhere on the page.** Mixed toggles and radios for
    the same kind of thing left readers unsure what took effect (Chase study). NNG-TOG.

## 4. Choosing the control

| choice | control |
|---|---|
| two states, takes effect immediately, no Apply on the page | switch |
| two states, waits for Apply/Save (a KDE System Settings page) | checkbox |
| two states that one label can't describe both ways | two radio buttons |
| two to five exclusive choices | radio buttons |
| more than five, or long names | dropdown |
| a number with a unit | spin box showing the unit |
| an action that happens at once | push button, verb + object |
| a set of related settings with their own options | sub-page, opened by a button ending in "…" |

Sources: GN-SW, GN-CB, GN-RB, MS-TOG, MS-APPSET, APPLE-TOG, PF-FORM, NNG-TOG, NNG-CHK, PRI-TOG.
Notes:
- A switch on a page with an Apply button is wrong: the reader can't tell whether it took
  effect. ATL-TOG ("Toggles should never require people to press a button to apply"), PRI-SAVE.
- macOS prefers a checkbox for a single on/off setting; KDE System Settings pages use checkboxes
  throughout, with Apply. Follow the platform.
- A checkbox is never a command and never opens a dialog. MS-CB.

## 5. Dependent settings

18. **A setting that governs others sits directly above them; they are indented and disabled
    (not hidden) while it is off.** GN-CB, MS-CB, APPLE-TOG, KDE pages (`kde.md`).
19. **Ticking a box never changes another control's value**; it may only change whether another
    is enabled. GN-CB.
20. **A disabled control says why, next to it.** MS-APPSET.

## 6. Sub-pages and disclosure

21. **A sub-page for a group with its own options, or for settings most readers never need.**
    Its button names it ("Configure Window Rules…") and shows its current state beside it in
    muted text ("5 rules"). GN-BL, M1, AND.
22. **The sub-page's title matches the button that opens it.** M1.
23. **Two levels at most; no expander inside an expander.** NNG-PD, MS-APPSET.
24. **A disclosure's label predicts what is inside** ("Advanced: scaling, page order"), never
    "More". NNG-PD, AND.
25. **Nothing needed to finish the task is hidden.** CAR-DISC.

## 7. Committing changes: Apply, Reset, Defaults

26. **One commit model per page.** On a KDE System Settings page every edit is pending until the
    shell's Apply; Reset drops pending edits; Defaults sets every control to its default. A page
    must not add its own commit buttons beside those. PRI-SAVE, MS-TOG, KDE pages.
27. **Apply never changes something the reader hasn't seen.** A pending edit appears only from
    the reader's own action on a visible control. [Inference from PRI-SAVE and MS-CP: settings
    must show the current state, not recommendations.]
28. **Controls show the current state, not a recommendation.** A checkbox pre-ticked to suggest
    a change, before the reader acts, reads as the current state, and Cancel then looks like the
    way to "not change" it. MS-CP.
29. **Defaults restores the product's defaults; "give back" restores the reader's own earlier
    value. Say which a control does.** MS-CP.
30. **Prefer undo to confirmation; confirm only the irreversible.** GN-DLG, APPLE-ALERT,
    NNG-CONF, MS-CONFIRM.
31. **Irreversible or cross-system actions sit apart** (a separate group at the end, like
    GitHub's "Danger Zone"), each with one sentence on its effect. GH-DEL, GOV-BTN.

## 8. Messages on the page

32. **State goes in an inline message at the top of the page** (KDE: `Kirigami.InlineMessage`,
    header position): off, not running, a dependency missing. KDE pages.
33. **One message at a time where possible; each one fact and one action.** CAR-NOT, SHOP-BANNER.
34. **A message that points to a sub-page has one button naming it** ("Review…").

## 9. Checking a layout

- **Screenshot every page you change and read it before calling it done.** Read the left edge
  only: can the rows be told apart from their first three words? (`review.md` T11.)
- **Read headings and buttons alone**: do they tell the story? (T12.)
- **Remove one thing.** Before finishing, take out the one element that adds least.
