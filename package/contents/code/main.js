// Built by build.sh from src/ — do not edit; edit src/ and rebuild.
// ---- src/log.js
// Logging. KWin drops print() from scripts on this machine (the kwin_scripting category is off),
// so lines go over D-Bus to tools/logsink.py when [Script-kwin-i3] debugLog=true (src/settings.js
// sets DEBUG_LOG, at load and on a reload). Silent otherwise: if nothing owns the name, the call
// fails quietly. The last LOG_KEEP lines are kept in memory either way, for "Dump State"
// (tools/capture, docs/debugging.md).
var DEBUG_LOG = false;
var LOG_KEEP = 2000;   // hours of ordinary use, GEOM and TILE lines included; a few hundred kB
var logRing = [];

function log(line) {
    // To the millisecond: a flash or a race sits inside one second (OPEN.md item 21).
    var now = new Date(), ms = String(now.getMilliseconds());
    logRing.push(now.toTimeString().slice(0, 8) + "." + "00".slice(ms.length - 1) + ms + " " +
                 String(line).slice(0, 500));   // captions can be URLs
    if (logRing.length > LOG_KEEP) logRing.shift();
    if (!DEBUG_LOG) return;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", String(line));
}
// ---- src/settings.js
// Settings: every key kwin-i3 reads from kwinrc's [Script-kwin-i3] group, with its type and
// default (docs/spec-settings.md). The one table the config form (package/contents/config/
// main.xml) and the README follow; tests/unit/settings.test.js holds the three together.
//
// Read at load and again on every KWin reconfigure (options.configChanged; Meta+Shift+C asks for
// one): the config form writes the file and tells KWin nothing (genericscriptedconfig.cpp
// ScriptingConfig::reload is a TODO in 6.7.5), and a script sees a new value only once KWin has
// reparsed its config. load() returns the keys whose value changed.

var Settings = (function () {
    var TABLE = {
        ignoreClass: { type: "list", def: "krunner,yakuake,spectacle,kded5,xwaylandvideobridge," +
            "plasmashell,ksplashqml,org.kde.plasmashell,org.kde.polkit-kde-authentication-agent-1," +
            "org.kde.kruler,kruler,kwin_wayland,ksmserver-logout-greeter" },
        ignoreRole: { type: "list", def: "quake" },
        floatingClass: { type: "list", def: "" },
        floatingTitle: { type: "list", def: "" },
        debugLog: { type: "bool", def: "false" },
        warnTakenKeys: { type: "bool", def: "true" },                         // the notice at load
        resizeStep: { type: "int", def: "10", min: 1, max: 50 },                // %, i3's "10 ppt"
        floatingStep: { type: "int", def: "10", min: 1, max: 200 },             // px a floating window moves or resizes, i3's "10 px"
        defaultOrientation: { type: "choice", def: "auto", choices: ["auto", "horizontal", "vertical"] },
        focusWrapping: { type: "choice", def: "yes", choices: ["yes", "no", "force", "workspace"] },
        workspaceOutputs: { type: "outputs", def: "" },                         // "1=DP-4, 2=DP-6"
        workspaceAutoBackAndForth: { type: "bool", def: "false" },              // i3's workspace_auto_back_and_forth
        gapsInner: { type: "int", def: "4", min: 0, max: 100 },                 // px between windows, even (an odd one counts as the even below)
        gapsOuter: { type: "int", def: "2", min: 0, max: 200 },                 // px more at the screen edge
        // The frame: drawn by kwini3hold, its room left by the script (frameWidth); here so the form has them.
        frameWidth: { type: "int", def: "1", min: 1, max: 10 },
        frameActive: { type: "colour", def: "#4c7899" },
        frameInactive: { type: "colour", def: "#333333" },
        frameFloatingActive: { type: "colour", def: "#4d7254" },
        frameFloatingInactive: { type: "colour", def: "#333333" },
        // Window modes (docs/spec-window-modes.md): workspaces whose new windows open floating, as
        // Plasma windows; and the frame on floating windows too, in the floating colours.
        floatingWorkspaces: { type: "workspaces", def: "" },                     // "3, 7"
        frameOnFloating: { type: "bool", def: "false" },
        // How tiled windows look (docs/spec-tiled-look.md): i3's frame, their own title bars, or
        // neither. Without kwini3hold every one is "titlebars".
        tiledLook: { type: "choice", def: "frame", choices: ["frame", "titlebars", "bare"] },
        // Tiled windows' corners, rounded by kwini3hold (docs/spec-rounded-corners.md).
        roundedCorners: { type: "bool", def: "true" },
        holdEnabled: { type: "bool", def: "true" },
        holdTimeoutMs: { type: "int", def: "100", min: 10, max: 2000 },
    };
    var values = {};

    // Every value is read as text (KConfig stores text) and parsed here, so a value the form
    // wrote and one written by hand read the same; one that doesn't parse is the default.
    function parse(t, text) {
        var type = t.type;
        if (type === "int") {
            if (!/^-?[0-9]+$/.test(text)) return null;
            var n = parseInt(text, 10);
            return n >= t.min && n <= t.max ? n : null;
        }
        if (type === "choice") return t.choices.indexOf(text) >= 0 ? text : null;
        if (type === "colour") return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
        // i3's "workspace N output X": { N: output name }. A malformed entry is skipped (and
        // logged), the rest still apply.
        if (type === "outputs") {
            var out = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^([0-9]+)\s*=\s*(\S+)$/.exec(e);
                if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2];
                else log("WARN setting workspaceOutputs: ignoring \"" + e + "\" (want N=OUTPUT, N 1-10)");
            });
            return out;
        }
        // Workspace numbers, 1-10: { N: true }. Anything else is skipped (and logged).
        if (type === "workspaces") {
            var set = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                if (/^[0-9]+$/.test(e) && +e >= 1 && +e <= 10) set[+e] = true;
                else log("WARN setting floatingWorkspaces: ignoring \"" + e + "\" (want workspace numbers 1-10)");
            });
            return set;
        }
        if (type === "list")
            return text.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
        if (type === "bool") {
            if (text === "true") return true;
            if (text === "false") return false;
            return null;
        }
        return text;
    }

    function load() {
        var changed = [];
        Object.keys(TABLE).forEach(function (key) {
            var t = TABLE[key];
            var v = parse(t, String(readConfig(key, t.def)).trim());
            if (v === null) {
                log("WARN setting " + key + ": not a valid " + t.type + ", using the default");
                v = parse(t, t.def);
            }
            if (JSON.stringify(v) !== JSON.stringify(values[key])) changed.push(key);
            values[key] = v;
        });
        DEBUG_LOG = values.debugLog;
        return changed;
    }

    load();
    return {
        get: function (key) { return values[key]; },
        load: load,
        table: TABLE,
    };
})();
// ---- src/tree.js
// The i3 tree: workspaces, split containers, leaves (windows), focus stacks, and the operations
// on them. A port of i3's own code (github.com/i3/i3, branch next at be04c853ee, 2026-10-12);
// each function names the i3 function it ports. No KWin calls here, so node can load and test
// this file directly (tests/unit).
//
// Shapes (i3's Con, reduced to what kwin-i3 needs):
//   ws        { type: "ws", num, layout: "h"|"v", nodes: [], floating: [], focus: [], parent: null }
//   split     { type: "con", win: null, layout, nodes: [], focus: [], parent, percent }
//   leaf      { type: "con", win: <id>, layout: "h", nodes: [], focus: [], parent, percent, fullscreen }
//   floating  { type: "floating", win: <id>, parent: <ws>, ... }
// `focus` is i3's focus_head: the children (tiling and floating) most recently focused first.
// Differences from i3, on purpose:
//   - A floating window is one node, not i3's floating con wrapping a leaf.
//   - Workspaces are KWin's desktops and are never closed when empty.
//   - Outputs are not modelled. Where i3 asks for "the visible workspace on the next output in
//     this direction", the model calls env.outputNeighbour(ws, dir), supplied by the caller.
//   - Fullscreen is i3's per-output fullscreen (CF_OUTPUT) only, a flag on the leaf.
//   - No stacked/tabbed layouts, marks, urgency or scratchpad (decided 2026-10-21).

