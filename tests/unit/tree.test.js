// Unit tests for src/tree.js (node --test). Each expectation is derived from i3's source (the
// function named in the section), not from memory of how i3 feels.
const test = require("node:test");
const assert = require("node:assert");
const Tree = require("../../src/tree.js");
const { LEFT, RIGHT, UP, DOWN } = Tree;

// A model with workspaces 1 and 2. With `twoOutputs`, 2 is the visible workspace of the output
// to the right of 1's, and 1 is left of 2.
function model(twoOutputs) {
    const m = Tree.create({
        outputNeighbour(ws, dir) {
            if (!twoOutputs) return null;
            if (ws.num === 1 && dir === RIGHT) return m.ws(2);
            if (ws.num === 2 && dir === LEFT) return m.ws(1);
            return null;
        },
    });
    m.ws(1); m.ws(2);
    return m;
}

// Open windows on a workspace, each focused as it opens (as KWin activates new windows).
function open(m, ws, ...wins) {
    for (const w of wins) { m.open(w, m.ws(ws)); m.focusWin(w); }
}
const d = (m, n = 1) => m.describe(n);
const leaf = (m, w) => m.byWin[w];
const pct = (m, ...wins) => wins.map((w) => Math.round(leaf(m, w).percent * 1000) / 1000);

// ---- open (tree_open_con, _con_attach, con_fix_percent) -------------------------------------

test("open: first window goes in the workspace; the next after the focus", () => {
    const m = model();
    open(m, 1, "a", "b");
    assert.strictEqual(d(m), "H[a b*]");
    m.focusWin("a");
    open(m, 1, "c");
    assert.strictEqual(d(m), "H[a c* b]", "after the focused window, not at the end");
});

test("open: inside the focused window's container", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    assert.strictEqual(d(m), "H[a V[b c*]]");
});

test("open: a new window gets the average share", () => {
    const m = model();
    open(m, 1, "a", "b");
    assert.deepStrictEqual(pct(m, "a", "b"), [0.5, 0.5]);
    open(m, 1, "c");
    assert.deepStrictEqual(pct(m, "a", "b", "c"), [0.333, 0.333, 0.333]);
});

test("open: with a floating window focused, goes after the tiling focus", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.focusWin("a");
    m.openFloating("f", m.ws(1));
    m.focusWin("f");
    open(m, 1, "c");
    assert.strictEqual(d(m), "H[a c* b] ~f");
});

// ---- split (tree_split) ----------------------------------------------------------------------

test("split: a lone window only changes the workspace orientation", () => {
    const m = model();
    open(m, 1, "a");
    m.split(leaf(m, "a"), "v");
    assert.strictEqual(d(m), "V[a*]");
});

test("split: wraps the window in a new container of that orientation", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    assert.strictEqual(d(m), "H[a V[b*]]");
    assert.strictEqual(Math.round(leaf(m, "b").parent.percent * 1000) / 1000, 0.5,
        "the wrapper takes the window's share");
});

test("split: inside a one-child container just changes that container", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    m.split(leaf(m, "b"), "h");
    assert.strictEqual(d(m), "H[a H[b*]]", "no second wrapper");
});

// ---- close (tree_close_internal, con_next_focused, con_on_remove_child) ---------------------

test("close: a one-child container stays (i3 does not flatten on close)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.close("c");
    assert.strictEqual(d(m), "H[a V[b*]]");
});

test("close: an emptied container goes too", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    m.close("b");
    assert.strictEqual(d(m), "H[a*]");
});

test("close: focus goes to the previous focus in the same container", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.focusWin("a");
    m.focusWin("c");
    m.close("c");
    assert.strictEqual(d(m), "H[a* b]", "a was focused before c, so a, not the neighbour b");
});

test("close: shares are redistributed proportionally", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    leaf(m, "a").percent = 0.5; leaf(m, "b").percent = 0.25; leaf(m, "c").percent = 0.25;
    m.close("c");
    assert.deepStrictEqual(pct(m, "a", "b"), [0.667, 0.333]);
});

test("close: the last window leaves the workspace focused", () => {
    const m = model();
    open(m, 1, "a");
    m.close("a");
    assert.strictEqual(d(m), "H[]*");
});

// ---- move (tree_move, insert_con_into, attach_to_workspace) ---------------------------------

test("move: swaps with a leaf sibling", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.move(leaf(m, "b"), LEFT);
    assert.strictEqual(d(m), "H[b* a]");
});

test("move: across the grain re-wraps the workspace (ws_force_orientation)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.move(leaf(m, "b"), UP);
    assert.strictEqual(d(m), "V[b* H[a]]");
});

test("move: into a neighbouring container, at its near end", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.focusWin("a");
    m.move(leaf(m, "a"), RIGHT);
    // con_descend_direction(V, right) goes by V's focus to c; AFTER, since V is not horizontal.
    assert.strictEqual(d(m), "H[V[b c a*]]");
});

test("move: out of a container at its edge, beside it one level up", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.focusWin("b");
    m.move(leaf(m, "b"), RIGHT);
    assert.strictEqual(d(m), "H[a V[c] b*]");
});

test("move: up and down inside a vertical container", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.move(leaf(m, "c"), UP);
    assert.strictEqual(d(m), "H[a V[c* b]]");
});

