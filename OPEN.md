# OPEN — kwin-i3's unfinished work for now

**State, not history**: rewrite it as things change, never append. If it isn't here or in
`LATER.md` (work held until the Stage ends), it isn't open.
Every item leaves **done**, **won't-fix with a written reason**, or **as a line here with a next
action** ("none" is not one: an accepted item goes, its reason kept where the decision lives).
Waiting is not a next action either ("when it shows again", "when someone has used it"): such an
item goes, its facts kept in their homes, and a capture or a red brings it back as a new item.

Last reconciled: **2026-11-07** (the `stable` branch started at v1.1.0 on 2026-10-31; each move
after `docs/testing.md` P6's gate: green on the host and on Arch and PikaOS). The live desktop runs
Plasma 6.8.2 and main's script at 52f1204, its plugins at 3feca98 (unchanged since; settings page
at e376ccc). `stable` is at
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
`behaviour.md` V11's move case (a new X11 window moving itself to another output) found the same
shape elsewhere: KWin applies a client's request, or a side effect of one, and kwin-i3 follows it
where i3 refuses. A fullscreen window's own move: guarded in bfa3f8b, reverted (30a18a3): a script gets no cause with a desktop change, and its frame test refused a user's Move to Screen and missed a game asking for the other output's rect; open again, no sound signal known. Confirmed in source, each
its own diagnosis and spec, in order: (e) a window KWin doesn't protect after its first pass moving itself: a **tiled borderless X11 window** (Motif no-decoration,
`m_wantsNoDecoration`), or one on a hidden workspace (no requested tile, V11's known limit): KWin ignores a tiled window's request
only when it is decorated (`x11window.cpp:3111`), so it is applied and followed; a user's Move to
Screen of a tiled window has no frame to tell it by; (b) KWin carrying a window's transients to
its desktop, and a modal dialog's parent with it (V13, `+` with no reason): followed, where i3
moves the one container; (c) a client's own minimize (xdg `set_minimized`, `WM_CHANGE_STATE`),
which i3 rejects (`handlers.c:849-858`), where V7's reason has it as the user's; (d) a client's
maximize of a floating window, kept (V8 and R14 cover tiling only). Not yet traced:
`_NET_WM_FULLSCREEN_MONITORS` (V3's reason doesn't hold on X11; a frame spanning outputs reads as
the window's own move), Wayland `set_fullscreen` with an output, a client's
`_NET_NUMBER_OF_DESKTOPS` (D6). V9 to say KWin 6.8.2 ignores a client's `_NET_WM_DESKTOP` and
sticky messages. Next: (e)'s diagnosis.

**100. The Window Rules tab after the names change** (2026-11-07, a review of f155ff7). The
change holds (no rule lost or changed); what the page tells the user doesn't yet: Add Rule as
Text takes anything (a line with i3's `for_window`/`assign` word is stored and skipped by the
script, with no sign on the row), and its new row has no example; a pattern typed in the
application box becomes a literal name with no word saying so; the text row's note is untrue on
an empty new row and on one typed back into fields; the help's "each a regular expression" reads
ambiguously. Also: a rule added by Add Rule or Add Rule as Text lands below the view, against
`behaviour.md`'s "a new rule scrolls into view" (the same before the change). Next: diagnose the
scroll (`WindowRules.qml` `reveal`, called before the row is laid out); then one spec for the
words, to the style guide.

**101. An X11 window floated while its workspace is hidden keeps its tile's size** (2026-11-07,
a review of 4dbf16f; unverified). With the rect copied in `unmanageFrom`, a hidden X11 window
keeps its tile-sized frame through the unmanage, and `floatAtRecord` skips hidden windows
(`src/kwin.js`), so it floats at that size, as a Wayland window already did, instead of its own.
Next: a test-KWin probe, with the go; i3's `floating_enable` uses the window's own geometry.

**103. A float for size on a briefly smaller output is never undone** (2026-11-12, from the pending-fullscreen
fix's investigation; confirmed from code, not seen live). `floatWhatCannotFit` (X7) floats the tiled
window with the largest minimum while the minimums don't fit; on KWin's 1920x1080 placeholder
output (every monitor asleep) that can float windows that fit again when the monitors return, and
nothing tiles them back. X7's reason (a client can't be drawn below its minimum) covers the float
while the area is small, not keeping it after. Next: a spec that makes X7's float last only as
long as its cause.

**104. A window dropped from the tree loses its floating mark** (2026-11-12, from the pending-fullscreen
fix's investigation; confirmed from code, rare). `dropWindow` clears the Keep Above that marks a window
kwin-i3 floats, so one floated by hand comes back tiling when it is adopted again (two desktops at
once, a desktop past 10, a class change that keeps it out). i3 keeps a con's floating state while
the window is managed. Next: a diagnosis of each drop path against i3, after item 103.
