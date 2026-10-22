// Unit tests for src/tree.js (node --test). Phase 1 fills this in.
const test = require("node:test");
const assert = require("node:assert");
const Tree = require("../../src/tree.js");

test("tree.js loads in node", () => {
    assert.strictEqual(typeof Tree, "object");
});
