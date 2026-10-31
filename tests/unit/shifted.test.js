// The settings page's names for shifted symbols (kcm/ui/shifted.js),
// with the top rows of real layouts as KWin's keymap gives them: [unshifted, shifted, typed].
const test = require("node:test");
const assert = require("node:assert");
const { shifted } = require("../../kcm/ui/shifted.js");

const M = 0x10000000, C = 0x04000000, S = 0x02000000;
const row = (pairs) => pairs.map(([a, b]) => [a.toUpperCase().codePointAt(0), b.toUpperCase().codePointAt(0), a.codePointAt(0)]);
const US = row([["1", "!"], ["2", "@"], ["3", "#"], ["7", "&"], [";", ":"], ["q", "Q"]]);
const DE = row([["1", "!"], ["2", "\""], ["3", "§"], ["6", "&"], ["ö", "Ö"], ["q", "Q"]]);
const FR = row([["&", "1"], ["é", "2"], ["\"", "3"], ["m", "M"]]);
const k = (ch) => ch.codePointAt(0);

test("US: Meta+! is Meta+Shift+1, Meta+: is Meta+Shift+;", () => {
    assert.strictEqual(shifted(M | k("!"), US), "Meta+Shift+1");
    assert.strictEqual(shifted(M | k("@"), US), "Meta+Shift+2");
    assert.strictEqual(shifted(M | k(":"), US), "Meta+Shift+;");
});

test("German, as the helper fits it: Meta+\" is Meta+Shift+2; the same symbol names other keys on US", () => {
    assert.strictEqual(shifted(M | k("\""), DE), "Meta+Shift+2");
    assert.strictEqual(shifted(M | k("&"), DE), "Meta+Shift+6");
    assert.strictEqual(shifted(M | k("&"), US), "Meta+Shift+7");
});

test("French: Meta+1 is Meta+Shift+& (the key's own symbol); Meta+2 is Meta+Shift+é, lowercase as printed", () => {
    assert.strictEqual(shifted(M | k("1"), FR), "Meta+Shift+&");
    assert.strictEqual(shifted(M | k("2"), FR), "Meta+Shift+é");
});

test("nothing for a plain key, a letter, a key already with Shift, or a symbol no key shifts to", () => {
    assert.strictEqual(shifted(M | k("1"), US), "", "1 is unshifted on US");
    assert.strictEqual(shifted(M | S | k("Q"), US), "", "Meta+Shift+Q already reads as keys");
    assert.strictEqual(shifted(M | k("Ö"), DE), "", "a letter");
    assert.strictEqual(shifted(M | k("%"), US), "", "not in the table");
    assert.strictEqual(shifted(0, US), "");
    assert.strictEqual(shifted(M | k("!"), []), "", "no table (no keymap)");
});

test("the other modifiers stay, in kwin-i3's order", () => {
    assert.strictEqual(shifted(M | C | k(":"), US), "Meta+Ctrl+Shift+;");
});
