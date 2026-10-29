# Spec: kwin-i3's keys on non-US keyboard layouts (OPEN.md item 9)

**Now (2026-10-28):** Built and live 2026-10-25; the letters follow position too since refinement stage 6 (Paul's call 36: i3's keycode config, `spec-refine-build.md`), so "Letters stay as named" below is superseded; the helper's record is `~/.config/kwini3helperrc`, not `[Script-kwin-i3]`. What it does: `behaviour.md` §8, "Keyboard layouts".

Paul's go 2026-10-25 (the helper plugin; the digit row and `;`, his call deferred to the
recommendation). Built the same day.

## How KWin matches a key (read from the 6.7.5 sources, 2026-10-25)

- KWin passes the shortcut system the key's **symbol in the current layout, with the modifiers
  that produced it removed**: `Xkb::modifiersRelevantForGlobalShortcuts` (`src/xkb.cpp:903`)
  drops Shift when Shift is what made a non-letter symbol. Meta+Shift+2 on a US layout arrives as
  Meta+@ (`src/input.cpp:1078` → `GlobalShortcutsManager::processKey`).
- kglobalacceld then looks for an **exact** match of that key combination
  (`globalshortcutsregistry.cpp:408`, `activeShortcutByKey`; its normalisation only merges
  Shift+Tab and Backtab, `sequencehelpers_p.cpp:116`).
- So a shortcut is a symbol, never a key position: "register by key position" (the item's
  second idea) is not possible through kglobalaccel. What remains is to **register the symbols the
  user's layout types**.

## What breaks today

kwin-i3 registers US symbols:

| Layout | What breaks |
|---|---|
| German (QWERTZ) | Meta+Shift+2/3/6/7/8/9/0 (`"` `§` `&` `/` `(` `)` `=`). The `;` position is `ö`, so Meta+ö does nothing, and Focus Right (;), Grow Width (;) and Move Right (:) fire on Meta+Shift+, / Meta+Ctrl+Shift+, / Meta+Shift+. instead, away from J K L |
| UK | Meta+Shift+2 (`"`) and 3 (`£`) |
| French (AZERTY) | **Meta+1..0 too**: unshifted, the top row types `&é"'(-è_çà`. Shift gives the digits, so Meta+Shift+1 arrives as Meta+1, which is Workspace 1: it switches instead of moving |

i3 has the same problem: its `bindsym` is by symbol, and `i3-config-wizard` writes the default
config from **key codes** turned into the user's layout's symbols, so i3's default keys follow
key position.

## The change

**Which keys follow position** (for Paul, below): the digit row (Workspace N: the key's
unshifted symbol; Move to Workspace N: its Shift symbol) and the `;` key (Focus Right (;),
Grow Width (;): unshifted; Move Right (:): Shift). Letters stay as named (Meta+F is the key
labelled F): their meaning is the letter, and on QWERTZ and AZERTY J, K, L sit where they are on
US.

**Where**: `kwini3helper` (the optional KWin plugin) reads the keymap KWin itself matches against
(`Xkb::keymap()`, public): for each of those key codes, the **current layout's** level-1 and
level-2 symbols (`xkb_keymap_key_get_syms_by_level`), as KWin turns them into a shortcut
(`Xkb::toQtKey` with Ctrl when Meta is held, `keyboard_input.cpp:312`; a letter keeps Shift). It
sets the matching kwin-i3 actions' keys through kglobalaccel:

- **when**: when the script asks, once its keys are registered (a D-Bus call from the script to
  the helper at load), when the layout is switched (`KeyboardLayout::layoutChanged`), and when
  layouts are added, removed or reordered (`layoutsReconfigured`);
- **only keys the user hasn't changed**: an action whose current keys are kwin-i3's US default,
  or the set the helper last gave it (kept in `[Script-kwin-i3]`), is updated. One the user bound
  to something else is left alone;
- **several layouts** (`us,de`, switched with a key): KWin matches the current layout's symbol
  only, so the keys follow the switch. One symbol can mean different actions in two layouts (`&`
  is Shift+7 on US and Shift+6 on German; Meta+1 is Workspace 1 on US and Move to Workspace 1 on
  AZERTY), so fitting every layout at once can't work: the first try did, and Meta+Shift+6 on
  German moved to 7. One fit runs at a time (a quick us → de → us flip would otherwise leave
  German keys on US); a key moving between two actions is held by both for the moment between
  their sets, which kglobalaccel allows (`GlobalShortcut::setKeys`), and the burst ends with each
  key on one action;
- **a US layout**: nothing changes. The symbols are the defaults.

**Without the plugins** (they are optional): the script can't read the keymap. At load it asks
`org.kde.keyboard` (`/Layouts`, `getLayoutsList`) for the configured layouts. If any is not plain
`us`, the load notification says the workspace keys may not fit the layout. The fix is
`make plugin-install`, or binding them on the settings page or in System Settings > Shortcuts,
which record the symbol the key types. A part of the existing one notification at load, with
`warnTakenKeys` turning it off as for the taken keys.

**The taken-keys check** reads the keys at load, likely before the helper's change lands: a fitted
key another shortcut holds is named at the next load.

## Tests

- **Unit**: the plugin's table names registered actions with their registered US keys
  (`tests/unit/kcm.test.js`). The mapping itself is KWin's own calls on the real keymap, so it is
  tested live, not against a copy of xkb's tables.
- **Live**, on a test KWin with `kxkbrc [Layout] LayoutList=de` (its own config dir), keys
  injected by key code (`tools/inject.py`): Meta+Shift+2 moves to workspace 2; Meta+Shift+(the
  `;` key, ö) moves right; Meta+2 still switches. The same with `fr`: Meta+(the 1 key)
  switches to 1 and Meta+Shift+(the 1 key) moves. With `us,de` and `us,fr`: each layout's keys work after a
  layout switch. A key the user rebound is kept. With no plugins and `de`: the notification part.
- Watched red first: the scenario before the code (today's keys fail on `de`), then a fault.

## Known limits (review, 2026-10-25)

- **A letter at a position**: on AZERTY the `;` position is `m`, so Focus Right is Meta+M (and
  Meta+Ctrl+M, Meta+Shift+M); on Dvorak `s`. As i3's wizard would. If another shortcut holds it,
  the first holder wins; the taken-keys check runs before the fit lands, so it names such a key
  at the next load.
- **The user's keys are recognised by value**: a key set by hand to exactly kwin-i3's US default,
  or to what the helper last gave it, counts as kwin-i3's and follows the layout.
- **A layout with no symbol at a position** empties that action (recorded as "none", so it is
  refitted when a layout has one again).
- **The plan the helper publishes** (`Plan`, for the tests) appears only once kglobalaccel has
  confirmed every change.
- **Not reproduced live**: the one-fit-at-a-time guard and the plan published after the keys land
  are kept on the review's reasoning; with either removed, 69 stayed green (the test KWin's D-Bus
  round trips finish before a second layout switch can be sent). 69's quick flip checks the
  outcome. Every other part was watched red under a fault (fits nothing, no refit on a switch,
  the user's key overwritten, no notice without the helper).