test("move: out of a one-child container, and the empty container goes", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.move(leaf(m, "b"), UP);            // V[b H[a]]
    m.focusWin("a");
    m.move(leaf(m, "a"), UP);            // "Moving into container above": before H[a]
    assert.strictEqual(d(m), "V[b a*]");
});

test("move: at the workspace edge, to the neighbouring output's workspace", () => {
    const m = model(true);
    open(m, 2, "x");
    open(m, 1, "a", "b");
    m.move(leaf(m, "b"), RIGHT);
    assert.strictEqual(d(m, 1), "H[a]");
    assert.strictEqual(d(m, 2), "H[b* x]", "entering from the left, it goes first");
});

test("move: at the workspace edge with no output there, nothing happens", () => {
    const m = model(false);
    open(m, 1, "a", "b");
    m.move(leaf(m, "b"), RIGHT);
    assert.strictEqual(d(m), "H[a b*]");
});

test("move: a lone window goes straight to the next output", () => {
    const m = model(true);
    open(m, 1, "a");
    m.move(leaf(m, "a"), RIGHT);
    assert.strictEqual(d(m, 1), "H[]");
    assert.strictEqual(d(m, 2), "H[a*]");
});

test("move: a fullscreen window goes to the next output (CF_OUTPUT)", () => {
    const m = model(true);
    open(m, 1, "a", "b");
    m.setFullscreen("b", true);
    m.move(leaf(m, "b"), RIGHT);
    assert.strictEqual(d(m, 2), "H[b*!]");
});

// ---- flatten (tree_flatten) ------------------------------------------------------------------

test("flatten: a one-child split holding a split of its parent's orientation is removed", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    const b = leaf(m, "b"), c = leaf(m, "c");
    m.split(b, "h");                     // H[a H[b] c]
    m.split(b.parent, "v");              // H[a V[H[b]] c]
    m.insertConInto(c, b, "after");      // H[a V[H[b c]]]
    assert.strictEqual(d(m), "H[a V[H[b c*]]]");
    m.flatten();
    assert.strictEqual(d(m), "H[a b c*]");
});

test("flatten: a one-child split holding a window is kept", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    m.flatten();
    assert.strictEqual(d(m), "H[a V[b*]]");
});

// ---- tidy (kwin-i3's own, not i3's) ------------------------------------------------------------
// i3 keeps a one-child split holding a split, and each one costs a move key press: a capture
// of 2026-10-22 (real i3 4.25.1 replayed the same 62 keys to the same tree). We remove them.

test("tidy: after Split/Move churn, Meta+H then one move joins the left window", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    for (let i = 0; i < 3; i++) {           // the capture's loop: split b, move c into b's box
        m.focusWin("b"); m.split(leaf(m, "b"), "h");
        m.focusWin("c"); m.move(leaf(m, "c"), LEFT);
    }
    m.focusWin("b"); m.split(leaf(m, "b"), "v");
    m.focusWin("c"); m.move(leaf(m, "c"), LEFT);
    assert.strictEqual(d(m), "H[a V[b c*]]", "big a on the left, b and c stacked, no boxes left");
    m.focusWin("a"); m.split(leaf(m, "a"), "h");
    m.focusWin("c"); m.move(leaf(m, "c"), LEFT);
    assert.strictEqual(d(m), "H[H[a c*] V[b]]", "c shares a's half, as on a fresh layout");
});

test("tidy: a box left holding only a box goes on close", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");                         // H[a V[b c*]]
    m.split(leaf(m, "c"), "h");
    open(m, 1, "d");                         // H[a V[b H[c d*]]]
    m.close("b");                            // V would hold only H[c d]
    assert.strictEqual(d(m), "H[a H[c d*]]", "the V box holding only a box is gone");
});

// H[a V[b H[c d*]]]: taking b out leaves V holding only H[c d].
function stackWithRow(m) {
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.split(leaf(m, "c"), "h");
    open(m, 1, "d");
    assert.strictEqual(d(m), "H[a V[b H[c d*]]]");
}

test("tidy: a box left holding only a box goes on send to workspace", () => {
    const m = model();
    stackWithRow(m);
    m.moveToWorkspace(leaf(m, "b"), m.ws(2));
    assert.strictEqual(d(m), "H[a H[c d*]]");
});

test("tidy: a box left holding only a box goes when a window floats", () => {
    const m = model();
    stackWithRow(m);
    m.floatingEnable(leaf(m, "b"));
    assert.strictEqual(d(m).split(" ~")[0], "H[a H[c d*]]");
});

test("tidy: at start-up, a chain read off KWin's tiles collapses, keeping share and focus slot", () => {
    const m = model();
    const w = (win, percent) => ({ win, percent });
    m.adopt(m.ws(1), { layout: "h", kids: [w("a", 0.3),
        { layout: "v", percent: 0.7, kids: [{ layout: "h", kids: [{ layout: "v", kids: [w("b"), w("c")] }] }] }] });
    assert.strictEqual(d(m), "H[a V[b c]]", "three boxes deep, down to the one with two windows");
    const box = leaf(m, "b").parent, ws = m.ws(1);
    assert.strictEqual(box.parent, ws);
    assert.strictEqual(Math.round(box.percent * 10) / 10, 0.7, "the outer box's share");
    assert.deepStrictEqual(ws.focus, ws.nodes, "the box took the removed one's place in the focus stack");
});

