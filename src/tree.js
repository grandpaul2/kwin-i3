// The i3 tree: containers, leaves, focus stack, and every operation on them. No KWin calls here,
// so node can load and test this file directly (tests/unit). Filled in by phase 1.

var Tree = {};

if (typeof module !== "undefined") module.exports = Tree;
