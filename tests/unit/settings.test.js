// The settings table (src/settings.js), the form's entries (package/contents/config/main.xml) and
// its widgets (package/contents/ui/config.ui) name the same keys with the same types and defaults,
// and Settings parses what the form writes (docs/spec-settings.md). A key added to one and not the
// others would be a setting nobody can set, or a field that does nothing.
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

const KCFG_TYPE = { list: "String", string: "String", bool: "Bool", int: "Int", choice: "String" };

function xmlEntries() {
    const out = {};
    const re = /<entry name="([^"]+)" type="([^"]+)">\s*<default>([^<]*)<\/default>\s*<\/entry>/g;
    for (let m; (m = re.exec(read("package/contents/config/main.xml"))); ) out[m[1]] = { type: m[2], def: m[3] };
    return out;
}

test("main.xml has every setting, with its type and default, and nothing else", () => {
    const { S } = loadSettings({});
    const want = {};
    for (const [k, t] of Object.entries(S.table)) want[k] = { type: KCFG_TYPE[t.type], def: t.def };
    assert.deepStrictEqual(xmlEntries(), want);
});

test("config.ui has one kcfg_ widget per main.xml entry", () => {
    const ui = read("package/contents/ui/config.ui");
    const widgets = [...ui.matchAll(/name="kcfg_([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(widgets, Object.keys(xmlEntries()).sort());
});

test("metadata.json names the generic scripted config module", () => {
    const meta = JSON.parse(read("package/metadata.json"));
    assert.strictEqual(meta["X-KDE-ConfigModule"], "kwin/effects/configs/kcm_kwin4_genericscripted");
});

test("defaults: lists split on commas, debugLog off", () => {
    const { S, debug } = loadSettings({});
    assert.deepStrictEqual(S.get("ignoreRole"), ["quake"]);
    assert.deepStrictEqual(S.get("floatingClass"), []);
    assert.ok(S.get("ignoreClass").includes("krunner"));
    assert.strictEqual(S.get("debugLog"), false);
    assert.strictEqual(debug(), false);
});

test("what the form writes parses: a list with spaces, a bool as text", () => {
    const { S, debug } = loadSettings({ floatingClass: " pavucontrol , ,gimp ", debugLog: "true" });
    assert.deepStrictEqual(S.get("floatingClass"), ["pavucontrol", "gimp"]);
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
    store.floatingTitle = "Picture-in-Picture";
    store.ignoreRole = "quake";              // the default, written out: no change
    assert.deepStrictEqual(S.load(), ["floatingTitle"]);
    assert.deepStrictEqual(S.get("floatingTitle"), ["Picture-in-Picture"]);
    assert.deepStrictEqual(S.load(), []);
});

// The two files as Qt and KConfig read them: uic parses config.ui as QUiLoader would, and
// kconfig_compiler the kcfg (which wants a group name; KWin's KConfigLoader takes the empty one
// the stock scripts use, so one is put in for the check). Skipped where the tools are missing.
test("uic and kconfig_compiler accept the form", (t) => {
    const { execFileSync } = require("node:child_process");
    const os = require("node:os");
    const uic = ["/usr/lib64/qt6/libexec/uic", "/usr/lib/qt6/libexec/uic", "/usr/lib/qt6/uic"].find(fs.existsSync);
    const kcc = ["/usr/libexec/kf6/kconfig_compiler_kf6", "/usr/lib/kf6/kconfig_compiler_kf6"].find(fs.existsSync);
    if (!uic || !kcc) { t.skip("uic or kconfig_compiler_kf6 not installed"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ki3-form-"));
    try {
        execFileSync(uic, [path.join(root, "package/contents/ui/config.ui"), "-o", path.join(dir, "ui.h")], { stdio: "pipe" });
        fs.writeFileSync(path.join(dir, "x.kcfg"), read("package/contents/config/main.xml").replace('<group name="">', '<group name="Script-kwin-i3">'));
        fs.writeFileSync(path.join(dir, "x.kcfgc"), "File=x.kcfg\nClassName=X\n");
        execFileSync(kcc, ["x.kcfg", "x.kcfgc"], { cwd: dir, stdio: "pipe" });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