// ---- toggle split (con_toggle_layout "split" -> con_set_layout) ----------------------------

test("toggle split: on a workspace's direct children, wraps them in the other orientation", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.toggleSplit(leaf(m, "b"));
    assert.strictEqual(d(m), "H[V[a b*]]");
});

test("toggle split: inside a container, flips that container", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.toggleSplit(leaf(m, "c"));
    assert.strictEqual(d(m), "H[a H[b c*]]");
});

test("toggle split: on an empty focused workspace, flips the workspace", () => {
    const m = model();
    m.activate(m.ws(1));
    m.toggleSplit(m.ws(1));
    assert.strictEqual(d(m), "V[]*");
});

// ---- move to workspace (con_move_to_workspace) ----------------------------------------------

test("move to workspace: after the target's focus; focus stays on the source", () => {
    const m = model();
    open(m, 2, "x", "y");
    m.focusWin("x");
    open(m, 1, "a", "b");
    m.moveToWorkspace(leaf(m, "b"), m.ws(2));
    assert.strictEqual(d(m, 1), "H[a*]");
    assert.strictEqual(d(m, 2), "H[x b y]");
    assert.deepStrictEqual(m.focusOrder(m.ws(2)), ["b", "x", "y"], "b is ws 2's focus now");
});

test("move to workspace: to an empty workspace", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.moveToWorkspace(leaf(m, "b"), m.ws(2));
    assert.strictEqual(d(m, 2), "H[b]");
    assert.strictEqual(d(m, 1), "H[a*]");
});

// ---- focus (get_tree_next, tree_next) -------------------------------------------------------

test("focus: tree-based, into a branch by its focus stack", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.focusWin("c");
    m.focusWin("b");                     // V's focus: b, c
    m.focusWin("a");
    assert.strictEqual(m.focusDir(RIGHT).win, "b");
    m.focusWin("c");
    m.focusWin("a");                     // V's focus: c, b
    assert.strictEqual(m.focusDir(RIGHT).win, "c", "the branch's last focus decides");
});

test("focus: up and down inside a vertical branch", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    assert.strictEqual(m.focusDir(UP).win, "b");
    assert.strictEqual(m.focusDir(DOWN).win, "c");
});

test("focus: at the edge with no output there, wraps (focus_wrapping yes)", () => {
    const m = model(false);
    open(m, 1, "a", "b", "c");
    assert.strictEqual(m.focusDir(RIGHT).win, "a");
});

test("focus: at the edge with an output there, crosses to its workspace's focus", () => {
    const m = model(true);
    open(m, 2, "x", "y");
    m.focusWin("x");
    open(m, 1, "a", "b");
    assert.strictEqual(m.focusDir(RIGHT).win, "x");
});

test("focus: no container of that orientation and no output: nothing", () => {
    const m = model(false);
    open(m, 1, "a", "b");
    assert.strictEqual(m.focusDir(UP), null);
    assert.strictEqual(d(m), "H[a b*]");
});

test("focus: from a fullscreen window, straight to the neighbouring output", () => {
    const m = model(true);
    open(m, 2, "x");
    open(m, 1, "a", "b");
    m.setFullscreen("a", true);
    m.focusWin("a");
    assert.strictEqual(m.focusDir(RIGHT).win, "x");
});

// ---- floating (floating_enable, floating_disable, focus mode_toggle) ------------------------

test("floating: toggling out and back in keeps the window focused", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.focusWin("b");
    m.toggleFloating(leaf(m, "b"));
    assert.strictEqual(d(m), "H[a c] ~b*");
    m.focusWin("a");
    m.focusWin("b");
    m.toggleFloating(leaf(m, "b"));
    assert.strictEqual(d(m), "H[a b* c]", "back after the tiling focus, a");
});

test("focus mode_toggle: between the tiling and the floating focus", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.openFloating("f", m.ws(1));
    m.focusWin("f");
    assert.strictEqual(m.focusModeToggle().win, "b");
    assert.strictEqual(m.focusModeToggle().win, "f");
});

// ---- cases found by the mutation battery (2026-10-21) ---------------------------------------

test("toggle split: no redundant one-child containers pile up (i3 #3001)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");          // H[a V[b]]
    m.split(leaf(m, "b").parent, "h");   // H[a H[V[b]]]
    assert.strictEqual(d(m), "H[a H[V[b*]]]");
    m.toggleSplit(leaf(m, "b"));
    assert.strictEqual(d(m), "H[a H[b*]]", "V is closed and its parent takes the layout");
});

test("move: the lone child of a split at the workspace edge goes to the next output", () => {
    const m = model(true);
    open(m, 1, "x");
    open(m, 2, "a", "b");
    m.split(leaf(m, "a"), "v");          // ws 2: H[V[a] b]
    m.focusWin("a");
    m.move(leaf(m, "a"), LEFT);
    assert.strictEqual(d(m, 2), "H[b]");
    assert.strictEqual(d(m, 1), "H[x a*]", "entering from the right, it goes last");
});

test("focus: blocked from leaving while another window is fullscreen", () => {
    const m = model(false);
    open(m, 1, "a", "b", "c");
    m.setFullscreen("c", true);
    m.focusWin("a");
    assert.strictEqual(m.focusDir(RIGHT), null, "b is behind the fullscreen c");
    assert.strictEqual(d(m), "H[a* b c!]");
});

