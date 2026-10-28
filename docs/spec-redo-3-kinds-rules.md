# Spec: redo stage 3, kinds and rules (OPEN.md item 40)

**Now (2026-10-28):** Draft for the review of all ten stages (`spec-i3-redo-build.md`). Nothing
built.

**The rows**: `behaviour.md` §3's kinds that differ (Spectacle, the password prompt, KRuler,
plasmashell's ordinary windows to floating), R2, R4, R5, R9, X2, and §11 N12 (`assign`), N13
(`floatingWorkspaces` as a criterion), N15 (floating sizes), all decided (Paul, 2026-10-27).
**Not here**: Yakuake's kind, sticky floating, is stage 9's (R3, X4); until then a window on all
virtual desktops is kept out of the tree, as today.

## What happens today, from the sources

**kwin-i3**: `src/rules.js` `classify` returns `ignore`, `float` or `tile`, first match wins:
deleted, not Normal, a popup or special window → ignore; on all desktops or **skips the taskbar**
→ ignore; `ignoreClass` (class or instance) or `ignoreRole` → ignore; transient, modal, fixed
size → float; dialog, splash, utility → float (never reached: KWin's `normalWindow` is false for
those, so the first line took them, R2); the capture note → float; `floatingClass` (exact,
case-sensitive) or `floatingTitle` (substring) → float; else tile. `reclassify` reruns it on a
change of title, class, transience or readiness, and follows a changed verdict both ways.
Defaults: `ignoreClass` = krunner, yakuake, spectacle, kded5, xwaylandvideobridge, plasmashell,
ksplashqml, org.kde.plasmashell, org.kde.polkit-kde-authentication-agent-1, org.kde.kruler,
kruler, kwin_wayland, ksmserver-logout-greeter; `ignoreRole` = quake. **Paul's kwinrc** sets
`floatingTitle=STAGE (streamed),Picture-in-Picture`.

**i3 4.24**:

- **Floats at manage** (`manage.c:466-476`, `:486-500`): types dialog, utility, toolbar,
  notification, splash; `_NET_WM_STATE_MODAL`; min = max; on all desktops (sticky too); a
  transient, or a window whose leader is managed. Docks and override-redirect windows are never
  managed.
- **`for_window [criteria] command`** (`assignments.c` `run_assignments`): run at manage and again
  on a title, class, role or type change, **each rule at most once per window**, only to apply it;
  after the manage-time float, so `floating disable` overrides it.
- **Criteria** (`match.c`, `regex.c`): `class`, `instance`, `title`, `window_role`,
  `window_type`, `workspace`, `floating`, `tiling`, `all`, and others (`id`, `con_id`, `con_mark`,
  `urgent`, `machine`); each a PCRE2 regex (UTF, Unicode classes), case-sensitive, all in one rule
  must match.
- **`assign [criteria] → workspace`** (`manage.c:289-317`, `:357`): at manage only, first in the
  order; a hidden target isn't shown and doesn't take focus (i3 marks it urgent). `assign … output
  X` (`A_TO_OUTPUT`): to that output's visible workspace.
- **`floating_minimum_size` / `floating_maximum_size`** (`floating.c:186-228`): applied when a window
  floats. `0` (the default) means 75x50 and **all outputs combined**; `-1` means no limit.

**KWin 6.7.5**: on Wayland, `resourceClass` is the app id and `resourceName` the process's name
(`xdgshellwindow.cpp:1033`); on X11, `WM_CLASS`'s class and instance (`x11window.cpp:3012`).

## Design

### A. The kinds (`src/rules.js`)

`classify(w)` returns one of i3's kinds: `override-redirect`, `dock`, `root` (all three kept out
of the tree), `floating`, `tiling`; stage 9 adds `sticky`. Stage 2's `i3Kind` is its first half.
First match wins:

1. Deleted → override-redirect (nothing to place, R17).
2. The desktop window → root; a dock (a panel) → dock.
3. Popups, menus, tooltips, notifications (critical too), OSDs, applet popups → override-redirect.
4. **The built-in list** (R5): `kded5`, `kded6`, `xwaylandvideobridge`, `ksplashqml`,
   `kwin_wayland`, `krunner`, `ksmserver-logout-greeter` (class or instance) → override-redirect;
   `plasmashell` / `org.kde.plasmashell` too, until its panel-configuration and edit-mode windows
   are read (below).
   Plasma makes them Normal windows where i3 would never see them. Not a setting.
