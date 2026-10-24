// The settings page's Keys table (kcm/ui/commands.json, docs/spec-settings-page.md) against what the
// script registers: registerKeys() from src/kwin.js run with stubs, plus the two actions start()
// registers. A key added to the script and not to the page would be a key nobody can rebind there.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const src = fs.readFileSync(path.join(root, "src/kwin.js"), "utf8");
const table = JSON.parse(fs.readFileSync(path.join(root, "kcm/ui/commands.json"), "utf8"));

function registered() {
    const get = (re) => Function("return " + src.match(re)[1])();
    const fn = src.match(/function registerKeys\(\) \{[\s\S]*?\n    \}\n/);
    assert.ok(fn, "registerKeys not found in src/kwin.js");
    const out = [];
    const reg = (action, friendly, key) => out.push([action, key]);
    Function("KEYS", "NAMES", "SHIFTED", "KWIN_OWN", "registerShortcut", "act", "guard", "actions", "log",
             "gotoWorkspace", "moveToWorkspace", "DEBUG_LOG", fn[0] + "registerKeys();")(
        get(/var KEYS = (\{[\s\S]*?\n    \});/), get(/var NAMES = (\[[^\]]*\]);/), get(/var SHIFTED = (\[[^\]]*\]);/),
        {}, reg, () => null, () => null, {}, () => {}, null, null, false);
    // start()'s own two, outside registerKeys.
    for (const m of src.matchAll(/registerShortcut\("(kwin-i3 (?:Release|Dump State))",\s*"[^"]*",\s*"([^"]*)"/g))
        out.push([m[1], m[2]]);
    return out;
}

test("every action the script registers has its row and default on the Keys page", () => {
    const page = table.flatMap((g) => g.commands.flatMap((c) => c.actions));
    const sort = (a) => a.map((x) => x.join(" = ")).sort();
    assert.deepStrictEqual(sort(page), sort(registered()));
});

test("the self-test actions are not on the Keys page", () => {
    const page = JSON.stringify(table);
    assert.ok(!page.includes("Selftest"));
});

test("every command has a label and a group", () => {
    for (const g of table) {
        assert.ok(g.group);
        for (const c of g.commands) assert.ok(c.label && c.actions.length, JSON.stringify(c));
    }
});
