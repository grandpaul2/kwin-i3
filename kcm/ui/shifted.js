// The keys that type a shifted symbol (docs/records/spec-keys-shifted-labels.md): a KDE shortcut is the
// symbol, so Meta+Shift+1 is stored as Meta+! on a US keyboard; the page names it by its keys.
// table: the current layout's keys, each [unshifted, shifted] as Qt keys and the unshifted
// character as typed (é, not Qt's É) (KeysModel.layoutTable).
// Returns "Meta+Shift+1", or "" when the key isn't a non-letter symbol typed with Shift.
var MODS = [[0x10000000, "Meta"], [0x04000000, "Ctrl"], [0x08000000, "Alt"], [0x02000000, "Shift"]];

function isLetter(code) {
    return /\p{L}/u.test(String.fromCodePoint(code));
}

function shifted(combo, table) {
    var key = combo & 0x01ffffff, mods = combo & ~0x01ffffff;
    if (!key || (mods & 0x02000000) || isLetter(key)) return "";
    for (var i = 0; i < (table || []).length; i++) {
        var base = table[i][0], up = table[i][1], typed = table[i][2] || base;
        if (up === key && base !== key && base > 0x20 && base < 0x01000000) {
            var parts = MODS.filter(function (m) { return mods & m[0]; }).map(function (m) { return m[1]; });
            return parts.concat(["Shift", String.fromCodePoint(typed)]).join("+");
        }
    }
    return "";
}

if (typeof module !== "undefined") module.exports = { shifted: shifted };
