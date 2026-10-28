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
    // The frame (docs/spec-window-modes.md): with kwini3hold loaded, tiled windows have no
    // decoration and the effect draws i3's frame in the tiles' padding. frameOn is what the
    // effect last said (asked at load and on every reconfigure; the effect asks for a
    // reconfigure when it loads or goes). tookBorder: the windows whose border kwin-i3 took.
    var frameOn = false, tookBorder = {};
    var borderGone = {};                             // window id -> its GTK 4 bounds (refitOnFrameChange)
    var HAIR = 1e-6;                                 // the root's inset at no gaps (rootRect)
    // The floating mark (spec-window-modes decision 5c): with the effect, it keeps the set of
    // floating windows (told[key]: what it was last told), which outlives a reload of this
    // script; at load the answer says which windows were floating (atLoadFloating).
    var told = {}, atLoadFloating = {};
    var marks = false;              // the effect answers with its floating set (an older one doesn't)
    var deskIds = [], rebuilding = false;   // the desktops' ids, and a rebuild under way (desktopListChanged)
    var rebuildAgain = false, rebuiltFor = "";
    // What each monitor showed, by name: which outputs kwin-i3 knows (screensChanged tells the
    // lost and the new ones from it) and the switches since (rememberShown).
    var lastShown = {};
    // Per monitor, the workspaces it showed, most recent first (i3's focus stack of an output's
    // workspaces), for the monitor a workspace leaves (Move Workspace to Output).
    var shownBefore = {};
    var NAMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];    // the workspace keys, Meta+1..0
    // >0 while kwin-i3 itself changes what a monitor shows (showOn, an activation that may switch
    // a desktop): currentDesktopChanged tells those from switches made outside it (the Overview,
    // Plasma), which kwin-i3's focus follows (shownOutside; docs/spec-windows-placing-themselves.md).
    var switching = 0;
    function showOn(desk, s) {
        switching++;
        try { workspace.setCurrentDesktopForScreen(desk, s); } finally { switching--; }
    }
    // Desktop switches made outside kwin-i3, recorded as they come and handled a turn later
    // (docs/spec-redo-1-new-windows.md, B and D): KWin emits windowAdded in the same call as the
    // activation that switched an output to the new window's desktop (workspace.cpp
    // addWaylandWindow), so adoptWindow runs first and claims that switch (Placement.claim); what
    // is left is i3's `workspace N` on that output (shownOutside).
    var pendingShown = [], pendingTimer = false;    // [{ output: name, previous: num or 0, current: num }]
    // The helper's tiling drag (docs/spec-tiled-look.md B; startDrag below).
    var DRAG = ["org.kde.KWin", "/kwini3drag", "net.local.kwini3drag"];
    var drag = null;        // { con, timer, busy, plan, rect }: a drag being followed
    // i3's resize mode (docs/spec-redo-5-keys.md A): the helper owns the state and tells kwin-i3
    // through the hidden action Mode Changed, then Mode(); asked once at load, so a reload of this
    // script can't lose step. While it is on, every key of kwin-i3's does nothing but the four
    // resize actions the mode itself runs (i3: only the mode's bindings are active).
    var MODE = ["org.kde.KWin", "/kwini3mode", "net.local.kwini3mode"];
    var mode = "";
    var MODE_ACTIONS = { "Shrink Width": true, "Grow Width": true, "Shrink Height": true, "Grow Height": true, "Resize Mode": true };

    // Newcomers the effect hides until kwin-i3 has moved them (holdNew): window id -> true.
    var holdNamed = {};
    // A window outside the tree that is closing (its `closed` signal, before windowRemoved): KWin's
    // activation in between is its own next choice, not the user's (windowActivated).
    var closingOutside = null;
    var ruleRan = {};       // window id -> { rule index: true }: the forWindow rules already run on it (Rules.classify, X2)
    var dirty = {};         // ws num -> true, waiting for the coalesced reconcile
    var timer = null;
    var released = false;
    var placing = {};       // window id -> true while we move it between desktops/outputs
    var snapW = 1, snapH = 1; // screen size in px, for snapping tile edges (setSizes)
    var touchedRoots = {};  // "screen/desktop id" -> true once reconciled (put back on release)
    // Apply model focus after the next reconcile; from: the monitor a key action moved focus
    // from, so the pointer follows to the new one (i3 warps only from commands: x_set_warp_to in
    // _tree_next and workspace_show). Any other pass (a window closed, settings, monitors) moves
    // no pointer: a panel popup closing on the other monitor sent it to the focused window
    // although focus never moved (Paul, 2026-10-25; tests/live/72-pointer-stays.sh).
    var focusPending = null; // { byKey: a key asked (wantFocus), checked: KWin said Show Desktop is off (applyFocus) }

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

    // The model's workspace num, created with i3's default_orientation: "auto" is horizontal
    // unless the monitor it lives on is taller than wide. Only at creation, as i3: a changed
    // setting leaves existing workspaces as they are.
    function wsModel(num) {
        var o = Settings.get("defaultOrientation"), g = Workspaces.outputOf(num).geometry;
        return model.ws(num, o === "horizontal" ? "h" : o === "vertical" ? "v" : g.height > g.width ? "v" : "h");
    }

    function wsForWindow(w) {
        if (w.desktops.length !== 1) return null;
        var num = deskNum(w.desktops[0]);
        if (num < 1) return null;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, w.output);
        return wsModel(num);
    }

    // i3's "visible workspace on the output next to this one" (move_to_output_directed, focus).
    function outputNeighbour(ws, dir) {
        var t = Workspaces.screenToward(outputOf(ws), dir);
        if (!t) return null;
        var num = deskNum(workspace.currentDesktopForScreen(t));
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, t);
        return wsModel(num);
    }

    function invoke(action) {
        callDBus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
                 "invokeShortcut", action);
    }

    // ---- scheduling ------------------------------------------------------------------------

    // A one-off timer, kept in `timers` until it fires: a QTimer held only by a local could be
    // collected first (review of the change, finding 4).
    var timers = {}, timerSeq = 0;
    function later(ms, fn) {
        var n = ++timerSeq, tm = new QTimer();
        timers[n] = tm;
        tm.singleShot = true;
        tm.interval = ms;
        tm.timeout.connect(guard("later", function () { delete timers[n]; fn(); }));
        tm.start();
    }
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
        if (rebuilding) return;         // the model is being rebuilt (desktopListChanged)
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
        if (focusPending) { var fp = focusPending; focusPending = null; applyFocus(fp.byKey, fp.checked); }
        showHeld();
        rememberShown();
    }
    // byKey: a key or an outside desktop switch asked for this pass (i3's callers of x_set_warp_to):
    // it takes the focus from an open window kwin-i3 doesn't manage and may warp the pointer; a
    // passive pass (a close, a reload, a monitor change, the pointer's crossing) does neither.
    function wantFocus(byKey) {
        if (!focusPending) focusPending = { byKey: !!byKey };
        else if (byKey) focusPending.byKey = true;
        kick();
    }

    // ---- projection: model -> the shape KWin's tiles can hold --------------------------------
    // KWin collapses one-child layouts and cannot nest a layout in one of the same direction
    // (split() then adds a sibling). So: drop one-child splits, merge same-direction nesting into
    // the parent with shares multiplied through, skip minimized windows. Geometry is unchanged.

    // In the layout: not minimized, and not a fullscreen window that is out of the tiles. KWin
    // refuses to tile a fullscreen window (Tile::manage: not resizable). One dragged to the
    // other monitor arrives without a tile (fuzzer I9); one that had a tile loses it when the
    // tiles are rebuilt for a newcomer, and the refusal then floated it, monitor-sized, over
    // everything opened after (Paul's capture, 2026-10-23 23:25; docs/spec-fullscreen-tree.md).
    // Both stay in the tree and join the layout when fullscreen ends. w.tile is KWin's
    // *requested* tile (window.h: READ requestedTile), cleared by the unmanage itself, not on
    // the client's acknowledgement, so it is safe to decide from (probed with a stopped client).
    // A fullscreen window still in its tile stays there: KWin puts it back when fullscreen ends.
    function visibleLeaf(c) {
        var w = wins[c.win];
        return w && !w.minimized && !(w.fullScreen && !w.tile);
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
        log("TILE " + shortCaption(w) + " -> " + rectLog(windowRect(tile)));
        tiledBorder(w);                     // before the tile asks for its size
        if (tile.manage(w)) return true;
        giveBorder(w);
        expected[id(w)] = null;
        refused = true;
        // A fullscreen window stays in the tree, as in i3: out of the tiles (the next pass
        // leaves it out, see visibleLeaf), back in when fullscreen ends. Whatever the refusal
        // (not resizable, or not on the tile's desktop while fullscreen), the same.
        if (w.fullScreen) {
            log("FULLSCREEN " + w.caption + ": out of the tiles until it ends");
            return false;
        }
        // Also a window whose fullscreen request is pending, on a hidden desktop: a known limit
        // (plan, policies: monitor returns).
        floatWindow(w, "KWin refused to tile it");
        return false;
    }
    // KWin's unmanage gives a window back its size from before it was tiled, fullscreen or not:
    // a fullscreen window dragged to the other monitor went back, small, to the old one when its
    // old workspace let go of it (fuzzer I9). A fullscreen window keeps its geometry. So does a
    // hidden one (its desktop not shown on its monitor): a hidden window never acknowledges a new
    // size, and KWin applies no geometry to it until it does, so it froze at that old size, out
    // of sight, through every later move (fuzzer I2, a monitor unplugged and back: 2026-10-22).
    // So does one on its way to another workspace (the model has it there, KWin not yet): it
    // waited there at its size from before it was tiled, and showed as that small box for a
    // moment when its workspace was next shown (Paul's capture, 2026-10-24). Putting the frame
    // back works within the call: KWin sends the configure from a timer, with the size pending then.
    function unmanageFrom(tile, w) {
        expected[id(w)] = null;
        var hidden = w.output && w.desktops.indexOf(workspace.currentDesktopForScreen(w.output)) < 0;
        var g = w.fullScreen || hidden || leaving(w) ? w.frameGeometry : null;
        tile.unmanage(w);
        if (g) w.frameGeometry = g;
    }
    function leaving(w) {
        var con = model.byWin[id(w)], ws = con && Tree.wsOf(con);
        return !!ws && w.desktops.indexOf(deskOf(ws.num)) < 0;
    }

    // Off whatever tile has it. On a hidden desktop KWin lists a window in a tile without placing
    // it, so w.tile is null there; by w.tile alone the window stayed listed and the next manage()
    // was a no-op (fuzzer I1: a window with a modal dialog, moved to a hidden workspace, is
    // dropped and adopted again). So also the tile we put it in, if that still lists it.
    function untile(w) {
        var t = w.tile;
        if (!t) {
            t = expected[id(w)];
            try { if (t && t.windows.indexOf(w) < 0) t = null; } catch (e) { t = null; }   // a removed tile
        }
        if (t) unmanageFrom(t, w); else expected[id(w)] = null;
    }

    function tiledWindowsOf(t, out) {
        t.windows.forEach(function (w) { out.push(w); });
        t.tiles.forEach(function (c) { tiledWindowsOf(c, out); });
        return out;
    }

    // ---- gaps (docs/spec-settings.md) ------------------------------------------------------
    // i3's gaps (render.c): inner between windows, inner + outer at the screen's edge. KWin gives
    // a tile's window P/2 towards a neighbour and P at the screen's edge, judged by the tile's
    // relative edge being exactly 0 or 1 (tile.cpp windowGeometry): with padding = inner on
    // every tile and the root inset by outer + inner/2, no edge is 0 or 1, so between = inner and
    // edge = outer + inner. All relative to the maximize area, absoluteGeometry's basis.
    // The inner gap is even (the pickers step by 2; an odd one from kwinrc counts as the even one
    // below): KWin rounds tile edges to whole pixels (absoluteGeometry) and takes half the padding
    // a side, so an odd padding put every window half a pixel off, its text shifting when
    // anything redrew it (Paul, 2026-10-25, gap 5; docs/spec-settings.md).
    function gaps() {
        var i = Settings.get("gapsInner"), o = Settings.get("gapsOuter");
        i -= i % 2;
        // The frame's room: twice its width, so KWin's half padding leaves it on each side.
        return { inner: i + (tiledRing() ? 2 * Settings.get("frameWidth") : 0), inset: o + i / 2 };
    }
    function areaOf(screen, ws) { return workspace.clientArea(KWin.MaximizeArea, screen, deskOf(ws.num)); }
    function rootRect(area) {
        var e = gaps().inset;
        // KWin gives a tile side exactly at the screen's edge the full padding, two frames
        // (Tile::windowGeometry): a hair's inset (0.003 px on 2560) makes every side half.
        if (!e && tiledRing()) e = HAIR * Math.max(area.width, area.height);
        return { x: e / area.width, y: e / area.height, width: 1 - 2 * e / area.width, height: 1 - 2 * e / area.height };
    }
    // For root tiles only (the hair's tolerance would be wrong for any other tile).
    function sameRect(g, r) {
        // The hair is far below the tolerance for float noise: told apart on its own.
        var tol = (r.x > 0 && r.x < 1e-4) || (g.x > 0 && g.x < 1e-4) ? 1e-9 : 1e-4;
        return Math.abs(g.x - r.x) <= tol && Math.abs(g.y - r.y) <= tol &&
               Math.abs(g.width - r.width) <= tol && Math.abs(g.height - r.height) <= tol;
    }
    // Every layout's children on its outer edges and spanning its cross axis. With gaps no edge
    // is at the screen's border, so KWin lets a window's outer side be dragged
    // (Tile::supportsResizeGravity), and pins that edge to the border (CustomTile::
    // setRelativeGeometry), where no later write can move it off: only a rebuild mends it.
    function edgesIntact(t) {
        if (!t.tiles.length) return true;
        var g = t.relativeGeometry, h = t.layoutDirection !== 2, n = t.tiles.length;
        var f = t.tiles[0].relativeGeometry, l = t.tiles[n - 1].relativeGeometry;
        var eq = function (a, b) { return Math.abs(a - b) < 1e-7; };   // below the hair (1e-6)
        if (h ? !eq(f.x, g.x) || !eq(l.x + l.width, g.x + g.width) : !eq(f.y, g.y) || !eq(l.y + l.height, g.y + g.height)) return false;
        return t.tiles.every(function (c) {
            var r = c.relativeGeometry;
            return (h ? eq(r.y, g.y) && eq(r.height, g.height) : eq(r.x, g.x) && eq(r.width, g.width)) && edgesIntact(c);
        });
    }

    // Where KWin puts a tile's window (Tile::windowGeometry, which scripts can't read): the tile
    // less P/2 on a side inside the screen, P on a side at its edge.
    function windowRect(t) {
        var a = t.absoluteGeometry, r = t.relativeGeometry, p = t.padding;
        if (!p) return a;
        var l = r.x > 0 ? p / 2 : p, tp = r.y > 0 ? p / 2 : p;
        var rt = r.x + r.width < 1 ? p / 2 : p, b = r.y + r.height < 1 ? p / 2 : p;
        return { x: a.x + l, y: a.y + tp, width: a.width - l - rt, height: a.height - tp - b };
    }

    // Padding = the inner gap, and minimum sizes that are the windows' own (plus the gap). KWin
    // gives every tile a minimum of 15% of the screen (tile.h m_minimumSize = 0.15 x 0.15,
    // inherited by children), which would stop i3 sizes below 384 px on a 2560 px monitor.
    // Splits get no minimum; a window's tile gets the window's minimum size, relative to the area.
    // noMin: minimums cleared, for while setSizes moves edges one by one: a tile minimum blocks
    // KWin's in-between steps and the sizes never settle (seen 2026-10-22: 280|680|500 asked
    // 280|500|500, the last window off the screen).
    function prepareTiles(t, area, noMin) {
        var inner = gaps().inner;
        if (t.padding !== inner) t.padding = inner;
        var min = { width: 0, height: 0 };
        if (!noMin && !t.tiles.length && t.windows.length === 1) {
            var fm = frameMin(t.windows[0]);
            min = { width: (fm.w + inner) / area.width, height: (fm.h + inner) / area.height };
        }
        var cur = t.minimumSize;
        if (Math.abs(cur.width - min.width) > 1e-6 || Math.abs(cur.height - min.height) > 1e-6)
            t.minimumSize = min;
        t.tiles.forEach(function (c) { prepareTiles(c, area, noMin); });
    }

    // Setting one tile's relativeGeometry moves its neighbours' shared edges, so a single pass
    // in order can leave a stale edge behind (seen 2026-10-22: four columns, the third left at
    // 0.567 wide over the fourth). Passes repeat until every tile is where it should be.
    function setSizesStable(root, p, area) {
        snapW = area.width; snapH = area.height;
        // From KWin's own root rect (the gaps' inset), so the border edges written below are
        // exactly KWin's: CustomTile::setRelativeGeometry forces a changed edge with no tile
        // beyond it to the screen's border (0 or 1), and it compares exactly.
        var g = root.relativeGeometry, r = { x: g.x, y: g.y, width: g.width, height: g.height };
        for (var pass = 0; pass < 4; pass++)
            if (!setSizes(root, p, r)) return;
        log("WARN sizes did not settle after 4 passes");
    }

    // A window's minimum as a frame: apps report it for their content, and the frame adds the
    // decoration, when it has one (Breeze's title bar and borders). KeePassXC, minimum 800, needs an 802 px tile
    // or KWin leaves it where it was (2026-10-22). The headless tests run Breeze (a 28 px title
    // bar, 150 px enforced minimum) unless a scenario selects the frame (tools/testkwin.sh).
    function frameMin(w) {
        // Its border taken: no decoration, even while the client hasn't answered yet (R1-13).
        if (tookBorder[id(w)]) return { w: w.minSize.width, h: w.minSize.height };
        var m = w.minSize, f = w.frameGeometry, c = w.clientGeometry;
        var bw = c ? Math.max(0, f.width - c.width) : 0, bh = c ? Math.max(0, f.height - c.height) : 0;
        return { w: m.width + bw, h: m.height + bh };
    }

    // The smallest a projected subtree can be, in pixels: windows' minimum sizes (each with the
    // inner gap, half on each side) added up along a split and the largest across it.
    function minOf(p) {
        if (p.win !== undefined) { var fm = frameMin(wins[p.win]), i = gaps().inner; return { w: fm.w + i, h: fm.h + i }; }
        var r = { w: 0, h: 0 };
        p.kids.forEach(function (k) {
            var m = minOf(k.p);
            if (p.dir === "h") { r.w += m.w; r.h = Math.max(r.h, m.h); }
            else { r.h += m.h; r.w = Math.max(r.w, m.w); }
        });
        return r;
    }

    // i3's shares, but no child below its minimum: the shortfall comes from children with room
    // to spare, in proportion to that room. Display only: the model keeps i3's shares. (Seen
    // live, 2026-10-22: KeePassXC, minimum 800 px, got a 640 px quarter and hung 162 px onto
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
    // 1 px hole the wallpaper showed through (seen live, 2026-10-22).
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
            // The outer edges exactly as the parent has them (see setSizesStable), the inner
            // ones on whole pixels.
            var a = i === 0 ? start : snap(pos, n);
            pos += px[i] / n;
            var b = i === p.kids.length - 1 ? start + size : snap(pos, n);
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

    // shown: the workspace's desktop is current on its monitor.
    function placeWindows(tile, p, shown) {
        if (p.win !== undefined) {
            var w = wins[p.win];
            tile.windows.slice().forEach(function (o) { if (o !== w) unmanageFrom(tile, o); });
            // Listed is not placed: a tile managed while its desktop was hidden lists the window
            // but never requested it (Tile::manage), and manage() again returns early for a window
            // it already lists. Once shown: off the list, then on (fuzzer I4, a monitor unplug).
            // Listed by KWin itself: a monitor returning takes a window and its modal dialog back
            // into its own tile on that monitor (fuzzer I1, 2026-10-23). `expected` followed the
            // window to the first monitor's tile meanwhile and was left there: the invariant check
            // read "not in its tile" and tileChanged took the move for someone else's.
            if (shown && w.tile !== tile && tile.windows.indexOf(w) >= 0) unmanageFrom(tile, w);
            if (tile.windows.indexOf(w) < 0) manageInto(tile, w);
            else { expected[id(w)] = tile; tiledBorder(w); }   // KWin put it there itself (see above): that is the tile it is in
            return;
        }
        for (var i = 0; i < p.kids.length; i++) placeWindows(tile.tiles[i], p.kids[i].p, shown);
    }

    // A tiled window fills its tile. KWin only moves a window when its tile changes, so a resize
    // drag that changes no share (a lone window, an outer edge) left the window smaller than its
    // tile for good (fuzzer I10). Not while a drag is still going. By tile, not by w.tile: KWin
    // can list a window in a tile whose w.tile is null (a monitor going away; the fuzzer again).
    function refit(t) {
        t.windows.forEach(function (w) { fitToTile(w, t); });
        t.tiles.forEach(refit);
    }
    function fits(w, t) {
        var g = w.frameGeometry, a = windowRect(t);
        return Math.abs(g.x - a.x) <= 1 && Math.abs(g.y - a.y) <= 1 &&
               Math.abs(g.width - a.width) <= 1 && Math.abs(g.height - a.height) <= 1;
    }
    function fitToTile(w, t) {
        if (w.tile !== t || w.move || w.resize || !wins[id(w)]) return;
        if (w.fullScreen) { fitFullscreen(w); return; }
        if (!fits(w, t)) w.frameGeometry = windowRect(t);
    }
    // A fullscreen window KWin keeps in its tile (none rebuilt since) is resized to the tile by
    // KWin whenever the tile's padding or geometry is written (Tile::setPadding and
    // setRelativeGeometry moveResize every window in it, fullscreen or not): a reload's first
    // pass, a gap or frame-width change. Put back on its monitor (Paul's capture 2026-10-27 03:45).
    function fitFullscreen(w) {
        if (!w.output) return;
        var g = w.frameGeometry, a = workspace.clientArea(KWin.FullScreenArea, w);
        if (g.x !== a.x || g.y !== a.y || g.width !== a.width || g.height !== a.height) {
            log("REFIT " + shortCaption(w) + ": fullscreen, back on its monitor");
            w.frameGeometry = a;
        }
    }

    // When a monitor returns, KWin's PlacementTracker asks every window for the geometry it had in
    // that layout (workspace.cpp updateOutputs). A window whose tile changed meanwhile looks
    // fitting to refit, and writing its tile again does nothing: XdgSurfaceWindow::moveResizeInternal
    // sends no configure when the size asked for is the size it has, so the old request still in
    // flight lands afterwards (fuzzer I10, 2026-10-23). So after a screens change every tiled
    // window is watched ("armed") until its frame next shows its tile, and refitted whenever the
    // frame changes to something else. Only then: a general watch fought slow clients that answer
    // a resize in steps (53-hold). Not inside a reconcile (the tiles are mid-change; it ends with a
    // refit), not a frame that fills the monitor (a window going fullscreen: the frame changes a
    // moment before the fullScreen flag), and not twice for the same frame and tile (a client that
    // refuses the size, its own minimum, would be asked again for every answer).
    // A resize drag arms its one window the same way (51-input), but only for the tile it ends in:
    // armed[key] is "pending" until the drag's reconcile, then that tile's rect, and dropped by a
    // later reconcile that changes it. A new tile is a new size, which KWin does send; refitting a
    // slow client's answer to the old one only doubled the request (53-hold, a closing window).
    var reconciling = false, armed = {}, lastFit = {};
    // Plain GTK 4 (spec-window-modes "why" 5): KWin tells a client its largest size only in a
    // configure with no size (sendRoleConfigure), in practice its first, with the title bar,
    // and GTK 4 keeps within it. borderGone holds those bounds, worked out when the border goes
    // (takeBorder). A tiled window short of its tile at the first frame change after the border
    // went, or later with its frame at the bounds, is asked for 0x0 (KWin resends the bounds, now
    // without the title bar; the client keeps its size), then for its tile in a configure of its
    // own. The later look because a first tile inside the bounds fits, and a later, bigger one (a
    // vertical split's half, then the whole monitor) stayed 26 px short (fuzzer I10, seed 4, fixed 2026-10-26: c386531); only
    // at the bounds, so a slow client answering in steps is not asked again. The first look
    // stays: a slow client whose tile changed before it answered gets fresh bounds before it
    // draws the new tile, rather than drawing it twice, asked and clamped (53-hold).
    // Never for an X11 window (no bounds there; a 0x0 request would be a real resize).
    function isX11(w) { return String(w).indexOf("X11Window") >= 0; }
    function armRefit() { for (var key in wins) armed[key] = true; }
    function rectKey(r) { return [r.x, r.y, r.width, r.height].join(","); }
    function rectLog(r) { return Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height); }
    function settleDragArms(ws) {
        model.leaves(ws).forEach(function (leaf) {
            var a = armed[leaf.win], t = expected[leaf.win];
            if (typeof a !== "string") return;
            var r = t ? rectKey(windowRect(t)) : "";
            if (a === "pending") armed[leaf.win] = r;
            else if (a !== r) delete armed[leaf.win];
        });
    }
    function atBounds(have, want, bound) { return have < want - 1 && Math.abs(have - bound) <= 1; }
    function refitOnFrameChange(w, old, dragging) {
        var key = id(w), t = expected[key];
        var b = borderGone[key];
        if (b && !reconciling && t && w.tile === t) {
            var first = b.first, g = w.frameGeometry, r = windowRect(t);
            b.first = false;
            if (!fits(w, t) && (first || atBounds(g.width, r.width, b.width) || atBounds(g.height, r.height, b.height))) {
                delete borderGone[key];
                log("BOUNDS " + w.caption + ": short of its tile after the border went; bounds asked again");
                w.frameGeometry = { x: g.x, y: g.y, width: 0, height: 0 };
                later(5, function () { if (wins[key] && w.tile === t) w.frameGeometry = windowRect(t); });
                return;
            }
        }
        if (!armed[key]) { if (!dragging) refitSelfResize(w, old); return; }
        if (reconciling || !t || w.tile !== t) return;
        if (armed[key] === "pending") return;
        if (typeof armed[key] === "string" && armed[key] !== rectKey(windowRect(t))) { delete armed[key]; return; }
        if (fits(w, t)) { delete armed[key]; delete lastFit[key]; return; }
        var f = w.frameGeometry, o = w.output.geometry;
        if (Math.abs(f.width - o.width) <= 1 && Math.abs(f.height - o.height) <= 1) return;
        var a = windowRect(t);
        var seen = [f.x, f.y, f.width, f.height, a.x, a.y, a.width, a.height].join(",");
        if (lastFit[key] === seen) return;
        lastFit[key] = seen;
        fitToTile(w, t);
    }
    // A tiled window that resizes itself (Firefox's session restore: Paul's capture 2026-10-25)
    // is asked back into its tile, as i3 refuses a tiled window's own resize (handlers.c
    // handle_configure_request; docs/spec-self-resize.md). It had reached its tile and left it:
    // the frame before the change fitted. A slow client answering kwin-i3's own resize in steps
    // never starts from a fitting frame, so it isn't asked twice (53-hold). At most once a
    // second per window, so a client that flips back each time isn't asked without end; a second
    // resize inside that second is asked back when it ends, not dropped (review: session restore
    // comes in bursts).
    var selfFitAt = {}, selfFitLater = {};
    function refitSelfResize(w, old) {   // not during a drag (the caller knows)
        var key = id(w), t = expected[key];
        if (!old || reconciling || placing[key] || !t || w.tile !== t || !w.output) return;
        if (w.fullScreen || w.maximizeMode !== 0 || fits(w, t)) return;
        var a = windowRect(t), f = w.frameGeometry, o = w.output.geometry;
        if (Math.abs(old.x - a.x) > 1 || Math.abs(old.y - a.y) > 1 ||
            Math.abs(old.width - a.width) > 1 || Math.abs(old.height - a.height) > 1) return;
        var wait = selfFitAt[key] ? 1000 - (Date.now() - selfFitAt[key]) : 0;
        // A frame that fills the monitor is looked at again a moment later: a window going
        // fullscreen gets that frame before its flag (four fullscreen scenarios went red when it
        // was refitted at once), and a window's own oversize is clamped to the monitor's size,
        // so skipping it left those off their tiles (fuzzer, I2). The later look skips fullscreen.
        if (Math.abs(f.width - o.width) <= 1 && Math.abs(f.height - o.height) <= 1) wait = Math.max(wait, 150);
        if (wait <= 0) { selfRefit(w, t); return; }
        if (selfFitLater[key]) return;
        selfFitLater[key] = true;
        later(wait, function () {
            delete selfFitLater[key];
            // Still the same window in the same tile, still out of it, nothing else in hand.
            if (!wins[key] || expected[key] !== t || w.tile !== t || reconciling || placing[key]) return;
            if (w.fullScreen || w.maximizeMode !== 0 || w.move || w.resize || fits(w, t)) return;
            selfRefit(w, t);
        });
    }
    function selfRefit(w, t) {
        selfFitAt[id(w)] = Date.now();
        log("REFIT " + shortCaption(w) + ": resized itself, asked back into its tile");
        fitToTile(w, t);
    }

    var selftestBroken = false;   // debug only: every reconcile throws (tests the backoff)
    function reconcile(ws) {
        if (!ws || released) return;
        reconciling = true;
        try { reconcileNow(ws); } finally { reconciling = false; }
    }
    function reconcileNow(ws) {
        if (selftestBroken) throw new Error("selftest reconcile");
        var screen = outputOf(ws);
        var root = workspace.rootTile(screen, deskOf(ws.num));
        if (!root) return;
        touchedRoots[screen.name + "/" + deskOf(ws.num).id] = true;    // by desktop: numbers can change
        var area = areaOf(screen, ws);
        relocate(ws, screen);
        ws.floating.forEach(function (f) { if (wins[f.win]) lookFloating(wins[f.win], ws); });
        floatWhatCannotFit(ws, area);
        var p = project(ws);
        refused = false;
        // Gaps: the root's inset changes only on a rebuild. KWin moves a root's children with
        // it but forces an edge that changes with no tile beyond it back to the screen's border
        // (CustomTile::setRelativeGeometry), while children split from an inset root inherit
        // its edges (probed). Then padding, then minimums (review).
        var inset = rootRect(area), reinset = !sameRect(root.relativeGeometry, inset) || !edgesIntact(root);
        prepareTiles(root, area);
        var want = shapeOfProjection(p), have = shapeOfTile(root);
        if (want !== have || reinset) {
            // Different shape or different windows: rebuild this root. Unmanage first, so removing
            // tiles can't push windows around (KWin moves a removed tile's windows elsewhere).
            // From the tile that lists each window, not w.tile: on a hidden desktop a listed window
            // has no w.tile, and left listed it rode into a child tile when the root split, never
            // managed again (fuzzer I1).
            (function off(t) {
                t.windows.slice().forEach(function (w) { unmanageFrom(t, w); });
                t.tiles.forEach(off);
            })(root);
            clearRoot(root);
            if (reinset) root.relativeGeometry = inset;
            if (p) {
                build(root, p);
                prepareTiles(root, area);
            }
        }
        if (p) {
            placeWindows(root, p, workspace.currentDesktopForScreen(screen) === deskOf(ws.num));
            prepareTiles(root, area, true);     // sizes first, with no tile minimums in the way
            setSizesStable(root, p, area);
            prepareTiles(root, area);           // then each leaf gets its window's minimum
            refit(root);
            settleDragArms(ws);
        }
        log("TREE " + ws.num + " " + named(model.describe(ws.num)));
        if (refused) schedule(ws);          // the projection changed under us: one more pass
        else checkInvariants(ws, root, p, area);
    }


    function clearRoot(root) {
        for (var n = 0; root.tiles.length; n++) {
            if (n > 256) throw new Error("clearRoot: tiles would not go away");
            root.tiles[root.tiles.length - 1].remove();
        }
    }

    // A floated window takes the geometry it opened with, as i3's con->geometry (manage.c,
    // floating_enable; docs/spec-float-size.md): recorded once, when kwin-i3 first sees the
    // window untiled, with the output it was on. KWin's own restore was lost by a move to a
    // hidden workspace: recorded when that workspace is shown, from the tiled frame unmanageFrom
    // kept. With no record (tiled already at a load), fullscreen or hidden: KWin's restore.
    var untiled = {};
    function recordUntiled(w) {
        if (w.tile || w.fullScreen || !w.output) return;
        var f = w.frameGeometry, o = w.output.geometry;
        untiled[id(w)] = { x: f.x, y: f.y, width: f.width, height: f.height,
                           out: { x: o.x, y: o.y, width: o.width, height: o.height } };
    }
    // After untile, in the same call (KWin sends the configure from a timer, unmanageFrom).
    function floatAtRecord(w) {
        var r = untiled[id(w)], con = model.byWin[id(w)], ws = con && Tree.wsOf(con);
        if (!r || !ws || w.fullScreen || !w.output) return;
        if (w.desktops.indexOf(workspace.currentDesktopForScreen(w.output)) < 0) return;
        var o = w.output.geometry, a = areaOf(w.output, ws);
        var g = { x: r.x, y: r.y, width: Math.min(r.width, a.width), height: Math.min(r.height, a.height) };
        if (r.out.x !== o.x || r.out.y !== o.y || r.out.width !== o.width || r.out.height !== o.height) {
            // Another output: the centre's fraction of the old one, on this one (i3's
            // floating_fix_coordinates).
            g.x = o.x + (r.x - r.out.x + r.width / 2) * o.width / r.out.width - g.width / 2;
            g.y = o.y + (r.y - r.out.y + r.height / 2) * o.height / r.out.height - g.height / 2;
        }
        if (g.x < a.x || g.y < a.y || g.x + g.width > a.x + a.width || g.y + g.height > a.y + a.height) {
            g.x = a.x + (a.width - g.width) / 2;
            g.y = a.y + (a.height - g.height) / 2;
        }
        w.frameGeometry = g;
    }

    function floatWindow(w, why) {
        var con = model.byWin[id(w)];
        if (!con || con.type === "floating") return;
        untile(w);
        floatAtRecord(w);
        clampFloating(w);
        model.floatingEnable(con);
        setFloatingLook(w, true);
        log("FLOAT " + w.caption + ": " + why);
    }

    // i3's floating_minimum_size / floating_maximum_size (§11 N15; floating.c
    // floating_check_size): a window becoming floating is kept within them. 0 means i3's default
    // (75x50 for the minimum; all outputs together for the maximum), -1 no limit. KWin's own
    // floor (a decorated window is about 150 px wide at least) applies after.
    function clampFloating(w) {
        if (w.fullScreen || w.deleted || !w.output) return;
        var min = Rules.parseSize(Settings.get("floatingMinimumSize")) || { w: 75, h: 50 };
        var max = Rules.parseSize(Settings.get("floatingMaximumSize")) || { w: 0, h: 0 };
        var all = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        workspace.screens.forEach(function (s) {
            var g = s.geometry;
            all.x1 = Math.min(all.x1, g.x); all.y1 = Math.min(all.y1, g.y);
            all.x2 = Math.max(all.x2, g.x + g.width); all.y2 = Math.max(all.y2, g.y + g.height);
        });
        function lo(v, def) { return v === -1 ? 1 : v === 0 ? def : v; }
        function hi(v, def) { return v === -1 ? Infinity : v === 0 ? def : v; }
        var g = w.frameGeometry;
        var width = Math.min(Math.max(g.width, lo(min.w, 75)), hi(max.w, all.x2 - all.x1));
        var height = Math.min(Math.max(g.height, lo(min.h, 50)), hi(max.h, all.y2 - all.y1));
        if (width === g.width && height === g.height) return;
        w.frameGeometry = { x: g.x, y: g.y, width: width, height: height };
        log("FLOAT " + shortCaption(w) + ": sized to " + width + "x" + height + " (floating size limits)");
    }

    // The plan's rule "a window that can't fit floats" (code review: a window with a 900 px
    // minimum hung 580 px off a 1280 px screen; a row of 12 windows broke KWin's sizing). While
    // the tiled windows' minimum sizes can't fit the screen, float the one with the largest
    // minimum along the axis that overflows.
    function floatWhatCannotFit(ws, area) {
        var e = gaps().inset, W = area.width - 2 * e, H = area.height - 2 * e;    // the root's room
        for (var n = 0; n < 32; n++) {
            var p = project(ws);
            if (!p) return;
            var need = minOf(p);
            var axis = need.w > W ? "w" : need.h > H ? "h" : null;
            if (!axis) return;
            var worst = null, worstMin = -1;
            model.leaves(ws).forEach(function (leaf) {
                var w = wins[leaf.win];
                if (!w || !visibleLeaf(leaf)) return;     // not one out of the tiles (review)
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
    // >0 while relocate moves a window. KWin moves a modal dialog and its parent together and gives
    // them the new screen's current desktop as well: two desktops for a moment, which
    // desktopsChanged took for "made sticky" and dropped, adopted, and sent again (fuzzer I1).
    var relocating = 0;
    // A window being dragged, or one KWin moves along with it (the parent of a modal dialog being
    // dragged), is left where the pointer has it: the drag's end settles its workspace. Relocating
    // it mid-drag (any reconcile of its workspace) snapped the dialog back, or left the parent
    // tiled on the drop workspace but standing on the other monitor (fuzzer I2, seed 215).
    function inDrag(w) {
        if (w.move || w.resize) return true;
        return workspace.windowList().some(function (d) {
            return d.modal && d.transientFor === w && (d.move || d.resize);
        });
    }
    // A window crossing to another monitor stays on all desktops until KWin says it arrived
    // (outputChanged, or 2 s): given its workspace's desktop at once, it is hidden on the monitor
    // it is still on, and a hidden client may never answer the move (Electron: VS Code left on
    // DP-6 with desktop 3, KWin waiting on it, sendToOutput a no-op from then on; Paul's capture,
    // 2026-10-26 04:32). window id -> the desktop it gets on arrival.
    var crossing = {};
    function relocate(ws, screen) {
        var desk = deskOf(ws.num);
        model.leaves(ws).concat(ws.floating).forEach(function (c) {
            var w = wins[c.win];
            if (!w) return;
            if (w.output === screen && w.desktops.length === 1 && w.desktops[0] === desk) return;
            if (inDrag(w)) return;
            var key = id(w);
            if (crossing[key]) { crossing[key] = desk; return; }    // still crossing: arrives below
            untile(w);
            placing[key] = true;
            relocating++;
            try {
                if (w.output !== screen) {
                    crossing[key] = desk;
                    w.onAllDesktops = true;
                    workspace.sendClientToScreen(w, screen);
                    if (w.output === screen) arrive(w);
                    else later(2000, function () { if (crossing[key]) { log("CROSSING " + shortCaption(w) + ": no arrival in 2 s"); arrive(w); } });
                } else {
                    w.desktops = [desk];  // after the screen: KWin gives a moved window that screen's desktop
                }
            } finally { delete placing[key]; relocating--; }
        });
    }
    // Its workspace's desktop now that it is on that monitor, then a pass to fit it.
    function arrive(w) {
        var key = id(w), desk = crossing[key];
        if (!desk) return;
        delete crossing[key];
        if (w.deleted) return;
        placing[key] = true;
        relocating++;
        try { w.desktops = [desk]; } finally { delete placing[key]; relocating--; }
        var con = model.byWin[key];
        if (con) schedule(Tree.wsOf(con));
    }

    // Logged, never thrown: the live tests fail on any "INVARIANT" line.
    function checkInvariants(ws, root, p, area) {
        var problems = [], inner = gaps().inner;
        if (!sameRect(root.relativeGeometry, rootRect(area))) problems.push("root not inset for the gaps");
        (function walk(t) {
            if (t.padding !== inner) problems.push("padding " + t.padding + ", gaps " + inner);
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
            if (!visibleLeaf(leaf)) return;
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
        // Clipped to the root's rect: with gaps a dragged outer side can pin a tile to the
        // screen's border (edgesIntact), and an outer edge is never a share.
        var area = areaOf(outputOf(ws), ws), e = gaps().inset;
        var lo = { x: area.x + e, y: area.y + e }, hi = { x: area.x + area.width - e, y: area.y + area.height - e };
        function extent(c) {
            if (c.win !== null && c.type !== "ws") {
                var w = wins[c.win];
                if (!w || !visibleLeaf(c)) return null;   // a fullscreen window out of the tiles has no extent
                var g = w.tile ? w.tile.absoluteGeometry : w.frameGeometry;   // tiles: no size-step slack
                return { x: Math.max(g.x, lo.x), y: Math.max(g.y, lo.y),
                         x2: Math.min(g.x + g.width, hi.x), y2: Math.min(g.y + g.height, hi.y) };
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

    // A window kwin-i3 floats owns its keep-above flag, set here or not: after a reload the flag
    // the old instance set is still on the window, and recording it only when setting it left
    // the window kept above (and green, since the frame colours) for good once un-floated
    // (docs/spec-reload-keepabove.md, 2026-10-24).
    function setFloatingLook(w, on) {
        var key = id(w);
        if (on) { var con = model.byWin[key]; lookFloating(w, con ? Tree.wsOf(con) : null); return; }
        if (keptAbove[key]) { w.keepAbove = false; delete keptAbove[key]; }
        tellFloating(w, false);
    }
    function plasmaWs(ws) { return !!(ws && Settings.get("floatingWorkspaces")[ws.num]); }
    // A floating window's look, on its workspace (spec-window-modes R2, decisions 3 and 5):
    // above the tiled ones as in i3, except on a workspace of Plasma windows while the effect
    // keeps the floating mark (without it, the flag is the mark everywhere); its own decoration,
    // or the frame in the floating colours with frameOnFloating. Again on every pass, so a
    // window moved to another workspace takes that workspace's layering.
    function lookFloating(w, ws) {
        var key = id(w);
        var above = !(frameOn && marks && plasmaWs(ws));
        if (above) { if (!w.keepAbove) w.keepAbove = true; keptAbove[key] = true; }
        else if (keptAbove[key]) { w.keepAbove = false; delete keptAbove[key]; }
        if (frameOn && Settings.get("frameOnFloating") && !w.fullScreen) takeBorder(w);
        else giveBorder(w);
        delete borderGone[key];         // the GTK 4 bounds are a tiled window's matter
        tellFloating(w, true);
    }
    function tellFloating(w, on) {
        var key = id(w);
        if (!frameOn || !marks || told[key] === on) return;
        told[key] = on;
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetFloating", key, on);
    }

    // How tiled windows look (docs/spec-tiled-look.md), with the effect there: without their
    // border in "frame" and "bare", and the ring and its room in the tiles in "frame" only.
    // Without the effect, title bars whatever tiledLook says.
    function tiledBorderless() { return frameOn && Settings.get("tiledLook") !== "titlebars"; }
    function tiledRing() { return frameOn && Settings.get("tiledLook") === "frame"; }
    function tiledBorder(w) {
        if (tiledBorderless()) takeBorder(w);
        else giveBorder(w);
    }
    // The effect draws the ring as the script says, so the ring and the tiles' room for it change
    // in the same pass (spec, item 3). An older effect without the call ignores it.
    function tellRing() {
        if (frameOn) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetTiledRing", tiledRing());
    }

    // A tiled window's border, while the effect draws the frame (spec-window-modes R2). Read
    // back: a window rule that forces a border wins (review R1-4), and that window then keeps
    // its title bar. Re-asserted on every pass (the window menu, borderlessMaximizedWindows).
    // A window already without one (a reload's predecessor took it, a session restore) is
    // recorded too: kwin-i3 gives it back when the window stops being tiled.
    function takeBorder(w) {
        if (!frameOn || w.fullScreen) return;
        var key = id(w);
        if (!w.noBorder) {
            // Only a border that exists: a window drawing its own title bar has frame = client,
            // and KWin would store "no border" for it all the same (setDecorationPolicy), which
            // the effect reads as a border taken (review of (iii)+(iv), finding 2).
            if (!serverDecorated(w)) return;
            // The bounds KWin sent with the border (refitOnFrameChange): the placement area less
            // the border, as sendRoleConfigure has it.
            var f = w.frameGeometry, c = w.clientGeometry, area = workspace.clientArea(KWin.PlacementArea, w);
            var bounds = { width: area.width - (f.width - c.width), height: area.height - (f.height - c.height), first: true };
            w.noBorder = true;
            if (!w.noBorder) return;            // a rule forces the border
            if (!isX11(w)) borderGone[key] = bounds;
        }
        tookBorder[key] = true;
    }
    function serverDecorated(w) {
        var f = w.frameGeometry, c = w.clientGeometry;
        return !!c && (Math.abs(f.width - c.width) > 0.5 || Math.abs(f.height - c.height) > 0.5);
    }
    function giveBorder(w) {
        var key = id(w);
        delete borderGone[key];
        if (!tookBorder[key]) return;
        delete tookBorder[key];
        if (!w.deleted && w.noBorder) w.noBorder = false;
    }

    // The focused workspace, or null (no focus yet).
    function focusedWs() {
        var f = model.focused;
        return f ? (f.type === "ws" ? f : Tree.wsOf(f)) : null;
    }
    // The workspace a window that just appeared gets (docs/spec-redo-1-new-windows.md, A and B;
    // the rules in Placement.target): a modal dialog goes with its parent (C3), one that asked for
    // a hidden desktop keeps it (C4), any other opens on the focused workspace (C1), wherever
    // KWin's active output put it. The switch KWin made to activate it is undone (C2), unless it
    // asked. A modal dialog is given its parent's desktop directly, never relocate's move via all
    // desktops, which would take the parent along (probe 90: KWin ties the two in setDesktops).
    // -> { ws, why } or null (not on one desktop, as wsForWindow).
    function placeNew(w) {
        if (w.desktops.length !== 1 || !w.output) return null;
        var desk = deskNum(w.desktops[0]);
        if (desk < 1) return null;
        var parent = w.modal && w.transientFor && !w.transientFor.deleted ? model.byWin[id(w.transientFor)] : null;
        var fws = focusedWs();
        var outputs = workspace.screens.map(function (s) {
            return { name: s.name, shows: deskNum(workspace.currentDesktopForScreen(s)) };
        });
        // i3's `assign` first (§11 N12; manage.c:289-317): to workspace N, shown or not, or to an
        // output's visible workspace; an output that isn't connected leaves the rule aside.
        var t = null, assigned = Rules.assignFor(w);
        if (assigned && assigned.workspace) {
            Workspaces.ensure(assigned.workspace);
            if (deskOf(assigned.workspace)) {
                if (!Workspaces.hasHome(assigned.workspace)) Workspaces.claimHome(assigned.workspace, fws ? outputOf(fws) : w.output);
                t = { ws: assigned.workspace, why: "assign" };
            }
        } else if (assigned && assigned.output) {
            workspace.screens.forEach(function (s) {
                if (s.name === assigned.output) t = { ws: deskNum(workspace.currentDesktopForScreen(s)), why: "assign" };
            });
            if (t && t.ws < 1) t = null;
        }
        if (!t) t = Placement.target({ desk: desk, modal: !!w.modal, parentWs: parent ? Tree.wsOf(parent).num : null },
                                     Placement.shownBefore(outputs, pendingShown), fws ? fws.num : null);
        var e = Placement.claim(pendingShown, w.output.name, desk);
        if (e && t.why !== "asked" && e.previous >= 1 && deskOf(e.previous)) {
            showOn(deskOf(e.previous), w.output);
            log("SHOWN " + w.output.name + " " + e.previous + " again: a new window's switch, undone");
        }
        if (!Workspaces.hasHome(t.ws)) Workspaces.claimHome(t.ws, w.output);
        var ws = wsModel(t.ws);
        if (t.why === "parent" && w.desktops[0] !== deskOf(t.ws)) {
            var key = id(w);
            placing[key] = true;
            relocating++;
            try { w.desktops = [deskOf(t.ws)]; } finally { delete placing[key]; relocating--; }
        }
        return { ws: ws, why: t.why };
    }

    // i3's rule for a new window under a fullscreen one (manage.c, "fs != NULL, not focusing"):
    // it opens behind and gets no focus, unless it is the fullscreen window's own transient
    // (popup_during_fullscreen smart, con_find_transient_for_window: the transientFor chain
    // reaches it). KWin activated it before windowAdded (workspace.cpp addWaylandWindow), and a
    // fullscreen window is on top only while active (Window::isActiveFullScreen), so the focus is
    // handed straight back from the handler: one event-loop turn, nothing painted in between.
    // Only for a window that just appeared (`fresh`): adoptWindow also runs from reclassify,
    // desktopsChanged and a reload, where it must not pull focus from a window in use. Not on a
    // hidden workspace: activating a window there switches its monitor's desktop (activation.cpp,
    // SwitchToOtherDesktop). Another app's dialog opens behind too (§5 C5, Paul, 2026-10-28).
    function transientOf(w, main) {
        for (var t = w.transientFor, n = 0; t && n < 16; t = t.transientFor, n++) if (t === main) return true;
        return false;
    }
    // KWin activates a new window's modal dialog in its place (activation.cpp, findModal): the
    // newcomer counts as activated when its modal child is (87-new-window-placement, part 4).
    function activatedNow(w) {
        if (w.active) return true;
        var a = workspace.activeWindow;
        return !!(a && a.modal && transientOf(a, w));
    }
    function keepsFullscreenFocus(w, ws, fresh) {
        // A newcomer that opens fullscreen itself (mpv --fs, a game) takes the workspace's
        // fullscreen over, as in i3 (manage.c: con_toggle_fullscreen, fs = NULL): no hand-back.
        if (!fresh || !activatedNow(w) || w.fullScreen) return null;
        var fs = model.fullscreenOn(ws);
        if (!fs || fs.win === id(w) || !wins[fs.win]) return null;
        if (transientOf(w, wins[fs.win])) return null;
        if (workspace.currentDesktopForScreen(outputOf(ws)) !== deskOf(ws.num)) return null;
        return wins[fs.win];
    }

    function adoptWindow(w, fresh) {
        var key = id(w);
        if (wins[key]) return;
        // Kept out of the tree by its kind (dock, root, override-redirect, sticky; §3): a Normal
        // one is watched, since a later change of class, transience or desktops can bring it in
        // (reclassify; code review).
        if (Rules.keptOut(w)) { if (w.normalWindow && !w.deleted) connectWindow(w); return; }
        // The workspace first (placeNew, `assign` included), then the kind: a `workspace`
        // criterion sees the workspace the window opens on, as i3's run_assignments runs after
        // the window is placed (docs/spec-redo-3-kinds-rules.md, A).
        var fws = focusedWs(), placed = fresh ? placeNew(w) : null;
        var ws = placed ? placed.ws : fresh ? null : wsForWindow(w);
        if (!ws) { connectWindow(w); return; }
        if (!ruleRan[key]) ruleRan[key] = {};
        var kind = Rules.classify(w, { ws: ws.num, current: null, ran: ruleRan[key] });
        // Not just appeared (a load, a window taken back after a desktop change), in no tile and
        // kept above: a window kwin-i3 had floating, the flag being the one durable mark of it,
        // so it stays floating whatever the rules say (docs/spec-reload-keepabove.md).
        if (kind === "tiling" && !fresh && !w.tile && (w.keepAbove || atLoadFloating[key])) kind = "floating";
        // No border and not to be framed: a session restore of one kwin-i3 took, or a reload
        // after the effect went (review R1-4). Given back; a rule forcing it wins anyway.
        if (w.noBorder && !(tiledBorderless() && kind === "tiling")) w.noBorder = false;
        wins[key] = w;
        if (!w.fullScreen && w.maximizeMode !== 0) w.setMaximize(false, false);
        recordUntiled(w);
        var fs = keepsFullscreenFocus(w, ws, fresh);
        if (kind === "floating") { model.openFloating(key, ws); setFloatingLook(w, true); if (fresh) clampFloating(w); }
        else model.open(key, ws);          // under a fullscreen window: second in the focus stack
        if (w.fullScreen) model.setFullscreen(key, true);
        if (w.minimized) model.setMinimized(key, true);
        connectWindow(w);
        // i3's manage.c:437: a newcomer takes the focus only on the focused output's visible
        // workspace (§5 C1, C3); one that asked for its desktop takes it there (C4). Otherwise
        // the focus goes back to what had it (KWin activated the window already). A newcomer
        // whose modal dialog KWin activated in its place (activatedNow) takes its place in the
        // focus order right behind the dialog, as i3 focuses a window at its opening before its
        // dialog: without it, a close beside them went to an older window (redo stage 6, step A).
        var takes = !placed || placed.why === "asked" ||
            Placement.takesFocus(workspace.currentDesktopForScreen(outputOf(ws)) === deskOf(ws.num),
                                 !fws || outputOf(ws) === outputOf(fws), !!fws);
        var active = workspace.activeWindow, viaModal = !w.active && activatedNow(w) && active ? active : null;
        if (activatedNow(w) && !fs) {
            if (takes) {
                model.focusWin(key);
                if (viaModal && model.byWin[id(viaModal)]) model.focusWin(id(viaModal));
            } else wantFocus();
        }
        log("ADD " + w.caption + " " + kind + " ws " + ws.num + (placed ? " (" + placed.why + (takes ? "" : ", no focus") + ")" : ""));
        if (fs) {
            workspace.activeWindow = fs;   // windowActivated then tells the model, as for any activation
            log("FULLSCREEN " + fs.caption + ": keeps the focus over " + w.caption);
        }
        // A newcomer on its way to another output or desktop stays hidden until it is placed
        // (Paul, 2026-10-28, call 57): the pass that moves it waits for the effect to have it.
        var moving = placed && (w.output !== outputOf(ws) || w.desktops[0] !== deskOf(ws.num));
        if (moving && frameOn) holdNew(w, 200, function () { schedule(ws); });
        else schedule(ws);
    }

    // The effect hides a new window for 20 ms by itself, until its tile places it (hold.cpp
    // onAdded). A newcomer kwin-i3 moves to another output or desktop would show at KWin's spot
    // first: the effect is told to keep it hidden up to `ms` (HoldNew), and `then` (the pass
    // that moves it) runs once the effect has that, or after 50 ms with no answer (an effect
    // without the method). After the pass, HoldNew(id, 0) shows one no tile placed (a floating
    // window); a tiled one joined the hold and shows at its release (flush).
    function holdNew(w, ms, then) {
        var key = id(w), done = false;
        var go = function () { if (!done) { done = true; then(); } };
        holdNamed[key] = true;
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "HoldNew", key, ms, guard("held", go));
        later(50, go);
    }
    function showHeld() {
        Object.keys(holdNamed).forEach(function (key) {
            if (crossing[key]) return;      // not there yet: the pass after its arrival
            delete holdNamed[key];
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "HoldNew", key, 0);
        });
    }

    // No longer ours: closed, made sticky, or now on the ignore list.
    function dropWindow(w) {
        var key = id(w);
        if (!wins[key]) return;
        var con = model.byWin[key];
        var ws = con ? Tree.wsOf(con) : null;
        try { if (!w.deleted) untile(w); } catch (e) { /* gone */ }
        if (!w.deleted) { setFloatingLook(w, false); giveBorder(w); }
        var wasFocused = model.focused === con;
        model.close(key);
        // The tree's focus after a close, for a capture to set beside the ACTIVE lines: "chose",
        // the tree picked it; "kept", KWin had activated another window first (forgetWindow then
        // puts i3's choice back).
        if (con) log("CLOSE " + shortCaption(w) + (wasFocused ? " chose " : " kept ") + conCaption(model.focused));
        delete told[key];
        delete wins[key]; delete expected[key]; delete armed[key]; delete selfFitAt[key]; delete selfFitLater[key]; delete lastFit[key]; delete keptAbove[key]; delete tookBorder[key]; delete borderGone[key]; delete placing[key];
        delete untiled[key];
        schedule(ws);
    }
    function shortCaption(w) { return String(w.caption).slice(0, 60); }
    function conCaption(c) {
        if (!c) return "none";
        if (c.win === null) return c.type === "ws" ? "workspace " + c.num : "a split";
        return wins[c.win] ? shortCaption(wins[c.win]) : "?";
    }

    // i3's next focus for a focused window that is closing, recorded at its `closed` signal: KWin
    // then activates its own choice (activateNextWindow, before windowRemoved: workspace.cpp:957),
    // the most recent window in its one-list focus chain (focuschain.cpp:252), and the tree
    // follows that activation. i3 looks in the closed window's own container first
    // (con_next_focused, con.c:1663): with focus following the mouse the two differ as soon as
    // the pointer has crossed another window (Paul, 2026-10-25, tests/live/79-close-focus.sh).
    // Only there: a tiled window in a split with another window left. At a workspace's top level
    // and for floating windows i3 takes the workspace's focus order, recency as KWin's chain is,
    // and KWin's knows more (activations before kwin-i3 adopted a window, or before a reload;
    // 20-rules and 25-settings went wrong when the tree's choice was taken there too).
    var closingNext = {};   // window id -> con

    // Closed: drop it, and focus goes where the model says (a window made sticky or ignored is
    // still on screen and probably in use, so dropWindow alone doesn't move focus): i3's choice
    // if one was recorded and is still there, over KWin's.
    function forgetWindow(w) {
        var key = id(w), next = closingNext[key];
        delete closingNext[key]; delete ruleRan[key];
        dropWindow(w);
        if (next && (next.win === null ? next.type === "ws" : model.byWin[next.win] === next) && model.focused !== next) {
            log("CLOSE " + shortCaption(w) + " i3's choice over KWin's: " + conCaption(next));
            model.activate(next);
        }
        wantFocus();
    }

    // reclassify (§3 X2; i3's run_assignments on a change of title, class, role or type): the
    // rules not yet run on the window run now, each at most once, only to apply it (ruleRan): a
    // window whose title stops matching stays as it is, and so does one floated or tiled by hand
    // (a window floated with Meta+Shift+Space used to tile again at its next caption change, which
    // for a browser is seconds: docs/spec-reload-keepabove.md, review finding 1, 2026-10-24).
    function reclassify(w) {
        var key = id(w), con = model.byWin[key];
        if (!con) { adoptWindow(w); return; }
        if (Rules.keptOut(w)) { dropWindow(w); return; }
        var floating = con.type === "floating";
        if (!ruleRan[key]) ruleRan[key] = {};
        var kind = Rules.classify(w, { ws: Tree.wsOf(con).num, current: floating ? "floating" : "tiling", ran: ruleRan[key] });
        if ((kind === "floating") === floating) return;
        model.toggleFloating(con);
        setFloatingLook(w, kind === "floating");
        if (kind === "floating") { untile(w); floatAtRecord(w); clampFloating(w); }
        schedule(Tree.wsOf(model.byWin[key]));
    }

    var connected = {};     // window id -> true once its signals are connected (once only)

    function connectWindow(w) {
        var key = id(w);
        if (connected[key]) return;
        connected[key] = true;
        var dragging = false;
        // Before KWin activates its choice (closingNext, above): i3's next focus for every close
        // of the focused window, a top-level or floating one too (§5 C7; redo stage 6).
        w.closed.connect(guard("closed", function () {
            var con = model.byWin[key];
            if (con && model.focused === con && con.parent) closingNext[key] = model.nextFocused(con);
            // i3's drain_drag_events: a window unmapping on the focused workspace aborts a drag (§9 G7).
            if (drag && con && focusedWs() === Tree.wsOf(con)) {
                callDBus(DRAG[0], DRAG[1], DRAG[2], "Cancel");
                endDrag("cancelled: " + shortCaption(w) + " closed on the focused workspace");
            }
        }));
        w.readyForPaintingChanged.connect(guard("ready", function () { reclassify(w); }));
        w.captionChanged.connect(guard("caption", function () { reclassify(w); }));
        w.transientChanged.connect(guard("transient", function () { reclassify(w); }));
        w.windowClassChanged.connect(guard("class", function () { reclassify(w); }));
        w.minimizedChanged.connect(guard("minimized", function () {
            var con = model.setMinimized(key, w.minimized);     // i3's scratchpad rule (§5 C9)
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
            // Two desktops while relocate moves it or its dialog: KWin's moment, not "made sticky".
            // A parent KWin moves along with its modal dialog is still followed (below).
            if (relocating && w.desktops.length !== 1) return;
            var con = model.byWin[key];
            if (!con && placing[key]) return;       // placeNew giving a dialog its parent's desktop
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
            if (kind === "resize" && con.type !== "floating") {
                readBack(ws);
                // The window was put back in its tile at each step, so it can fit now while the
                // client's answer to the last step is still in flight, and lands after this
                // reconcile's refit: watched until a frame shows its tile (51-input, section 1).
                if (armed[key] !== true) armed[key] = "pending";
                delete lastFit[key];
            }
            // Dropped on another monitor: as i3ws did, and as a dragged window does in i3.
            if (kind === "move" && w.output !== outputOf(ws)) joinShownWorkspace(con, w, w.output);
            schedule(ws);
        }));
        // outputChanged ends relocate's crossing (arrive). Otherwise: a window KWin moved to another
        // output than its workspace's, on its own (its restore of a returning monitor's windows,
        // PlacementTracker, lands after kwin-i3 has reconciled the replug), is put back by the next
        // pass: the model, not KWin's move, says where it belongs (plan.md decision 10; redo stage
        // 4, 40-monitors). Not during a drag (its end settles the workspace), nor kwin-i3's own
        // moves (placing). A move that also changes the desktop is desktopsChanged's above.
        w.outputChanged.connect(guard("output", function () {
            if (crossing[key]) { arrive(w); return; }
            var con = model.byWin[key];
            if (!con || placing[key] || dragging || inDrag(w)) return;
            var ws = Tree.wsOf(con);
            if (w.output && w.output !== outputOf(ws)) { log("OUTPUT " + shortCaption(w) + " moved by KWin to " + w.output.name + ": back to its workspace's"); schedule(ws); }
        }));
        w.frameGeometryChanged.connect(guard("frame", function (old) {
            // What KWin did, beside what kwin-i3 asked (TILE): not each step of a drag.
            if (!dragging && old) log("GEOM " + shortCaption(w) + " " + rectLog(old) + " -> " + rectLog(w.frameGeometry));
            refitOnFrameChange(w, old, dragging);
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

    // Make KWin show what the model has focused: its workspace on its monitor, the window
    // active; and the pointer follows when the focus changed output and the pointer isn't there
    // already (i3's x_push_changes with mouse_warping output; docs/spec-redo-2-pointer.md D):
    // only for a pass a key or an outside switch asked for (byKey), as i3 warps from workspace_show
    // and the focus commands, never from a close (the start menu closing sent the pointer across,
    // Paul, 2026-10-25; 72-pointer-stays). checked: this pass has KWin's answer that Show Desktop
    // is off (below).
    var focusedOutput = null;   // the output the focus was last applied or taken on, by name (not focusOutput, the action below)
    function pointerOn() { var p = workspace.cursorPos; return screenAt(p.x, p.y); }
    function warps() { return Settings.get("mouseWarping") !== "none"; }
    function applyFocus(byKey, checked) {
        var f = model.focused;
        if (!f) return;
        // A passive pass (no key action: a window closed, a reload, a monitor change) leaves an
        // open window kwin-i3 doesn't manage with the focus: a panel popup, a dialog, KRunner.
        // Taking it closed the tray's popups when their tooltip went (Paul, 2026-10-25). When
        // that window closes, its own pass brings kwin-i3's focus back. The desktop and the
        // panel hold the focus only when nothing else does, so they don't count.
        var a = workspace.activeWindow;
        if (!byKey && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock) return;
        // Except with Show Desktop on: then the desktop holds the focus on purpose (Plasma's edit
        // mode turns it on as the panel's menu closes, and the menu closing is this pass), and
        // activating a tile it hid turns it off (kwin activation.cpp activateWindow), which ended
        // the edit mode before its window showed (docs/bug-panel-config.md). Scripts can't read
        // the state, so a pass that finds the desktop (or the panel) active asks KWin, and a pass
        // with the answer goes on only if it is off (74-show-desktop). KWin's last resort when no
        // window is left to focus on a monitor is also the desktop: that pass still brings the
        // focus back (73-places-itself). The answer rides on focusPending, so it is the pass it
        // brought that has it, however long a rebuild holds that pass (review).
        if (!byKey && a && !a.deleted && (a.desktopWindow || a.dock) && !checked) {
            callDBus("org.kde.KWin", "/KWin", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin",
                     "showingDesktop", guard("showing desktop", function (showing) {
                if (showing) return;
                wantFocus();
                focusPending.checked = true;
            }));
            return;
        }
        var ws = f.type === "ws" ? f : Tree.wsOf(f), s = outputOf(ws), desk = deskOf(ws.num);
        var crossed = focusedOutput !== null && focusedOutput !== s.name;
        focusedOutput = s.name;
        var warp = byKey && crossed && warps() && pointerOn() !== s;
        if (workspace.currentDesktopForScreen(s) !== desk) {
            showOn(desk, s);
            // KWin places a tile's windows only while its desktop is current (Tile::manage calls
            // requestTile only if isActive), and nothing in KWin catches up when it becomes so.
            // This switch comes after the reconcile, so one more pass places them (fuzzer I4:
            // a monitor unplugged, its workspace reconciled on the other while still hidden).
            schedule(ws);
        }
        if (f.type === "ws" || f.win === null) {
            // KWin's Switch to Screen focuses a window there, or the desktop (activation.cpp
            // switchToOutput); an open popup is spared by the passive pass's first check above, so this
            // needs no guard of its own (a fault here alone changed nothing, 73-places-itself).
            if (workspace.activeScreen !== s) invoke("Switch to Screen " + workspace.screens.indexOf(s));
            if (warp) invoke("MoveMouseToCenter");
            // An empty workspace has the focus, as in i3: no window keeps the keyboard. KWin left
            // it with the window just moved away, hidden on another workspace (fuzzer, I8); the
            // desktop window doesn't keep it either (i3's root click, §5 B4: the Show Desktop
            // check above has already let this pass through).
            var ac = a && !a.deleted ? model.byWin[id(a)] : null;
            if (f.type === "ws" && ((ac && Tree.wsOf(ac) !== ws) || (a && !a.deleted && a.desktopWindow))) workspace.activeWindow = null;
            return;
        }
        var w = wins[f.win];
        if (!w) return;
        if (workspace.activeWindow !== w) {
            // Activating a window whose desktop is hidden switches the desktop of the window's
            // OUTPUT, and that is not always s: a fullscreen window that cannot resize stays on
            // the monitor it was on while its workspace was away, so after a replug the first
            // monitor was switched to the returned monitor's workspace and both showed it
            // (fuzzer I2, seed 7). The window is on its way to s; nothing else changes what a
            // monitor shows.
            var o = w.output, before = o !== s ? workspace.currentDesktopForScreen(o) : null;
            switching++;
            try { workspace.activeWindow = w; } finally { switching--; }
            if (before && workspace.currentDesktopForScreen(o) !== before) showOn(before, o);
        }
        if (warp) invoke("MoveMouseToFocus");
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
    function step() { return Settings.get("resizeStep") / 100; }

    // A floating window moves and resizes by floatingStep px, as i3's 10 px (cmd_move_direction,
    // cmd_resize_floating; docs/spec-float-keys.md). The window, or null when the keys are the
    // tree's: a tiled con, or a floating window KWin holds fullscreen or maximized.
    function floatingWin(c) {
        var w = c && c.type === "floating" ? wins[c.win] : null;
        return w && !w.fullScreen && w.maximizeMode === 0 ? w : null;
    }
    function screenAt(x, y) {
        return workspace.screens.filter(function (s) {
            var g = s.geometry;
            return x >= g.x && x < g.x + g.width && y >= g.y && y < g.y + g.height;
        })[0] || null;
    }
    // Dropped (a drag) or moved by key onto another monitor: it joins the workspace shown there
    // and keeps the focus (i3's floating_maybe_reassign_ws).
    function joinShownWorkspace(con, w, output) {
        var to = wsModel(deskNum(workspace.currentDesktopForScreen(output)));
        model.moveToWorkspace(con, to);
        model.focusWin(id(w));
        wantFocus();
        schedule(to);
    }
    // True when the key was a floating window's (done, or refused), false for the tree's.
    function nudgeFloating(c, d) {
        var w = floatingWin(c);
        if (!w) return c && c.type === "floating";
        var px = Settings.get("floatingStep"), g = w.frameGeometry;
        var r = { x: g.x + (d === "left" ? -px : d === "right" ? px : 0),
                  y: g.y + (d === "up" ? -px : d === "down" ? px : 0), width: g.width, height: g.height };
        // Refused only when no part would be on a monitor (i3's floating_reposition).
        var on = workspace.screens.some(function (s) {
            var o = s.geometry;
            return r.x < o.x + o.width && r.x + r.width > o.x && r.y < o.y + o.height && r.y + r.height > o.y;
        });
        if (!on) return true;
        w.frameGeometry = r;
        var s = screenAt(r.x + r.width / 2, r.y + r.height / 2), ws = Tree.wsOf(c);
        if (s && s !== outputOf(ws)) joinShownWorkspace(c, w, s);
        return true;
    }
    function growFloating(c, what, sign) {
        var w = floatingWin(c);
        if (!w) return c && c.type === "floating";
        if (!w.resizeable) return true;
        var px = sign * Settings.get("floatingStep"), g = w.frameGeometry;
        w.frameGeometry = { x: g.x, y: g.y, width: Math.max(1, g.width + (what === "width" ? px : 0)),
                            height: Math.max(1, g.height + (what === "height" ? px : 0)) };
        return true;
    }

    // ---- i3's tiling drag (tiling_drag.c; docs/spec-tiled-look.md, part B) ---------------------
    // The helper takes the press (plugin/tilingdrag.cpp) and runs the hidden "Tiling Drag" action;
    // from there kwin-i3 polls its State() until the drop or the cancel, shows the drop on
    // kwini3hold's indicator, and drops in the tree (Tree drop). The window stays put meanwhile.

    function tellDrag(on) {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "SetOn", on);
        // How far out of a tiled window's frame a Meta+right still resizes (half the gap between two
        // windows, the frame's room included; spec-tiling-resize.md, B).
        callDBus(DRAG[0], DRAG[1], DRAG[2], "SetResizeGap", on ? Math.ceil(gaps().inner / 2) + 1 : 0);
    }
    // i3's move cursor, from kwini3hold (SetDragCursor): renewed by every poll, so it ends by itself
    // if kwin-i3 goes away mid-drag. shape: 0 the move cursor, 1 left-right, 2 up-down (a resize).
    function dragCursor(on, shape) {
        if (frameOn) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetDragCursor", on, shape || 0);
    }

    // The visible workspaces, with their monitors: a model workspace for each, an empty one too.
    function shownWorkspaces() {
        return workspace.screens.map(function (s) {
            var n = deskNum(workspace.currentDesktopForScreen(s));
            return n >= 1 ? { ws: wsModel(n), screen: s } : null;
        }).filter(function (v) { return v; });
    }
    // is_tiling_drop_target: a tiled window shown, not under another's fullscreen.
    function dropTargetsOf(ws) {
        var fs = model.fullscreenOn(ws);
        return model.leaves(ws).filter(function (c) { return visibleLeaf(c) && (!fs || fs === c); });
    }
    function hasDropTargets() {             // has_drop_targets
        var n = 0;
        shownWorkspaces().forEach(function (v) {
            var k = dropTargetsOf(v.ws).length;
            n += k ? k : v.ws.nodes.length ? 0 : 1;
        });
        return n > 1;
    }
    function inRect(r, x, y) { return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height; }
    // con->rect: a window's frame, a split's leaves together, a workspace's area.
    function conRect(con) {
        if (con.type === "ws") return areaOf(outputOf(con), con);
        if (con.win !== null) return wins[con.win].frameGeometry;
        var r = null;
        model.leaves(con).forEach(function (c) {
            if (!visibleLeaf(c)) return;
            var g = wins[c.win].frameGeometry;
            if (!r) { r = { x: g.x, y: g.y, width: g.width, height: g.height }; return; }
            var x1 = Math.max(r.x + r.width, g.x + g.width), y1 = Math.max(r.y + r.height, g.y + g.height);
            r.x = Math.min(r.x, g.x); r.y = Math.min(r.y, g.y);
            r.width = x1 - r.x; r.height = y1 - r.y;
        });
        return r || { x: 0, y: 0, width: 0, height: 0 };
    }
    function findDropTarget(x, y) {         // find_drop_target
        var shown = shownWorkspaces();
        for (var i = 0; i < shown.length; i++) {
            var hit = dropTargetsOf(shown[i].ws).filter(function (c) { return inRect(conRect(c), x, y); })[0];
            if (hit) return hit;
        }
        // Over no window (a gap): the shown workspace's focused tiled window, or the workspace.
        var s = screenAt(x, y);
        var on = shown.filter(function (v) { return v.screen === s; })[0];
        return on ? model.descendTilingFocused(on.ws) : null;
    }
    // i3's parent zone: render_deco_height() + 5 px; the dragged window's title bar when it has
    // one, else about i3's default font's.
    function parentZone(w) {
        var t = w.clientGeometry.y - w.frameGeometry.y;
        return (t > 0 ? t : 20) + 5;
    }
    function indicate(rect) {
        var r = rect ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] : [0, 0, 0, 0];
        var key = r.join(",");
        if (!drag || key === drag.rect) return;
        drag.rect = key;
        if (frameOn) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetDropIndicator", r[0], r[1], r[2], r[3]);
    }
    function dragState(s) {
        if (!drag) return;
        drag.busy = false;
        if (drag.resize) { resizeState(s); return; }
        var f = String(s).split(" "), phase = f[0], x = Number(f[2]), y = Number(f[3]);
        if (phase === "drag" || phase === "drop") {
            var con = drag.con;
            if (model.byWin[f[1]] !== con || con.type !== "con") { endDrag("its window is gone"); return; }
            drag.plan = model.dropPlan(con, findDropTarget(x, y), x, y, conRect, parentZone(wins[con.win]));
            if (phase === "drag") { indicate(drag.plan && drag.plan.rect); return; }
            var from = Tree.wsOf(con), plan = drag.plan, to = plan && Tree.wsOf(plan.target);
            // A centre drop onto a window swaps the two, Shift or not (Paul, 2026-10-26: i3 moves
            // it after the target, which without tabs is the same as the side drop; "I love swap").
            // Onto an empty workspace it is a move: nothing there to swap with.
            var swap = !!plan && plan.type === Tree.CENTER && plan.target.type !== "ws";
            var dropped = model.drop(con, plan, swap);
            endDrag(dropped ? "dropped " + plan.type + (plan.type !== Tree.CENTER ? " " + plan.dir : "") + (swap ? " (swap)" : "") +
                              " at " + x + "," + y : "no drop at " + x + "," + y);
            if (dropped) {
                schedule(from);
                if (to && to !== from) schedule(to);
                schedule(Tree.wsOf(con));
                wantFocus();
            }
            return;
        }
        endDrag(phase === "cancel" ? "cancelled" : "ended");
    }
    function endDrag(why) {
        var tag = drag.resize ? "RESIZE " : "DRAG ";
        indicate(null);
        dragCursor(false);
        drag.timer.stop();
        drag = null;
        log(tag + why);
    }
    function pollDrag() {
        if (!drag || drag.busy) return;
        drag.busy = true;
        dragCursor(true, drag.shape);
        callDBus(DRAG[0], DRAG[1], DRAG[2], "State", guard("drag state", dragState));
    }
    // The hidden action: a drag began. Only a tiled window of kwin-i3's, and only with somewhere
    // else to drop it (has_drop_targets); otherwise the press was a click.
    function startDrag() {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "State", guard("drag start", function (s) {
            var f = String(s).split(" "), con = model.byWin[f[1]];
            if (f[0] !== "drag" || drag) return;
            if (!con || con.type !== "con" || !wins[con.win] || !hasDropTargets()) {
                log("DRAG not started: " + (con && con.type === "con" ? "nowhere to drop" : "not a tiled window"));
                return;
            }
            var timer = new QTimer();
            timer.interval = 16;            // a frame, about: the helper keeps only the last position
            timer.timeout.connect(guard("drag poll", pollDrag));
            drag = { con: con, timer: timer, busy: false, plan: null, rect: "", shape: 0, resize: null };
            log("DRAG " + conCaption(con));
            dragCursor(true);
            dragState(s);
            if (drag) timer.start();
        }));
    }

    // ---- i3's mouse resize of tiled windows (click.c, resize.c; docs/spec-tiling-resize.md) ------
    // Meta+right on a tiled window, or in the gap beside one: the helper takes the press and runs
    // the hidden "Tiling Resize" action. As in i3, nothing changes while the pointer moves: a 2 px
    // bar follows it along the boundary, and the shares change once at the release.

    // The tiles' smallest extent along o: windows' minimums (frameMin, with the inner gap) added
    // up along a split and the largest across it, as minOf does for a projection.
    function minExtent(c, o) {
        if (c.win !== null) { var fm = frameMin(wins[c.win]); return (o === "h" ? fm.w : fm.h) + gaps().inner; }
        var vals = c.nodes.filter(function (k) { return conRect(k).width > 0; }).map(function (k) { return minExtent(k, o); });
        return vals.reduce(function (a, b) { return c.layout === o ? a + b : Math.max(a, b); }, 0);
    }
    // floating_mod_on_tiled_client: the nearest of the four edges to the press, no thirds, no
    // limit. Of the edges with something to resize against (spec A, beyond i3, which takes the
    // nearest and does nothing if it has no neighbour); a tie does nothing. The distance is
    // absolute: a press in the gap is outside the frame.
    function resizeEdge(con, x, y) {
        var r = conRect(con), d = {};
        d[Tree.RIGHT] = r.x + r.width - x; d[Tree.LEFT] = x - r.x;
        d[Tree.DOWN] = r.y + r.height - y; d[Tree.UP] = y - r.y;
        var best = null, tie = false;
        [Tree.RIGHT, Tree.LEFT, Tree.DOWN, Tree.UP].forEach(function (dir) {
            var dist = Math.abs(d[dir]);
            if (!best || dist < best.dist) { best = { dir: dir, dist: dist }; tie = false; }
            else if (dist === best.dist) tie = true;
        });
        if (!best || tie) return null;
        // i3's: the nearest edge, and nothing if it has nothing to resize against (§9 Z1, redo
        // stage 6; before, the nearest edge that had a neighbour).
        var part = model.resizeParticipants(con, best.dir);
        return part ? { dir: best.dir, part: part, dist: best.dist } : null;
    }
    // A ring press (§9 Z3, i3's tiling_resize on a border): the side pressed, from the helper.
    function resizeSide(con, side) {
        var dir = { top: Tree.UP, bottom: Tree.DOWN, left: Tree.LEFT, right: Tree.RIGHT }[side];
        if (!dir) return null;
        var part = model.resizeParticipants(con, dir);
        return part ? { dir: dir, part: part, dist: 0 } : null;
    }
    // resize_graphical_handler's set-up: the boundary is the middle of the gap between the
    // participants' descended-focused leaves (a split's own rect has no gaps within it).
    function resizePlan(con, x, y, side) {
        var ws = Tree.wsOf(con);
        // i3 refuses a resize between containers of different fullscreen modes; here, while a window
        // is fullscreen on the workspace, none.
        if (model.fullscreenOn(ws)) return null;
        var e = side ? resizeSide(con, side) : resizeEdge(con, x, y);
        if (!e) return null;
        var o = e.dir === Tree.LEFT || e.dir === Tree.RIGHT ? "h" : "v", part = e.part;
        var ff = model.descendFocused(part.first), fs = model.descendFocused(part.second);
        if (ff.win === null || fs.win === null || !wins[ff.win] || !wins[fs.win]) return null;
        var a = conRect(ff), b = conRect(fs), f = conRect(part.first), sr = conRect(part.second), inner = gaps().inner;
        var start = o === "h" ? b.x - Math.floor((b.x - (a.x + a.width)) / 2) : b.y - Math.floor((b.y - (a.y + a.height)) / 2);
        // Kept inside the two participants' tiles less each one's minimum, so a release can't ask
        // for what KWin's tiles refuse (i3 keeps the bar 25 px inside the output).
        var lo = (o === "h" ? f.x : f.y) - inner / 2 + minExtent(part.first, o);
        var hi = (o === "h" ? sr.x + sr.width : sr.y + sr.height) + inner / 2 - minExtent(part.second, o);
        if (lo > hi) lo = hi = start;
        // parent size = the two tiles' extent / their shares (con_rect_size_in_orientation(parent))
        var n = part.first.parent.nodes.length;
        var shares = (part.first.percent || 1 / n) + (part.second.percent || 1 / n);
        var ext = o === "h" ? f.width + sr.width : f.height + sr.height;
        return { o: o, dir: e.dir, part: part, start: Math.round(start), lo: lo, hi: hi, second: sr, size: (ext + 2 * inner) / shares };
    }
    function resizePos(rz, x, y) { return Math.min(Math.max(rz.o === "h" ? x : y, rz.lo), rz.hi); }
    // i3's helprect: along the second participant, 2 px wide.
    function resizeBar(rz, pos) {
        var r = rz.second;
        return rz.o === "h" ? { x: pos - 1, y: r.y, width: 2, height: r.height } : { x: r.x, y: pos - 1, width: r.width, height: 2 };
    }
    function resizeState(s) {
        var f = String(s).split(" "), phase = f[0], x = Number(f[2]), y = Number(f[3]), rz = drag.resize;
        if (phase === "resize" || phase === "drop") {
            if (model.byWin[f[1]] !== drag.con) { endDrag("its window is gone"); return; }
            var pos = resizePos(rz, x, y);
            if (phase === "resize") { indicate(resizeBar(rz, pos)); return; }
            var px = Math.round(pos - rz.start), part = rz.part, ws = Tree.wsOf(part.first);
            // The tree changed under the drag (a participant closed, a window opened between):
            // the two found at the press are no longer the boundary's.
            var now = model.resizeParticipants(drag.con, rz.dir);
            if (!now || now.first !== part.first || now.second !== part.second) { endDrag("the layout changed, no resize"); return; }
            var done = px !== 0 && model.resizeNeighbouring(part.first, part.second, px, rz.size);
            endDrag(px === 0 ? "no change" : done ? "resized " + (rz.o === "h" ? "width" : "height") + " " + px + " px of " + Math.round(rz.size) :
                                                    "refused " + px + " px");
            if (done) schedule(ws);
            return;
        }
        endDrag(phase === "cancel" ? "cancelled" : "ended");
    }
    // The hidden action: a Meta+right press. Nothing to resize against (or fullscreen): the press
    // was nothing, and the helper holds it until the release, as a tiling drag with nowhere to drop.
    function startResize() {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "State", guard("resize start", function (s) {
            var f = String(s).split(" "), con = model.byWin[f[1]];
            if (f[0] !== "resize" || drag) return;
            // f[4]: the ring's side pressed (Z3), or "-" for Meta+right's nearest edge (Z1).
            var x = Number(f[2]), y = Number(f[3]), side = f[4] && f[4] !== "-" ? f[4] : null;
            var rz = con && con.type === "con" && wins[con.win] ? resizePlan(con, x, y, side) : null;
            if (!rz) { log("RESIZE not started: nothing to resize against" + (side ? " on the " + side : "")); callDBus(DRAG[0], DRAG[1], DRAG[2], "Cancel"); return; }
            var timer = new QTimer();
            timer.interval = 16;
            timer.timeout.connect(guard("resize poll", pollDrag));
            drag = { con: con, timer: timer, busy: false, plan: null, rect: "", shape: rz.o === "h" ? 1 : 2, resize: rz };
            log("RESIZE " + conCaption(con) + " " + (rz.o === "h" ? "width" : "height") + " at " + rz.start);
            // i3 warps the pointer onto the bar (spec D): along the boundary's axis only.
            callDBus(DRAG[0], DRAG[1], DRAG[2], "Warp", Math.round(rz.o === "h" ? rz.start : x), Math.round(rz.o === "h" ? y : rz.start));
            dragCursor(true, drag.shape);
            indicate(resizeBar(rz, rz.start));
            timer.start();
        }));
    }

    // ---- the pointer (docs/spec-redo-2-pointer.md, A) --------------------------------------

    // i3's check_crossing_screen_boundary (handlers.c): with focus follows mouse, the pointer
    // moving onto another output over the root window or a dock focuses that output's visible
    // workspace: its fullscreen window, else its last focus, or the empty workspace, with no
    // warp (the pointer is there). Over a tiling or floating window, KWin's own focus follows
    // mouse activates it (§5 B1), a turn later (probe 91). Over an override-redirect window (a
    // popup spanning the boundary) the model's focus moves and the popup keeps the keyboard (D7).
    // Per motion this costs one rectangle test per output; the hit test runs only at a crossing.
    // Nothing while a tiling drag or resize runs (the helper holds the pointer), and until
    // screensChanged has reseeded the output seen after a change. kwin-i3's own warp needs no
    // mask: it goes to the output that has the focus, so its crossing finds nothing to change.
    var pointerOutput = null;   // the output the pointer was last seen on, by name
    function focusFollowsMouse() {
        var p = String(options.focusPolicy);
        return p !== "0" && p !== "ClickToFocus";
    }
    function seedPointer() {
        var s = pointerOn();
        pointerOutput = s ? s.name : null;
    }
    function pointerMoved() {
        var p = workspace.cursorPos, s = screenAt(p.x, p.y);
        if (!s) return;
        var was = pointerOutput;
        pointerOutput = s.name;
        if (was === null || was === s.name || drag || !focusFollowsMouse()) return;
        var under = windowUnder(p.x, p.y, s);
        if (under && wins[id(under)]) return;           // KWin's focus follows mouse takes it (B1)
        var num = deskNum(workspace.currentDesktopForScreen(s));
        if (num < 1 || num > NAMES.length) return;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, s);
        var ws = wsModel(num), target = model.fullscreenOn(ws) || model.descendFocused(ws);
        if (model.focused === target) return;
        model.activate(target);
        log("POINTER onto " + s.name + (under ? " over " + shortCaption(under) : "") + ": the focus follows to workspace " + num);
        wantFocus();
    }
    // The topmost window under a point, on the output's visible desktop; null for the bare root.
    function windowUnder(x, y, s) {
        var order = workspace.stackingOrder, desk = workspace.currentDesktopForScreen(s);
        for (var i = order.length - 1; i >= 0; i--) {
            var w = order[i];
            if (w.deleted || w.minimized || w.hidden || w.output !== s) continue;
            if (!w.onAllDesktops && w.desktops.indexOf(desk) < 0) continue;
            var g = w.frameGeometry;
            if (x >= g.x && x < g.x + g.width && y >= g.y && y < g.y + g.height) return w;
        }
        return null;
    }
    // i3's root click (click.c): the desktop window activated by a click (Show Desktop off)
    // focuses its output's visible workspace; applyFocus then takes the keyboard from the
    // desktop (§5 B4; its Show Desktop check leaves Plasma's edit mode alone). A panel is never
    // activated by KWin, so a click on it changes nothing, as in i3.
    function desktopActivated(w) {
        var s = w.output;
        if (!s) return;
        var num = deskNum(workspace.currentDesktopForScreen(s));
        if (num < 1 || num > NAMES.length) return;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, s);
        var ws = wsModel(num);
        model.activate(model.fullscreenOn(ws) || model.descendFocused(ws));
        log("ACTIVE " + shortCaption(w) + " (the desktop): the focus goes to workspace " + num);
        wantFocus();
    }
    // i3's start (main.c): the focus on the output under the pointer, at its workspace's focus
    // (§12 P2, §5 E1).
    function focusUnderPointer() {
        var s = pointerOn() || workspace.activeScreen;
        var num = deskNum(workspace.currentDesktopForScreen(s));
        if (num < 1 || num > NAMES.length) return;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, s);
        var ws = wsModel(num);
        model.activate(model.fullscreenOn(ws) || model.descendFocused(ws));
    }
    // While an override-redirect window has the keyboard (KRunner, a menu, a panel popup), no
    // key of kwin-i3's fires, as i3's bindings don't while dmenu holds it; Escape first (§5
    // A3-A5; Paul's call 59: panel popups included). The safety valve and the dump are not keys.
    function keyboardHeld(name) {
        var a = workspace.activeWindow;
        if (!a || a.deleted || wins[id(a)] || Rules.i3Kind(a) !== "override-redirect") return false;
        log("KEY " + name + " ignored: " + shortCaption(a) + " has the keyboard");
        return true;
    }

    function inMode(name) {
        if (!mode || MODE_ACTIONS[name]) return false;
        log("KEY " + name + " ignored: the " + mode + " mode is on");
        return true;
    }

    function act(name, fn) {
        return guard(name, function () {
            if (keyboardHeld(name) || inMode(name)) return;
            var con = focusedCon();
            var before = con ? Tree.wsOf(con) : null, focusBefore = model.focused;
            fn(con);
            var f = model.focused;
            schedule(before);
            if (f) schedule(f.type === "ws" ? f : Tree.wsOf(f));
            // Every workspace a move can touch is rescheduled; reconcile is idempotent.
            scheduleAll();
            // A key that left kwin-i3's focus where it was (a split, a resize, a layout toggle)
            // takes no focus from an open window kwin-i3 doesn't manage (Yakuake, KRunner, a
            // dialog): only keys that move the focus do, as in i3 (docs/spec-windows-placing-themselves.md).
            var a = workspace.activeWindow;
            var keep = model.focused === focusBefore && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock;
            if (!keep) wantFocus(true);
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
                if (n.type === "floating") { untile(w); floatAtRecord(w); clampFloating(w); }
            }
        },
        "Focus Mode Toggle": function () { model.focusModeToggle(); },
        // i3's fullscreen toggle and kill: KWin's own actions, on its active window, managed or
        // not; a stock Plasma binds neither key (docs/spec-own-keys.md).
        "Fullscreen": function () { invoke("Window Fullscreen"); },
        "Close": function () { invoke("Window Close"); },
        // The helper's mode (plugin/resizemode.cpp): without it nothing happens, and the load
        // report says the mode needs the plugins (checkHelperKeys).
        "Resize Mode": function () { callDBus(MODE[0], MODE[1], MODE[2], "SetMode", mode ? "" : "resize"); },
        "Exit": function () { callDBus("org.kde.LogoutPrompt", "/LogoutPrompt", "org.kde.LogoutPrompt", "promptLogout"); },
        "Terminal": function () { callDBus(MODE[0], MODE[1], MODE[2], "LaunchTerminal"); },
        "Launcher": function () { callDBus("org.kde.krunner", "/App", "org.kde.krunner.App", "display"); },
        // i3's resize mode, as direct keys (a script can't have mode-only keys): resizeStep ppt,
        // or floatingStep px on a floating window.
        "Shrink Width": function (c) { if (!growFloating(c, "width", -1)) model.resize(c, "width", -step()); },
        "Grow Width": function (c) { if (!growFloating(c, "width", 1)) model.resize(c, "width", step()); },
        "Shrink Height": function (c) { if (!growFloating(c, "height", -1)) model.resize(c, "height", -step()); },
        "Grow Height": function (c) { if (!growFloating(c, "height", 1)) model.resize(c, "height", step()); },
        // i3's reload: KWin reconfigures (reparses kwinrc), and settingsChanged below takes the
        // new values. The config form saves without telling KWin (docs/spec-settings.md).
        "Reload Settings": function () { callDBus("org.kde.KWin", "/KWin", "org.kde.KWin", "reconfigure"); },
    };
    Object.keys(DIRS).forEach(function (d) {
        var cap = d.charAt(0).toUpperCase() + d.slice(1);
        actions["Focus " + cap] = function () { model.focusDir(DIRS[d], Settings.get("focusWrapping")); };
        actions["Move " + cap] = function (c) { if (!nudgeFloating(c, d)) model.move(c, DIRS[d]); };
    });

    // Meta+N: show workspace N where it lives and focus it; an empty, hidden one opens on the
    // focused output, as i3's workspace_show (§4 S4); with nothing focused, KWin's active output.
    function gotoWorkspace(n) {
        Workspaces.ensure(n);
        if (!deskOf(n)) return;
        if (!Workspaces.showing(n)) {
            var m = model.workspaces[n], fws = focusedWs();
            var occupied = m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(n);
            // An empty one opens on its assigned monitor if that is here, else the focused one.
            var s = occupied ? Workspaces.outputOf(n) : Workspaces.assignedScreen(n) || (fws ? outputOf(fws) : workspace.activeScreen);
            // An occupied workspace keeps its home even while that monitor is away, or it would
            // never go back (code review: reproduced with Meta+2 during an unplug).
            if (!occupied) Workspaces.claimHome(n, s);
            showOn(deskOf(n), s);
        }
        var ws = wsModel(n);
        // The desktop switch above makes KWin activate the window it last used there, which
        // focusWin takes into the model before this line; under a fullscreen window that is a
        // newcomer sent there while hidden, and activating it drops the fullscreen window
        // from the top layer. As in i3, a fullscreen window keeps the focus on its workspace
        // (con_fullscreen_permits_focusing; docs/spec-fullscreen-tree.md).
        var fs = model.fullscreenOn(ws);
        model.activate(fs || model.descendFocused(ws));
    }

    // Meta+Shift+N: send the window to workspace N, on N's monitor (i3ws moveToWorkspace); an
    // empty, hidden N comes to the window's monitor.
    function moveToWorkspace(n, con) {
        if (!con) return;
        Workspaces.ensure(n);
        if (!deskOf(n)) return;
        if (!Workspaces.showing(n)) {
            var m = model.workspaces[n];
            var occupied = m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(n);
            if (!occupied) Workspaces.claimHome(n, outputOf(Tree.wsOf(con)));
        }
        model.moveToWorkspace(con, wsModel(n));
    }

    // ---- workspace commands with no default key (docs/spec-workspace-commands.md) -------------

    // The focused workspace's number: the focused con's, else what the active monitor shows.
    function focusedWsNum() {
        var f = model.focused ? Tree.wsOf(model.focused) : null;
        return f ? f.num : deskNum(workspace.currentDesktopForScreen(workspace.activeScreen));
    }
    // i3's previous_workspace_name, if that desktop still exists.
    function previousWs() {
        var p = model.previousWs;
        return p && p <= Math.min(workspace.desktops.length, NAMES.length) ? p : null;
    }
    // Meta+N and Meta+Shift+N with workspaceAutoBackAndForth (i3's maybe_back_and_forth): N is
    // the focused workspace, so go (send the window) back instead.
    function autoBack(n) {
        if (!Settings.get("workspaceAutoBackAndForth") || n !== focusedWsNum()) return n;
        return previousWs() || n;
    }
    // A workspace exists (i3: it has windows or is shown) and, for on-output, lives there.
    function existingWorkspaces(screen) {
        var out = [];
        for (var n = 1; n <= Math.min(workspace.desktops.length, NAMES.length); n++) {
            var m = model.workspaces[n];
            if (!((m && (m.nodes.length || m.floating.length)) || Workspaces.showing(n))) continue;
            if (screen && Workspaces.outputOf(n) !== screen) continue;
            out.push(n);
        }
        return out;
    }
    // With con, i3's "move container to workspace next" (cmd_move_con_to_workspace): the window
    // goes there and focus stays behind, as for Meta+Shift+N.
    function stepWorkspace(dir, onOutput, con) {
        var cur = focusedWsNum();
        var t = Tree.nextWorkspace(existingWorkspaces(onOutput ? Workspaces.outputOf(cur) : null), cur, dir);
        if (!t) return;
        if (con) moveToWorkspace(t, con); else gotoWorkspace(t);
    }
    // The output a direction names from `from` (i3's get_output_next), or "next" (KWin's order,
    // wrapping: get_output_next_wrap) or "primary" (the first in that order); null for none, or
    // the same output.
    function screenBy(spec, from) {
        var all = workspace.screens, i = all.indexOf(from), t = null;
        if (spec === "next") t = all.length > 1 ? all[(i + 1) % all.length] : null;
        else if (spec === "primary") t = all[0];
        else t = Workspaces.screenToward(from, spec);
        return t && t !== from ? t : null;
    }
    // The screen next to the focused workspace's, in a direction (or next, primary).
    function screenFrom(spec) { return screenBy(spec, Workspaces.outputOf(focusedWsNum())); }
    // The model workspace an output shows.
    function visibleWsOn(t) {
        var num = deskNum(workspace.currentDesktopForScreen(t));
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, t);
        return wsModel(num);
    }
    // i3's cmd_focus_output: show the target's visible workspace, focusing its focused window.
    function focusOutput(dir) {
        var t = screenFrom(dir);
        if (t) gotoWorkspace(deskNum(workspace.currentDesktopForScreen(t)));
    }
    // i3's con_move_to_output: to the target's visible workspace; focus stays behind.
    function moveToOutput(spec, con) {
        var t = con ? screenBy(spec, outputOf(Tree.wsOf(con))) : null;
        if (t) model.moveToWorkspace(con, visibleWsOn(t));
    }
    // i3's workspace_move_to_output: the focused workspace lives on the target and is shown
    // there, focused; the monitor it left, if it showed it, shows the one it showed most recently
    // that still lives there, else an unused one. Reconcile's relocate carries the windows.
    function moveWorkspaceToOutput(spec) {
        var n = focusedWsNum(), src = Workspaces.outputOf(n), t = screenBy(spec, src);
        if (!t) return;
        var wasShown = Workspaces.showing(n) === src;
        // i3's focus stack holds only workspaces with windows (an empty hidden one is closed):
        // the most recently shown of those, else the lowest, else an unused one.
        function candidate(k) {
            var m = model.workspaces[k];
            return k !== n && deskOf(k) && m && (m.nodes.length || m.floating.length) &&
                   Workspaces.outputOf(k) === src && !Workspaces.showing(k);
        }
        var back = null;
        if (wasShown) {
            back = (shownBefore[src.name] || []).filter(candidate)[0] || null;
            for (var k = 1; !back && k <= Math.min(workspace.desktops.length, NAMES.length); k++)
                if (candidate(k)) back = k;
            if (!back) back = unusedWorkspace(src);
            if (!back) { log("WSMOVE refused: no workspace left for " + src.name); return; }
        }
        Workspaces.setHome(n, t);
        if (back) showOn(deskOf(back), src);
        showOn(deskOf(n), t);
        var ws = wsModel(n), fs = model.fullscreenOn(ws);
        model.activate(fs || model.descendFocused(ws));
        // i3 shows the source's next workspace, then this one: the previous is the former.
        if (back) model.previousWs = back;
        log("WSMOVE " + n + " to " + t.name + (back ? ", " + src.name + " shows " + back : ""));
    }

    var SHIFTED = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];
    // Actions registered before and dead (2026-10-24: a Shift+symbol key fires only its symbol form).
    var RETIRED = ["kwin-i3 Move Right (;)"].concat(NAMES.map(function (k, i) { return "kwin-i3 Move to Workspace " + (i + 1); }));

    var KEYS = {
        "Split H": ["Meta+H"], "Split V": ["Meta+V"], "Toggle Split": ["Meta+E"],
        "Floating Toggle": ["Meta+Shift+Space"], "Focus Mode Toggle": ["Meta+Space"],
        "Fullscreen": ["Meta+F"], "Close": ["Meta+Shift+Q"],
        "Focus Left": ["Meta+Left", "Meta+J"], "Focus Down": ["Meta+Down", "Meta+K"],
        "Focus Up": ["Meta+Up", "Meta+L"], "Focus Right": ["Meta+Right", "Meta+;"],
        "Move Left": ["Meta+Shift+Left", "Meta+Shift+J"], "Move Down": ["Meta+Shift+Down", "Meta+Shift+K"],
        "Move Up": ["Meta+Shift+Up", "Meta+Shift+L"],
        // Shift+; arrives as ":": only Meta+: fires, Meta+Shift+; never does (probed 2026-10-24,
        // KWin 6.7.5; i3ws registered both). The same holds for Shift+digit below.
        "Move Right": ["Meta+Shift+Right", "Meta+:"],
        // i3's resize mode (§8 K4; redo stage 5): Meta+R enters, then the helper takes J K L ; and
        // the arrows and runs these four, unbound (a user who wants them flat binds them).
        "Resize Mode": ["Meta+R"],
        "Shrink Width": [], "Grow Height": [], "Shrink Height": [], "Grow Width": [],
        "Reload Settings": ["Meta+Shift+C"],
        // i3's exit, terminal and launcher (K17, K18): Plasma's logout prompt, the default
        // terminal, KRunner.
        "Exit": ["Meta+Shift+E"], "Terminal": ["Meta+Return"], "Launcher": ["Meta+D"],
    };

    var UNBOUND = {
        "Workspace Back and Forth": function () { var p = previousWs(); if (p) gotoWorkspace(p); },
        "Move to Workspace Back and Forth": function (c) { var p = previousWs(); if (p) moveToWorkspace(p, c); },
        "Workspace Next": function () { stepWorkspace(1, false); },
        "Workspace Prev": function () { stepWorkspace(-1, false); },
        "Workspace Next on Output": function () { stepWorkspace(1, true); },
        "Workspace Prev on Output": function () { stepWorkspace(-1, true); },
        "Move to Workspace Next": function (c) { if (c) stepWorkspace(1, false, c); },
        "Move to Workspace Prev": function (c) { if (c) stepWorkspace(-1, false, c); },
        "Move to Workspace Next on Output": function (c) { if (c) stepWorkspace(1, true, c); },
        "Move to Workspace Prev on Output": function (c) { if (c) stepWorkspace(-1, true, c); },
    };
    ["left", "right", "up", "down", "next", "primary"].forEach(function (d) {
        var cap = d.charAt(0).toUpperCase() + d.slice(1);
        UNBOUND["Focus Output " + cap] = function () { focusOutput(d); };
        UNBOUND["Move to Output " + cap] = function (c) { moveToOutput(d, c); };
        UNBOUND["Move Workspace to Output " + cap] = function () { moveWorkspaceToOutput(d); };
    });
    // i3's --no-auto-back-and-forth (§4 S5): Meta+N's and Meta+Shift+N's work without the
    // setting's back-and-forth, unbound as in i3's config.
    NAMES.forEach(function (k, i) {
        var n = i + 1;
        UNBOUND["Workspace " + n + " (no back-and-forth)"] = function () { gotoWorkspace(n); };
        UNBOUND["Move to Workspace " + n + " (no back-and-forth)"] = function (c) { moveToWorkspace(n, c); };
    });

    // KWin's own actions run on KWin's active window, so not through act(): its focus request
    // would activate kwin-i3's focused window before KWin's queued action ran, and a window
    // kwin-i3 doesn't manage would lose the key to it (closed the wrong one; 33-own-keys.sh).
    // The mode, exit, terminal and launcher act on no window either.
    var KWIN_OWN = { "Fullscreen": true, "Close": true, "Resize Mode": true, "Exit": true, "Terminal": true, "Launcher": true };
    function askMode() {
        callDBus(MODE[0], MODE[1], MODE[2], "Mode", guard("mode", function (m) {
            m = String(m || "");
            if (m === mode) return;
            mode = m;
            log("MODE " + (mode || "off"));
        }));
    }

    function registerKeys() {
        Object.keys(KEYS).forEach(function (name) {
            var fn = KWIN_OWN[name] ? guard(name, function () { if (keyboardHeld(name) || inMode(name)) return; actions[name](); log("ACTION " + name); })
                                    : act(name, actions[name]);
            // No default key (the mode's four): registered all the same, for the mode and the Keys page.
            (KEYS[name].length ? KEYS[name] : [""]).forEach(function (key, i) {
                var action = "kwin-i3 " + name + (i ? " (" + key.split("+").pop() + ")" : "");
                registerShortcut(action, "kwin-i3: " + name.toLowerCase() + (i ? " (" + key + ")" : ""), key, fn);
            });
        });
        NAMES.forEach(function (k, i) {
            var n = i + 1;
            var go = act("Workspace " + n, function () { gotoWorkspace(autoBack(n)); });
            var mv = act("Move to Workspace " + n, function (c) { moveToWorkspace(autoBack(n), c); });
            registerShortcut("kwin-i3 Workspace " + n, "kwin-i3: workspace " + n, "Meta+" + k, go);
            // Meta+Shift+digit arrives as Meta+<symbol> (US layout: Meta+!); the Meta+Shift+digit
            // action that stood beside this one until 2026-10-24 never fired. The id keeps its
            // "(symbol)" so an install keeps the key it already holds.
            registerShortcut("kwin-i3 Move to Workspace " + n + " (symbol)",
                             "kwin-i3: move to workspace " + n, "Meta+" + SHIFTED[i], mv);
        });
        // No default key, as in i3 (docs/spec-workspace-commands.md): bound by the user in
        // System Settings > Shortcuts.
        Object.keys(UNBOUND).forEach(function (name) {
            registerShortcut("kwin-i3 " + name, "kwin-i3: " + name.toLowerCase(), "", act(name, UNBOUND[name]));
        });
        // The retired actions leave KWin's shortcut list (and Plasma's Shortcuts page): never
        // registered again, so this is a no-op after the first load without them.
        RETIRED.forEach(function (a) {
            callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "unregister", "kwin", a);
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

    // ---- the load-time report (docs/spec-taken-keys.md) ---------------------------------------

    // One notification per load for what the user should fix in their setup. Each check opens a
    // part and closes it with its lines once its D-Bus replies are in; the last close sends it.
    var report = { open: 0, parts: [] };
    function reportOpen() { report.open++; }
    function reportClose(title, lines) {
        if (lines.length) report.parts.push({ title: title, lines: lines });
        if (--report.open > 0 || !report.parts.length) return;
        var parts = report.parts;
        report.parts = [];
        // No "kwin-i3:" in the summary: Plasma heads the popup with the app name and icon.
        function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
        var summary = parts.length === 1 ? cap(parts[0].title) : parts.length + " things to fix in this setup";
        if (parts.length > 1) parts.forEach(function (p) { p.title = cap(p.title) + ":"; });
        var body = parts.map(function (p) {
            return (parts.length > 1 ? p.title + "\n" : "") + p.lines.join("\n");
        }).join("\n\n");
        callDBus("org.freedesktop.Notifications", "/org/freedesktop/Notifications",
                 "org.freedesktop.Notifications", "Notify", "kwin-i3", 0, "view-split-left-right", summary, body, [], {}, -1);   // the settings page's icon
        log("REPORT " + summary);
    }

    // Without the helper plugin the keys stay US symbols: a layout that isn't US is reported
    // (docs/spec-keyboard-layouts.md). Its part closes once, on the answer or after 3 s, so a
    // D-Bus call that never answers can't hold back the rest of the report.
    function checkLayoutKeys() {
        if (!Settings.get("warnTakenKeys")) return;
        reportOpen();
        var closed = false;
        function close(title, lines) {
            if (closed) return;
            closed = true;
            reportClose(title, lines);
        }
        later(3000, function () { close("", []); });
        callDBus("org.kde.KWin", "/Plugins", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin.Plugins", "LoadedPlugins",
                 guard("layout keys", function (loaded) {
            if (String(loaded).indexOf("kwini3helper") >= 0) { log("LAYOUTS fitted by the helper"); close("", []); return; }
            callDBus("org.kde.keyboard", "/Layouts", "org.kde.KeyboardLayouts", "getLayoutsList", guard("layout keys", function (list) {
                var names = (list || []).map(function (l) { return String(l[0]); });
                var other = names.filter(function (n) { return n !== "us"; });
                log("LAYOUTS " + names.join(",") + (other.length ? ", not fitted (no helper)" : ""));
                close("its keys may not fit the keyboard layout (" + other.join(", ") + ")", other.length ? [
                    "Meta+Shift+1 … 0 and Meta+; are set for a US keyboard. Install kwin-i3's plugins " +
                    "(make plugin-install) to fit them to yours, or set them on kwin-i3's settings page."] : []);
            }));
        }));
    }

    // A key another action also holds is given to kwin-i3's action too (registerShortcut always
    // returns true, and shortcutKeys shows it), but a press runs only the first holder's.
    // KGlobalAccel.action(key) names that one (probed 2026-10-24), but a holder whose component
    // isn't active (its app not running and not launched by kglobalaccel) doesn't block the key:
    // kwin-i3's fires (35-taken-keys.sh). kwin-i3's current keys come from kglobalaccel, so a
    // key the user rebound is the one checked.
    // The terminal the helper launches (kdeglobals' TerminalService), asked at load for the
    // taken-key check; "" without the helper.
    var terminalService = "";
    function sameLaunch(key, h) {
        if (String(h[1]) !== "_launch") return false;
        var mine = KEYS.Launcher.concat(KEYS.Terminal), k = KeyName.of(key);
        if (KEYS.Launcher.indexOf(k) >= 0) return String(h[0]).indexOf("krunner") >= 0;
        if (KEYS.Terminal.indexOf(k) >= 0) return !!terminalService && String(h[0]) === terminalService;
        return mine.indexOf(k) >= 0 && false;
    }
    function checkTakenKeys() {
        if (!Settings.get("warnTakenKeys")) { log("TAKEN not checked (warnTakenKeys off)"); return; }
        reportOpen();
        callDBus(MODE[0], MODE[1], MODE[2], "TerminalService", guard("terminal", function (t) { terminalService = String(t || ""); }));
        callDBus("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component", "allShortcutInfos",
                 guard("taken keys", function (infos) {
            var mine = [], taken = [];
            (infos || []).forEach(function (i) {
                if (String(i[0]).indexOf("kwin-i3 ") === 0) (i[6] || []).forEach(function (k) { if (k) mine.push(k); });
            });
            var left = mine.length;
            function done() {
                taken.sort().forEach(function (t) { log("TAKEN " + t); });
                log("TAKEN checked " + mine.length + " keys, " + taken.length + " taken");
                if (taken.length) taken.push("Free them in System Settings > Shortcuts, or run `make take-keys` " +
                                             "in kwin-i3's folder. Turn this notice off in kwin-i3's settings.");
                var n = taken.length - 1;
                reportClose(n + (n === 1 ? " key is" : " keys are") + " taken by other shortcuts", taken);
            }
            if (!left) { done(); return; }
            mine.forEach(function (k) {
                callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "action", k,
                         guard("taken keys", function (h) {
                    function one() { if (--left === 0) done(); }
                    if (!h || !h[1] || String(h[1]).indexOf("kwin-i3 ") === 0) { one(); return; }
                    // A holder that launches what the kwin-i3 action launches (Paul's call 63):
                    // KRunner's own _launch on the Launcher's key, the default terminal's on the
                    // Terminal's. Both fire the same thing: nothing to report.
                    if (sameLaunch(k, h)) { log("TAKEN-SAME " + KeyName.of(k) + ": " + h[3] + " (" + h[2] + ")"); one(); return; }
                    callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "getComponent", h[0],
                             guard("taken keys", function (path) {
                        callDBus("org.kde.kglobalaccel", String(path), "org.kde.kglobalaccel.Component", "isActive",
                                 guard("taken keys", function (on) {
                            if (on) taken.push(KeyName.of(k) + ": " + h[3] + " (" + h[2] + ")");
                            else log("TAKEN-INACTIVE " + KeyName.of(k) + ": " + h[3] + " (" + h[2] + ")");
                            one();
                        }));
                    }));
                }));
            });
        }));
    }

    // Plasma's "Switch desktops independently for each screen" (off by default): with it off a
    // desktop switch changes every monitor, so with two or more, login numbering alone puts
    // both on workspace 2 and windows tile on the wrong one (docs/spec-per-output-desktops.md).
    // Reported, never set: a script's value would last only to the next reconfigure. At load in
    // the report; later, when it becomes a problem (a second monitor, the setting turned off),
    // once per load on its own.
    var perOutputBad = false, perOutputLater = false;
    // The resize mode (Meta+R) and the terminal (Meta+Return) are the helper's (§8 K4, K18): without
    // it, said once at load (§13).
    function checkHelperKeys() {
        if (!Settings.get("warnTakenKeys")) return;
        reportOpen();
        var closed = false;
        function close(lines) { if (!closed) { closed = true; reportClose("two keys need the plugins", lines); } }
        later(3000, function () { close([]); });
        callDBus("org.kde.KWin", "/Plugins", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin.Plugins", "LoadedPlugins",
                 guard("helper keys", function (loaded) {
            if (String(loaded).indexOf("kwini3helper") >= 0) { close([]); return; }
            log("HELPER not loaded: the resize mode and the terminal key do nothing");
            close(["Meta+R (i3's resize mode) and Meta+Return (the default terminal) need kwin-i3's plugins: make plugin-install."]);
        }));
    }
    // The old ignore lists' own entries are read as floating rules now (§3 R5; Paul's call 43):
    // said once, at load, naming them. The old defaults are the built-in kinds and are not named.
    function checkOldIgnores() {
        var t = Rules.translated();
        reportOpen();
        reportClose("ignore entries now float", t.length ? ["kwin-i3 no longer keeps windows out by class or role; " +
            "these entries of yours float them instead: " + t.join(", ") + ". Write them as rules (forWindow) when you like."] : []);
        if (t.length) log("RULES old ignore entries read as floating: " + t.join(", "));
    }
    function checkPerOutput(atLoad) {
        var was = perOutputBad, n = workspace.screens.length;
        perOutputBad = n >= 2 && !options.perOutputVirtualDesktops;
        log("PEROUTPUT " + (perOutputBad ? "off, " + n + " screens" : "ok"));
        var lines = ["With more than one monitor, kwin-i3 needs System Settings > Virtual Desktops > " +
                     "\"Switch desktops independently for each screen\" on. With it off, a desktop switch " +
                     "changes every monitor, and windows tile on the wrong one."];
        if (atLoad) { reportOpen(); reportClose("per-screen desktops are off", perOutputBad ? lines : []); return; }
        if (!perOutputBad || was || perOutputLater) return;
        perOutputLater = true;
        reportOpen();
        reportClose("per-screen desktops are off", lines);
    }

    // The setting turned on: each monitor showing a workspace that lives on another one (left
    // by the switches made while it was off) gets its own, as the setting takes effect where it
    // is set: the lowest workspace living there and shown nowhere, else an unused one. Windows
    // opened meanwhile stay on the workspaces they joined.
    function reshowHomes() {
        showHomes();
        log("PEROUTPUT on: each monitor shows its own");
        rememberShown();
        scheduleAll();
        wantFocus();
    }
    // A monitor showing a workspace whose home is another monitor shows one of its own instead
    // (or an unused one): per-monitor desktops turned on, or a desktop removed that two monitors
    // then showed (KWin gives every monitor that showed it the same next desktop).
    function showHomes() {
        workspace.screens.forEach(function (s) {
            var homes = Workspaces.homes(), h = homes[deskNum(workspace.currentDesktopForScreen(s))];
            if (!h || h === s.name) return;
            var pick = null;
            for (var n = 1; n <= NAMES.length && !pick; n++)
                if (deskOf(n) && homes[n] === s.name && !Workspaces.showing(n)) pick = n;
            if (!pick) pick = unusedWorkspace(s);
            if (pick) showOn(deskOf(pick), s);
        });
    }

    // ---- release (the safety valve) --------------------------------------------------------

    // Every step on its own: the safety valve must never stop half-way (code review).
    function release() {
        if (released) return;
        released = true;
        try { tellDrag(false); } catch (e) { log("ERROR in release (drag): " + e); }
        try { if (mode) callDBus(MODE[0], MODE[1], MODE[2], "SetMode", ""); } catch (e) { log("ERROR in release (mode): " + e); }
        Object.keys(wins).forEach(function (key) {
            var w = wins[key];
            try {
                untile(w);
                if (keptAbove[key]) w.keepAbove = false;
                giveBorder(w);
            } catch (e) { log("ERROR in release (window): " + e); }
        });
        workspace.screens.forEach(function (s) {
            workspace.desktops.forEach(function (d, i) {
                try {
                    var root = workspace.rootTile(s, d), rk = s.name + "/" + d.id;
                    if (!root) return;
                    // Roots kwin-i3 touched, and any left inset by gaps (a reload's predecessor):
                    // KWin's whole area and no padding again (review: the padding seen at the
                    // first reconcile can be our own gap, after a reload).
                    var full = { x: 0, y: 0, width: 1, height: 1 };
                    if (!(rk in touchedRoots) && sameRect(root.relativeGeometry, full)) return;
                    var stray = tiledWindowsOf(root, []);
                    stray.forEach(function (w) { root.unmanage(w); });
                    for (var n = 0; root.tiles.length && n < 256; n++) root.tiles[root.tiles.length - 1].remove();
                    root.relativeGeometry = full;
                    root.padding = 0;
                } catch (e) { log("ERROR in release (tiles): " + e); }
            });
        });
        log("RELEASED");
        log("ACTION Release");
    }

    // ---- dump (tools/capture, Meta+Shift+B) ------------------------------------------------

    // Everything needed to turn a bug seen live into a test, sent line by line to whoever owns
    // net.local.kwini3.dump (tools/capture). Never throws: a broken part says so and the rest goes.
    function dump() {
        // Collected, then sent in a few large calls: hundreds of small ones would each be a D-Bus
        // round on KWin's main thread (design review 23).
        var lines = [];
        function out(s) { lines.push(String(s)); }
        function part(name, fn) {
            out("== " + name);
            try { fn(); } catch (e) { out("ERROR in dump " + name + ": " + e); }
        }
        function rect(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
        out("DUMP BEGIN released=" + released + " debugLog=" + DEBUG_LOG);
        part("outputs", function () {
            workspace.screens.forEach(function (s) {
                out(s.name + " " + rect(s.geometry) + " shows " + deskNum(workspace.currentDesktopForScreen(s)) +
                    (s === workspace.activeScreen ? " active" : ""));
            });
            var c = workspace.cursorPos;
            out("cursor " + Math.round(c.x) + "," + Math.round(c.y));
            out("homes " + JSON.stringify(Workspaces.homes()));
        });
        part("tree", function () {
            Object.keys(model.workspaces).forEach(function (n) {
                var ws = model.workspaces[n];
                out("TREE " + n + " " + named(model.describe(n)));
                (function walk(c, depth) {
                    out(new Array(depth + 1).join("  ") + (c.win !== null ? named(String(c.win)) : c.type + " " + c.layout) +
                        " percent=" + (+c.percent).toFixed(4) + " focus=" + named(model.focusOrder(c).join(",")));
                    c.nodes.forEach(function (k) { walk(k, depth + 1); });
                })(ws, 1);
                ws.floating.forEach(function (f) { out("  ~" + named(String(f.win))); });
            });
        });
        part("windows", function () {
            var active = workspace.activeWindow;
            workspace.windowList().forEach(function (w) {
                var m = w.minSize;
                out([JSON.stringify(String(w.caption)), "class=" + w.resourceClass, "id=" + id(w),
                     !wins[id(w)] ? "not-in-tree" : model.byWin[id(w)] && model.byWin[id(w)].type === "floating" ? "floating" : "tiled",
                     "rule=" + Rules.classify(w),
                     "frame=" + rect(w.frameGeometry), "client=" + rect(w.clientGeometry),
                     "min=" + Math.round(m.width) + "x" + Math.round(m.height),
                     "output=" + (w.output ? w.output.name : "-"),
                     "desktops=" + w.desktops.map(deskNum).join("+"),
                     "tile=" + (w.tile ? rect(w.tile.absoluteGeometry) : "-"),
                     "expected=" + (expected[id(w)] ? "set" : "-"),
                     w.minimized ? "minimized" : "", w.fullScreen ? "fullscreen" : "",
                     w.transient ? "transient" : "", w.keepAbove ? "above" : "",
                     w === active ? "ACTIVE" : ""].filter(Boolean).join(" "));
            });
        });
        // The same facts as one JSON line, for tests/fuzz (one snapshot, ids rather than captions).
        part("json", function () {
            function r(g) { return [Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.height)]; }
            var active = workspace.activeWindow, j = { outputs: [], windows: [], ws: {} };
            workspace.screens.forEach(function (s) {
                j.outputs.push({ name: s.name, geom: r(s.geometry), shows: deskNum(workspace.currentDesktopForScreen(s)),
                                 active: s === workspace.activeScreen });
            });
            workspace.windowList().forEach(function (w) {
                j.windows.push({ id: id(w), caption: String(w.caption), rule: Rules.classify(w), managed: !!wins[id(w)],
                                 frame: r(w.frameGeometry), client: r(w.clientGeometry),
                                 min: [Math.round(w.minSize.width), Math.round(w.minSize.height)],
                                 output: w.output ? w.output.name : null, desktops: w.desktops.map(deskNum),
                                 tile: w.tile ? r(w.tile.absoluteGeometry) : null, minimized: !!w.minimized,
                                 // the rect kwin-i3 asks for in that tile: inside its padding (the frame, the gaps)
                                 want: w.tile ? r(windowRect(w.tile)) : null,
                                 fullscreen: !!w.fullScreen, active: w === active,
                                 // a fullscreen request KWin can't apply yet: resizable by its size
                                 // limits, but KWin says not (plan, policies: monitor returns)
                                 pending: !w.resizeable && !w.fullScreen && (w.minSize.width < w.maxSize.width ||
                                                                            w.minSize.height < w.maxSize.height) });
            });
            Object.keys(model.workspaces).forEach(function (n) {
                var ws = model.workspaces[n];
                j.ws[n] = { tiled: model.leaves(ws).map(function (l) { return String(l.win); }),
                            floating: ws.floating.map(function (f) { return String(f.win); }),
                            tree: named(model.describe(n)) };
            });
            out("JSON " + JSON.stringify(j));
        });
        part("log", function () { logRing.forEach(out); });
        out("DUMP END");
        for (var i = 0; i < lines.length; i += 200)
            callDBus("net.local.kwini3.dump", "/", "net.local.kwini3.dump", "Log", lines.slice(i, i + 200).join("\n"));
    }

    // ---- start -----------------------------------------------------------------------------

    // Read a root tile into a tree.adopt() spec; null if it holds nothing of ours.
    function specOf(tile, total, desk) {
        if (!tile.tiles.length) {
            // Only windows that really are on this desktop: KWin can leave a window in a tile
            // after its desktop changed (spike); those go through adoptWindow instead (review).
            var mine = tile.windows.filter(function (w) {
                return Rules.classify(w) === "tiling" && w.desktops.length === 1 && w.desktops[0] === desk;
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
        // No key: tools/capture (on Meta+Shift+B) invokes it, after starting its sink.
        registerShortcut("kwin-i3 Dump State", "kwin-i3: dump state for a bug report", "", dump);
        try { startRest(); }
        catch (e) { log("ERROR in start: " + e + (e.stack ? " " + e.stack : "") + "; releasing"); release(); }
    }

    // Windows already in KWin's tiles keep their layout (plan decision 5): at load, and when the
    // model is rebuilt after a desktop removal or reorder (KWin's tiles belong to desktops).
    function adoptTiled() {
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
    }
    // Then every other window, bottom of the stack first, so focus order follows stacking,
    // once the effect has said which were floating (decision 5c; 250 ms at most, without it).
    // stackingOrder can leave out a window that is still mapping, which then never got a
    // windowAdded either (it came before the script): windowList() supplies those (found by
    // 60-load.sh, after the live-desktop review saw a window left out). `done`: the line logged
    // when every window is adopted (the tests and captures wait for "kwin-i3 loaded").
    function adoptRest(m, done) {
        atLoadFloating = {};
        if (m && m.floating) m.floating.forEach(function (k) { atLoadFloating[k] = true; });
        var all = workspace.stackingOrder.slice();
        workspace.windowList().forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); });
        all.forEach(function (w) {
            if (!wins[id(w)]) adoptWindow(w);
            else model.focusWin(id(w));
        });
        atLoadFloating = {};
        if (workspace.activeWindow && wins[id(workspace.activeWindow)]) model.focusWin(id(workspace.activeWindow));
        log("ADOPTED " + (m ? "with the effect's floating set" : "without the effect"));
        var wasRebuild = rebuilding;
        rebuilding = false;
        if (wasRebuild) {
            // A desktop change while this rebuild waited (review of the change, finding 2): again.
            if (rebuildAgain || desktopIds().join() !== rebuiltFor) { rebuildAgain = false; startRebuild(); return; }
            if (options.perOutputVirtualDesktops) showHomes();     // finding 3
        }
        scheduleAll();
        wantFocus();
        log(done);
    }
    function adoptRestSoon(done) {
        checkFrame(function (m) {
            try { adoptRest(m, done); }
            catch (e) { log("ERROR in adopting the rest: " + e + (e.stack ? " " + e.stack : "") + "; releasing"); release(); }
        });
    }

    // A desktop removed or moved (docs/spec-desktop-changes.md, (a)): workspace N is desktop N by
    // position, so the numbers now name other desktops. Desktops only appended: nothing. Else
    // the model is rebuilt from KWin's state as at a load: nothing is reconciled meanwhile
    // (`rebuilding`: a pass now would move windows to their old numbers), and the rebuild waits
    // a turn, for KWin to finish moving the removed desktop's windows (slotDesktopRemoved).
    function desktopIds() { return workspace.desktops.map(function (d) { return d.id; }); }
    function desktopListChanged() {
        var now = desktopIds(), before = deskIds;
        deskIds = now;
        var appended = now.length >= before.length && before.every(function (d, i) { return now[i] === d; });
        if (appended) return;
        if (rebuilding) { rebuildAgain = true; return; }
        log("DESKTOPS removed or moved: the model rebuilt from KWin's state");
        startRebuild();
    }
    function startRebuild() {
        rebuilding = true;
        later(0, function () {
            // Never left half done: a failure releases, as a failing load does (review, finding 1).
            try {
                deskIds = desktopIds();
                rebuiltFor = deskIds.join();
                model = Tree.create({ outputNeighbour: outputNeighbour });
                wins = {}; expected = {}; armed = {}; lastFit = {}; selfFitAt = {}; selfFitLater = {}; ruleRan = {}; dirty = {}; placing = {};
                borderGone = {};
                lastShown = {}; shownBefore = {};   // numbers by the old positions
                Workspaces.reset();
                adoptTiled();
                rememberShown();
                adoptRestSoon("DESKTOPS adopted again");
            } catch (e) {
                log("ERROR in rebuilding after a desktop change: " + e + (e.stack ? " " + e.stack : "") + "; releasing");
                release();
            }
        });
    }

    function startRest() {
        // A login (no windows yet): number the monitors as i3 did. A reload: leave them alone.
        var login = workspace.windowList().filter(function (w) { return w.normalWindow; }).length === 0;
        if (login) {
            switching++;
            try { Workspaces.numberScreens(); } finally { switching--; }
            focusUnderPointer();
        }
        adoptTiled();
        workspace.windowAdded.connect(guard("windowAdded", function (w) {
            // A window kwin-i3 doesn't manage closing: KWin then activates its own next choice
            // before windowRemoved (workspace.cpp removeWindow), which is not the user's (below).
            w.closed.connect(guard("closed outside", function () { if (!wins[id(w)]) closingOutside = w; }));
            adoptWindow(w, true);
        }));
        workspace.windowRemoved.connect(guard("windowRemoved", function (w) { closingOutside = null; forgetWindow(w); }));
        workspace.windowActivated.connect(guard("windowActivated", function (w) {
            // Every activation, and whether kwin-i3 asked for it: who moved focus, in a capture.
            log("ACTIVE " + (w ? shortCaption(w) : "none") + (switching ? " (kwin-i3)" : " (KWin)"));
            if (!w || !wins[id(w)]) {
                if (w && !w.deleted && w.desktopWindow && !switching) desktopActivated(w);
                return;
            }
            // KWin's own choice after a popup or another window outside the tree closed: the focus
            // stays where the model has it, as in i3 the focus is where it was when such a window
            // goes (§5 D7); the close's pass puts it back (72-pointer-stays, case 1).
            if (closingOutside && !switching) {
                log("ACTIVE " + shortCaption(w) + " after " + shortCaption(closingOutside) + " closed: the focus stays " + conCaption(model.focused));
                wantFocus();
                return;
            }
            // The focused window being minimized (§5 C9, i3's move scratchpad): KWin activates its
            // own choice inside doMinimize, before minimizedChanged (xdgshellwindow.cpp:858), so the
            // flag on the window is already set while the model's isn't. The focus goes to i3's
            // next, over KWin's choice; the next pass applies it (redo stage 6).
            var had = model.focused;
            if (!switching && had && had.win !== null && wins[had.win] && wins[had.win].minimized && !had.minimized && wins[had.win] !== w) {
                model.setMinimized(had.win, true);
                var next = model.nextFocused(had);
                log("ACTIVE " + shortCaption(w) + " on the minimize of " + conCaption(had) + ": i3's choice " + conCaption(next));
                model.activate(next);
                wantFocus();
                return;
            }
            // KWin itself activating a window its monitor isn't showing: KWin switches the desktop
            // before it activates a window elsewhere, so this is a stale choice, not a request.
            // A monitor unplugged while it showed the focused, empty workspace: kwin-i3 showed that
            // workspace on the other, as i3 does (randr.c move_content), and a millisecond later
            // KWin activated a window of the workspace it replaced (fuzzer I8, seed 30, fixed 2026-10-26: 122ffa1).
            // Not taken into the model; the next pass puts the focus back where the model has it.
            if (!switching && !w.onAllDesktops && w.output &&
                w.desktops.indexOf(workspace.currentDesktopForScreen(w.output)) < 0) {
                log("ACTIVE " + shortCaption(w) + " refused: its workspace isn't shown");
                wantFocus();
                return;
            }
            // A modal dialog activated: its parent takes the place right behind it in the focus
            // order, as in i3 the parent was focused at its opening (step A of redo stage 6:
            // KWin activates a new window's modal dialog in its place, so the parent never got in).
            if (w.modal && w.transientFor && !w.transientFor.deleted && model.byWin[id(w.transientFor)]) model.focusWin(id(w.transientFor));
            model.focusWin(id(w));
            // The pointer follows an activation to another output (Alt+Tab, the task manager, an
            // app's request; i3's focus_on_window_activation ends in workspace_show), unless it
            // is there already (§5 A2); kwin-i3's own activations warp from applyFocus.
            if (w.output) {
                var crossed = focusedOutput !== null && focusedOutput !== w.output.name;
                focusedOutput = w.output.name;
                if (crossed && !switching && warps() && pointerOn() !== w.output) invoke("MoveMouseToFocus");
            }
        }));
        workspace.cursorPosChanged.connect(guard("pointer", pointerMoved));
        seedPointer();
        workspace.currentDesktopChanged.connect(guard("desktop shown", function (previous, current, output) {
            log("SHOWN " + (output ? output.name : "?") + " " + (previous ? deskNum(previous) : "-") + " -> " +
                (current ? deskNum(current) : "-") + (switching ? " (kwin-i3)" : " (outside)"));
            recordShown(previous, current, output);
        }));
        workspace.screensChanged.connect(guard("screens", screensChanged));
        options.configChanged.connect(guard("settings", settingsChanged));
        workspace.desktopsChanged.connect(guard("desktops", desktopListChanged));
        deskIds = desktopIds();
        // The helper's action, not a key (startDrag): bound to one, it finds no drag and does
        // nothing. Not in registerKeys, so not on the Keys page.
        registerShortcut("kwin-i3 Tiling Drag", "kwin-i3: tiling drag (run by the mouse, no key)", "",
                         guard("Tiling Drag", startDrag));
        registerShortcut("kwin-i3 Tiling Resize", "kwin-i3: tiling resize (run by the mouse, no key)", "",
                         guard("Tiling Resize", startResize));
        // The helper's resize mode changed (plugin/resizemode.cpp): read it. Not in registerKeys,
        // so not on the Keys page.
        registerShortcut("kwin-i3 Mode Changed", "kwin-i3: the resize mode changed (run by the helper, no key)", "",
                         guard("Mode Changed", askMode));
        askMode();
        tellDrag(true);
        adoptRestSoon("kwin-i3 loaded");
        // At login Plasma's activity service connects after scripts load and KWin then restores
        // the desktop each screen showed at logout; number the screens again on that first
        // activity event, once (from i3ws, seen in the log 2026-10-21). Connected even when this
        // load didn't look like a login (a session-restored window can exist already, review);
        // with one activity it never fires mid-session.
        // Armed only at a login: after a reload mid-session (windows open), the next activity
        // switch renumbered every monitor back to 1, 2 … (audit, 2026-10-25).
        var renumbered = !login;
        workspace.currentActivityChanged.connect(guard("activity", function () {
            if (renumbered) return;
            renumbered = true;
            switching++;
            try { Workspaces.numberScreens(); } finally { switching--; }
            focusUnderPointer();
            scheduleAll();
            wantFocus();
        }));
        registerKeys();
        // The helper plugin fits the keys that mean a key position to the keyboard layout
        // (docs/spec-keyboard-layouts.md). No reply asked: without the plugin, nothing happens.
        callDBus("org.kde.KWin", "/kwini3helper", "net.local.kwini3helper", "FitKeys");
        // All open their part of the report before any can close it: one notification.
        checkTakenKeys();
        checkLayoutKeys();
        checkHelperKeys();
        checkOldIgnores();
        checkPerOutput(true);
        options.perOutputVirtualDesktopsChanged.connect(guard("per-output", function () {
            checkPerOutput(false);
            if (options.perOutputVirtualDesktops) reshowHomes();
        }));
        scheduleAll();
        rememberShown();
    }

    // KWin reconfigured: take the settings again and act on what changed. Also called once just
    // after a load (KWin's own start-up reconfigure), with nothing changed.
    var RULE_KEYS = ["forWindow", "assign", "ignoreClass", "ignoreRole", "floatingClass", "floatingTitle", "floatingWorkspaces"];
    // Is the effect there to draw the frame? Asked at load and on every reconfigure (the effect
    // asks for one when it loads or goes). Only an effect that draws the frame answers with
    // frameWidth (an older kwini3hold answers too: review of the change, finding 1). callDBus calls
    // back only on a reply: no answer within a second is a miss, and two misses in a row turn the
    // frame off (one slow answer must not re-tile everything; finding 3).
    // after(m): run once with the first answer, or with null after 250 ms (the load path).
    var effectAsk = 0, frameMisses = 0, frameKnown = false;
    function checkFrame(after) {
        var n = ++effectAsk, answered = false, done = false;
        var finish = function (m) { if (done || !after) return; done = true; after(m); };
        if (after) later(250, function () { finish(null); });
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "Stats", function (m) {
            answered = true;
            if (n === effectAsk) {
                frameMisses = 0;
                marks = !!(m && m.floating && m.floating.length !== undefined);
                // The frame first, so the windows adopted below see it (review of (iii)+(iv), 3).
                setFrame(!!(m && m.supported && m.frameWidth !== undefined));
                tellRing();             // again on every answer: a reloaded effect starts with the ring on
                // An effect that lost what it was told (reloaded while the frame stayed on): tell
                // it again (finding 1).
                if (marks) {
                    var has = {};
                    for (var i = 0; i < m.floating.length; i++) has[m.floating[i]] = true;
                    var lost = Object.keys(told).some(function (k) { return told[k] === true && !has[k]; });
                    if (lost) { told = {}; scheduleAll(); }
                }
            }
            finish(m);
        });
        later(1000, function () {
            if (answered || n !== effectAsk) return;
            if (++frameMisses >= 2 || !frameOn) setFrame(false);
            else checkFrame();
        });
    }
    function setFrame(on) {
        if (on === frameOn && frameKnown) return;
        var first = !frameKnown;
        frameKnown = true;
        frameOn = on;
        told = {};                      // a new effect knows nothing: the next pass tells it again
        log("FRAME " + (on ? "on: the effect draws it" : "off: no effect, decorations as they are"));
        // The first answer either way, and every change: a border no frame will replace is given
        // back, including one a reload's predecessor took (not recorded here; finding 2). Tiled
        // windows lose theirs again on the next pass if the frame is on.
        Object.keys(wins).forEach(function (key) {
            var w = wins[key], con = model.byWin[key];
            var tiled = con && con.type !== "floating";
            if (on && tiled && tiledBorderless()) return;
            giveBorder(w);
            if (first && !w.deleted && w.noBorder) w.noBorder = false;
        });
        scheduleAll();
    }

    function settingsChanged() {
        checkFrame();
        tellDrag(true);         // every reconfigure: the helper may be new (it asks for one at load)
        var changed = Settings.load();
        if (!changed.length) return;
        log("SETTINGS " + changed.join(" "));
        // The rules changed: every rule runs anew on every window (each window's record cleared),
        // as a reload would in i3 (docs/spec-redo-3-kinds-rules.md, B); a window a rule doesn't
        // reach stays as it is, floated or tiled by hand included (reclassify).
        if (changed.some(function (k) { return RULE_KEYS.indexOf(k) >= 0; })) {
            ruleRan = {};
            workspace.windowList().forEach(function (w) { if (!w.deleted) reclassify(w); });
        }
        // A new look: the effect told now; the next pass gives or takes each tiled window's
        // border (tiledBorder) and redoes the padding. A loop giving borders back here was found
        // redundant by the fault battery (2026-10-26).
        if (changed.indexOf("tiledLook") >= 0) tellRing();
        scheduleAll();
        wantFocus();
    }

    // The lowest workspace with no windows, shown nowhere, and not assigned to another output
    // (i3's create_workspace_on_output; §4 M1, W4: an empty hidden workspace has no lasting output,
    // whatever home it last had); it becomes s's, created if every existing one is taken. null if
    // all ten are.
    function unusedWorkspace(s) {
        for (var n = 1; n <= NAMES.length; n++) {
            var m = model.workspaces[n], a = Workspaces.assigned(n);
            if (a && a !== s.name) continue;
            Workspaces.ensure(n);
            if (!deskOf(n) || (m && (m.nodes.length || m.floating.length)) || Workspaces.showing(n)) continue;
            Workspaces.setHome(n, s);
            return n;
        }
        return null;
    }
    function rememberShown() {
        workspace.screens.forEach(function (s) {
            var now = deskNum(workspace.currentDesktopForScreen(s)), was = lastShown[s.name];
            if (was && was !== now) {
                var h = (shownBefore[s.name] || []).filter(function (n) { return n !== was && n !== now; });
                h.unshift(was);
                shownBefore[s.name] = h.slice(0, NAMES.length);
            }
            lastShown[s.name] = now;
        });
    }
    // A monitor's desktop switched outside kwin-i3 (the Overview, a pager, KWin's own desktop
    // keys, an activation by Alt+Tab or the task manager, a new window's activation): recorded,
    // and handled a turn later, once adoptWindow has claimed the switches new windows caused
    // (pendingShown, above). Not while kwin-i3 switches, or the model is rebuilt.
    function recordShown(previous, current, output) {
        if (switching || rebuilding || !current || !output) return;
        pendingShown.push({ output: output.name, previous: previous ? deskNum(previous) : 0, current: deskNum(current) });
        if (pendingTimer) return;
        pendingTimer = true;
        later(0, function () {
            pendingTimer = false;
            var list = pendingShown;
            pendingShown = [];
            list.forEach(shownOutside);
        });
    }
    // What is left unclaimed is i3's `workspace N` on that output (workspace_show; §5 D2, D3): N
    // shows on its own output and the focus goes to it, on any output, not only the focused one.
    // N living on another output (windows there, that output here): the switched output shows
    // what it did again and N shows on its own, so two outputs never show one workspace (the
    // 17:05 capture: DP-4 and DP-6 both on 5; the Overview included, Paul's call 58). Else N is
    // that output's. Not while monitors come and go: screensChanged settles those. A focus change
    // across outputs brings the pointer, as a key does (§5 A2).
    function shownOutside(e) {
        if (rebuilding) return;
        var names = workspace.screens.map(function (s) { return s.name; });
        if (Object.keys(lastShown).some(function (n) { return names.indexOf(n) < 0; }) ||
            names.some(function (n) { return !(n in lastShown); })) return;
        var num = e.current, output = null;
        workspace.screens.forEach(function (s) { if (s.name === e.output) output = s; });
        if (!output || num < 1 || num > NAMES.length || !deskOf(num)) return;
        if (workspace.currentDesktopForScreen(output) !== deskOf(num)) return;    // switched again since
        var m = model.workspaces[num];
        var occupied = !!(m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(num));
        var where = occupied ? Workspaces.outputOf(num) : Workspaces.assignedScreen(num) || output;
        if (where !== output) {
            if (e.previous >= 1 && deskOf(e.previous)) showOn(deskOf(e.previous), output);
            if (workspace.currentDesktopForScreen(where) !== deskOf(num)) showOn(deskOf(num), where);
            log("SHOWN " + num + " on " + output.name + " outside kwin-i3: it lives on " + where.name + ", shown there; the focus follows");
        } else {
            if (!occupied) Workspaces.claimHome(num, output);
            log("SHOWN " + num + " on " + output.name + " outside kwin-i3: the focus follows");
        }
        var ws = wsModel(num);
        model.activate(model.fullscreenOn(ws) || model.descendFocused(ws));
        wantFocus(true);
        rememberShown();
    }
    // Outputs came or went (docs/spec-redo-4-outputs.md; i3's randr.c): a lost output's workspaces
    // move to the first output for good (an assigned one to its next connected assigned output);
    // a new output takes the workspaces assigned to it and shows its lowest, else its first
    // assigned, else the lowest free one; then the first output's visible workspace gets the
    // focus (§5 D5), the pointer following (A2). src/outputs.js decides from a snapshot; the
    // reconcile's relocate carries the windows, over KWin's own moves (plan.md decision 10).
    function outputState() {
        var st = { outputs: workspace.screens.map(function (s) { return s.name; }), homes: {}, assigned: {}, occupied: {}, focused: null };
        var homes = Workspaces.homes();
        Object.keys(homes).forEach(function (n) { st.homes[n] = homes[n]; });
        for (var n = 1; n <= NAMES.length; n++) {
            var list = Workspaces.assignedList(n), m = model.workspaces[n];
            if (list.length) st.assigned[n] = list.slice();
            if (m && (m.nodes.length || m.floating.length)) st.occupied[n] = true;
        }
        var fws = focusedWs();
        st.focused = fws ? fws.num : null;
        return st;
    }
    function screenNamed(name) {
        var found = null;
        workspace.screens.forEach(function (s) { if (s.name === name) found = s; });
        return found;
    }
    function screensChanged() {
        checkPerOutput(false);
        var names = workspace.screens.map(function (s) { return s.name; });
        var lost = Object.keys(lastShown).filter(function (n) { return names.indexOf(n) < 0; });
        var added = names.filter(function (n) { return !(n in lastShown); });
        var first = workspace.screens[0], fws = focusedWs();
        // B. Lost outputs: their workspaces move for good; the focused one is shown on the first
        // output (i3's workspace_show(next) in move_content; 84-unplug-focus).
        lost.forEach(function (name) {
            var moves = Outputs.homesAfterLoss(name, outputState()), moved = [];
            Object.keys(moves).forEach(function (n) {
                Workspaces.setHomeName(+n, moves[n]);
                if (moves[n]) moved.push(n + " to " + moves[n]);
            });
            log("OUTPUT " + name + " lost" + (moved.length ? ": workspace " + moved.join(", ") : ""));
            if (fws && moves[fws.num] && first && deskOf(fws.num)) showOn(deskOf(fws.num), screenNamed(moves[fws.num]) || first);
        });
        // C. New outputs, in KWin's order: the assigned workspaces move to each; a source left
        // showing one of them shows what it most recently showed with windows (S10's rule), else
        // an unused one; then the new output shows its own lowest, else its first assigned, else
        // the lowest free one, over whatever KWin picked (M5).
        added.forEach(function (name) {
            var X = screenNamed(name);
            if (!X) return;
            var moving = Outputs.movingTo(name, outputState()), shown = [];
            moving.forEach(function (n) {
                var src = Workspaces.homes()[n];
                Workspaces.ensure(n);
                if (!deskOf(n)) return;
                Workspaces.setHome(n, X);
                if (src && src !== name && Workspaces.showing(n) && Workspaces.showing(n).name === src) {
                    var back = Outputs.sourceShows(src, shownBefore[src] || [], outputState()) || unusedWorkspace(screenNamed(src));
                    if (back && deskOf(back)) { showOn(deskOf(back), screenNamed(src)); shown.push(src + " shows " + back); }
                }
            });
            var show = Outputs.newShows(name, outputState()) || unusedWorkspace(X);
            if (show && deskOf(show)) {
                if (!Workspaces.hasHome(show)) Workspaces.setHome(show, X);
                if (workspace.currentDesktopForScreen(X) !== deskOf(show)) showOn(deskOf(show), X);
            }
            log("OUTPUT " + name + " here" + (moving.length ? ": workspace " + moving.join(", ") + " moved to it" : "") +
                (show ? "; it shows " + show : "") + (shown.length ? "; " + shown.join(", ") : ""));
        });
        lastShown = {};
        rememberShown();
        seedPointer();
        armRefit();
        scheduleAll();
        // D. The first output's visible workspace gets the focus (i3 focuses the primary output
        // after every output change); the pointer follows when it isn't there (A2).
        if ((lost.length || added.length) && first) {
            var num = deskNum(workspace.currentDesktopForScreen(first));
            if (num >= 1 && num <= NAMES.length) {
                if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, first);
                var ws = wsModel(num);
                model.activate(model.fullscreenOn(ws) || model.descendFocused(ws));
                wantFocus(true);
                return;
            }
        }
        wantFocus();
    }
    return {
        start: start,
        // for the live tests: the model as text
        describe: function (n) { return model.describe(n); },
    };
})();
