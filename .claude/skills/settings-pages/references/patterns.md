# Patterns for hard cases

Whole-page patterns for the situations plain rows don't cover: a page that changes another
system's settings, a review before a change, shortcut conflicts, first run, reversibility. Each
has when to use it, its anatomy, and a wording template. Source keys in `sources.md`.

## P1. A setting that changes another system's setting

When: the page offers to change a setting owned by the desktop or another program (focus policy,
another program's shortcuts).

- First choice: **don't**. Read the other setting and show its state, linking to where it lives.
  APPLE-SET: a copy "implies that systemwide settings may not apply to your app … and that
  changing your custom version of a global setting may affect other apps".
- If the page must change it, the row says, in this order: **what the reader gets; whose setting
  it is; how to get it back**. [Inference, from NNG-CHK, NNG-CONF, APPLE-SET.]
- Name the behaviour in the control, the owner in the description or help.
- The control shows the **current** state of the other system's setting (ticked when it already
  has the value), so the page never claims to change what is already so. MS-CP.

Template (checkbox, KDE):
- Label: the behaviour the reader gets, as the on state. "Focus follows the mouse"
- Description (one line): whose setting and the way back. "Plasma's focus setting. Unticking
  this restores the previous one."

## P2. Review before changing several settings (check your answers)

When: one place proposes several changes at once, especially to another system. GOV-CA, GOV-SL,
PF-WIZ (final Review step).

Anatomy: a title saying what to do; a row per change with what it is now and what it becomes;
a way to change each; one sentence saying nothing changes until the commit; one commit control
naming the action.

On a KDE System Settings page the commit is the shell's Apply: the rows are checkboxes, and the
page says once, at the top, that ticked rows change on Apply.

Template:
- Note: "Ticked settings change when Apply is pressed. Unticking one restores the previous value."
- Row: name (noun, the behaviour); "Now:"/"After:" pairs are a wording smell, prefer a radio pair
  whose two labels are the two behaviours, or a checkbox whose label is the new behaviour and
  whose description is the current one.

## P3. Shortcut conflicts

When: a key the page assigns is held by another action.

- **Say which action holds it, in quotes, and what will happen to it, in the same sentence.**
  GNOME: "This key combination is already being used for “%s”. This shortcut will be disabled."
  (Its source comment: "let it be very clear that adding this shortcut will disable the other".)
- macOS marks conflicting shortcuts with a warning icon and the new one "won't work": block, don't
  replace silently.
- KDE's Shortcuts page: see `kde.md` for its exact conflict text.
- A switch that resolves all conflicts at once states its effect on the other shortcuts and the
  way back, not a list of keys. The list belongs on the keys page, per row.

## P4. Reversible changes

- **Make it reversible and say so where it isn't obvious**, in one clause: "Unticking this
  restores the previous value." NNG-CONF ("Undo is the stronger safeguard").
- Don't add "You can change this later" to ordinary settings; every setting can be. MS-SETUP:
  remove the anxious decision instead of reassuring. Only a one-time step that looks permanent
  needs it.
- "Restore" means the reader's previous value; "Defaults" means the product's. Never mix.

## P5. First run

- **Prefer no first-run step**: safe defaults, settings found later. MS-SETUP ("Eliminate Welcome
  pages"; "Defer any options … better addressed in the context of the running program").
- If something has no safe default, **one page, the fewest questions, the commit named by its
  action**, never "Next" on the last page. MS-SETUP, PF-WIZ.
- Point to it from where the reader already is (a banner on the settings page), once, with a
  dismiss. PRI-ONB.
- A first-run list of tasks done in any order: GOV.UK task list, each with a status. GOV-TL.

## P6. A dependency is missing

- One inline message at the top: what is missing and what it costs, in a short list of at most
  three, then the one action that fixes it. CAR-NOT, SHOP-BANNER.
- Controls that need it stay visible and disabled, with the reason beside them. MS-APPSET.

## P7. Danger zone

- Irreversible or wide-reaching actions in a separate group at the end, each a row with one
  sentence on its effect and a button repeating the action; a two-step confirmation for the
  irreversible. GH-DEL, GOV-BTN.

## P8. Main switch over related settings

- One switch at the top of a group or page turns the whole feature on or off; while off, the
  dependants are disabled, not hidden. AND, SHOP-SWITCH.
