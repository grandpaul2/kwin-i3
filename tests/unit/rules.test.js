// Unit tests for src/rules.js's i3Kind (node --test; approved by Paul, 2026-10-28): the i3 kind of
// a window kept out of the tree, against docs/behaviour.md §3's table. Windows are stubs with
// KWin's window-type properties (window.h) and class.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// src/rules.js under a stub Settings (the lists are not i3Kind's business).
const src = fs.readFileSync(path.join(__dirname, "../../src/rules.js"), "utf8");
const Rules = Function("Settings", "log", "module", src + "\nreturn Rules;")({ get: () => [] }, () => {}, undefined);
const kind = (w) => Rules.i3Kind(Object.assign({ resourceClass: "", resourceName: "" }, w));

test("i3Kind: a panel is a dock, the desktop window is root", () => {
    assert.strictEqual(kind({ dock: true, resourceClass: "plasmashell" }), "dock");
    assert.strictEqual(kind({ desktopWindow: true, resourceClass: "plasmashell" }), "root");
});

test("i3Kind: popups, menus, tooltips, notifications, OSDs are override-redirect, by type", () => {
    for (const t of ["popupWindow", "menu", "dropdownMenu", "popupMenu", "tooltip", "notification",
                     "criticalNotification", "onScreenDisplay", "comboBox", "dndIcon", "appletPopup"])
        assert.strictEqual(kind({ [t]: true }), "override-redirect", t);
    assert.strictEqual(kind({ appletPopup: true, resourceClass: "plasmashell" }), "override-redirect", "a panel popup");
});

test("i3Kind: KRunner, Plasma's system windows and the logout screen are override-redirect, by class", () => {
    for (const c of ["krunner", "kded5", "kded6", "xwaylandvideobridge", "ksplashqml", "kwin_wayland", "ksmserver-logout-greeter"])
        assert.strictEqual(kind({ normalWindow: true, resourceClass: c }), "override-redirect", c);
    assert.strictEqual(kind({ normalWindow: true, resourceName: "krunner", resourceClass: "org.kde.krunner" }), "override-redirect", "by name");
});

test("i3Kind: the rest have no kind yet (stage 3): Yakuake, Spectacle, plasmashell's ordinary windows, any managed window", () => {
    assert.strictEqual(kind({ normalWindow: true, resourceClass: "yakuake" }), null);
    assert.strictEqual(kind({ normalWindow: true, resourceClass: "spectacle" }), null);
    assert.strictEqual(kind({ normalWindow: true, resourceClass: "plasmashell" }), null);
    assert.strictEqual(kind({ normalWindow: true, resourceClass: "Alacritty" }), null);
    assert.strictEqual(kind({ normalWindow: true, dialog: true, resourceClass: "kate" }), null);
});
