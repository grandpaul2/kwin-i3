// Unit tests for the settings page's reading and writing of the setting strings
// (kcm/ui/settings.js).
const test = require("node:test");
const assert = require("node:assert");
const K = require("../../kcm/ui/settings.js");
const fs = require("node:fs");
const path = require("node:path");

test("workspace monitors: read as the script reads them, written back in order", () => {
    assert.deepStrictEqual(K.parseOutputs("2=DP-6, 1=DP-4"), { 1: "DP-4", 2: "DP-6" });
    assert.deepStrictEqual(K.parseOutputs(" 3 = HDMI-A-1 ,11=DP-1, x=DP-2, 4"), { 3: "HDMI-A-1" }, "11, x and 4 dropped");
    assert.deepStrictEqual(K.parseOutputs(""), {});
    assert.deepStrictEqual(K.parseOutputs("1=DP-4 HDMI-A-1"), { 1: "DP-4" }, "a list: the first monitor is what the page shows");
    assert.deepStrictEqual(K.parseOutputLists("1=DP-4  HDMI-A-1, 2=DP-6"), { 1: "DP-4 HDMI-A-1", 2: "DP-6" });
    assert.strictEqual(K.formatOutputs(K.parseOutputLists("1=DP-4 HDMI-A-1")), "1=DP-4 HDMI-A-1", "a list written back whole");
    assert.strictEqual(K.formatOutputs({ 2: "DP-6", 1: "DP-4" }), "1=DP-4, 2=DP-6");
    assert.strictEqual(K.formatOutputs({ 1: "DP-4", 2: "" }), "1=DP-4", "a workspace set back to any monitor leaves");
    assert.strictEqual(K.formatOutputs({}), "");
});

test("Plasma-window workspaces: whole numbers 1-10, sorted, once each", () => {
    assert.deepStrictEqual(K.parseWorkspaces("7, 3, 3, 0, 11, x, 2.5"), [3, 7]);
    assert.strictEqual(K.formatWorkspaces([7, 3]), "3, 7");
    assert.strictEqual(K.formatWorkspaces([]), "");
});

test("window rules: split on line breaks and on ; outside quotes, as the script reads them", () => {
    assert.deepStrictEqual(K.splitRules('[class="^a$"] floating enable; [title="x;y"] floating disable\n\n [all] floating enable '),
        ['[class="^a$"] floating enable', '[title="x;y"] floating disable', '[all] floating enable']);
    assert.deepStrictEqual(K.splitRules(""), []);
});

test("window rules: a picked window's class becomes a floating rule, matched whole, dots escaped", () => {
    assert.strictEqual(K.pickRule("org.kde.kate"), '[class="^org\\.kde\\.kate$"] floating enable');
    assert.strictEqual(K.addRule("", K.pickRule("a")), '[class="^a$"] floating enable');
    assert.strictEqual(K.addRule("[all] floating enable\n", '[class="^a$"] floating enable'),
        '[all] floating enable\n[class="^a$"] floating enable', "on its own line");
    assert.strictEqual(K.addRule('[class="^a$"] floating enable', '[class="^a$"] floating enable'),
        '[class="^a$"] floating enable', "not twice");
});

test("window rules: the summary counts rules and assignments", () => {
    assert.deepStrictEqual(K.ruleCounts({ forWindow: "[all] floating enable; [all] floating disable", assign: "" }), { rules: 2, assigns: 0 });
    assert.deepStrictEqual(K.ruleCounts({ forWindow: "", assign: '[class="^steam$"] → 5' }), { rules: 0, assigns: 1 });
});

test("the Workspaces summary's counts", () => {
    assert.deepStrictEqual(K.workspaceCounts("1=DP-4, 2=DP-6", "3"), { pinned: 2, plasma: 1 });
    assert.deepStrictEqual(K.workspaceCounts("", ""), { pinned: 0, plasma: 0 });
});
