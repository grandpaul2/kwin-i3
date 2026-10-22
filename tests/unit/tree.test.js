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
