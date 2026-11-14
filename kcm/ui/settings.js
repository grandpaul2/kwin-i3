// The settings page's reading and writing of the script's setting strings
// the page edits rows and lists, kwinrc keeps the strings the
// script parses (src/settings.js). Pure functions, unit-tested in tests/unit/kcm-settings.test.js.

// "1=DP-4 HDMI-A-1, 2=DP-6" -> { 1: "DP-4 HDMI-A-1", 2: "DP-6" }: each workspace's list of outputs
// as the script reads it (the first connected one wins), N 1-10, entries it can't
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

// The window rules: i3's for_window and assign rules as text,
// one rule per line or `;`-separated (the script's reading, src/rules.js split).
// splitRules gives the rules, trimmed, empty ones dropped.
function splitRules(text) {
    const out = [];
    let cur = "", quoted = false;
    const t = String(text || "");
    for (let i = 0; i < t.length; i++) {
        const c = t.charAt(i);
        if (c === "\\" && quoted && i + 1 < t.length) { cur += c + t.charAt(++i); continue; }
        if (c === "\"") quoted = !quoted;
        // As the script's split (src/rules.js): a line break ends a rule whatever the quotes.
        if (c === "\n" || c === "\r") { out.push(cur); cur = ""; quoted = false; continue; }
        if (c === ";" && !quoted) { out.push(cur); cur = ""; continue; }
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

// ---- the rules as rows -------------------
// A row is one rule: { kind: "float" | "tile" | "workspace" | "output", cls, title, role, type,
// workspace (N) or output (name), src }, when the rule's criteria are among the four the page
// shows (class, title, window_role, window_type; src/rules.js parseCriteria's grammar); any
// other rule, or one whose class is a pattern rather than a whole name, is { kind: "raw", text }
// and edited as text. The page writes every row back in
// i3's words (formatRule), so a rule it read it writes the same.
const RAW = { kind: "raw" };
function unquote(v) { return v.replace(/\\"/g, '"'); }
function quote(v) { return '"' + String(v).replace(/"/g, '\\"') + '"'; }
function parseCriteria(text) {
    const crit = {};
    let rest = text.trim(), n = 0;
    while (rest.length) {
        // A value quoted, or bare as i3's `word` (src/rules.js parseCriteria).
        const m = /^(\w+)(?:\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"\]]+)))?\s*/.exec(rest);
        if (!m) return null;
        rest = rest.slice(m[0].length);
        const value = m[2] !== undefined ? unquote(m[2]) : m[3];
        if (m[1] === "floating" || m[1] === "tiling" || m[1] === "all") { if (value !== undefined) return null; crit[m[1]] = true; }
        else if (value === undefined) return null;
        else crit[m[1]] = value;
        n++;
    }
    return n ? crit : null;
}
const SHOWN = ["class", "title", "window_role", "window_type"];
// i3's keyword before a rule written as i3's config writes it (`for_window [...] floating
// enable`, `assign [...] → 2`): it names the setting, and is taken off, since each setting holds
// its own kind. -> { text, assign } (assign undefined with no keyword).
function takeKeyword(src) {
    const t = String(src || "").trim(), m = /^(for_window|assign)\s+([\s\S]*)$/.exec(t);
    return m ? { text: m[2].trim(), assign: m[1] === "assign" } : { text: t, assign: undefined };
}
// A rule the page can't show as a row stays as its text, in the setting it came from (`assign`:
// an unreadable assign rule would otherwise move into forWindow at the next save and run there),
// unless i3's keyword names the other.
function parseRule(src, assign) {
    const k = takeKeyword(src);
    if (k.assign !== undefined) { src = k.text; assign = k.assign; }
    const raw = Object.assign({ text: src, src, fromAssign: !!assign }, RAW);
    const m = /^\[((?:[^\]"]|"(?:[^"\\]|\\.)*")*)\]\s*(.*)$/.exec(src);
    const crit = m ? parseCriteria(m[1]) : null;
    if (!crit || Object.keys(crit).some((k) => SHOWN.indexOf(k) < 0)) return raw;
    const rest = m[2].trim();
    const row = { cls: crit.class || "", title: crit.title || "", role: crit.window_role || "", type: crit.window_type || "", src };
    // Nothing a row can show (`[class=""]`, every window): kept as its text, else the next save
    // dropped it as an empty row.
    if (!row.cls && !row.title && !row.role && !row.type) return raw;
    // An application given as a pattern, not a whole name: the box shows names only, so as text.
    if (row.cls && plainName(row.cls) === null) return raw;
    if (!assign) {
        const f = /^floating\s+(enable|disable)$/.exec(rest);
        if (!f) return raw;
        row.kind = f[1] === "enable" ? "float" : "tile";
        return row;
    }
    let a = /^(?:(?:→|->)\s*)?(?:workspace\s+)?(?:number\s+)?([0-9]+)$/.exec(rest);
    if (a && +a[1] >= 1 && +a[1] <= 10) { row.kind = "workspace"; row.workspace = +a[1]; return row; }
    a = /^(?:(?:→|->)\s*)?output\s+(\S+)$/.exec(rest);
    if (a) { row.kind = "output"; row.output = a[1]; return row; }
    return raw;
}
// Every rule of both settings as rows, the for_window ones first (as the script runs them).
function parseRules(forWindow, assign) {
    return splitRules(forWindow).map((r) => parseRule(r, false)).concat(splitRules(assign).map((r) => parseRule(r, true)));
}
function formatRule(row) {
    if (row.kind === "raw") return splitRules(row.text).map((p) => takeKeyword(p).text).join("\n");
    const crit = [];
    if (row.cls) crit.push("class=" + quote(row.cls));
    if (row.title) crit.push("title=" + quote(row.title));
    if (row.role) crit.push("window_role=" + quote(row.role));
    if (row.type) crit.push("window_type=" + quote(row.type));
    if (!crit.length) return "";                                  // a row with nothing to match: not written
    const c = "[" + crit.join(" ") + "] ";
    if (row.kind === "float") return c + "floating enable";
    if (row.kind === "tile") return c + "floating disable";
    if (row.kind === "workspace") return c + "→ " + (row.workspace || 1);
    if (row.kind === "output") return row.output ? c + "output " + row.output : "";
    return "";
}
// -> { forWindow, assign }: a raw row goes to the setting it came from (assign: its text names
// a workspace or an output), one rule per line, empty rows dropped.
function formatRules(rows) {
    const fw = [], as = [];
    rows.forEach((row) => {
        if (row.kind === "raw") { rawPieces(row).forEach((p) => (p.assign ? as : fw).push(p.text)); return; }
        const text = formatRule(row);
        if (!text) return;
        (row.kind === "workspace" || row.kind === "output" ? as : fw).push(text);
    });
    return { forWindow: fw.join("\n"), assign: as.join("\n") };
}
// A text row's rules, each with the setting it goes to: i3's keyword first; else where the row
// came from; one typed fresh on the page (no origin) by its tail after the criteria, read past
// quoted values (a "]" inside one is no end). -> [{ text, assign }]
function rawPieces(row) {
    return splitRules(row.text).map((p) => {
        const k = takeKeyword(p);
        const assign = k.assign !== undefined ? k.assign : row.fromAssign !== undefined ? row.fromAssign
            : /^\[(?:[^\]"]|"(?:[^"\\]|\\.)*")*\]\s*(?:(?:→|->)|workspace\s|number\s|output\s|[0-9]+\s*$)/.test(k.text);
        return { text: k.text, assign };
    }).filter((p) => p.text !== "");
}
// Whether the script runs every rule of a text row: its reading (src/rules.js lines,
// parseCriteria, regex, parseForWindow, parseAssign), mirrored, as the page can't load the
// script's file. An empty row is not saved, and counts as runnable (nothing to warn of).
const CRITERIA = ["class", "instance", "title", "window_role", "window_type", "workspace", "floating", "tiling", "all"];
const WINDOW_TYPES = ["normal", "dialog", "utility", "toolbar", "splash", "notification", "menu", "dropdown_menu", "popup_menu", "tooltip"];
function readableRegex(src) {
    try { new RegExp(src, "u"); return true; } catch (e) { /* PCRE-only syntax: loosely, as the script */ }
    let flags = "", body = src;
    if (/^\(\?i\)/.test(body)) { flags = "i"; body = body.slice(4); }
    try { new RegExp(body, flags); return true; } catch (e) { return false; }
}
function runnablePiece(p) {
    const m = /^\[((?:[^\]"]|"(?:[^"\\]|\\.)*")*)\]\s*(.*)$/.exec(p.text);
    if (!m) return false;
    let rest = m[1].trim(), n = 0;
    while (rest.length) {
        const c = /^(\w+)(?:\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"\]]+)))?\s*/.exec(rest);
        if (!c || CRITERIA.indexOf(c[1]) < 0) return false;
        rest = rest.slice(c[0].length);
        const v = c[2] !== undefined ? unquote(c[2]) : c[3];
        if (c[1] === "floating" || c[1] === "tiling" || c[1] === "all") { if (v !== undefined) return false; }
        else if (v === undefined) return false;
        else if (c[1] === "window_type") { if (WINDOW_TYPES.indexOf(v.toLowerCase()) < 0) return false; }
        else if (!readableRegex(v)) return false;
        n++;
    }
    if (!n) return false;
    const t = m[2].trim();
    if (!p.assign) return /^floating\s+(enable|disable)$/.test(t);
    const a = /^(?:(?:→|->)\s*)?(?:workspace\s+)?(?:number\s+)?([0-9]+)$/.exec(t);
    if (a) return +a[1] >= 1 && +a[1] <= 10;
    return /^(?:(?:→|->)\s*)?output\s+(\S+)$/.test(t);
}
// Whether a text row's text, as it stands, is one rule the fields can show (typed back into their
// shape: it shows as fields at the next reading).
function fitsFields(row) {
    const pieces = rawPieces(row);
    return pieces.length === 1 && parseRule(pieces[0].text, pieces[0].assign).kind !== "raw";
}
function runnable(row) {
    return row.kind !== "raw" || rawPieces(row).every(runnablePiece);
}
// The criteria the page escapes for a picked or typed name, matched whole.
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function wholeClass(cls) { return "^" + escapeRe(cls) + "$"; }
// A whole-name pattern (^…$, its specials escaped) as the plain name the page shows; else null.
function plainName(pattern) {
    const m = /^\^((?:[^.*+?^${}()|[\]\\]|\\[.*+?^${}()|[\]\\])*)\$$/.exec(String(pattern || ""));
    return m ? m[1].replace(/\\(.)/g, "$1") : null;
}
// What the application field stores for what was typed: always a name, matched whole (the
// style guide: the page takes a name; i3's patterns are written as text, Add Rule as Text).
// Empty stays empty: a rule matching by title, role or type alone.
function classFromField(text) {
    const t = String(text || "").trim();
    return t === "" ? "" : wholeClass(t);
}

// A workspace whose new windows float (the Workspaces tab): the rule
// [workspace="^N$"] floating enable in forWindow, i3's own way to float a workspace's new windows.
function workspaceRule(n) { return '[workspace="^' + n + '$"] floating enable'; }
function floatingWorkspaceList(forWindow) {
    const out = [];
    splitRules(forWindow).forEach((r) => { const m = /^\[workspace="\^([0-9]+)\$"\]\s*floating\s+enable$/.exec(r); if (m) out.push(+m[1]); });
    return out.sort((a, b) => a - b);
}
function setWorkspaceFloating(forWindow, n, on) {
    const rules = splitRules(forWindow).filter((r) => r !== workspaceRule(n));
    if (on) rules.push(workspaceRule(n));
    return rules.join("\n");
}

// Per-workspace gaps (workspaceGaps; src/settings.js parses the same lines): "3 gaps inner 10,
// 5 gaps outer 0" -> { 3: { inner: 10 }, 5: { top: 0, right: 0, bottom: 0, left: 0 } }. The page
// sets inner and outer (all four sides) per workspace and writes them back as "N gaps inner M,
// N gaps outer M"; sides set one by one in kwinrc are kept as they are while the page doesn't
// touch that workspace. A value set replaces the Tiling tab's gaps above it (as i3's), 0 included; one
// not set is those.
function parseWorkspaceGaps(text) {
    const ws = {};
    String(text || "").split(/[\n;,]/).forEach((e) => {
        const m = /^\s*(?:workspace\s+)?([0-9]+)\s+gaps\s+(inner|outer|horizontal|vertical|top|right|bottom|left)\s+(-?[0-9]+)\s*$/.exec(e);
        if (!m || +m[1] < 1 || +m[1] > 10) return;
        const g = ws[+m[1]] || (ws[+m[1]] = {}), v = +m[3];
        const sides = { inner: ["inner"], outer: ["top", "right", "bottom", "left"], horizontal: ["left", "right"], vertical: ["top", "bottom"] }[m[2]] || [m[2]];
        sides.forEach((s) => { g[s] = v; });
    });
    return ws;
}
function formatWorkspaceGaps(map) {
    const out = [];
    Object.keys(map).map(Number).sort((a, b) => a - b).forEach((n) => {
        const g = map[n];
        if (g.inner !== undefined) out.push(n + " gaps inner " + g.inner);
        const sides = ["top", "right", "bottom", "left"].filter((s) => g[s] !== undefined);
        if (sides.length === 4 && g.top === g.right && g.top === g.bottom && g.top === g.left) out.push(n + " gaps outer " + g.top);
        else sides.forEach((s) => out.push(n + " gaps " + s + " " + g[s]));
    });
    return out.join(", ");
}
// A workspace's outer gap as one number: the four sides when equal (undefined: not set, the main
// page's), else null (set per side in kwinrc).
function outerOf(g) {
    const v = ["top", "right", "bottom", "left"].map((s) => g[s]);
    return v.every((x) => x === v[0]) ? v[0] : null;
}
// value undefined: not set, back to the gaps above.
function setWorkspaceGap(text, n, which, value) {
    const map = parseWorkspaceGaps(text), g = map[n] || (map[n] = {});
    if (which === "inner") g.inner = value;
    else ["top", "right", "bottom", "left"].forEach((s) => { g[s] = value; });
    Object.keys(g).forEach((k) => { if (g[k] === undefined) delete g[k]; });
    if (!Object.keys(g).length) delete map[n];
    return formatWorkspaceGaps(map);
}

if (typeof module !== "undefined") module.exports = {
    parseOutputs, parseOutputLists, formatOutputs, splitRules, pickRule, addRule,
    parseRules, parseRule, formatRule, formatRules, wholeClass, workspaceRule,
    floatingWorkspaceList, setWorkspaceFloating, parseWorkspaceGaps, formatWorkspaceGaps, outerOf, setWorkspaceGap,
};
