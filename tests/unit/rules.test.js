// Unit tests for src/rules.js (node --test; approved by Paul, 2026-10-28): the i3 kind of each
// window (docs/behaviour.md §3; docs/records/spec-redo-3-kinds-rules.md A), the rule parser (B), the
// once-per-window record (X2), `assign` (N12), and the old list settings read as rules (C), with
// Paul's two titles as a case. Windows are stubs with KWin's window properties (window.h).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// src/rules.js under a stub Settings (values as src/settings.js parses them) and a log that keeps
// its WARN lines.
const src = fs.readFileSync(path.join(__dirname, "../../src/rules.js"), "utf8");
function rules(settings) {
    const values = Object.assign({ forWindow: "", assign: "", floatingWorkspaces: {},
                                   floatingMinimumSize: "75x50", floatingMaximumSize: "0x0" }, settings);
    const logs = [];
    const R = Function("Settings", "log", "module", src + "\nreturn Rules;")({ get: (k) => values[k] }, (l) => logs.push(l), undefined);
    return { R, logs };
}
const win = (w) => Object.assign({ normalWindow: true, resourceClass: "", resourceName: "", caption: "", windowRole: "",
                                   resizeable: true, fullScreen: false, minSize: { width: 0, height: 0 }, maxSize: { width: 1e6, height: 1e6 } }, w);
const kind = (R, w, ctx) => R.classify(win(w), ctx);

// ---- the kinds kept out of the tree ----------------------------------------------------------

test("i3Kind: a panel is a dock, the desktop window is root", () => {
    const { R } = rules();
    assert.strictEqual(R.i3Kind(win({ dock: true, resourceClass: "plasmashell" })), "dock");
    assert.strictEqual(R.i3Kind(win({ desktopWindow: true, resourceClass: "plasmashell" })), "root");
});

test("i3Kind: popups, menus, tooltips, OSDs and Plasma's notifications are override-redirect, by type", () => {
    const { R } = rules();
    for (const t of ["popupWindow", "menu", "dropdownMenu", "popupMenu", "tooltip",
                     "onScreenDisplay", "comboBox", "dndIcon", "appletPopup"])
        assert.strictEqual(R.i3Kind(win({ [t]: true })), "override-redirect", t);
    for (const t of ["notification", "criticalNotification"]) {
        assert.strictEqual(R.i3Kind(win({ [t]: true, resourceClass: "org.kde.plasmashell" })), "override-redirect", t + " of Plasma's");
        assert.strictEqual(R.i3Kind(win({ [t]: true, resourceClass: "steam" })), null, t + " of another app: in the tree, as i3's manage.c:466");
    }
    assert.strictEqual(R.i3Kind(win({ appletPopup: true, resourceClass: "plasmashell" })), "override-redirect", "a panel popup");
});

test("i3Kind: KRunner, Plasma's system windows, the logout screen and Spectacle's fullscreen overlays are override-redirect", () => {
    const { R } = rules();
    for (const c of ["krunner", "kded5", "kded6", "xwaylandvideobridge", "ksplashqml", "kwin_wayland", "ksmserver-logout-greeter"])
        assert.strictEqual(R.i3Kind(win({ resourceClass: c })), "override-redirect", c);
    assert.strictEqual(R.i3Kind(win({ resourceName: "krunner", resourceClass: "org.kde.krunner" })), "override-redirect", "by name");
    assert.strictEqual(R.i3Kind(win({ resourceClass: "org.kde.spectacle", fullScreen: true })), "override-redirect", "the region overlay (probe 93, call 60)");
    assert.strictEqual(R.i3Kind(win({ resourceClass: "org.kde.spectacle" })), null, "Spectacle's own window is a rule's (floating by default)");
    assert.strictEqual(R.i3Kind(win({ resourceClass: "plasmashell" })), null, "plasmashell's ordinary windows are a rule's");
});

test("classify: the kinds kept out come first; on all desktops is sticky (in the tree, floating, redo stage 9); other non-Normal types are override-redirect", () => {
    const { R } = rules();
    assert.strictEqual(kind(R, { deleted: true }), "override-redirect");
    assert.strictEqual(kind(R, { dock: true }), "dock");
    assert.strictEqual(kind(R, { onAllDesktops: true, resourceClass: "yakuake" }), "sticky");
    assert.strictEqual(R.keptOut(win({ onAllDesktops: true, resourceClass: "yakuake" })), null, "sticky is in the tree since redo stage 9");
    assert.strictEqual(kind(R, { normalWindow: false }), "override-redirect", "a type KWin has that i3 wouldn't manage");
    assert.strictEqual(R.keptOut(win({ resourceClass: "Alacritty" })), null);
});

// ---- the default float and the kinds (A6-A8) ---------------------------------------------------

