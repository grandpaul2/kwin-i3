#!/usr/bin/env python3
"""Deliberate faults in src/kwin.js and src/rules.js; each must turn a live scenario red.
Run: make mutate-live   (several minutes: every fault reruns the scenarios in a fresh KWin)."""
import os, subprocess, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
muts = [
 ("src/kwin.js", "one-child splits kept in projection", "        if (kids.length === 1) return kids[0].p;\n", ""),
 ("src/kwin.js", "same-direction nesting not merged", "            if (k.p.dir === con.layout) {", "            if (false) {"),
 ("src/kwin.js", "sizes never set", "            setSizes(root, p, { x: 0, y: 0, width: 1, height: 1 });", ""),
 ("src/kwin.js", "padding kept", "        if (t.padding !== 0) t.padding = 0;\n        t.tiles.forEach(zeroPadding);", "        t.tiles.forEach(zeroPadding);"),
 ("src/kwin.js", "minimized windows still tiled", "        return w && !w.minimized;", "        return !!w;"),
 ("src/kwin.js", "maximize not undone", "                w.setMaximize(false, false);\n                expected[key] = null;", "                expected[key] = null;"),
 ("src/kwin.js", "no adopt from live tiles", "                var spec = root ? specOf(root, 1) : null;", "                var spec = null;"),
 ("src/kwin.js", "release leaves windows tiled", "                if (w.tile) w.tile.unmanage(w);", ""),
 ("src/kwin.js", "floating not kept above", "        if (on && !w.keepAbove) { w.keepAbove = true; keptAbove[id(w)] = true; }", ""),
 ("src/kwin.js", "KWin focus not followed", "            if (w && wins[id(w)]) model.focusWin(id(w));\n        }));", "        }));"),
 ("src/kwin.js", "one size pass only", "        for (var pass = 0; pass < 4; pass++)", "        for (var pass = 0; pass < 1; pass++)"),
 ("src/kwin.js", "KWin's 15% tile minimum kept", "            t.minimumSize = min;", ""),
 ("src/kwin.js", "grow width does nothing", "        \"Grow Width\": function (c) { model.resize(c, \"width\", 0.1); },", "        \"Grow Width\": function (c) {},"),
 ("src/rules.js", "dialogs tile", "        if (w.transient || w.modal || !w.resizeable) return \"float\";", "        if (!w.resizeable) return \"float\";"),
 ("src/rules.js", "title rule ignored", "            titleHas(w.caption, FLOAT_TITLE)) return \"float\";", "            false) return \"float\";"),
]
survivors = []
for path, name, a, b in muts:
    orig = open(path).read()
    if a not in orig:
        print(f"!! pattern missing (src changed?): {name}"); survivors.append(name); continue
    open(path, "w").write(orig.replace(a, b, 1))
    try:
        subprocess.run(["./build.sh"], check=True, capture_output=True)
        r = subprocess.run(["tests/live/run.sh"], capture_output=True, text=True, timeout=400)
        red = r.returncode != 0
    finally:
        open(path, "w").write(orig)
    print(f"{'red   ' if red else 'GREEN '} {name}", flush=True)
    if not red: survivors.append(name)
subprocess.run(["./build.sh"], check=True, capture_output=True)
sys.exit(1 if survivors else 0)
