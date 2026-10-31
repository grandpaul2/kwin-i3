// Unit tests for src/placement.js (node --test): where a new window goes and which outside switch
// it caused . The cases include a
// capture's (Prism Launcher's dialog), against i3 4.24's manage.c.
const test = require("node:test");
const assert = require("node:assert");
const P = require("../../src/placement.js");

// Two outputs: A shows 4, B shows 5 (the capture: DP-6 on 4 with Prism, DP-4 on the empty 5).
const shown = { A: 4, B: 5 };

test("target: a modal dialog whose parent is in the tree goes to the parent's workspace (C3)", () => {
    // The capture: the dialog came with desktop 5 (B's, the active output's), its parent on 4.
    assert.deepStrictEqual(P.target({ desk: 5, modal: true, parentWs: 4 }, shown, 5), { ws: 4, why: "parent" });
});

test("target: a window asking for a hidden desktop keeps it (C4, i3's _NET_WM_DESKTOP)", () => {
    assert.deepStrictEqual(P.target({ desk: 7, modal: false, parentWs: null }, shown, 5), { ws: 7, why: "asked" });
    // A modal dialog without a parent in the tree is judged like any window.
    assert.deepStrictEqual(P.target({ desk: 7, modal: true, parentWs: null }, shown, 5), { ws: 7, why: "asked" });
});

test("target: otherwise the focused workspace (C1), even when KWin's choice was another output's", () => {
    // The pointer on A (KWin opens on 4), focus on B's 5.
    assert.deepStrictEqual(P.target({ desk: 4, modal: false, parentWs: null }, shown, 5), { ws: 5, why: "focused" });
    // The non-modal dialog of a parent on 4 follows C1 too.
    assert.deepStrictEqual(P.target({ desk: 4, modal: false, parentWs: 4 }, shown, 5), { ws: 5, why: "focused" });
});

test("target: the known limit: asking for exactly a shown desktop reads as not asking", () => {
    assert.deepStrictEqual(P.target({ desk: 4, modal: false, parentWs: null }, shown, 5), { ws: 5, why: "focused" });
});

test("target: no focus yet (a login's first window): KWin's choice stands", () => {
    assert.deepStrictEqual(P.target({ desk: 4, modal: false, parentWs: null }, shown, null), { ws: 4, why: "kwin" });
});

test("claim: the switch on the window's output to its desktop, and only that one", () => {
    const pending = [{ output: "A", previous: 4, current: 5 }, { output: "B", previous: 1, current: 2 }];
    assert.strictEqual(P.claim(pending, "B", 5), null, "another output's switch is not the window's");
    assert.strictEqual(P.claim(pending, "A", 4), null, "a switch away from the window's desktop is not its");
    assert.deepStrictEqual(P.claim(pending, "A", 5), { output: "A", previous: 4, current: 5 });
    assert.deepStrictEqual(pending, [{ output: "B", previous: 1, current: 2 }], "claimed: gone from the list");
});

test("shownBefore: what each output showed before the recorded switches", () => {
    const outputs = [{ name: "A", shows: 5 }, { name: "B", shows: 5 }];
    // The capture: A was switched 4 -> 5 by the dialog's activation; B showed 5 all along.
    assert.deepStrictEqual(P.shownBefore(outputs, [{ output: "A", previous: 4, current: 5 }]), { A: 4, B: 5 });
    assert.deepStrictEqual(P.shownBefore(outputs, []), { A: 5, B: 5 });
});

test("takesFocus (manage.c:437): only on the focused output's visible workspace; the first window always", () => {
    assert.strictEqual(P.takesFocus(true, true, true), true);
    assert.strictEqual(P.takesFocus(true, false, true), false, "the capture: the dialog on A, focus on B");
    assert.strictEqual(P.takesFocus(false, true, true), false, "a hidden workspace of the focused output");
    assert.strictEqual(P.takesFocus(false, false, false), true, "no focus yet");
});
