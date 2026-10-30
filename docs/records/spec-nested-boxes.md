# Spec: remove boxes that hold only a box (a deliberate break from i3)

**Now (2026-10-27):** Built and live (`tidy`, `src/tree.js`); listed in `plan.md`'s divergences. What it does: `behaviour.md` §2, "Tidying". (Its "one user" reasoning predates `philosophy.md`; the decision stands on the move-key cost.)

Decided by Paul, 2026-10-23. Status: **reviewed** (second agent, 2026-10-23; findings and answers below). Not live until Paul says go.

## The problem

Paul's capture of 2026-10-22: a big terminal on the left, two stacked on the right. Meta+H on the
left one, then Meta+Shift+Left on a right one. It should share the left terminal's half (it does on
a freshly built layout). Instead it moved beside the other right-hand terminal, and the next three
presses seemed to do nothing before it finally crossed.

Cause: earlier Split and Move presses had built invisible split containers ("boxes") around the
right-hand column, each holding nothing but the next box: `H[H[a] H[H[H[V[b c]]]]]`. A move
climbs one box per press (`tree_move`: it moves within the nearest ancestor of the move's
orientation, and steps out one level at that box's edge). A box holding only a box draws nothing,
so each such step is a press with no visible effect.

Real i3 does exactly the same. Checked two ways:
- i3 4.25.1 under Xvfb, replaying the same 62 key presses: the same tree at every step.
- Paul in his stage i3 (`~/.dotfiles/stage`), with the short sequence in "Reproducing" below: four
  presses.

## Why i3 keeps them

- **Every box counts as intentional.** In i3 #3001 (repeated splits piling up containers), i3
  maintainer Airblader replied: "Why should we close this (valid) container that has been
  intentionally created? You can move a window into each of those containers." Each box is a
  place a window can be parked: the silent presses are stops at those places.
- **They are useful in i3 because of `focus parent` and tabbed/stacked layouts.** `focus parent`
  (Meta+A) selects a box so it can be moved or have windows opened into it (#4077's answer). A
  one-child box can be made tabbed or stacked and gets a tab bar.
- **i3 removes only the boxes it creates itself.** `tree_flatten` (115462f10, 2011: "to
  automatically solve situations of redundant chains of split containers … should fix the move
  problems") removes the pairs that `move` creates when it re-wraps a workspace. Boxes made by
  `split` are never removed.
- **Removing boxes has caused i3 bugs**, all around tabbed/stacked: #1053 ("don't flatten
  tabbed/stacked containers", 2013), #3003 (`tree_flatten` closes the wrong container).
- **Compatibility.** #3808 ("split none", open since 2019, several Reddit threads of users hitting
  this) would be accepted only as a manual command on a single window; changing existing
  behaviour "would probably break things for a lot of users". Sway added `split none` in 1.7.
- i3 already works around the same boxes once: `resize` looks past one-child parents (PR #2036,
  2015). kwin-i3 ports that (`M.resize` in `src/tree.js`).

## Why kwin-i3 breaks from it

The two features that give these boxes a purpose are both left out by Paul's decision
(`plan.md`, 2026-10-21): tabbed/stacked ("I don't use tabbed") and `focus parent` ("never used
this"); Paul confirmed on 2026-10-23 he doesn't intend to add them. Without them, a box holding
only a box can't be selected, tabbed or resized differently, and draws nothing; its only effect is
the extra presses. kwin-i3 has one user, so i3's compatibility argument doesn't apply.

## The rule

After an operation that can leave one behind, every split container (not a workspace) whose only
child is another split container is removed; that child takes its place in the parent's children
and focus stack, and its share (`percent`).

- **Stays:** a box holding one *window* (what Meta+H / Meta+V make; a move goes into it, and
  `split` on it just changes its orientation). A workspace. Boxes with two or more children.
- **Runs after:** every move (inside `flatten`, after i3's own `tree_flatten`, so i3's rule acts
  first on the pairs it handles), close, float (`floatingEnable`), send-to-workspace, and `adopt`
  (start-up). Not after Toggle Split: it can only change a box's direction or close a one-child
  box holding a window, so it can't leave a box holding only a box.
- **Not after `split`**: `split` acts on a window, so it can only wrap a window (that box stays).
- **Nothing moves on screen** when it runs: the removed box was exactly the size of its child.
- **Focus** is unchanged: the child takes the box's slot in the parent's focus stack, and the
  focused window is a leaf, never removed.

## Risks and when to revisit

1. **Adding `focus parent` or tabbed/stacked layouts.** These are what make such boxes meaningful,
   and where i3's own removal bugs were. Revisit this rule first: at least, a box the user has
   selected or tabbed must not be removed.
2. **The in-between stops are gone.** A move that used to stop "beside the stack, still on the
   right" now goes as it would on a fresh layout. Intended.
3. **The model now holds trees i3 wouldn't.** Replaying a kwin-i3 log in real i3 (as was done for
   this bug) diverges once a box has been removed. Translated i3 tests that build such chains
   need the tidy taken into account.
4. **A layout read off KWin's tiles at start-up** (`adopt`) can hold one: `specOf` in
   `src/kwin.js` drops tiles of windows kwin-i3 doesn't manage, so a tile can be left with a
   single child that is itself a tile. `adopt` tidies too.
5. **Nested rows with two or more windows stay.** For example `H[a H[c d]]` (a box of two inside a
   row of the same direction, e.g. left after a close) is not removed, and a move treats c and d as
   a group. That is intended: the box is visible through its sizes (a is half, c and d a quarter
   each), and a freshly built layout of that shape has the same box (Meta+H on c, then open d). It
   is structure, not a leftover. (Raised by the review; declined.)

## Tests

- Unit (`tests/unit/tree.test.js`, "tidy"): Paul's sequence in miniature, failing before the
  change (it rebuilt his `H[H[H[V[…` chain) and passing after; a box left holding only a box by
  close, by send-to-workspace and by float; and start-up with a chain three deep, checking the share
  and the focus-stack slot carry over. Each call site was removed in turn and turned its test red,
  and so did not handing over the share and not fixing the focus slot.
- `make test`, then `make fuzz` on the final change.

## Review (2026-10-23)

A second agent, given this spec, the diff and i3's source, ran 9,000 random sequences of 40
operations with tree-integrity checks (parent pointers, focus stacks, shares, no lost windows, no
box holding only a box); none failed, and with tidy stubbed out the check fired on the first run.
Findings: (1) nested rows of two remain: declined, risk 5; (2) `adopt` could leave a chain: fixed;
(3) three call sites untested and the `setLayout` call useless: tests added, call removed;
(4) `split` on a box makes a chain: unreachable, since the keys only split a window.

## Reproducing (real i3, mod = Alt in stage)

1. Three terminals side by side: left, middle, right.
2. Three times: click the middle one, Alt+H; click the right one, Alt+Shift+Left.
3. Click the middle one, Alt+V; click the right one, Alt+Shift+Left (classic layout).
4. Click the left one, Alt+H; click the bottom-right one, Alt+Shift+Left: four presses to cross.

## Sources

i3 issues #3001, #3808, #4077, #3003, #1053; PR #2036; commit 115462f10; the i3 User's Guide
(§3, §6.2); Sway 1.7 release notes. i3's `src/move.c`, `src/tree.c`, `src/con.c` (branch `next`).
