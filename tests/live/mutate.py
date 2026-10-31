#!/usr/bin/env python3
"""Deliberate faults in src/kwin.js and src/rules.js; each must make a live check FAIL.
Run: make mutate-live.

- The unmutated suite must pass first, or nothing here means anything (test review fault 7).
- A fault counts as caught only when a check printed FAIL: a timeout, a crash or a harness error is
  reported as such, not as caught.
- Each fault names the scenario expected to catch it, which runs first with KI3_FAILFAST=1; the
  others run only if that one stays green.
- src/ and the built package are restored even on an exception or Ctrl-C.
- KI3_ONLY="a|b": only the faults whose name contains one of those; the baseline is the
  scenarios those faults name.
- KI3_SCENARIO=NN-name.sh: one scenario's faults (docs/testing.md, P3): the baseline is that
  scenario alone, and each of its faults runs against it alone, never the rest of the suite.
- A fault in plugin/ rebuilds the plugins (make plugin) with it, and again when it is restored.
- A sixth field "expected to survive" (docs/testing.md, P3.5: visible, but not in the test KWin):
  reported as such when it survives, and not counted against the run.
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
F, S, W, G = "32-fullscreen-open.sh", "25-settings.sh", "49-ws-outputs.sh", "26-gaps.sh"
Z = "77-float-size.sh"
TL = "85-tiled-look.sh"
DR = "86-tiling-drag.sh"
muts = [
 (T, "src/kwin.js", "one-child splits kept in projection", "        if (kids.length === 1) return kids[0].p;\n", ""),
 (T, "src/kwin.js", "same-direction nesting not merged", "            if (k.p.dir === con.layout) {", "            if (false) {"),
 (T, "src/kwin.js", "sizes never set", "            setSizesStable(root, p, screen);", ""),
 (T, "src/kwin.js", "padding kept", "        if (t.padding !== inner) t.padding = inner;", ""),
 (R, "src/kwin.js", "minimized windows still tiled", "        return w && !w.minimized && !(w.fullScreen && !w.tile);", "        return !!w && !(w.fullScreen && !w.tile);"),
 (R, "src/kwin.js", "foreign untile ignored", "            var con = model.byWin[key];\n            if (!con || con.type === \"floating\" || w.fullScreen || w.minimized) return;", "            return;"),
 (R, "src/kwin.js", "no adopt from live tiles", "                var spec = root ? specOf(root, 1, d) : null;", "                var spec = null;"),
 (R, "src/kwin.js", "release leaves windows tiled", "                untile(w);\n                if (keptAbove[key])", "                if (keptAbove[key])"),
 (T, "src/kwin.js", "floating not kept above", "        if (on) { if (!w.keepAbove) w.keepAbove = true; keptAbove[id(w)] = true; }", ""),
 (T, "src/kwin.js", "KWin focus not followed", "            if (w && wins[id(w)]) model.focusWin(id(w));\n        }));", "        }));"),
 (T, "src/kwin.js", "one size pass only", "        for (var pass = 0; pass < 4; pass++)", "        for (var pass = 0; pass < 1; pass++)"),
 (T, "src/kwin.js", "KWin's 15% tile minimum kept", "            t.minimumSize = min;", ""),
 (T, "src/kwin.js", "grow width does nothing", "        \"Grow Width\": function (c) { model.resize(c, \"width\", step()); },", "        \"Grow Width\": function (c) {},"),
 (R, "src/rules.js", "dialogs tile", "        if (w.transient || w.modal || fixedSize(w)) return \"float\";", "        if (fixedSize(w)) return \"float\";"),
 (R, "src/rules.js", "title rule ignored", "            titleHas(w.caption, S(\"floatingTitle\"))) return \"float\";", "            false) return \"float\";"),
 (X, "src/rules.js", "ignore list empty", "        if (has(S(\"ignoreClass\"), w.resourceClass) || has(S(\"ignoreClass\"), w.resourceName) ||", "        if ("),
 (X, "src/kwin.js", "sticky windows kept", "            if (w.desktops.length !== 1) {\n                // Now on all desktops", "            if (false) {\n                // Now on all desktops"),
 (X, "src/kwin.js", "re-adopt on one desktop ignored", "            if (!con) { if (w.desktops.length === 1) adoptWindow(w); return; }", "            if (!con) return;"),
 (X, "src/kwin.js", "guard logs nothing", "            catch (e) { log(\"ERROR in \" + name", "            catch (e) { (\"ERROR in \" + name"),
 (M, "src/kwin.js", "no relocation", "        relocate(ws, screen);\n", ""),
 (M, "src/kwin.js", "screen changes ignored", "        workspace.screensChanged.connect(guard(\"screens\", screensChanged));\n", ""),
 (M, "src/kwin.js", "no neighbouring output", "        var t = Workspaces.screenToward(outputOf(ws), dir);", "        var t = null;"),
 (M, "src/kwin.js", "pointer doesn't follow", "        if (from && from !== s) invoke(\"MoveMouseToFocus\");", ""),
 (M, "src/kwin.js", "no login numbering", "        if (login) Workspaces.numberScreens();", ""),
 (M, "src/workspaces.js", "a gone home is forgotten", "        if (!home[num] && s) home[num] = s.name;\n        return s || workspace.screens[0];", "        var f = s || workspace.screens[0];\n        home[num] = f.name;\n        return f;"),
 (M, "src/kwin.js", "empty workspace opens at its old home", "            var s = occupied ? Workspaces.outputOf(n) : Workspaces.assignedScreen(n) || workspace.activeScreen;", "            var s = Workspaces.outputOf(n);"),
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
 (C, "src/log.js", "the in-memory log only with debugLog", "    logRing.push(now", "    if (DEBUG_LOG) logRing.push(now"),
 # A reload keeps owning the floating windows' keep-above flags
 (L, "src/kwin.js", "a flag already set is not owned (orphaned by a reload)", "        if (on) { if (!w.keepAbove) w.keepAbove = true; keptAbove[id(w)] = true; }", "        if (on && !w.keepAbove) { w.keepAbove = true; keptAbove[id(w)] = true; }"),
 (L, "src/kwin.js", "a reload re-tiles a hand-floated window", "        if (kind === \"tile\" && !fresh && !w.tile && w.keepAbove) kind = \"float\";\n", ""),
 (R, "src/kwin.js", "the rules re-float/re-tile on every caption change (a hand float lasts one retitle)", "        if (kind === was) return;\n", ""),
 # A fullscreen window stays in the tree
 (F, "src/kwin.js", "A: a refused fullscreen window floats again", "        if (w.fullScreen) {\n            log(\"FULLSCREEN \"", "        if (false) {\n            log(\"FULLSCREEN \""),
 (F, "src/rules.js", "B: a fullscreen window is 'not resizeable', so float", "        if (!w.fullScreen) return !w.resizeable;", "        return !w.resizeable;"),
 (F, "src/kwin.js", "C: no hand-back, the newcomer keeps KWin's focus", "        if (!fresh || !w.active || w.transient || w.fullScreen) return null;", "        return null;"),
 (F, "src/kwin.js", "C: a workspace switch focuses what KWin chose under fullscreen", "        model.activate(fs || model.descendFocused(ws));", "        model.activate(model.descendFocused(ws));"),
 # Settings and the reload
 (S, "src/kwin.js", "settings not re-read on a reconfigure", "        options.configChanged.connect(guard(\"settings\", settingsChanged));\n", ""),
 (S, "src/kwin.js", "Reload Settings does nothing", "callDBus(\"org.kde.KWin\", \"/KWin\", \"org.kde.KWin\", \"reconfigure\");", ""),
 (S, "src/kwin.js", "a rule change leaves open windows as they were", "            workspace.windowList().forEach(function (w) { if (!w.deleted) reclassify(w); });\n", "            ;\n"),
 (S, "src/kwin.js", "the resize step stays 10 %", "    function step() { return Settings.get(\"resizeStep\") / 100; }", "    function step() { return 0.1; }"),
 (S, "src/kwin.js", "focus wrapping not passed to the model", "model.focusDir(DIRS[d], Settings.get(\"focusWrapping\"));", "model.focusDir(DIRS[d]);"),
 (S, "src/kwin.js", "default orientation ignored", "return model.ws(num, o === \"horizontal\" ? \"h\" : o === \"vertical\" ? \"v\" : g.height > g.width ? \"v\" : \"h\");", "return model.ws(num, g.height > g.width ? \"v\" : \"h\");"),
 (S, "src/settings.js", "every key reported changed on every reload", "            if (JSON.stringify(v) !== JSON.stringify(values[key])) changed.push(key);", "            changed.push(key);"),
 (W, "src/workspaces.js", "a first home ignores the assignment", "    function claimHome(num, screen) { home[num] = assigned(num) || screen.name; }", "    function claimHome(num, screen) { home[num] = screen.name; }"),
 (W, "src/workspaces.js", "login numbering ignores assignments", "                if (taken[num] || (a[num] && a[num] !== s[i].name)) continue;", "                if (taken[num]) continue;"),
 (W, "src/kwin.js", "an empty assigned workspace opens on the current monitor", "Workspaces.assignedScreen(n) || workspace.activeScreen;", "workspace.activeScreen;"),
 (W, "src/kwin.js", "a monitor that appears doesn't take its workspaces", "        names.forEach(function (n) { if (!(n in lastShown)) Workspaces.claimAssigned(n); });\n", ""),
 (W, "src/kwin.js", "a reload re-applies assignments to existing workspaces", "        log(\"SETTINGS \" + changed.join(\" \"));\n", "        log(\"SETTINGS \" + changed.join(\" \"));\n        if (changed.indexOf(\"workspaceOutputs\") >= 0) { Workspaces.numberScreens(); }\n"),
 (W, "src/kwin.js", "a returning monitor's spare workspace may be assigned elsewhere", " || (a && a !== s.name)) continue;", ") continue;"),
 # Gaps
 (G, "src/kwin.js", "gaps: the root never inset", "            if (reinset) root.relativeGeometry = inset;\n", ""),
 (G, "src/kwin.js", "gaps: no rebuild when the inset changes", "        if (want !== have || reinset) {", "        if (want !== have) {"),
 (G, "src/kwin.js", "gaps: a pinned outer edge not mended", " || !edgesIntact(root);", ";"),
 (G, "src/kwin.js", "gaps: window rect ignores the padding", "        if (!p) return a;", "        return a;"),
 (G, "src/kwin.js", "gaps: minimums without the gap", "return { w: fm.w + i, h: fm.h + i }; }", "return { w: fm.w, h: fm.h }; }"),
 (G, "src/kwin.js", "gaps: can't-fit judged against the whole area", "W = area.width - 2 * e, H = area.height - 2 * e;", "W = area.width, H = area.height;"),
 (G, "src/kwin.js", "gaps: the read-back not clipped to the root", "                return { x: Math.max(g.x, lo.x), y: Math.max(g.y, lo.y),\n                         x2: Math.min(g.x + g.width, hi.x), y2: Math.min(g.y + g.height, hi.y) };", "                return { x: g.x, y: g.y, x2: g.x + g.width, y2: g.y + g.height };"),
 (G, "src/kwin.js", "gaps: release leaves the root inset", "                    root.relativeGeometry = full;\n", ""),
 (G, "src/kwin.js", "gaps: sizes start from the whole area", "var g = root.relativeGeometry, r = { x: g.x, y: g.y, width: g.width, height: g.height };", "var r = { x: 0, y: 0, width: 1, height: 1 };"),
 # A floated window at the geometry it opened with
 (Z, "src/kwin.js", "float size: the record never applied", "        w.frameGeometry = g;\n", ""),
 (Z, "src/kwin.js", "float size: never recorded", "        recordUntiled(w);\n", ""),
 (Z, "src/kwin.js", "float size: not moved by i3's rule on another output", "        if (r.out.x !== o.x ||", "        if (false && r.out.x !== o.x ||"),
 (Z, "src/kwin.js", "float size: a rule's float not at the record", "if (kind === \"float\") { untile(w); floatAtRecord(w); }", "if (kind === \"float\") { untile(w); }"),
 (TL, "src/kwin.js", "tiled look: the ring kept in bare", "    function tiledRing() { return frameOn && Settings.get(\"tiledLook\") === \"frame\"; }", "    function tiledRing() { return frameOn && Settings.get(\"tiledLook\") !== \"titlebars\"; }"),
 (TL, "src/kwin.js", "tiled look: the frame's room kept in titlebars", "        return { inner: i + (tiledRing() ? 2", "        return { inner: i + (frameOn ? 2"),
 (TL, "src/kwin.js", "tiled look: the effect never told", "        if (frameOn) callDBus(\"org.kde.KWin\", \"/kwini3hold\", \"net.local.kwini3hold\", \"SetTiledRing\", tiledRing());", ""),
 (DR, 'plugin/tilingdrag.cpp', "drag: no reconfigure asked at the helper's load", '    QMetaObject::invokeMethod(workspace(), &Workspace::reconfigure, Qt::QueuedConnection);\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: an unanswered drag leaves the helper on', '        m_on = false;\n        if (m_phase == Phase::Drag) {', '        if (m_phase == Phase::Drag) {'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: an unanswered drag keeps its phase', '        if (m_phase == Phase::Drag) {\n            m_phase = Phase::None;\n            m_window.clear();\n        }\n    });', '    });'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: an answer never stops the unanswered timer', '    m_unanswered.stop();\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: a drop or a cancel reported again', '    if (m_phase == Phase::Drop || m_phase == Phase::Cancel) {\n        m_phase = Phase::None;', '    if (false) {\n        m_phase = Phase::None;'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: SetOn ignored', '    m_on = on;\n', '    (void)on;\n'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: kwin-i3 never told a drag began', '    QDBusConnection::sessionBus().asyncCall(msg);\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: no unanswered timer', '    m_unanswered.start();\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: a cancel reported as none', 'm_phase = m_phase == Phase::Drag ? Phase::Cancel : Phase::None;', 'm_phase = Phase::None;'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: no hover at the release', '    if (window && window->decoration()) {\n        const QPointF p = pos - window->pos();', '    if (false) {\n        const QPointF p = pos - window->pos();'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: motions taken with no press', '    if (!(m_taken & Qt::LeftButton)) {\n        return false;\n    }\n    if (m_phase == Phase::Pressed', '    if (m_phase == Phase::Pressed'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: a title press with no threshold', '        m_threshold = true;', '        m_threshold = false;'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: never begins on a motion', '        begin();\n    }\n    if (m_phase == Phase::Drag) {\n        m_pos', '    }\n    if (m_phase == Phase::Drag) {\n        m_pos'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: the position never follows', '    if (m_phase == Phase::Drag) {\n        m_pos = event->position;\n    }\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: motions passed on', '    // focusUpdatesBlocked.)\n    return true;', '    // focusUpdatesBlocked.)\n    return false;'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: Escape not taken', '    if (m_phase != Phase::Drag || event->key != Qt::Key_Escape) {', '    if (true) {'),
 (DR, 'plugin/tilingdrag.cpp', "drag: Escape doesn't cancel", '    if (event->state == KeyboardKeyState::Pressed) {\n        cancel();\n    }', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: every release taken', '        if (!(m_taken & event->button)) {\n            return false;\n        }\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: a release is never a drop', '                m_phase = Phase::Drop;\n', ''),
 (DR, 'plugin/tilingdrag.cpp', 'drag: a click leaves the press pending', '            } else if (m_phase == Phase::Pressed) {\n                m_phase = Phase::None;\n            }', '            }'),
 (DR, 'plugin/tilingdrag.cpp', "drag: another button doesn't cancel", '    if (m_taken & Qt::LeftButton) {\n        cancel();', '    if (false) {\n        cancel();'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: presses taken while off or not left', '    if (!m_on || event->button != Qt::LeftButton || input()->pointer()->isConstrained() || workspace()->globalShortcutsDisabled()) {', '    if (false) {'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: not only tiled windows', ' || window->quickTileMode() != QuickTileMode(QuickTileFlag::Custom)) {', ') {'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: Meta press not taken', '    if (mods == Qt::MetaModifier || mods == (Qt::MetaModifier | Qt::ShiftModifier)) {', '    if (false) {'),
 (DR, 'plugin/tilingdrag.cpp', "drag: a Meta press doesn't activate", '        window->performMousePressCommand(Options::MouseActivateAndRaise, event->position);\n', ''),
 (DR, 'plugin/tilingdrag.cpp', "drag: a client press taken as the title bar's", ' || window->decoration()->sectionUnderMouse() != Qt::TitleBarArea) {', ') {'),
 (DR, 'plugin/tilingdrag.cpp', 'drag: the decoration not asked first', '        if (e.isAccepted()) {', '        if (false) {'),
 (DR, 'plugin/tilingdrag.cpp', "drag: a title press doesn't activate", '        window->performMousePressCommand(window->isActive() ? options->commandActiveTitlebar1() : options->commandInactiveTitlebar1(), event->position);\n', ''),
 (DR, 'plugin/tilingdrag.cpp', "drag: a Meta press doesn't begin at once", '    if (!m_threshold) {\n        begin();\n    }\n', ''),
 (DR, 'plugin/hold.cpp', 'indicator: the effect inactive while it shows', '    if (holding() || !m_drop.isEmpty()) {', '    if (holding()) {'),
 (DR, 'plugin/hold.cpp', 'indicator: its old place never repainted', '    if (!m_drop.isEmpty()) {\n        effects->addRepaint(m_drop', '    if (false) {\n        effects->addRepaint(m_drop'),
 (DR, 'plugin/hold.cpp', 'indicator: its new place never repainted', '    if (!drop.isEmpty()) {\n        effects->addRepaint(drop', '    if (false) {\n        effects->addRepaint(drop'),
 (DR, 'plugin/hold.cpp', 'indicator: not painted', '    if (m_drop.isEmpty()) {\n        return;\n    }\n    const QPoint origin', '    if (true) {\n        return;\n    }\n    const QPoint origin'),
 (DR, 'plugin/hold.cpp', 'indicator: no vertices', '        verts << QVector2D(x1, y0) << QVector2D(x0, y0) << QVector2D(x0, y1)\n              << QVector2D(x0, y1) << QVector2D(x1, y1) << QVector2D(x1, y0);\n    }\n    if (verts.isEmpty())', '    }\n    if (verts.isEmpty())'),
 (DR, 'plugin/hold.cpp', 'indicator: not in Stats', '    m[QStringLiteral("drop")] = m_drop.isEmpty() ? QString() : QStringLiteral("%1,%2 %3x%4").arg(m_drop.x()).arg(m_drop.y()).arg(m_drop.width()).arg(m_drop.height());\n', ''),
 (DR, 'src/kwin.js', 'drag: the helper never turned on at the start', '        tellDrag(true);\n        adoptRestSoon', '        adoptRestSoon'),
 (DR, 'src/kwin.js', 'drag: the helper not turned on at a reconfigure', '        tellDrag(true);         // every reconfigure', ''),
 (DR, 'src/kwin.js', 'drag: the release leaves the helper on', '        try { tellDrag(false); } catch', '        try { } catch'),
 (DR, 'src/kwin.js', 'drag: a desktop that is no workspace shown', 'return n >= 1 ? { ws: wsModel(n), screen: s } : null;', 'return { ws: wsModel(n), screen: s };'),
 (DR, 'src/kwin.js', "drag: a fullscreen window doesn't hide the rest", 'return visibleLeaf(c) && (!fs || fs === c);', 'return visibleLeaf(c);'),
 (DR, 'src/kwin.js', 'drag: always somewhere to drop', '        return n > 1;\n', '        return true;\n'),
 (DR, 'src/kwin.js', 'drag: an empty workspace is no target', 'n += k ? k : v.ws.nodes.length ? 0 : 1;', 'n += k;'),
 (DR, 'src/kwin.js', 'drag: a workspace has no rect of its own', '        if (con.type === "ws") return areaOf(outputOf(con), con);\n', ''),
 (DR, 'src/kwin.js', 'drag: a window has no rect of its own', '        if (con.win !== null) return wins[con.win].frameGeometry;\n', ''),
 (DR, 'src/kwin.js', "drag: a split's rect empty", '            if (!r) { r = { x: g.x, y: g.y, width: g.width, height: g.height }; return; }', '            return;'),
 (DR, 'src/kwin.js', "drag: a hidden window in a split's rect", '            if (!visibleLeaf(c)) return;\n            var g = wins[c.win]', '            var g = wins[c.win]'),
 (DR, 'src/kwin.js', 'drag: no window ever under the pointer', '            if (hit) return hit;\n', ''),
 (DR, 'src/kwin.js', 'drag: no gap fallback', '        return on ? model.descendTilingFocused(on.ws) : null;', '        return null;'),
 (DR, 'src/kwin.js', 'drag: the parent zone ignores the title bar', '        return (t > 0 ? t : 20) + 5;', '        return 25;'),
 (DR, 'src/kwin.js', 'drag: a gone window still dragged', '            if (model.byWin[f[1]] !== con || con.type !== "con") { endDrag("its window is gone"); return; }\n', ''),
 (DR, 'src/kwin.js', 'drag: the indicator never sent', '            if (phase === "drag") { indicate(drag.plan && drag.plan.rect); return; }', '            if (phase === "drag") { return; }'),
 (DR, 'src/kwin.js', "drag: the drop's workspaces not redone", '                schedule(from);\n                if (to && to !== from) schedule(to);\n                schedule(Tree.wsOf(con));\n', ''),
 (DR, 'src/kwin.js', "drag: the target's workspace not redone", '                if (to && to !== from) schedule(to);\n', ''),
 (DR, 'src/kwin.js', 'drag: no focus after a drop', '                wantFocus();\n            }\n            return;', '            }\n            return;'),
 (DR, 'src/kwin.js', 'drag: a cancel applied as a drop', '        if (phase === "drag" || phase === "drop") {', '        if (phase === "drag" || phase === "drop" || phase === "cancel") {'),
 (DR, 'src/kwin.js', 'drag: the indicator kept at the end', '        indicate(null);\n        drag.timer.stop();', '        drag.timer.stop();'),
 (DR, 'src/kwin.js', 'drag: started for anything', '            if (!con || con.type !== "con" || !wins[con.win] || !hasDropTargets()) {', '            if (!con) {'),
 (DR, 'src/kwin.js', 'drag: a second start while dragging', '            if (f[0] !== "drag" || drag) return;', '            if (f[0] !== "drag") return;'),
 (DR, 'src/kwin.js', 'drag: the poll never started', '            if (drag) timer.start();', ''),
]
ALL = [H, T, R, X, M, U, P, D, K, I, L, C, F, S, W, G, Z]
# Known equivalent fault, not listed: snapping the first child's start in setSizes (gaps). The
# start is KWin's root x, which kwin-i3 wrote as inset/width, and snap() gives back that same double
# for any whole-pixel inset; it stays exact as a guard (CustomTile compares edges exactly). The same
# for snapping the last child's end: setSizes writes a tile only when it is off by more than 1e-4,
# so a last-bit difference never reaches KWin on its own (2026-10-24, both run, both green).
# Also known equivalent, not listed: dropping `|| dragging` from the desktopsChanged guard. The
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
# - An `outOfTiles` record beside w.tile (built and removed 2026-10-24): the spec review predicted
#   a rebuild loop while w.tile lagged the client's acknowledgement. w.tile is KWin's *requested*
#   tile (window.h:595, READ requestedTile), which Tile::unmanage clears at once; a client stopped
#   with SIGSTOP (answering nothing) showed tile=null right after the unmanage, two passes, no
#   spin. The mutant was equivalent, so the record is gone; 32-fullscreen-open.sh keeps the
#   stopped client and the pass counts.
# - "the hand-back only on a shown workspace" (keepsFullscreenFocus, 2026-10-24): KWin's own
#   activation of a new window on a hidden desktop switches that desktop first
#   (SwitchToOtherDesktop), so by windowAdded the workspace is shown and the guard never fires in a
#   test. It stays: activating the fullscreen window on a hidden workspace would switch desktops.
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

def build(path):
    """The fault (or its restore) built: the script always (run.sh builds it too), the plugins for
    a plugin fault. False if the build failed."""
    if not path.startswith("plugin/"): return True
    return subprocess.run(["make", "plugin"], capture_output=True).returncode == 0

def main():
    one = os.environ.get("KI3_SCENARIO", "")
    if one and not os.path.exists(os.path.join("tests/live", one)):
        print(f"KI3_SCENARIO: no tests/live/{one}"); return 2
    only = [o for o in os.environ.get("KI3_ONLY", "").split("|") if o]
    chosen = [m for m in muts if (not only or any(o in m[2] for o in only)) and (not one or m[0] == one)]
    # KI3_ONLY: the baseline is the scenarios its faults name, not the whole suite, so a flake
    # elsewhere doesn't block it (OPEN.md item 34 (e)).
    base_set = [one] if one else sorted({m[0] for m in chosen}) if only else ALL
    if not base_set:
        print("KI3_ONLY: no fault matches"); return 2
    base, out = run(base_set, False)
    if base != "green":
        print(f"baseline is {base}, not green: fix the suite before trusting any fault result\n{out}")
        return 2
    print("baseline green" + ("" if base_set is ALL else ": " + " ".join(base_set)), flush=True)
    survivors, broken = [], []
    for scenario, path, name, a, b, *rest in chosen:
        expected = bool(rest and rest[0])
        orig = open(path).read()
        if a not in orig:
            print(f"!! pattern missing (src changed?): {name}"); survivors.append(name); continue
        try:
            open(path, "w").write(orig.replace(a, b, 1))
            if not build(path):
                state, why = "broken", "the fault does not build"
            else:
                state, why = run([scenario], True)
                if state == "green" and not one:
                    state, why = run([s for s in ALL if s != scenario], True)
        finally:
            open(path, "w").write(orig)
            build(path)
        label = {"red": "red    ", "green": "GREEN  ", "broken": "BROKEN ", "timeout": "TIMEOUT"}[state]
        if state == "green" and expected: label = "GREEN, expected:"
        print(f"{label} {name}" + (f"   <- {why}" if state == "red" else ""), flush=True)
        if state == "green" and not expected: survivors.append(name)
        if state in ("broken", "timeout"): broken.append(name)
    if broken: print("not caught by a check (harness trouble): " + ", ".join(broken))
    return 1 if survivors or broken else 0

try:
    code = main()
finally:
    subprocess.run(["./build.sh"], capture_output=True)    # never leave a mutant built
    if any(m[1].startswith("plugin/") for m in muts): build("plugin/")
sys.exit(code)