// ---- i3's own testsuite (testcases/t/, branch next), translated ------------------------------
// The independent check: these expectations come from tests run against real i3, not from my
// reading of its source. `cmd 'open'` is a new focused window; `focus parent` is activate(parent).

test("i3 t/124-move.t §1-2: lone window can't move; two windows swap and stop at the edges", () => {
    const m = model();
    open(m, 1, "first");
    for (const dir of [LEFT, RIGHT, UP, DOWN]) m.move(leaf(m, "first"), dir);
    assert.strictEqual(d(m), "H[first*]");
    open(m, 1, "second");
    m.move(leaf(m, "second"), LEFT);
    assert.strictEqual(d(m), "H[second* first]");
    m.move(leaf(m, "second"), LEFT);
    assert.strictEqual(d(m), "H[second* first]");
    m.move(leaf(m, "second"), RIGHT);
    m.move(leaf(m, "second"), RIGHT);
    assert.strictEqual(d(m), "H[first second*]");
});

test("i3 t/124-move.t §3: into a split container, up inside it, out and back", () => {
    const m = model();
    open(m, 1, "first", "second");
    m.split(leaf(m, "second"), "v");
    m.activate(leaf(m, "second").parent);          // focus parent
    open(m, 1, "third");
    assert.strictEqual(m.ws(1).nodes.length, 3);
    m.move(leaf(m, "third"), LEFT);
    assert.strictEqual(d(m), "H[first V[second third*]]", "second on top, third below");
    m.move(leaf(m, "third"), UP);
    assert.strictEqual(d(m), "H[first V[third* second]]");
    m.move(leaf(m, "third"), LEFT);
    assert.strictEqual(m.ws(1).nodes.length, 3, "three containers after moving left");
    m.move(leaf(m, "third"), RIGHT);
    assert.strictEqual(m.ws(1).nodes.length, 2, "two containers after moving right");
});

test("i3 t/124-move.t §4: emptying a v-split by moving closes it", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.focusDir(LEFT);
    m.split(leaf(m, "a"), "v");
    open(m, 1, "d");
    m.move(leaf(m, "d"), RIGHT);
    m.focusDir(LEFT);
    m.move(m.focused, RIGHT);
    assert.strictEqual(m.ws(1).nodes.length, 1, "only one node on this workspace");
});

test("i3 t/145-flattening.t: move up then right leaves all three on workspace level", () => {
    const m = model();
    open(m, 1, "left", "mid", "right");
    m.move(leaf(m, "right"), UP);
    m.move(leaf(m, "right"), RIGHT);
    assert.strictEqual(m.ws(1).layout, "h", "workspace layout is splith");
    assert.strictEqual(m.ws(1).nodes.length, 3, "all three windows on workspace level");
});

test("i3 t/129-focus-after-close.t §2: closing goes to the focus stack, not the neighbour", () => {
    const m = model();
    m.activate(m.ws(1));
    m.split(m.ws(1), "v");
    open(m, 1, "first", "bottom");
    m.focusDir(UP);
    m.split(leaf(m, "first"), "h");
    open(m, 1, "middle", "right");
    m.focusDir(DOWN);
    m.close("bottom");
    assert.strictEqual(m.focused.win, "right", "top right container focused (in focus stack)");
});

test("i3 t/129-focus-after-close.t §3: closing an unfocused window leaves focus alone", () => {
    const m = model();
    open(m, 1, "first", "middle", "right", "win");
    m.focusWin("middle");
    m.close("win");
    assert.strictEqual(m.focused.win, "middle");
});

// ---- adopt (start-up from KWin's live tiles) --------------------------------------------------

test("adopt: rebuilds the tree, shares and all, and leaves floating windows alone", () => {
    const m = model();
    open(m, 1, "old");
    m.openFloating("f", m.ws(1));
    m.adopt(m.ws(1), { layout: "h", kids: [
        { win: "a", percent: 0.25 },
        { layout: "v", percent: 0.75, kids: [{ win: "b", percent: 0.5 }, { win: "c", percent: 0.5 }] },
    ] });
    assert.strictEqual(d(m), "H[a V[b c]] ~f*", "old had the focus; con_next_focused gives it to f");
    assert.deepStrictEqual(pct(m, "a", "b"), [0.25, 0.5]);
    assert.strictEqual(m.byWin.old, undefined, "the old tree is gone");
    open(m, 1, "d");
    assert.ok(d(m).includes("d*"), "a usable tree: new windows open into it");
});

test("adopt: a single window fills the workspace", () => {
    const m = model();
    m.adopt(m.ws(1), { win: "a", percent: 1 });
    assert.strictEqual(d(m), "H[a]");
});

// ---- resize (cmd_resize_tiling_width_height) ----------------------------------------------------

test("resize: grow width takes it from the siblings equally", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.focusWin("b");
    assert.strictEqual(m.resize(leaf(m, "b"), "width", 0.1), true);
    assert.deepStrictEqual(pct(m, "a", "b", "c"), [0.283, 0.433, 0.283]);
});

test("resize: inside a vertical split, width resizes the split", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.resize(leaf(m, "c"), "width", -0.1);
    assert.strictEqual(Math.round(leaf(m, "c").parent.percent * 1000) / 1000, 0.4);
    assert.deepStrictEqual(pct(m, "a"), [0.6]);
    m.resize(leaf(m, "c"), "height", 0.1);
    assert.deepStrictEqual(pct(m, "b", "c"), [0.4, 0.6]);
});

