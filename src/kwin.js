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
    var placing = {};       // window id -> true while we move it between desktops/outputs
    var snapW = 1, snapH = 1; // screen size in px, for snapping tile edges (setSizes)
    var rootPadding = {};   // "screen/ws" -> the root's padding before we set it (restored on release)
    var focusPending = null; // { from: screen } : apply model focus after the next reconcile

    function id(w) { return String(w.internalId); }

    function guard(name, fn) {
        return function () {
            if (released) return;
            try { return fn.apply(null, arguments); }
            catch (e) { log("ERROR in " + name + ": " + e + (e.stack ? " " + e.stack : "")); retrySoon(); }
        };
    }

    // After an error: reconcile everything again 250 ms later, at most 3 times in a row; then wait
    // for the next real event. Retrying at once used to re-arm a 0 ms timer for ever, spinning
    // KWin's main thread on a repeating error (code review, 2026-10-22).
    var failures = 0, retryTimer = null;
    function retrySoon() {
        failures++;
        if (failures > 3) {
            if (failures === 4) log("WARN giving up after 3 errors in a row; next try on the next event");
            return;
        }
        if (!retryTimer) {
            retryTimer = new QTimer();
            retryTimer.singleShot = true;
            retryTimer.interval = 250;
            retryTimer.timeout.connect(function () { if (!released) scheduleAll(); });
        }
        retryTimer.start();
    }

    // ---- workspaces ------------------------------------------------------------------------

    function deskNum(desktop) { return Workspaces.deskNum(desktop); }
    function deskOf(num) { return Workspaces.deskOf(num); }
    function outputOf(ws) { return Workspaces.outputOf(ws.num); }

    // The model's workspace num, created with i3's orientation for the monitor it lives on.
    function wsModel(num) {
        var g = Workspaces.outputOf(num).geometry;
        return model.ws(num, g.height > g.width ? "v" : "h");
    }

    function wsForWindow(w) {
        if (w.desktops.length !== 1) return null;
        var num = deskNum(w.desktops[0]);
        if (num < 1) return null;
        if (!Workspaces.hasHome(num)) Workspaces.setHome(num, w.output);
        return wsModel(num);
    }

    // i3's "visible workspace on the output next to this one" (move_to_output_directed, focus).
    function outputNeighbour(ws, dir) {
        var t = Workspaces.screenToward(outputOf(ws), dir);
        if (!t) return null;
        var num = deskNum(workspace.currentDesktopForScreen(t));
        if (!Workspaces.hasHome(num)) Workspaces.setHome(num, t);
        return wsModel(num);
    }

    function invoke(action) {
        callDBus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
                 "invokeShortcut", action);
    }

    // ---- scheduling ------------------------------------------------------------------------

    function kick() {
        if (!timer) {
            timer = new QTimer();
            timer.singleShot = true;
            timer.interval = 0;
            timer.timeout.connect(guard("flush", flush));
        }
        if (!timer.active) timer.start();
    }
    function schedule(ws) {
        if (!ws) return;
        dirty[ws.num] = true;
        kick();
    }
    function scheduleAll() { for (var n in model.workspaces) schedule(model.workspaces[n]); }

    function flush() {
        var nums = Object.keys(dirty), ok = true;
        dirty = {};
        // Each workspace on its own: one that fails can't stop the others.
        nums.forEach(function (n) {
            try { reconcile(model.workspaces[n]); }
            catch (e) { ok = false; log("ERROR in reconcile " + n + ": " + e + (e.stack ? " " + e.stack : "")); }
        });
        if (ok) failures = 0; else retrySoon();
        // Focus last, once windows are where they belong: a pointer warped earlier would land
        // on the old place (i3ws learned this, 2026-10-21).
        if (focusPending) { var fp = focusPending; focusPending = null; applyFocus(fp.from); }
        rememberShown();
    }
    function wantFocus() {
        if (!focusPending) focusPending = { from: workspace.activeScreen };
        kick();
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

    var refused = false;    // set when KWin refused a manage() during this reconcile

    // Returns KWin's answer: manage() refuses a window that isn't resizeable or isn't on the
    // tile's desktop. A refused window floats instead of leaving a hole (code review).
    function manageInto(tile, w) {
        expected[id(w)] = tile;
        if (tile.manage(w)) return true;
        expected[id(w)] = null;
        floatWindow(w, "KWin refused to tile it");
        refused = true;
        return false;
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
    // noMin: minimums cleared, for while setSizes moves edges one by one: a tile minimum blocks
    // KWin's in-between steps and the sizes never settle (seen 2026-10-22: 280|680|500 asked
    // 280|500|500, the last window off the screen).
    function prepareTiles(t, screen, noMin) {
        if (t.padding !== 0) t.padding = 0;
        var min = { width: 0, height: 0 };
        if (!noMin && !t.tiles.length && t.windows.length === 1) {
            var fm = frameMin(t.windows[0]), g = screen.geometry;
            min = { width: fm.w / g.width, height: fm.h / g.height };
        }
        var cur = t.minimumSize;
        if (Math.abs(cur.width - min.width) > 1e-6 || Math.abs(cur.height - min.height) > 1e-6)
            t.minimumSize = min;
        t.tiles.forEach(function (c) { prepareTiles(c, screen, noMin); });
    }

    // Setting one tile's relativeGeometry moves its neighbours' shared edges, so a single pass
    // in order can leave a stale edge behind (seen 2026-10-22: four columns, the third left at
    // 0.567 wide over the fourth). Passes repeat until every tile is where it should be.
    function setSizesStable(root, p, screen) {
        var g = screen.geometry;
        snapW = g.width; snapH = g.height;
        for (var pass = 0; pass < 4; pass++)
            if (!setSizes(root, p, { x: 0, y: 0, width: 1, height: 1 })) return;
        log("WARN sizes did not settle after 4 passes");
    }

    // A window's minimum as a frame: apps report it for their content, and the frame adds the
    // decoration (Paul's i3frame: 1 px each side). KeePassXC, minimum 800, needs an 802 px tile
    // or KWin leaves it where it was (2026-10-22). The headless tests have no decorations.
    function frameMin(w) {
        var m = w.minSize, f = w.frameGeometry, c = w.clientGeometry;
        var bw = c ? Math.max(0, f.width - c.width) : 0, bh = c ? Math.max(0, f.height - c.height) : 0;
        return { w: m.width + bw, h: m.height + bh };
    }

    // The smallest a projected subtree can be, in pixels: windows' minimum sizes added up along a
    // split and the largest across it.
    function minOf(p) {
        if (p.win !== undefined) return frameMin(wins[p.win]);
        var r = { w: 0, h: 0 };
        p.kids.forEach(function (k) {
            var m = minOf(k.p);
            if (p.dir === "h") { r.w += m.w; r.h = Math.max(r.h, m.h); }
            else { r.h += m.h; r.w = Math.max(r.w, m.w); }
        });
        return r;
    }

    // i3's shares, but no child below its minimum: the shortfall comes from children with room
    // to spare, in proportion to that room. Display only: the model keeps i3's shares. (Paul's
    // desktop, 2026-10-22: KeePassXC, minimum 800 px, got a 640 px quarter and hung 162 px onto
    // the other monitor. Minimums that can't fit at all are floatWhatCannotFit's job.)
    function fitMinimums(want, mins, total) {
        var sumMin = mins.reduce(function (a, b) { return a + b; }, 0);
        if (sumMin > total) return want;
        var out = want.slice(), locked = out.map(function () { return false; });
        for (var round = 0; round < out.length; round++) {
            var deficit = 0;
            out.forEach(function (v, i) { if (!locked[i] && v < mins[i]) { deficit += mins[i] - v; out[i] = mins[i]; locked[i] = true; } });
            if (deficit <= 0) break;
            var slack = 0;
            out.forEach(function (v, i) { if (!locked[i]) slack += v - mins[i]; });
            if (slack <= 0) break;
            out.forEach(function (v, i) { if (!locked[i]) out[i] = v - deficit * (v - mins[i]) / slack; });
        }
        return out;
    }

    // Every tile edge on a whole pixel of the screen, so neighbours share an exact edge: KWin
    // rounds a window's position and width separately, and thirds of 2560 px (853.33) left a
    // 1 px hole the wallpaper showed through (Paul's desktop, 2026-10-22).
    function snap(v, n) { return Math.round(v * n) / n; }

    // Returns true if anything had to change.
    function setSizes(tile, p, rect) {
        if (p.win !== undefined) return false;
        var changed = false, h = p.dir === "h", n = h ? snapW : snapH;
        var start = h ? rect.x : rect.y, size = h ? rect.width : rect.height, pos = start;
        var px = fitMinimums(
            p.kids.map(function (k) { return k.share * size * n; }),
            p.kids.map(function (k) { var m = minOf(k.p); return h ? m.w : m.h; }),
            size * n);
        for (var i = 0; i < p.kids.length; i++) {
            var k = p.kids[i], child = tile.tiles[i];
            var a = snap(pos, n);
            pos += px[i] / n;
            var b = i === p.kids.length - 1 ? snap(start + size, n) : snap(pos, n);
            var r = h ? { x: a, y: rect.y, width: b - a, height: rect.height }
                      : { x: rect.x, y: a, width: rect.width, height: b - a };
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
        for (var n = 0; tile.tiles.length < p.kids.length; n++) {
            if (n > 64) throw new Error("build: KWin would not split a tile");   // never spin
            tile.tiles[tile.tiles.length - 1].split(dir);
        }
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

    var selftestBroken = false;   // debug only: every reconcile throws (tests the backoff)
    function reconcile(ws) {
        if (!ws || released) return;
        if (selftestBroken) throw new Error("selftest reconcile");
        var screen = outputOf(ws);
        var root = workspace.rootTile(screen, deskOf(ws.num));
        if (!root) return;
        var rk = screen.name + "/" + ws.num;
        if (!(rk in rootPadding)) rootPadding[rk] = root.padding;
        relocate(ws, screen);
        floatWhatCannotFit(ws, screen);
        var p = project(ws);
        refused = false;
        prepareTiles(root, screen);
        var want = shapeOfProjection(p), have = shapeOfTile(root);
        if (want !== have) {
            // Different shape or different windows: rebuild this root. Unmanage first, so removing
            // tiles can't push windows around (KWin moves a removed tile's windows elsewhere).
            tiledWindowsOf(root, []).forEach(function (w) {
                var t = w.tile;
                if (t) unmanageFrom(t, w); else expected[id(w)] = null;
            });
            clearRoot(root);
            if (p) {
                build(root, p);
                prepareTiles(root, screen);
            }
        }
        if (p) {
            placeWindows(root, p);
            prepareTiles(root, screen, true);   // sizes first, with no tile minimums in the way
            setSizesStable(root, p, screen);
            prepareTiles(root, screen);         // then each leaf gets its window's minimum
        }
        log("TREE " + ws.num + " " + named(model.describe(ws.num)));
        if (refused) schedule(ws);          // the projection changed under us: one more pass
        else checkInvariants(ws, root, p);
    }


    function clearRoot(root) {
        for (var n = 0; root.tiles.length; n++) {
            if (n > 256) throw new Error("clearRoot: tiles would not go away");
            root.tiles[root.tiles.length - 1].remove();
        }
    }

    function floatWindow(w, why) {
        var con = model.byWin[id(w)];
        if (!con || con.type === "floating") return;
        if (w.tile) unmanageFrom(w.tile, w);
        model.floatingEnable(con);
        setFloatingLook(w, true);
        log("FLOAT " + w.caption + ": " + why);
    }

    // The plan's rule "a window that can't fit floats" (code review: a window with a 900 px
    // minimum hung 580 px off a 1280 px screen; a row of 12 windows broke KWin's sizing). While
    // the tiled windows' minimum sizes can't fit the screen, float the one with the largest
    // minimum along the axis that overflows.
    function floatWhatCannotFit(ws, screen) {
        var g = screen.geometry;
        for (var n = 0; n < 32; n++) {
            var p = project(ws);
            if (!p) return;
            var need = minOf(p);
            var axis = need.w > g.width ? "w" : need.h > g.height ? "h" : null;
            if (!axis) return;
            var worst = null, worstMin = -1;
            model.leaves(ws).forEach(function (leaf) {
                var w = wins[leaf.win];
                if (!w || w.minimized) return;
                var fm = frameMin(w), m = axis === "w" ? fm.w : fm.h;
                if (m >= worstMin) { worstMin = m; worst = w; }   // ties: the later one in the tree
            });
            if (!worst) return;
            floatWindow(worst, "its minimum size can't fit beside the others");
        }
    }

    // Put every window of the workspace on its desktop and monitor: after Meta+Shift+N, a move
    // across monitors, or a monitor coming back. Our own moves are flagged so the handlers
    // below don't mistake them for someone else's.
    function relocate(ws, screen) {
        var desk = deskOf(ws.num);
        model.leaves(ws).concat(ws.floating).forEach(function (c) {
            var w = wins[c.win];
            if (!w) return;
            if (w.output === screen && w.desktops.length === 1 && w.desktops[0] === desk) return;
            var key = id(w);
            if (w.tile) unmanageFrom(w.tile, w);
            placing[key] = true;
            try {
                if (w.output !== screen) workspace.sendClientToScreen(w, screen);
                w.desktops = [desk];      // after the screen: KWin gives a moved window that screen's desktop
            } finally { delete placing[key]; }
        });
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
                var g = w.tile ? w.tile.absoluteGeometry : w.frameGeometry;   // tiles: no size-step slack
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
        // Ignored now, perhaps not later (class, transient or desktops set after it appears):
        // watch it, so reclassify can adopt it then (code review).
        if (kind === "ignore") { if (w.normalWindow && !w.deleted) connectWindow(w); return; }
        var ws = wsForWindow(w);
        if (!ws) { connectWindow(w); return; }
        wins[key] = w;
        if (!w.fullScreen && w.maximizeMode !== 0) w.setMaximize(false, false);
        if (kind === "float") { model.openFloating(key, ws); setFloatingLook(w, true); }
        else model.open(key, ws);
        if (w.fullScreen) model.setFullscreen(key, true);
        connectWindow(w);
        if (w.active) model.focusWin(key);
        log("ADD " + w.caption + " " + kind + " ws " + ws.num);
        schedule(ws);
    }

    // No longer ours: closed, made sticky, or now on the ignore list.
    function dropWindow(w) {
        var key = id(w);
        if (!wins[key]) return;
        var con = model.byWin[key];
        var ws = con ? Tree.wsOf(con) : null;
        try { if (!w.deleted && w.tile) unmanageFrom(w.tile, w); } catch (e) { /* gone */ }
        if (!w.deleted) setFloatingLook(w, false);
        model.close(key);
        delete wins[key]; delete expected[key]; delete keptAbove[key]; delete placing[key];
        schedule(ws);
    }
    // Closed: drop it, and focus goes where the model says (a window made sticky or ignored is
    // still on screen and probably in use, so dropWindow alone doesn't move focus).
    function forgetWindow(w) { dropWindow(w); wantFocus(); }

    function reclassify(w) {
        var key = id(w), con = model.byWin[key];
        if (!con) { adoptWindow(w); return; }
        var kind = Rules.classify(w);
        if (kind === "ignore") { dropWindow(w); return; }
        var floating = con.type === "floating";
        if ((kind === "float") !== floating) {
            model.toggleFloating(con);
            setFloatingLook(w, kind === "float");
            if (kind === "float" && w.tile) unmanageFrom(w.tile, w);
            schedule(Tree.wsOf(model.byWin[key]));
        }
    }

    var connected = {};     // window id -> true once its signals are connected (once only)

    function connectWindow(w) {
        var key = id(w);
        if (connected[key]) return;
        connected[key] = true;
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
        // Maximize (i3 has none) needs no handler of its own: it drops the window out of its
        // tile, the foreign-untile path below re-tiles it, and KWin's Tile::manage clears the
        // maximize. A separate handler doing the same was found redundant by the fault battery
        // (2026-10-22): with two paths, removing either changed nothing, so neither was tested.
        w.desktopsChanged.connect(guard("desktops", function () {
            var con = model.byWin[key];
            if (!con) { if (w.desktops.length === 1) adoptWindow(w); return; }
            if (w.desktops.length !== 1) {
                // Now on all desktops (sticky): no longer ours, as if it had never been (rules).
                dropWindow(w);
                return;
            }
            if (placing[key] || dragging) return;   // ours, or settled when the drag ends
            var from = Tree.wsOf(con), to = wsForWindow(w);
            if (!to || to === from) return;
            // Someone else (the Overview, KWin) moved it: follow, as a move to that workspace.
            var t = expected[key];
            if (t && t.windows.indexOf(w) >= 0) unmanageFrom(t, w);
            model.moveToWorkspace(con, to);
            schedule(from); schedule(to);
        }));
        w.interactiveMoveResizeStarted.connect(guard("dragStart", function () {
            dragging = w.move ? "move" : "resize";
            log("DRAG start " + dragging + " " + w.caption);
        }));
        w.interactiveMoveResizeFinished.connect(guard("dragEnd", function () {
            var kind = dragging;
            dragging = false;
            log("DRAG end " + kind + " " + w.caption);
            var con = model.byWin[key];
            if (!con) return;
            var ws = Tree.wsOf(con);
            if (kind === "resize" && con.type !== "floating") readBack(ws);
            if (kind === "move" && w.output !== outputOf(ws)) {
                // Dropped on another monitor: it joins the workspace shown there (as i3ws did).
                var to = wsModel(deskNum(workspace.currentDesktopForScreen(w.output)));
                model.moveToWorkspace(con, to);
                schedule(to);
            }
            schedule(ws);
        }));
        // No outputChanged handler, on purpose. When a monitor goes or comes back, screensChanged
        // re-places every window from the model (decision 10); when KWin moves a window to another
        // monitor for any other reason, it also changes its desktop, and desktopsChanged above
        // follows it, as i3ws did. A handler here was redundant: the fault battery could not tell
        // it from nothing (2026-10-22).
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

    // Make KWin show what the model has focused: its workspace on its monitor, the window
    // active; and the pointer follows when focus changed monitor (i3's mouse_warping output).
    function applyFocus(from) {
        var f = model.focused;
        if (!f) return;
        var ws = f.type === "ws" ? f : Tree.wsOf(f), s = outputOf(ws), desk = deskOf(ws.num);
        if (workspace.currentDesktopForScreen(s) !== desk) workspace.setCurrentDesktopForScreen(desk, s);
        if (f.type === "ws" || f.win === null) {
            if (workspace.activeScreen !== s) {
                invoke("Switch to Screen " + workspace.screens.indexOf(s));
                if (from && from !== s) invoke("MoveMouseToCenter");
            }
            return;
        }
        var w = wins[f.win];
        if (!w) return;
        if (workspace.activeWindow !== w) workspace.activeWindow = w;
        if (from && from !== s) invoke("MoveMouseToFocus");
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
            if (f) schedule(f.type === "ws" ? f : Tree.wsOf(f));
            // Every workspace a move can touch is rescheduled; reconcile is idempotent.
            scheduleAll();
            wantFocus();
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

    // Meta+N: show workspace N where it lives and focus it; an empty, hidden one opens on the
    // current monitor (i3ws gotoWorkspace).
    function gotoWorkspace(n) {
        if (!deskOf(n)) return;
        if (!Workspaces.showing(n)) {
            var m = model.workspaces[n];
            var occupied = m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(n);
            var s = occupied ? Workspaces.outputOf(n) : workspace.activeScreen;
            // An occupied workspace keeps its home even while that monitor is away, or it would
            // never go back (code review: reproduced with Meta+2 during an unplug).
            if (!occupied) Workspaces.setHome(n, s);
            workspace.setCurrentDesktopForScreen(deskOf(n), s);
        }
        var ws = wsModel(n);
        model.activate(model.descendFocused(ws));
    }

    // Meta+Shift+N: send the window to workspace N, on N's monitor (i3ws moveToWorkspace); an
    // empty, hidden N comes to the window's monitor.
    function moveToWorkspace(n, con) {
        if (!con || !deskOf(n)) return;
        if (!Workspaces.showing(n)) {
            var m = model.workspaces[n];
            var occupied = m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(n);
            if (!occupied) Workspaces.setHome(n, outputOf(Tree.wsOf(con)));
        }
        model.moveToWorkspace(con, wsModel(n));
    }

    var NAMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    var SHIFTED = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];

    var KEYS = {
        "Split H": ["Meta+H"], "Split V": ["Meta+V"], "Toggle Split": ["Meta+E"],
        "Floating Toggle": ["Meta+Shift+Space"], "Focus Mode Toggle": ["Meta+Space"],
        "Focus Left": ["Meta+Left", "Meta+J"], "Focus Down": ["Meta+Down", "Meta+K"],
        "Focus Up": ["Meta+Up", "Meta+L"], "Focus Right": ["Meta+Right", "Meta+;"],
        "Move Left": ["Meta+Shift+Left", "Meta+Shift+J"], "Move Down": ["Meta+Shift+Down", "Meta+Shift+K"],
        "Move Up": ["Meta+Shift+Up", "Meta+Shift+L"],
        // Shift+; arrives as ":" on a US keyboard; i3ws registered both (input-test review).
        "Move Right": ["Meta+Shift+Right", "Meta+Shift+;", "Meta+:"],
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
        NAMES.forEach(function (k, i) {
            var n = i + 1;
            var go = act("Workspace " + n, function () { gotoWorkspace(n); });
            var mv = act("Move to Workspace " + n, function (c) { moveToWorkspace(n, c); });
            registerShortcut("kwin-i3 Workspace " + n, "kwin-i3: workspace " + n, "Meta+" + k, go);
            registerShortcut("kwin-i3 Move to Workspace " + n, "kwin-i3: move to workspace " + n, "Meta+Shift+" + k, mv);
            registerShortcut("kwin-i3 Move to Workspace " + n + " (symbol)",
                             "kwin-i3: move to workspace " + n + " (Shift+digit as symbol)", "Meta+" + SHIFTED[i], mv);
        });
        // Only with debug logging (the live tests): an action that throws, to prove the guard
        // logs it and kwin-i3 carries on. No key; never registered in normal use.
        if (DEBUG_LOG) {
            registerShortcut("kwin-i3 Selftest Throw", "kwin-i3: self-test (throws)", "",
                             act("Selftest Throw", function () { throw new Error("selftest"); }));
            registerShortcut("kwin-i3 Selftest Break Reconcile", "kwin-i3: self-test (reconcile throws)", "",
                             function () { selftestBroken = !selftestBroken; scheduleAll(); });
        }
    }

    // ---- release (the safety valve) --------------------------------------------------------

    // Every step on its own: the safety valve must never stop half-way (code review).
    function release() {
        if (released) return;
        released = true;
        Object.keys(wins).forEach(function (key) {
            var w = wins[key];
            try {
                if (w.tile) w.tile.unmanage(w);
                if (keptAbove[key]) w.keepAbove = false;
            } catch (e) { log("ERROR in release (window): " + e); }
        });
        workspace.screens.forEach(function (s) {
            workspace.desktops.forEach(function (d, i) {
                try {
                    var root = workspace.rootTile(s, d), rk = s.name + "/" + (i + 1);
                    if (!root || !(rk in rootPadding)) return;     // only roots kwin-i3 touched
                    var stray = tiledWindowsOf(root, []);
                    stray.forEach(function (w) { root.unmanage(w); });
                    for (var n = 0; root.tiles.length && n < 256; n++) root.tiles[root.tiles.length - 1].remove();
                    root.padding = rootPadding[rk];
                } catch (e) { log("ERROR in release (tiles): " + e); }
            });
        });
        log("RELEASED");
        log("ACTION Release");
    }

    // ---- start -----------------------------------------------------------------------------

    // Read a root tile into a tree.adopt() spec; null if it holds nothing of ours.
    function specOf(tile, total, desk) {
        if (!tile.tiles.length) {
            // Only windows that really are on this desktop: KWin can leave a window in a tile
            // after its desktop changed (spike); those go through adoptWindow instead (review).
            var mine = tile.windows.filter(function (w) {
                return Rules.classify(w) === "tile" && w.desktops.length === 1 && w.desktops[0] === desk;
            });
            if (mine.length !== 1) return null;
            return { win: id(mine[0]), percent: total };
        }
        var dir = tile.layoutDirection === 2 ? "v" : "h";
        var kids = [];
        tile.tiles.forEach(function (c) {
            var g = c.relativeGeometry, pg = tile.relativeGeometry;
            var share = dir === "h" ? g.width / (pg.width || 1) : g.height / (pg.height || 1);
            var s = specOf(c, share, desk);
            if (s) kids.push(s);
        });
        if (!kids.length) return null;
        return { layout: dir, percent: total, kids: kids };
    }

    function start() {
        model = Tree.create({ outputNeighbour: outputNeighbour });
        // The safety valve first, so it exists whatever happens below (code review).
        registerShortcut("kwin-i3 Release", "kwin-i3: release every window (safety valve)",
                         "Meta+Ctrl+Shift+Q", release);
        try { startRest(); }
        catch (e) { log("ERROR in start: " + e + (e.stack ? " " + e.stack : "") + "; releasing"); release(); }
    }

    function startRest() {
        // A login (no windows yet): number the monitors as i3 did. A reload: leave them alone.
        var login = workspace.windowList().filter(function (w) { return w.normalWindow; }).length === 0;
        if (login) Workspaces.numberScreens();
        // Windows already in KWin's tiles keep their layout (plan decision 5).
        workspace.screens.forEach(function (s) {
            workspace.desktops.forEach(function (d) {
                var root = workspace.rootTile(s, d);
                var spec = root ? specOf(root, 1, d) : null;
                if (!spec) return;
                Workspaces.setHome(deskNum(d), s);
                var ws = wsModel(deskNum(d));
                model.adopt(ws, spec.kids ? spec : { win: spec.win, percent: 1 });
                model.leaves(ws).forEach(function (leaf) {
                    var w = null;
                    workspace.windowList().forEach(function (x) { if (id(x) === leaf.win) w = x; });
                    if (!w) { model.close(leaf.win); return; }
                    wins[leaf.win] = w;
                    expected[leaf.win] = w.tile;
                    if (w.fullScreen) model.setFullscreen(leaf.win, true);
                    connectWindow(w);
                });
            });
        });
        // Then every other window, bottom of the stack first, so focus order follows stacking.
        // stackingOrder can leave out a window that is still mapping, which then never got a
        // windowAdded either (it came before the script): windowList() supplies those (found by
        // 60-load.sh, after the live-desktop review saw a window left out).
        var all = workspace.stackingOrder.slice();
        workspace.windowList().forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); });
        all.forEach(function (w) {
            if (!wins[id(w)]) adoptWindow(w);
            else model.focusWin(id(w));
        });
        if (workspace.activeWindow && wins[id(workspace.activeWindow)]) model.focusWin(id(workspace.activeWindow));
        workspace.windowAdded.connect(guard("windowAdded", adoptWindow));
        workspace.windowRemoved.connect(guard("windowRemoved", forgetWindow));
        workspace.windowActivated.connect(guard("windowActivated", function (w) {
            if (w && wins[id(w)]) model.focusWin(id(w));
        }));
        workspace.screensChanged.connect(guard("screens", screensChanged));
        // At login Plasma's activity service connects after scripts load and KWin then restores
        // the desktop each screen showed at logout; number the screens again on that first
        // activity event, once (from i3ws, seen in the log 2026-10-21). Connected even when this
        // load didn't look like a login (a session-restored window can exist already, review);
        // with one activity it never fires mid-session.
        var renumbered = false;
        workspace.currentActivityChanged.connect(guard("activity", function () {
            if (renumbered) return;
            renumbered = true;
            Workspaces.numberScreens();
            model.activate(model.descendFocused(wsModel(1)));
            scheduleAll();
            wantFocus();
        }));
        registerKeys();
        scheduleAll();
        rememberShown();
        log("kwin-i3 loaded");
    }

    // What each monitor showed, by name, so a monitor that comes back shows it again (review:
    // nothing made a returning monitor show its workspace; KWin may restore something else).
    var lastShown = {}, beforeLoss = null;
    function rememberShown() {
        workspace.screens.forEach(function (s) { lastShown[s.name] = deskNum(workspace.currentDesktopForScreen(s)); });
    }
    function screensChanged() {
        var names = workspace.screens.map(function (s) { return s.name; });
        var lost = Object.keys(lastShown).filter(function (n) { return names.indexOf(n) < 0; });
        if (lost.length && !beforeLoss) beforeLoss = JSON.parse(JSON.stringify(lastShown));
        if (beforeLoss) {
            var allBack = Object.keys(beforeLoss).every(function (n) { return names.indexOf(n) >= 0; });
            if (allBack) {
                // Everyone is home: each monitor shows again what it showed before the loss.
                workspace.screens.forEach(function (s) {
                    var num = beforeLoss[s.name];
                    if (num && deskOf(num)) workspace.setCurrentDesktopForScreen(deskOf(num), s);
                });
                beforeLoss = null;
            }
        }
        lastShown = {};
        rememberShown();
        scheduleAll();
        wantFocus();
    }
    return {
        start: start,
        // for the live tests: the model as text
        describe: function (n) { return model.describe(n); },
    };
})();
