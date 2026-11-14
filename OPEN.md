# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-14** (the `stable` branch started at v1.1.0 on 2026-10-31; each move
after `docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
Plasma 6.8.2 and main's script at 9207f9a, its plugins at 3feca98 (unchanged since; settings page
at 9207f9a). `stable` is at
`v1.4.0` (2026-11-04, 3feca98).

## Stage

**Now the beta**: before any release, the repo is public without an announcement, so a few early
users can run it: people new to Plasma who found other tiling scripts buggy, on Arch-based
(Plasma 6.8) and Debian-unstable-based (Plasma 6.7.4) distributions, on NVIDIA. Their bugs are
fixed as they come, hardening kwin-i3. The Stage's rules hold through the beta (lean testing,
`docs/testing.md`; fuzz and fault runs in `LATER.md`). Their desktops are theirs: their go to
reload (`AGENTS.md`). They run the `stable` branch, moved to main when main has passed
`docs/testing.md` P6 (the maintainer's use and word that it works, every scenario on the host and in both
containers), and tagged `v1.N.0`; a fix for their bug reaches `stable` sooner, as `v1.N.M`. A
public release is not decided yet (`LATER.md`).

## Heading

Flesh out what is there: more configurable and more reliable, so it works on any machine, set up
by someone who has never seen it. **Not** more of i3: the goal is i3's feel and basic window
management, with Plasma doing the rest. The scope and its reasons: `docs/plan.md`, "Scope"; the
audience and the lines drawn: `docs/philosophy.md`.

## Open

**79. The install and first run, built to `plan.md`'s "Install and first run"** (2026-11-01;
takes in item 26). Built: `make install` and `make uninstall`; the key override (`behaviour.md` §8, "Shared keys");
Plasma's own settings as rows on Workspaces and Window Rules, with the banner, their save and `make uninstall`'s
give-back (`behaviour.md` §11); the README's Install to match. To check: `behaviour.md` G2
names a System Settings page for the drag distance, and the survey of stock 6.7.5 and 6.8.2 found
none. Next: the install walked as a new user on stock CachyOS and PikaOS (`tools/box.sh`), step
by step, from `git clone` to the banner's Review…; and with the plugins not built: what the
banners and the Keys tab's greyed override then say. With it, one wording to settle:
`tools/install.sh`'s closing lines say the page's banner "names any Plasma setting kwin-i3
needs", where the README's Install step 4 has the banner for per-screen workspaces only and the
animations row optional; the two to say the same.

**91. The first training video** (2026-11-05). Built: `tools/video/` (`README.md` there), which
records a script inside the test KWin with Plasma, real apps and real input, and composes the mp4
with captions and keys. Scene 1 of the first video is scripted
(`tools/video/scripts/01-first-steps.txt`: open, focus by key and mouse, close, the split keys and
their indicator, the launcher). The video is one lesson built up like a language: each new key
used at once in a sentence, the most important ones again in later scenes. Next: settle whether
the split indicator, 1 px, reads on video (if not, a 2 px frame for the videos, i3's own border
width); then the later scenes, scripted with the maintainer: switching workspaces and moving a
window to one, then by mouse moving a tile, tabbed, stacked, swap, float and unfloat (the tool
needs a drag step for these, `behaviour.md` G1, G5, G9-G13). Music and narration come after the
video is scripted.

**96. Client requests KWin applies that i3 ignores** (2026-11-07). An audit of the seam behind
`behaviour.md` V11 found the same shape in several places: KWin applies a client's request, or a
side effect of one, and kwin-i3 follows it where i3 refuses. Open, each its own diagnosis and spec, in order: (b) KWin
carrying a window's transients to its desktop, and a modal dialog's parent with it (V13, `+`
with no reason): followed, where i3 moves the one container; (c) a client's own minimize (xdg
`set_minimized`, `WM_CHANGE_STATE`), which i3 rejects (`handlers.c:849-858`), where V7's reason
has it as the user's; (d) a client's maximize of a floating window, kept (V8 and R14 cover
tiling only); a fullscreen *floating* window's own move to another output, followed, where i3
ignores every request of a fullscreen container. Not yet traced: `_NET_WM_FULLSCREEN_MONITORS`
(V3's reason doesn't hold on X11), Wayland `set_fullscreen` with an output, a client's
`_NET_NUMBER_OF_DESKTOPS` (D6). V9 to say KWin 6.8.2 ignores a client's `_NET_WM_DESKTOP` and
sticky messages. Next: (b)'s diagnosis.

**106. The helper's presses take KWin's window-action modifier** (from the foundation sweep;
`behaviour.md` N16, being fixed). i3 has one `floating_modifier` for every drag (`click.c:170-171`);
the helper's tiling drag, Meta+Shift float and tile and Meta+right resize test Meta only
(`plugin/tilingdrag.cpp` `pointerButton`), while a floating window moves with KWin's modifier (F1)
and `plan.md` (e) has the modifier the user's. KWin's is `[MouseBindings] CommandAllKey`
(`options.cpp` `CmdAllModKey`), readable by the helper. Next: a spec.

**107. One flag serves two timers** (from the foundation sweep). `src/kwin.js` declares
`pendingTimer` twice, for `recordShown` (an outside desktop switch, D2/D3, handled a turn later)
and for `checkPending` (V14's 150 ms look at a pending fullscreen): while either is armed, the
other schedules nothing, so after an output change a switch from the Overview, a pager or Alt+Tab
can wait for the next one. Next: a spec (one flag each).

**108. Close acts on KWin's active window, not the tree's focus** (from the foundation sweep;
`behaviour.md` A5, K12). For a focused window, and an empty focused workspace, Meta+Shift+Q runs
KWin's Window Close on KWin's active window, with no re-sync (`KWIN_OWN`); i3's `kill` closes the
focused con (`commands.c` `cmd_kill`), and on an empty workspace nothing. They differ while a window
kept out of the tree has the keyboard. Next: a spec.

**109. A critical notification doesn't match `window_type=notification`** (from the foundation
sweep; `behaviour.md` R2, R9). `Rules.windowType` tests `w.notification` only, where
`floatsByDefault` counts `w.criticalNotification` too. Next: a spec.

**110. `sticky` is a kind in the code, where i3 has a flag** (from the foundation sweep;
`definitions.md` notes it; `AGENTS.md` "Ride i3 hard"). `src/rules.js` `classify`/`i3Kind` return
`sticky` beside `tiling` and `floating`; i3's `sticky` is a flag on a floating con (`data.h`,
`con->sticky`), and no reason in `plan.md` keeps the difference. Next: a spec for the model's
shape (the flag on the floating con, the kind floating).

**111. A title-bar press stays armed through another button's release** (from the foundation
sweep; `behaviour.md` G7). Before the drag distance is passed, the helper swallows another
button's release and keeps the press (`pointerButton`, `Phase::Pressed`); i3 ends its grab on any
release (`drag.c:66-68`), before its threshold too. Next: a spec.

**112. A floated container's resize floor is a fixed 75x50** (from the foundation sweep;
`behaviour.md` F1a). The helper's `groupMotion` stops at 75x50 whatever `floatingMinimumSize` says;
i3's resize checks every step against `floating_minimum_size` (`floating.c` `floating_check_size`,
called from the resize callback, `:673`). Next: a spec.

**113. Three rows keep Plasma's way under reason (e) where kwin-i3 can win** (from the foundation
sweep). `plan.md` (e) gives the user a Plasma setting only where kwin-i3 can't win it at runtime;
these rows cite it where the helper already takes the press: G2 (the drag distance: Plasma's,
where i3's is 15 px, `drag.c:46`), Z4 (a right press on a title bar opens the window menu, where
i3 resizes against the neighbour above, `click.c`), F1 (Meta+right resizes a floating window
without focusing it, where i3 focuses, `click.c:261-277`). Each is i3's way by the docs, or a
live verdict, reason (c), if kept. Next: a spec each, judged live.

**114. The settings page's words against its style guide** (from the foundation sweep). The
plugin banner names three losses where §1 lists more (the terminal key, the key override, the
position keys, a group's tabs); "Your rules", "No rules of your own", "when you untick it",
"made from now on" and help naming kwin-i3; strings through `i18n` with no context; the
Tiling key step's help speaking of the floating step's px, the pointer help narrower than
`mouseWarping`, the rules help leaving out class; the unfocused indicator colour off the page,
though the guide puts every i3 knob on it. Next: one pass to the guide, screenshotted, judged
live.
