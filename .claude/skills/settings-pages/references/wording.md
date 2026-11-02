# Wording a settings page

Rules for every string on a settings page: labels, checkboxes, choices, descriptions, help, buttons,
messages. Each rule has its reason and its sources (keys in `sources.md`). Where the platforms
disagree, the KDE HIG decides for a KDE page, and the rule says so.

## Contents

1. Naming a setting
2. Checkboxes and switches: the on state
3. Choices: radios and dropdowns
4. Descriptions and help
5. Words
6. Voice
7. Capitalization and punctuation
8. Buttons
9. Messages and banners
10. Another system's setting

## 1. Naming a setting

1. **Name what the setting governs, in the reader's words.** The name is what people scan;
   the rest is read only when the name fails (79% of readers scan). Do "Focus follows mouse";
   don't "The window under the pointer has the focus, at once". NNG-READ, GN-WS, KDE-TXT.
2. **Keyword first.** The left edge is what a scanner reads; rows that start alike hide their
   difference. Do "Gaps between windows"; don't "Size of the gaps between windows". KDE-TXT,
   AND, NNG-TOG, MAT-SET.
2a. **Concrete beats abstract.** A label the reader has to picture ("Keep windows as dropped at
    screen edges") loses to one naming what they know ("Screen edge tiling", or Plasma's own name
    for the feature). When a feature has a name in the platform, use that name.
3. **Short: no longer than KDE's "Configure Keyboard Shortcuts".** One to four words for a field
   label; a checkbox may be a short phrase. KDE-TXT, MS-TOG, CAR-FORM, PRI-FORM.
4. **Never repeat the section heading in a row.** Under "Gaps", the rows are "Between windows",
   "At screen edges", not "Gaps between windows", "Gaps at screen edges". AND, MS-CB, MS-UITXT.
5. **When several rows share a lead phrase, move it to a group label** and keep the full text as
   each control's accessible name. KDE-TXT.
6. **No generic verbs as the whole meaning**: set, change, edit, manage, configure, adjust, use,
   select. They say nothing about the outcome. "Screen resolution", not "Adjust display
   settings". A button that opens a sub-page may still say "Configure X…" (KDE's own pattern).
   AND, MS-CP, MAT-SET.
7. **No vague group names**: "General", "Options", "Advanced", "Other", "Miscellaneous".
   "Advanced" only for three or more hidden items, with a line saying what is inside. GN-CONF,
   AND, M1.
8. **Name the behaviour, never the owner.** A row titled "Plasma:" or "kwin-i3:" makes the reader
   decode who they are choosing instead of what. Owners belong in help text, once. NNG-HEUR #2;
   craft rule 19.
9. **One name per thing, everywhere.** If it is a "shortcut" in one row it is not a "key",
   "binding" or "hotkey" in the next. A glossary keeps it. SMASH, NNG-HEUR #4, APPLE-WR.

## 2. Checkboxes and switches: the on state

10. **Word the label as what is true when it is ticked.** A neutral or question label makes the
    reader work out which way it goes. Do "Show icons in menus"; don't "Icons in menus?". MS-CB:
    "a statement that the check mark makes true and the absence of a check mark makes false".
    NNG-TOG, GN-CB, M3.
11. **The say-it-aloud test**: read the label, then add "on" and "off". If either reading needs
    thought, rewrite. NNG-TOG.
12. **Positive wording; ticking never means "don't".** Do "Allow the system to go to sleep";
    don't "When disabled, prevent the system from going to sleep". The one accepted negative is
    "Don't show this message again". KDE-TXT, MS-CB, GN-CB, AND ("block", not "don't allow").
13. **The label never changes with the state, and never contains "On"/"Off"/"Enabled".** The
    control shows the state. Do "Encrypt installed disks"; don't "Enabled encryption of installed
    disks". ATL-TOG, PF-SW, PRI-TOG. Only the muted line under it may change with the state (a
    current value, or what was there before a change).
14. **KDE checkbox style: imperative verb, sentence case** ("Show window titles"). GNOME and
    Android name switches with nouns ("Notifications"); a KDE page follows KDE. KDE-TXT.
15. **If one label can't say what both states do, use two radio buttons** with a full outcome
    each. "Landscape" as one checkbox fails; Landscape / Portrait as radios works. MS-CB, GN-SW,
    NNG-CHK, APPLE-TOG.