var Tree = (function () {
    "use strict";

    var LEFT = "left", RIGHT = "right", UP = "up", DOWN = "down";

    function orientationOf(dir) { return dir === LEFT || dir === RIGHT ? "h" : "v"; }
    function isBefore(dir) { return dir === LEFT || dir === UP; }

    function remove(list, item) {
        var i = list.indexOf(item);
        if (i >= 0) list.splice(i, 1);
        return i;
    }
    function insertAfter(list, ref, item) { list.splice(list.indexOf(ref) + 1, 0, item); }
    function insertBefore(list, ref, item) { list.splice(list.indexOf(ref), 0, item); }

    function newCon(layout, win) {
        return { type: "con", win: win === undefined ? null : win, layout: layout || "h",
                 nodes: [], focus: [], parent: null, percent: 0, fullscreen: false };
    }
    function newFloating(win) {
        return { type: "floating", win: win, layout: "h", nodes: [], focus: [], parent: null,
                 percent: 0, fullscreen: false };
    }

    function Model(env) {
        this.env = env || {};
        this.workspaces = {};   // num -> ws
        this.byWin = {};        // window id -> leaf or floating node
        this.focused = null;    // i3's global `focused`
        this.previousWs = null; // i3's previous_workspace_name, as a number (back_and_forth)
        this.focusedWsNum = null;   // the workspace focus was last set on (for previousWs)
    }

    var M = Model.prototype;

    // ---- helpers (con.c) -------------------------------------------------------------------

    // A workspace, created on first use. i3's _workspace_apply_default_orientation makes it
    // horizontal unless the output is taller than wide; the caller says which.
    M.ws = function (num, layout) {
        var ws = this.workspaces[num];
        if (!ws) {
            ws = { type: "ws", num: num, layout: layout || "h", nodes: [], floating: [],
                   focus: [], parent: null, percent: 0, win: null, fullscreen: false };
            this.workspaces[num] = ws;
        }
        return ws;
    };

    function wsOf(con) {                                      // con_get_workspace
        while (con && con.type !== "ws") con = con.parent;
        return con;
    }
    function isLeaf(con) { return con.nodes.length === 0; }  // con_is_leaf
    function isSplit(con) { return con.type === "con" && con.win === null; }
    function isFloating(con) { return con.type === "floating"; }
    function hasParent(con, parent) {                        // con_has_parent
        for (var c = con.parent; c; c = c.parent) if (c === parent) return true;
        return false;
    }

    function fullscreenOn(ws) {                              // con_get_fullscreen_con(ws, CF_OUTPUT)
        var stack = ws.nodes.slice();
        while (stack.length) {
            var c = stack.shift();
            if (c.fullscreen) return c;
            stack = stack.concat(c.nodes);
        }
        return null;
    }

    function permitsFocusing(con) {                          // con_fullscreen_permits_focusing
        var fs = fullscreenOn(wsOf(con));
        if (!fs) return true;
        return con === fs || hasParent(con, fs);
    }

    // con_parent_with_orientation: the nearest ancestor with this orientation, or null at the
    // top of the workspace or for a floating window.
    function parentWithOrientation(con, o) {
        if (isFloating(con)) return null;
        var parent = con.parent;
        while (parent && parent.layout !== o) parent = parent.parent;
        return parent || null;
    }

    function firstTiling(focus) {
        for (var i = 0; i < focus.length; i++) if (!isFloating(focus[i])) return focus[i];
        return null;
    }

    M.descendFocused = function (con) {                      // con_descend_focused
        var next = con;
        while (next !== this.focused && next.focus.length) next = next.focus[0];
        return next;
    };

    M.descendTilingFocused = function (con) {                // con_descend_tiling_focused
        var next = con, before;
        if (next === this.focused) return next;
        do {
            before = next;
            var t = firstTiling(next.focus);
            if (t) next = t;
        } while (before !== next && next !== this.focused);
        return next;
    };

    // con_descend_direction: the leaf of a subtree met first when entering it moving `dir`;
    // across the grain, the most recently focused child.
    function descendDirection(con, dir) {
        var most = null;
        if (isLeaf(con)) return con;
        if (dir === LEFT || dir === RIGHT) {
            if (con.layout === "h") most = dir === RIGHT ? con.nodes[0] : con.nodes[con.nodes.length - 1];
            else most = firstTiling(con.focus);
        } else {
            if (con.layout === "v") most = dir === UP ? con.nodes[con.nodes.length - 1] : con.nodes[0];
            else most = firstTiling(con.focus);
        }
        if (!most) return con;
        return descendDirection(most, dir);
    }

    // con_next_focused: what gets focus when `con` goes away.
    M.nextFocused = function (con) {
        var next = con.parent.focus[0];
        if (next === con) {
            var i = con.parent.focus.indexOf(con);
            next = con.parent.focus[i + 1] || con.parent;
        }
        while (next.focus.length && next.focus[0] !== con) next = next.focus[0];
        if (isFloating(con) && next !== con.parent) next = this.descendFocused(next);
        return next;
    };

    // con_fix_percent: children without a share get the average share, then all are normalised.
    function fixPercent(con) {
        if (!con) return;
        var n = con.nodes.length, total = 0, withPercent = 0, i, c;
        if (!n) return;
        for (i = 0; i < n; i++) {
            c = con.nodes[i];
            if (c.percent > 0) { total += c.percent; withPercent++; }
        }
        if (withPercent !== n) {
            for (i = 0; i < n; i++) {
                c = con.nodes[i];
                if (c.percent <= 0) {
                    if (withPercent === 0) total += (c.percent = 1.0);
                    else total += (c.percent = total / withPercent);
                }
            }
        }
        if (total === 0) {
            for (i = 0; i < n; i++) con.nodes[i].percent = 1.0 / n;
        } else if (total !== 1.0) {
            for (i = 0; i < n; i++) con.nodes[i].percent /= total;
        }
    }

    // _con_attach: a tiling child goes after the most recently focused tiling child (unless
    // ignoreFocus), else at the end; a floating one at the end. Focus: at the tail.
    function attach(con, parent, ignoreFocus) {
        con.parent = parent;
        if (isFloating(con)) {
            parent.floating.push(con);
        } else {
            var current = ignoreFocus ? null : firstTiling(parent.focus);
            if (current) insertAfter(parent.nodes, current, con);
            else parent.nodes.push(con);
        }
        parent.focus.push(con);
    }

    function detach(con) {                                   // con_detach (keeps con.parent)
        remove(isFloating(con) ? con.parent.floating : con.parent.nodes, con);
        remove(con.parent.focus, con);
    }

    // con_focus: to the head of every focus stack up to the workspace. con_activate also makes
    // it the global focus.
    function focusUp(con) {
        if (!con.parent) return;
        remove(con.parent.focus, con);
        con.parent.focus.unshift(con);
        focusUp(con.parent);
    }
    // The global focus changes only here, so this is where i3's workspace_show notes the
    // workspace focused before (whatever moved the focus: a key, the mouse, an activation).
    // The workspace is the one focus was on when it was set, not the focused window's now: a
    // move to another workspace takes the focused window away first (moveToWorkspace).
    M.activate = function (con) {
        var to = wsOf(con), from = this.focusedWsNum;
        focusUp(con);
        this.focused = con;
        if (!to) return;
        if (from && from !== to.num) this.previousWs = from;   // kept if it closes, as i3 keeps the name
        this.focusedWsNum = to.num;
    };

    function getFocusOrder(con) { return con.focus.slice(); }
    function setFocusOrder(con, order) {                     // set_focus_order
        con.focus = order.filter(function (c) { return c.parent === con; });
    }

    // Move every tiling child of `from` into a new split `c` (keeping their focus order), which
    // then joins `from`. Shared by workspace_encapsulate, ws_force_orientation, con_set_layout.
    function wrapChildren(from, c, ignoreFocus) {
        c.parent = from;
        var order = getFocusOrder(from);
        while (from.nodes.length) {
            var child = from.nodes[0];
            detach(child);
            attach(child, c, true);
        }
        setFocusOrder(c, order);
        attach(c, from, ignoreFocus);
        return c;
    }

    // ---- open and close (tree.c) -----------------------------------------------------------

    // tree_open_con, for a window KWin has put on workspace `ws`: it goes after the focus of that
    // workspace. Focus does not change here; KWin's activation tells us later (focusWin).
    M.open = function (win, ws) {
        if (this.byWin[win]) return this.byWin[win];       // added twice: no ghost leaf (review)
        var f = this.focused && wsOf(this.focused) === ws ? this.focused : this.descendFocused(ws);
        var con = f === ws ? ws : f.parent;
        if (isFloating(f)) {
            con = this.descendTilingFocused(ws);
            if (con !== ws) con = con.parent;
        }
        var leaf = newCon("h", win);
        attach(leaf, con, false);
        fixPercent(con);
        this.byWin[win] = leaf;
        // manage.c, "fs != NULL, not focusing": under a fullscreen window the newcomer gets no
        // focus and goes second in its parent's focus stack, right after the first, so it is
        // what focus falls to when the fullscreen window closes (TAILQ_INSERT_AFTER(first)).
        if (fullscreenOn(ws) && con.focus[0] !== leaf) {
            remove(con.focus, leaf);
            con.focus.splice(1, 0, leaf);
        }
        return leaf;
    };

    // A window that opens floating (dialogs, fixed size, rules).
    M.openFloating = function (win, ws) {
        if (this.byWin[win]) return this.byWin[win];
        var node = newFloating(win);
        attach(node, ws, false);
        this.byWin[win] = node;
        return node;
    };

    // tree_close_internal, without the X11 part. `keepParent` is i3's dont_kill_parent.
    M.closeCon = function (con, keepParent) {
        var parent = con.parent, self = this;
        con.nodes.slice().forEach(function (child) { self.closeCon(child, true); });
        var next = con === this.focused ? this.nextFocused(con) : null;
        detach(con);
        if (!isFloating(con)) fixPercent(parent);
        if (con.win !== null && this.byWin[con.win] === con) delete this.byWin[con.win];
        if (next) this.activate(next);
        if (!keepParent) this.onRemoveChild(parent);
    };

    M.close = function (win) {
        var con = this.byWin[win];
        if (con) this.closeCon(con, false);
        this.tidy();
    };

    // con_on_remove_child: an empty split closes itself, and so on upwards. Workspaces stay.
    M.onRemoveChild = function (con) {
        if (!con || con.type !== "con") return;
        if (con.nodes.length === 0 && con.win === null) this.closeCon(con, false);
    };

    // ---- split and layout ------------------------------------------------------------------

    // tree_split
    M.split = function (con, o) {
        if (!con || isFloating(con)) return;
        if (con.type === "ws") {
            if (con.nodes.length < 2) { con.layout = o; return; }
            con = wrapChildren(con, newCon(con.layout), true);       // workspace_encapsulate
        }
        var parent = con.parent;
        // A container that is its parent's only child just changes the parent's orientation.
        if (parent.nodes.length === 1) { parent.layout = o; return; }
        var c = newCon(o);
        parent.nodes[parent.nodes.indexOf(con)] = c;
        parent.focus[parent.focus.indexOf(con)] = c;
        c.parent = parent;
        c.percent = con.percent;
        con.percent = 0;
        attach(con, c, false);
    };

    // ws_force_orientation: wrap the workspace's contents in a split with its old layout, and
    // give the workspace the new one.
    function forceOrientation(ws, o) {
        var old = ws.layout;
        ws.layout = o;
        wrapChildren(ws, newCon(old), false);
        fixPercent(ws);
    }

    // con_set_layout, for the split layouts.
    M.setLayout = function (con, layout) {
        if (con.type !== "ws") con = con.parent;
        if (con.type === "ws") {
            if (con.nodes.length === 0) { con.layout = layout; return; }
            wrapChildren(con, newCon(layout), false);
            this.flatten();
            return;
        }
        // i3 #3001: don't stack up redundant one-child containers.
        if (con.parent.type !== "ws" && con.nodes.length === 1 && con.parent.nodes.length === 1) {
            var parent = con.parent, only = con.nodes[0];
            detach(only);
            attach(only, parent, true);
            this.closeCon(con, true);
            con = parent;
        }
        con.layout = layout;
    };

    // con_toggle_layout(con, "split")
    M.toggleSplit = function (con) {
        if (!con || isFloating(con)) return;
        var parent = con.type === "ws" ? con : con.parent;
        this.setLayout(con, parent.layout === "h" ? "v" : "h");
    };

    // tree_flatten: remove a one-child split whose child is a split of the other orientation and
    // of its own parent's orientation (redundant pairs left behind by moves). i3 calls it only
    // after a move that re-parents and after con_set_layout on a workspace, not after a close.
    function flattenCon(model, con) {
        var parent = con.parent;
        if (isSplit(con) && parent && con.nodes.length === 1) {
            var child = con.nodes[0];
            if (isSplit(child) && con.layout !== child.layout && child.layout === parent.layout) {
                var focusNext = child.focus[0] || null;
                while (child.nodes.length) {
                    var cur = child.nodes[0];
                    detach(cur);
                    cur.parent = parent;
                    insertBefore(parent.nodes, con, cur);
                    parent.focus.push(cur);
                    cur.percent = con.percent;
                }
                if (focusNext && parent.focus[0] === con) {
                    remove(parent.focus, focusNext);
                    parent.focus.unshift(focusNext);
                }
                model.closeCon(con, true);
                return;
            }
        }
        con.nodes.slice().forEach(function (c) { flattenCon(model, c); });
    }

    M.flatten = function () {
        for (var n in this.workspaces) flattenCon(this, this.workspaces[n]);
        this.tidy();
    };

    // Not i3: a split whose only child is another split goes, and the child takes its place.
    // i3 keeps these, and each one stops a move one level short, so after some splitting and
    // moving a window took several presses to cross (seen 2026-10-22). A one-child split
    // holding a window stays: that is what Split H makes, and what a move goes into. Called by
    // every operation that can leave one: move (via flatten), close, float, send to workspace,
    // adopt. docs/spec-nested-boxes.md has the reasons and when to revisit.
    function tidyCon(con) {
        while (isSplit(con) && con.nodes.length === 1 && isSplit(con.nodes[0])) {
            var parent = con.parent, child = con.nodes[0];
            parent.nodes[parent.nodes.indexOf(con)] = child;
            parent.focus[parent.focus.indexOf(con)] = child;
            child.parent = parent;
            child.percent = con.percent;
            con = child;
        }
        con.nodes.forEach(tidyCon);
    }

    M.tidy = function () {
        for (var n in this.workspaces) this.workspaces[n].nodes.forEach(tidyCon);
    };

    // ---- moving (move.c) -------------------------------------------------------------------

    // null: on different workspaces, which meet only at i3's root (each is its own tree here).
    function lowestCommonAncestor(a, b) {
        for (var pa = a; pa; pa = pa.parent)
            for (var pb = b; pb; pb = pb.parent)
                if (pa === pb) return pa;
        return null;
    }
    function childContaining(ancestor, con) {
        var child = con;
        while (child && child.parent !== ancestor) child = child.parent;
        return child;
    }
    function isFocusedDescendant(con, ancestor) {
        for (var cur = con; cur !== ancestor; cur = cur.parent)
            if (cur.parent.focus[0] !== cur) return false;
        return true;
    }

    // insert_con_into: detach con and insert it before/after target, keeping the focus order.
    M.insertConInto = function (con, target, position) {
        var parent = target.parent, oldParent = con.parent;
        var lca = lowestCommonAncestor(con, parent);
        if (lca === con) return;
        if (!lca) {
            // Another workspace (a tiling drop onto the other monitor): the meeting point is i3's
            // root, whose focus order is the workspaces'; con goes first in its new parent's if it
            // had its workspace's focus and that workspace is the focused one. The global focus
            // is the caller's (drop activates con).
            var first = isFocusedDescendant(con, wsOf(con)) && !!this.focused && wsOf(this.focused) === wsOf(con);
            detach(con);
            fixPercent(con.parent);
            con.parent = parent;
            if (first) parent.focus.unshift(con);
            else parent.focus.push(con);
            if (position === "before") insertBefore(parent.nodes, target, con);
            else insertAfter(parent.nodes, target, con);
            con.percent = 0;
            fixPercent(parent);
            this.onRemoveChild(oldParent);
            return;
        }
        var conAncestor = childContaining(lca, con);
        var targetAncestor = childContaining(lca, target);
        var movesFocus = isFocusedDescendant(con, conAncestor);
        var focusBefore;
        if (conAncestor === targetAncestor) {
            focusBefore = movesFocus;
        } else {
            var current = null;
            for (var i = 0; i < lca.focus.length; i++) {
                current = lca.focus[i];
                if (current === conAncestor || current === targetAncestor) break;
            }
            focusBefore = current === conAncestor;
        }
        if (movesFocus && focusBefore) {
            var placeIdx = lca.focus.indexOf(conAncestor) - 1;
            var place = placeIdx >= 0 ? lca.focus[placeIdx] : null;
            remove(lca.focus, targetAncestor);
            if (place) insertAfter(lca.focus, place, targetAncestor);
            else lca.focus.unshift(targetAncestor);
        }
        detach(con);
        fixPercent(con.parent);
        con.parent = parent;
        if (parent === lca) {
            if (focusBefore) insertBefore(parent.focus, target, con);
            else insertAfter(parent.focus, target, con);
        } else {
            if (focusBefore) parent.focus.unshift(con);
            else parent.focus.push(con);
        }
        if (position === "before") insertBefore(parent.nodes, target, con);
        else insertAfter(parent.nodes, target, con);
        con.percent = 0;
        fixPercent(parent);
        this.onRemoveChild(oldParent);
    };

    // attach_to_workspace: entering from the left/above puts it first, else last.
    M.attachToWorkspace = function (con, ws, dir) {
        detach(con);
        var oldParent = con.parent;
        con.parent = ws;
        if (dir === RIGHT || dir === DOWN) ws.nodes.unshift(con);
        else ws.nodes.push(con);
        ws.focus.push(con);
        con.percent = 0;
        fixPercent(ws);
        fixPercent(oldParent);
        this.onRemoveChild(oldParent);
    };

    // move_to_output_directed. Returns true if it moved.
    M.moveToOutputDirected = function (con, dir) {
        var ws = this.env.outputNeighbour ? this.env.outputNeighbour(wsOf(con), dir) : null;
        if (!ws) return false;
        var movesFocus = this.focused === con;
        this.attachToWorkspace(con, ws, dir);
        if (movesFocus) this.activate(con);
        this.flatten();
        return true;
    };

    // tree_move
    M.move = function (con, dir) {
        var position, target;
        if (!con || con.type === "ws" || isFloating(con)) return;
        if (con.fullscreen || (con.parent.type === "ws" && con.parent.nodes.length === 1)) {
            this.moveToOutputDirected(con, dir);
            return;
        }
        var o = orientationOf(dir);
        var same = parentWithOrientation(con, o);
        do {
            if (!same) {
                forceOrientation(wsOf(con), o);
                same = parentWithOrientation(con, o);
            }
            if (same === con.parent) {
                var siblings = con.parent.nodes, idx = siblings.indexOf(con);
                var swap = isBefore(dir) ? siblings[idx - 1] : siblings[idx + 1];
                if (swap) {
                    if (!isLeaf(swap)) {
                        target = descendDirection(swap, dir);
                        position = (target.parent.layout !== o || isBefore(dir)) ? "after" : "before";
                        this.insertConInto(con, target, position);
                        this.flatten();
                        return;
                    }
                    siblings[siblings.indexOf(swap)] = con;     // swap with a leaf: no flatten
                    siblings[idx] = swap;
                    return;
                }
                if (con.parent === wsOf(con)) {
                    this.moveToOutputDirected(con, dir);
                    return;
                }
                same = parentWithOrientation(con.parent, o);
            }
        } while (same === null);

        var above = con;
        while (above.parent !== same) above = above.parent;
        if (!permitsFocusing(above.parent)) return;
        var aIdx = above.parent.nodes.indexOf(above);
        var next = isBefore(dir) ? above.parent.nodes[aIdx - 1] : above.parent.nodes[aIdx + 1];
        if (next && !isLeaf(next)) {
            target = descendDirection(next, dir);
            position = (target.parent.layout !== o || isBefore(dir)) ? "after" : "before";
            this.insertConInto(con, target, position);
        } else if (!next && con.parent.parent && con.parent.parent.type === "ws" &&
                   con.parent.nodes.length === 1) {
            // i3: "the lone child of a non-default layout container at the edge of the
            // workspace". Its test is layout != L_DEFAULT, which every split passes.
            this.moveToOutputDirected(con, dir);
            return;
        } else {
            this.insertConInto(con, above, isBefore(dir) ? "before" : "after");
        }
        this.flatten();
    };

    // con_move_to_workspace -> _con_move_to_con(behind_focused): lands after the focus of the
    // target workspace and becomes that workspace's focus; the global focus stays behind.
    M.moveToWorkspace = function (con, ws) {
        if (!con || con.type === "ws") return;
        var source = wsOf(con);
        if (ws === source) return;
        var target = this.descendFocused(ws);
        var focusNext = null;
        if (this.focused && wsOf(this.focused) === source) {
            focusNext = this.descendFocused(source);
            if (focusNext === con || hasParent(focusNext, con)) focusNext = this.nextFocused(con);
        }
        if (target.type !== "ws") target = target.parent;
        if (isFloating(target)) target = target.parent;
        if (isFloating(con)) target = ws;
        var fs = fullscreenOn(ws);
        if (con.fullscreen && fs) { fs.fullscreen = false; fs = null; }
        var parent = con.parent;
        detach(con);
        attach(con, target, false);
        fixPercent(parent);
        con.percent = 0;
        fixPercent(target);
        if (!fs) focusUp(con);              // i3 step 6: not under the target's fullscreen window
        if (focusNext) this.activate(this.descendFocused(focusNext));
        this.onRemoveChild(parent);
        this.tidy();
    };

    // ---- tiling drag (tiling_drag.c, con.c) -------------------------------------------------
    // docs/spec-tiled-look.md, part B. Rects come from the caller (kwin.js has the tiles):
    // rectOf(con) gives { x, y, width, height } for a leaf, a split or a workspace.

    var SIBLING = "sibling", CENTER = "center", PARENT = "parent";

    // con_fullscreen_permits_focusing, i3's form: judged from the global focus's fullscreen
    // ancestor, which the move must not leave in a bad shape (not permitsFocusing above, which
    // asks about the fullscreen window on con's own workspace).
    function focusPermits(model, con) {
        var fs = model.focused;
        while (fs && fs.type !== "ws" && !fs.fullscreen) fs = fs.parent;
        if (!fs || fs.type === "ws" || con === fs) return true;
        if (wsOf(con) !== wsOf(fs)) return true;               // per-output fullscreen
        return hasParent(con, fs);
    }

    // con_on_side_of_parent: con's edge facing `dir` is its parent's edge too.
    function onSideOfParent(con, dir) {
        var reverse = { left: RIGHT, right: LEFT, up: DOWN, down: UP }[dir];
        return con.parent.layout !== orientationOf(dir) || descendDirection(con.parent, reverse) === con;
    }

    function adjustRect(r, dir, t) {                          // adjust_rect
        if (dir === LEFT) return { x: r.x, y: r.y, width: t, height: r.height };
        if (dir === UP) return { x: r.x, y: r.y, width: r.width, height: t };
        if (dir === RIGHT) return { x: r.x + r.width - t, y: r.y, width: t, height: r.height };
        return { x: r.x, y: r.y + r.height - t, width: r.width, height: t };
    }

    // drag_callback: where `con`, dragged to x,y over `target` (the leaf there, the fullscreen
    // window covering it, or a visible workspace), would drop. parentMax is i3's
    // render_deco_height() + 5 px. Returns { target, type, dir, rect } (rect: the indicator) or
    // null for no drop (onto itself, not as a parent drop).
    M.dropPlan = function (con, target, x, y, rectOf, parentMax) {
        if (!target) return null;
        var rect = rectOf(target);
        if (target.type === "ws") return { target: target, type: CENTER, dir: null, rect: rect };
        var siblingSize = Math.max(2, Math.floor(0.3 * Math.min(rect.width, rect.height)));
        var parentSize = Math.min(parentMax, siblingSize - 1);
        var dl = x - rect.x, dt = y - rect.y, dr = rect.x + rect.width - x, db = rect.y + rect.height - y;
        var dmin = Math.min(dl, dr, dt, db);
        var dir = dl === dmin ? LEFT : dt === dmin ? UP : dr === dmin ? RIGHT : DOWN;
        var type = dmin < parentSize && onSideOfParent(target, dir) ? PARENT : dmin < siblingSize ? SIBLING : CENTER;
        if (type !== PARENT && target === con) return null;
        if (type === PARENT) {
            while (target.parent.type !== "ws" && onSideOfParent(target.parent, dir)) target = target.parent;
            rect = adjustRect(rectOf(target.parent), dir, parentSize);
        } else if (type === CENTER) {
            rect = { x: rect.x + siblingSize, y: rect.y + siblingSize,
                     width: rect.width - 2 * siblingSize, height: rect.height - 2 * siblingSize };
        } else {
            rect = adjustRect(rect, dir, siblingSize);
        }
        return { target: target, type: type, dir: dir, rect: rect };
    };

    // con_move_to_target -> _con_move_to_con(behind_focused false, fix_percentage), for a tiled
    // con: after the target leaf in its parent, or onto an empty workspace. i3's focus steps,
    // for what kwin-i3 keeps of them: the global focus stays where it was, con heads its new
    // parents' focus stacks (the drop's caller refocuses con if it had the focus).
    M.moveToTarget = function (con, target) {
        if (isFloating(target)) { this.moveToWorkspace(con, wsOf(target)); return true; }
        if (target.type === "ws" && isLeaf(target)) { this.moveToWorkspace(con, target); return true; }
        if (isSplit(target) && !isLeaf(target)) target = target.focus[0];
        if (con === target || hasParent(target, con)) return false;
        if (!focusPermits(this, wsOf(target))) return false;
        var orig = target, targetWs = wsOf(target);
        if (target.type !== "ws") target = target.parent;
        var fs = fullscreenOn(targetWs);
        if (con.fullscreen && fs) { fs.fullscreen = false; fs = null; }
        var parent = con.parent, old = this.focused;
        detach(con);
        con.parent = target;
        if (orig !== target) insertAfter(target.nodes, orig, con);
        else target.nodes.push(con);
        target.focus.push(con);
        fixPercent(parent);
        con.percent = 0;
        fixPercent(target);
        if (!fs) {
            focusUp(con);
            if (old && old !== con && wsOf(old) === targetWs) focusUp(old);
        }
        this.onRemoveChild(parent);
        return true;
    };

    // con_swap, for two tiled leaves: each takes the other's place, share and fullscreen.
    M.swap = function (first, second) {
        if (first.type !== "con" || second.type !== "con" || first === second) return false;
        if (hasParent(first, second) || hasParent(second, first)) return false;
        var ws1 = wsOf(first), ws2 = wsOf(second), f = this.focused, restore = null;
        if (ws1 === ws2 && f && ws1 === wsOf(f)) restore = f;
        else if (f && (first === f || hasParent(f, first))) restore = second;
        else if (f && (second === f || hasParent(f, second))) restore = first;
        var p1 = first.parent, p2 = second.parent;
        var n1 = p1.nodes.indexOf(first), n2 = p2.nodes.indexOf(second);
        var f1 = p1.focus.indexOf(first), f2 = p2.focus.indexOf(second);
        p1.nodes[n1] = second; p2.nodes[n2] = first;
        p1.focus[f1] = second; p2.focus[f2] = first;
        first.parent = p2; second.parent = p1;
        var pc = first.percent; first.percent = second.percent; second.percent = pc;
        if (restore) this.activate(restore);
        var fs1 = first.fullscreen; first.fullscreen = second.fullscreen; second.fullscreen = fs1;
        fixPercent(p1); fixPercent(p2);
        return true;
    };

    // tiling_drag, after the release: apply a dropPlan. `swap`: the swap modifier was held at the
    // press. Returns true if the tree changed.
    M.drop = function (con, plan, swap) {
        if (!plan || !plan.target || (plan.target === con && plan.type !== PARENT)) return false;
        var target = plan.target, dir = plan.dir, o = dir ? orientationOf(dir) : null;
        var position = dir && isBefore(dir) ? "before" : "after";
        var setFocus = con === this.focused, setFs = con.fullscreen;
        con.fullscreen = false;                                // con_disable_fullscreen
        if (plan.type === CENTER) {
            // As i3: a failed swap ends the drop with con's fullscreen already off; a move's
            // result isn't checked.
            if (swap) { if (!this.swap(con, target)) return setFs; }
            else this.moveToTarget(con, target);
        } else if (plan.type === SIBLING) {
            if (target.parent.layout !== o) {
                if (con.parent === target.parent && target.parent.nodes.length === 2) target.parent.layout = o;
                else this.split(target, o);
            }
            this.insertConInto(con, target, position);
        } else {
            if (con !== target) this.insertConInto(con, target, position);
            var old = this.focused;
            this.move(con, dir);
            var exists = old && (old.type === "ws" || this.byWin[old.win] === old);   // con_exists
            if (this.focused !== old && exists) this.activate(old);
        }
        if (setFocus || setFs) {
            var fs = fullscreenOn(wsOf(con));
            if (fs && setFocus && setFs) fs.fullscreen = false;
            else if (fs) setFs = setFocus = false;
            else if (!setFocus) setFocus = setFs && this.focused && wsOf(this.focused) === wsOf(con);
        }
        if (setFs) con.fullscreen = true;
        if (setFocus) this.activate(con);
        this.tidy();
        return true;
    };

    // ---- floating (floating.c) -------------------------------------------------------------

    // floating_enable: the floating node takes its branch's place in the workspace focus stack.
    M.floatingEnable = function (con) {
        if (!con || con.type !== "con" || con.win === null) return null;
        var ws = wsOf(con), parent = con.parent, wasFocused = this.focused === con;
        var placeholder = null, before = true;
        if (!wasFocused) {
            var ancestor = con;
            while (ancestor.parent.type !== "ws") {
                before = before && ancestor.parent.focus[0] === ancestor;
                ancestor = ancestor.parent;
            }
            var i = ws.focus.indexOf(ancestor);
            placeholder = (before ? ws.focus[i - 1] : ws.focus[i + 1]) || null;
        }
        detach(con);
        fixPercent(parent);
        var node = newFloating(con.win);
        node.parent = ws;
        ws.floating.unshift(node);
        if (before) {
            if (placeholder) insertAfter(ws.focus, placeholder, node);
            else ws.focus.unshift(node);
        } else {
            if (placeholder) insertBefore(ws.focus, placeholder, node);
            else ws.focus.push(node);
        }
        this.byWin[con.win] = node;
        if (wasFocused) this.activate(node);
        this.onRemoveChild(parent);
        this.tidy();
        return node;
    };

    // floating_disable: back into the tiling tree, after the workspace's tiling focus. The window
    // keeps the focus if it had it (i3 leaves its focus stacks for the next con_focus to fix).
    M.floatingDisable = function (node) {
        if (!node || !isFloating(node)) return null;
        var ws = node.parent, wasFocused = this.focused === node;
        var tilingFocused = this.descendTilingFocused(ws);
        var leaf = newCon("h", node.win);
        // The leaf stands in for i3's floating wrapper: same place in the focus stack.
        remove(ws.floating, node);
        ws.focus[ws.focus.indexOf(node)] = leaf;
        leaf.parent = ws;
        this.byWin[node.win] = leaf;
        if (tilingFocused.type === "ws") {
            remove(ws.focus, leaf);
            attach(leaf, ws, false);
            leaf.percent = 0;
            fixPercent(ws);
        } else {
            ws.nodes.push(leaf);
            this.insertConInto(leaf, tilingFocused, "after");
        }
        if (wasFocused) this.activate(leaf);
        return leaf;
    };

    M.toggleFloating = function (con) {
        if (!con) return null;
        return isFloating(con) ? this.floatingDisable(con) : this.floatingEnable(con);
    };

    // cmd_focus_window_mode("mode_toggle")
    M.focusModeToggle = function () {
        if (!this.focused || this.focused.type === "ws") return null;
        var ws = wsOf(this.focused), toFloating = !isFloating(this.focused);
        for (var i = 0; i < ws.focus.length; i++) {
            var c = ws.focus[i];
            if (toFloating !== isFloating(c)) continue;
            var f = this.descendFocused(c);
            this.activate(f);
            return f;
        }
        return null;
    };

    // ---- resize (commands.c cmd_resize_tiling_width_height) --------------------------------

    // resize grow|shrink width|height <ppt>: the nearest ancestor (or con itself) that has a
    // sibling along that orientation grows by ppt, the siblings give it up equally. False if it
    // can't (nothing to resize against, or someone would vanish). i3's minimum is one pixel; the
    // model has no pixels, so the floor is a thousandth (about 1-3 px on these monitors).
    var MIN_SHARE = 0.001;
    M.resize = function (con, what, ppt) {
        if (!con || con.type !== "con") return false;
        var o = what === "width" ? "h" : "v";
        var current = con;
        // resize_find_tiling_participants(..., both_sides = true)
        while (current.type !== "ws") {
            if (current.parent.layout === o && current.parent.nodes.length > 1) break;
            current = current.parent;
        }
        if (current.type === "ws") return false;
        var parent = current.parent, children = parent.nodes.length;
        parent.nodes.forEach(function (c) { if (c.percent === 0) c.percent = 1 / children; });
        var next = current.percent + ppt;
        var subtract = ppt / (children - 1);
        if (ppt < 0 && next < MIN_SHARE) return false;
        if (subtract >= 0) {
            for (var i = 0; i < children; i++) {
                var c = parent.nodes[i];
                if (c !== current && c.percent - subtract < MIN_SHARE) return false;
            }
        }
        current.percent = next;
        parent.nodes.forEach(function (c) { if (c !== current) c.percent -= subtract; });
        return true;
    };

    // resize_find_tiling_participants(..., both_sides = false), then click.c's swap that puts the
    // container in front first: up from con to the first ancestor whose parent splits along dir's
    // orientation and has a sibling on dir's side. -> { first, second } | null (none up to the
    // workspace). The model has no stacked or tabbed layouts, so no skipping of those.
    M.resizeParticipants = function (con, dir) {
        if (!con || con.type === "ws" || con.type === "floating") return null;
        var o = orientationOf(dir), backwards = isBefore(dir), first = con, second = null;
        while (first.type !== "ws" && first.type !== "floating" && !second) {
            if (first.parent.layout !== o) { first = first.parent; continue; }
            var i = first.parent.nodes.indexOf(first);
            second = first.parent.nodes[backwards ? i - 1 : i + 1] || null;
            if (!second) first = first.parent;
        }
        if (!second) return null;
        return backwards ? { first: second, second: first } : { first: first, second: second };
    };

    // resize_neighboring_cons(first, second, px, 0): px of the parent's `size` (con_rect_size_in_
    // orientation) go from second to first (negative: the other way). False, and nothing changed,
    // if either would drop below the floor (i3: 1 px; the model has no pixels, so MIN_SHARE as
    // M.resize). Shares not yet set get the average first, as M.resize does.
    M.resizeNeighbouring = function (first, second, px, size) {
        var parent = first.parent;
        if (!(size > 0) || !parent || second.parent !== parent) return false;
        parent.nodes.forEach(function (c) { if (c.percent === 0) c.percent = 1 / parent.nodes.length; });
        var pct = px / size, a = first.percent + pct, b = second.percent - pct;
        if (a < MIN_SHARE || b < MIN_SHARE) return false;
        first.percent = a;
        second.percent = b;
        fixPercent(parent);
        return true;
    };

    // ---- focus (tree.c get_tree_next / tree_next) ------------------------------------------

    // Directional focus, with i3's focus_wrapping (get_tree_next, 4.24): "yes" (the default)
    // goes out of the workspace to the visible workspace of the neighbouring output, else wraps
    // inside the innermost container of that orientation; "no" never wraps inside a container
    // but still crosses to the next output; "force" always wraps inside the container and never
    // leaves it; "workspace" wraps as "yes" but never leaves the workspace. An empty workspace
    // focused goes to the next output in every mode, as in i3 (handle_workspace). Returns what
    // is focused now, or null if nothing changed.
    M.focusDir = function (dir, wrapping) {
        wrapping = wrapping || "yes";
        var con = this.focused;
        if (!con) return null;
        var previous = isBefore(dir), o = orientationOf(dir), firstWrap = null, next = null;
        var fromWs = con.type === "ws";
        if (isFloating(con)) {
            if (o !== "h") return null;
            var fl = con.parent.floating, k = fl.indexOf(con);
            next = (previous ? fl[k - 1] : fl[k + 1]) || (previous ? fl[fl.length - 1] : fl[0]);
            this.activate(next);
            return next;
        }
        while (con.type !== "ws") {
            if (con.fullscreen) { con = wsOf(con); break; }
            var parent = con.parent;
            if (parent.nodes.length > 1 && parent.layout === o) {
                var idx = parent.nodes.indexOf(con);
                var cand = previous ? parent.nodes[idx - 1] : parent.nodes[idx + 1];
                if (cand && permitsFocusing(cand)) { next = cand; break; }
                var wrap = previous ? parent.nodes[parent.nodes.length - 1] : parent.nodes[0];
                if (wrapping === "force") {
                    // never leaves the parent; a next one blocked by fullscreen blocks the wrap too
                    if (cand || !permitsFocusing(wrap)) return null;
                    next = wrap;
                    break;
                }
                if (wrapping !== "no" && !firstWrap && permitsFocusing(wrap)) firstWrap = wrap;
            }
            con = parent;
        }
        if (!next) {
            if (wrapping === "workspace" && !fromWs) next = firstWrap;
            else {
                var ws = this.env.outputNeighbour ? this.env.outputNeighbour(wsOf(this.focused), dir) : null;
                next = ws || firstWrap;
            }
        }
        if (!next) return null;
        var focus = this.descendFocused(next);
        if (next.type === "ws" && !focus.fullscreen) {
            var tiling = this.descendTilingFocused(next);
            if (tiling !== next) focus = tiling;
        }
        this.activate(focus);
        return focus;
    };

    // KWin activated a window by itself (a click, focus follows mouse, a new window).
    M.focusWin = function (win) {
        var con = this.byWin[win];
        if (con) this.activate(con);
        return con || null;
    };

    // con_toggle_fullscreen: one fullscreen window per workspace. KWin allows several (F11 in a
    // browser, then a video); two flags would block all directional focus (code review).
    M.fullscreenOn = function (ws) { return fullscreenOn(ws); };   // the workspace's fullscreen leaf, or null
    M.setFullscreen = function (win, on) {
        var con = this.byWin[win];
        if (!con || con.type !== "con") return;
        if (on) {
            var other;
            while ((other = fullscreenOn(wsOf(con))) && other !== con) other.fullscreen = false;
        }
        con.fullscreen = !!on;
    };

    // ---- adopting and reading ---------------------------------------------------------------

    // Rebuild a workspace's tiling tree from a spec read off KWin's live tiles at start-up:
    // { layout, percent, kids: [spec...] } for a split, { win, percent } for a window. Replaces
    // whatever the workspace held; floating windows are untouched. Focus stacks follow child order
    // until focusWin() calls refine them.
    M.adopt = function (ws, spec) {
        var self = this;
        ws.nodes.slice().forEach(function (c) { self.closeCon(c, true); });
        function build(s, parent) {
            var c = s.kids ? newCon(s.layout) : newCon("h", s.win);
            attach(c, parent, true);
            c.percent = s.percent || 0;
            if (s.kids) s.kids.forEach(function (k) { build(k, c); });
            else self.byWin[s.win] = c;
            fixPercent(c);
            return c;
        }
        if (spec.kids) {
            ws.layout = spec.layout;
            spec.kids.forEach(function (k) { build(k, ws); });
        } else if (spec.win !== undefined) {
            build(spec, ws);
        }
        fixPercent(ws);
        this.tidy();                // a tile that lost its other children to foreign windows
    };

    // Every window leaf (tiling) of a workspace, in tree order.
    M.leaves = function (ws) {
        var out = [];
        (function walk(c) {
            c.nodes.forEach(function (k) { if (k.win !== null) out.push(k); else walk(k); });
        })(ws);
        return out;
    };

    // ---- reading the tree ------------------------------------------------------------------

    // "H[a V[b c*]] ~f": layout letter and children in order, * on the global focus, ! on a
    // fullscreen leaf, then the floating windows. For tests and the debug log.
    M.describe = function (num) {
        var self = this, ws = this.workspaces[num];
        if (!ws) return "";
        function d(c) {
            var mark = (c === self.focused ? "*" : "") + (c.fullscreen ? "!" : "");
            if (c.type !== "ws" && c.win !== null) return String(c.win) + mark;
            return c.layout.toUpperCase() + "[" + c.nodes.map(d).join(" ") + "]" + mark;
        }
        var s = d(ws);
        ws.floating.forEach(function (f) { s += " ~" + f.win + (f === self.focused ? "*" : ""); });
        return s;
    };

    // A container's focus stack as window ids / "H[]" / "V[]", most recent first.
    M.focusOrder = function (con) {
        return con.focus.map(function (c) {
            return c.win !== null ? (isFloating(c) ? "~" : "") + String(c.win) : c.layout.toUpperCase() + "[]";
        });
    };

    // workspace_next / workspace_prev for numbered workspaces: among those that exist, the next
    // higher (dir 1) or lower (dir -1) number than cur; past the end, the lowest (highest). null
    // if that is cur itself (one workspace).
    function nextWorkspace(nums, cur, dir) {
        var best = null, wrap = null;
        nums.forEach(function (n) {
            if (dir * (n - cur) > 0 && (best === null || dir * (n - best) < 0)) best = n;
            if (wrap === null || dir * (n - wrap) < 0) wrap = n;
        });
        var t = best !== null ? best : wrap;
        return t === cur ? null : t;
    }

    return {
        Model: Model,
        wsOf: wsOf,
        nextWorkspace: nextWorkspace,
        LEFT: LEFT, RIGHT: RIGHT, UP: UP, DOWN: DOWN,
        SIBLING: SIBLING, CENTER: CENTER, PARENT: PARENT,
        create: function (env) { return new Model(env); }
    };
})();