test("resize: nothing to resize against, or someone would vanish: refused", () => {
    const m = model();
    open(m, 1, "a");
    assert.strictEqual(m.resize(leaf(m, "a"), "width", 0.1), false);
    open(m, 1, "b");
    assert.strictEqual(m.resize(leaf(m, "b"), "height", 0.1), false, "no vertical split");
    assert.strictEqual(m.resize(leaf(m, "b"), "width", 0.5), false, "a would vanish");
    assert.deepStrictEqual(pct(m, "a", "b"), [0.5, 0.5]);
});

// ---- resize by the mouse (resize_find_tiling_participants, resize_neighboring_cons) ---------------

test("resizeParticipants: the sibling on that side, in front first", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    let p = m.resizeParticipants(leaf(m, "b"), RIGHT);
    assert.deepStrictEqual([p.first, p.second], [leaf(m, "b"), leaf(m, "c")]);
    p = m.resizeParticipants(leaf(m, "b"), LEFT);
    assert.deepStrictEqual([p.first, p.second], [leaf(m, "a"), leaf(m, "b")], "click.c swaps D_LEFT");
});

test("resizeParticipants: up the tree to an ancestor with a sibling, else none", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");                       // H[a V[b c]]
    let p = m.resizeParticipants(leaf(m, "c"), LEFT);
    assert.deepStrictEqual([p.first, p.second], [leaf(m, "a"), leaf(m, "c").parent], "the split, not c");
    p = m.resizeParticipants(leaf(m, "b"), DOWN);
    assert.deepStrictEqual([p.first, p.second], [leaf(m, "b"), leaf(m, "c")]);
    assert.strictEqual(m.resizeParticipants(leaf(m, "c"), DOWN), null, "last in the column, and the row has no vertical split above");
    assert.strictEqual(m.resizeParticipants(leaf(m, "a"), LEFT), null, "nothing to the left of the workspace's first");
    assert.strictEqual(m.resizeParticipants(leaf(m, "a"), UP), null, "no vertical split at all");
    assert.strictEqual(m.resizeParticipants(m.ws(1), LEFT), null);
});

test("resizeNeighbouring: pixels become a share of the parent, the second gives it up", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    assert.strictEqual(m.resizeNeighbouring(leaf(m, "a"), leaf(m, "b"), 120, 1200), true);
    assert.deepStrictEqual(pct(m, "a", "b", "c"), [0.433, 0.233, 0.333]);
    assert.strictEqual(m.resizeNeighbouring(leaf(m, "a"), leaf(m, "b"), -240, 1200), true);
    assert.deepStrictEqual(pct(m, "a", "b", "c"), [0.233, 0.433, 0.333]);
});

test("resizeNeighbouring: refused, nothing changed, when either would vanish", () => {
    const m = model();
    open(m, 1, "a", "b");
    assert.strictEqual(m.resizeNeighbouring(leaf(m, "a"), leaf(m, "b"), 600, 1200), false, "b to zero");
    assert.strictEqual(m.resizeNeighbouring(leaf(m, "a"), leaf(m, "b"), -700, 1200), false, "a below zero");
    assert.strictEqual(m.resizeNeighbouring(leaf(m, "a"), leaf(m, "b"), 10, 0), false, "no size");
    assert.deepStrictEqual(pct(m, "a", "b"), [0.5, 0.5]);
});

// ---- from the code review (2026-10-22) ------------------------------------------------------------

test("fullscreen is one per workspace: a second clears the first (con_toggle_fullscreen)", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.setFullscreen("a", true);
    m.setFullscreen("c", true);
    assert.strictEqual(d(m), "H[a b c*!]");
    m.setFullscreen("c", false);
    assert.strictEqual(m.focusDir(LEFT).win, "b", "focus is not wedged");
});

test("open twice: no ghost leaf", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.open("b", m.ws(1));
    m.openFloating("a", m.ws(1));
    assert.strictEqual(d(m), "H[a b*]");
});

test("move to workspace: not focused under the target's fullscreen window", () => {
    const m = model();
    open(m, 2, "x");
    m.setFullscreen("x", true);
    open(m, 1, "a", "b");
    m.moveToWorkspace(leaf(m, "b"), m.ws(2));
    assert.deepStrictEqual(m.focusOrder(m.ws(2)), ["x", "b"]);
});

// ---- a fullscreen window stays in the tree (docs/spec-fullscreen-tree.md, 2026-10-24) --------------

test("a window opened under a fullscreen one is second in the focus stack (manage.c: fs != NULL)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.setFullscreen("b", true);
    m.open("c", m.ws(1));                  // KWin's activation is handed back: no focusWin
    assert.strictEqual(d(m), "H[a b*! c]", "beside the focused b, b keeps the focus");
    assert.deepStrictEqual(m.focusOrder(m.ws(1)), ["b", "c", "a"], "c right after the fullscreen b");
    assert.strictEqual(m.nextFocused(leaf(m, "b")), leaf(m, "c"), "closing b gives c the focus");
    m.open("e", m.ws(1));
    assert.deepStrictEqual(m.focusOrder(m.ws(1)), ["b", "e", "c", "a"], "the latest newcomer is second");
    m.setFullscreen("b", false);
    assert.strictEqual(d(m), "H[a b* e c]", "leaving fullscreen moves no focus (con.c)");
});

