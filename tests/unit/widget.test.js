// Unit tests for the workspace widget's logic (widget/contents/ui/workspaces.js,
// docs/records/spec-workspace-widget.md), from data shaped as Plasma's task manager gives it.
const test = require("node:test");
const assert = require("node:assert");
const W = require("../../widget/contents/ui/workspaces.js");

// Two 2560x1440 monitors side by side; DP-6 on the left, DP-4 on the right (Paul's).
const SCREENS = [{ name: "DP-6", x: 0, y: 0, width: 2560, height: 1440 },
                 { name: "DP-4", x: 2560, y: 0, width: 2560, height: 1440 }];
const DESKS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
const win = (desk, x, y, w, h, extra) => Object.assign({ desktops: [desk], onAll: false, x, y, width: w, height: h, active: false }, extra);
const run = (windows, shown, extra) => W.workspaces(Object.assign({ desktops: DESKS, names: [], screens: SCREENS, shown, windows }, extra));
const nums = (l) => l.map((s) => s.num);

test("in use: windows on it or shown on a monitor; the rest left out (5 and 6 empty)", () => {
    const l = run([win("d1", 2560, 0, 2560, 1440), win("d4", 0, 0, 1280, 1440), win("d7", 3200, 360, 1280, 720)],
                  { "DP-4": "d3", "DP-6": "d2" });
    assert.deepStrictEqual(nums(l), [1, 2, 3, 4, 7]);
});

test("each at its own monitor: the one showing it, else the one its windows are on", () => {
    const l = run([win("d1", 2560, 0, 2560, 1440), win("d4", 0, 0, 1280, 1440)], { "DP-4": "d3", "DP-6": "d2" });
    const by = Object.fromEntries(l.map((s) => [s.num, s.screen]));
    assert.deepStrictEqual(by, { 1: "DP-4", 2: "DP-6", 3: "DP-4", 4: "DP-6" });
    assert.strictEqual(l[0].width, 2560); assert.strictEqual(l[0].height, 1440);     // one monitor, not both
});

test("windows as fractions of their workspace's monitor", () => {
    const l = run([win("d4", 1280, 0, 1280, 1440), win("d1", 2561, 1, 2558, 1392)], {});
    const four = l.find((s) => s.num === 4);
    assert.deepStrictEqual(four.windows, [{ x: 0.5, y: 0, width: 0.5, height: 1, active: false }]);
    const one = l.find((s) => s.num === 1);
    assert.ok(Math.abs(one.windows[0].x - 1 / 2560) < 1e-9 && one.windows[0].width < 1);
});

test("shown and focused: the focused monitor's is the active window's workspace", () => {
    const l = run([win("d3", 2561, 1, 2558, 1392, { active: true }), win("d2", 1, 1, 2558, 1438)],
                  { "DP-4": "d3", "DP-6": "d2" });
    const three = l.find((s) => s.num === 3), two = l.find((s) => s.num === 2);
    assert.ok(three.shown && three.focused);
    assert.ok(two.shown && !two.focused);
});

test("windows on all desktops belong to no workspace", () => {
    const l = run([win("d5", 0, 0, 100, 100, { onAll: true })], { "DP-4": "d1" });
    assert.deepStrictEqual(nums(l), [1]);
});

test("a desktop removed: the numbers are positions (workspace N is desktop N)", () => {
    const l = W.workspaces({ desktops: ["d1", "d3", "d4"], names: [], screens: SCREENS, shown: { "DP-4": "d3" },
                             windows: [win("d4", 0, 0, 100, 100)] });
    assert.deepStrictEqual(l.map((s) => [s.num, s.id]), [[2, "d3"], [3, "d4"]]);
});

test("one monitor and three", () => {
    const one = W.workspaces({ desktops: DESKS, screens: [SCREENS[0]], shown: { "DP-6": "d1" }, windows: [win("d2", 0, 0, 10, 10)] });
    assert.deepStrictEqual(one.map((s) => s.screen), ["DP-6", "DP-6"]);
    const three = SCREENS.concat([{ name: "HDMI-1", x: 5120, y: 0, width: 1920, height: 1080 }]);
    const l = W.workspaces({ desktops: DESKS, screens: three, shown: { "HDMI-1": "d5" }, windows: [win("d6", 5200, 100, 800, 600)] });
    assert.deepStrictEqual(l.map((s) => [s.num, s.screen, s.width]), [[5, "HDMI-1", 1920], [6, "HDMI-1", 1920]]);
});

test("scroll: next and previous in use from the focused one, wrapping", () => {
    const l = [{ num: 1, shown: false, focused: false }, { num: 3, shown: true, focused: true }, { num: 7, shown: false, focused: false }];
    assert.strictEqual(W.step(l, 1), 7);
    assert.strictEqual(W.step(l, -1), 1);
    assert.strictEqual(W.step([{ num: 2, shown: true, focused: true }, { num: 4 }], 1), 4);
    assert.strictEqual(W.step([{ num: 4, shown: false, focused: true }, { num: 9 }], 1), 9);
    assert.strictEqual(W.step([], 1), null);
    // Steps before the answer: from the one last asked for (three quick notches: three steps).
    assert.strictEqual(W.step(l, 1, 7), 1);
    assert.strictEqual(W.step(l, 1, 1), 3);
    // No window focused: from the first shown one.
    assert.strictEqual(W.step([{ num: 2, shown: false }, { num: 5, shown: true, focused: false }, { num: 6 }], 1), 6);
});

// docs/records/spec-workspace-commands.md, 4: "2 mail" for a desktop with a name of its own; KWin's
// default ("Desktop 2", in the user's language) is no name.
test("label: a name of its own is shown after the number; KWin's default or none is not", () => {
    assert.strictEqual(W.label(2, "mail", "Desktop 2"), "2 mail");
    assert.strictEqual(W.label(2, "Desktop 2", "Desktop 2"), "2", "KWin's default name");
    assert.strictEqual(W.label(2, "Arbeitsfläche 2", "Arbeitsfläche 2"), "2", "the default in German");
    assert.strictEqual(W.label(2, "Desktop 2", "Arbeitsfläche 2"), "2 Desktop 2", "English text under a German default is a name");
    assert.strictEqual(W.label(2, "2", "Desktop 2"), "2", "no names given: workspaces() fills in the number");
    assert.strictEqual(W.label(2, "", "Desktop 2"), "2");
    assert.strictEqual(W.named(2, "mail", "Desktop 2"), true);
    assert.strictEqual(W.named(2, "Desktop 2", "Desktop 2"), false);
});

test("names reach each workspace from Plasma's desktop names, in desktop order", () => {
    const l = run([], { "DP-4": "d2", "DP-6": "d1" }, { names: ["Desktop 1", "mail"] });
    assert.deepStrictEqual(l.map((s) => [s.num, s.name]), [[1, "Desktop 1"], [2, "mail"]]);
});

test("lead: a task button's inset before the first workspace on a panel, along the panel; none off a panel", () => {
    const m = { left: 4, right: 5, top: 2, bottom: 3 };
    assert.strictEqual(W.lead(true, false, m), 9, "horizontal panel: left + right");
    assert.strictEqual(W.lead(true, true, m), 5, "vertical panel: top + bottom");
    assert.strictEqual(W.lead(false, false, m), 0, "a desktop or plasmawindowed");
});
