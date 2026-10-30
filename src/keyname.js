// Qt key codes as people read them, for the load-time notice (docs/records/spec-taken-keys.md):
// kglobalaccel answers in codes, the notice speaks in "Meta+Shift+Left". The modifiers come in
// kwin-i3's own order (its key table: Meta, Ctrl, Alt, Shift), then the key.

var KeyName = (function () {
    var MODS = [[0x10000000, "Meta"], [0x04000000, "Ctrl"], [0x08000000, "Alt"], [0x02000000, "Shift"]];
    var SPECIAL = {
        0x20: "Space", 0x01000000: "Esc", 0x01000001: "Tab", 0x01000003: "Backspace",
        0x01000004: "Return", 0x01000005: "Enter", 0x01000006: "Ins", 0x01000007: "Del",
        0x01000009: "Print", 0x01000010: "Home", 0x01000011: "End", 0x01000012: "Left",
        0x01000013: "Up", 0x01000014: "Right", 0x01000015: "Down", 0x01000016: "PgUp",
        0x01000017: "PgDown",
    };

    function of(code) {
        var parts = [];
        MODS.forEach(function (m) { if (code & m[0]) parts.push(m[1]); });
        var k = code & 0x01ffffff;
        if (SPECIAL[k]) parts.push(SPECIAL[k]);
        else if (k >= 0x01000030 && k <= 0x01000052) parts.push("F" + (k - 0x01000030 + 1));
        else if (k > 0x20 && k < 0x7f) parts.push(String.fromCharCode(k));
        else parts.push("0x" + k.toString(16));
        return parts.join("+");
    }

    return { of: of };
})();