if (typeof module !== "undefined") module.exports = Tree;
// ---- src/rules.js
// Which windows kwin-i3 manages, and which of those float rather than tile. Mostly what the
// patched Krohnkite decided (its shouldIgnore / shouldFloat, defaults from its main.xml), so
// nothing changed at the switch-over from it. Settings are comma-separated lists in kwinrc's
// [Script-kwin-i3] group (not Krohnkite's): ignoreClass, ignoreRole, floatingClass,
// floatingTitle (a window whose caption contains one of the words floats). Read from Settings at
// each judgement, so a reload changes them (src/settings.js).

var Rules = (function () {
    var S = function (key) { return Settings.get(key); };

    function has(arr, v) { return arr.indexOf(String(v)) >= 0; }
    function titleHas(caption, words) {
        for (var i = 0; i < words.length; i++) if (String(caption).indexOf(words[i]) >= 0) return true;
        return false;
    }

    // KWin calls every fullscreen window not resizeable (XdgToplevelWindow::isResizable), so one
    // is judged by its own size limits, KWin's own last test (min < max on either axis; no max
    // is INT_MAX). Read as "fixed size", a caption change while fullscreen floated a tiled
    // browser (docs/spec-fullscreen-tree.md, part B). A fullscreen request not yet applied
    // (resizeable false, fullScreen false) still reads "float": the plan's known limit.
    function fixedSize(w) {
        if (!w.fullScreen) return !w.resizeable;
        return !(w.minSize.width < w.maxSize.width || w.minSize.height < w.maxSize.height);
    }

    // "ignore": not ours at all. "float" / "tile": managed.
    function classify(w) {
        if (w.deleted || !w.normalWindow || w.popupWindow || w.specialWindow) return "ignore";
        if (w.onAllDesktops || w.skipTaskbar) return "ignore";
        if (has(S("ignoreClass"), w.resourceClass) || has(S("ignoreClass"), w.resourceName) ||
            has(S("ignoreRole"), w.windowRole)) return "ignore";
        // On Wayland a dialog is a normal window; only transient/modal mark it (phase 0).
        if (w.transient || w.modal || fixedSize(w)) return "float";
        if (w.dialog || w.splash || w.utility) return "float";
        if (String(w.caption) === "kwin-i3 capture note") return "float";   // tools/capture's own box
        if (has(S("floatingClass"), w.resourceClass) || has(S("floatingClass"), w.resourceName) ||
            titleHas(w.caption, S("floatingTitle"))) return "float";
        return "tile";
    }

    return { classify: classify };
})();
// ---- src/workspaces.js
// Workspaces and monitors, carried over from i3ws (~/.dotfiles, plasma/.../kwin/scripts/i3ws).
// Workspace N is virtual desktop N. It lives on one monitor (its "home"), shown there or hidden;
// Plasma 6.7's per-output desktops let each monitor show a different one.
//
// Homes are remembered by output *name*, so a workspace whose monitor goes away (unplugged, or a
// monitor deep-sleeping, 2026-10-21) is shown on a remaining one meanwhile and goes back when it
// returns, as in i3 (docs/plan.md decision 10).

