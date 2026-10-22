#!/usr/bin/env python3
"""Deliberate faults in src/kwin.js and src/rules.js; each must make a live check FAIL.
Run: make mutate-live.

- The unmutated suite must pass first, or nothing here means anything (test review fault 7).
- A fault counts as caught only when a check printed FAIL: a timeout, a crash or a harness error is
  reported as such, not as caught.
- Each fault names the scenario expected to catch it, which runs first with KI3_FAILFAST=1; the
  others run only if that one stays green.
- src/ and the built package are restored even on an exception or Ctrl-C.
"""
import os, subprocess, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

T, R, H, X, M, K, I, L = "10-tiling.sh", "20-rules.sh", "00-harness.sh", "30-more.sh", "40-monitors.sh", "50-keys.sh", "51-input.sh", "60-load.sh"
muts = [
 (T, "src/kwin.js", "one-child splits kept in projection", "        if (kids.length === 1) return kids[0].p;\n", ""),
 (T, "src/kwin.js", "same-direction nesting not merged", "            if (k.p.dir === con.layout) {", "            if (false) {"),
 (T, "src/kwin.js", "sizes never set", "            setSizesStable(root, p);", ""),
 (T, "src/kwin.js", "padding kept", "        if (t.padding !== 0) t.padding = 0;", ""),
 (R, "src/kwin.js", "minimized windows still tiled", "        return w && !w.minimized;", "        return !!w;"),
 (R, "src/kwin.js", "foreign untile ignored", "            var con = model.byWin[key];\n            if (!con || con.type === \"floating\" || w.fullScreen || w.minimized) return;", "            return;"),
 (R, "src/kwin.js", "no adopt from live tiles", "                var spec = root ? specOf(root, 1, d) : null;", "                var spec = null;"),
 (R, "src/kwin.js", "release leaves windows tiled", "                if (w.tile) w.tile.unmanage(w);", ""),
 (T, "src/kwin.js", "floating not kept above", "        if (on && !w.keepAbove) { w.keepAbove = true; keptAbove[id(w)] = true; }", ""),
 (T, "src/kwin.js", "KWin focus not followed", "            if (w && wins[id(w)]) model.focusWin(id(w));\n        }));", "        }));"),
 (T, "src/kwin.js", "one size pass only", "        for (var pass = 0; pass < 4; pass++)", "        for (var pass = 0; pass < 1; pass++)"),
 (T, "src/kwin.js", "KWin's 15% tile minimum kept", "            t.minimumSize = min;", ""),
 (T, "src/kwin.js", "grow width does nothing", "        \"Grow Width\": function (c) { model.resize(c, \"width\", 0.1); },", "        \"Grow Width\": function (c) {},"),
 (R, "src/rules.js", "dialogs tile", "        if (w.transient || w.modal || !w.resizeable) return \"float\";", "        if (!w.resizeable) return \"float\";"),
 (R, "src/rules.js", "title rule ignored", "            titleHas(w.caption, FLOAT_TITLE)) return \"float\";", "            false) return \"float\";"),
 (X, "src/rules.js", "ignore list empty", "    var IGNORE_CLASS = list(\"ignoreClass\",", "    var IGNORE_CLASS = [] || list(\"ignoreClass\","),
 (X, "src/kwin.js", "sticky windows kept", "            if (w.desktops.length !== 1) {\n                // Now on all desktops", "            if (false) {\n                // Now on all desktops"),
 (X, "src/kwin.js", "re-adopt on one desktop ignored", "            if (!con) { if (w.desktops.length === 1) adoptWindow(w); return; }", "            if (!con) return;"),
 (X, "src/kwin.js", "guard logs nothing", "            catch (e) { log(\"ERROR in \" + name", "            catch (e) { (\"ERROR in \" + name"),
 (M, "src/kwin.js", "no relocation", "        relocate(ws, screen);\n", ""),
 (M, "src/kwin.js", "screen changes ignored", "        workspace.screensChanged.connect(guard(\"screens\", function () { scheduleAll(); wantFocus(); }));", ""),
 (M, "src/kwin.js", "no neighbouring output", "        var t = Workspaces.screenToward(outputOf(ws), dir);", "        var t = null;"),
 (M, "src/kwin.js", "pointer doesn't follow", "        if (from && from !== s) invoke(\"MoveMouseToFocus\");", ""),
 (M, "src/kwin.js", "no login numbering", "        if (login) Workspaces.numberScreens();", ""),
 (M, "src/workspaces.js", "a gone home is forgotten", "        if (!home[num] && s) home[num] = s.name;\n        return s || workspace.screens[0];", "        var f = s || workspace.screens[0];\n        home[num] = f.name;\n        return f;"),
 (M, "src/kwin.js", "empty workspace opens at its old home", "            var s = occupied ? Workspaces.outputOf(n) : workspace.activeScreen;", "            var s = Workspaces.outputOf(n);"),
 (I, "src/kwin.js", "no read-back after a border drag", "            if (kind === \"resize\" && con.type !== \"floating\") readBack(ws);", ""),
 (I, "src/kwin.js", "resize condition inverted", "            if (kind === \"resize\" && con.type !== \"floating\") readBack(ws);", "            if (kind !== \"resize\" && con.type !== \"floating\") readBack(ws);"),
 (I, "src/kwin.js", "dragged out of a tile doesn't float", "            if (!tile && dragging === \"move\") {", "            if (false) {"),
 (I, "src/kwin.js", "drop on another monitor doesn't join", "            if (kind === \"move\" && w.output !== outputOf(ws)) {", "            if (false) {"),
 (I, "src/kwin.js", "dragStart never sets dragging", "            dragging = w.move ? \"move\" : \"resize\";", "            dragging = false;"),
 (I, "src/kwin.js", "windowActivated not followed (input)", "            if (w && wins[id(w)]) model.focusWin(id(w));\n        }));", "        }));"),
 (K, "src/kwin.js", "Meta+: not registered", ", \"Meta+:\"],", "],"),
 (K, "src/kwin.js", "key table typo: Split V on Meta+B", "\"Split V\": [\"Meta+V\"]", "\"Split V\": [\"Meta+B\"]"),
 (K, "src/kwin.js", "a registration dropped (Meta+Ctrl+L)", "\"Shrink Height\": [\"Meta+Ctrl+Up\", \"Meta+Ctrl+L\"]", "\"Shrink Height\": [\"Meta+Ctrl+Up\"]"),
 (X, "src/kwin.js", "no backoff: retry at once, for ever", "        if (failures > 3) {", "        if (false) {"),
 (X, "src/kwin.js", "can't-fit windows still tile", "        floatWhatCannotFit(ws, screen);\n", ""),
 (M, "src/kwin.js", "a returning monitor's workspace not restored", "            if (allBack) {", "            if (false) {"),
 (X, "src/kwin.js", "minimums not shared out", "        if (sumMin > total) return want;", "        return want;"),
 (X, "src/kwin.js", "tile minimums left in place while sizing", "            prepareTiles(root, screen, true);   // sizes first", "            prepareTiles(root, screen);   // sizes first"),
]
ALL = [H, T, R, X, M, K, I, L]
# Known equivalent fault, not listed: dropping `|| dragging` from the desktopsChanged guard. The
# window then joins the other monitor's workspace when it crosses rather than when dropped; the
# end state is the same, so no test can tell. The guard stays: it keeps kwin-i3 from moving a
# window while it is still being dragged.
# Also not listed, with reasons (2026-10-22):
# - "Meta+N moves a gone home": the fix in gotoWorkspace overlaps the screensChanged restore (a
#   returning monitor shows again what it showed), which corrects the same symptom; kept as
#   defence in depth, no test can separate them.
# - "windows missing from stackingOrder not adopted": guards a timing race (a window too new to be
#   in stackingOrder when kwin-i3 loads) seen twice but not reproducible on demand; one harmless line.

