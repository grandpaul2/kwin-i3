// KWin's JS engine warns at every load when a variable is used above its `var` declaration
// ("Variable ... is used before its declaration"). Harmless in JS, but it fills the journal on
// every login. This keeps the built script free of it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// The module-level `var`s of one file's lines (indented 4 or less), each name with the line its
// declarator starts on. A statement's declarators are its segments at bracket depth 0, on one
// line or several (prettier gives each declarator its own line).
function declarations(src) {
    const decl = {};
    const code = (l) =>
        l
            .replace(/\/\/.*$/, "")
            .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    for (let i = 0; i < src.length; i++) {
        const m = src[i].match(/^( {0,4})var /);
        if (!m) continue;
        let depth = 0;
        let start = true;
        statement: for (let j = i; j < src.length; j++) {
            const c = code(j === i ? src[j].slice(m[0].length) : src[j]);
            for (let k = 0; k < c.length; k++) {
                if (start && /\S/.test(c[k])) {
                    const v = (c.slice(k).match(/^(\w+)\s*=(?!=)/) || [])[1];
                    if (v && !(v in decl)) decl[v] = j;
                    start = false;
                }
                if ("([{".includes(c[k])) depth++;
                else if (")]}".includes(c[k])) depth--;
                else if (c[k] === "," && depth === 0) start = true;
                else if (c[k] === ";" && depth === 0) break statement;
            }
        }
    }
    return decl;
}

test("no module-level variable is used before its declaration", () => {
    const all = fs
        .readFileSync(
            path.join(__dirname, "../../package/contents/code/main.js"),
            "utf8"
        )
        .split("\n");
    // One source file at a time (build.sh marks each with "// ---- src/<file>"): names are per file.
    const sections = [];
    all.forEach((l, i) => {
        if (l.startsWith("// ---- src/"))
            sections.push({ name: l.slice(8), from: i });
    });
    sections.forEach((s, k) => {
        s.to = k + 1 < sections.length ? sections[k + 1].from : all.length;
    });
    const early = [];
    for (const sec of sections) {
        const src = all.slice(sec.from, sec.to);
        const decl = declarations(src);
        for (const [v, line] of Object.entries(decl)) {
            const re = new RegExp("\\b" + v + "\\b");
            src.slice(0, line).forEach((l, i) => {
                if (re.test(l.replace(/\/\/.*$/, "").replace(/"[^"]*"/g, "")))
                    early.push(
                        `${sec.name}: ${v} used at ${sec.from + i + 1}, declared at ${sec.from + line + 1}`
                    );
            });
        }
    }
    assert.deepStrictEqual(early, []);
});