test("floating toggle keeps fullscreen, both ways (floating_enable/disable leave fullscreen_mode)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.setFullscreen("b", true);
    m.toggleFloating(leaf(m, "b"));
    assert.strictEqual(leaf(m, "b").fullscreen, true, "floated, still fullscreen as KWin's window is");
    m.setFullscreen("b", false);
    assert.strictEqual(leaf(m, "b").fullscreen, false, "a floating window's fullscreen follows KWin's");
    m.setFullscreen("b", true);
    m.toggleFloating(leaf(m, "b"));
    assert.strictEqual(d(m), "H[a b*!]", "tiled again, still fullscreen");
});

test("a floating fullscreen window is the workspace's, as a tiled one (con_get_fullscreen_con walks floating_head)", () => {
    const m = model(true);
    open(m, 2, "x");
    open(m, 1, "a", "b");
    m.openFloating("g", m.ws(1));
    m.openFloating("f", m.ws(1));
    m.focusWin("f");
    m.setFullscreen("f", true);
    assert.strictEqual(m.fullscreenOn(m.ws(1)), leaf(m, "f"));
    assert.strictEqual(m.focusDir(LEFT), null, "get_tree_next: fullscreen before floating, no output to the left");
    assert.strictEqual(m.focusDir(RIGHT).win, "x", "straight to the neighbouring output, not the next floating g");
    m.focusWin("f");
    m.open("c", m.ws(1));                  // KWin's activation is handed back: no focusWin
    assert.deepStrictEqual(m.focusOrder(m.ws(1)).slice(0, 2), ["~f", "c"], "manage.c: the newcomer second, f keeps the focus");
    m.focusWin("c");                       // the mouse can; the keys can't reach b behind f
    assert.strictEqual(m.focusDir(LEFT), null, "con_fullscreen_permits_focusing");
    m.setFullscreen("a", true);
    assert.strictEqual(leaf(m, "f").fullscreen, false, "con_enable_fullscreen: one per workspace, floating included");
    m.setFullscreen("f", true);
    assert.strictEqual(leaf(m, "a").fullscreen, false, "and a floating one clears a tiled one");
    assert.strictEqual(m.fullscreenOn(m.ws(1)), leaf(m, "f"));
});

test("no fullscreen window: a new window goes to the tail of the focus stack as before", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.open("c", m.ws(1));
    assert.deepStrictEqual(m.focusOrder(m.ws(1)), ["b", "a", "c"]);
});

// ---- focus_wrapping (tree.c get_tree_next, i3 4.24; docs/spec-settings.md) ------------------

// V[a H[b V[c d]]] on workspace 1, c focused: Up from c has no sibling above it in the inner V
// (the wrap would be d), but the outer V has a above the H. "force" wraps inside the inner V;
// every other mode goes on up and finds a.
function nested(twoOutputs) {
    const m = model(twoOutputs);
    m.adopt(m.ws(1), { layout: "v", kids: [{ win: "a" }, { layout: "h", kids: [{ win: "b" }, { layout: "v", kids: [{ win: "c" }, { win: "d" }] }] }] });
    m.focusWin("c");
    return m;
}

test("focus_wrapping: a real neighbour further up wins over a wrap, except under force", () => {
    for (const mode of ["yes", "no", "workspace"]) assert.strictEqual(nested().focusDir(UP, mode).win, "a", mode);
    assert.strictEqual(nested().focusDir(UP, "force").win, "d", "force wraps in the innermost container");
});

test("focus_wrapping: at the workspace edge with no output there", () => {
    const at = (mode) => { const m = model(false); open(m, 1, "a", "b", "c"); return m.focusDir(RIGHT, mode); };
    assert.strictEqual(at("yes").win, "a");
    assert.strictEqual(at("workspace").win, "a");
    assert.strictEqual(at("force").win, "a");
    assert.strictEqual(at("no"), null, "no wrap, and no output to go to");
});

test("focus_wrapping: at the workspace edge with an output there", () => {
    const at = (mode) => { const m = model(true); open(m, 2, "x"); open(m, 1, "a", "b"); return m.focusDir(RIGHT, mode); };
    assert.strictEqual(at("yes").win, "x");
    assert.strictEqual(at("no").win, "x", "no still crosses to the next output");
    assert.strictEqual(at("workspace").win, "a", "workspace wraps instead of leaving");
    assert.strictEqual(at("force").win, "a", "force never leaves the container");
});

test("focus_wrapping: no default given is yes", () => {
    const m = model(true); open(m, 2, "x"); open(m, 1, "a", "b");
    assert.strictEqual(m.focusDir(RIGHT).win, "x");
});

test("focus_wrapping: from a fullscreen window, workspace mode stays, the others cross", () => {
    const at = (mode) => {
        const m = model(true); open(m, 2, "x"); open(m, 1, "a", "b");
        m.setFullscreen("a", true); m.focusWin("a");
        return m.focusDir(RIGHT, mode);
    };
    for (const mode of ["yes", "no", "force"]) assert.strictEqual(at(mode).win, "x", mode);
    assert.strictEqual(at("workspace"), null, "the fullscreen window's workspace is the limit");
});