5. On all virtual desktops → kept out (stage 9: sticky floating); on two or more but not all → not
   adopted until it is on one (R13, as today).
6. **The default float** (i3's manage): transient, modal, fixed size (R6); types dialog, utility,
   toolbar, splash, for X11 windows too (an X11 notification window already met 3: KWin gives it
   the same type as Plasma's notifications, so it is override-redirect, ≠ i3, which floats it) (R2: KWin's `normalWindow` no longer gates
   these; the X11 dialog of an Xwayland app floats, as i3); the capture note (R8). Skipping the
   taskbar decides nothing (R4).
7. **`forWindow`'s rules** (B), in order, each that matches applying `floating enable` or
   `floating disable`: the last one wins, and they override 6.
8. Otherwise tiling.

**The order inside `adoptWindow`**: the target workspace first (stage 1's A, with `assign` as its
case 0), then `classify(w, T)`, so the `workspace` criterion matches the workspace the window
opens on, as in i3 (`run_assignments` runs after the window is placed). Today `classify` runs
before `wsForWindow` (`src/kwin.js` `adoptWindow`); the two swap.

### B. The rules: `forWindow` and `assign` (R9, X2, N12, N13)

Two settings in i3's own syntax, one rule per line (kwinrc keeps the line breaks):

```
forWindow=[class="^org\.kde\.spectacle$"] floating enable
          [title="Picture-in-Picture"] floating enable
assign=[class="^steam$"] → 5
       [class="^discord$"] output DP-6
```

- **Criteria**: `class`, `instance`, `title`, `window_role`, `window_type` (`normal`, `dialog`,
  `utility`, `toolbar`, `splash`, `notification`), `workspace` (`forWindow` only: the workspace
  the window opened on), `floating`, `tiling` (its kind from A6), `all`. Each a JavaScript regular
  expression with the `u` flag, case-sensitive; all in one rule must match. Not taken, each with
  its reason: `id` and `con_id` (X11 ids; Wayland windows have none), `con_mark` and `urgent`
  (marks and urgency are out), `machine` (Wayland windows have none), `__focused__` (nothing is
  focused yet at a window's opening). A pattern JavaScript can't compile (PCRE's possessive
  quantifiers, atomic groups) skips that rule with a `WARN`, like a bad list entry today.
- **`forWindow` commands**: `floating enable`, `floating disable` (R9 decided only these; another
  command is a `WARN` and skipped).
- **When a rule runs** (X2, i3's `run_assignments`): at adoption, and on a change of title, class,
  role or type, **each rule at most once per window** (kwin-i3 records which ran), only to apply
  it: a window whose title stops matching stays as it is. A hand toggle (Meta+Shift+Space) stays
  until a rule that hasn't run yet matches. A changed setting runs every rule anew on every
  window (each window's record cleared), as a reload would in i3.
- **`assign`** (N12): at adoption only, before every other choice of workspace (stage 1's A, case
  0): `→ N` (or `workspace N`, `number N`) opens the window on workspace N, shown or not, without
  switching an output and without the focus if N is hidden (i3: urgent; there's no urgency here,
  so it just waits there); `output X` opens it on X's visible workspace. A rule `assign` names
  can't name a workspace beyond 10 (`WARN`, skipped).
- **The defaults** (`forWindow`): the floating kinds of §3, `[class="^org\.kde\.spectacle$"]`,
  `[class="^org\.kde\.polkit-kde-authentication-agent-1$"]`, `[class="^(org\.kde\.)?kruler$"]`,
  `[class="^(org\.kde\.)?plasmashell$" window_type="normal"]`, each `floating enable`; the
  classes confirmed by the live read below before building. **plasmashell stays on the built-in
  override-redirect list until the live read** has seen its panel configuration and edit-mode
  windows: adopting those into the tree is what `docs/bug-panel-config.md` warns about. A user can delete one and see the
  tool tile.

### C. The old settings (`ignoreClass`, `ignoreRole`, `floatingClass`, `floatingTitle`, `floatingWorkspaces`)

Read on as rules, so nothing a user set changes at the update, Paul's two titles included
(the ignore lists' part: call 43, Paul 2026-10-28):
`floatingClass` X → `[class="^X$"] floating enable` and the same for `instance`;
`floatingTitle` X → `[title="X"]` with X's special characters escaped (a substring, as now);
`floatingWorkspaces` N → `[workspace="^N$"] floating enable`. An `ignoreClass` or `ignoreRole`
entry that isn't a default can't become override-redirect (R5: a user can't make a window
override-redirect). It reads as `floating enable`, and the load report (§13) says so once, naming the
entries (call 43). The defaults of the two ignore lists go. Stage 10's settings page writes the new
keys and removes the old; until then the Configure form shows both.

### D. Floating sizes (N15)

`floatingMinimumSize` (default `75x50`) and `floatingMaximumSize` (default `0x0`: all outputs
combined; `-1x-1`: none), in i3's syntax. Applied where a window becomes floating (adoption,
X1's toggle, a rule): its size clamped, then KWin's own floor applies (a decorated window is at
least about 150 px wide, so a minimum below that changes nothing there). §3 "A floating window's
size" and §11 N15 rewritten with i3's real default (all outputs, not one).

### E. The settings page in the meantime (call 32)

The Window Rules sub-page reads and writes `forWindow` and `assign` as plain text, one rule per
line, with i3's syntax shown under it, and keeps its window picker (it fills in a
`[class="^…$"]`). Its two lists and "Places itself" go. The redesign is stage 10's.

## Read so far (2026-10-28, read-only, KWin's `/WindowsRunner` `Match` for the ids, then `getWindowInfo`)

Every window open on Paul's desktop: VS Code, Firefox (2), Prism Launcher, KeePassXC, Alacritty,
OBS, the stream stage (Xephyr, `STAGE (streamed)`: Paul's `floatingTitle` keeps it floating) are
Normal (type 0) and don't skip the taskbar, so R4's end changes none of them. The only Normal one
that skips the taskbar is `xwaylandvideobridge`, on A4's built-in list.

## Probe result (2026-10-28, probe 93, branch `probe-redo`)

Spectacle's main window: class `org.kde.spectacle`, Normal, not skipping the taskbar, not on all
desktops. **Its region overlay is a Normal fullscreen window per output**, the same class (title
"Unsaved* — Spectacle"). So B's default `[class="^org\.kde\.spectacle$"] floating enable` also
brings the overlays into the tree, each its workspace's fullscreen window. **For the review pass**:
whether the overlays should be kept out (a built-in case: Spectacle's class and fullscreen when it
opens) or are fine as fullscreen floating windows, as i3 would hold them. KRuler and Yakuake
aren't installed on Paul's machine; the password prompt's class is `ignoreClass`'s default.

## Unknown, settled before building

plasmashell's panel configuration and edit-mode windows: read from plasmashell's source before
building, or left on the built-in list (B's default rule waits for them).

## Paul's calls (2026-10-28)

43. A user's own ignore entries read as `floating enable`, reported once at load (C).

## Tests

- **Run**: `make unit`; 20 (rules), 25 (settings), 62 and 63 (Plasma windows), 73 (kept out of
  the tree), 76 (the settings sub-pages: the Window Rules page changes), 77 (float size), 37.
  **Expectations that change**: 20's ignore and floating-list cases become rule cases; 62/63's
  Plasma windows by their new kinds.
- **Unit, approved (Paul, 2026-10-28)** (`docs/testing.md` rule 5: no `rules.test.js` exists today, and
  `src/rules.js` doesn't load under node: it reads the `Settings` global and has no
  `module.exports`, so the parser and `classify` take their settings as an argument): the
  parser (criteria, commands, `assign`'s forms, the bad cases), `classify`'s order against A, the
  once-per-window record, and C's translation of the old keys, with Paul's two titles as a case.
- **New scenario, approved (Paul, 2026-10-28)**: none proposed; 20 is extended instead (an X11 dialog floats,
  R2; a rule runs once, X2; `assign` to a hidden workspace opens there without switching, N12;
  `floating disable` tiles a dialog). Those are new checks, for his go.

## Live check (Paul)

Spectacle's window, a password prompt and KRuler float; KRunner and the panel popups behave as
today; the stream stage and Picture-in-Picture still float; an `assign` line sends Steam (or any
app) to its workspace without switching; Yakuake as today until stage 9.

## Done when

Live and Paul's "it works": §3's kinds table and R1-R18 rewritten as built, X2, §11's rule
settings and N12, N13, N15; the old keys described as read for compatibility until stage 10.
