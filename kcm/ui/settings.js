// The settings page's reading and writing of the script's setting strings
// (docs/spec-settings-cleanup.md): the page edits rows and lists, kwinrc keeps the strings the
// script parses (src/settings.js). Pure functions, unit-tested in tests/unit/kcm-settings.test.js.

// "1=DP-4, 2=DP-6" -> { 1: "DP-4", 2: "DP-6" }; as the script: N 1-10, entries it can't read dropped.
function parseOutputs(text) {
    const out = {};
    String(text || "").split(",").forEach((e) => {
        const m = /^\s*([0-9]+)\s*=\s*(\S+)\s*$/.exec(e);
        if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2];
    });
    return out;
}
function formatOutputs(map) {
    return Object.keys(map).map(Number).filter((n) => map[n]).sort((a, b) => a - b)
        .map((n) => n + "=" + map[n]).join(", ");
}

// "3, 7" -> [3, 7]; as the script: whole numbers 1-10.
function parseWorkspaces(text) {
    const seen = {};
    String(text || "").split(",").map((s) => s.trim()).filter((s) => /^[0-9]+$/.test(s))
        .map(Number).filter((n) => n >= 1 && n <= 10).forEach((n) => { seen[n] = true; });
    return Object.keys(seen).map(Number).sort((a, b) => a - b);
}
function formatWorkspaces(list) {
    return parseWorkspaces(list.join(",")).join(", ");
}

// The window rules as two lists of entries, from the four comma-separated settings:
// "ignore" (ignoreClass, ignoreRole) and "float" (floatingClass, floatingTitle).
const RULE_KEYS = [
    { key: "ignoreClass", list: "ignore", kind: "class" },
    { key: "ignoreRole", list: "ignore", kind: "role" },
    { key: "floatingClass", list: "float", kind: "class" },
    { key: "floatingTitle", list: "float", kind: "title" },
];
function splitList(text) {
    return String(text || "").split(",").map((s) => s.trim()).filter((s) => s !== "");
}
// settings, defaults: { ignoreClass: "...", ... } -> [{ list, kind, value, isDefault }]
function ruleEntries(settings, defaults) {
    const out = [];
    RULE_KEYS.forEach((r) => {
        const defs = splitList(defaults[r.key]);
        splitList(settings[r.key]).forEach((v) => {
            out.push({ list: r.list, kind: r.kind, value: v, isDefault: defs.indexOf(v) >= 0 });
        });
    });
    return out;
}
// The inverse: entries -> { ignoreClass: "a,b", ... }, each in the order given (the defaults are
// written as main.xml has them, with no spaces, so an unchanged list still equals its default).
function ruleSettings(entries) {
    const out = {};
    RULE_KEYS.forEach((r) => {
        out[r.key] = entries.filter((e) => e.list === r.list && e.kind === r.kind).map((e) => e.value).join(",");
    });
    return out;
}
// An entry the user typed: no comma (it would split it in two), not blank, not already there.
function entryProblem(entries, list, kind, value) {
    const v = String(value || "").trim();
    if (v === "") return "empty";
    if (v.indexOf(",") >= 0) return "comma";
    if (entries.some((e) => e.list === list && e.kind === kind && e.value === v)) return "duplicate";
    return "";
}
// The kinds each list takes.
function kindsFor(list) {
    return RULE_KEYS.filter((r) => r.list === list).map((r) => r.kind);
}

// The Workspaces button's summary, as counts the page words: how many workspaces have a monitor
// set, how many open Plasma windows.
function workspaceCounts(outputsText, floatingText) {
    return { pinned: Object.keys(parseOutputs(outputsText)).length, plasma: parseWorkspaces(floatingText).length };
}
// The window rules' summary: how many entries each list has.
function ruleCounts(entries) {
    return { ignore: entries.filter((e) => e.list === "ignore").length, float: entries.filter((e) => e.list === "float").length };
}

if (typeof module !== "undefined") module.exports = {
    parseOutputs, formatOutputs, parseWorkspaces, formatWorkspaces, ruleEntries, ruleSettings,
    entryProblem, kindsFor, workspaceCounts, ruleCounts,
};
