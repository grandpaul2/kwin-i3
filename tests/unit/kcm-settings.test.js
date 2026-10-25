// Unit tests for the settings page's reading and writing of the setting strings
// (kcm/ui/settings.js, docs/spec-settings-cleanup.md).
const test = require("node:test");
const assert = require("node:assert");
const K = require("../../kcm/ui/settings.js");
const fs = require("node:fs");
const path = require("node:path");

test("workspace monitors: read as the script reads them, written back in order", () => {
    assert.deepStrictEqual(K.parseOutputs("2=DP-6, 1=DP-4"), { 1: "DP-4", 2: "DP-6" });
    assert.deepStrictEqual(K.parseOutputs(" 3 = HDMI-A-1 ,11=DP-1, x=DP-2, 4"), { 3: "HDMI-A-1" }, "11, x and 4 dropped");
    assert.deepStrictEqual(K.parseOutputs(""), {});
    assert.strictEqual(K.formatOutputs({ 2: "DP-6", 1: "DP-4" }), "1=DP-4, 2=DP-6");
    assert.strictEqual(K.formatOutputs({ 1: "DP-4", 2: "" }), "1=DP-4", "a workspace set back to any monitor leaves");
    assert.strictEqual(K.formatOutputs({}), "");
});

test("Plasma-window workspaces: whole numbers 1-10, sorted, once each", () => {
    assert.deepStrictEqual(K.parseWorkspaces("7, 3, 3, 0, 11, x, 2.5"), [3, 7]);
    assert.strictEqual(K.formatWorkspaces([7, 3]), "3, 7");
    assert.strictEqual(K.formatWorkspaces([]), "");
});

const DEFAULTS = { ignoreClass: "krunner,yakuake", ignoreRole: "quake", floatingClass: "", floatingTitle: "" };

test("window rules: two lists from four settings, defaults marked", () => {
    const e = K.ruleEntries({ ignoreClass: "krunner, yakuake,kate", ignoreRole: "quake", floatingClass: "gimp", floatingTitle: "Picture-in-Picture" }, DEFAULTS);
    assert.deepStrictEqual(e, [
        { list: "ignore", kind: "class", value: "krunner", isDefault: true },
        { list: "ignore", kind: "class", value: "yakuake", isDefault: true },
        { list: "ignore", kind: "class", value: "kate", isDefault: false },
        { list: "ignore", kind: "role", value: "quake", isDefault: true },
        { list: "float", kind: "class", value: "gimp", isDefault: false },
        { list: "float", kind: "title", value: "Picture-in-Picture", isDefault: false },
    ]);
    assert.deepStrictEqual(K.ruleCounts(e), { ignore: 4, float: 2 });
});

test("window rules: written back unchanged equals the default (no spaces added)", () => {
    assert.deepStrictEqual(K.ruleSettings(K.ruleEntries(DEFAULTS, DEFAULTS)), DEFAULTS);
    const e = K.ruleEntries(DEFAULTS, DEFAULTS).concat([{ list: "float", kind: "title", value: "Copying", isDefault: false }]);
    assert.strictEqual(K.ruleSettings(e).floatingTitle, "Copying");
    assert.strictEqual(K.ruleSettings(e.filter((x) => x.value !== "yakuake")).ignoreClass, "krunner");
});

test("window rules: main.xml's defaults, which the page's Defaults restores, round-trip", () => {
    const xml = fs.readFileSync(path.join(__dirname, "../../package/contents/config/main.xml"), "utf8");
    const defs = {};
    ["ignoreClass", "ignoreRole", "floatingClass", "floatingTitle"].forEach((k) => {
        const m = new RegExp('name="' + k + '"[^>]*>[\\s\\S]*?<default>([^<]*)</default>').exec(xml);
        defs[k] = m ? m[1] : "";
    });
    assert.ok(defs.ignoreClass.indexOf("plasmashell") >= 0, "read the real list");
    assert.deepStrictEqual(K.ruleSettings(K.ruleEntries(defs, defs)), defs);
    assert.ok(K.ruleEntries(defs, defs).every((e) => e.isDefault));
});

test("a typed entry: not blank, no comma, not there already", () => {
    const e = K.ruleEntries(DEFAULTS, DEFAULTS);
    assert.strictEqual(K.entryProblem(e, "float", "class", "  "), "empty");
    assert.strictEqual(K.entryProblem(e, "float", "title", "a, b"), "comma");
    assert.strictEqual(K.entryProblem(e, "ignore", "class", " krunner "), "duplicate");
    assert.strictEqual(K.entryProblem(e, "float", "class", "krunner"), "", "the other list may have it");
    assert.deepStrictEqual(K.kindsFor("ignore"), ["class", "role"]);
    assert.deepStrictEqual(K.kindsFor("float"), ["class", "title"]);
});

test("the Workspaces summary's counts", () => {
    assert.deepStrictEqual(K.workspaceCounts("1=DP-4, 2=DP-6", "3"), { pinned: 2, plasma: 1 });
    assert.deepStrictEqual(K.workspaceCounts("", ""), { pinned: 0, plasma: 0 });
});
