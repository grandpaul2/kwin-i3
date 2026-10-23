// The default keys in src/kwin.js against the author's old i3 config (git d3de958^ in the dotfiles),
// translated: $mod is Meta, resize mode becomes Meta+Ctrl (a script can't have mode-only keys).
// The live tests press actions by name, so without this a typo in a key would ship unnoticed
// (test review 2026-10-22, fault 10).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "../../src/kwin.js"), "utf8");
const block = src.match(/var KEYS = (\{[\s\S]*?\n    \});/);
assert.ok(block, "KEYS table not found in src/kwin.js");
const KEYS = Function("return " + block[1])();

// The spec: tests/keys.json, the author's old i3 config translated. Shared with the live key sweep
// (tests/live/50-keys.sh), so neither reads the table it is checking.
const want = require("../keys.json");

test("every default key matches the old i3 config", () => {
    assert.deepStrictEqual(KEYS, want);
});

test("no key is bound to two actions", () => {
    const seen = {};
    for (const [action, keys] of Object.entries(KEYS))
        for (const k of keys) { assert.ok(!seen[k], `${k}: ${seen[k]} and ${action}`); seen[k] = action; }
});

test("every key has an action behind it", () => {
    for (const action of Object.keys(KEYS))
        assert.ok(src.includes(`"${action}": function`) || ["Focus", "Move"].some((p) => action.startsWith(p + " ")),
            `no action for "${action}"`);
});

test("workspace keys: Meta+1..0, Meta+Shift+1..0, and the shifted symbols (as i3ws)", () => {
    const names = Function("return " + src.match(/var NAMES = (\[[^\]]*\]);/)[1])();
    const shifted = Function("return " + src.match(/var SHIFTED = (\[[^\]]*\]);/)[1])();
    assert.deepStrictEqual(names, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    assert.deepStrictEqual(shifted, ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"]);
    for (const k of ['"Meta+" + k', '"Meta+Shift+" + k', '"Meta+" + SHIFTED[i]'])
        assert.ok(src.includes(k), `workspace binding ${k} missing`);
});
