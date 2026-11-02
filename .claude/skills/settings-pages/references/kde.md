# KDE: the HIG and how Plasma's own pages are worded

For a KDE System Settings module (KCM) or any Kirigami settings page. KDE's rules decide where
the platforms disagree. Strings below are verbatim from Plasma 6.7.5's source (`kwin`,
`plasma-desktop`, `plasma-workspace`, `systemsettings`, tag `v6.7.5`), cited `repo path:line`;
rules cite the current HIG (develop.kde.org/hig) or the pre-2023 HIG kept in git
(develop-kde-org commit `c081d951`). When Plasma breaks its own HIG (§6), the HIG wins for new work.

## Contents

1. Wording rules
2. Controls in a KCM
3. Layout of a KCM
4. Help, messages, defaults
5. Plasma's wording to copy, by situation
6. Where Plasma and its HIG disagree
7. Rewrites Plasma made, and why

## 1. Wording rules

1. **As short as possible; no interactive label longer than "Configure Keyboard Shortcuts"**
   (28 characters). Translations grow 50%. HIG text_and_labels.
2. **Front-load**: "Re-Assign Shortcut", not "Re-Assign Key Binding to this Action".
3. **The user's word, not the implementation's.** "Window Management", "Plasma Workspace", not
   "KWin", "plasmashell" (Plasma renamed them in its Shortcuts page: plasma-desktop ea2d29c71,
   "the HIG recommendation to avoid displaying internal jargon to users is violated"). The HIG's
   own bad example is "KWin Scripts" (good: "Window Management Plug-Ins").
4. **Buttons, menu items, checkboxes and switches start with an imperative verb**: "Show Info",
   "Enable device", "Also index hidden files and folders". Verb-first also makes flat buttons
   look clickable.
5. **Positive: say what the control does when on.** Plasma inverts a stored negative flag to
   keep the label positive: "Show desktop layout indicators" is `!textOnly`
   (kwin `src/kcms/desktop/ui/main.qml:337-340`).
6. **No "you" in instructions; impersonal.** "The current page has unsaved changes. Apply the
   changes or discard them?" replaced "…Do you want to apply…" (systemsettings f8032c0f: "avoid
   the word 'you'"). Descriptions and questions may use it sparingly; labels never.
7. **Neutral tone.** "depending on the number of files to index", not "depending on how many
   files you have" (plasma-desktop 4976d5760).
8. **Sentence case** for checkbox, radio and combobox items, labels before a control, tooltips,
   subtitles, placeholders; **title case** for buttons, menu items, window and group titles.
9. **Name the action on every button; never Yes/No/OK alone.** The Shortcuts page renames its
   conflict dialog's OK to "Reassign".
10. **"…" (U+2026) only when the action always needs more input.** "Save As…", "Configure
    Keys…"; not "Delete", "About", "Properties".
11. **Drop a subject the context gives, but keep the full text as `Accessible.name`.** And not
    so far that it's ambiguous: "Add" next to a spin box was misread; it became "Add Desktop"
    (kwin 351f613ef).
12. **A lead-in label may start a sentence its options finish**, when every option completes it
    naturally and a translator note says so: "Allow Plasma to show:" over "Panel and widget
    tooltips" / "OSD popups for status changes" (plasma-desktop
    `kcms/workspaceoptions/ui/main.qml:49-70`, i18nc "Part of the sentence 'Allow Plasma to show
    panel and widget tooltips'"). The option alone must still make sense in its group. A label
    and a checkbox that only make sense glued together ("Plasma's shortcuts: Take kwin-i3's keys
    from them") is not this pattern.
13. **Expand an acronym at first use**: "on-screen display (OSD)".
14. **Units**: "200 ms", better "200 milliseconds"; spin boxes show the unit (`i18n("%1 ms")`).
15. **Real symbols**: "…", "→", "×", curly quotes.
16. **One name per concept**: "Window menu" replaced four names for one thing across the titlebar
    page, a tooltip, a shortcut and the docs (kwin 3156e90b3).
17. **Name the real scope**: "Hide from Screencast" became "Hide from screenshots and screen
    recordings" when it covered both (kwin e74d9b6d8).
18. **Don't scare or blame**: no "killed", "fatal", "illegal".
19. **No static text walls.** "Being tempted to add static text is a good sign that the
    software's user interface is too complex and should be simplified." (old HIG)
20. **Translator context on every string** (`i18nc("@option:check …", …)`), 50% room to grow.

## 2. Controls in a KCM

21. **A KCM has Apply, so on/off settings are checkboxes, never switches.** "Use a Switch for
    'instant apply' controls … Use a CheckBox for everything else." HIG getting_input.
22. **A control's label never changes with its state** (a push button may: "Export…" /
    "Cancel Export").