test("focus_wrapping: an empty workspace focused goes to the next output in every mode", () => {
    for (const mode of ["yes", "no", "force", "workspace"]) {
        const m = model(true); open(m, 2, "x");
        m.activate(m.ws(1));
        assert.strictEqual(m.focusDir(RIGHT, mode).win, "x", mode);
    }
});

test("focus_wrapping: floating focus is the same in every mode (left/right through the floats)", () => {
    for (const mode of ["yes", "no", "force", "workspace"]) {
        const m = model(); open(m, 1, "a");
        m.openFloating("f", m.ws(1)); m.openFloating("g", m.ws(1)); m.focusWin("g");
        assert.strictEqual(m.focusDir(RIGHT, mode).win, "f", mode + ": wraps to the first float");
        assert.strictEqual(m.focusDir(UP, mode), null, mode);
    }
});

test("focus_wrapping: force, the next one blocked by fullscreen: no wrap either (i3: return NULL)", () => {
    const m = model(); open(m, 1, "a", "b", "c");
    m.setFullscreen("a", true); m.focusWin("b");        // the mouse can focus b; c is behind a
    assert.strictEqual(m.focusDir(RIGHT, "force"), null);
    assert.strictEqual(m.focusDir(RIGHT, "yes").win, "a", "yes: the wrap to the fullscreen a");
});

// ---- back_and_forth and workspace next/prev (workspace.c; docs/spec-workspace-commands.md) ----

test("previous workspace: set when the focused workspace changes (workspace_show), not within one", () => {
    const m = model(true); open(m, 1, "a", "b");
    assert.strictEqual(m.previousWs, null, "focus within workspace 1 sets nothing");
    open(m, 2, "x");
    assert.strictEqual(m.previousWs, 1, "focus moved to 2: the previous is 1");
    m.focusWin("a");
    assert.strictEqual(m.previousWs, 2, "and back: the previous is 2");
    m.focusWin("b");
    assert.strictEqual(m.previousWs, 2, "within 1 again: unchanged");
    m.focusDir(RIGHT, "yes");                       // across the monitor edge, to x on 2
    assert.strictEqual(m.focused.win, "x");
    assert.strictEqual(m.previousWs, 1, "focus crossing the monitor counts too");
});

test("previous workspace: an empty workspace focused counts, and is kept once left", () => {
    const m = model(); open(m, 1, "a");
    m.activate(m.ws(3));
    assert.strictEqual(m.previousWs, 1);
    m.focusWin("a");
    assert.strictEqual(m.previousWs, 3, "3 kept although empty (i3 keeps the name)");
});

test("previous workspace: moving a window away keeps the focus, so nothing changes", () => {
    const m = model(); open(m, 1, "a", "b");
    m.moveToWorkspace(m.byWin.b, m.ws(2));
    assert.strictEqual(m.previousWs, null, "focus stayed on workspace 1 (_con_move_to_con step 7)");
});

test("workspace_next / _prev: next higher existing number, wrapping; null with one workspace", () => {
    const next = Tree.nextWorkspace;
    assert.strictEqual(next([1, 2, 5], 2, 1), 5, "gaps skipped");
    assert.strictEqual(next([1, 2, 5], 5, 1), 1, "past the highest: the lowest");
    assert.strictEqual(next([1, 2, 5], 1, -1), 5, "prev past the lowest: the highest");
    assert.strictEqual(next([1, 2, 5], 5, -1), 2);
    assert.strictEqual(next([5, 1, 2], 1, 1), 2, "order of the list doesn't matter");
    assert.strictEqual(next([3], 3, 1), null, "one workspace: nothing");
    assert.strictEqual(next([3], 3, -1), null);
});

// ---- tiling drag (tiling_drag.c drag_callback, tiling_drag; con.c con_move_to_target, con_swap)

// Rects as i3 renders splits (shares along the layout, no gaps), workspace 1200x600 at 0,0.
function rects(m, num = 1) {
    const out = new Map();
    (function lay(c, r) {
        out.set(c, r);
        let pos = c.layout === "h" ? r.x : r.y;
        for (const k of c.nodes) {
            const size = (c.layout === "h" ? r.width : r.height) * k.percent;
            lay(k, c.layout === "h" ? { x: pos, y: r.y, width: size, height: r.height }
                                    : { x: r.x, y: pos, width: r.width, height: size });
            pos += size;
        }
    })(m.ws(num), { x: 0, y: 0, width: 1200, height: 600 });
    return (c) => out.get(c);
}
const plan = (m, con, target, x, y) => m.dropPlan(leaf(m, con), typeof target === "string" ? leaf(m, target) : target, x, y, rects(m), 25);

test("drag zones: centre, sibling (30 % of the smaller side), parent (deco + 5 px, on the parent's edge)", () => {
    const m = model();
    open(m, 1, "a", "b");                                     // b: 600..1200 x 0..600
    let p = plan(m, "a", "b", 900, 300);
    assert.strictEqual(p.type, Tree.CENTER);
    assert.deepStrictEqual(p.rect, { x: 780, y: 180, width: 240, height: 240 }, "inset by the sibling size, 180");
    p = plan(m, "a", "b", 610, 300);
    assert.deepStrictEqual([p.type, p.dir], [Tree.SIBLING, LEFT], "b's left edge is no edge of the workspace");
    assert.deepStrictEqual(p.rect, { x: 600, y: 0, width: 180, height: 600 });
    p = plan(m, "a", "b", 700, 300);
    assert.deepStrictEqual([p.type, p.dir], [Tree.SIBLING, LEFT], "within 180 px");
    p = plan(m, "a", "b", 1190, 300);
    assert.deepStrictEqual([p.type, p.dir], [Tree.PARENT, RIGHT], "the workspace's right edge");
    assert.deepStrictEqual(p.rect, { x: 1175, y: 0, width: 25, height: 600 }, "the parent's edge, 25 px");
    p = plan(m, "a", "b", 900, 5);
    assert.deepStrictEqual([p.type, p.dir], [Tree.PARENT, UP], "across the split: always the parent's side");
});

