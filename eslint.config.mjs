// eslint for the JS (tools/lint.sh): the recommended rules, and the scope each file runs in.
import js from "@eslint/js";

// KWin's script API, as KWin's QJSEngine provides it to the script.
const kwin = {
    workspace: "readonly",
    options: "readonly",
    callDBus: "readonly",
    registerShortcut: "readonly",
    readConfig: "readonly",
    KWin: "readonly",
    QTimer: "readonly",
    print: "readonly",
};

// The names one src/ file defines and the others use: build.sh concatenates src/ into one script,
// so they share its scope. DEBUG_LOG is set by src/settings.js.
const shared = {
    Tree: "readonly",
    Settings: "readonly",
    Rules: "readonly",
    Workspaces: "readonly",
    Outputs: "readonly",
    Placement: "readonly",
    log: "readonly",
    logRing: "readonly",
    KI3: "readonly",
    DEBUG_LOG: "writable",
};

const node = {
    require: "readonly",
    module: "writable",
    __dirname: "readonly",
    console: "readonly",
    process: "readonly",
};

export default [
    {
        ignores: [
            "package/contents/code/main.js",
            "node_modules/",
            "plugin/build/",
            "kcm/build/",
            "tests/live/out/",
            "tests/fuzz/",
            "videos/",
        ],
    },
    js.configs.recommended,
    {
        languageOptions: { ecmaVersion: "latest" },
        rules: {
            // An unused `catch (e)`'s fix, `catch {` (ES2019), is not known to parse in the oldest
            // supported Qt's engine.
            "no-unused-vars": ["error", { caughtErrors: "none" }],
        },
    },
    {
        // Scripts sharing one scope: a top-level name is used by another file, and defined in
        // its own.
        files: ["src/**/*.js", "kcm/ui/*.js", "widget/**/*.js"],
        languageOptions: {
            sourceType: "script",
            // module: each file's module.exports, for the unit tests in node.
            globals: { ...kwin, ...shared, module: "writable" },
        },
        rules: {
            "no-redeclare": ["error", { builtinGlobals: false }],
            "no-unused-vars": [
                "error",
                { vars: "local", caughtErrors: "none" },
            ],
        },
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: { sourceType: "commonjs", globals: node },
    },
];
