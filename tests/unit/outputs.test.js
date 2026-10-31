// Unit tests for src/outputs.js (node --test): where workspaces go
// when an output is lost or appears, against i3 4.24's randr.c (move_content, init_ws_for_output,
// get_assigned_output).
const test = require("node:test");
const assert = require("node:assert");
const O = require("../../src/outputs.js");

// Two outputs, A first (primary). 1 (windows) and 4 (empty, focused) on A; 2 (windows) and 3
// (empty) on B; 5 assigned to B then C, with windows, on B.
const st = () => ({
    outputs: ["A", "B"],
    homes: { 1: "A", 2: "B", 3: "B", 4: "A", 5: "B" },
    assigned: { 5: ["B", "C"], 7: ["C", "A"] },
    occupied: { 1: true, 2: true, 5: true },
    focused: 4,
});

test("firstAssigned: the first connected output of the list (get_assigned_output)", () => {
    const s = st();
    assert.strictEqual(O.firstAssigned(5, s), "B");
    assert.strictEqual(O.firstAssigned(7, s), "A", "C is absent: the next one");
    assert.strictEqual(O.firstAssigned(1, s), null, "no assignment");
    assert.strictEqual(O.firstAssigned(5, { outputs: ["A"], homes: {}, assigned: s.assigned, occupied: {} }), null, "none connected");
});

test("homesAfterLoss: B lost: its workspaces with windows go to the first output for good; an empty one has no home left", () => {
    const s = st();
    s.outputs = ["A"];
    assert.deepStrictEqual(O.homesAfterLoss("B", s), { 2: "A", 3: null, 5: "A" });
});

test("homesAfterLoss: every workspace goes to the first output, assignments not read (i3's move_content); the focused empty one keeps a home", () => {
    const s = st();
    s.outputs = ["A", "C"];                 // B lost, C here
    assert.deepStrictEqual(O.homesAfterLoss("B", s), { 2: "A", 3: null, 5: "A" }, "5 is assigned B then C: still A, as i3");
    s.focused = 3;
    assert.deepStrictEqual(O.homesAfterLoss("B", s), { 2: "A", 3: "A", 5: "A" }, "the focused empty 3 moves (i3 shows it there)");
});

test("movingTo: an output appearing takes the existing workspaces whose first connected assigned output it is (init_ws_for_output)", () => {
    const s = st();
    s.outputs = ["A", "B", "C"];
    assert.deepStrictEqual(O.movingTo("C", s), [], "5's list starts with B, which is here: it stays; 7 doesn't exist (no home): i3 loops existing workspaces only");
    s.outputs = ["A", "C"];
    s.homes = { 1: "A", 2: "A", 4: "A", 5: "A" };     // after B's loss
    assert.deepStrictEqual(O.movingTo("C", s), [5]);
    assert.deepStrictEqual(O.movingTo("A", s), [], "nothing moves to an output it lives on already");
});

test("sourceShows: the most recently shown workspace with windows still living there, else the lowest with windows, else null", () => {
    const s = st();
    s.homes = { 1: "A", 2: "A", 4: "A", 6: "A" };
    s.occupied = { 1: true, 2: true, 6: true };
    assert.strictEqual(O.sourceShows("A", [4, 6, 2], s), 6, "4 is empty: skipped");
    assert.strictEqual(O.sourceShows("A", [], s), 1, "nothing recent: the lowest with windows");
    assert.strictEqual(O.sourceShows("A", [9], { outputs: ["A"], homes: { 4: "A" }, assigned: {}, occupied: {} }), null, "none: an unused one (the caller)");
});

test("newShows: an output's lowest workspace, else its first assigned, else null (the lowest free, the caller)", () => {
    const s = st();
    assert.strictEqual(O.newShows("B", s), 2);
    assert.strictEqual(O.newShows("C", { outputs: ["A", "C"], homes: { 1: "A" }, assigned: { 7: ["C"], 6: ["C", "A"] }, occupied: {} }), 6, "the lowest number naming it first");
    assert.strictEqual(O.newShows("C", { outputs: ["A", "C"], homes: { 1: "A" }, assigned: { 7: ["A", "C"] }, occupied: {} }), null, "7's first connected output is A");
});
