import subprocess, sys
# Deliberate faults in src/tree.js; each must turn tests/unit red. Run: make mutate
# A fault that stays green is a gap in the tests (or an equivalent mutant: say which).
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
src = "src/tree.js"
orig = open(src).read()
muts = [
 ("attach ignores focus", "var current = ignoreFocus ? null : firstTiling(parent.focus);", "var current = null;"),
 ("no swap with leaf", "siblings[siblings.indexOf(swap)] = con;     // swap with a leaf: no flatten", "return; //"),
 ("no force orientation", "                forceOrientation(wsOf(con), o);\n", "                return;\n"),
 ("descendDirection ignores focus", "            else most = firstTiling(con.focus);\n        } else {", "            else most = con.nodes[0];\n        } else {"),
 ("insert position flipped", "position = (target.parent.layout !== o || isBefore(dir)) ? \"after\" : \"before\";\n                        this.insertConInto", "position = (target.parent.layout !== o || isBefore(dir)) ? \"before\" : \"after\";\n                        this.insertConInto"),
 ("flatten disabled", "M.flatten = function () {\n", "M.flatten = function () { return;\n"),
 ("nextFocused by position", "            next = con.parent.focus[i + 1] || con.parent;", "            next = con.parent.nodes[con.parent.nodes.indexOf(con) + 1] || con.parent;"),
 ("no normalise", "            for (i = 0; i < n; i++) con.nodes[i].percent /= total;", ""),
 ("empty splits stay", "        if (con.nodes.length === 0 && con.win === null) this.closeCon(con, false);", ""),
 ("no focus wrap", "                if (!firstWrap && permitsFocusing(wrap)) firstWrap = wrap;", ""),
 ("split always wraps", "        if (parent.nodes.length === 1) { parent.layout = o; return; }", ""),
 ("#3001 special case off", "if (con.parent.type !== \"ws\" && con.nodes.length === 1 && con.parent.nodes.length === 1) {", "if (false) {"),
 ("moved window not ws focus", "        if (!fs) focusUp(con);", "        if (false) focusUp(con);"),
 ("attachToWorkspace side flipped", "if (dir === RIGHT || dir === DOWN) ws.nodes.unshift(con);", "if (dir === LEFT || dir === UP) ws.nodes.unshift(con);"),
 ("lone child at edge stays", "            this.moveToOutputDirected(con, dir);\n            return;\n        } else {", "            return;\n        } else {"),
 ("fullscreen permits all", "        if (!fs) return true;", "        return true;"),
 ("fullscreen not exclusive", "            while ((other = fullscreenOn(wsOf(con))) && other !== con) other.fullscreen = false;", ""),
 ("open not idempotent", "        if (this.byWin[win]) return this.byWin[win];       // added twice: no ghost leaf (review)", ""),
 ("focused under a fullscreen window", "        if (!fs) focusUp(con);", "        focusUp(con);"),
]
survivors = []
for name, a, b in muts:
    if a not in orig:
        print(f"!! pattern missing (src changed?): {name}"); survivors.append(name); continue
    open(src, "w").write(orig.replace(a, b, 1))
    r = subprocess.run(["node", "--test", "tests/unit/tree.test.js"], capture_output=True, text=True)
    fails = [l for l in r.stdout.splitlines() if l.startswith("# fail")]
    print(f"{'red   ' if r.returncode else 'GREEN '} {name}")
    if not r.returncode: survivors.append(name)
open(src, "w").write(orig)
sys.exit(1 if survivors else 0)
