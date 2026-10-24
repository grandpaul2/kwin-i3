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
# Every fault is built into package/, and the live desktop loads kwin-i3 from a checkout's package/
# (~/.local/share/kwin/scripts/kwin-i3): one KWin reload mid-run would give it a broken window
# manager. Run it from a worktree instead (2026-10-22).
live = os.path.realpath(os.path.expanduser("~/.local/share/kwin/scripts/kwin-i3"))
if live == os.path.realpath("package"):
    sys.exit("mutate.py: this checkout's package/ is the live kwin-i3; run it in a worktree:\n"
             "  git worktree add /tmp/ki3-mutate && cp -r tools/bin /tmp/ki3-mutate/tools/ && make -C /tmp/ki3-mutate mutate-live")

T, R, H, X, M, K, I, L = "10-tiling.sh", "20-rules.sh", "00-harness.sh", "30-more.sh", "40-monitors.sh", "50-keys.sh", "51-input.sh", "60-load.sh"
U, C, P, D = "41-unplug-focus.sh", "70-capture.sh", "42-replug-home.sh", "43-hidden-moves.sh"
F = "32-fullscreen-open.sh"
muts = [
 (T, "src/kwin.js", "one-child splits kept in projection", "        if (kids.length === 1) return kids[0].p;\n", ""),
 (T, "src/kwin.js", "same-direction nesting not merged", "            if (k.p.dir === con.layout) {", "            if (false) {"),
 (T, "src/kwin.js", "sizes never set", "            setSizesStable(root, p, screen);", ""),
 (T, "src/kwin.js", "padding kept", "        if (t.padding !== 0) t.padding = 0;", ""),
 (R, "src/kwin.js", "minimized windows still tiled", "        return w && !w.minimized && !(w.fullScreen && !w.tile);", "        return !!w && !(w.fullScreen && !w.tile);"),
 (R, "src/kwin.js", "foreign untile ignored", "            var con = model.byWin[key];\n            if (!con || con.type === \"floating\" || w.fullScreen || w.minimized) return;", "            return;"),
 (R, "src/kwin.js", "no adopt from live tiles", "                var spec = root ? specOf(root, 1, d) : null;", "                var spec = null;"),
 (R, "src/kwin.js", "release leaves windows tiled", "                untile(w);\n                if (keptAbove[key])", "                if (keptAbove[key])"),
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
 (M, "src/kwin.js", "screen changes ignored", "        workspace.screensChanged.connect(guard(\"screens\", screensChanged));\n", ""),
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
 # The fuzzer's finds, 2026-10-22 (tests/fuzz, docs/fuzz-design.md)
 (M, "src/kwin.js", "an empty workspace leaves a hidden window active", "            if (f.type === \"ws\" && ac && Tree.wsOf(ac) !== ws) workspace.activeWindow = null;", ""),
 (I, "src/kwin.js", "a window resized smaller than its tile stays so", "            refit(root);\n", ""),
 (I, "src/kwin.js", "fullscreen geometry lost on unmanage", "        if (g) w.frameGeometry = g;\n", ""),
 (I, "src/kwin.js", "untiled fullscreen windows are tiled (and floated on refusal)", "        return w && !w.minimized && !(w.fullScreen && !w.tile);", "        return w && !w.minimized;"),
 (I, "src/kwin.js", "a window dragged to the other monitor loses the focus", "                model.focusWin(key);\n                wantFocus();\n", ""),
 (U, "src/kwin.js", "a window listed in a tile but not placed stays unplaced", "            if (shown && w.tile !== tile && tile.windows.indexOf(w) >= 0) unmanageFrom(tile, w);\n", ""),
 (U, "src/kwin.js", "no pass after focus shows a desktop", "            schedule(ws);\n        }\n        if (f.type === \"ws\"", "        }\n        if (f.type === \"ws\""),
 (P, "src/kwin.js", "a returning monitor shows its old workspace even after it moved", "                    if (num && h && h !== s.name) num = unusedWorkspace(s);\n", ""),
 (D, "src/kwin.js", "a rebuilt root unmanages by w.tile (hidden windows stay listed)", "                t.windows.slice().forEach(function (w) { unmanageFrom(t, w); });", "                t.windows.slice().forEach(function (w) { if (w.tile) unmanageFrom(w.tile, w); });"),
 (D, "src/kwin.js", "a modal pair's two-desktop moment taken for sticky", "            if (relocating && w.desktops.length !== 1) return;\n", ""),
 (C, "src/log.js", "the in-memory log only with debugLog", "    logRing.push(new Date()", "    if (DEBUG_LOG) logRing.push(new Date()"),
 # A fullscreen window stays in the tree (docs/spec-fullscreen-tree.md, 2026-10-24)
 (F, "src/kwin.js", "A: a refused fullscreen window floats again", "        if (w.fullScreen) {\n            outOfTiles[id(w)] = true;", "        if (false) {\n            outOfTiles[id(w)] = true;"),
 (F, "src/kwin.js", "A: out-of-tiles record ignored (decided from w.tile)", "        return w && !w.minimized && !(w.fullScreen && (!w.tile || outOfTiles[c.win]));", "        return w && !w.minimized && !(w.fullScreen && !w.tile);"),
 (F, "src/rules.js", "B: a fullscreen window is 'not resizeable', so float", "        if (!w.fullScreen) return !w.resizeable;", "        return !w.resizeable;"),
 (F, "src/kwin.js", "C: no hand-back, the newcomer keeps KWin's focus", "        if (!fresh || !w.active || w.transient) return null;", "        return null;"),
 (F, "src/kwin.js", "C: the hand-back also on a hidden workspace", "        if (workspace.currentDesktopForScreen(outputOf(ws)) !== deskOf(ws.num)) return null;\n", ""),
 (F, "src/kwin.js", "C: a workspace switch focuses what KWin chose under fullscreen", "        model.activate(fs || model.descendFocused(ws));", "        model.activate(model.descendFocused(ws));"),
]
ALL = [H, T, R, X, M, U, P, D, K, I, L, C, F]
# Known equivalent fault, not listed: dropping `|| dragging` from the desktopsChanged guard. The
# window then joins the other monitor's workspace when it crosses rather than when dropped; the
# end state is the same, so no test can tell. The guard stays: it keeps kwin-i3 from moving a
# window while it is still being dragged.
# Also not listed, with reasons (2026-10-22):
# - "Meta+N moves a gone home": the fix in gotoWorkspace overlaps the screensChanged restore (a
#   returning monitor shows again what it showed), which corrects the same symptom; kept as
#   defence in depth, no test can separate them.
# - "untile() back to w.tile in dropWindow" (and the other five call sites): with the relocate
#   guard in place no test drops a hidden, listed window any more; untile is kept because KWin's
#   listing without w.tile on a hidden desktop is real (KWin 6.7.5 Tile::manage), so unmanaging
#   by w.tile alone is wrong wherever it happens (fuzzer I1, 2026-10-22).
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
