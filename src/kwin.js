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
    var ruleKind = {};      // window id -> the rules' verdict at adoption or last change (reclassify)
    var dirty = {};         // ws num -> true, waiting for the coalesced reconcile
    var timer = null;
    var released = false;
    var placing = {};       // window id -> true while we move it between desktops/outputs
    var snapW = 1, snapH = 1; // screen size in px, for snapping tile edges (setSizes)
    var touchedRoots = {};  // "screen/ws" -> true once reconciled (put back on release)
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

    function later(ms, fn) {
        var tm = new QTimer();
        tm.singleShot = true;
        tm.interval = ms;
        tm.timeout.connect(guard("later", fn));
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
        // The decoration goes only once the client has answered, after the tile's request, which
        // still counted it: watched until the frame shows the tile (as after a screens change).
        if (!w.noBorder) { w.noBorder = true; borderGone[id(w)] = true; }
        if (tile.manage(w)) return true;
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
    // edge = outer + inner. All relative to the maximize area, KWin's basis for absoluteGeometry.
    function gaps() {
        var i = Settings.get("gapsInner"), o = Settings.get("gapsOuter"), f = Settings.get("frameWidth");
        return { inner: i + 2 * f, inset: Math.round(o + i / 2) };
    }
    function areaOf(screen, ws) { return workspace.clientArea(KWin.MaximizeArea, screen, deskOf(ws.num)); }
    function rootRect(area) {
        var e = gaps().inset || 1e-6 * area.width;   // a hair: KWin's half padding at the screen edges too
        return { x: e / area.width, y: e / area.height, width: 1 - 2 * e / area.width, height: 1 - 2 * e / area.height };
    }
    function sameRect(g, r) {
        return Math.abs(g.x - r.x) <= 1e-9 && Math.abs(g.y - r.y) <= 1e-9 &&
               Math.abs(g.width - r.width) <= 1e-9 && Math.abs(g.height - r.height) <= 1e-9;
    }
    // Every layout's children on its outer edges and spanning its cross axis. With gaps no edge
    // is at the screen's border, so KWin lets a window's outer side be dragged
    // (Tile::supportsResizeGravity), and pins that edge to the border (CustomTile::
    // setRelativeGeometry), where no later write can move it off: only a rebuild mends it.
    function edgesIntact(t) {
        if (!t.tiles.length) return true;
        var g = t.relativeGeometry, h = t.layoutDirection !== 2, n = t.tiles.length;
        var f = t.tiles[0].relativeGeometry, l = t.tiles[n - 1].relativeGeometry;
        var eq = function (a, b) { return Math.abs(a - b) < 1e-6; };
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
    // decoration (kwini3frame: 1 px each side). KeePassXC, minimum 800, needs an 802 px tile
    // or KWin leaves it where it was (2026-10-22). The headless tests run Breeze (a 28 px title
    // bar, 150 px enforced minimum) unless a scenario selects the frame (tools/testkwin.sh).
    function frameMin(w) {
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
            else expected[id(w)] = tile;    // KWin put it there itself (see above): that is the tile it is in
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
        if (w.tile !== t || w.move || w.resize || w.fullScreen || !wins[id(w)]) return;
        if (!fits(w, t)) w.frameGeometry = windowRect(t);
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
    // The border just went (manageInto): KWin told the client its bounds once, at its first
    // configure, with the title bar, and GTK 4 keeps within them. A configure with no size makes
    // KWin send them again (sendRoleConfigure); the tile's size follows in a configure of its own.
    var borderGone = {};
    function armRefit() { for (var key in wins) armed[key] = true; }
    function rectKey(r) { return [r.x, r.y, r.width, r.height].join(","); }
    function settleDragArms(ws) {
        model.leaves(ws).forEach(function (leaf) {
            var a = armed[leaf.win], t = expected[leaf.win];
            if (typeof a !== "string") return;
            var r = t ? rectKey(windowRect(t)) : "";
            if (a === "pending") armed[leaf.win] = r;
            else if (a !== r) delete armed[leaf.win];
        });
    }
    function refitOnFrameChange(w) {
        var key = id(w), t = expected[key];
        if (borderGone[key] && !reconciling && t && w.tile === t) {
            delete borderGone[key];
            if (fits(w, t)) return;
            var g = w.frameGeometry;
            log("BOUNDS " + w.caption + ": short of its tile after the border went; bounds asked again");
            w.frameGeometry = { x: g.x, y: g.y, width: 0, height: 0 };
            later(5, function () { if (wins[key] && w.tile === t) w.frameGeometry = windowRect(t); });
            return;
        }
        if (!armed[key] || reconciling || !t || w.tile !== t) return;
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
        touchedRoots[screen.name + "/" + ws.num] = true;
        var area = areaOf(screen, ws);
        relocate(ws, screen);
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

    function floatWindow(w, why) {
        var con = model.byWin[id(w)];
        if (!con || con.type === "floating") return;
        untile(w);
        model.floatingEnable(con);
        setFloatingLook(w, true);
        log("FLOAT " + w.caption + ": " + why);
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
    function relocate(ws, screen) {
        var desk = deskOf(ws.num);
        model.leaves(ws).concat(ws.floating).forEach(function (c) {
            var w = wins[c.win];
            if (!w) return;
            if (w.output === screen && w.desktops.length === 1 && w.desktops[0] === desk) return;
            if (inDrag(w)) return;
            var key = id(w);
            untile(w);
            placing[key] = true;
            relocating++;
            try {
                if (w.output !== screen) workspace.sendClientToScreen(w, screen);
                w.desktops = [desk];      // after the screen: KWin gives a moved window that screen's desktop
            } finally { delete placing[key]; relocating--; }
        });
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
        if (on) { if (!w.keepAbove) w.keepAbove = true; keptAbove[id(w)] = true; if (w.noBorder) w.noBorder = false; }
        if (!on && keptAbove[id(w)]) { w.keepAbove = false; delete keptAbove[id(w)]; }
    }

    // i3's rule for a new window under a fullscreen one (manage.c, "fs != NULL, not focusing"):
    // it opens behind and gets no focus, unless it is the fullscreen window's own dialog
    // (popup_during_fullscreen smart). KWin activated it before windowAdded (workspace.cpp
    // addWaylandWindow), and a fullscreen window is on top only while active
    // (Window::isActiveFullScreen), so the focus is handed straight back from the handler: one
    // event-loop turn, nothing painted in between. Only for a window that just appeared
    // (`fresh`): adoptWindow also runs from reclassify, desktopsChanged and a reload, where it
    // must not pull focus from a window in use. Not on a hidden workspace: activating a window
    // there switches its monitor's desktop (activation.cpp, SwitchToOtherDesktop). A transient
    // gets no hand-back (the dialog; a dialog of another window is KWin's call, review).
    function keepsFullscreenFocus(w, ws, fresh) {
        // A newcomer that opens fullscreen itself (mpv --fs, a game) takes the workspace's
        // fullscreen over, as in i3 (manage.c: con_toggle_fullscreen, fs = NULL): no hand-back.
        if (!fresh || !w.active || w.transient || w.fullScreen) return null;
        var fs = model.fullscreenOn(ws);
        if (!fs || fs.win === id(w) || !wins[fs.win]) return null;
        if (workspace.currentDesktopForScreen(outputOf(ws)) !== deskOf(ws.num)) return null;
        return wins[fs.win];
    }

    function adoptWindow(w, fresh) {
        var key = id(w);
        if (wins[key]) return;
        var kind = Rules.classify(w);
        // Ignored now, perhaps not later (class, transient or desktops set after it appears):
        // watch it, so reclassify can adopt it then (code review).
        if (kind === "ignore") { if (w.normalWindow && !w.deleted) connectWindow(w); return; }
        ruleKind[key] = kind;              // the rules' own verdict; reclassify acts when it changes
        // Not just appeared (a load, a window taken back after a desktop change), in no tile and
        // kept above: a window kwin-i3 had floating, the flag being the one durable mark of it,
        // so it stays floating whatever the rules say (docs/spec-reload-keepabove.md).
        if (kind === "tile" && !fresh && !w.tile && w.keepAbove) kind = "float";
        var ws = wsForWindow(w);
        if (!ws) { connectWindow(w); return; }
        wins[key] = w;
        if (!w.fullScreen && w.maximizeMode !== 0) w.setMaximize(false, false);
        var fs = keepsFullscreenFocus(w, ws, fresh);
        if (kind === "float") { model.openFloating(key, ws); setFloatingLook(w, true); }
        else model.open(key, ws);          // under a fullscreen window: second in the focus stack
        if (w.fullScreen) model.setFullscreen(key, true);
        connectWindow(w);
        if (w.active && !fs) model.focusWin(key);
        log("ADD " + w.caption + " " + kind + " ws " + ws.num);
        if (fs) {
            workspace.activeWindow = fs;   // windowActivated then tells the model, as for any activation
            log("FULLSCREEN " + fs.caption + ": keeps the focus over " + w.caption);
        }
        schedule(ws);
    }

    // No longer ours: closed, made sticky, or now on the ignore list.
    function dropWindow(w) {
        var key = id(w);
        if (!wins[key]) return;
        var con = model.byWin[key];
        var ws = con ? Tree.wsOf(con) : null;
        try { if (!w.deleted) untile(w); } catch (e) { /* gone */ }
        if (!w.deleted) setFloatingLook(w, false);
        model.close(key);
        delete wins[key]; delete expected[key]; delete armed[key]; delete lastFit[key]; delete borderGone[key]; delete keptAbove[key]; delete placing[key];
        delete ruleKind[key];
        schedule(ws);
    }
    // Closed: drop it, and focus goes where the model says (a window made sticky or ignored is
    // still on screen and probably in use, so dropWindow alone doesn't move focus).
    function forgetWindow(w) { dropWindow(w); wantFocus(); }

    // reclassify: the rules act when their verdict changes (ruleKind, declared at the top), never
    // because it differs from what Paul set by hand: a window floated with Meta+Shift+Space used
    // to tile again at its next caption change, which for a browser is seconds
    // (docs/spec-reload-keepabove.md, review finding 1, 2026-10-24).
    function reclassify(w) {
        var key = id(w), con = model.byWin[key];
        if (!con) { adoptWindow(w); return; }
        var kind = Rules.classify(w);
        if (kind === "ignore") { dropWindow(w); return; }
        var was = ruleKind[key];
        ruleKind[key] = kind;
        if (kind === was) return;
        var floating = con.type === "floating";
        if ((kind === "float") !== floating) {
            model.toggleFloating(con);
            setFloatingLook(w, kind === "float");
            if (kind === "float") untile(w);
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
            // Two desktops while relocate moves it or its dialog: KWin's moment, not "made sticky".
            // A parent KWin moves along with its modal dialog is still followed (below).
            if (relocating && w.desktops.length !== 1) return;
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
            if (kind === "resize" && con.type !== "floating") {
                readBack(ws);
                // The window was put back in its tile at each step, so it can fit now while the
                // client's answer to the last step is still in flight, and lands after this
                // reconcile's refit: watched until a frame shows its tile (51-input, section 1).
                if (armed[key] !== true) armed[key] = "pending";
                delete lastFit[key];
            }
            if (kind === "move" && w.output !== outputOf(ws)) {
                // Dropped on another monitor: it joins the workspace shown there (as i3ws did),
                // and keeps the focus, as a dragged window does in i3.
                var to = wsModel(deskNum(workspace.currentDesktopForScreen(w.output)));
                model.moveToWorkspace(con, to);
                model.focusWin(key);
                wantFocus();
                schedule(to);
            }
            schedule(ws);
        }));
        // No outputChanged handler, on purpose. When a monitor goes or comes back, screensChanged
        // re-places every window from the model (decision 10); when KWin moves a window to another
        // monitor for any other reason, it also changes its desktop, and desktopsChanged above
        // follows it, as i3ws did. A handler here was redundant: the fault battery could not tell
        // it from nothing (2026-10-22).
        w.frameGeometryChanged.connect(guard("frame", function () { refitOnFrameChange(w); }));
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
        if (workspace.currentDesktopForScreen(s) !== desk) {
            workspace.setCurrentDesktopForScreen(desk, s);
            // KWin places a tile's windows only while its desktop is current (Tile::manage calls
            // requestTile only if isActive), and nothing in KWin catches up when it becomes so.
            // This switch comes after the reconcile, so one more pass places them (fuzzer I4:
            // a monitor unplugged, its workspace reconciled on the other while still hidden).
            schedule(ws);
        }
        if (f.type === "ws" || f.win === null) {
            if (workspace.activeScreen !== s) {
                invoke("Switch to Screen " + workspace.screens.indexOf(s));
                if (from && from !== s) invoke("MoveMouseToCenter");
            }
            // An empty workspace has the focus, as in i3: no window keeps the keyboard. KWin left
            // it with the window just moved away, hidden on another workspace (fuzzer, I8).
            var a = workspace.activeWindow, ac = a ? model.byWin[id(a)] : null;
            if (f.type === "ws" && ac && Tree.wsOf(ac) !== ws) workspace.activeWindow = null;
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
            workspace.activeWindow = w;
            if (before && workspace.currentDesktopForScreen(o) !== before) workspace.setCurrentDesktopForScreen(before, o);
        }
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
    function step() { return Settings.get("resizeStep") / 100; }

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
                if (n.type === "floating") untile(w);
            }
        },
        "Focus Mode Toggle": function () { model.focusModeToggle(); },
        // i3's fullscreen toggle and kill: KWin's own actions, on its active window, managed or
        // not; a stock Plasma binds neither key (docs/spec-own-keys.md).
        "Fullscreen": function () { invoke("Window Fullscreen"); },
        "Close": function () { invoke("Window Close"); },
        // i3's resize mode, as direct keys (a script can't have mode-only keys): resizeStep ppt.
        "Shrink Width": function (c) { model.resize(c, "width", -step()); },
        "Grow Width": function (c) { model.resize(c, "width", step()); },
        "Shrink Height": function (c) { model.resize(c, "height", -step()); },
        "Grow Height": function (c) { model.resize(c, "height", step()); },
        // i3's reload: KWin reconfigures (reparses kwinrc), and settingsChanged below takes the
        // new values. The config form saves without telling KWin (docs/spec-settings.md).
        "Reload Settings": function () { callDBus("org.kde.KWin", "/KWin", "org.kde.KWin", "reconfigure"); },
    };
    Object.keys(DIRS).forEach(function (d) {
        var cap = d.charAt(0).toUpperCase() + d.slice(1);
        actions["Focus " + cap] = function () { model.focusDir(DIRS[d], Settings.get("focusWrapping")); };
        actions["Move " + cap] = function (c) { model.move(c, DIRS[d]); };
    });

    // Meta+N: show workspace N where it lives and focus it; an empty, hidden one opens on the
    // current monitor (i3ws gotoWorkspace).
    function gotoWorkspace(n) {
        Workspaces.ensure(n);
        if (!deskOf(n)) return;
        if (!Workspaces.showing(n)) {
            var m = model.workspaces[n];
            var occupied = m && (m.nodes.length || m.floating.length) && Workspaces.hasHome(n);
            // An empty one opens on its assigned monitor if that is here, else the current one.
            var s = occupied ? Workspaces.outputOf(n) : Workspaces.assignedScreen(n) || workspace.activeScreen;
            // An occupied workspace keeps its home even while that monitor is away, or it would
            // never go back (code review: reproduced with Meta+2 during an unplug).
            if (!occupied) Workspaces.claimHome(n, s);
            workspace.setCurrentDesktopForScreen(deskOf(n), s);
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

    var NAMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
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
        // The old config's resize mode: Left/J shrink width, Down/K grow height,
        // Up/L shrink height, Right/; grow width.
        "Shrink Width": ["Meta+Ctrl+Left", "Meta+Ctrl+J"], "Grow Height": ["Meta+Ctrl+Down", "Meta+Ctrl+K"],
        "Shrink Height": ["Meta+Ctrl+Up", "Meta+Ctrl+L"], "Grow Width": ["Meta+Ctrl+Right", "Meta+Ctrl+;"],
        "Reload Settings": ["Meta+Shift+C"],
    };

    // KWin's own actions run on KWin's active window, so not through act(): its focus request
    // would activate kwin-i3's focused window before KWin's queued action ran, and a window
    // kwin-i3 doesn't manage would lose the key to it (closed the wrong one; 33-own-keys.sh).
    var KWIN_OWN = { "Fullscreen": true, "Close": true };

    function registerKeys() {
        Object.keys(KEYS).forEach(function (name) {
            var fn = KWIN_OWN[name] ? guard(name, function () { actions[name](); log("ACTION " + name); })
                                    : act(name, actions[name]);
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
            // Meta+Shift+digit arrives as Meta+<symbol> (US layout: Meta+!); the Meta+Shift+digit
            // action that stood beside this one until 2026-10-24 never fired. The id keeps its
            // "(symbol)" so an install keeps the key it already holds.
            registerShortcut("kwin-i3 Move to Workspace " + n + " (symbol)",
                             "kwin-i3: move to workspace " + n, "Meta+" + SHIFTED[i], mv);
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
        var summary = "kwin-i3: " + (parts.length === 1 ? parts[0].title : parts.length + " things to fix in this setup");
        if (parts.length > 1) parts.forEach(function (p) { p.title = p.title.charAt(0).toUpperCase() + p.title.slice(1) + ":"; });
        var body = parts.map(function (p) {
            return (parts.length > 1 ? p.title + "\n" : "") + p.lines.join("\n");
        }).join("\n\n");
        callDBus("org.freedesktop.Notifications", "/org/freedesktop/Notifications",
                 "org.freedesktop.Notifications", "Notify", "kwin-i3", 0, "", summary, body, [], {}, -1);
        log("REPORT " + summary);
    }

    // A key another action also holds is given to kwin-i3's action too (registerShortcut always
    // returns true, and shortcutKeys shows it), but a press runs only the first holder's.
    // KGlobalAccel.action(key) names that one (probed 2026-10-24), but a holder whose component
    // isn't active (its app not running and not launched by kglobalaccel) doesn't block the key:
    // kwin-i3's fires (35-taken-keys.sh). kwin-i3's current keys come from kglobalaccel, so a
    // key the user rebound is the one checked.
    function checkTakenKeys() {
        if (!Settings.get("warnTakenKeys")) { log("TAKEN not checked (warnTakenKeys off)"); return; }
        reportOpen();
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
                reportClose((taken.length - 1) + " of its keys are taken by other shortcuts", taken);
            }
            if (!left) { done(); return; }
            mine.forEach(function (k) {
                callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "action", k,
                         guard("taken keys", function (h) {
                    function one() { if (--left === 0) done(); }
                    if (!h || !h[1] || String(h[1]).indexOf("kwin-i3 ") === 0) { one(); return; }
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
        workspace.screens.forEach(function (s) {
            var homes = Workspaces.homes(), h = homes[deskNum(workspace.currentDesktopForScreen(s))];
            if (!h || h === s.name) return;
            var pick = null;
            for (var n = 1; n <= NAMES.length && !pick; n++)
                if (deskOf(n) && homes[n] === s.name && !Workspaces.showing(n)) pick = n;
            if (!pick) pick = unusedWorkspace(s);
            if (pick) workspace.setCurrentDesktopForScreen(deskOf(pick), s);
        });
        log("PEROUTPUT on: each monitor shows its own");
        rememberShown();
        scheduleAll();
        wantFocus();
    }

    // ---- release (the safety valve) --------------------------------------------------------

    // Every step on its own: the safety valve must never stop half-way (code review).
    function release() {
        if (released) return;
        released = true;
        Object.keys(wins).forEach(function (key) {
            var w = wins[key];
            try {
                untile(w);
                if (keptAbove[key]) w.keepAbove = false;
                if (w.noBorder) w.noBorder = false;
            } catch (e) { log("ERROR in release (window): " + e); }
        });
        workspace.screens.forEach(function (s) {
            workspace.desktops.forEach(function (d, i) {
                try {
                    var root = workspace.rootTile(s, d), rk = s.name + "/" + (i + 1);
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
                     wins[id(w)] ? "managed" : "unmanaged", "rule=" + Rules.classify(w),
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
        // No key: tools/capture (on Meta+Shift+B) invokes it, after starting its sink.
        registerShortcut("kwin-i3 Dump State", "kwin-i3: dump state for a bug report", "", dump);
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
        workspace.windowAdded.connect(guard("windowAdded", function (w) { adoptWindow(w, true); }));
        workspace.windowRemoved.connect(guard("windowRemoved", forgetWindow));
        workspace.windowActivated.connect(guard("windowActivated", function (w) {
            if (w && wins[id(w)]) model.focusWin(id(w));
        }));
        workspace.screensChanged.connect(guard("screens", screensChanged));
        options.configChanged.connect(guard("settings", settingsChanged));
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
        // Both open their part of the report before either can close it: one notification.
        checkTakenKeys();
        checkPerOutput(true);
        options.perOutputVirtualDesktopsChanged.connect(guard("per-output", function () {
            checkPerOutput(false);
            if (options.perOutputVirtualDesktops) reshowHomes();
        }));
        scheduleAll();
        rememberShown();
        log("kwin-i3 loaded");
    }

    // KWin reconfigured: take the settings again and act on what changed. Also called once just
    // after a load (KWin's own start-up reconfigure), with nothing changed.
    var RULE_KEYS = ["ignoreClass", "ignoreRole", "floatingClass", "floatingTitle"];
    function settingsChanged() {
        var changed = Settings.load();
        if (!changed.length) return;
        log("SETTINGS " + changed.join(" "));
        // The rules: every window judged again; one whose verdict changed follows it, one floated
        // or tiled by hand under an unchanged verdict stays (reclassify).
        if (changed.some(function (k) { return RULE_KEYS.indexOf(k) >= 0; }))
            workspace.windowList().forEach(function (w) { if (!w.deleted) reclassify(w); });
        scheduleAll();
        wantFocus();
    }

    // What each monitor showed, by name, so a monitor that comes back shows it again (review:
    // nothing made a returning monitor show its workspace; KWin may restore something else).
    var lastShown = {}, beforeLoss = null;
    // The lowest workspace with no windows, shown nowhere, and living on no other monitor; it
    // becomes s's, created if every existing one is taken. null if all ten are.
    function unusedWorkspace(s) {
        for (var n = 1; n <= NAMES.length; n++) {
            var m = model.workspaces[n], h = Workspaces.homes()[n];
            var a = Workspaces.assigned(n);
            if (a && a !== s.name) continue;
            Workspaces.ensure(n);
            if (!deskOf(n) || (m && (m.nodes.length || m.floating.length)) || Workspaces.showing(n) || (h && h !== s.name) || (a && a !== s.name)) continue;
            Workspaces.setHome(n, s);
            return n;
        }
        return null;
    }
    function rememberShown() {
        workspace.screens.forEach(function (s) { lastShown[s.name] = deskNum(workspace.currentDesktopForScreen(s)); });
    }
    function screensChanged() {
        checkPerOutput(false);
        var names = workspace.screens.map(function (s) { return s.name; });
        var lost = Object.keys(lastShown).filter(function (n) { return names.indexOf(n) < 0; });
        names.forEach(function (n) { if (!(n in lastShown)) Workspaces.claimAssigned(n); });
        if (lost.length && !beforeLoss) beforeLoss = JSON.parse(JSON.stringify(lastShown));
        if (beforeLoss) {
            var allBack = Object.keys(beforeLoss).every(function (n) { return names.indexOf(n) >= 0; });
            if (allBack) {
                // Everyone is home: each monitor shows again what it showed before the loss,
                // unless that workspace has moved to another monitor meanwhile (a window sent to
                // it while it was hidden there). Then the monitor gets an unused workspace, as i3
                // gives a returning output a new one; showing it again put its windows out of
                // sight on the other monitor (fuzzer I2).
                workspace.screens.forEach(function (s) {
                    var num = beforeLoss[s.name], h = num ? Workspaces.homes()[num] : null;
                    if (num && h && h !== s.name) num = unusedWorkspace(s);
                    if (num && deskOf(num)) workspace.setCurrentDesktopForScreen(deskOf(num), s);
                });
                beforeLoss = null;
            }
        }
        lastShown = {};
        rememberShown();
        armRefit();
        scheduleAll();
        wantFocus();
    }
    return {
        start: start,
        // for the live tests: the model as text
        describe: function (n) { return model.describe(n); },
    };
})();
