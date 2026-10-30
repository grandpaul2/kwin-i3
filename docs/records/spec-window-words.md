# Spec: what kwin-i3 calls a window (tiled, floating, places itself)

**Now (2026-10-27):** Built and live 2026-10-27. **Superseded the same evening** (Paul, reviewing
the focus rules): the kinds follow i3, down to the names: tiling, floating, sticky floating, dock,
root, override-redirect (`behaviour.md` §3). "Places itself" held kinds i3 keeps apart, and the
focus rules grew exceptions for it. The settings page follows i3's names too, kept super
descriptive and explicit; plainer wording comes later (`OPEN.md` item 40).

Paul, 2026-10-27: clear up the line between i3 and Plasma in the window rules; "floated" and
"Plasma window" have been used for nearly the same thing. Status: **Paul's go 2026-10-27, built.** The rule lists keep their explanation lines under each heading (the page's existing shape) rather than help buttons.
Wording only: no behaviour, no `kwinrc` key and no action changes.

## Decided (Paul, 2026-10-27)

- **kwin-i3 is the window manager**, said plainly, not "here if you need it": its workspaces,
  monitors and keyboard focus apply to every window. No soft lie.
- **Each window has one arranger**, and the three names say who:
  - **Tiled**: the tree places it (with the frame, title bars or bare: `tiledLook`).
  - **Floating**: you place it. kwin-i3 still holds it on its workspace, keeps it above the tiled
    windows (except on a workspace whose new windows float), moves and resizes it by key, and
    Meta+Space reaches it. It looks like a Plasma window: its own title bar and theme.
  - **Places itself**: the app or Plasma places it (KRunner, panel popups, Yakuake). kwin-i3 never
    tiles, floats, moves, resizes or frames it; it still lives on a workspace, and a focus key
    takes the keyboard from it.
- **"Plasma window" stops being a mode's name.** "Plasma" describes only a look ("its own title
  bar, as a Plasma window").
- **Not "leave alone", "don't manage" or "unmanaged"** in anything a user reads: none is true,
  and "not managed" sends the user looking for where it is managed. The code keeps its own
  words (`ignoreClass`, `wins[]`, "unmanaged" in comments and specs).
- The words are explicit for now, as the page is; plainer ones can come with the settings page's
  finishing (`LATER.md`, "The settings page").

## Where the words change

**Settings page** (`kcm/ui/`)
- Window Rules sub-page: the list "Leave alone" → **"Places itself"**, with a help button:
  "kwin-i3 never tiles, floats, moves or resizes these windows: the app or Plasma places them.
  They still live on a workspace, and a focus key takes the keyboard from them." "Always float"
  stays, with its own help: "These open floating: you place them, kwin-i3 keeps them on their
  workspace and above the tiled windows." The accessible names follow ("Pick a window for
  “Places itself”", "Remove Application: krunner from “Places itself”").
- The main page's summary beside Configure Window Rules…: "13 left alone, none floated" →
  "13 place themselves, none always float".
- Workspaces sub-page: the column's choices "Tiled" / "Plasma windows" → **"Tiled" / "Floating"**
  (`@item:inlistbox new windows are`); its note "Plasma windows float, with their own title bar"
  → "Floating windows have their own title bar, as Plasma windows do"; its help "Meta+Shift+Space
  tiles a Plasma window or floats a tiled one" → "… tiles a floating window …". The main page's
  summary "1 for Plasma windows" → "1 floating".

**The cog's form** (`package/contents/ui/config.ui`, wording only, decision 4 of the cleanup)
- "Plasma windows on workspaces:" → "Workspaces where new windows float:".
- "Leave alone, applications:" / "roles:" → "Places itself, applications:" / "roles:"; the
  tooltip "…kwin-i3 leaves alone: they float and keep their own place" (wrong: they don't float)
  → the help text above, shortened.

**README**: the `floatingWorkspaces` and `ignoreClass`/`ignoreRole` rows in Configuration; a
short paragraph under Keys or Configuration naming the three kinds; and the third kind as a
divergence: i3 has no such tier (it manages every window but docks and override-redirect
popups); it exists because KWin is the layer under kwin-i3 and some of Plasma's windows place
themselves.

**Docs**: `docs/style-settings-page.md` gains the three names as a rule (§2, Wording);
`docs/plan.md` "Window modes" says "floating" where it says Plasma's mode;
`docs/records/spec-window-modes.md` gets a superseded-in-part line pointing here.

**Tests**: `76-settings-subpages` finds the rule list by its accessible name, so its six
"Leave alone" names change with it (not new checks); 37 only if it names "Plasma windows" (it
doesn't today). Run after the change, per `docs/testing.md`: `make unit`, 37 and 76. A screenshot
of both sub-pages, read before it's called done (style guide, §9).

**Not changed**: `kwinrc` keys, actions, comments and scenario names in the code
(62-plasma-windows keeps its name).
