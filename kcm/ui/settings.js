// The settings page's reading and writing of the script's setting strings
// (docs/spec-settings-cleanup.md): the page edits rows and lists, kwinrc keeps the strings the
// script parses (src/settings.js). Pure functions, unit-tested in tests/unit/kcm-settings.test.js.

// "1=DP-4 HDMI-A-1, 2=DP-6" -> { 1: "DP-4 HDMI-A-1", 2: "DP-6" }: each workspace's list of outputs
// as the script reads it (the first connected one wins; redo stage 4), N 1-10, entries it can't
// read dropped. parseOutputs gives the first output of each list, what the page's monitor box shows.
function parseOutputLists(text) {
    const out = {};
    String(text || "").split(",").forEach((e) => {
        const m = /^\s*([0-9]+)\s*=\s*(\S+(?:\s+\S+)*)\s*$/.exec(e);
        if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2].replace(/\s+/g, " ");
    });
    return out;
}
function parseOutputs(text) {
    const lists = parseOutputLists(text), out = {};
    Object.keys(lists).forEach((n) => { out[n] = lists[n].split(" ")[0]; });
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

// The window rules (docs/spec-redo-3-kinds-rules.md, E): i3's for_window and assign rules as text,
// one rule per line or `;`-separated (the script's reading, src/rules.js split), until stage 10's
// redesign. splitRules gives the rules, trimmed, empty ones dropped.
function splitRules(text) {
    const out = [];
    let cur = "", quoted = false;
    const t = String(text || "");
    for (let i = 0; i < t.length; i++) {
        const c = t.charAt(i);
        if (c === "\\" && quoted && i + 1 < t.length) { cur += c + t.charAt(++i); continue; }
        if (c === "\"") quoted = !quoted;
        if (c === "\n" || c === "\r" || (c === ";" && !quoted)) { out.push(cur); cur = ""; continue; }
        cur += c;
    }
    out.push(cur);
    return out.map((r) => r.trim()).filter((r) => r !== "");
}
// A floating rule for a picked window's class, the class matched whole (its dots escaped).
function pickRule(cls) {
    return "[class=\"^" + String(cls).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$\"] floating enable";
}
// The text with one more rule on its own line; a rule already there is not added twice.
function addRule(text, rule) {
    if (splitRules(text).indexOf(rule) >= 0) return String(text || "");
    const t = String(text || "").replace(/\s+$/, "");
    return t === "" ? rule : t + "\n" + rule;
}
// The Window Rules button's summary: how many rules of each kind.
function ruleCounts(settings) {
    return { rules: splitRules(settings.forWindow).length, assigns: splitRules(settings.assign).length };
}

// The Workspaces button's summary, as counts the page words: how many workspaces have a monitor
// set, how many open new windows floating.
function workspaceCounts(outputsText, floatingText) {
    return { pinned: Object.keys(parseOutputs(outputsText)).length, plasma: parseWorkspaces(floatingText).length };
}

if (typeof module !== "undefined") module.exports = {
    parseOutputs, parseOutputLists, formatOutputs, parseWorkspaces, formatWorkspaces, splitRules, pickRule, addRule,
    workspaceCounts, ruleCounts,
};