23. **Radio buttons for three or fewer short options; a combobox up to ten; a list past that.**
    Radios when each option's opposite isn't obvious, or the reader should see every option
    without opening anything.
24. **A two-option do/don't is one checkbox, not two radios.**
25. **One radio is always selected.**
26. **Slider for rough, spin box for precise, both where both matter** (Pointer speed).
27. **Free text only when nothing constrained works; validate; say why inline.**
28. **A selection never performs a command; use a button.**

## 3. Layout of a KCM

29. **`Kirigami.FormLayout`**: labels right-aligned in one column ending in a colon, controls
    left-aligned in the next; never a hand-made grid.
30. **Group by proximity**: `smallSpacing` inside a group, `largeSpacing` between; then section
    titles (`Kirigami.FormData.isSection`).
31. **Most important groups first.**
32. **Checkboxes stacked in the control column under one group label** ("Options:",
    "Tapping:"), one per line, never side by side.
33. **Dependent options indented under the control that governs them; disabled, not hidden,
    with the reason in a ContextualHelpButton shown only while disabled.** Hide only for hardware
    that isn't there. Plasma removed conditionally visible radios "to avoid confusion about
    controls jumping around while clicking them" (plasma-desktop c2e0bd28b).
34. **No line breaks inside a checkbox label**; extra explanation goes in a label below it.
35. **Three levels of hierarchy at most.**
36. **A KCM is one scroll area; no tabs; two or three columns at most.** Too much: prioritise
    and cut first, then sub-pages (`kcm.push`).
