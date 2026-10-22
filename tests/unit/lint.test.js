// KWin's JS engine warns at every load when a variable is used above its `var` declaration
// ("Variable ... is used before its declaration"). Harmless in JS, but it fills Paul's journal on
// every login (seen twice on 2026-10-22). This keeps the built script free of it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("no module-level variable is used before its declaration", () => {
    const all = fs.readFileSync(path.join(__dirname, "../../package/contents/code/main.js"), "utf8").split("\n");
    // One source file at a time (build.sh marks each with "// ---- src/<file>"): names are per file.
    const sections = [];
    all.forEach((l, i) => { if (l.startsWith("// ---- src/")) sections.push({ name: l.slice(8), from: i }); });
    sections.forEach((s, k) => { s.to = k + 1 < sections.length ? sections[k + 1].from : all.length; });
    const early = [];
    for (const sec of sections) {
        const src = all.slice(sec.from, sec.to);
        const decl = {};
        src.forEach((l, i) => {
            const m = l.match(/^ {0,4}var (.*)$/);
            if (!m) return;
            for (const d of m[1].split(",")) {
                const v = (d.match(/^\s*(\w+)\s*=/) || [])[1];
                if (v && !(v in decl)) decl[v] = i;
            }
        });
        for (const [v, line] of Object.entries(decl)) {
            const re = new RegExp("\\b" + v + "\\b");
            src.slice(0, line).forEach((l, i) => {
                if (re.test(l.replace(/\/\/.*$/, "").replace(/"[^"]*"/g, "")))
                    early.push(`${sec.name}: ${v} used at ${sec.from + i + 1}, declared at ${sec.from + line + 1}`);
            });
        }
    }
    assert.deepStrictEqual(early, []);
});
