# Spec: kwin-i3's keys on non-US keyboard layouts (OPEN.md item 9)

Draft 2026-10-25, for Paul's go.

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
(`Xkb::keymap()`, public): for each of those key codes and each layout in the keymap, the level-1
and level-2 symbols (`xkb_keymap_key_get_syms_by_level`), as Qt keys (KWin's `Xkb::toQtKey`
rule: a letter keeps Shift). It sets the matching kwin-i3 actions' keys through kglobalaccel:

- **when**: when the script asks, once its keys are registered (a D-Bus call from the script to
  the helper at load), and when the keymap changes (layouts added, removed or reordered in System
  Settings);
- **only keys the user hasn't changed**: an action whose current keys are kwin-i3's US default,
  or the set the helper last gave it (kept in `[Script-kwin-i3]`), is updated. One the user bound
  to something else is left alone;
- **several layouts** (`us,de`, switched with a key): each action gets one key per layout whose
  symbol differs, since KWin matches the current layout's symbol. When two layouts would give
  the same key to different actions (`us,fr`: Meta+1 is Workspace 1 on US and Move to Workspace 1
  on French), the first layout wins, and the clash goes in the load notification;
- **a US layout**: nothing changes. The symbols are the defaults.

**Without the plugins** (they are optional): the script can't read the keymap. At load it asks
`org.kde.keyboard` (`/Layouts`, `getLayoutsList`) for the configured layouts. If any is not plain
`us`, the load notification says the workspace keys may not fit the layout. The fix is
`make plugin-install`, or binding them on the settings page or in System Settings > Shortcuts,
which record the symbol the key types. A part of the existing one notification at load, with
`warnTakenKeys` turning it off as for the taken keys.

**The taken-keys check** runs on the keys after the helper's change, since it reads the actions'
current keys.

## Tests

- **Unit**: the mapping from (layout, key, level) symbols to the actions' keys, and the
  multi-layout union with its clash rule, as a pure function in node, with the symbols of
  us, de, gb and fr as data.
- **Live**, on a test KWin with `kxkbrc [Layout] LayoutList=de` (its own config dir), keys
  injected by key code (`tools/inject.py`): Meta+Shift+2 moves to workspace 2; Meta+Shift+.
  (the `:` position) moves right; Meta+2 still switches. The same with `fr`: Meta+(the 1 key)
  switches to 1 and Meta+Shift+(the 1 key) moves. With `us,de`: both layouts' keys work after a
  layout switch. A key the user rebound is kept. With no plugins and `de`: the notification part.
- Watched red first: the scenario before the code (today's keys fail on `de`), then a fault.

## For Paul

1. **Which keys follow position**: the digit row and `;` (recommended: what's broken, and the
   keys whose meaning is a position), or everything, as i3's wizard does (Meta+Shift+Q would be
   Meta+Shift+A on AZERTY).
2. **Where**: the helper plugin, automatic, plus a notice without it (recommended); or a one-off
   tool (`make layout-keys`, reading the configured layouts with libxkbcommon), which works
   without the plugins but must be re-run when the layouts change.