16. **A label and its control never depend on each other to make sense.** GNOME and Microsoft
    forbid any sentence split across controls (it can't be translated in another word order, and
    a screen reader reads two fragments). KDE allows one shape only: a lead-in label that every
    option completes naturally, with a translator note saying so ("Allow Plasma to show:" /
    "Panel and widget tooltips", `kde.md` 12). Each option must still read sensibly alone in its
    group. "Plasma's shortcuts: [ ] Take kwin-i3's keys from them" fails: the checkbox means
    nothing without the label, and "them" points across the gap. GN-WS, MS-CB, MS-UITXT, KDE-TXT.
17. **No pronoun without a referent in the same string** ("them", "it"). A label is read alone.
    [Inference from rule 16.]

## 3. Choices: radios and dropdowns

18. **Option labels differ only in what differs, and each is a complete outcome.** "Focus on
    click" / "Focus follows mouse"; not "Plasma: A click focuses a window." GN-RB, E6/E7 in
    B-platforms.
19. **Two to five exclusive choices: radios; more: a dropdown.** PF-FORM, MS-APPSET, APPLE-TOG.
20. **Order by logic or likelihood, never alphabetically** (alphabetical order doesn't survive
    translation). MS-CB, AND.
21. **Mark the recommended choice in its own label or description**, "(recommended)", or a
    description like "Recommended for most users and applications", rather than warning about the
    others. MS-UITXT, GNOME Mouse panel.

## 4. Descriptions and help

22. **Add a description only when the label can't carry the meaning.** Most rows need none.
    M1: "If the label is sufficient on its own, don't add secondary text." APPLE-SET, MS-CB.
23. **A description never repeats the label.** "Screen timeout / Adjust the delay before the
    screen turns off" fails; "Sleep / After 10 minutes of inactivity" works. M1, MS-CB, PRI-FORM.
24. **A description says the consequence: what is different when this is on.** Present tense,
    starts with a verb, one line (about 85 characters, KDE), no full stop if one sentence. Do
    "Touch the top-left corner to open the Activities Overview" (GNOME). APPLE-WR: "Describe what
    it does when turned on, and people can infer the opposite."
25. **For a row that opens a sub-page or holds a value, the line under it is the current value**
    ("3 rules", "Dark"), not a description. AND, M1.
26. **Put the trade-off in the same sentence as the benefit, without scare words.** "Turning
    mouse acceleration off can allow faster and more precise movements, but can also make the
    mouse more difficult to use." (GNOME). MS-CONFIRM.
27. **Anything the reader needs to decide is on screen, never only in a tooltip or help button.**
    Tooltips vanish, and fail on touch and keyboard. The help button holds optional detail. NNG-TIP.
28. **Help never repeats the label, never explains how to use the control** ("Check this box
    to…", "Select any of the following"). Start with the effect. MS-CB, SMASH, NNG-TIP.
29. **Say the cost before the click**: "Takes effect after logging out", "Every app, not just
    windows". NNG-CONF.
30. **A disabled control says why, next to it,** and whether that is temporary. MS-APPSET,
    SHOP-SWITCH, ATL-TOG.

## 5. Words

30a. **The product's own name is not an internal name**, but use it in a label only when it is
    the distinguishing word ("Use kwin-i3's command for shared keys"); banners and help may name
    it freely. Never its file, script or component names.
31. **The reader's vocabulary, never internal or system names.** "Power Management" not
    "Powerdevil"; "Window Management Plug-Ins" not "KWin Scripts". Check each word: would a
    newcomer who never read the docs say it? KDE-TXT, GN-WS, MS-CP, NNG-HEUR #2.
32. **Familiar words over formal ones**: use, not utilize; turn on, not enable; cancel, not
    terminate. NNG-PL, GOVUK-AZ, MS-TURN.
33. **Spell out acronyms** (Memory, not RAM) unless truly common. KDE-TXT, MS-WRITE.
34. **Strong verbs; unpack hidden verbs** ("analyze", not "conduct an analysis"). DIGITAL-GOV.
35. **Cut filler: "in order to", "you can", "please", "This setting lets you…"; then cut half
    of what is left.** The concise version tested 58% more usable. NNG-READ, NNG-PL, Krug.
36. **No hype** ("powerful", "seamless"). Objective text tested 27% more usable. NNG-READ.
37. **Real numbers and units**: "200 ms" or "200 milliseconds", not "200msec". KDE-TXT.
38. **Don't promise what can't be guaranteed** ("always", "instantly"). SMASH.

## 6. Voice

39. **Neutral, informative, impersonal.** No "you", "your", "my", "we" in labels and short
    descriptions; no "now". Do "Favorites"; don't "Your Favorites". KDE-TXT ("Permanently delete
    all items from the Trash?", not "Are you sure you want to…"), GN-WS, APPLE-WR, AND. (Microsoft
    disagrees; a KDE page follows KDE.)
