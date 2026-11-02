---
name: settings-pages
description: How to write and lay out a settings page that a newcomer understands at first read - wording of every label, checkbox, choice, description, help text, button and message, the layout of groups, rows and sub-pages, and the hard cases (changing another system's settings, shortcut conflicts, reviewing changes, first run, undo). Distilled from the KDE, GNOME, Apple, Microsoft and Android guidelines, design systems (GOV.UK, Carbon, Primer, PatternFly, Atlassian, Shopify) and usability research (Nielsen Norman Group, plain-language standards). Use it whenever a settings page, a configuration dialog, a KCM's QML, a preferences window, a sub-page, a help text or any user-facing control text is written, changed or reviewed - including a single label - and before showing such a page to anyone.
---

# Writing and laying out settings pages

A settings page is read by someone who wants one thing changed and has never read the docs. They
scan the left edge, read a label only when it might be theirs, and read a description only when
the label fails. Every word either helps that scan or slows it. The content can be right and the
page still fail: most failures are wording (a label that doesn't say what ticking it does) and
layout (a sentence split across a label and its control, a commit button the reader didn't
expect).

This skill is the method. The detail lives in `references/`:

| file | read it when |
|---|---|
| `references/wording.md` | writing or changing any string: labels, checkboxes, choices, descriptions, help, buttons, messages |
| `references/layout.md` | deciding what goes on the page, grouping, rows, which control, sub-pages, Apply/Reset/Defaults |
| `references/patterns.md` | the page changes another system's setting, reviews several changes, handles shortcut conflicts, undo, first run, a missing dependency |
| `references/kde.md` | the page is a KDE System Settings module (KCM) or Kirigami page: KDE's own rules and Plasma's real wording to copy |
| `references/review.md` | before calling a page done: the rubric, the tests, the one-row revision loop, before/after rewrites |
| `references/sources.md` | checking or citing a rule |

## The workflow

Follow it for a new page, a changed page, or a single new control.

1. **Model first.** For each setting, write one plain sentence: what is different for the reader
   when it is on (or for each choice). If the sentence is hard to write, the setting is wrong,
   not the wording: fix what it does, or give it a default and drop it (`layout.md` §1).
2. **Pick the control from the sentence** (`layout.md` §4): checkbox for on/off on a page with
   Apply; two radio buttons when one label can't say both states; a dropdown past five choices.
3. **Write each row by the revision loop** (`review.md`): keyword first, on state, no negation,
   no owner, no internal word; a description only for what the label can't carry.
4. **Group and order** (`layout.md` §2): by topic, most-used first, short noun headings, small
   groups; rare settings behind a sub-page whose button says what is inside.
5. **Hard cases** from `patterns.md`; on a KDE page, check `kde.md` for how Plasma words the same
   thing, and copy its wording where it fits.
6. **Review** (`review.md`): run the rubric, then T1 (say it aloud with on/off), T6 (left edge),
   T7 (titles and buttons alone). Screenshot the page and read the screenshot.
7. **Newcomer test (T3)**: give a fresh sub-agent only the screenshot or the strings, no code and
   no docs, and ask, per row: what does this do, what happens when it's ticked, how do you get
   back? Every wrong or hesitant answer is a wording bug. Fix and repeat.
8. **Remove one thing**, then stop.

## The rules that matter most

These cover most failures. Each has its sources in the reference files.

1. **A checkbox label is the on state: what is true when it's ticked.** Say it aloud with "on"
   and "off"; if either needs thought, rewrite. Never "Disable…", "Don't…", "Hide…" where the
   tick means yes. (`wording.md` 10-12)
2. **A label and its control never depend on each other to make sense.** The one allowed shape
   (KDE) is a lead-in that every option completes naturally ("Allow Plasma to show:" / "Panel
   and widget tooltips"), each option still readable alone. No pronoun pointing across the gap.
   (16; `kde.md` 12)
3. **Name the behaviour, never the owner.** No "Plasma:" / "kwin-i3:" rows. The owner goes once,
   in help or a description. (8, 59)
4. **Keyword first, short, no repeats of the heading.** No longer than "Configure Keyboard
   Shortcuts". (2-5)
5. **A description only when it adds a consequence; one line; never repeats the label.** For a
   sub-page button or a value, the muted line is the current value. (22-25)
6. **Everything needed to decide is on screen**; help buttons and tooltips hold only extra. (27)
7. **The reader's words.** No internal names, keys, codenames; one word per thing on the page.
   (9, 31)
8. **Neutral and impersonal**: no "you", "your", "my", "now", "please", "oops", no "!". (39-41)
9. **Buttons say what happens, verb + object**, never where ("Change in Plasma" failed: the
   reader was already in Plasma). (47-48)
10. **One commit model per page.** On a KDE page, every edit waits for the shell's Apply; no
    private commit buttons beside it; no switches. Apply never changes something the reader
    hasn't seen, and controls show the current state, not a suggestion. (`layout.md` 26-29)
11. **Changing another system's setting**: say what the reader gets, whose it is, and how it comes
    back, in that order; show its current state. (`patterns.md` P1)
12. **Reversible, and said once where not obvious**: "Unticking this restores the previous
    value." "Defaults" means the product's defaults; "restore" means the reader's own. (P4)

## When the guides disagree

The platforms differ on a few things (switch labels as nouns or verb phrases, pronouns, capital
letters, a description under every row). The page's platform decides: on a KDE page, the KDE HIG
and Plasma's own pages (`kde.md`). Where KDE is silent, use what most sources agree on, and note
the choice in the project's style guide.

## Project style guides

A project keeps its own decisions (its glossary, its section order, its special cases) in its own
style guide; this skill is the method and the rules beneath it. Read both. Where a project rule
contradicts this skill, raise it rather than silently following either.