var Workspaces = (function () {
    var home = {};          // ws num -> output name
    var MAX = 10;           // kwin-i3's keys: Meta+1..0

    // i3 creates a workspace when it is first used: KWin's desktops up to num, appended so none
    // moves, never removed (KWin saves the count; docs/spec-desktops-on-demand.md). A stock
    // Plasma has one.
    function ensure(num) {
        var from = workspace.desktops.length + 1;
        if (num > MAX || from > num) return;
        while (workspace.desktops.length < num) workspace.createDesktop(workspace.desktops.length, "");
        log("DESKTOPS created " + from + ".." + workspace.desktops.length);
    }

    function deskOf(num) { return workspace.desktops[num - 1]; }
    function deskNum(desktop) { return workspace.desktops.indexOf(desktop) + 1; }
    function screenNamed(name) {
        for (var i = 0; i < workspace.screens.length; i++)
            if (workspace.screens[i].name === name) return workspace.screens[i];
        return null;
    }
    function showing(num) {                 // the screen showing workspace num, or null
        var d = deskOf(num);
        for (var i = 0; i < workspace.screens.length; i++)
            if (workspace.currentDesktopForScreen(workspace.screens[i]) === d) return workspace.screens[i];
        return null;
    }

    // Where workspace num is now: its home if that monitor is here; else the screen showing it;
    // else the first screen. Only a missing home is filled in; a gone home is kept for its return.
    function outputOf(num) {
        var h = home[num] ? screenNamed(home[num]) : null;
        if (h) return h;
        var s = showing(num);
        if (!home[num] && s) home[num] = s.name;
        return s || workspace.screens[0];
    }

    function setHome(num, screen) { home[num] = screen.name; }
    function hasHome(num) { return !!home[num]; }

    // i3's "workspace N output X" (workspaceOutputs; docs/spec-settings.md): the output a
    // workspace is assigned to, by name, or null. Applied where a home is first claimed, so a
    // changed setting moves no workspace that exists (i3 assigns at creation).
    function assigned(num) { return Settings.get("workspaceOutputs")[num] || null; }
    function assignedScreen(num) { var a = assigned(num); return a ? screenNamed(a) : null; }
    // A workspace's first home: its assigned output (present or not: a home is kept by name),
    // else the screen it is used on.
    function claimHome(num, screen) { home[num] = assigned(num) || screen.name; }
    // A monitor appeared: the workspaces assigned to it live there again (i3 moves them to it).
    function claimAssigned(name) {
        var a = Settings.get("workspaceOutputs");
        Object.keys(a).forEach(function (n) { if (a[n] === name && deskOf(+n)) home[n] = name; });
    }

    // The nearest screen in a direction (i3ws screenToward; i3's get_output_next, CLOSEST_OUTPUT).
    function screenToward(s, dir) {
        var a = s.geometry, best = null, bestDist = Infinity, all = workspace.screens;
        for (var i = 0; i < all.length; i++) {
            if (all[i] === s) continue;
            var b = all[i].geometry, dist;
            if (dir === "left")  dist = a.x - (b.x + b.width);
            if (dir === "right") dist = b.x - (a.x + a.width);
            if (dir === "up")    dist = a.y - (b.y + b.height);
            if (dir === "down")  dist = b.y - (a.y + a.height);
            if (dist >= 0 && dist < bestDist) { bestDist = dist; best = all[i]; }
        }
        return best;
    }

    // i3's numbering at login: each screen, primary first (KWin lists it first), shows the
    // lowest-numbered workspace that is free and not assigned to another output
    // (create_workspace_on_output); with no assignments, 1 on the primary, 2 on the next, ...
    // Assigned workspaces get their homes first. i3ws did this on every load, so reloading it
    // mid-session reshuffled the monitors (2026-10-21); kwin-i3 does it only when it starts with
    // no windows (a login).
    // Workspaces a screen needs are created (ensure), so each monitor has its own.
    function numberScreens() {
        var s = workspace.screens, n = workspace.desktops.length, taken = {};
        var a = Settings.get("workspaceOutputs");
        Object.keys(a).forEach(function (k) { if (+k <= n) home[k] = a[k]; });
        for (var i = 0; i < s.length; i++) {
            for (var num = 1; num <= MAX; num++) {
                if (taken[num] || (a[num] && a[num] !== s[i].name)) continue;
                ensure(num);
                taken[num] = true;
                workspace.setCurrentDesktopForScreen(deskOf(num), s[i]);
                home[num] = s[i].name;
                break;
            }
        }
    }

    return {
        deskOf: deskOf, deskNum: deskNum, ensure: ensure, showing: showing, outputOf: outputOf,
        setHome: setHome, hasHome: hasHome, screenToward: screenToward, numberScreens: numberScreens,
        assigned: assigned, assignedScreen: assignedScreen, claimHome: claimHome, claimAssigned: claimAssigned,
        homes: function () { return home; },
        reset: function () { home = {}; },      // the model rebuilt (docs/spec-desktop-changes.md)
    };
})();
// ---- src/keyname.js
// Qt key codes as people read them, for the load-time notice (docs/spec-taken-keys.md):
// kglobalaccel answers in codes, the notice speaks in "Meta+Shift+Left". The modifiers come in
// kwin-i3's own order (its key table: Meta, Ctrl, Alt, Shift), then the key.