test("classify: i3's float at manage: transient, modal, fixed size, dialog, utility, toolbar, splash (X11 types too, R2), the capture note; else tiling", () => {
    const { R } = rules();
    assert.strictEqual(kind(R, { resourceClass: "Alacritty" }), "tiling");
    for (const f of [{ transient: true }, { modal: true }, { resizeable: false }, { dialog: true, normalWindow: false },
                     { utility: true, normalWindow: false }, { toolbar: true, normalWindow: false }, { splash: true, normalWindow: false },
                     { caption: "kwin-i3 capture note" }])
        assert.strictEqual(kind(R, f), "floating", JSON.stringify(f));
    // KWin calls a fullscreen window not resizeable: it is judged by its own limits (B of spec-fullscreen-tree).
    assert.strictEqual(kind(R, { fullScreen: true, resizeable: false, minSize: { width: 100, height: 100 }, maxSize: { width: 2000, height: 2000 } }), "tiling");
    assert.strictEqual(kind(R, { fullScreen: true, resizeable: false, minSize: { width: 100, height: 100 }, maxSize: { width: 100, height: 100 } }), "floating");
    assert.strictEqual(kind(R, { skipTaskbar: true }), "tiling", "skipping the taskbar decides nothing (R4)");
});

test("classify: the default rules float Spectacle, the password prompt, KRuler, plasmashell's ordinary windows and the portal's dialogs", () => {
    const { R } = rules({ forWindow: fs.readFileSync(path.join(__dirname, "../../src/settings.js"), "utf8").match(/DEFAULT_RULES = ([\s\S]*?);\n    var TABLE/)[1]
        .split("+").map((p) => JSON.parse(p.trim())).join("") });
    assert.strictEqual(kind(R, { resourceClass: "org.kde.spectacle" }), "floating");
    assert.strictEqual(kind(R, { resourceClass: "org.kde.polkit-kde-authentication-agent-1" }), "floating");
    assert.strictEqual(kind(R, { resourceClass: "kruler" }), "floating");
    assert.strictEqual(kind(R, { resourceClass: "org.kde.kruler" }), "floating");
    assert.strictEqual(kind(R, { resourceClass: "plasmashell" }), "floating", "Configure Desktop and Wallpaper");
    assert.strictEqual(kind(R, { resourceClass: "org.kde.plasmashell", dialog: true, normalWindow: false }), "floating");
    assert.strictEqual(kind(R, { resourceClass: "org.freedesktop.impl.portal.desktop.kde" }), "floating", "the screen-share picker, no parent (OPEN.md 62)");
    assert.strictEqual(kind(R, { resourceClass: "org.kde.kate" }), "tiling");
});

// ---- the parser (B) -------------------------------------------------------------------------------

test("parseForWindow: criteria quoted or bare (i3's word), all must match, floating enable|disable; bad lines are skipped with a WARN", () => {
    const { R, logs } = rules();
    const r = R.parseForWindow('[class="^org\\.kde\\.kate$" title="Find"] floating enable\n[all] floating disable\n[tiling] floating enable');
    assert.strictEqual(r.length, 3);
    assert.ok(r[0].crit.class instanceof RegExp && r[0].crit.title instanceof RegExp && r[0].floating === true);
    assert.strictEqual(r[1].crit.all, true);
    assert.strictEqual(r[1].floating, false);
    assert.strictEqual(r[2].crit.tiling, true);
    for (const bad of ['[class="a"] move left', 'floating enable', '[class="(" ] floating enable',
                       '[floating="yes"] floating enable', '[bogus="x"] floating enable', '[] floating enable'])
        assert.strictEqual(R.parseForWindow(bad).length, 0, bad);
    assert.ok(logs.every((l) => l.startsWith("WARN setting forWindow")), logs.join("\n"));
    assert.strictEqual(logs.length, 6);
    // A bare value, as i3's config takes it (commands.spec `word`): up to a space or the `]`.
    const bare = R.parseForWindow("[class=^Viewnior$ title=Find] floating enable");
    assert.strictEqual(bare.length, 1);
    assert.ok(bare[0].crit.class.test("Viewnior") && !bare[0].crit.class.test("Viewnior2") && bare[0].crit.title.test("Find"));
    assert.strictEqual(logs.length, 6, "no WARN for it");
});

test("parseForWindow: rules separated by line breaks or ; outside quotes, and \\\" inside a value", () => {
    const { R } = rules();
    const r = R.parseForWindow('[title="a;b"] floating enable; [title="say \\"hi\\""] floating disable\r\n[class="x"] floating enable');
    assert.deepStrictEqual(r.map((x) => x.floating), [true, false, true]);
    assert.ok(r[0].crit.title.test("a;b"));
    assert.ok(r[1].crit.title.test('say "hi"'));
});

test("parseAssign: → N, workspace N, number N (1-10), output X; else a WARN", () => {
    const { R, logs } = rules();
    const r = R.parseAssign('[class="^steam$"] → 5\n[class="^a$"] -> workspace 2\n[class="^b$"] workspace number 10\n[class="^c$"] 3\n[class="^discord$"] output DP-6');
    assert.deepStrictEqual(r.map((x) => x.workspace || x.output), [5, 2, 10, 3, "DP-6"]);
    assert.strictEqual(R.parseAssign('[class="^d$"] → 11').length, 0, "beyond 10");
    assert.strictEqual(R.parseAssign('[class="^d$"] floating enable').length, 0, "not an assign");
    assert.strictEqual(logs.length, 2);
});

