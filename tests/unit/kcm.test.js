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
    // The actions with no default key: the UNBOUND table and the loop that adds the output moves.
    // The UNBOUND table, the loop that adds the output moves, and the one that adds the
    // no-back-and-forth workspace actions (redo stage 5).
    const unbound = src.match(/(var UNBOUND = \{[\s\S]*?\n    \}\);\n(?:[^\n]*\n)*?    NAMES\.forEach[\s\S]*?\n    \}\);\n)/);
    assert.ok(unbound, "UNBOUND not found in src/kwin.js");
    const UNBOUND = Function("NAMES", "gotoWorkspace", "moveToWorkspace", "focusOutput", "moveToOutput", "moveWorkspaceToOutput",
                             unbound[1] + "return UNBOUND;")(get(/var NAMES = (\[[^\]]*\]);/), null, null, null, null, null);
    Function("KEYS", "NAMES", "SHIFTED", "RETIRED", "KWIN_OWN", "UNBOUND", "registerShortcut", "act", "guard", "actions", "log",
             "gotoWorkspace", "moveToWorkspace", "DEBUG_LOG", "callDBus", fn[0] + "registerKeys();")(
        get(/var KEYS = (\{[\s\S]*?\n    \});/), get(/var NAMES = (\[[^\]]*\]);/), get(/var SHIFTED = (\[[^\]]*\]);/),
        [], {}, UNBOUND, reg, () => null, () => null, {}, () => {}, null, null, false, () => {});
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

test("the workspace commands are registered with no key (docs/spec-workspace-commands.md)", () => {
    const r = Object.fromEntries(registered());
    const want = ["Workspace Back and Forth", "Move to Workspace Back and Forth", "Workspace Next", "Workspace Prev",
                  "Workspace Next on Output", "Workspace Prev on Output", "Move to Workspace Next", "Move to Workspace Prev",
                  "Move to Workspace Next on Output", "Move to Workspace Prev on Output"];
    for (const d of ["Left", "Right", "Up", "Down", "Next", "Primary"])
        want.push("Focus Output " + d, "Move to Output " + d, "Move Workspace to Output " + d);
    for (let n = 1; n <= 10; n++) want.push("Workspace " + n + " (no back-and-forth)", "Move to Workspace " + n + " (no back-and-forth)");
    for (const a of ["Shrink Width", "Grow Width", "Shrink Height", "Grow Height"]) want.push(a);
    for (const a of want) assert.strictEqual(r["kwin-i3 " + a], "", a);
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

// The helper plugin's table of keys that mean a position (plugin/layoutkeys.cpp,
// docs/spec-keyboard-layouts.md): each action exists, and its US key is the one registered, so a
// key the user hasn't changed is recognised as kwin-i3's default.
test("the layout keys' table names registered actions with their registered US keys", () => {
    const cpp = fs.readFileSync(path.join(root, "plugin/layoutkeys.cpp"), "utf8");
    const slots = [...cpp.matchAll(/\{"(kwin-i3 [^"]+)", KEY_\w+, [01], [^,]+, "([^"]+)"\}/g)].map((m) => [m[1], m[2]]);
    assert.strictEqual(slots.length, 37, "10 workspaces, 10 moves, two on the ; key, and the 15 letter keys by position (refinement stage 6, Paul's call 36)");
    const reg = Object.fromEntries(registered());
    for (const [action, us] of slots) assert.strictEqual(reg[action], us, action);
});