37. **The page draws no Apply, Reset or Defaults of its own**: System Settings provides them.
    Reset is "Reset all current changes to previous values"; Defaults sets every control to its
    default; non-default controls are highlighted (`KCM.SettingStateBinding`, "Highlight Changed
    Settings").

## 4. Help, messages, defaults

38. **Defaults right, so most readers never change them.**
39. **"Settings to simply enable or disable a feature entirely are warning signs of sloppy
    design."** Prefer a choice between valid behaviours. Don't add a setting to avoid a decision
    or to work around a bug. HIG powerful_when_needed.
40. **No page or group called "Advanced"**: name what is inside; progressive disclosure to a
    sub-page.
41. **One sentence inline below the control it explains**; up to two at the top of a page that
    needs introducing; a ContextualHelpButton for anything longer; a tooltip only when there's
    no room. **Never anything important only in a hover tooltip.** HIG displaying_content.
42. **A tooltip adds, never restates.** Plasma deleted nearly all mouse and touchpad tooltips as
    "just rephrasings of the visible text" (plasma-desktop 3081084ed).
43. **The consequence goes at the control, not in a paragraph at the top** (kwin 1156aecc9: cut
    a wall of text to "the minimum needed to explain what this KCM is for", with "inline
    explanations for the implications of each individual setting").
44. **A setting whose scope is narrower than it sounds says so**: "Some applications may not
    honor this setting."
45. **A setting that needs a restart says so in a header message with the action**: "The system
    must be restarted before changes to the middle-click paste setting can take effect."
    [Restart].
46. **Errors near their cause, plain, with a way forward; never only what went wrong; never
    silent.** Third-party faults are labelled as such.
47. **`Kirigami.InlineMessage`** for page state, `position: Header` for page-wide; inserted into
    the layout, gone when the problem is.
48. **Show success by the visible effect, not a "done" message.**
49. **Undo is as easy as the destruction**: "These shortcuts will be deleted when changes are
    applied." [Undo].
50. **New features off by default; opt in, never opt out, for anything that sends data.**
51. **No wizard to change settings.**

## 5. Plasma's wording to copy, by situation

**Checkboxes** (label column → checkbox): "Options:" → "Navigation wraps around"; "Switch
desktops independently for each screen"; "Tapping:" → "Tap to click", "Allow dragging after
tapping"; "Raising windows:" → "Click raises active window"; "Behavior:" → "Remain active when
windows are fullscreen"; "Ask for confirmation:" → "On shutdown, restart, and logout";
"Middle-click:" → "Pastes selected text"; "After next restart:" → "Enter UEFI firmware settings".

**Radio lead-ins**: "Clicking in scrollbar track:" → "Scrolls to the clicked location" /
"Scrolls one page up or down"; "Clicking files or folders:" → "Selects them" / "Opens them";
"Scroll by:" → "Moving two fingers anywhere" / "Moving one finger on edge"; "Data to index:" →
"Nothing (disable indexing entirely)" / "File names only" / "File names and contents".

**A consequence, as a subtitle under each option** (kwin `src/kcms/xwayland/ui/main.qml`, the
form "<level>; <what works or is exposed>"): "Most secure; global shortcuts will not work in X11
apps"; "Moderate security; all global shortcuts will work in X11 apps"; "Least secure; all X11
apps will be able to see any text you type into any application".

**A cost in a help button**: "Activating this setting increases click latency by 50ms. The
extra delay is needed to correctly detect simultaneous left and right button presses." "This
will interfere with applications that use middle-button drag, such as some image editors,
document viewers, or video games." "This can interfere with video games."

**Turning something off removes other things**: "This will disable file searching in KRunner
and launcher menus, and remove extended metadata display from all KDE applications."

**Scope and other apps**: "Some applications may not honor this setting." "Some changes such
as anti-aliasing or DPI will only affect newly started applications." "Changes will take effect
the next time you log in." "(Note: This feature does not work with the Focus under mouse or
Focus strictly under mouse focus policies.)"

**A warning inside a choice's help** (Window Behavior, focus): "Warning: Focus stealing
prevention and the tabbox ('Alt+Tab') contradict the activation policy and will not work. You
very likely want to use Focus follows mouse (mouse precedence) instead!"

**Shortcut conflicts** (plasma-desktop `kcms/keys/kcm_keys.cpp:379-406`; dialog title "Resolve
Shortcut Conflict", button "Reassign", warning icon): "Shortcut %1 is already assigned to action
%2 of %3. Reassign it to action %4 of %5?" Name the key, the current owner (action and app),
ask one question, name the button by the action. Several conflicts go in one dialog.

**Pending, undo, reset**: "These shortcuts will be deleted when changes are applied." [Undo];
per row "Undo deletion"; Reset "Reset all current changes to previous values"; leaving: "The
current page has unsaved changes. Apply the changes or discard them?" [Apply] [Discard]
[Cancel].

**Disabled, with the reason** (help button shown only while disabled): "Cannot change your own
username while logged in; log out and then log in as another user to change this account's
username." "To enable this option, add the 'Hide from Screenshots and Screen Recordings' button
to the titlebar first".

**Empty and missing**: "No touchpad found" / "Connect an external touchpad"; "No rules for
specific windows are currently set" / "Click Add New… to add some".

**Page introductions** (only for an unfamiliar feature): "File Search helps you quickly locate
your files. You can choose which folders and what types of file data are indexed." "You can
trigger an action by pushing the mouse pointer against the corresponding screen edge or corner."

**Help texts, one or two sentences**: "When enabled, pointer travel distance increases with
faster movement speed." "Two clicks within this duration are considered a double-click. Some
applications may not honor this setting." "Allows all Plasma panel and desktop widgets to show
descriptive tooltips when hovered with the pointer. This setting has no effect on the small
tooltips displayed when hovering over individual buttons and other user interface elements."

**Focus policy names** (Window Behavior): "Click to focus", "Click to focus (mouse
precedence)", "Focus follows mouse", "Focus follows mouse (mouse precedence)", "Focus under
mouse", "Focus strictly under mouse". Use these names when a page refers to them.

**Page metadata** (`kcm_*.json`): Name a noun phrase of the user's thing; Description one sentence
starting with a verb: "Screen Edges | Configure active screen corners and edges".

## 6. Where Plasma and its HIG disagree (follow the HIG)

- Plasma ships negative labels ("Disable while typing", "Disable while mouse is connected").
- Plasma ships labels far past 28 characters ("Allow apps to remember the positions of their own
  windows, if they support it"); acceptable for radio options under a lead-in, not for buttons.
- Mixed case in one combobox ("In Top-Left Corner" beside "Under mouse").
- "Add Property..." with three dots.
- The page "KWin Scripts", the HIG's own bad example.
- "You" in descriptions ("any text you type"); the HIG exempts descriptions and questions, never
  labels.
- Contractions: the old HIG banned them, the current is silent, Plasma uses them. A house choice.
- Old HIG allowed tabs and collapsed "Advanced" groups; the current HIG and the VDG say no.

## 7. Rewrites Plasma made, and why

| before | after | why (commit) |
|---|---|---|
| "Display informational tooltips on mouse hover" (label "Visual behavior:") | lead-in "Allow Plasma to show:" + "Panel and widget tooltips", help with the true scope | "vague language and omitting information about their scope" (plasma-desktop 86ca74053) |
| "Display visual feedback for status changes" | "OSD popups for status changes" | same |
| "Show delay:" | "Delay:" | ambiguous: "visually show a delay" (kwin 7a68c4518) |
| "Hide from Screencast" | "Hide from screenshots and screen recordings" | the real scope (kwin e74d9b6d8) |
| four names for one menu | "Window menu" | one name per thing (kwin 3156e90b3) |
| "Add" | "Add Desktop" | misread beside a spin box (kwin 351f613ef) |
| "Move Mouse to Focus" | "Center Pointer in Focused Window" | grammar, HIG, "pointer" not "mouse/cursor" (kwin 836ad3019) |
| "Allow legacy X11 apps to read keystrokes typed in all apps:" + "Never"… + a paragraph | "Listening for keystrokes:" + "Prohibited"… each with a "Most secure; …" subtitle; intro cut to two sentences | consequences at the control (kwin 1156aecc9) |
| "Device enabled", "Left-handed mode" | "Enable device", "Swap (left-handed mode)" under "Left and right buttons:" | labels start with a verb (plasma-desktop 36b5c6222) |
| "File indexing:" + "Enabled" | "Data to index:" + "Nothing (disable indexing entirely)" / … | a choice, not an on/off (same) |
| "System Notifications", "Custom…" | "Configure for System…", "Choose…" | buttons start with a verb (plasma-workspace f9b27563a) |
| "Protanopia (red weak)" under "Mode:" | "Red & purple (Protanopia)" under "Problematic colors:" | the reader's goal first, the term as a gloss (plasma-desktop 57416dece) |
| "You do not have permission to overwrite that scheme" | "This scheme is read-only. Please save the modifications with another name." | readers thought they couldn't change it at all (plasma-workspace 57ad557cd) |
| "Up:" / "Down:" (tablet dial) | "Clockwise:" / "Counterclockwise:" | the physical meaning (plasma-desktop 5945c92fb) |
| "KWin", "plasmashell" (Shortcuts components) | "Window Management", "Plasma Workspace" | no internal names (plasma-desktop ea2d29c71) |
| "…this action is undo-able" | "…this action can be undone" | plain words (plasma-desktop 987dc87ae) |
| tooltips on every mouse/touchpad control | deleted; two became help buttons | they repeated the visible text (plasma-desktop 3081084ed) |
| "Hint: To find out or configure how to activate an effect…" | deleted | obvious, now shown inline (kwin 4795daf39) |
