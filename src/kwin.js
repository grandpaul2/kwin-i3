// The adapter: KWin signals in, model operations, and reconcile() out. Nothing else in kwin-i3
// writes to KWin's tiles (docs/plan.md decision 4).
//
// Ownership: the model (src/tree.js) owns structure, focus and i3's shares. KWin's tiles are the
// display. A border dragged in KWin is read back into the model when the drag ends.

var KI3 = (function () {
    var model = null;
    var wins = {};          // window id -> KWin window, for every window we manage
    var expected = {};      // window id -> tile we last put it in (or null): our own tileChanged
    var keptAbove = {};     // window id -> true where we set keepAbove (undone on release)
    var dirty = {};         // ws num -> true, waiting for the coalesced reconcile
    var timer = null;
    var released = false;
    var wsOutput = {};      // ws num -> KWin output it lives on (phase 3 widens this)

    function id(w) { return String(w.internalId); }

    function guard(name, fn) {
        return function () {
            if (released) return;
            try { return fn.apply(null, arguments); }
            catch (e) { log("ERROR in " + name + ": " + e + (e.stack ? " " + e.stack : "")); scheduleAll(); }
        };
    }

    // ---- workspaces ------------------------------------------------------------------------

    function deskNum(desktop) { return workspace.desktops.indexOf(desktop) + 1; }
    function deskOf(num) { return workspace.desktops[num - 1]; }

    function wsForWindow(w) {
        if (w.desktops.length !== 1) return null;
        var num = deskNum(w.desktops[0]);
        if (num < 1) return null;
        if (!wsOutput[num]) wsOutput[num] = w.output;
        var g = w.output.geometry;
        return model.ws(num, g.height > g.width ? "v" : "h");
    }

    function outputOf(ws) {
        var o = wsOutput[ws.num];
        if (o && workspace.screens.indexOf(o) >= 0) return o;
        // The screen showing it, else the first screen.
        for (var i = 0; i < workspace.screens.length; i++)
            if (workspace.currentDesktopForScreen(workspace.screens[i]) === deskOf(ws.num))
                return (wsOutput[ws.num] = workspace.screens[i]);
        return (wsOutput[ws.num] = workspace.screens[0]);
    }

    // ---- scheduling ------------------------------------------------------------------------

    function schedule(ws) {
        if (!ws) return;
        dirty[ws.num] = true;
        if (!timer) {
            timer = new QTimer();
            timer.singleShot = true;
            timer.interval = 0;
            timer.timeout.connect(guard("flush", flush));
        }
        if (!timer.active) timer.start();
    }
    function scheduleAll() { for (var n in model.workspaces) schedule(model.workspaces[n]); }

    function flush() {
        var nums = Object.keys(dirty);
        dirty = {};
        nums.forEach(function (n) { reconcile(model.workspaces[n]); });
    }

    // ---- projection: model -> the shape KWin's tiles can hold --------------------------------
    // KWin collapses one-child layouts and cannot nest a layout in one of the same direction
    // (split() then adds a sibling). So: drop one-child splits, merge same-direction nesting into
    // the parent with shares multiplied through, skip minimized windows. Geometry is unchanged.

    function visibleLeaf(c) {
        var w = wins[c.win];
        return w && !w.minimized;
    }

    // -> null | { win } | { dir: "h"|"v", kids: [{ node, share }] }
    function project(con) {
        if (con.win !== null && con.type !== "ws") return visibleLeaf(con) ? { win: con.win } : null;
        var kids = [];
        var total = 0;
        con.nodes.forEach(function (child) {
            var p = project(child);
            if (!p) return;
            kids.push({ p: p, share: child.percent });
            total += child.percent;
        });
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0].p;
        var out = { dir: con.layout, kids: [] };
        kids.forEach(function (k) {
            var share = total > 0 ? k.share / total : 1 / kids.length;
            if (k.p.dir === con.layout) {
                k.p.kids.forEach(function (g) { out.kids.push({ p: g.p, share: share * g.share }); });
            } else {
                out.kids.push({ p: k.p, share: share });
            }
        });
        return out;
    }

    // "H[a V[b c]]" over window ids, without sizes: equal shapes need only a resize.
    function shapeOfProjection(p) {
        if (!p) return "";
        if (p.win !== undefined) return "w:" + p.win;
        return p.dir + "[" + p.kids.map(function (k) { return shapeOfProjection(k.p); }).join(" ") + "]";
    }
    function shapeOfTile(t) {
        if (!t.tiles.length) return t.windows.length === 1 ? "w:" + id(t.windows[0]) : (t.windows.length ? "?" : "");
        return (t.layoutDirection === 2 ? "v" : "h") + "[" +
            t.tiles.map(shapeOfTile).join(" ") + "]";
    }

    // ---- reconcile: make one workspace's tiles match the model -------------------------------

    function manageInto(tile, w) {
        expected[id(w)] = tile;
        tile.manage(w);
    }
    function unmanageFrom(tile, w) {
        expected[id(w)] = null;
        tile.unmanage(w);
    }

    function tiledWindowsOf(t, out) {
        t.windows.forEach(function (w) { out.push(w); });
        t.tiles.forEach(function (c) { tiledWindowsOf(c, out); });
        return out;
    }

    // No gaps, and minimum sizes that are the windows' own. KWin gives every tile a minimum of
    // 15% of the screen (tile.h m_minimumSize = 0.15 x 0.15, inherited by children), which would
    // stop i3 sizes below 384 px on a 2560 px monitor. Splits get no minimum; a window's tile gets
    // the window's minimum size, relative to the screen.
    function prepareTiles(t, screen) {
        if (t.padding !== 0) t.padding = 0;
        var min = { width: 0, height: 0 };
        if (!t.tiles.length && t.windows.length === 1) {
            var ms = t.windows[0].minSize, g = screen.geometry;
            min = { width: ms.width / g.width, height: ms.height / g.height };
        }
        var cur = t.minimumSize;
        if (Math.abs(cur.width - min.width) > 1e-6 || Math.abs(cur.height - min.height) > 1e-6)
            t.minimumSize = min;
        t.tiles.forEach(function (c) { prepareTiles(c, screen); });
    }

    // Setting one tile's relativeGeometry moves its neighbours' shared edges, so a single pass
    // in order can leave a stale edge behind (seen 2026-10-22: four columns, the third left at
    // 0.567 wide over the fourth). Passes repeat until every tile is where it should be.
    function setSizesStable(root, p) {
        for (var pass = 0; pass < 4; pass++)
            if (!setSizes(root, p, { x: 0, y: 0, width: 1, height: 1 })) return;
        log("WARN sizes did not settle after 4 passes");
    }

    // Returns true if anything had to change.
    function setSizes(tile, p, rect) {
        if (p.win !== undefined) return false;
        var changed = false;
        var pos = p.dir === "h" ? rect.x : rect.y;
        for (var i = 0; i < p.kids.length; i++) {
            var k = p.kids[i], child = tile.tiles[i];
            var r = p.dir === "h"
                ? { x: pos, y: rect.y, width: rect.width * k.share, height: rect.height }
                : { x: rect.x, y: pos, width: rect.width, height: rect.height * k.share };
            pos += p.dir === "h" ? r.width : r.height;
            var g = child.relativeGeometry;
            if (Math.abs(g.x - r.x) > 1e-4 || Math.abs(g.y - r.y) > 1e-4 ||
                Math.abs(g.width - r.width) > 1e-4 || Math.abs(g.height - r.height) > 1e-4) {
                child.relativeGeometry = r;
                changed = true;
            }
            if (setSizes(child, k.p, r)) changed = true;
        }
        return changed;
    }

    // Build p's shape under `tile`, which has no children. Returns nothing; windows come after.
    function build(tile, p) {
        if (p.win !== undefined) return;
        var dir = p.dir === "v" ? 2 : 1;
        if (tile.parent) tile.split(dir);          // a leaf becomes a layout with two children
        else { tile.layoutDirection = dir; tile.split(dir); }
        while (tile.tiles.length < p.kids.length) tile.tiles[tile.tiles.length - 1].split(dir);
        for (var i = 0; i < p.kids.length; i++) build(tile.tiles[i], p.kids[i].p);
    }

    function placeWindows(tile, p) {
        if (p.win !== undefined) {
            var w = wins[p.win];
            tile.windows.slice().forEach(function (o) { if (o !== w) unmanageFrom(tile, o); });
            if (tile.windows.indexOf(w) < 0) manageInto(tile, w);
            return;
        }
        for (var i = 0; i < p.kids.length; i++) placeWindows(tile.tiles[i], p.kids[i].p);
    }

    function reconcile(ws) {
        if (!ws || released) return;
        var screen = outputOf(ws);
        var root = workspace.rootTile(screen, deskOf(ws.num));
        if (!root) return;
        var p = project(ws);
        prepareTiles(root, screen);
        var want = shapeOfProjection(p), have = shapeOfTile(root);
        if (want !== have) {
            // Different shape or different windows: rebuild this root. Unmanage first, so removing
            // tiles can't push windows around (KWin moves a removed tile's windows elsewhere).
            tiledWindowsOf(root, []).forEach(function (w) {
                var t = w.tile;
                if (t) unmanageFrom(t, w); else expected[id(w)] = null;
            });
            while (root.tiles.length) root.tiles[root.tiles.length - 1].remove();
            if (p) {
                build(root, p);
                prepareTiles(root, screen);
            }
        }
        if (p) {
            placeWindows(root, p);
            prepareTiles(root, screen);       // now each leaf holds its window: its minimum
            setSizesStable(root, p);
        }
        log("TREE " + ws.num + " " + named(model.describe(ws.num)));
        checkInvariants(ws, root, p);
    }

    // Logged, never thrown: the live tests fail on any "INVARIANT" line.
    function checkInvariants(ws, root, p) {
        var problems = [];
        (function walk(t) {
            if (t.padding !== 0) problems.push("padding " + t.padding);
            if (!t.tiles.length && t.windows.length > 1) problems.push("tile holds " + t.windows.length + " windows");
            if (!t.tiles.length && t.windows.length === 0 && p) problems.push("empty leaf tile");
            if (t.tiles.length) {
                var h = t.layoutDirection !== 2, pos = h ? t.relativeGeometry.x : t.relativeGeometry.y;
                t.tiles.forEach(function (c) {
                    var g = c.relativeGeometry, start = h ? g.x : g.y;
                    if (Math.abs(start - pos) > 1e-3) problems.push("tiles overlap or leave a gap at " + start.toFixed(3));
                    pos = start + (h ? g.width : g.height);
                });
            }
            t.tiles.forEach(walk);
        })(root);
        model.leaves(ws).forEach(function (leaf) {
            var w = wins[leaf.win];
            if (!w || w.minimized) return;
            var t = expected[leaf.win];
            if (!t || t.windows.indexOf(w) < 0) problems.push("window " + w.caption + " not in its tile");
        });
        if (problems.length) log("INVARIANT ws " + ws.num + ": " + problems.join("; "));
    }

    // The model's description with window ids replaced by captions, for the log and the tests.
    function named(text) {
        return text.replace(/\{[0-9a-f-]+\}/g, function (key) {
            return wins[key] ? String(wins[key].caption).replace(/\s+/g, "_") : key;
        });
    }

    // ---- reading sizes back after a border drag ---------------------------------------------

    function readBack(ws) {
        // Each model node's extent is the union of its visible windows' frames; shares follow.
        function extent(c) {
            if (c.win !== null && c.type !== "ws") {
                var w = wins[c.win];
                if (!w || w.minimized) return null;
                var g = w.frameGeometry;
                return { x: g.x, y: g.y, x2: g.x + g.width, y2: g.y + g.height };
            }
            var e = null;
            c.nodes.forEach(function (k) {
                var r = extent(k);
                k._extent = r;
                if (!r) return;
                e = e ? { x: Math.min(e.x, r.x), y: Math.min(e.y, r.y),
                          x2: Math.max(e.x2, r.x2), y2: Math.max(e.y2, r.y2) } : r;
            });
            var vis = c.nodes.filter(function (k) { return k._extent; });
            if (vis.length > 1) {
                var size = function (r) { return c.layout === "h" ? r.x2 - r.x : r.y2 - r.y; };
                var sum = vis.reduce(function (a, k) { return a + size(k._extent); }, 0);
                var hidden = c.nodes.filter(function (k) { return !k._extent; })
                    .reduce(function (a, k) { return a + k.percent; }, 0);
                if (sum > 0) vis.forEach(function (k) { k.percent = (1 - hidden) * size(k._extent) / sum; });
            }
            return e;
        }
        extent(ws);
    }

    // ---- windows ---------------------------------------------------------------------------

    function setFloatingLook(w, on) {
        if (on && !w.keepAbove) { w.keepAbove = true; keptAbove[id(w)] = true; }
        if (!on && keptAbove[id(w)]) { w.keepAbove = false; delete keptAbove[id(w)]; }
    }

    function adoptWindow(w) {
        var key = id(w);
        if (wins[key]) return;
        var kind = Rules.classify(w);
        if (kind === "ignore") return;
        var ws = wsForWindow(w);
        if (!ws) return;
        wins[key] = w;
        if (w.maximizeMode !== 0) w.setMaximize(false, false);
        if (kind === "float") { model.openFloating(key, ws); setFloatingLook(w, true); }
        else model.open(key, ws);
        if (w.fullScreen) model.setFullscreen(key, true);
        connectWindow(w);
        if (w.active) model.focusWin(key);
        log("ADD " + w.caption + " " + kind + " ws " + ws.num);
        schedule(ws);
    }

    function forgetWindow(w) {
        var key = id(w);
        if (!wins[key]) return;
        var con = model.byWin[key];
        var ws = con ? Tree.wsOf(con) : null;
        model.close(key);
        delete wins[key]; delete expected[key]; delete keptAbove[key];
        schedule(ws);
        applyFocus();
    }

    function reclassify(w) {
        var key = id(w), con = model.byWin[key];
        if (!con) { adoptWindow(w); return; }
        var kind = Rules.classify(w);
        if (kind === "ignore") return;
        var floating = con.type === "floating";
        if ((kind === "float") !== floating) {
            model.toggleFloating(con);
            setFloatingLook(w, kind === "float");
            if (kind === "float" && w.tile) unmanageFrom(w.tile, w);
            schedule(Tree.wsOf(model.byWin[key]));
        }
    }

    function connectWindow(w) {
        var key = id(w);
        var dragging = false;
        w.readyForPaintingChanged.connect(guard("ready", function () { reclassify(w); }));
        w.captionChanged.connect(guard("caption", function () { reclassify(w); }));
        w.transientChanged.connect(guard("transient", function () { reclassify(w); }));
        w.windowClassChanged.connect(guard("class", function () { reclassify(w); }));
        w.minimizedChanged.connect(guard("minimized", function () {
            var con = model.byWin[key];
            if (con) schedule(Tree.wsOf(con));
        }));
        w.fullScreenChanged.connect(guard("fullscreen", function () {
            model.setFullscreen(key, w.fullScreen);
            var con = model.byWin[key];
            if (con) schedule(Tree.wsOf(con));
        }));
        w.maximizedChanged.connect(guard("maximized", function () {
            // i3 has no maximize: undo it and keep the window in its tile.
            var con = model.byWin[key];
            if (con && con.type !== "floating" && w.maximizeMode !== 0) {
                w.setMaximize(false, false);
                expected[key] = null;
                schedule(Tree.wsOf(con));
            }
        }));
        w.desktopsChanged.connect(guard("desktops", function () {
            var con = model.byWin[key];
            if (!con) return;
            var from = Tree.wsOf(con), to = wsForWindow(w);
            if (!to || to === from) return;
            // Someone else (the Overview, KWin) moved it: follow, as a move to that workspace.
            var t = expected[key];
            if (t && t.windows.indexOf(w) >= 0) unmanageFrom(t, w);
            model.moveToWorkspace(con, to);
            schedule(from); schedule(to);
        }));
        w.interactiveMoveResizeStarted.connect(guard("dragStart", function () { dragging = w.move ? "move" : "resize"; }));
        w.interactiveMoveResizeFinished.connect(guard("dragEnd", function () {
            var kind = dragging;
            dragging = false;
            var con = model.byWin[key];
            if (!con) return;
            var ws = Tree.wsOf(con);
            if (kind === "resize" && con.type !== "floating") readBack(ws);
            schedule(ws);
        }));
        w.tileChanged.connect(guard("tileChanged", function (tile) {
            if (key in expected) {
                // Ours, possibly arriving late: nothing to do.
                if (expected[key] === tile || (!tile && expected[key] === null)) return;
            }
            var con = model.byWin[key];
            if (!con || con.type === "floating" || w.fullScreen || w.minimized) return;
            if (!tile && dragging === "move") {
                // Dragged out of its tile: it floats where it is dropped (plan, policies).
                model.floatingEnable(con);
                setFloatingLook(w, true);
                expected[key] = null;
            }
            schedule(Tree.wsOf(model.byWin[key]));
        }));
    }

    // ---- focus -----------------------------------------------------------------------------

    function applyFocus() {
        var f = model.focused;
        if (!f || f.win === null) return;
        var w = wins[f.win];
        if (w && workspace.activeWindow !== w) workspace.activeWindow = w;
    }

    function focusedCon() {
        var w = workspace.activeWindow;
        if (w && model.byWin[id(w)]) {
            model.focusWin(id(w));
            return model.byWin[id(w)];
        }
        return model.focused;
    }

    // ---- actions (keys) --------------------------------------------------------------------

    var DIRS = { left: Tree.LEFT, right: Tree.RIGHT, up: Tree.UP, down: Tree.DOWN };

    function act(name, fn) {
        return guard(name, function () {
            var con = focusedCon();
            var before = con ? Tree.wsOf(con) : null;
            fn(con);
            var f = model.focused;
            schedule(before);
            if (f) schedule(Tree.wsOf(f));
            // Every workspace a move can touch is rescheduled; reconcile is idempotent.
            scheduleAll();
            applyFocus();
            log("ACTION " + name);
        });
    }

    var actions = {
        "Split H": function (c) { model.split(c, "h"); },
        "Split V": function (c) { model.split(c, "v"); },
        "Toggle Split": function (c) { model.toggleSplit(c); },
        "Floating Toggle": function (c) {
            if (!c) return;
            var n = model.toggleFloating(c), w = wins[c.win];
            if (n && w) {
                setFloatingLook(w, n.type === "floating");
                if (n.type === "floating" && w.tile) unmanageFrom(w.tile, w);
            }
        },
        "Focus Mode Toggle": function () { model.focusModeToggle(); },
        // i3's resize mode, as direct keys (a script can't have mode-only keys): 10 ppt.
        "Shrink Width": function (c) { model.resize(c, "width", -0.1); },
        "Grow Width": function (c) { model.resize(c, "width", 0.1); },
        "Shrink Height": function (c) { model.resize(c, "height", -0.1); },
        "Grow Height": function (c) { model.resize(c, "height", 0.1); },
    };
    Object.keys(DIRS).forEach(function (d) {
        var cap = d.charAt(0).toUpperCase() + d.slice(1);
        actions["Focus " + cap] = function () { model.focusDir(DIRS[d]); };
        actions["Move " + cap] = function (c) { model.move(c, DIRS[d]); };
    });

    var KEYS = {
        "Split H": ["Meta+H"], "Split V": ["Meta+V"], "Toggle Split": ["Meta+E"],
        "Floating Toggle": ["Meta+Shift+Space"], "Focus Mode Toggle": ["Meta+Space"],
        "Focus Left": ["Meta+Left", "Meta+J"], "Focus Down": ["Meta+Down", "Meta+K"],
        "Focus Up": ["Meta+Up", "Meta+L"], "Focus Right": ["Meta+Right", "Meta+;"],
        "Move Left": ["Meta+Shift+Left", "Meta+Shift+J"], "Move Down": ["Meta+Shift+Down", "Meta+Shift+K"],
        "Move Up": ["Meta+Shift+Up", "Meta+Shift+L"], "Move Right": ["Meta+Shift+Right", "Meta+Shift+;"],
        // The old config's resize mode: Left/J shrink width, Down/K grow height,
        // Up/L shrink height, Right/; grow width.
        "Shrink Width": ["Meta+Ctrl+Left", "Meta+Ctrl+J"], "Grow Height": ["Meta+Ctrl+Down", "Meta+Ctrl+K"],
        "Shrink Height": ["Meta+Ctrl+Up", "Meta+Ctrl+L"], "Grow Width": ["Meta+Ctrl+Right", "Meta+Ctrl+;"],
    };

    function registerKeys() {
        Object.keys(KEYS).forEach(function (name) {
            var fn = act(name, actions[name]);
            KEYS[name].forEach(function (key, i) {
                var action = "kwin-i3 " + name + (i ? " (" + key.split("+").pop() + ")" : "");
                registerShortcut(action, "kwin-i3: " + name.toLowerCase() + (i ? " (" + key + ")" : ""), key, fn);
            });
        });
        registerShortcut("kwin-i3 Release", "kwin-i3: release every window (safety valve)",
                         "Meta+Ctrl+Shift+Q", release);
    }

    // ---- release (the safety valve) --------------------------------------------------------

    function release() {
        if (released) return;
        released = true;
        Object.keys(wins).forEach(function (key) {
            var w = wins[key];
            try {
                if (w.tile) w.tile.unmanage(w);
                if (keptAbove[key]) w.keepAbove = false;
            } catch (e) { /* the window may be gone */ }
        });
        for (var n in model.workspaces) {
            var root = workspace.rootTile(outputOf(model.workspaces[n]), deskOf(Number(n)));
            if (root) while (root.tiles.length) root.tiles[root.tiles.length - 1].remove();
        }
        log("RELEASED");
    }

    // ---- start -----------------------------------------------------------------------------

    // Read a root tile into a tree.adopt() spec; null if it holds nothing of ours.
    function specOf(tile, total) {
        if (!tile.tiles.length) {
            var mine = tile.windows.filter(function (w) { return Rules.classify(w) === "tile"; });
            if (mine.length !== 1) return null;
            return { win: id(mine[0]), percent: total };
        }
        var dir = tile.layoutDirection === 2 ? "v" : "h";
        var kids = [];
        tile.tiles.forEach(function (c) {
            var g = c.relativeGeometry, pg = tile.relativeGeometry;
            var share = dir === "h" ? g.width / (pg.width || 1) : g.height / (pg.height || 1);
            var s = specOf(c, share);
            if (s) kids.push(s);
        });
        if (!kids.length) return null;
        return { layout: dir, percent: total, kids: kids };
    }

    function start() {
        model = Tree.create({ outputNeighbour: function () { return null; } });   // phase 3
        // Windows already in KWin's tiles keep their layout (plan decision 5).
        workspace.screens.forEach(function (s) {
            workspace.desktops.forEach(function (d) {
                var root = workspace.rootTile(s, d);
                var spec = root ? specOf(root, 1) : null;
                if (!spec) return;
                var g = s.geometry, ws = model.ws(deskNum(d), g.height > g.width ? "v" : "h");
                wsOutput[ws.num] = s;
                model.adopt(ws, spec.kids ? spec : { win: spec.win, percent: 1 });
                model.leaves(ws).forEach(function (leaf) {
                    var w = null;
                    workspace.windowList().forEach(function (x) { if (id(x) === leaf.win) w = x; });
                    wins[leaf.win] = w;
                    expected[leaf.win] = w.tile;
                    connectWindow(w);
                });
            });
        });
        // Then every other window, bottom of the stack first, so focus order follows stacking.
        workspace.stackingOrder.forEach(function (w) {
            if (!wins[id(w)]) adoptWindow(w);
            else model.focusWin(id(w));
        });
        if (workspace.activeWindow && wins[id(workspace.activeWindow)]) model.focusWin(id(workspace.activeWindow));
        workspace.windowAdded.connect(guard("windowAdded", adoptWindow));
        workspace.windowRemoved.connect(guard("windowRemoved", forgetWindow));
        workspace.windowActivated.connect(guard("windowActivated", function (w) {
            if (w && wins[id(w)]) model.focusWin(id(w));
        }));
        registerKeys();
        scheduleAll();
        log("kwin-i3 loaded");
    }

    return {
        start: start,
        // for the live tests: the model as text
        describe: function (n) { return model.describe(n); },
    };
})();