40. **No jokes, no "oops", no exclamation marks.** A system tool keeps a straight face. KDE-TXT,
    APPLE-WR, NNG-ERR.
41. **Clear beats clever.** "Send", not "Let's do it!". APPLE-WR.

## 7. Capitalization and punctuation (KDE)

42. **Sentence case** for checkbox, radio and dropdown items, labels before a control, subtitles,
    tooltips; **title case** for buttons, headings, window titles. KDE-TXT.
43. **No full stop** on labels, headings, buttons, single-sentence descriptions. Full stops only
    in multi-sentence text. GN-WS, MS-WRITE.
44. **A colon ends a field label in a KDE FormLayout** ("Gaps:"); never inside a checkbox label.
    KDE-TXT.
45. **Ellipsis only when the control needs more input before it acts**, or opens a sub-page or
    dialog ("Configure Keys…"). Never on a plain navigation without a dialog. GN-WS, KDE-TXT,
    APPLE-BTN.
46. **Leave 50% growth room for translation.** KDE-TXT.

## 8. Buttons

47. **Verb + object, one to three words, saying what happens**: "Save Changes", "Delete File",
    "Configure Keys…". Never "OK", "Yes", "Done" for an action. GN-DLG, APPLE-ALERT, MS-CP,
    PRI-SAVE, ATL-ERR.
48. **A button names what it does, not where it does it.** "Change in Plasma" fails: the reader
    is in Plasma. [From a review of this project's own page.]
49. **No "now" on a button** unless it contrasts with a later action. MS-SETUP.
50. **"Delete" only for permanent removal; "Remove" for reversible.** KDE-TXT.
51. **On a page with Apply, every edit waits for Apply.** No second, private commit button on the
    page: the reader already knows Apply. PRI-SAVE ("one save model per form"), MS-TOG, GN-CONF.

## 9. Messages and banners

52. **One banner, one fact, one next step.** Under two lines; its button two words or fewer.
    CAR-NOT, SHOP-BANNER, GOV-NB.
53. **A banner says what is wrong and what to do, in that order.** "Some settings work against
    tiling. [Review…]". KDE uses `Kirigami.InlineMessage` in the page header. CAR-NOT, ATL-WARN.
54. **Messages say what happened and how to fix it; never "invalid", "error occurred", "oops",
    "please", "sorry".** GOV-ERR, NNG-ERR, ATL-ERR.
55. **A warning comes before the act; it says whether the act can be undone.** ATL-WARN.

## 10. Another system's setting

Sources say little directly here; these are drawn from the closest rules and marked where inferred.

56. **Don't copy a system setting into your own page if you can avoid it; link to it or read
    it.** A copy implies the system one doesn't apply, and that changing yours changes others.
    APPLE-SET.
57. **If you must change it, say three things, in this order: what the reader gets, whose
    setting it is, how to get it back.** "Use kwin-i3's keys instead of Plasma's" / "Plasma's
    shortcuts keep their other keys; unticking this gives them back." [Inference: NNG-CHK,
    NNG-CONF, APPLE-SET.]
58. **Never phrase a change as a possession fight** ("Take X from them"). State the result the
    reader sees. [Inference: rules 10, 31.]
59. **Name the other system once per row at most, in that row's description, never as a prefix
    or a label.** "Plasma:" / "kwin-i3:" prefixes fail; a line "Plasma uses click to focus." under
    the row passes (`patterns.md` P1 asks each row to say whose setting it is). [Inference: rule 5.]
60. **"Restore" restores the reader's original, not a default.** Say which. MS-CP.
