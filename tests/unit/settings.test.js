// The settings table (src/settings.js) and the settings' entries (package/contents/config/main.xml,
// from which the settings page's class is generated) name the same keys with the same types and
// defaults, and Settings parses what the page writes. A key added to one and not the other would
// be a setting nobody can set, or a field that does nothing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// src/settings.js under a stub readConfig: values from `conf`, else the default it passes.
function loadSettings(conf) {
    const logs = [];
    const ctx = { DEBUG_LOG: false };
    const fn = Function("readConfig", "log", "ctx",
        "var DEBUG_LOG = false;\n" + read("src/settings.js") +
        "\nctx.DEBUG_LOG = function () { return DEBUG_LOG; }; return Settings;");
    const store = Object.assign({}, conf);
    const S = fn((k, d) => (k in store ? store[k] : d), (l) => logs.push(l), ctx);
    return { S, logs, store, debug: ctx.DEBUG_LOG };
}

const KCFG_TYPE = { list: "String", string: "String", text: "String", size: "String", bool: "Bool", int: "Int", choice: "String", outputs: "String", colour: "String", wsgaps: "String" };

function xmlEntries() {
    const out = {};
    const re = /<entry name="([^"]+)" type="([^"]+)">\s*<default>([^<]*)<\/default>([\s\S]*?)<\/entry>/g;
    for (let m; (m = re.exec(read("package/contents/config/main.xml"))); ) {
        out[m[1]] = { type: m[2], def: m[3] };
        const min = /<min>(-?\d+)<\/min>/.exec(m[4]), max = /<max>(-?\d+)<\/max>/.exec(m[4]);
        if (min) out[m[1]].min = Number(min[1]);
        if (max) out[m[1]].max = Number(max[1]);
    }
    return out;
}

test("main.xml has every setting, with its type and default, and nothing else", () => {
    const { S } = loadSettings({});
    const want = {};
    for (const [k, t] of Object.entries(S.table)) {
        want[k] = { type: KCFG_TYPE[t.type], def: t.def };
        if (t.min !== undefined) want[k].min = t.min;
        if (t.max !== undefined) want[k].max = t.max;
    }
    assert.deepStrictEqual(xmlEntries(), want);
});

// The KWin Scripts cog opens the settings page: the plugin it names is the page's, whose QML is
// found under its own id (kcm/kcm.cpp gives the page its own metadata whatever it is handed).
test("metadata.json names the settings page as the script's config module", () => {
    const meta = JSON.parse(read("package/metadata.json"));
    assert.strictEqual(meta["X-KDE-ConfigModule"], "plasma/kcms/systemsettings/kcm_kwin_i3");
    assert.match(read("kcm/CMakeLists.txt"), /kcmutils_add_qml_kcm\(kcm_kwin_i3[\s)]/);
});

test("defaults: debugLog off, the default rules", () => {
    const { S, debug } = loadSettings({});
    assert.ok(S.get("forWindow").indexOf("spectacle") >= 0, "the default rules float Plasma's tools");
    assert.strictEqual(S.get("floatingMinimumSize"), "75x50");
    assert.strictEqual(S.get("debugLog"), false);
    assert.strictEqual(debug(), false);
    assert.strictEqual(S.get("workspaceAutoBackAndForth"), false, "off, as i3's default");
});

test("what the page writes parses: a bool as text", () => {
    const { S, debug } = loadSettings({ debugLog: "true" });
    assert.strictEqual(S.get("debugLog"), true);
    assert.strictEqual(debug(), true);
});

test("a bool that doesn't parse is the default, with a warning", () => {
    const { S, logs } = loadSettings({ debugLog: "yes please" });
    assert.strictEqual(S.get("debugLog"), false);
    assert.ok(logs.some((l) => /WARN setting debugLog/.test(l)), logs.join("\n"));
});

test("load() reports exactly the keys that changed", () => {
    const { S, store } = loadSettings({});
    assert.deepStrictEqual(S.load(), []);
    store.resizeStep = "40";
    store.floatingMaximumSize = "0x0";       // the default, written out: no change
    assert.deepStrictEqual(S.load(), ["resizeStep"]);
    assert.strictEqual(S.get("resizeStep"), 40);
    assert.deepStrictEqual(S.load(), []);
});

// main.xml as KConfig reads it: kconfig_compiler the kcfg (which wants a group name; KWin's
// KConfigLoader takes the empty one the stock scripts use, so one is put in for the check).
// Skipped where the tool is missing.
test("kconfig_compiler accepts main.xml", (t) => {
    const { execFileSync } = require("node:child_process");
    const os = require("node:os");
    const kcc = ["/usr/libexec/kf6/kconfig_compiler_kf6", "/usr/lib/kf6/kconfig_compiler_kf6"].find(fs.existsSync);
    if (!kcc) { t.skip("kconfig_compiler_kf6 not installed"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ki3-form-"));
    try {
        fs.writeFileSync(path.join(dir, "x.kcfg"), read("package/contents/config/main.xml").replace('<group name="">', '<group name="Script-kwin-i3">'));
        fs.writeFileSync(path.join(dir, "x.kcfgc"), "File=x.kcfg\nClassName=X\n");
        execFileSync(kcc, ["x.kcfg", "x.kcfgc"], { cwd: dir, stdio: "pipe" });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("an int: in range parses, out of range or not a number is the default", () => {
    assert.strictEqual(loadSettings({ resizeStep: "25" }).S.get("resizeStep"), 25);
    for (const bad of ["0", "51", "ten", "12.5", ""]) {
        const { S, logs } = loadSettings({ resizeStep: bad });
        assert.strictEqual(S.get("resizeStep"), 10, JSON.stringify(bad));
        assert.ok(logs.some((l) => /WARN setting resizeStep/.test(l)), JSON.stringify(bad));
    }
});

test("a choice: one of the list, else the default", () => {
    assert.strictEqual(loadSettings({ focusWrapping: "force" }).S.get("focusWrapping"), "force");
    assert.strictEqual(loadSettings({ focusWrapping: "sometimes" }).S.get("focusWrapping"), "yes");
    assert.strictEqual(loadSettings({}).S.get("defaultOrientation"), "auto");
});

test("workspaceOutputs: N=OUTPUT pairs, or a list of outputs per number (the first connected wins); a bad entry is skipped and logged, the rest apply", () => {
    assert.deepStrictEqual(loadSettings({}).S.get("workspaceOutputs"), {});
    assert.deepStrictEqual(loadSettings({ workspaceOutputs: "1=DP-4, 2 = DP-6,10=HDMI-A-1" }).S.get("workspaceOutputs"),
        { 1: ["DP-4"], 2: ["DP-6"], 10: ["HDMI-A-1"] });
    assert.deepStrictEqual(loadSettings({ workspaceOutputs: "1=DP-4 HDMI-A-1, 2=DP-6  eDP-1 DP-5" }).S.get("workspaceOutputs"),
        { 1: ["DP-4", "HDMI-A-1"], 2: ["DP-6", "eDP-1", "DP-5"] }, "i3's workspace N output A B …");
    const { S, logs } = loadSettings({ workspaceOutputs: "1=DP-4, 11=DP-6, two=DP-6, 3=, =DP-1" });
    assert.deepStrictEqual(S.get("workspaceOutputs"), { 1: ["DP-4"] });
    assert.strictEqual(logs.filter((l) => /WARN setting workspaceOutputs/.test(l)).length, 4, logs.join("\n"));
});

test("a colour: #rrggbb, else the default", () => {
    assert.strictEqual(loadSettings({ frameActive: "#AABBCC" }).S.get("frameActive"), "#aabbcc");
    assert.strictEqual(loadSettings({ frameActive: "blue" }).S.get("frameActive"), "#4c7899");
});