test("drag zones: onto itself only as a parent drop", () => {
    const m = model();
    open(m, 1, "a", "b");
    assert.strictEqual(plan(m, "a", "a", 300, 300), null);
    assert.strictEqual(plan(m, "a", "a", 590, 300), null, "a sibling of itself");
    assert.strictEqual(plan(m, "a", "a", 5, 300).type, Tree.PARENT);
});

test("drag zones: a parent drop climbs while the parent is on that side too", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");                                          // H[a V[b c*]]
    const p = plan(m, "a", "c", 1195, 450);
    assert.deepStrictEqual([p.type, p.dir], [Tree.PARENT, RIGHT]);
    assert.strictEqual(p.target, leaf(m, "c"), "V's own side test descends to a leaf, never V: no climb");
    assert.deepStrictEqual(p.rect, { x: 1175, y: 0, width: 25, height: 600 }, "on V's rect");
});

test("drop centre: after the target, focus where it was (con_move_to_target)", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    assert.ok(m.drop(leaf(m, "a"), plan(m, "a", "c", 1000, 300), false));
    assert.strictEqual(d(m), "H[b c* a]");
    assert.deepStrictEqual(pct(m, "b", "c", "a"), [0.333, 0.333, 0.333]);
});

test("drop centre with the swap modifier: the two change places (con_swap)", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.resize(leaf(m, "a"), "width", 0.1);
    const before = pct(m, "a", "c");
    assert.ok(m.drop(leaf(m, "a"), plan(m, "a", "c", 1050, 300), true));
    assert.strictEqual(d(m), "H[c* b a]");
    assert.deepStrictEqual(pct(m, "c", "a"), before, "shares swapped with the places");
});

test("drop as sibling: across a three-child split, the target is split", () => {
    const m = model();
    open(m, 1, "a", "b", "c");                                // b: 400..800
    const p = plan(m, "a", "b", 600, 500);
    assert.deepStrictEqual([p.type, p.dir], [Tree.SIBLING, DOWN]);
    m.drop(leaf(m, "a"), p, false);
    assert.strictEqual(d(m), "H[V[b a] c*]");
});

test("drop as sibling: two children of one parent just turn it", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.drop(leaf(m, "a"), plan(m, "a", "b", 900, 500), false);
    assert.strictEqual(d(m), "V[b* a]");
});

test("drop to parent across the split: the workspace turns, as tree_move does", () => {
    const m = model();
    open(m, 1, "a", "b");
    const p = plan(m, "a", "b", 900, 590);
    assert.deepStrictEqual([p.type, p.dir], [Tree.PARENT, DOWN]);
    m.drop(leaf(m, "a"), p, false);
    assert.strictEqual(d(m), "V[H[b*] a]", "i3 keeps the one-child split a move leaves (tidy keeps a window's)");
});

test("drop to parent: inserted beside the target, then moved out one level (tree_move)", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    m.focusWin("a");                                          // H[a* V[b c]]
    m.drop(leaf(m, "a"), plan(m, "a", "c", 1195, 450), false);
    assert.strictEqual(d(m), "H[V[b c] a*]");
});

test("drop onto an empty workspace: moved there, and focused if it was (tiling_drag set_focus)", () => {
    const m = model(true);
    open(m, 1, "a", "b");
    assert.ok(m.drop(leaf(m, "b"), m.dropPlan(leaf(m, "b"), m.ws(2), 1500, 300, rects(m, 2), 25), false));
    assert.strictEqual(d(m, 2), "H[b*]");
    assert.strictEqual(d(m, 1), "H[a]");
});

test("drop of an unfocused window: the focus stays", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.drop(leaf(m, "a"), plan(m, "a", "b", 600, 300), false);
    assert.strictEqual(d(m), "H[b a c*]");
    assert.deepStrictEqual(m.focusOrder(m.ws(1)), ["c", "a", "b"], "a heads the stack below the focus");
});

test("drop of the focused fullscreen window: still fullscreen and focused after", () => {
    const m = model();
    open(m, 1, "a", "b", "c");
    m.setFullscreen("c", true);
    m.drop(leaf(m, "c"), plan(m, "c", "a", 200, 300), false);
    assert.strictEqual(d(m), "H[a c*! b]");
});

test("swap: not a container with its own child, not itself", () => {
    const m = model();
    open(m, 1, "a", "b");
    m.split(leaf(m, "b"), "v");
    open(m, 1, "c");
    const v = leaf(m, "b").parent;
    assert.strictEqual(m.swap(v, leaf(m, "c")), false);
    assert.strictEqual(m.swap(leaf(m, "a"), leaf(m, "a")), false);
});