def run(scenarios, failfast):
    env = dict(os.environ, KI3_FAILFAST="1") if failfast else dict(os.environ)
    try:
        r = subprocess.run(["tests/live/run.sh", *scenarios], capture_output=True, text=True, env=env, timeout=300)
    except subprocess.TimeoutExpired:
        return "timeout", ""
    out = r.stdout + r.stderr
    if r.returncode == 0:
        return "green", out
    fails = [l.strip() for l in out.splitlines() if l.startswith("  FAIL ")]
    real = [f for f in fails if f not in ("FAIL timed out", "FAIL no checks ran") and not f.startswith("FAIL exited")]
    return ("red", real[0]) if real else ("broken", out[-400:])

def main():
    base, out = run(ALL, False)
    if base != "green":
        print(f"baseline is {base}, not green: fix the suite before trusting any fault result\n{out}")
        return 2
    print("baseline green", flush=True)
    survivors, broken = [], []
    for scenario, path, name, a, b in muts:
        orig = open(path).read()
        if a not in orig:
            print(f"!! pattern missing (src changed?): {name}"); survivors.append(name); continue
        try:
            open(path, "w").write(orig.replace(a, b, 1))
            state, why = run([scenario], True)
            if state == "green":
                state, why = run([s for s in ALL if s != scenario], True)
        finally:
            open(path, "w").write(orig)
        label = {"red": "red    ", "green": "GREEN  ", "broken": "BROKEN ", "timeout": "TIMEOUT"}[state]
        print(f"{label} {name}" + (f"   <- {why}" if state == "red" else ""), flush=True)
        if state == "green": survivors.append(name)
        if state in ("broken", "timeout"): broken.append(name)
    if broken: print("not caught by a check (harness trouble): " + ", ".join(broken))
    return 1 if survivors or broken else 0

try:
    code = main()
finally:
    subprocess.run(["./build.sh"], capture_output=True)    # never leave a mutant built
sys.exit(code)
