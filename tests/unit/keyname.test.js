// src/keyname.js: every default key, turned into its Qt code by the table here (Qt's
// qnamespace.h values, not src/'s), reads back as the text kwin-i3 registers it with.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const KeyName = Function(fs.readFileSync(path.join(__dirname, "../../src/keyname.js"), "utf8") + "\nreturn KeyName;")();

const MOD = { Meta: 0x10000000, Ctrl: 0x04000000, Alt: 0x08000000, Shift: 0x02000000 };
const KEY = { Left: 0x01000012, Up: 0x01000013, Right: 0x01000014, Down: 0x01000015, Space: 0x20, Return: 0x01000004 };
function code(text) {
    const parts = text === "Meta++" ? ["Meta", "+"] : text.split("+");
    const key = parts.pop();
    let c = KEY[key] !== undefined ? KEY[key] : key.charCodeAt(0);
    assert.ok(key.length === 1 || KEY[key] !== undefined, `no code for ${key}`);
    for (const m of parts) c |= MOD[m];
    return c;
}

test("every default key reads back as its text", () => {
    const keys = Object.values(require("../keys.json")).flat();
    for (const d of "1234567890") keys.push("Meta+" + d, "Meta+Shift+" + d);
    for (const s of "!@#$%^&*()") keys.push("Meta+" + s);
    for (const k of keys) assert.strictEqual(KeyName.of(code(k)), k);
});

test("keys outside kwin-i3's own", () => {
    assert.strictEqual(KeyName.of(0x08000000 | 0x01000033), "Alt+F4");
    assert.strictEqual(KeyName.of(0x10000000 | 0x01000004), "Meta+Return");
    assert.strictEqual(KeyName.of(0x10000000 | 0x2b), "Meta++");
    assert.strictEqual(KeyName.of(0x10000000 | 0x01000100), "Meta+0x1000100");
});
