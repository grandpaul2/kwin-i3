# Reviewing a settings page

How to test wording and layout before calling a page done: the rubric, then the tests, then the
revision loop for one row. Sources in `sources.md`.

## The rubric

Every line scores 0 or 1; fix every 0 before the page goes to anyone.

1. Every checkbox label is its on state; passes the say-it-aloud test (T1); no negation.
2. No sentence spans a label and a control, or two controls.
3. No two rows in a group share their first two words unless a group label carries them.
4. No internal name, codename, file, class or setting key in any visible text.
5. One word per thing across the page (and its sub-pages).
6. Each description adds a consequence and never repeats its label; one line each.
7. Where an effect isn't obvious (delay, scope, another system, undo), the row says it.
8. A setting owned by another system says whose it is and how it comes back (`patterns.md` P1).
9. The control matches the commit model (checkbox with Apply; switch only without), and the
   page has one commit model.
10. Nothing needed to decide lives only in a tooltip or help button.
11. Common settings first; rare ones behind a sub-page whose button says what is inside.
12. Buttons say what happens, verb + object; none says where.
13. No "you", "your", "my", "now", "please", "oops"; no exclamation marks.
14. A newcomer can say what each row does after one read (T3).
15. No control's presence depends on state (T10): the same rows exist whether a setting is at its
    default, already right, changed by the product, or its dependency is missing. State changes
    what a control shows (ticked, disabled, its muted line), never whether it is there. The only
    exceptions: hardware that isn't there, a state message, a note that applies only in one state,
    and a reveal the reader chose (a field that appears under the choice that needs it).

## The tests

**T1. Say it aloud with "on" and "off".** Read each checkbox label, add "on", then "off". Any
hesitation, question or double negative: rewrite as the on state. NNG-TOG.

**T2. Read the page as a dialogue.** Headings, descriptions and messages are the product's lines;
controls are the reader's. Read the exchange aloud; reword any line nobody would say. SMASH,
Podmajersky's conversation method.

**T3. Explain it back (newcomer test).** Show the row or page to someone outside the project.
Ask: what does this do? what happens if it's ticked? how do you get back? Any wrong or hesitant
answer is a rewrite. INTUIT, ALA-TEST.
- With no person at hand, an agent stands in: give a fresh sub-agent **only the screenshot or the
  strings, no code and no docs**, and ask exactly those three questions per row. Compare its
  answers with what the code does. A wrong answer is a wording bug, not the agent's fault.

**T4. Highlighter.** Mark each phrase green (clear, needed), pink (confusing) or orange
(unneeded). Rewrite pink, delete orange. A GOV.UK technique.

**T5. Cloze.** Chain the page's descriptions to 125 words or more, delete every fifth word, have
a reader fill the blanks. 60% or more exact is fine; under 40%, rewrite. ALA-TEST.

**T6. Left edge only.** Cover all but the first three words of each row and heading. Can rows be
told apart and guessed? KDE-TXT, NNG-READ.

**T7. Titles and buttons alone.** Read only headings and buttons. Do they still mean something?
SMASH.

**T8. Readability score as a smoke alarm.** Flesch-Kincaid grade 6-8 for a general audience.
It measures only length; never treat it as a judge. ALA-TEST, NNG-PL.

**T10. Every state, side by side.** List the states the page's model tells apart (the product's
defaults, the platform's stock settings, already as the product needs, changed by the product,
a dependency off or not running). Screenshot the page in each, and compare the set of rows. Any row
that appears in one and not another is a finding unless rubric line 15 excuses it. Screenshots in
one state can't show what's missing, and neither can a newcomer reading them: this is the only test
that catches a hidden control.

**T11. Read what decides visibility.** Search the page's code for every place that shows or hides
something (`visible:`, model filters, rows skipped in a loop that builds the list) and justify each
against rubric line 15. Wording reviews read strings; this one reads the logic.

**T9. Screenshot it.** Look at every changed page, at the platform's normal size, before saying it
is done. Then remove one thing.

## The revision loop for one row

1. Write what the control does in one plain sentence, in the reader's world.
2. Name the on state: what is different when it is ticked.
3. Cut to a label: keyword first, no negation, no owner, no internal word.
4. T1.
5. Does it need a description? Only for what the label can't carry: consequence, scope, delay,
   another system, way back. One line.
6. Remove any word the heading, label or group label already says.
7. Check every term against the glossary of the page.
8. T3 on any row that still feels hard.

## Before/after (from the sources)

| before | after | why | source |
|---|---|---|---|
| Use tactile feedback | Vibrate on tap | plain, specific | M1 |
| Provide internet to other devices through your mobile data connection | Hotspot | direct | M1 |
| Screen timeout / Adjust the delay before the screen automatically turns off | Sleep / After 10 minutes of inactivity | description shows state, doesn't repeat | M1 |
| When disabled, prevent the system from going to sleep | Allow the system to go to sleep | positive | KDE-TXT |
| Info | Show Info | imperative verb | KDE-TXT |
| Re-Assign Key Binding to this Action | Re-Assign Shortcut | context carries the subject | KDE-TXT |
| KWin Scripts | Window Management Plug-Ins | no internal name | KDE-TXT |
| Do you want to receive email notifications from us? | Email notifications | label is the on state | NNG-TOG |
| Notify me | Notifications | impersonal | AND |
| Enabled encryption of installed disks | Encrypt installed disks | no state word | PF-SW |
| Restrict installation on a per-user basis | Install only for me | the reader's words | MS-SETUP |
| Accessibility Options | Accessibility | no "Options" suffix | MS-CP |
| Are you sure you want to do this? Yes / No | Delete File / Keep File | buttons name the outcome | NNG-CONF |
| Don't use special characters, spaces, or symbols | Use only numbers and letters | positive | SMASH |
| OTP code | 6-digit code | no jargon | SMASH |

## Before/after (this project's own page, kept as lessons)

| before | what was wrong | after |
|---|---|---|
| "Plasma's shortcuts:" + checkbox "Take kwin-i3's keys from them" | a sentence split across label and checkbox; "them" refers to the label; a possession fight; the checked state doesn't say what the reader gets | checkbox "Use kwin-i3's keys instead of Plasma's"; under it "Unticking this restores Plasma's original keys." |
| help: "Configure Keys… takes them one at a time instead" | misled: presented an alternative where there was none | say what ticking does, and what unticking does |
| rows "Plasma: A click focuses a window." / "kwin-i3: The window under the pointer has the focus, at once" | owner as the name; two different sentence shapes; "now" and possession words | radio pair or checkbox named by the behaviour: "Focus follows the mouse" |
| button "Change in Plasma" | said where, not what; the reader is in Plasma | no button: the page's Apply |
| "now: Click to focus, after 300 ms" | "now" with no clear meaning; a setting's value shown as raw words | the behaviour in a sentence, or the value in the row's own control |