// ---- matching, the record and assign ------------------------------------------------------------

test("classify: criteria match class, instance, title, window_role, window_type, workspace, floating/tiling; all in one rule", () => {
    const { R } = rules({ forWindow: [
        '[class="^kate$" title="Find"] floating enable',
        '[instance="^term$"] floating enable',
        '[window_role="^pop$"] floating enable',
        '[window_type="dialog"] floating disable',
        '[workspace="^3$"] floating enable',
    ].join("\n") });
    assert.strictEqual(kind(R, { resourceClass: "kate", caption: "Edit" }), "tiling", "both must match");
    assert.strictEqual(kind(R, { resourceClass: "kate", caption: "Find in files" }), "floating");
    assert.strictEqual(kind(R, { resourceName: "term" }), "floating");
    assert.strictEqual(kind(R, { windowRole: "pop" }), "floating");
    assert.strictEqual(kind(R, { dialog: true, normalWindow: false, resourceClass: "x" }), "tiling", "floating disable tiles a dialog");
    assert.strictEqual(kind(R, { resourceClass: "x" }, { ws: 3 }), "floating", "the workspace it opens on (floatingWorkspaces as a criterion)");
    assert.strictEqual(kind(R, { resourceClass: "x" }, { ws: 2 }), "tiling");
    // Rules run in order, each seeing the kind the ones before left (i3): [floating] after an
    // enable undoes it, and alone it sees the default float.
    assert.strictEqual(kind(rules({ forWindow: '[floating] floating disable' }).R, { transient: true, resourceClass: "x" }), "tiling", "[floating] sees the default float and tiles it");
    assert.strictEqual(kind(rules({ forWindow: '[class="^x$"] floating enable\n[floating] floating disable' }).R, { resourceClass: "x" }), "tiling");
});

test("classify: each rule runs at most once per window, only to apply it (X2); a changed setting runs them anew", () => {
    const { R } = rules({ forWindow: '[title="STAGE"] floating enable' });
    const ran = {};
    const w = win({ resourceClass: "Xephyr", caption: "Xephyr" });
    assert.strictEqual(R.classify(w, { ws: 1, current: null, ran }), "tiling");
    w.caption = "STAGE (streamed)";
    assert.strictEqual(R.classify(w, { ws: 1, current: "tiling", ran }), "floating", "the title now matches");
    assert.deepStrictEqual(ran, { 0: true });
    w.caption = "Xephyr";
    assert.strictEqual(R.classify(w, { ws: 1, current: "floating", ran }), "floating", "stays floating: the rule ran");
    // Floated by hand, then the title matches again: the rule ran already, nothing changes.
    assert.strictEqual(R.classify(win({ caption: "STAGE" }), { ws: 1, current: "tiling", ran: { 0: true } }), "tiling");
    // The record cleared (a changed setting): the rule applies again.
    assert.strictEqual(R.classify(win({ caption: "STAGE" }), { ws: 1, current: "tiling", ran: {} }), "floating");
});

test("assignFor: the first matching assign, as workspace or output; none without a match", () => {
    const { R } = rules({ assign: '[class="^steam$"] → 5\n[class="^discord$"] output DP-6\n[class="^steam$"] → 7' });
    assert.deepStrictEqual(R.assignFor(win({ resourceClass: "steam" })), { workspace: 5 });
    assert.deepStrictEqual(R.assignFor(win({ resourceClass: "discord" })), { output: "DP-6" });
    assert.strictEqual(R.assignFor(win({ resourceClass: "kate" })), null);
});

// ---- floatingWorkspaces as rules (R11) -----------------------------------------------------------

test("floatingWorkspaces: a rule per workspace, before forWindow", () => {
    const { R } = rules({ floatingWorkspaces: { 3: true }, forWindow: '[class="^gimp$"] floating disable' });
    assert.strictEqual(kind(R, { caption: "Firefox" }, { ws: 3 }), "floating", "a Floating workspace");
    assert.strictEqual(kind(R, { caption: "Firefox" }, { ws: 1 }), "tiling");
    assert.strictEqual(kind(R, { resourceClass: "gimp" }, { ws: 3 }), "tiling", "forWindow runs after: the user's disable wins");
});

test("parseSize: WxH with 0 and -1; anything else null", () => {
    const { R } = rules();
    assert.deepStrictEqual(R.parseSize("75x50"), { w: 75, h: 50 });
    assert.deepStrictEqual(R.parseSize(" -1 x 0 "), { w: -1, h: 0 });
    assert.strictEqual(R.parseSize("75"), null);
    assert.strictEqual(R.parseSize("-2x5"), null);
});