var KeyName = (function () {
    var MODS = [[0x10000000, "Meta"], [0x04000000, "Ctrl"], [0x08000000, "Alt"], [0x02000000, "Shift"]];
    var SPECIAL = {
        0x20: "Space", 0x01000000: "Esc", 0x01000001: "Tab", 0x01000003: "Backspace",
        0x01000004: "Return", 0x01000005: "Enter", 0x01000006: "Ins", 0x01000007: "Del",
        0x01000009: "Print", 0x01000010: "Home", 0x01000011: "End", 0x01000012: "Left",
        0x01000013: "Up", 0x01000014: "Right", 0x01000015: "Down", 0x01000016: "PgUp",
        0x01000017: "PgDown",
    };

    function of(code) {
        var parts = [];
        MODS.forEach(function (m) { if (code & m[0]) parts.push(m[1]); });
        var k = code & 0x01ffffff;
        if (SPECIAL[k]) parts.push(SPECIAL[k]);
        else if (k >= 0x01000030 && k <= 0x01000052) parts.push("F" + (k - 0x01000030 + 1));
        else if (k > 0x20 && k < 0x7f) parts.push(String.fromCharCode(k));
        else parts.push("0x" + k.toString(16));
        return parts.join("+");
    }

    return { of: of };
})();
// ---- src/kwin.js
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
    // What each monitor showed, by name, so a monitor that comes back shows it again (review:
    // nothing made a returning monitor show its workspace; KWin may restore something else).
    var lastShown = {}, beforeLoss = null;
    // Per monitor, the workspaces it showed, most recent first (i3's focus stack of an output's
    // workspaces), for the monitor a workspace leaves (Move Workspace to Output).
    var shownBefore = {};
    var NAMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];    // the workspace keys, Meta+1..0
    // >0 while kwin-i3 itself changes what a monitor shows (showOn, an activation that may switch
    // a desktop): currentDesktopChanged tells those from switches made outside it (the Overview,
    // Plasma), which kwin-i3's focus follows (shownOutside; docs/spec-unmanaged-windows.md).
    var switching = 0;
    function showOn(desk, s) {
        switching++;
        try { workspace.setCurrentDesktopForScreen(desk, s); } finally { switching--; }
    }
    var ruleKind = {};      // window id -> the rules' verdict at adoption or last change (reclassify)
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
    var focusPending = null; // { from: screen or null, checked: KWin said Show Desktop is off (applyFocus) }

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
        if (focusPending) { var fp = focusPending; focusPending = null; applyFocus(fp.from, fp.checked); }
        rememberShown();
    }
    function wantFocus(from) {
        if (!focusPending) focusPending = { from: from || null };
        else if (from && !focusPending.from) focusPending.from = from;
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
    // decoration (kwini3frame: 1 px each side). KeePassXC, minimum 800, needs an 802 px tile
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
    // Plain GTK 4 (spec-window-modes "why" 5): KWin tells a client its largest size only in a
    // configure with no size (sendRoleConfigure), in practice its first, with the title bar,
    // and GTK 4 keeps within it. borderGone holds those bounds, worked out when the border goes
    // (takeBorder). A tiled window short of its tile at the first frame change after the border
    // went, or later with its frame at the bounds, is asked for 0x0 (KWin resends the bounds, now
    // without the title bar; the client keeps its size), then for its tile in a configure of its
    // own. The later look because a first tile inside the bounds fits, and a later, bigger one (a
    // vertical split's half, then the whole monitor) stayed 26 px short (OPEN.md item 32); only
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
        if (kind === "tile" && !fresh && !w.tile && (w.keepAbove || atLoadFloating[key])) kind = "float";
        // No border and not to be framed: a session restore of one kwin-i3 took, or a reload
        // after the effect went (review R1-4). Given back; a rule forcing it wins anyway.
        if (w.noBorder && !(tiledBorderless() && kind === "tile")) w.noBorder = false;
        var ws = wsForWindow(w);
        if (!ws) { connectWindow(w); return; }
        // A new window on a workspace of Plasma windows opens floating (decision 1).
        if (kind === "tile" && fresh && plasmaWs(ws)) kind = "float";
        wins[key] = w;
        if (!w.fullScreen && w.maximizeMode !== 0) w.setMaximize(false, false);
        recordUntiled(w);
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
        if (!w.deleted) { setFloatingLook(w, false); giveBorder(w); }
        var wasFocused = model.focused === con;
        model.close(key);
        // The tree's focus after a close, for a capture to set beside the ACTIVE lines: "chose",
        // the tree picked it; "kept", KWin had activated another window first (forgetWindow then
        // puts i3's choice back).
        if (con) log("CLOSE " + shortCaption(w) + (wasFocused ? " chose " : " kept ") + conCaption(model.focused));
        delete told[key];
        delete wins[key]; delete expected[key]; delete armed[key]; delete selfFitAt[key]; delete selfFitLater[key]; delete lastFit[key]; delete keptAbove[key]; delete tookBorder[key]; delete borderGone[key]; delete placing[key];
        delete ruleKind[key]; delete untiled[key];
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
        delete closingNext[key];
        dropWindow(w);
        if (next && (next.win === null ? next.type === "ws" : model.byWin[next.win] === next) && model.focused !== next) {
            log("CLOSE " + shortCaption(w) + " i3's choice over KWin's: " + conCaption(next));
            model.activate(next);
        }
        wantFocus();
    }

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
            if (kind === "float") { untile(w); floatAtRecord(w); }
            schedule(Tree.wsOf(model.byWin[key]));
        }
    }

    var connected = {};     // window id -> true once its signals are connected (once only)

    function connectWindow(w) {
        var key = id(w);
        if (connected[key]) return;
        connected[key] = true;
        var dragging = false;
        // Before KWin activates its choice (closingNext, above).
        w.closed.connect(guard("closed", function () {
            var con = model.byWin[key], parent = con && con.parent;
            if (con && model.focused === con && con.type !== "floating" && parent && parent.type !== "ws"
                && parent.nodes.length > 1) closingNext[key] = model.nextFocused(con);
        }));
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
            // Dropped on another monitor: as i3ws did, and as a dragged window does in i3.
            if (kind === "move" && w.output !== outputOf(ws)) joinShownWorkspace(con, w, w.output);
            schedule(ws);
        }));
        // outputChanged only ends relocate's crossing (arrive). Otherwise nothing, on purpose: when
        // a monitor goes or comes back, screensChanged re-places every window from the model
        // (decision 10); when KWin moves a window to another monitor for any other reason, it
        // also changes its desktop, and desktopsChanged above follows it, as i3ws did. A handler
        // for those was redundant: the fault battery could not tell it from nothing (2026-10-22).
        w.outputChanged.connect(guard("output", function () { if (crossing[key]) arrive(w); }));
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
    // active; and the pointer follows when focus changed monitor (i3's mouse_warping output).
    // checked: this pass has KWin's answer that Show Desktop is off (below).
    function applyFocus(from, checked) {
        var f = model.focused;
        if (!f) return;
        // A passive pass (no key action: a window closed, a reload, a monitor change) leaves an
        // open window kwin-i3 doesn't manage with the focus: a panel popup, a dialog, KRunner.
        // Taking it closed the tray's popups when their tooltip went (Paul, 2026-10-25). When
        // that window closes, its own pass brings kwin-i3's focus back. The desktop and the
        // panel hold the focus only when nothing else does, so they don't count.
        var a = workspace.activeWindow;
        if (!from && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock) return;
        // Except with Show Desktop on: then the desktop holds the focus on purpose (Plasma's edit
        // mode turns it on as the panel's menu closes, and the menu closing is this pass), and
        // activating a tile it hid turns it off (kwin activation.cpp activateWindow), which ended
        // the edit mode before its window showed (docs/bug-panel-config.md). Scripts can't read
        // the state, so a pass that finds the desktop (or the panel) active asks KWin, and a pass
        // with the answer goes on only if it is off (74-show-desktop). KWin's last resort when no
        // window is left to focus on a monitor is also the desktop: that pass still brings the
        // focus back (73-unmanaged-windows). The answer rides on focusPending, so it is the pass it
        // brought that has it, however long a rebuild holds that pass (review).
        if (!from && a && !a.deleted && (a.desktopWindow || a.dock) && !checked) {
            callDBus("org.kde.KWin", "/KWin", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin",
                     "showingDesktop", guard("showing desktop", function (showing) {
                if (showing) return;
                wantFocus();
                focusPending.checked = true;
            }));
            return;
        }
        var ws = f.type === "ws" ? f : Tree.wsOf(f), s = outputOf(ws), desk = deskOf(ws.num);
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
            // needs no guard of its own (a fault here alone changed nothing, 73-unmanaged-windows).
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
            switching++;
            try { workspace.activeWindow = w; } finally { switching--; }
            if (before && workspace.currentDesktopForScreen(o) !== before) showOn(before, o);
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

    var DRAG = ["org.kde.KWin", "/kwini3drag", "net.local.kwini3drag"];
    var drag = null;        // { con, timer, busy, plan, rect }: a drag being followed
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
            log("DRAG " + conCaption(con) + (f[4] === "1" ? " (swap)" : ""));
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
            var part = model.resizeParticipants(con, dir);
            if (!part) return;
            var dist = Math.abs(d[dir]);
            if (!best || dist < best.dist) { best = { dir: dir, part: part, dist: dist }; tie = false; }
            else if (dist === best.dist) tie = true;
        });
        return tie ? null : best;
    }
    // resize_graphical_handler's set-up: the boundary is the middle of the gap between the
    // participants' descended-focused leaves (a split's own rect has no gaps within it).
    function resizePlan(con, x, y) {
        var ws = Tree.wsOf(con);
        // i3 refuses a resize between containers of different fullscreen modes; here, while a window
        // is fullscreen on the workspace, none.
        if (model.fullscreenOn(ws)) return null;
        var e = resizeEdge(con, x, y);
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
            var x = Number(f[2]), y = Number(f[3]), rz = con && con.type === "con" && wins[con.win] ? resizePlan(con, x, y) : null;
            if (!rz) { log("RESIZE not started: nothing to resize against"); return; }
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

    function act(name, fn) {
        return guard(name, function () {
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
            // dialog): only keys that move the focus do, as in i3 (docs/spec-unmanaged-windows.md).
            var a = workspace.activeWindow;
            var keep = model.focused === focusBefore && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock;
            if (!keep) wantFocus(before ? outputOf(before) : workspace.activeScreen);
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
                if (n.type === "floating") { untile(w); floatAtRecord(w); }
            }
        },
        "Focus Mode Toggle": function () { model.focusModeToggle(); },
        // i3's fullscreen toggle and kill: KWin's own actions, on its active window, managed or
        // not; a stock Plasma binds neither key (docs/spec-own-keys.md).
        "Fullscreen": function () { invoke("Window Fullscreen"); },
        "Close": function () { invoke("Window Close"); },
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
    function stepWorkspace(dir, onOutput) {
        var cur = focusedWsNum();
        var t = Tree.nextWorkspace(existingWorkspaces(onOutput ? Workspaces.outputOf(cur) : null), cur, dir);
        if (t) gotoWorkspace(t);
    }
    // The screen next to the focused workspace's, in a direction (i3's get_output_next).
    function screenFrom(dir) { return Workspaces.screenToward(Workspaces.outputOf(focusedWsNum()), dir); }
    // i3's cmd_focus_output: show the target's visible workspace, focusing its focused window.
    function focusOutput(dir) {
        var t = screenFrom(dir);
        if (t) gotoWorkspace(deskNum(workspace.currentDesktopForScreen(t)));
    }
    // i3's con_move_to_output: to the target's visible workspace; focus stays behind.
    function moveToOutput(dir, con) {
        var ws = con ? outputNeighbour(Tree.wsOf(con), dir) : null;
        if (ws) model.moveToWorkspace(con, ws);
    }
    // i3's workspace_move_to_output: the focused workspace lives on the target and is shown
    // there, focused; the monitor it left, if it showed it, shows the one it showed most recently
    // that still lives there, else an unused one. Reconcile's relocate carries the windows.
    function moveWorkspaceToOutput(dir) {
        var n = focusedWsNum(), src = Workspaces.outputOf(n), t = Workspaces.screenToward(src, dir);
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
        // The old config's resize mode: Left/J shrink width, Down/K grow height,
        // Up/L shrink height, Right/; grow width.
        "Shrink Width": ["Meta+Ctrl+Left", "Meta+Ctrl+J"], "Grow Height": ["Meta+Ctrl+Down", "Meta+Ctrl+K"],
        "Shrink Height": ["Meta+Ctrl+Up", "Meta+Ctrl+L"], "Grow Width": ["Meta+Ctrl+Right", "Meta+Ctrl+;"],
        "Reload Settings": ["Meta+Shift+C"],
    };

    var UNBOUND = {
        "Workspace Back and Forth": function () { var p = previousWs(); if (p) gotoWorkspace(p); },
        "Move to Workspace Back and Forth": function (c) { var p = previousWs(); if (p) moveToWorkspace(p, c); },
        "Workspace Next": function () { stepWorkspace(1, false); },
        "Workspace Prev": function () { stepWorkspace(-1, false); },
        "Workspace Next on Output": function () { stepWorkspace(1, true); },
        "Workspace Prev on Output": function () { stepWorkspace(-1, true); },
    };
    ["left", "right", "up", "down"].forEach(function (d) {
        var cap = d.charAt(0).toUpperCase() + d.slice(1);
        UNBOUND["Focus Output " + cap] = function () { focusOutput(d); };
        UNBOUND["Move to Output " + cap] = function (c) { moveToOutput(d, c); };
        UNBOUND["Move Workspace to Output " + cap] = function () { moveWorkspaceToOutput(d); };
    });

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
                var n = taken.length - 1;
                reportClose(n + (n === 1 ? " key is" : " keys are") + " taken by other shortcuts", taken);
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
                wins = {}; expected = {}; armed = {}; lastFit = {}; selfFitAt = {}; selfFitLater = {}; ruleKind = {}; dirty = {}; placing = {};
                borderGone = {};
                beforeLoss = null;                  // numbers by the old positions
                lastShown = {}; shownBefore = {};   // likewise
                Workspaces.reset();
                workspace.screens.forEach(function (s) { Workspaces.claimAssigned(s.name); });
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
        if (login) { switching++; try { Workspaces.numberScreens(); } finally { switching--; } }
        adoptTiled();
        workspace.windowAdded.connect(guard("windowAdded", function (w) { adoptWindow(w, true); }));
        workspace.windowRemoved.connect(guard("windowRemoved", forgetWindow));
        workspace.windowActivated.connect(guard("windowActivated", function (w) {
            // Every activation, and whether kwin-i3 asked for it: who moved focus, in a capture.
            log("ACTIVE " + (w ? shortCaption(w) : "none") + (switching ? " (kwin-i3)" : " (KWin)"));
            if (!w || !wins[id(w)]) return;
            // KWin itself activating a window its monitor isn't showing: KWin switches the desktop
            // before it activates a window elsewhere, so this is a stale choice, not a request.
            // A monitor unplugged while it showed the focused, empty workspace: kwin-i3 showed that
            // workspace on the other, as i3 does (randr.c move_content), and a millisecond later
            // KWin activated a window of the workspace it replaced (fuzzer I8, OPEN.md item 33).
            // Not taken into the model; the next pass puts the focus back where the model has it.
            if (!switching && !w.onAllDesktops && w.output &&
                w.desktops.indexOf(workspace.currentDesktopForScreen(w.output)) < 0) {
                log("ACTIVE " + shortCaption(w) + " refused: its workspace isn't shown");
                wantFocus();
                return;
            }
            model.focusWin(id(w));
        }));
        workspace.currentDesktopChanged.connect(guard("desktop shown", function (previous, current, output) {
            log("SHOWN " + (output ? output.name : "?") + " " + (previous ? deskNum(previous) : "-") + " -> " +
                (current ? deskNum(current) : "-") + (switching ? " (kwin-i3)" : " (outside)"));
            shownOutside(previous, current, output);
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
            model.activate(model.descendFocused(wsModel(1)));
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
    var RULE_KEYS = ["ignoreClass", "ignoreRole", "floatingClass", "floatingTitle"];
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
        // The rules: every window judged again; one whose verdict changed follows it, one floated
        // or tiled by hand under an unchanged verdict stays (reclassify).
        if (changed.some(function (k) { return RULE_KEYS.indexOf(k) >= 0; }))
            workspace.windowList().forEach(function (w) { if (!w.deleted) reclassify(w); });
        // A new look: the effect told now; the next pass gives or takes each tiled window's
        // border (tiledBorder) and redoes the padding. A loop giving borders back here was found
        // redundant by the fault battery (2026-10-26).
        if (changed.indexOf("tiledLook") >= 0) tellRing();
        scheduleAll();
        wantFocus();
    }

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
    // A monitor's desktop switched outside kwin-i3 (the Overview, Plasma, an app's activation):
    // on the monitor kwin-i3's focus is on, the focus follows to the workspace shown there, as in
    // i3 the visible workspace of the focused monitor is the focused one. Not doing so let the
    // next passive pass switch the monitor back (a notification closing, 73-unmanaged-windows).
    // Not while monitors come and go: screensChanged settles those.
    function shownOutside(previous, current, output) {
        if (switching || rebuilding || !current || !output) return;
        var names = workspace.screens.map(function (s) { return s.name; });
        if (Object.keys(lastShown).some(function (n) { return names.indexOf(n) < 0; }) ||
            names.some(function (n) { return !(n in lastShown); })) return;
        var f = model.focused;
        if (!f) return;
        var fws = f.type === "ws" ? f : Tree.wsOf(f), num = deskNum(current);
        if (num < 1 || num > NAMES.length || num === fws.num || outputOf(fws).name !== output.name) return;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, output);
        var ws = wsModel(num);
        model.activate(model.fullscreenOn(ws) || model.descendFocused(ws));
        log("SHOWN " + num + " on " + output.name + " outside kwin-i3: the focus follows");
        rememberShown();
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
                    if (num && deskOf(num)) showOn(deskOf(num), s);
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
// ---- src/main.js
// Entry point: runs last, after every other src/ file is defined.
KI3.start();
