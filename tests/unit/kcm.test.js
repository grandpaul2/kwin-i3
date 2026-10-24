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
    Function("KEYS", "NAMES", "SHIFTED", "RETIRED", "KWIN_OWN", "registerShortcut", "act", "guard", "actions", "log",
             "gotoWorkspace", "moveToWorkspace", "DEBUG_LOG", "callDBus", fn[0] + "registerKeys();")(
        get(/var KEYS = (\{[\s\S]*?\n    \});/), get(/var NAMES = (\[[^\]]*\]);/), get(/var SHIFTED = (\[[^\]]*\]);/),
        [], {}, reg, () => null, () => null, {}, () => {}, null, null, false, () => {});
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

// A Shift+key that types a symbol arrives as that symbol: Meta+Shift+; never fires, Meta+: does
// (probed 2026-10-24, KWin 6.7.5). Letters and arrows are unaffected.
test("no key is registered in its dead Shift+symbol form", () => {
    for (const [action, key] of registered())
        assert.ok(!/Shift\+([0-9;',./\[\]\\=`-])$/.test(key), `${action}: ${key} never fires`);
});

test("the retired actions are not registered", () => {
    const names = registered().map((r) => r[0]);
    for (const a of ["kwin-i3 Move Right (;)", "kwin-i3 Move to Workspace 1"]) assert.ok(!names.includes(a), a);
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
