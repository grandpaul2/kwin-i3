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
// Settings: every key in kwinrc's [Script-kwin-i3] group, with its type and default
//. The plugins read theirs too (the frame's, the hold's,
// tilingDrag), each with its own fallback for a value this table would refuse. The one table the config form (package/contents/config/
// main.xml) and the README follow; tests/unit/settings.test.js holds the three together.
//
// Read at load and again on every KWin reconfigure (options.configChanged; Meta+Shift+C asks for
// one): the config form writes the file and tells KWin nothing (genericscriptedconfig.cpp
// ScriptingConfig::reload is a TODO in 6.7.5), and a script sees a new value only once KWin has
// reparsed its config. load() returns the keys whose value changed.

var Settings = (function () {
    // The window rules in i3's syntax, one per line (src/rules.js parses them; docs/behaviour.md
    // §3, §11 N12-N15). The defaults float the Plasma tools i3 would float (Spectacle, the
    // password prompt, KRuler, plasmashell's ordinary windows, the desktop portal's dialogs: Qt
    // dialogs on X11, typeless and often parentless on Wayland); the system windows are built in.
    var DEFAULT_RULES = "[class=\"^org\\.kde\\.spectacle$\"] floating enable; " +
        "[class=\"^org\\.kde\\.polkit-kde-authentication-agent-1$\"] floating enable; " +
        "[class=\"^(org\\.kde\\.)?kruler$\"] floating enable; " +
        "[class=\"^(org\\.kde\\.)?plasmashell$\" window_type=\"normal\"] floating enable; " +
        "[class=\"^org\\.freedesktop\\.impl\\.portal\\.desktop\\.kde$\"] floating enable";
    var TABLE = {
        forWindow: { type: "text", def: DEFAULT_RULES },                        // for_window [criteria] floating enable|disable
        assign: { type: "text", def: "" },                                      // assign [criteria] → N | output X
        floatingMinimumSize: { type: "size", def: "75x50" },                    // i3's floating_minimum_size
        floatingMaximumSize: { type: "size", def: "0x0" },                      // floating_maximum_size: 0x0 all outputs together, -1x-1 none
        debugLog: { type: "bool", def: "false" },
        warnTakenKeys: { type: "bool", def: "true" },                         // the notice at load
        resizeStep: { type: "int", def: "10", min: 1, max: 50 },                // %, i3's "10 ppt"
        floatingStep: { type: "int", def: "10", min: 1, max: 200 },             // px a floating window moves or resizes, i3's "10 px"
        defaultOrientation: { type: "choice", def: "auto", choices: ["auto", "horizontal", "vertical"] },
        focusWrapping: { type: "choice", def: "yes", choices: ["yes", "no", "force", "workspace"] },
        mouseWarping: { type: "choice", def: "output", choices: ["output", "none"] },   // i3's mouse_warping (§5 A2)
        // What Exit does (§8 K17): i3's exit is leaving the computer; Plasma has several ways to leave.
        endSession: { type: "choice", def: "logout", choices: ["logout", "sleep", "shutdown", "ask"] },
        // i3's popup_during_fullscreen (§10 V6): what a new window may do on a workspace with a fullscreen window.
        popupDuringFullscreen: { type: "choice", def: "smart", choices: ["smart", "ignore", "leave_fullscreen", "all"] },
        // i3's tiling_drag (§9 G3): which presses start the tiling drag; read by the helper from kwinrc.
        tilingDrag: { type: "choice", def: "modifier titlebar", choices: ["off", "modifier", "titlebar", "modifier titlebar"] },
        workspaceOutputs: { type: "outputs", def: "" },                         // "1=DP-4 HDMI-A-1, 2=DP-6": a list per number
        workspaceAutoBackAndForth: { type: "bool", def: "false" },              // i3's workspace_auto_back_and_forth
        gapsInner: { type: "int", def: "2", min: 0, max: 100 },                 // px between windows, even (an odd one counts as the even below)
        gapsOuter: { type: "int", def: "0", min: -100, max: 200 },              // px more at the screen edge; negative takes from it (down to half the inner gap)
        // i3's gaps top|right|bottom|left (§11 N2): that side's outer gap, -1 for gapsOuter.
        gapsTop: { type: "int", def: "-1", min: -1, max: 200 },
        gapsRight: { type: "int", def: "-1", min: -1, max: 200 },
        gapsBottom: { type: "int", def: "-1", min: -1, max: 200 },
        gapsLeft: { type: "int", def: "-1", min: -1, max: 200 },
        workspaceGaps: { type: "wsgaps", def: "" },                             // i3's "workspace N gaps inner|outer|… M", in place of the global ones
        smartGaps: { type: "choice", def: "off", choices: ["off", "on", "inverse_outer"] },   // i3's smart_gaps
        // i3's hide_edge_borders (§7 L6): smart and smart_no_gaps drop a lone window's ring; the
        // per-edge values hide the ring's side at the output's edge (the strip stays: KWin's reason).
        hideEdgeBorders: { type: "choice", def: "none", choices: ["none", "vertical", "horizontal", "both", "smart", "smart_no_gaps"] },
        // The frame: drawn by kwini3hold, its room left by the script (frameWidth); here so the form has them.
        // i3's colour classes (§7 L3): focused and unfocused (focused_inactive left out); the indicator is the side where the next window opens on a
        // window alone in its split (L4), an empty colour being the class's frame colour.
        frameWidth: { type: "int", def: "1", min: 1, max: 10 },
        frameActive: { type: "colour", def: "#4c7899" },
        frameInactive: { type: "colour", def: "#333333" },
        frameIndicatorActive: { type: "colour", def: "#3daee9" },
        frameIndicatorInactive: { type: "colour", def: "" },
        // Window modes: workspaces whose new windows open floating, as
        // Plasma windows; and the frame on floating windows too, in the same colour classes (L11).
        floatingWorkspaces: { type: "workspaces", def: "" },                     // "3, 7"
        frameOnFloating: { type: "bool", def: "false" },
        // How tiled windows look: i3's frame, their own title bars, or
        // neither. Without kwini3hold every one is "titlebars".
        tiledLook: { type: "choice", def: "frame", choices: ["frame", "titlebars", "bare"] },
        // Tiled windows' corners, rounded by kwini3hold.
        roundedCorners: { type: "bool", def: "true" },
        holdEnabled: { type: "bool", def: "true" },
        holdTimeoutMs: { type: "int", def: "200", min: 10, max: 2000 },
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
        // "WxH", 0 and -1 allowed (Rules.parseSize); i3 writes "75 x 50": spaces taken, given back
        // without (rejected, the default stood in silently).
        if (type === "size") { var sz = /^\s*(-?[0-9]+)\s*x\s*(-?[0-9]+)\s*$/.exec(text); return sz ? sz[1] + "x" + sz[2] : null; }
        if (type === "text") return text;                                              // the rules, parsed by Rules
        if (type === "colour") return text === "" ? "" : /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;   // "": the effect's own fallback (an indicator: its class's colour)
        // i3's "workspace N gaps inner|outer|horizontal|vertical|top|right|bottom|left M" (gaps.c:
        // in place of the global ones, as gaps_for_workspace), one per line or separated by ";" or ",",
        // "workspace" optional: "3 gaps inner 10, 5 gaps outer 0" -> { 3: { inner: 10 }, 5: { top: 0,
        // right: 0, bottom: 0, left: 0 } }. An outer side may be negative, as the global one
        // (computeGaps holds it at half the inner gap). A malformed entry is skipped (and logged),
        // the rest still apply.
        if (type === "wsgaps") {
            var ws = {};
            text.split(/[\n;,]/).forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^(?:workspace\s+)?([0-9]+)\s+gaps\s+(inner|outer|horizontal|vertical|top|right|bottom|left)\s+(-?[0-9]+)$/.exec(e);
                if (!m || +m[1] < 1 || +m[1] > 10) { log("WARN setting workspaceGaps: ignoring \"" + e + "\" (want N gaps inner|outer|horizontal|vertical|top|right|bottom|left M, N 1-10)"); return; }
                var g = ws[+m[1]] || (ws[+m[1]] = {}), v = +m[3];
                var sides = { inner: ["inner"], outer: ["top", "right", "bottom", "left"], horizontal: ["left", "right"], vertical: ["top", "bottom"] }[m[2]] || [m[2]];
                sides.forEach(function (s) { g[s] = v; });
            });
            return ws;
        }
        // i3's "workspace N output A B …": { N: [output names] }, the first connected one wins
        // (§4 W5). "1=DP-4 HDMI-A-1, 2=DP-6": names space-separated, so an output
        // name can't contain a space (i3's can't either). A malformed entry is skipped (and
        // logged), the rest still apply.
        if (type === "outputs") {
            var out = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^([0-9]+)\s*=\s*(\S+(?:\s+\S+)*)$/.exec(e);
                if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2].split(/\s+/);
                else log("WARN setting workspaceOutputs: ignoring \"" + e + "\" (want N=OUTPUT [OUTPUT …], N 1-10)");
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
// on them. A port of i3's own code (github.com/i3/i3: first read on `next` at be04c853ee,
// 2026-10-12; compared function by function with the 4.24 release in the code review of
// 2026-10-30); each function names the i3 function it ports. No KWin calls here, so node can load and test
// this file directly (tests/unit).
//
// Shapes (i3's Con, reduced to what kwin-i3 needs):
//   ws        { type: "ws", num, layout, wsLayout, lastSplit, nodes: [], floating: [], focus: [], parent: null }
//   split     { type: "con", win: null, layout, lastSplit, nodes: [], focus: [], parent, percent }
// layout: "h" | "v" (i3's splith, splitv) | "tabbed" | "stacked"; con_orientation makes tabbed
// horizontal and stacked vertical (orient). lastSplit: i3's last_split_layout, what a split toggle
// goes back to from tabbed or stacked. wsLayout: i3's workspace_layout, "default" | "tabbed" |
// "stacked", set by a layout change on an empty workspace.
//   leaf      { type: "con", win: <id>, layout: "h", nodes: [], focus: [], parent, percent, fullscreen }
//   floating  { type: "floating", win: <id>, parent: <ws>, sticky: bool, ... }  (sticky: i3's con->sticky, floating only)
// `focus` is i3's focus_head: the children most recently focused first; a workspace's also
// holds its floating windows.
// Differences from i3, on purpose:
//   - A floating window is one node, not i3's floating con wrapping a leaf.
//   - Workspaces are KWin's desktops and are never closed when empty.
//   - Outputs are not modelled. Where i3 asks for "the visible workspace on the next output in
//     this direction", the model calls env.outputNeighbour(ws, dir), supplied by the caller.
//   - Fullscreen is i3's per-output fullscreen (CF_OUTPUT) only, a flag on the leaf.
//   - No marks, urgency or scratchpad (docs/plan.md, "Out").

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
        return { type: "con", win: win === undefined ? null : win, layout: layout || "h", lastSplit: "h",
                 nodes: [], focus: [], parent: null, percent: 0, fullscreen: false, minimized: false };
    }
    function newFloating(win) {
        return { type: "floating", win: win, layout: "h", nodes: [], focus: [], parent: null,
                 percent: 0, fullscreen: false, minimized: false, sticky: false };
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
            ws = { type: "ws", num: num, layout: layout || "h", wsLayout: "default", lastSplit: "h",
                   nodes: [], floating: [], focus: [], parent: null, percent: 0, win: null, fullscreen: false };
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
    function isTabbing(layout) { return layout === "tabbed" || layout === "stacked"; }
    // con_orientation: tabbed containers behave as horizontal ones, stacked as vertical.
    function orient(con) { return con.layout === "stacked" ? "v" : con.layout === "tabbed" ? "h" : con.layout; }
    // A split of i3's two split layouts (splith, splitv), not a tabbed or stacked container.
    function isPlainSplit(con) { return isSplit(con) && !isTabbing(con.layout); }

    // con_is_hidden: inside a tabbed or stacked container, behind the tab it shows.
    function isHidden(con) {
        for (var cur = con; cur && cur.type !== "ws"; cur = cur.parent) {
            var p = cur.parent;
            if (p && isTabbing(p.layout) && firstTiling(p.focus) !== cur) return true;
        }
        return false;
    }
    function isFloating(con) { return con.type === "floating"; }
    function hasParent(con, parent) {                        // con_has_parent
        for (var c = con.parent; c; c = c.parent) if (c === parent) return true;
        return false;
    }

    // Breadth first, floating_head too: i3 keeps a floating window in a CT_FLOATING_CON, so it is
    // met at depth 2, after the top-level tiled ones and before the tiled ones deeper down.
    function fullscreenOn(ws) {                              // con_get_fullscreen_con(ws, CF_OUTPUT)
        var level = ws.nodes;
        for (var depth = 1; depth <= 2 || level.length; depth++) {
            if (depth === 2) level = level.concat(ws.floating);
            for (var i = 0; i < level.length; i++) if (level[i].fullscreen) return level[i];
            level = [].concat.apply([], level.map(function (c) { return c.nodes; }));
        }
        return null;
    }

    // A minimized window is i3's scratchpad window (§5 C9, §10 V7): in the tree, out
    // of the layout, and never reached by the focus kwin-i3 chooses. A container counts while any
    // leaf in it is not minimized; a workspace always.
    function reachable(con) {
        if (con.type === "ws") return true;
        if (con.win !== null) return !con.minimized;
        for (var i = 0; i < con.nodes.length; i++) if (reachable(con.nodes[i])) return true;
        return false;
    }
    // The nearest reachable con in `list` from index i, stepping by d (-1 or 1); null for none.
    function stepReachable(list, i, d) {
        for (var j = i + d; j >= 0 && j < list.length; j += d) if (reachable(list[j])) return list[j];
        return null;
    }
    // How many of p's children are reachable, counting `con` (the one moving) whatever it is.
    function liveChildren(p, con) {
        return p.nodes.filter(function (c) { return c === con || reachable(c); }).length;
    }
    function firstReachable(list) {
        for (var i = 0; i < list.length; i++) if (reachable(list[i])) return list[i];
        return null;
    }

    // con_parent_with_orientation: the nearest ancestor with this orientation, or null at the
    // top of the workspace or for a floating window.
    function parentWithOrientation(con, o) {
        if (isFloating(con)) return null;
        var parent = con.parent;
        while (parent && orient(parent) !== o) parent = parent.parent;
        return parent || null;
    }

    function firstTiling(focus) {
        for (var i = 0; i < focus.length; i++) if (!isFloating(focus[i]) && reachable(focus[i])) return focus[i];
        return null;
    }

    M.descendFocused = function (con) {                      // con_descend_focused
        var next = con;
        while (next !== this.focused && next.focus.length) {
            var child = firstReachable(next.focus);
            if (!child) break;
            next = child;
        }
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
        var most = null, nodes = con.nodes.filter(reachable);
        if (isLeaf(con)) return con;
        if (dir === LEFT || dir === RIGHT) {
            if (orient(con) === "h") most = dir === RIGHT ? nodes[0] : nodes[nodes.length - 1];
            else most = firstTiling(con.focus);
        } else {
            if (orient(con) === "v") most = dir === UP ? nodes[nodes.length - 1] : nodes[0];
            else most = firstTiling(con.focus);
        }
        if (!most) return con;
        return descendDirection(most, dir);
    }

    // con_next_focused: what gets focus when `con` goes away. Minimized windows are skipped, as
    // i3's focus never reaches the scratchpad's; none left: the parent.
    M.nextFocused = function (con) {
        var next = null, focus = con.parent.focus;
        for (var i = 0; i < focus.length && !next; i++) if (focus[i] !== con && reachable(focus[i])) next = focus[i];
        // A split left with only minimized windows stays (they keep their place), where i3's
        // scratchpad leaves an empty split that closes: the focus goes on up as from that split.
        if (!next && con.parent.type !== "ws" && con.parent.nodes.length > 1) return this.nextFocused(con.parent);
        if (!next) next = con.parent;
        while (next.focus.length) {
            var child = firstReachable(next.focus.filter(function (c) { return c !== con; }));
            if (!child) break;
            next = child;
        }
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
    // A window attached to a workspace whose workspace_layout is tabbed or stacked goes into a new
    // container of that layout (workspace_attach_to), at the end of its lists.
    function attach(con, parent, ignoreFocus) {
        con.parent = parent;
        if (isFloating(con)) {
            parent.floating.push(con);
        } else {
            var current = ignoreFocus ? null : firstTiling(parent.focus);
            if (con.win !== null && parent.type === "ws" && parent.wsLayout !== "default") {
                parent = workspaceAttachTo(parent);
                con.parent = parent;
                current = null;
            }
            if (current) insertAfter(parent.nodes, current, con);
            else parent.nodes.push(con);
        }
        parent.focus.push(con);
    }

    // workspace_attach_to: where a window joining workspace `ws` goes: the workspace itself, or a
    // new container of its workspace_layout.
    function workspaceAttachTo(ws) {
        if (ws.wsLayout === "default") return ws;
        var c = newCon(ws.wsLayout);
        attach(c, ws, false);
        fixPercent(ws);
        return c;
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
    // con_activate: con_focus, then con_raise: a floating window goes to the tail of its
    // workspace's floating list, which is its stacking order (floating_raise_con, floating.c:478).
    M.activate = function (con) {
        var to = wsOf(con), from = this.focusedWsNum;
        focusUp(con);
        if (isFloating(con) && con.parent && con.parent.floating[con.parent.floating.length - 1] !== con) {
            remove(con.parent.floating, con);
            con.parent.floating.push(con);
        }
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

    // A window that opens floating (dialogs, fixed size, rules): at the head of the floating list,
    // as floating_enable (floating.c:295); its activation raises it to the tail (con_activate).
    M.openFloating = function (win, ws) {
        if (this.byWin[win]) return this.byWin[win];
        var node = newFloating(win);
        attach(node, ws, false);
        remove(ws.floating, node);
        ws.floating.unshift(node);
        this.byWin[win] = node;
        return node;
    };

    // i3's con->sticky (cmd_sticky): a floating window
    // visible on every workspace of its output. Only floating nodes carry it here: a sticky
    // window made tiling is taken off all desktops first (C, KWin's tiles belong to one desktop).
    M.setSticky = function (con, on) {
        if (con && isFloating(con)) con.sticky = !!on;
        return con;
    };

    // output_push_sticky_windows (output.c:83-120) for one output: `ws` is what the output
    // shows now, `others` its other workspaces. Each sticky floating con on them moves to ws
    // (con_move_to_workspace with ignore_focus unless it was `oldFocus`, the focus before the
    // caller's switch); the one that was the focus is activated again, then the focused
    // workspace's own focus is restored, so pushing never changes the focused workspace unless
    // the sticky window is on it (then it keeps the focus, as i3). Returns the cons moved.
    M.pushSticky = function (ws, others, oldFocus) {
        var self = this, moved = [];
        others.forEach(function (from) {
            if (from === ws) return;
            from.floating.slice().forEach(function (con) {
                if (!con.sticky) return;
                var wasFocus = oldFocus && con === oldFocus;
                self.moveToWorkspace(con, ws, !wasFocus);
                moved.push(con);
                if (wasFocus) {
                    var current = self.focused ? wsOf(self.focused) : null;
                    if (focusPermits(self, con)) self.activate(con);
                    if (current) self.activate(self.descendFocused(current));
                }
            });
        });
        return moved;
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
            if (con.nodes.length < 2) {
                if (con.nodes.length === 0) con.wsLayout = "default";
                con.layout = o;
                return;
            }
            con = wrapChildren(con, newCon(con.layout), true);       // workspace_encapsulate
        }
        var parent = con.parent;
        // A container that is its parent's only child just changes the parent's orientation; a
        // tabbed or stacked parent gets a new split inside it instead.
        if (parent.nodes.length === 1 && !isTabbing(parent.layout)) { parent.layout = o; return; }
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
        var old = ws.layout, c = newCon(old);
        c.lastSplit = ws.lastSplit;
        ws.layout = o;
        wrapChildren(ws, c, false);
        fixPercent(ws);
    }

    // con_set_layout: the layout of con's parent (of con itself for a workspace): "h", "v",
    // "tabbed" or "stacked". On a workspace with windows, they are wrapped in a new container that
    // takes the layout; on an empty one, the layout is also its workspace_layout.
    M.setLayout = function (con, layout) {
        if (!con || isFloating(con)) return;
        if (con.type !== "ws") con = con.parent;
        if (con.layout === "h" || con.layout === "v") con.lastSplit = con.layout;
        if (con.type === "ws") {
            if (con.nodes.length === 0) {
                con.wsLayout = isTabbing(layout) ? layout : "default";
                con.layout = layout;
                return;
            }
            var c = newCon(layout);
            c.lastSplit = con.lastSplit;
            wrapChildren(con, c, false);
            this.flatten();
            return;
        }
        // i3 #3001: don't stack up redundant one-child containers.
        if (con.parent.type !== "ws" && con.nodes.length === 1 && con.parent.nodes.length === 1) {
            var parent = con.parent, only = con.nodes[0];
            detach(only);
            attach(only, parent, true);
            parent.lastSplit = con.lastSplit;
            this.closeCon(con, true);
            con = parent;
        }
        con.layout = layout;
    };

    // con_toggle_layout(con, "split"): from a split to the other split; from tabbed or stacked,
    // back to the split it was.
    M.toggleSplit = function (con) {
        if (!con || isFloating(con)) return;
        var parent = con.type === "ws" ? con : con.parent;
        var layout = isTabbing(parent.layout) ? (parent.lastSplit || "h") : parent.layout === "h" ? "v" : "h";
        this.setLayout(con, layout);
    };

    // level_up (cmd_focus_level "parent"): the focus goes to the parent container; from a
    // floating window to its workspace; never above the workspace. Returns the new focus or null.
    M.focusParent = function () {
        var f = this.focused;
        if (!f || f.type === "ws" || !f.parent) return null;
        // cmd_focus_level: not out of a fullscreen container (con_fullscreen_permits_focusing).
        if (!focusPermits(this, f.parent)) return null;
        this.activate(f.parent);
        return f.parent;
    };

    // tree_flatten: remove a one-child split whose child is a split of the other orientation and
    // of its own parent's orientation (redundant pairs left behind by moves). i3 calls it only
    // after a move that re-parents and after con_set_layout on a workspace, not after a close.
    function flattenCon(model, con) {
        var parent = con.parent;
        if (isPlainSplit(con) && parent && con.nodes.length === 1) {
            var child = con.nodes[0];
            if (isPlainSplit(child) && con.layout !== child.layout && child.layout === orient(parent)) {
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
            // Another workspace (a tiling drop onto the other output): the meeting point is i3's
            // root, whose focus order is the outputs' and workspaces'; con goes first in its new
            // parent's focus stack when its own side is ahead in that order, i.e. it is on the
            // focused workspace (insert_con_into's focus_before, move.c:88-135). The global focus
            // is the caller's (drop activates con).
            var first = !!this.focused && wsOf(this.focused) === wsOf(con);
            detach(con);
            fixPercent(con.parent);
            con = intoWorkspaceLayout(con, parent);
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
        con = intoWorkspaceLayout(con, parent);
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

    // insert_con_into (move.c:120-135): moving to a workspace respects its workspace_layout: con
    // goes into a new container of that layout, which is what is then placed. Returns what to place.
    function intoWorkspaceLayout(con, parent) {
        if (parent.type !== "ws" || parent.wsLayout === "default") return con;
        var split = workspaceAttachTo(parent);
        attach(con, split, false);
        con.percent = 0;
        fixPercent(split);
        detach(split);
        return split;
    }

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
        // One fullscreen window per workspace (setFullscreen), as moveToWorkspace keeps it.
        var fs = con.fullscreen ? fullscreenOn(ws) : null;
        if (fs) fs.fullscreen = false;
        this.attachToWorkspace(con, ws, dir);
        if (movesFocus) this.activate(con);
        this.flatten();
        return true;
    };

    // tree_move
    M.move = function (con, dir) {
        var position, target;
        if (!con || con.type === "ws" || isFloating(con)) return;
        // Minimized windows are out of the layout (§10 V7): never swapped with, never company.
        if (con.fullscreen || (con.parent.type === "ws" && liveChildren(con.parent, con) === 1)) {
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
                var swap = stepReachable(siblings, idx, isBefore(dir) ? -1 : 1);
                if (swap) {
                    if (!isLeaf(swap)) {
                        target = descendDirection(swap, dir);
                        position = (orient(target.parent) !== o || isBefore(dir)) ? "after" : "before";
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
        if (!focusPermits(this, above.parent)) return;
        var aIdx = above.parent.nodes.indexOf(above);
        var next = stepReachable(above.parent.nodes, aIdx, isBefore(dir) ? -1 : 1);
        if (next && !isLeaf(next)) {
            target = descendDirection(next, dir);
            position = (orient(target.parent) !== o || isBefore(dir)) ? "after" : "before";
            this.insertConInto(con, target, position);
        } else if (!next && con.parent.parent && con.parent.parent.type === "ws" &&
                   liveChildren(con.parent, con) === 1) {
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
    // ignoreFocus (i3's ignore_focus, the sticky push): no focus bookkeeping at all, the con at
    // the tail of the target's focus stack (con_attach, step 6 skipped).
    M.moveToWorkspace = function (con, ws, ignoreFocus) {
        if (!con || con.type === "ws") return;
        var source = wsOf(con);
        if (ws === source) return;
        if (!ignoreFocus && !focusPermits(this, ws)) return;   // _con_move_to_con, con.c:1319
        var target = this.descendFocused(ws);
        var focusNext = null;
        if (!ignoreFocus && this.focused && wsOf(this.focused) === source) {
            focusNext = this.descendFocused(source);
            if (focusNext === con || hasParent(focusNext, con)) focusNext = this.nextFocused(con);
        }
        if (target.type !== "ws") target = target.parent;       // a floating one's is the ws
        if (isFloating(con)) target = ws;
        var fs = fullscreenOn(ws);
        if (con.fullscreen && fs) { fs.fullscreen = false; fs = null; }
        var parent = con.parent;
        detach(con);
        attach(con, target, false);
        fixPercent(parent);
        con.percent = 0;
        fixPercent(target);
        if (!fs && !ignoreFocus) focusUp(con);   // i3 step 6: not under the target's fullscreen window
        if (focusNext) this.activate(this.descendFocused(focusNext));
        this.onRemoveChild(parent);
    };

    // ---- tiling drag (tiling_drag.c, con.c) -------------------------------------------------
    // Rects come from the caller (kwin.js has the tiles):
    // rectOf(con) gives { x, y, width, height } for a leaf, a split or a workspace.

    var SIBLING = "sibling", CENTER = "center", PARENT = "parent";

    // con_fullscreen_permits_focusing (con.c:2327-2364): judged from the global focus's
    // fullscreen ancestor, which the change must not leave in a bad shape; a focus on another
    // window of a workspace with a fullscreen one (after an activation) moves on, as in i3.
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
        return orient(con.parent) !== orientationOf(dir) || isTabbing(con.parent.layout) ||
            descendDirection(con.parent, reverse) === con;
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
        // Not i3: the centre is at most 1.25 times as tall as it is wide and as wide as it is
        // tall, in the middle of the window, so on a narrow or a flat window it isn't a column or
        // a strip; what it gives up on either side is the beside drop that way, its indicator
        // reaching the centre (§9 G9).
        var cwFull = rect.width - 2 * siblingSize, chFull = rect.height - 2 * siblingSize;
        var ch = Math.min(chFull, cwFull * 1.25), cy = rect.y + (rect.height - ch) / 2;
        var cw = Math.min(cwFull, chFull * 1.25), cx = rect.x + (rect.width - cw) / 2;
        var overflow = 0;
        if (type === CENTER && (y < cy || y >= cy + ch)) {
            type = SIBLING;
            dir = y < cy ? UP : DOWN;
            overflow = cy - rect.y;
        } else if (type === CENTER && (x < cx || x >= cx + cw)) {
            type = SIBLING;
            dir = x < cx ? LEFT : RIGHT;
            overflow = cx - rect.x;
        }
        if (type !== PARENT && target === con) return null;
        if (type === PARENT) {
            while (target.parent.type !== "ws" && onSideOfParent(target.parent, dir)) target = target.parent;
            rect = adjustRect(rectOf(target.parent), dir, parentSize);
        } else if (type === CENTER) {
            rect = { x: cx, y: cy, width: cw, height: ch };
            // Not i3: onto a window outside a tab group, the centre is three bands: the top makes
            // the two a tabbed group, the middle a stacked one, the bottom swaps them (G11). Onto
            // a window in a group, the centre joins it, as i3's con_move_to_target.
            if (isTabbing(target.parent.layout)) {
                return { target: target, type: type, dir: null, rect: rect, band: "join" };
            }
            var third = rect.height / 3, bands = [], names = ["tabbed", "stacked", "swap"], band = null;
            for (var i = 0; i < 3; i++) {
                var b = { band: names[i], rect: { x: rect.x, y: rect.y + i * third, width: rect.width, height: third } };
                bands.push(b);
                if (!band && (y < b.rect.y + third || i === 2)) band = b.band;
            }
            return { target: target, type: type, dir: null, rect: rect, band: band, bands: bands };
        } else {
            rect = adjustRect(rect, dir, overflow || siblingSize);
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

    // Not i3 (the centre drop's top and middle bands): target and con become a tabbed or stacked
    // group in target's place, con after target and shown. When the two are the only children
    // of a container, that container takes the layout (as a sibling drop changes its parent's
    // orientation) rather than wrapping them in another. False if con can't go there.
    M.group = function (con, target, layout) {
        if (!isTabbing(layout) || target.type !== "con" || target.win === null) return false;
        if (con === target || hasParent(target, con) || !focusPermits(this, wsOf(target))) return false;
        var p = target.parent;
        if (p.type !== "ws" && (p.nodes.length === 1 || (p.nodes.length === 2 && con.parent === p))) {
            if (p.layout === "h" || p.layout === "v") p.lastSplit = p.layout;
            p.layout = layout;
        } else {
            var c = newCon(layout);
            p.nodes[p.nodes.indexOf(target)] = c;
            p.focus[p.focus.indexOf(target)] = c;
            c.parent = p;
            c.percent = target.percent;
            target.percent = 0;
            attach(target, c, false);
        }
        return this.moveToTarget(con, target);
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
            // result isn't checked. `swap` is the bottom band's swap; the other bands group, and
            // a centre onto a group's window joins it.
            if (plan.band === "tabbed" || plan.band === "stacked") { if (!this.group(con, target, plan.band)) return setFs; }
            else if (swap && plan.band !== "join") { if (!this.swap(con, target)) return setFs; }
            else this.moveToTarget(con, target);
        } else if (plan.type === SIBLING) {
            if (orient(target.parent) !== o) {
                if (con.parent === target.parent && target.parent.nodes.length === 2) target.parent.layout = o;
                else this.split(target, o);
            }
            this.insertConInto(con, target, position);
        } else {
            // In a tabbed or stacked parent the target can be in the middle: the move starts from
            // its first or last child instead, so con leaves the group (tiling_drag.c:370-385).
            if (isTabbing(target.parent.layout)) {
                var sib = target.parent.nodes;
                target = position === "before" ? sib[0] : sib[sib.length - 1];
            }
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
        node.fullscreen = con.fullscreen;          // i3 leaves fullscreen_mode as it is, both ways
        node.minimized = con.minimized;
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
        return node;
    };

    // floating_disable: back into the tiling tree, after the workspace's tiling focus. The window
    // keeps the focus if it had it (i3 leaves its focus stacks for the next con_focus to fix).
    M.floatingDisable = function (node) {
        if (!node || !isFloating(node)) return null;
        var ws = node.parent, wasFocused = this.focused === node;
        var tilingFocused = this.descendTilingFocused(ws);
        var leaf = newCon("h", node.win);
        leaf.fullscreen = node.fullscreen;
        leaf.minimized = node.minimized;
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
            if (toFloating !== isFloating(c) || !reachable(c)) continue;
            var f = this.descendFocused(c);
            this.activate(f);
            return f;
        }
        return null;
    };

    // Minimized: i3's scratchpad window (§5 C9): the leaf stays in the tree with its share to its
    // siblings (the projection skips it), and the focus kwin-i3 chooses never lands on it.
    M.setMinimized = function (win, on) {
        var con = this.byWin[win];
        if (con) con.minimized = !!on;
        return con || null;
    };

    // ---- resize (commands.c cmd_resize_tiling_width_height) --------------------------------

    // resize grow|shrink width|height <ppt>: the nearest ancestor (or con itself) that has a
    // sibling along that orientation grows by ppt, the siblings give it up equally. False if it
    // can't (nothing to resize against, or someone would vanish). i3's floor is one pixel of the
    // split (percent_for_1px, resize.c:131-136): sizeOf(split) gives its px along the orientation
    // (kwin.js has the tiles); without it, a thousandth (about 1-3 px on these outputs).
    var MIN_SHARE = 0.001;
    M.resize = function (con, what, ppt, sizeOf) {
        if (!con || con.type !== "con") return false;
        var o = what === "width" ? "h" : "v";
        var current = con;
        // resize_find_tiling_participants(..., both_sides = true)
        while (current.type !== "ws") {
            // stacked and tabbed containers are skipped (resize_find_tiling_participants)
            if (orient(current.parent) === o && !isTabbing(current.parent.layout) &&
                liveChildren(current.parent, current) > 1) break;
            current = current.parent;
        }
        if (current.type === "ws") return false;
        var parent = current.parent;
        parent.nodes.forEach(function (c) { if (c.percent === 0) c.percent = 1 / parent.nodes.length; });
        // The shares among what is shown: a minimized window's is out of the layout (§10 V7).
        var live = parent.nodes.filter(function (c) { return c === current || reachable(c); });
        var next = current.percent + ppt;
        var subtract = ppt / (live.length - 1);
        var px = sizeOf ? sizeOf(parent) : 0, floor = px > 0 ? 1 / px : MIN_SHARE;
        if (ppt < 0 && next < floor) return false;
        if (subtract >= 0) {
            for (var i = 0; i < live.length; i++) {
                var c = live[i];
                if (c !== current && c.percent - subtract < floor) return false;
            }
        }
        current.percent = next;
        live.forEach(function (c) { if (c !== current) c.percent -= subtract; });
        return true;
    };

    // resize_find_tiling_participants(..., both_sides = false), then click.c's swap that puts the
    // container in front first: up from con to the first ancestor whose parent splits along dir's
    // orientation and has a sibling on dir's side. -> { first, second } | null (none up to the
    // workspace), stacked and tabbed containers skipped.
    M.resizeParticipants = function (con, dir) {
        if (!con || con.type === "ws" || con.type === "floating") return null;
        var o = orientationOf(dir), backwards = isBefore(dir), first = con, second = null;
        while (first.type !== "ws" && first.type !== "floating" && !second) {
            if (orient(first.parent) !== o || isTabbing(first.parent.layout)) { first = first.parent; continue; }
            var i = first.parent.nodes.indexOf(first);
            second = first.parent.nodes[backwards ? i - 1 : i + 1] || null;
            if (!second) first = first.parent;
        }
        if (!second) return null;
        return backwards ? { first: second, second: first } : { first: first, second: second };
    };

    // resize_neighboring_cons(first, second, px, 0): px of the parent's `size` (con_rect_size_in_
    // orientation) go from second to first (negative: the other way). False, and nothing changed,
    // if either would drop below i3's floor of one pixel of the parent (percent_for_1px).
    // Shares not yet set get the average first, as M.resize does.
    M.resizeNeighbouring = function (first, second, px, size) {
        var parent = first.parent;
        if (!(size > 0) || !parent || second.parent !== parent) return false;
        parent.nodes.forEach(function (c) { if (c.percent === 0) c.percent = 1 / parent.nodes.length; });
        var pct = px / size, a = first.percent + pct, b = second.percent - pct, floor = 1 / size;
        if (a < floor || b < floor) return false;
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
        // A fullscreen one goes on to its workspace's neighbour below: i3 checks fullscreen first.
        if (isFloating(con) && !con.fullscreen) {
            if (o !== "h") return null;
            var fl = con.parent.floating.filter(function (c) { return c === con || reachable(c); }), k = fl.indexOf(con);
            next = (previous ? fl[k - 1] : fl[k + 1]) || (previous ? fl[fl.length - 1] : fl[0]);
            if (next === con) return null;
            // _tree_next: raised keeping the relative stack order, the list rotated until it is
            // last (tree.c:615-625), so the cycle goes on round the same order.
            var all = con.parent.floating;
            while (all[all.length - 1] !== next) all.unshift(all.pop());
            this.activate(next);
            return next;
        }
        while (con.type !== "ws") {
            if (con.fullscreen) { con = wsOf(con); break; }
            var parent = con.parent;
            // Minimized windows are not there to be focused: the siblings that are.
            var siblings = parent.nodes.filter(function (c) { return c === con || reachable(c); });
            if (siblings.length > 1 && orient(parent) === o) {
                var idx = siblings.indexOf(con);
                var cand = previous ? siblings[idx - 1] : siblings[idx + 1];
                if (cand && focusPermits(this, cand)) { next = cand; break; }
                var wrap = previous ? siblings[siblings.length - 1] : siblings[0];
                if (wrapping === "force") {
                    // never leaves the parent; a next one blocked by fullscreen blocks the wrap too
                    if (cand || !focusPermits(this, wrap)) return null;
                    next = wrap;
                    break;
                }
                if (wrapping !== "no" && !firstWrap && focusPermits(this, wrap)) firstWrap = wrap;
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
    // browser, then a video); two flags would block all directional focus (code review). Tiled
    // or floating alike (con_enable_fullscreen): a floating fullscreen window blocks focus too.
    M.fullscreenOn = function (ws) { return fullscreenOn(ws); };   // the workspace's fullscreen window, or null
    M.setFullscreen = function (win, on) {
        var con = this.byWin[win];
        if (!con || (con.type !== "con" && !isFloating(con))) return;
        con.fullscreen = false;
        var other;
        while (on && (other = fullscreenOn(wsOf(con)))) other.fullscreen = false;
        con.fullscreen = !!on;
    };

    // ---- adopting and reading ---------------------------------------------------------------

    // Rebuild a workspace's tiling tree from a spec read off KWin's live tiles at start-up:
    // { layout, percent, kids: [spec...] } for a split, { win, percent } for a window. Replaces
    // whatever the workspace held; floating windows are untouched. Focus stacks follow child order
    // until focusWin() calls refine them.
    M.adopt = function (ws, spec) {
        var self = this, wsLayout = ws.wsLayout;
        ws.nodes.slice().forEach(function (c) { self.closeCon(c, true); });
        ws.wsLayout = "default";        // the spec is the shape; workspace_layout wraps no window here
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
        ws.wsLayout = wsLayout;
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

    var LETTER = { h: "H", v: "V", tabbed: "T", stacked: "S" };

    // "H[a V[b c*]] ~f": layout letter (T tabbed, S stacked) and children in order, * on the global focus, ! on a
    // fullscreen leaf, then the floating windows. For tests and the debug log.
    M.describe = function (num) {
        var self = this, ws = this.workspaces[num];
        if (!ws) return "";
        function d(c) {
            var mark = (c === self.focused ? "*" : "") + (c.fullscreen ? "!" : "") + (c.minimized ? "_" : "");
            if (c.type !== "ws" && c.win !== null) return String(c.win) + mark;
            return LETTER[c.layout] + "[" + c.nodes.map(d).join(" ") + "]" + mark;
        }
        var s = d(ws);
        ws.floating.forEach(function (f) { s += " ~" + f.win + (f === self.focused ? "*" : "") + (f.minimized ? "_" : ""); });
        return s;
    };

    // A container's focus stack as window ids / "H[]" / "V[]", most recent first.
    M.focusOrder = function (con) {
        return con.focus.map(function (c) {
            return c.win !== null ? (isFloating(c) ? "~" : "") + String(c.win) : LETTER[c.layout] + "[]";
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
        isHidden: isHidden,
        orient: orient,
        nextWorkspace: nextWorkspace,
        LEFT: LEFT, RIGHT: RIGHT, UP: UP, DOWN: DOWN,
        SIBLING: SIBLING, CENTER: CENTER, PARENT: PARENT,
        create: function (env) { return new Model(env); }
    };
})();

if (typeof module !== "undefined") module.exports = Tree;
// ---- src/rules.js
// Which kind each window is (docs/behaviour.md §3): i3's kinds,
// decided as i3's manage.c decides them, then the user's rules in i3's own syntax (`forWindow`:
// `for_window [criteria] floating enable|disable`; `assign [criteria] → N | output X`), read from
// kwinrc's [Script-kwin-i3] group (src/settings.js); `floatingWorkspaces` is read as rules too.
//
// Kinds: "tiling", "floating" and "sticky" (on all desktops: floating, on every workspace of its
// output) are in the tree; "dock" (a panel), "root" (the desktop window) and
// "override-redirect" (KRunner, popups, menus, notifications, OSDs, Plasma's system windows) are
// kept out of it.

var Rules = (function () {
    var S = function (key) { return Settings.get(key); };

    function has(arr, v) { return arr.indexOf(String(v)) >= 0; }
    function managed(kind) { return kind === "tiling" || kind === "floating" || kind === "sticky"; }

    // ---- the kinds kept out of the tree ---------------------------------------------------------

    // i3's kind of a window kept out of the tree: "dock", "root", "override-redirect", or null
    // for one that may be in the tree. Plasma's system windows are Normal windows on Wayland,
    // where i3 would never see them: a built-in list, not a setting (R5). Spectacle's region
    // overlays (one Normal fullscreen window per output, probe 93) are override-redirect too
    // in the tree they would gather on the focused workspace. An
    // override-redirect window holds the keyboard against kwin-i3's keys (§5 A3), as dmenu in i3.
    var OVERRIDE_CLASSES = ["krunner", "kded5", "kded6", "xwaylandvideobridge", "ksplashqml",
                            "kwin_wayland", "ksmserver-logout-greeter"];
    var SPECTACLE = ["spectacle", "org.kde.spectacle"];
    var PLASMASHELL = /^(org\.kde\.)?plasmashell$/;
    function i3Kind(w) {
        if (w.dock) return "dock";
        if (w.desktopWindow) return "root";
        // kwini3helper's strips over the gaps are kwin-i3's own, as i3's frames: no client.
        if (String(w.caption) === "kwin-i3 gap") return "override-redirect";
        if (w.popupWindow || w.menu || w.dropdownMenu || w.popupMenu || w.tooltip ||
            w.onScreenDisplay || w.comboBox || w.dndIcon || w.appletPopup) return "override-redirect";
        // Plasma's notifications are Plasma's (philosophy.md), by class as the default rule names
        // plasmashell; another app's notification-type window (an X11 toast) floats, as i3's
        // manage.c:466. KWin shows a script no X11-only property to tell them apart by.
        if ((w.notification || w.criticalNotification) && PLASMASHELL.test(String(w.resourceClass))) return "override-redirect";
        if (has(OVERRIDE_CLASSES, w.resourceClass) || has(OVERRIDE_CLASSES, w.resourceName)) return "override-redirect";
        if (w.fullScreen && (has(SPECTACLE, w.resourceClass) || has(SPECTACLE, w.resourceName))) return "override-redirect";
        return null;
    }

    // KWin calls every fullscreen window not resizeable (XdgToplevelWindow::isResizable), so one
    // is judged by its own size limits, KWin's own last test (min < max on either axis; no max
    // is INT_MAX). Read as "fixed size", a caption change while fullscreen floated a tiled
    // browser. A fullscreen request not yet applied
    // (resizeable false, fullScreen false) still reads "float": the plan's known limit.
    function fixedSize(w) {
        if (!w.fullScreen) return !w.resizeable;
        return !(w.minSize.width < w.maxSize.width || w.minSize.height < w.maxSize.height);
    }

    // i3's `window_type` criterion values (match.c), from KWin's type flags.
    function windowType(w) {
        if (w.dialog) return "dialog";
        if (w.utility) return "utility";
        if (w.toolbar) return "toolbar";
        if (w.splash) return "splash";
        if (w.notification) return "notification";
        return "normal";
    }

    // i3's float at manage (manage.c:466-500): a dialog, utility, toolbar or splash window (X11
    // types too: R2), a transient, a modal, a fixed size; and tools/capture's note (R8).
    function floatsByDefault(w) {
        if (w.transient || w.modal || fixedSize(w)) return true;
        if (w.dialog || w.utility || w.toolbar || w.splash || w.notification || w.criticalNotification) return true;
        return String(w.caption) === "kwin-i3 capture note";
    }

    // ---- the rules ------------------------------------------------------------------------------

    var CRITERIA = ["class", "instance", "title", "window_role", "window_type", "workspace", "floating", "tiling", "all"];

    // i3's window_type values (match.c); kwin-i3's windows only ever have the first six, the
    // rest are kept out of the tree, as Plasma's notifications are (philosophy.md).
    var WINDOW_TYPES = ["normal", "dialog", "utility", "toolbar", "splash", "notification", "menu", "dropdown_menu", "popup_menu", "tooltip"];

    // i3 compiles a criterion with PCRE2 (regex.c). JavaScript's own syntax, strict (the u flag),
    // reads most of it; what it refuses and i3 configs commonly hold, a leading (?i) and escaped
    // punctuation (\-, \ , \_), is read as PCRE would: the case-insensitive flag, loose escapes.
    // Possessive quantifiers and atomic groups stay unreadable: WARN, the rule skipped.
    function regex(src, where) {
        try { return new RegExp(src, "u"); } catch (e) { /* PCRE-only syntax: try loosely below */ }
        var flags = "", body = src;
        if (/^\(\?i\)/.test(body)) { flags = "i"; body = body.slice(4); }
        try { return new RegExp(body, flags); }
        catch (e) { log("WARN setting " + where + ": \"" + src + "\" isn't a regular expression kwin-i3 can read (" + e.message + ")"); return null; }
    }

    // `[class="^x$" title="y"]` -> { class: RegExp, title: RegExp } (`floating`, `tiling`, `all`
    // take no value); null with a logged WARN for anything else. Values are quoted, `\"` inside,
    // or bare as i3's `word` (commands.spec): up to a space, a quote or the `]`.
    function parseCriteria(text, where) {
        var crit = {}, rest = text.trim(), n = 0;
        while (rest.length) {
            var m = /^(\w+)(?:\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"\]]+)))?\s*/.exec(rest);
            if (!m || !has(CRITERIA, m[1])) { log("WARN setting " + where + ": can't read the criteria \"" + text + "\""); return null; }
            rest = rest.slice(m[0].length);
            var key = m[1], value = m[2] !== undefined ? m[2].replace(/\\"/g, "\"") : m[3];
            if (key === "floating" || key === "tiling" || key === "all") {
                if (value !== undefined) { log("WARN setting " + where + ": " + key + " takes no value (\"" + text + "\")"); return null; }
                crit[key] = true;
            } else if (value === undefined) {
                log("WARN setting " + where + ": " + key + " needs a value (\"" + text + "\")");
                return null;
            } else if (key === "window_type") {
                // A keyword in i3, matched case-insensitively against the window's one type
                // (match.c, strcasecmp), not a regular expression.
                var type = value.toLowerCase();
                if (!has(WINDOW_TYPES, type)) { log("WARN setting " + where + ": window_type \"" + value + "\" isn't one of i3's (" + WINDOW_TYPES.join(", ") + ")"); return null; }
                crit[key] = { test: function (v) { return v === type; } };
            } else {
                crit[key] = regex(value, where);
                if (!crit[key]) return null;
            }
            n++;
        }
        if (!n) { log("WARN setting " + where + ": empty criteria"); return null; }
        return crit;
    }

    // Rules are separated by line breaks or `;` outside quotes (kwinrc keeps line breaks; the
    // default in main.xml is one line). -> the pieces, trimmed, empty ones dropped.
    function split(text) {
        var out = [], cur = "", quoted = false;
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (c === "\\" && quoted && i + 1 < text.length) { cur += c + text.charAt(++i); continue; }
            if (c === "\"") quoted = !quoted;
            // A line break ends a rule whatever the quotes: one stray " (a typo) no longer joins
            // the lines below into it, losing their ;-separated rules too.
            if (c === "\n" || c === "\r") { out.push(cur); cur = ""; quoted = false; continue; }
            if (c === ";" && !quoted) { out.push(cur); cur = ""; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    }
    // One rule per line: `[criteria] command`. -> [{ crit, rest, src }], bad lines skipped.
    function lines(text, where) {
        var out = [];
        split(String(text || "")).forEach(function (line) {
            var src = line.trim();
            if (!src) return;
            var m = /^\[((?:[^\]"]|"(?:[^"\\]|\\.)*")*)\]\s*(.*)$/.exec(src);
            if (!m) { log("WARN setting " + where + ": a rule starts with [criteria]: \"" + src + "\""); return; }
            var crit = parseCriteria(m[1], where);
            if (crit) out.push({ crit: crit, rest: m[2].trim(), src: src });
        });
        return out;
    }

    // `forWindow`: [{ crit, floating: true|false, src }]. Only `floating enable|disable` (R9).
    function parseForWindow(text) {
        var out = [];
        lines(text, "forWindow").forEach(function (r) {
            var m = /^floating\s+(enable|disable)$/.exec(r.rest);
            if (!m) { log("WARN setting forWindow: only \"floating enable\" and \"floating disable\" are rules here: \"" + r.src + "\""); return; }
            out.push({ crit: r.crit, floating: m[1] === "enable", src: r.src });
        });
        return out;
    }

    // `assign`: [{ crit, workspace: N } | { crit, output: name }]; `→` or `->`, `workspace`,
    // `number` optional before N (1-10), as i3 takes them.
    function parseAssign(text) {
        var out = [];
        lines(text, "assign").forEach(function (r) {
            var m = /^(?:(?:→|->)\s*)?(?:workspace\s+)?(?:number\s+)?([0-9]+)$/.exec(r.rest);
            if (m) {
                if (+m[1] < 1 || +m[1] > 10) { log("WARN setting assign: workspace " + m[1] + " isn't one of 1-10: \"" + r.src + "\""); return; }
                out.push({ crit: r.crit, workspace: +m[1], src: r.src });
                return;
            }
            m = /^(?:(?:→|->)\s*)?output\s+(\S+)$/.exec(r.rest);
            if (m) { out.push({ crit: r.crit, output: m[1], src: r.src }); return; }
            log("WARN setting assign: want \"→ N\", \"workspace N\" or \"output X\": \"" + r.src + "\"");
        });
        return out;
    }

    // `floatingWorkspaces` as rules: `[workspace="^N$"] floating enable` each (R11), first.
    function workspaceRules() {
        return Object.keys(S("floatingWorkspaces")).map(function (n) {
            return { crit: { workspace: new RegExp("^" + n + "$", "u") }, floating: true, src: "floatingWorkspaces " + n };
        });
    }

    // Parsed once per text (the settings are re-read on every KWin reconfigure).
    var cache = { key: null, forWindow: null, assign: null };
    function current() {
        var key = JSON.stringify([S("forWindow"), S("assign"), S("floatingWorkspaces")]);
        if (cache.key !== key) {
            cache.key = key;
            cache.forWindow = workspaceRules().concat(parseForWindow(S("forWindow")));
            cache.assign = parseAssign(S("assign"));
        }
        return cache;
    }

    // All of a rule's criteria must match (match.c). ctx: { ws: the workspace number the window
    // is on or opens on (null: unknown), kind: its kind before the rule }.
    function matches(crit, w, ctx) {
        for (var key in crit) {
            var re = crit[key], v;
            if (key === "all") continue;
            if (key === "floating") { if (ctx.kind !== "floating") return false; continue; }
            if (key === "tiling") { if (ctx.kind !== "tiling") return false; continue; }
            if (key === "class") v = w.resourceClass;
            else if (key === "instance") v = w.resourceName;
            else if (key === "title") v = w.caption;
            else if (key === "window_role") v = w.windowRole;
            else if (key === "window_type") v = windowType(w);
            else if (key === "workspace") { if (ctx.ws === null || ctx.ws === undefined) return false; v = ctx.ws; }
            if (!re.test(String(v === undefined || v === null ? "" : v))) return false;
        }
        return true;
    }

    // ---- the verdicts ---------------------------------------------------------------------------

    // The window's kind (A). ctx: { ws: the workspace it is on or opens on, current: its kind in
    // the tree ("tiling"/"floating") for a window already adopted, else null, ran: {} the rules
    // already run on it (by index; i3 runs each rule at most once per window, only to apply it,
    // X2), filled in here }. A window with `current` keeps it unless a rule not yet run matches.
    // The kind of a window kept out of the tree, or null for one that is in it (A1-A5).
    function keptOut(w) {
        if (w.deleted) return "override-redirect";
        var kept = i3Kind(w);
        if (kept) return kept;
        if (!w.normalWindow && !(w.dialog || w.utility || w.toolbar || w.splash || w.notification || w.criticalNotification)) return "override-redirect";
        return null;
    }
    // "sticky": on all virtual desktops (i3's _NET_WM_DESKTOP all, manage.c:486-490: "float it and
    // make it sticky"): in the tree, floating. The rules run after, as i3's
    // for_window does (run_assignments, manage.c:588): `floating disable` tiles it, which here
    // takes it off all desktops (KWin's tiles belong to one desktop, §3 X4; kwin.js adopts it so);
    // `floating enable` leaves it sticky. ctx.current "sticky" for one in the tree already.
    function classify(w, ctx) {
        ctx = ctx || {};
        var kept = keptOut(w);
        if (kept) return kept;
        // Not while kwin-i3 itself has it on all desktops to carry it across outputs (ctx.crossing,
        // kwin.js relocate): a caption change then floated a tiled window for good.
        var sticky = w.onAllDesktops && !ctx.crossing;
        var kind = sticky ? (ctx.current === "tiling" ? "tiling" : "sticky")
                          : ctx.current === "sticky" ? "floating" : ctx.current || (floatsByDefault(w) ? "floating" : "tiling");
        var ran = ctx.ran || {}, rules = current().forWindow;
        for (var i = 0; i < rules.length; i++) {
            if (ran[i]) continue;
            if (!matches(rules[i].crit, w, { ws: ctx.ws, kind: kind === "sticky" ? "floating" : kind })) continue;
            ran[i] = true;
            kind = rules[i].floating ? (sticky ? "sticky" : "floating") : "tiling";
        }
        return kind;
    }

    // `assign` for a window that just appeared (N12): { workspace: N } or { output: name }, the
    // first rule that matches, else null. The window's kind before rules is what `floating` and
    // `tiling` criteria see (i3 runs assign at manage, before for_window).
    // No kind yet: i3 reads assignments before the con exists (manage.c), so a `floating` or
    // `tiling` criterion never matches in an assign (match.c, window_mode).
    // Both kinds, as i3 applies both: the first matching workspace assignment, then the first
    // matching output one on top of it (manage.c:289, :354). -> null, or
    // { workspace, output } with one or both set.
    function assignFor(w) {
        var rules = current().assign, out = null;
        for (var i = 0; i < rules.length; i++) {
            if (!matches(rules[i].crit, w, { ws: null, kind: null })) continue;
            out = out || {};
            if (rules[i].workspace && !out.workspace) out.workspace = rules[i].workspace;
            if (rules[i].output && !out.output) out.output = rules[i].output;
        }
        return out;
    }

    // i3's floating_minimum_size / floating_maximum_size (N15): "WxH"; 0 means i3's default (75x50
    // for the minimum, all outputs together for the maximum), -1 no limit. -> { w, h } or null.
    function parseSize(text) {
        var m = /^\s*(-?[0-9]+)\s*x\s*(-?[0-9]+)\s*$/.exec(String(text));
        return m && +m[1] >= -1 && +m[2] >= -1 ? { w: +m[1], h: +m[2] } : null;
    }

    return { classify: classify, keptOut: keptOut, i3Kind: i3Kind, managed: managed, assignFor: assignFor,
             parseForWindow: parseForWindow, parseAssign: parseAssign, parseSize: parseSize, windowType: windowType };
})();

if (typeof module !== "undefined") module.exports = Rules;
// ---- src/workspaces.js
// Workspaces and monitors, carried over from an earlier script, i3ws.
// Workspace N is virtual desktop N. It lives on one monitor (its "home"), shown there or hidden;
// Plasma 6.7's per-output desktops let each monitor show a different one.
//
// Homes are output *names*, always of a connected output: when a monitor goes away its workspaces
// move to a remaining one for good, and a returning monitor gets back only the workspaces assigned
// to it, as in i3 (randr.c; docs/plan.md decision 10: src/outputs.js decides,
// src/kwin.js screensChanged acts).

var Workspaces = (function () {
    var home = {};          // ws num -> output name
    var MAX = 10;           // kwin-i3's keys: Meta+1..0

    // i3 creates a workspace when it is first used: KWin's desktops up to num, appended so none
    // moves, never removed (KWin saves the count). A stock
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
    // else the first screen. Only a missing home is filled in (screensChanged settles a lost one).
    function outputOf(num) {
        var h = home[num] ? screenNamed(home[num]) : null;
        if (h) return h;
        var s = showing(num);
        if (!home[num] && s) home[num] = s.name;
        return s || ordered()[0];
    }

    function setHome(num, screen) { home[num] = screen.name; }
    function setHomeName(num, name) { if (name) home[num] = name; else delete home[num]; }
    function hasHome(num) { return !!home[num]; }

    // i3's "workspace N output A B …" (workspaceOutputs; §4 W5): the first connected output of
    // the workspace's list, by name, or null (none listed, or none connected). Applied where a
    // home is first claimed and when an output appears, so a changed setting moves no workspace
    // that exists (i3 assigns at creation).
    function assignedList(num) { return Settings.get("workspaceOutputs")[num] || []; }
    function assigned(num) {
        var list = assignedList(num);
        for (var i = 0; i < list.length; i++) if (screenNamed(list[i])) return list[i];
        return null;
    }
    function assignedScreen(num) { var a = assigned(num); return a ? screenNamed(a) : null; }
    // A workspace's first home: its assigned output if connected, else the screen it is used on.
    function claimHome(num, screen) { home[num] = assigned(num) || screen.name; }

    // KWin's outputs, the primary first (System Settings > Display's order): `screenOrder`, the
    // order KWin's own "Switch to Screen N" counts in (useractions.cpp). `screens` is the backend's
    // order (DRM connectors), which only matches by luck. i3's outputs list starts at the primary
    // too (get_first_output, randr.c:80-98).
    function ordered() {
        var o = workspace.screenOrder;
        return o && o.length ? o : workspace.screens;
    }

    // i3's get_output_next (randr.c:259-317): an output that way by origin, overlapping s on the
    // other axis, the closest (far: the farthest). With wrap, get_output_next_wrap: none that way,
    // the farthest the other way (randr.c:225-247), as the commands do (output.c
    // get_output_from_string); the tree's edge crossing doesn't wrap (tree.c, move.c).
    var OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };
    function outputNext(s, dir, far) {
        var a = s.geometry, best = null, all = ordered();
        for (var i = 0; i < all.length; i++) {
            if (all[i] === s) continue;
            var o = all[i].geometry;
            if (dir === "left" || dir === "right") {
                if (dir === "right" ? !(o.x > a.x) : !(o.x < a.x)) continue;
                if (o.y + o.height <= a.y || a.y + a.height <= o.y) continue;
            } else {
                if (dir === "down" ? !(o.y > a.y) : !(o.y < a.y)) continue;
                if (o.x + o.width <= a.x || a.x + a.width <= o.x) continue;
            }
            if (!best) { best = all[i]; continue; }
            var b = best.geometry;
            var nearer = dir === "right" ? o.x < b.x : dir === "left" ? o.x > b.x : dir === "down" ? o.y < b.y : o.y > b.y;
            var farther = dir === "right" ? o.x > b.x : dir === "left" ? o.x < b.x : dir === "down" ? o.y > b.y : o.y < b.y;
            if (far ? farther : nearer) best = all[i];
        }
        return best;
    }
    function screenToward(s, dir, wrap) {
        return outputNext(s, dir, false) || (wrap ? outputNext(s, OPPOSITE[dir], true) : null);
    }

    // i3's numbering at login (init_ws_for_output, randr.c:456-520): each output, primary first,
    // shows its first assigned workspace (the lowest number set to it: the setting is keyed by
    // number, where i3 takes its config's first), else the lowest-numbered workspace that is free
    // and not set to another output (create_workspace_on_output); with none set, 1 on the
    // primary, 2 on the next, ... Workspaces set to an output get their homes first. i3ws did this on every load, so reloading it
    // mid-session reshuffled the monitors (2026-10-21); kwin-i3 does it only when it starts with
    // no windows (a login).
    // Workspaces a screen needs are created (ensure), so each monitor has its own.
    function numberScreens() {
        var s = ordered(), n = workspace.desktops.length, taken = {};
        var a = Settings.get("workspaceOutputs");
        Object.keys(a).forEach(function (k) { if (+k <= n && assigned(+k)) home[k] = assigned(+k); });
        for (var i = 0; i < s.length; i++) {
            var pick = 0, num;
            for (num = 1; num <= MAX && !pick; num++)
                if (!taken[num] && assigned(num) === s[i].name) pick = num;
            for (num = 1; num <= MAX && !pick; num++)
                if (!taken[num] && !(assigned(num) && assigned(num) !== s[i].name)) pick = num;
            if (!pick) continue;
            ensure(pick);
            taken[pick] = true;
            workspace.setCurrentDesktopForScreen(deskOf(pick), s[i]);
            home[pick] = s[i].name;
        }
    }

    return {
        deskOf: deskOf, deskNum: deskNum, ensure: ensure, showing: showing, outputOf: outputOf,
        setHome: setHome, setHomeName: setHomeName, hasHome: hasHome, screenToward: screenToward, numberScreens: numberScreens,
        ordered: ordered,
        assigned: assigned, assignedList: assignedList, assignedScreen: assignedScreen, claimHome: claimHome,
        homes: function () { return home; },
        reset: function () { home = {}; },      // the model rebuilt
    };
})();
// ---- src/outputs.js
// Where workspaces live when outputs come and go (i3's
// randr.c move_content and init_ws_for_output). Pure functions of a snapshot, so they are
// unit-tested (tests/unit/outputs.test.js); src/kwin.js screensChanged takes the snapshot and acts.
//
// The snapshot st: { outputs: [connected output names, KWin's order, primary first],
//   homes: { num: output name }, assigned: { num: [output names, the setting's order] },
//   occupied: { num: true } (workspaces with windows), focused: num or null }.

var Outputs = (function () {
    function connected(st, name) { return st.outputs.indexOf(name) >= 0; }
    // i3's get_assigned_output: the first connected output of the workspace's list, or null.
    function firstAssigned(num, st) {
        var list = st.assigned[num] || [];
        for (var i = 0; i < list.length; i++) if (connected(st, list[i])) return list[i];
        return null;
    }
    function nums(obj) { return Object.keys(obj).map(Number).sort(function (a, b) { return a - b; }); }

    // B. An output lost (move_content): where each workspace that lived on it goes, for good.
    // With windows, or the focused one: the first output (i3's move_content, randr.c: every
    // workspace of a lost output to get_first_output(), the primary, assignments not read; they
    // bring it back when its output returns, movingTo); an empty unfocused one has no lasting
    // output (i3 closes it): null.
    // -> { num: new home or null } for every workspace whose home was the lost output.
    function homesAfterLoss(lost, st) {
        var out = {};
        nums(st.homes).forEach(function (n) {
            if (st.homes[n] !== lost) return;
            if (!st.occupied[n] && st.focused !== n) { out[n] = null; return; }
            out[n] = st.outputs[0] || null;
        });
        return out;
    }

    // C1. An output X appearing (init_ws_for_output): the workspaces that move to it: every one
    // that exists (has a home) whose first connected assigned output is X and whose home isn't X
    // already, lowest first. i3 loops over its existing workspaces only (randr.c:462-486); an
    // assigned one not made yet is made when it is shown (C3) or first used.
    function movingTo(X, st) {
        return nums(st.homes).filter(function (n) { return firstAssigned(n, st) === X && st.homes[n] !== X; });
    }

    // C2. What a source output shows once the workspace it showed has moved away (i3's focus
    // order, as S10): the one it most recently showed that has windows and still lives there
    // (`recent`: numbers, most recent first), else its lowest with windows, else null (the caller
    // finds an unused one).
    function sourceShows(source, recent, st) {
        function fits(n) { return st.homes[n] === source && !!st.occupied[n]; }
        for (var i = 0; i < recent.length; i++) if (fits(recent[i])) return recent[i];
        var lowest = nums(st.homes).filter(fits);
        return lowest.length ? lowest[0] : null;
    }

    // C3. What an output X shows once its workspaces have moved to it: its lowest-numbered
    // workspace, else its first assigned one (the lowest number whose first connected output is
    // X), else null (the caller finds the lowest free one, M1's rule).
    function newShows(X, st) {
        var own = nums(st.homes).filter(function (n) { return st.homes[n] === X; });
        if (own.length) return own[0];
        var assigned = nums(st.assigned).filter(function (n) { return firstAssigned(n, st) === X; });
        return assigned.length ? assigned[0] : null;
    }

    return { firstAssigned: firstAssigned, homesAfterLoss: homesAfterLoss, movingTo: movingTo,
             sourceShows: sourceShows, newShows: newShows };
})();

if (typeof module !== "undefined") module.exports = Outputs;
// ---- src/placement.js
// Where a new window goes, and which outside desktop switch it caused. Pure functions of recorded
// state, so they are unit-tested (tests/unit/placement.test.js);
// src/kwin.js gathers the facts and acts on the answers. Workspaces are numbers, outputs names.

var Placement = (function () {
    // A's target workspace T for a window that just appeared, the first rule that applies:
    //   1. a modal dialog whose parent is in the tree: the parent's workspace (C3);
    //   2. a window that asked for a virtual desktop (a session restore, a KWin rule, X11's
    //      _NET_WM_DESKTOP): that one (i3's _NET_WM_DESKTOP; C4). Seen as: its desktop was shown
    //      on no output before the window's own switch, so KWin's default (the active output's
    //      current desktop) can't have given it. One that asked for exactly a shown desktop reads
    //      as 3, the known limit written into §5 C1;
    //   3. the focused workspace (C1); with no focus (a login's first window) KWin's choice stands.
    // w: { desk: its desktop's number, modal: bool, parentWs: the parent's workspace number or
    // null }; shown: { outputName: the desktop number shown there before the window's own switch };
    // focusedWs: the focused workspace's number, or null.
    // -> { ws, why: "parent" | "asked" | "focused" | "kwin" }
    function target(w, shown, focusedWs) {
        if (w.modal && w.parentWs) return { ws: w.parentWs, why: "parent" };
        var seen = false;
        for (var name in shown) if (shown[name] === w.desk) seen = true;
        if (!seen && w.desk >= 1) return { ws: w.desk, why: "asked" };
        if (focusedWs) return { ws: focusedWs, why: "focused" };
        return { ws: w.desk, why: "kwin" };
    }

    // B: the recorded outside switches a new window claims: the one on its output whose new
    // desktop is the window's (KWin switched that output to activate it). Removed from `pending`
    // and returned, or null. pending: [{ output: name, previous: number, current: number }].
    function claim(pending, outputName, desk) {
        for (var i = 0; i < pending.length; i++) {
            var e = pending[i];
            if (e.output === outputName && e.current === desk) {
                pending.splice(i, 1);
                return e;
            }
        }
        return null;
    }

    // What each output showed before a new window's own switch: the recorded switch's previous
    // desktop where there is one on that output, else what it shows now.
    function shownBefore(outputs, pending) {
        var out = {};
        for (var i = 0; i < outputs.length; i++) out[outputs[i].name] = outputs[i].shows;
        // The earliest pending switch per output: two in one turn, the first's previous is what
        // it showed before them (not the last one's).
        var taken = {};
        for (var j = 0; j < pending.length; j++) {
            var o = pending[j].output;
            if (o in out && !taken[o]) { out[o] = pending[j].previous; taken[o] = true; }
        }
        return out;
    }

    // C: i3's manage.c:437: a new window takes the focus only if its workspace is visible and on
    // the focused output. No focus yet (a login's first window): it takes it.
    function takesFocus(visible, onFocusedOutput, hasFocus) {
        if (!hasFocus) return true;
        return visible && onFocusedOutput;
    }

    return { target: target, claim: claim, shownBefore: shownBefore, takesFocus: takesFocus };
})();

if (typeof module !== "undefined") module.exports = Placement;
// ---- src/keyname.js
// Qt key codes as people read them, for the load-time notice:
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
    // The frame: with kwini3hold loaded, tiled windows have no
    // decoration and the effect draws i3's frame in the tiles' padding. frameOn is what the
    // effect last said (asked at load and on every reconfigure; the effect asks for a
    // reconfigure when it loads or goes). tookBorder: the windows whose border kwin-i3 took;
    // borderDue: those it would take but whose title bar isn't there yet (takeBorder).
    var frameOn = false, tookBorder = {}, borderDue = {};
    var borderGone = {};                             // window id -> its GTK 4 bounds (refitOnFrameChange)
    var HAIR = 1e-6;                                 // the root's inset at no gaps (rootRect)
    var gapCache = {}, passWs = null;                // each workspace's gaps for the pass, and the workspace the pass is on (gaps)
    // The floating mark (spec-window-modes decision 5c): with the effect, it keeps the set of
    // floating windows (told[key]: what it was last told), which outlives a reload of this
    // script; at load the answer says which windows were floating (atLoadFloating).
    var told = {}, atLoadFloating = {};
    var dragTold = {};                  // the drag helper's floating list (tellDragFloating)
    var marks = false;              // the effect answers with its floating set (an older one doesn't)
    var effectSeen = false;         // the effect answered Stats (SetFocused goes to it)
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
    // Plasma), which kwin-i3's focus follows (shownOutside).
    var switching = 0;
    function showOn(desk, s) {
        switching++;
        try { workspace.setCurrentDesktopForScreen(desk, s); } finally { switching--; }
    }
    // Desktop switches made outside kwin-i3, recorded as they come and handled a turn later
    // KWin emits windowAdded in the same call as the
    // activation that switched an output to the new window's desktop (workspace.cpp
    // addWaylandWindow), so adoptWindow runs first and claims that switch (Placement.claim); what
    // is left is i3's `workspace N` on that output (shownOutside).
    var pendingShown = [], pendingTimer = false;    // [{ output: name, previous: num or 0, current: num }]
    // The helper's tiling drag (startDrag below).
    var DRAG = ["org.kde.KWin", "/kwini3drag", "net.local.kwini3drag"];
    var drag = null;        // { con, timer, busy, plan, rect }: a drag being followed
    // i3's resize mode: the helper owns the state and tells kwin-i3
    // through the hidden action Mode Changed, then Mode(); asked once at load, so a reload of this
    // script can't lose step. While it is on, every key of kwin-i3's does nothing but the four
    // resize actions the mode itself runs (i3: only the mode's bindings are active).
    var MODE = ["org.kde.KWin", "/kwini3mode", "net.local.kwini3mode"];
    var mode = "";
    var MODE_ACTIONS = { "Shrink Width": true, "Grow Width": true, "Shrink Height": true, "Grow Height": true, "Resize Mode": true };

    // Newcomers the effect hides until kwin-i3 has moved them (holdNew): window id -> "waiting"
    // until the pass that moves it is scheduled, then true (showHeld shows only those).
    var holdNamed = {};
    var connected = {};     // window id -> true once its signals are connected (once only)
    var closeWatched = {};  // window id -> true once its `closed` is watched (watchClose)
    // A window outside the tree that is closing (its `closed` signal, before windowRemoved): KWin's
    // activation in between is its own next choice, not the user's (windowActivated).
    var closingOutside = null;
    // A window in the tree that is closing, the same span: KWin's activation then is its own
    // choice, which the close's pass corrects, and i3 doesn't warp at a close (tree.c).
    var closingTree = null;
    var ruleRan = {};       // window id -> { rule index: true }: the forWindow rules already run on it (Rules.classify, X2)
    var dirty = {};         // ws num -> true, waiting for the coalesced reconcile
    var timer = null;
    var released = false;
    var placing = {};       // window id -> true while we move it between desktops/outputs
    var snapW = 1, snapH = 1; // screen size in px, for snapping tile edges (setSizes)
    var moved = [];           // the tiles setSizes changed in its latest pass, for setSizesStable's warning
    var touchedRoots = {};  // "screen/desktop id" -> true once reconciled (put back on release)
    // Apply model focus after the next reconcile; from: the monitor a key action moved focus
    // from, so the pointer follows to the new one (i3 warps only from commands: x_set_warp_to in
    // _tree_next and workspace_show). Any other pass (a window closed, settings, monitors) moves
    // no pointer: a panel popup closing on the other monitor sent it to the focused window
    // although focus never moved (tests/live/72-pointer-stays.sh).
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
        // On all desktops (sticky, §3 R3): the workspace its output shows.
        if (w.onAllDesktops && w.output) return wsModel(shownOn(w.output));
        if (w.desktops.length !== 1) return null;
        var num = deskNum(w.desktops[0]);
        // A virtual desktop past 10 (Plasma's Overview can add one) is not kwin-i3's (plan.md
        // decision 9): a window there is in no workspace.
        if (num < 1 || num > NAMES.length) return null;
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, w.output);
        return wsModel(num);
    }

    // The number of the workspace an output shows, its home claimed if it had none.
    function shownOn(s) {
        var num = deskNum(workspace.currentDesktopForScreen(s));
        if (!Workspaces.hasHome(num)) Workspaces.claimHome(num, s);
        return num;
    }
    // The same workspace's model, or null for a desktop outside kwin-i3's workspaces.
    function shownWs(s) {
        var num = deskNum(workspace.currentDesktopForScreen(s));
        if (num < 1 || num > NAMES.length) return null;
        return wsModel(shownOn(s));
    }
    // Where the focus goes on a workspace shown anew: its fullscreen window, or its focus.
    function focusOf(ws) { return model.fullscreenOn(ws) || model.descendFocused(ws); }
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
        passWs = null;
        try { tellRings(); } catch (e) { log("ERROR in tellRings: " + e + (e.stack ? " " + e.stack : "")); }
        try { tellBars(); } catch (e) { log("ERROR in tellBars: " + e + (e.stack ? " " + e.stack : "")); }
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
    // everything opened after (A capture, 2026-10-23 23:25).
    // Both stay in the tree and join the layout when fullscreen ends. w.tile is KWin's
    // *requested* tile (window.h: READ requestedTile), cleared by the unmanage itself, not on
    // the client's acknowledgement, so it is safe to decide from (probed with a stopped client).
    // A fullscreen window still in its tile stays there: KWin puts it back when fullscreen ends.
    function visibleLeaf(c) {
        var w = wins[c.win];
        return w && !w.minimized && !(w.fullScreen && !w.tile);
    }

    // A tabbed or stacked group (i3's render_con_tabbed, render_con_stacked): every child gets the
    // group's whole rect less the bar, the focused one on top. Here: a vertical pair, the bar's
    // empty tile over the shown child's tiles. The other children's windows go into the tile of
    // the shown child's focused window (`extra`), behind it, so they keep a tile at the group's
    // place. The bar (rows of BAR_ROW px: one for tabbed, one per child for stacked) is shown, as
    // i3 in its pixel look, only for more than one child; a group of one is its child alone.
    // { bar, rows, members } is the bar's kid: its px come out of the `members` kids after it,
    // which keeps them right when the pair merges into a vertical parent (setSizes).
    var BAR_ROW = 24;
    function projectGroup(con) {
        var projected = [], byNode = [];
        con.nodes.forEach(function (child) {
            var p = project(child);
            if (p) { projected.push(child); byNode.push(p); }
        });
        if (!projected.length) return null;
        var shown = null;
        for (var i = 0; i < con.focus.length && !shown; i++)
            if (projected.indexOf(con.focus[i]) >= 0) shown = con.focus[i];
        var sp = byNode[projected.indexOf(shown)];
        if (projected.length === 1) return sp;
        var hidden = [], anchor = leafOf(sp, shownWindow(shown).win) || leafOf(sp, null), order = [];
        projected.forEach(function (child, k) {
            if (child === shown) { order.push(anchor.win); return; }
            var ws = windowsOf(byNode[k]);
            hidden = hidden.concat(ws);
            order = order.concat(ws);
        });
        anchor.extra = (anchor.extra || []).concat(hidden);
        // The tile lists them in the tabs' order, so a reload reads the order back (specOf).
        anchor.order = anchor.order ? anchor.order.concat(hidden) : order;
        var members = sp.dir === "v" ? sp.kids : [{ p: sp, share: 1 }];
        var bar = { bar: con, rows: con.layout === "stacked" ? projected.length : 1, members: members.length };
        return { dir: "v", kids: [{ p: bar, share: 0 }].concat(members) };
    }
    // The window a container shows: down its focus stacks to a window, past the tree's focus (the
    // tree's descendFocused stops there, and with a container focused by focus parent a group's
    // bar lost its window), skipping what isn't placed (minimized, out of the tiles).
    function shownWindow(c) {
        while (c.nodes.length) {
            var next = null;
            for (var i = 0; i < c.focus.length && !next; i++) if (project(c.focus[i])) next = c.focus[i];
            if (!next) break;
            c = next;
        }
        return c;
    }
    // Every window a projection places, extras included.
    function windowsOf(p) {
        if (p.bar) return [];
        if (p.win !== undefined) return [p.win].concat(p.extra || []);
        return [].concat.apply([], p.kids.map(function (k) { return windowsOf(k.p); }));
    }
    // The window leaf of a projection holding `win` (null: the first one).
    function leafOf(p, win) {
        if (p.bar) return null;
        if (p.win !== undefined) return win === null || p.win === win ? p : null;
        for (var i = 0; i < p.kids.length; i++) { var l = leafOf(p.kids[i].p, win); if (l) return l; }
        return null;
    }

    // -> null | { win, extra } | { dir: "h"|"v", kids: [{ p, share }] } (a kid's p may be a bar)
    function project(con) {
        if (con.win !== null && con.type !== "ws") return visibleLeaf(con) ? { win: con.win } : null;
        if (con.layout === "tabbed" || con.layout === "stacked") return projectGroup(con);
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
            if (k.p.dir === con.layout) {      // a bar's kids too: its px still come from its members
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
        if (p.bar) return "b";
        if (p.win !== undefined) return "w:" + [p.win].concat(p.extra || []).map(String).sort().join("+");
        return p.dir + "[" + p.kids.map(function (k) { return shapeOfProjection(k.p); }).join(" ") + "]";
    }
    function shapeOfTile(t) {
        if (!t.tiles.length) return t.windows.length ? "w:" + t.windows.map(id).map(String).sort().join("+") : t.parent ? "b" : "";
        return (t.layoutDirection === 2 ? "v" : "h") + "[" +
            t.tiles.map(shapeOfTile).join(" ") + "]";
    }

    // ---- reconcile: make one workspace's tiles match the model -------------------------------

    var refused = false;    // set when KWin refused a manage() during this reconcile
    // This reconcile's group tiles (placeWindows): bars (empty on purpose), leaves holding the
    // tabs behind the shown one, and each shown tab with the windows it must be above.
    var barTiles = [], multiTiles = [], shownTabs = [], groupBars = [];
    var barsOf = {};        // workspace number -> its groups' bars as last placed ({ con, tile })
    var barTold = {};       // window id -> the bar the effect was told to draw with it (SetBar)
    var barGroups = {};     // the same ids -> the group the bar is of, for the helper's tab events
    var barsHelperTold = null;   // the helper's SetBars spec last sent (null: never)
    var tabDrag = null;     // { key, leaf } of a tab just clicked: a drag from that press takes it

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
    // moment when its workspace was next shown (A capture, 2026-10-24). Putting the frame
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

    // ---- gaps ------------------------------------------------------
    // i3's gaps (render.c): inner between windows, inner + outer at the screen's edge. KWin gives
    // a tile's window P/2 towards a neighbour and P at the screen's edge, judged by the tile's
    // relative edge being exactly 0 or 1 (tile.cpp windowGeometry): with padding = inner on
    // every tile and the root inset by outer + inner/2, no edge is 0 or 1, so between = inner and
    // edge = outer + inner. All relative to the maximize area, absoluteGeometry's basis.
    // The inner gap is even (the pickers step by 2; an odd one from kwinrc counts as the even one
    // below): KWin rounds tile edges to whole pixels (absoluteGeometry) and takes half the padding
    // a side, so an odd padding put every window half a pixel off, its text shifting when
    // anything redrew it.
    // Per workspace (§11 N2, §7 L6): i3's gaps.c calculate_effective_gaps.
    // The outer gap per side (gapsTop … gapsLeft, else gapsOuter); a workspace's own lines
    // (workspaceGaps) replace the global values, as i3's gaps_for_workspace (gaps.c:124-160).
    // A negative outer gap takes from the edge, as i3's, but only down to half the inner gap: KWin
    // gives a tile at least half its padding against the screen (tile.cpp windowGeometry) and its
    // root can't leave the output, where i3 goes to 0 and past. Below that it is held there, and
    // logged once. Then smart_gaps: `on` drops every gap on a
    // workspace with one visible tiling window, `inverse_outer` keeps the outer ones only there.
    // hide_edge_borders `smart` (and `smart_no_gaps` with no outer gap) takes a lone window's ring
    // and its room away. "One visible tiling window" is i3's con_num_visible_children <= 1: the
    // projection is a single leaf (or nothing). Computed once per pass (reconcileNow caches it:
    // a pass asks many times, and names the workspace it is on, passWs, for them); without a
    // workspace, the global values.
    function gaps(ws) {
        ws = ws || passWs;
        if (ws && gapCache[ws.num]) return gapCache[ws.num];
        return computeGaps(ws, ws ? project(ws) : undefined);
    }
    var gapFloorLogged = {};   // each held case once (a pass computes every workspace in turn)
    function computeGaps(ws, p) {
        var i = Settings.get("gapsInner"), o = Settings.get("gapsOuter"), fw = Settings.get("frameWidth");
        var side = { top: Settings.get("gapsTop"), right: Settings.get("gapsRight"), bottom: Settings.get("gapsBottom"), left: Settings.get("gapsLeft") };
        var own = ws && Settings.get("workspaceGaps")[ws.num] || {};
        if (own.inner !== undefined) i = own.inner;
        i = Math.max(0, i);
        i -= i % 2;
        var inset = {}, held = [];
        Object.keys(side).forEach(function (s) {
            var v = own[s] !== undefined ? own[s] : side[s] < 0 ? o : side[s];
            if (v < -i / 2) held.push(s + " " + v);
            inset[s] = Math.max(-i / 2, v);
        });
        var floorKey = held.length ? (ws ? ws.num : "") + ": " + held.join(", ") : "";
        if (floorKey && !gapFloorLogged[floorKey]) {
            gapFloorLogged[floorKey] = true;
            log("WARN gaps: an edge goes no thinner than half the inner gap (KWin's tile padding), held at -" + i / 2 + ": " + (ws ? "workspace " + floorKey : floorKey.slice(2)));
        }
        var one = !!(p && p.win !== undefined), smart = Settings.get("smartGaps"), hide = Settings.get("hideEdgeBorders");
        if (ws && (smart === "on" && one || smart === "inverse_outer" && !one)) inset = { top: 0, right: 0, bottom: 0, left: 0 };
        if (ws && smart === "on" && one) i = 0;
        var outerGap = inset.top > 0 || inset.right > 0 || inset.bottom > 0 || inset.left > 0;
        var ring = tiledRing() && !(ws && one && (hide === "smart" || hide === "smart_no_gaps" && !outerGap));
        Object.keys(inset).forEach(function (s) { inset[s] += i / 2; });
        // The frame's room: twice its width, so KWin's half padding leaves it on each side. With
        // title bars, the decoration's outline instead: Breeze (Plasma's default) draws 1 px
        // outside the frame geometry, which ate a pixel of every gap on each side. As i3, whose borders are inside the window's rect, the wallpaper
        // between two windows is then the gap itself in either look. KWin tells a script no
        // theme's outline, so 1 px; and only with a gap to keep (with none, i3's borders touch).
        var room = ring ? fw : !tiledBorderless() && i > 0 ? 1 : 0;
        return { inner: i + 2 * room, gap: i, inset: inset, ring: ring, one: one };
    }
    function areaOf(screen, ws) { return workspace.clientArea(KWin.MaximizeArea, screen, deskOf(ws.num)); }
    function rootRect(area, ws) {
        var g = gaps(ws), e = g.inset;
        // KWin gives a tile side exactly at the screen's edge the full padding, two frames
        // (Tile::windowGeometry): a hair's inset (0.003 px on 2560) on a side with no gap makes
        // every side half. Only where there is padding to halve.
        var hair = g.inner ? HAIR * Math.max(area.width, area.height) : 0;
        var l = e.left || hair, t = e.top || hair, r = e.right || hair, b = e.bottom || hair;
        return { x: l / area.width, y: t / area.height, width: 1 - (l + r) / area.width, height: 1 - (t + b) / area.height };
    }
    // For root tiles only (the hair's tolerance would be wrong for any other tile).
    function sameRect(g, r) {
        // The hair is far below the tolerance for float noise: told apart on its own, per edge (a
        // side may be the only one with no gap, so each edge is judged alone).
        function hairish(v) { return (v > 0 && v < 1e-4) || (v > 1 - 1e-4 && v < 1); }
        function near(a, b) { return Math.abs(a - b) <= (hairish(a) || hairish(b) ? 1e-9 : 1e-4); }
        return near(g.x, r.x) && near(g.y, r.y) && near(g.x + g.width, r.x + r.width) && near(g.y + g.height, r.y + r.height);
    }
    // Every layout's children on its outer edges and spanning its cross axis. With gaps no edge
    // is at the screen's border, so KWin lets a window's outer side be dragged
    // (Tile::supportsResizeGravity), and pins that edge to the border (CustomTile::
    // setRelativeGeometry), where no later write can move it off: only a rebuild mends it.
    function edgesIntact(t) {
        if (!t.tiles.length) return true;
        var g = t.relativeGeometry, h = t.layoutDirection !== 2, n = t.tiles.length;
        var f = t.tiles[0].relativeGeometry, l = t.tiles[n - 1].relativeGeometry;
        // Below the hair (1e-6); and a side KWin pinned to the border where the layout's side is
        // only the hair is intact: no gap is lost there, windowRect gives it half the padding, and
        // a rebuild pins it again (OPEN 63: every pass rebuilt the tree, a focus change too).
        var eq = function (a, b) {
            return Math.abs(a - b) < 1e-7 || (a <= 0 && b > 0 && b < 1e-4) || (a >= 1 && b < 1 && b > 1 - 1e-4);
        };
        if (h ? !eq(f.x, g.x) || !eq(l.x + l.width, g.x + g.width) : !eq(f.y, g.y) || !eq(l.y + l.height, g.y + g.height)) return false;
        return t.tiles.every(function (c) {
            var r = c.relativeGeometry;
            return (h ? eq(r.y, g.y) && eq(r.y + r.height, g.y + g.height) : eq(r.x, g.x) && eq(r.x + r.width, g.x + g.width)) && edgesIntact(c);
        });
    }

    // Where a tile's window goes: as KWin's Tile::windowGeometry (which scripts can't read), the
    // tile less P/2 on a side inside the screen, P on a side at its edge; but a side is at the
    // edge only where the root is too. KWin pins a tile's side to the border when a rebuild's
    // float noise "changes" it (CustomTile::setRelativeGeometry compares exactly), so under a
    // root inset by the hair a pinned side got P, a 1 px line with no frame (fuzzer I11, OPEN 63).
    function rootOf(t) { while (t.parent) t = t.parent; return t; }
    function windowRect(t) {
        var a = t.absoluteGeometry, r = t.relativeGeometry, p = t.padding;
        if (!p) return a;
        var g = rootOf(t).relativeGeometry;
        var l = r.x > 0 || g.x > 0 ? p / 2 : p, tp = r.y > 0 || g.y > 0 ? p / 2 : p;
        var rt = r.x + r.width < 1 || g.x + g.width < 1 ? p / 2 : p;
        var b = r.y + r.height < 1 || g.y + g.height < 1 ? p / 2 : p;
        return { x: a.x + l, y: a.y + tp, width: a.width - l - rt, height: a.height - tp - b };
    }
    // A side KWin pinned to the border under an inset root: KWin puts the window P/2 short there
    // at every change of the tile, so it is put back even inside fits()'s 1 px: in the pass, and
    // when the frame changes (refitOnFrameChange), as KWin's request lands after the pass and
    // asking in the pass for the size the client has sends nothing (moveResizeInternal).
    function pinned(t) {
        var r = t.relativeGeometry, g = rootOf(t).relativeGeometry;
        return (r.x <= 0 && g.x > 0) || (r.y <= 0 && g.y > 0) ||
               (r.x + r.width >= 1 && g.x + g.width < 1) || (r.y + r.height >= 1 && g.y + g.height < 1);
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
        for (var pass = 0; pass < 4; pass++) {
            moved = [];
            if (!setSizes(root, p, r)) return;
        }
        // Which tiles were still moving on the last pass, and what KWin kept of what was asked:
        // the cause, the next time it happens (A capture 2026-10-29; not reproduced in the test KWin).
        log("WARN sizes did not settle after 4 passes: " + moved.join("; "));
    }

    function tileNames(t) {
        if (!t.tiles.length) return t.windows.map(shortCaption).join("+") || "empty";
        return (t.layoutDirection === 2 ? "V[" : "H[") + t.tiles.map(tileNames).join(" ") + "]";
    }
    function relLog(r) { return [r.x, r.y, r.width, r.height].map(function (v) { return v.toFixed(5); }).join(","); }

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
        if (p.bar) return { w: 0, h: p.rows * BAR_ROW };
        if (p.win !== undefined) {
            var i = gaps().inner, m = { w: 0, h: 0 };
            [p.win].concat(p.extra || []).forEach(function (k) {      // the tabs behind fit too
                var fm = frameMin(wins[k]);
                m.w = Math.max(m.w, fm.w + i); m.h = Math.max(m.h, fm.h + i);
            });
            return m;
        }
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
        // Half a pixel's slack: minimums that fill the space exactly (a split made just wide enough
        // for them) came to 834 against a total of 833.99999 and gave up (fuzzer, seed 9, 2026-10-30).
        if (sumMin > total + 0.5) return want;
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
        if (p.win !== undefined || p.bar) return false;
        var changed = false, h = p.dir === "h", n = h ? snapW : snapH;
        var start = h ? rect.x : rect.y, size = h ? rect.width : rect.height, pos = start;
        var want = p.kids.map(function (k) { return k.share * size * n; });
        // A bar takes its rows' px out of its group's members, whatever the shares merged into.
        p.kids.forEach(function (k, i) {
            if (!k.p.bar) return;
            var bar = k.p.rows * BAR_ROW, total = 0, j;
            for (j = i + 1; j <= i + k.p.members; j++) total += want[j];
            var scale = total > bar ? (total - bar) / total : 0;
            for (j = i + 1; j <= i + k.p.members; j++) want[j] *= scale;
            want[i] = Math.min(bar, total);
        });
        var px = fitMinimums(
            want,
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
                moved.push(tileNames(child) + " asked " + relLog(r) + " kept " + relLog(child.relativeGeometry));
            }
            if (setSizes(child, k.p, r)) changed = true;
        }
        return changed;
    }

    // Build p's shape under `tile`, which has no children. Returns nothing; windows come after.
    function build(tile, p) {
        if (p.win !== undefined || p.bar) return;
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
        if (p.bar) {                                   // a group's bar: an empty tile
            tile.windows.slice().forEach(function (o) { unmanageFrom(tile, o); });
            barTiles.push(tile);
            groupBars.push({ con: p.bar, tile: tile });
            return;
        }
        if (p.win !== undefined) {
            var w = wins[p.win], behind = (p.extra || []).map(function (k) { return wins[k]; });
            tile.windows.slice().forEach(function (o) { if (o !== w && behind.indexOf(o) < 0) unmanageFrom(tile, o); });
            if (behind.length) {
                multiTiles.push(tile);
                // Listed out of the tabs' order (a tab moved, one joined): listed again in order.
                var want = (p.order || [p.win].concat(p.extra)).map(function (k) { return wins[k]; });
                var listed = tile.windows.filter(function (o) { return want.indexOf(o) >= 0; });
                if (listed.length === want.length && listed.some(function (o, i) { return o !== want[i]; }))
                    listed.forEach(function (o) { unmanageFrom(tile, o); });
                // Listed in the tabs' order, the shown one too; which one shows is the stacking's
                // (raiseShownTabs), not the list's.
                want.forEach(function (b) {
                    if (shown && b.tile !== tile && tile.windows.indexOf(b) >= 0) unmanageFrom(tile, b);
                    if (tile.windows.indexOf(b) < 0) manageInto(tile, b);
                    else { expected[id(b)] = tile; tiledBorder(b); }
                });
                shownTabs.push({ w: w, behind: behind });
            }
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
        if (!fits(w, t) || (pinned(t) && !exactly(w.frameGeometry, windowRect(t)))) w.frameGeometry = windowRect(t);
    }
    function exactly(g, a) {
        return Math.abs(g.x - a.x) < 0.5 && Math.abs(g.y - a.y) < 0.5 &&
               Math.abs(g.width - a.width) < 0.5 && Math.abs(g.height - a.height) < 0.5;
    }
    // A fullscreen window KWin keeps in its tile (none rebuilt since) is resized to the tile by
    // KWin whenever the tile's padding or geometry is written (Tile::setPadding and
    // setRelativeGeometry moveResize every window in it, fullscreen or not): a reload's first
    // pass, a gap or frame-width change. Put back on its monitor (A capture 2026-10-27 03:45).
    function fitFullscreen(w) {
        if (!w.output) return;
        var g = w.frameGeometry, a = workspace.clientArea(KWin.FullScreenArea, w);
        if (g.x !== a.x || g.y !== a.y || g.width !== a.width || g.height !== a.height) {
            log("REFIT " + shortCaption(w) + ": fullscreen, back on its monitor");
            w.frameGeometry = a;
        }
    }
    // The pass's look reads the frame from before the resize: KWin changes it only when the client
    // answers (XdgSurfaceWindow::moveResizeInternal schedules a configure), so Firefox, resized by
    // a reload's two paddings, reached its tile's size after the pass and kept it (A capture
    // 2026-10-28 20:06). So the frame's change is looked at too, as i3 renders a fullscreen con at
    // its output's rect on every pass (render.c:132). A moment later: KWin applies a commit's frame
    // before its fullscreen state (handleNextWindowGeometry, then handleStatesAcknowledged), so a
    // window leaving fullscreen still reads fullScreen when its frame shrinks. Once per frame, as
    // lastFit: a client that answers the monitor with another size is not asked without end.
    var fsFit = {};
    function refitFullscreenLater(w) {
        var key = id(w), t = expected[key], f = w.frameGeometry;
        if (!t || w.tile !== t || !w.output || fsFit[key] === rectKey(f)) return;
        later(0, function () {
            if (!wins[key] || !w.fullScreen || w.tile !== expected[key] || w.move || w.resize) return;
            fsFit[key] = rectKey(w.frameGeometry);
            fitFullscreen(w);
        });
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
    var reconciling = false, armed = {}, lastFit = {}, pinFit = {};
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
        if (w.fullScreen && !dragging) refitFullscreenLater(w);
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
        // A pinned tile's window put P/2 short by KWin's request landing after the pass (pinned()).
        // Once per frame and rect, as lastFit: a client that keeps the short size isn't asked forever.
        if (t && w.tile === t && !reconciling && !dragging && !w.fullScreen && !w.move && !w.resize && pinned(t)) {
            var pf = w.frameGeometry, pr = windowRect(t), seenPin = rectKey(pf) + "|" + rectKey(pr);
            if (!exactly(pf, pr) && pinFit[key] !== seenPin) {
                pinFit[key] = seenPin;
                log("REFIT " + shortCaption(w) + ": a side KWin pinned to the border");
                w.frameGeometry = pr;
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
    // A tiled window that resizes itself (Firefox's session restore: a capture 2026-10-25)
    // is asked back into its tile, as i3 refuses a tiled window's own resize (handlers.c
    // handle_configure_request). It had reached its tile and left it:
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

    // i3 raises a group's focused child over the others (render.c:196). Activating a tab raises
    // it, but the shown tab of a group without the focus can come up by the tree alone (the one
    // shown before closed): raised, so the tree's shown tab is the one on top.
    function raiseShownTabs() {
        if (!shownTabs.length) return;
        var order = workspace.stackingOrder;
        shownTabs.forEach(function (t) {
            var at = order.indexOf(t.w);
            if (at < 0) return;
            if (t.behind.some(function (b) { return order.indexOf(b) > at; })) workspace.raiseWindow(t.w);
        });
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
        passWs = ws;
        delete gapCache[ws.num];            // the settings or the tree may have changed
        floatWhatCannotFit(ws, area);
        var p = project(ws);
        gapCache[ws.num] = computeGaps(ws, p);   // a float above may have left one window
        refused = false;
        barTiles = []; multiTiles = []; shownTabs = []; groupBars = [];
        // Gaps: the root's inset changes only on a rebuild. KWin moves a root's children with
        // it but forces an edge that changes with no tile beyond it back to the screen's border
        // (CustomTile::setRelativeGeometry), while children split from an inset root inherit
        // its edges (probed). Then padding, then minimums (review).
        var inset = rootRect(area, ws), reinset = !sameRect(root.relativeGeometry, inset) || !edgesIntact(root);
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
            raiseShownTabs();
            settleDragArms(ws);
        }
        barsOf[ws.num] = groupBars;
        log("TREE " + ws.num + " " + named(model.describe(ws.num)));
        if (refused) schedule(ws);          // the projection changed under us: one more pass
        else checkInvariants(ws, root, p, area);
        passWs = null;
    }


    function clearRoot(root) {
        for (var n = 0; root.tiles.length; n++) {
            if (n > 256) throw new Error("clearRoot: tiles would not go away");
            root.tiles[root.tiles.length - 1].remove();
        }
    }

    // A floated window takes the geometry it opened with, as i3's con->geometry (manage.c,
    // floating_enable): recorded once, when kwin-i3 first sees the
    // window untiled, with the output it was on. With no record (tiled already at a load),
    // fullscreen or hidden: KWin's restore.
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
        var e = gaps(ws).inset, W = area.width - e.left - e.right, H = area.height - e.top - e.bottom;    // the root's room
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
    // DP-6 with desktop 3, KWin waiting on it, sendToOutput a no-op from then on; a capture,
    // 2026-10-26 04:32). window id -> the desktop it gets on arrival.
    var crossing = {};
    function relocate(ws, screen) {
        var desk = deskOf(ws.num);
        model.leaves(ws).concat(ws.floating).forEach(function (c) {
            var w = wins[c.win];
            if (!w) return;
            if (inDrag(w)) return;
            var key = id(w);
            // A sticky window stays on all desktops: KWin draws it on whatever its
            // output shows, which is where the model has it (pushSticky); only its output is set.
            if (c.sticky) {
                if (w.output === screen || !w.onAllDesktops) return;
                placing[key] = true;
                relocating++;
                try { workspace.sendClientToScreen(w, screen); } finally { delete placing[key]; relocating--; }
                return;
            }
            if (w.output === screen && w.desktops.length === 1 && w.desktops[0] === desk) return;
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
        var problems = [], inner = gaps(ws).inner;
        if (!sameRect(root.relativeGeometry, rootRect(area, ws))) problems.push("root not inset for the gaps");
        (function walk(t) {
            if (t.padding !== inner) problems.push("padding " + t.padding + ", gaps " + inner);
            if (!t.tiles.length && t.windows.length > 1 && multiTiles.indexOf(t) < 0) problems.push("tile holds " + t.windows.length + " windows");
            if (!t.tiles.length && t.windows.length === 0 && p && barTiles.indexOf(t) < 0) problems.push("empty leaf tile");
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
        var area = areaOf(outputOf(ws), ws), e = gaps(ws).inset;
        var lo = { x: area.x + e.left, y: area.y + e.top }, hi = { x: area.x + area.width - e.right, y: area.y + area.height - e.bottom };
        function extent(c) {
            if (c.win !== null && c.type !== "ws") {
                var w = wins[c.win];
                if (!w || !visibleLeaf(c)) return null;   // a fullscreen window out of the tiles has no extent
                var g = w.tile ? w.tile.absoluteGeometry : w.frameGeometry;   // tiles: no size-step slack
                return { x: Math.max(g.x, lo.x), y: Math.max(g.y, lo.y),
                         x2: Math.min(g.x + g.width, hi.x), y2: Math.min(g.y + g.height, hi.y) };
            }
            var e = null;
            if (c.layout === "tabbed" || c.layout === "stacked") {
                // A group's extent is its shown child's plus the bar above it; the children
                // behind share the shown one's tile, so their own shares are left alone.
                var shown = null, n = 0;
                c.nodes.forEach(function (k) { k._extent = null; if (project(k)) n++; });
                for (var i = 0; i < c.focus.length && !shown; i++) if (project(c.focus[i])) shown = c.focus[i];
                if (!shown) return null;
                e = extent(shown);
                shown._extent = e;
                if (e && n > 1) e = { x: e.x, y: Math.max(lo.y, e.y - (c.layout === "stacked" ? n : 1) * BAR_ROW), x2: e.x2, y2: e.y2 };
                return e;
            }
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
    //.
    function setFloatingLook(w, on) {
        var key = id(w);
        if (on) { var con = model.byWin[key]; lookFloating(w, con ? Tree.wsOf(con) : null); return; }
        if (keptAbove[key]) { w.keepAbove = false; delete keptAbove[key]; }
        tellFloating(w, false);
        tellDragFloating(key, false);
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
        tellDragFloating(key, true);
    }
    function tellFloating(w, on) {
        var key = id(w);
        if (!frameOn || !marks || told[key] === on) return;
        told[key] = on;
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetFloating", key, on);
    }

    // ---- the ring's colour class, indicator and hidden sides (§7 L3, L4, L6) ------
    // i3's x.c x_draw_decoration: `focused` for the focused window, `unfocused` otherwise. i3's
    // `focused_inactive` (a parent's last focus: the other output's focused window) is left out,
    // as unfocused: a third colour confused more than it told. The indicator: the
    // side where the next window opens, on a tiling window alone in its parent (x.c:585-599), the
    // workspace counting as a parent. Hidden sides: i3's hide_edge_borders (con.c
    // con_border_style_rect_without_title): smart, and smart_no_gaps with no outer gap, take a lone
    // window's whole ring (computeGaps leaves no room for it either); vertical, horizontal, both
    // hide a side where the window's tile is at the root's edge and the inner gap is 0 (i3's
    // con_adjacent_borders on the rendered rects: an outer gap moves the workspace's rect, an inner
    // gap moves the window off it; the ring's strip stays). Worked out for the
    // windows on the shown workspaces at the end of every pass, sent only when changed (the look
    // costs nothing per frame). Until told, and after a release, the effect colours by
    // KWin's active window (an empty class forgets a window).
    var ringTold = {};
    // A split key's window (the indicator only after Split H, Split V, Toggle
    // Split, until the focus leaves it or the split happens; ≠ i3, always on): shown once its side
    // is told, at the pass's end.
    var indicatorFor = null;
    // The tree's focused window, told to the effect whatever the frame (the banner is drawn on
    // it; plan.md, "Focus"). focusTold is cleared when an effect answers without it (reloaded).
    var focusTold = null;
    function tellFocused() {
        if (!effectSeen) return;
        var c = model.focused;
        if (c && c.type === "con" && c.win === null) c = model.descendFocused(c);     // focus parent
        var key = c && c.win !== undefined && c.win !== null && wins[c.win] ? String(c.win) : "";
        if (focusTold === key) return;
        focusTold = key;
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetFocused", key);
    }
    function tellRings() {
        var flash = indicatorFor;
        indicatorFor = null;
        tellFocused();
        if (!frameOn || !marks) return;
        var hide = Settings.get("hideEdgeBorders");
        // i3 draws every window in the focused container as focused (x.c: con_inside_focused).
        function cls(c) {
            for (var p = c; p; p = p.parent) if (p === model.focused) return "focused";
            return "unfocused";
        }
        function send(key, c, ind, hidden) {
            var v = c + "|" + ind + "|" + hidden;
            if (ringTold[key] === v) return;
            ringTold[key] = v;
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetRing", key, c, ind, hidden);
        }
        workspace.screens.forEach(function (s) {
            var ws = model.workspaces[deskNum(workspace.currentDesktopForScreen(s))];
            if (!ws || outputOf(ws).name !== s.name) return;
            var g = gaps(ws), root = workspace.rootTile(s, deskOf(ws.num));
            model.leaves(ws).forEach(function (c) {
                var w = wins[c.win];
                if (!w) return;
                var pl = c.parent.layout, ind = c.parent.nodes.length === 1 && (pl === "h" || pl === "v") ? (pl === "h" ? "right" : "bottom") : "", sides = [];
                if (!g.ring) sides = ["top", "right", "bottom", "left"];
                else if ((hide === "vertical" || hide === "horizontal" || hide === "both") && w.tile && root && g.gap === 0) {
                    var r = w.tile.relativeGeometry, rr = root.relativeGeometry;
                    var eq = function (a, b) { return Math.abs(a - b) < 1e-7; };
                    if (hide !== "horizontal") { if (eq(r.x, rr.x)) sides.push("left"); if (eq(r.x + r.width, rr.x + rr.width)) sides.push("right"); }
                    if (hide !== "vertical") { if (eq(r.y, rr.y)) sides.push("top"); if (eq(r.y + r.height, rr.y + rr.height)) sides.push("bottom"); }
                }
                send(c.win, cls(c), ind, sides.join(" "));
            });
            ws.floating.forEach(function (c) { if (wins[c.win]) send(c.win, cls(c), "", ""); });
        });
        if (flash && flash.win !== null && wins[flash.win])
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "ShowIndicator", flash.win);
    }
    // The bars of the shown workspaces' groups, for the effect to draw (SetBar): painted with the
    // window the group shows (its focused one), at the bar tile's place. A tab's title is its
    // window's caption; a container's, i3's tree representation (con_get_tree_representation:
    // "H[a b]"). The group's shown tab in the focused colour when the focus is in the group,
    // as i3's `focused` against `focused_inactive`. Told only when something changed.
    var LETTERS = { h: "H", v: "V", tabbed: "T", stacked: "S" };
    function barTitle(c) {
        if (c.win !== null) return wins[c.win] ? String(wins[c.win].caption) : "";
        return LETTERS[c.layout] + "[" + c.nodes.map(barTitle).join(" ") + "]";
    }
    function tellBars() {
        if (!effectSeen) return;
        var want = {}, helper = [];
        barGroups = {};
        shownWorkspaces().forEach(function (v) {
            (barsOf[v.ws.num] || []).forEach(function (b) {
                var con = b.con;
                if (Tree.wsOf(con) !== v.ws) return;                // gone since its pass
                var kids = con.nodes.filter(function (k) { return project(k); }), shown = null;
                for (var i = 0; i < con.focus.length && !shown; i++) if (kids.indexOf(con.focus[i]) >= 0) shown = con.focus[i];
                if (kids.length < 2 || !shown) return;
                var leaf = shownWindow(shown), w = leaf.win !== null ? wins[leaf.win] : null;
                var t = w && expected[leaf.win];
                if (!t || t.windows.indexOf(w) < 0) return;
                var a = windowRect(t), r = windowRect(b.tile), inside = false;
                for (var p = model.focused; p; p = p.parent) if (p === con) inside = true;
                barGroups[id(w)] = con;
                helper.push([id(w), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
                             con.layout === "stacked" ? 1 : 0, kids.length].join(" "));
                want[id(w)] = [Math.round(r.x - a.x), Math.round(r.y - a.y), Math.round(r.width), Math.round(r.height),
                               con.layout === "stacked", kids.indexOf(shown), inside ? "focused" : "unfocused",
                               kids.map(barTitle).join("\u001f")];
            });
        });
        Object.keys(barTold).forEach(function (key) {
            if (want[key]) return;
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetBar", key, 0, 0, 0, 0, false, 0, "", "");
            delete barTold[key];
        });
        Object.keys(want).forEach(function (key) {
            var b = want[key], spec = JSON.stringify(b);
            if (barTold[key] === spec) return;
            barTold[key] = spec;
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetBar", key, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]);
        });
        tellBarsToHelper(helper.join("\n"));
    }
    // The helper takes presses and scrolls on the bars (plugin/tilingdrag.h SetBars); without the
    // effect the bars aren't drawn, and aren't told.
    function tellBarsToHelper(spec) {
        if (barsHelperTold === spec) return;
        barsHelperTold = spec;
        callDBus(DRAG[0], DRAG[1], DRAG[2], "SetBars", spec);
    }

    // A press or a scroll on a group's bar (the helper's hidden "Tab Click" action, then TabEvent).
    // i3's route_click (click.c): a scroll goes to the next or previous tab, its focused window; a
    // press on a tab focuses that tab's focused window, but when the focus is in that tab already
    // (and isn't the tab itself) the tab itself, and a press on the tab focused that way the
    // window again: so a group of windows can be selected by a second click.
    function tabEvent() {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "TabEvent", guard("tab event", function (s) {
            var f = String(s).split(" "), con = barGroups[f[1]];
            if (!con || f.length !== 3 || Tree.wsOf(con) === null) return;
            var kids = con.nodes.filter(function (k) { return project(k); });
            var current = null;
            for (var i = 0; i < con.focus.length && !current; i++) if (kids.indexOf(con.focus[i]) >= 0) current = con.focus[i];
            var to;
            if (f[0] === "scroll") {
                var at = kids.indexOf(current) + Number(f[2]);
                to = model.descendFocused(kids[at] || current);
            } else {
                var tab = kids[Number(f[2])];
                if (!tab) return;
                var focused = model.focused, inside = false;
                for (var p = focused ? focused.parent : null; p; p = p.parent) if (p === tab) inside = true;
                // i3 descends through focus_head to the end, past the focus itself (click.c:268).
                var leaf = shownWindow(tab);
                to = focused === tab || !inside ? leaf : tab;
                // A drag from this press drags the tab's window, not the one shown before it.
                tabDrag = leaf.win !== null ? { key: f[1], leaf: leaf } : null;
            }
            if (!to) return;
            model.activate(to);
            schedule(Tree.wsOf(to));
            wantFocus(true);
            log("TAB " + f[0] + " " + f[2] + ": " + conCaption(to));
        }));
    }

    function forgetRings() {
        Object.keys(ringTold).forEach(function (key) {
            callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetRing", key, "", "", "");
        });
        ringTold = {};
        if (effectSeen) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "ClearBars");
        barTold = {};
        if (effectSeen) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetFocused", "");
        focusTold = null;
    }

    // How tiled windows look, with the effect there: without their
    // border in "frame" and "bare", and the ring and its room in the tiles in "frame" only.
    // Without the effect, title bars whatever tiledLook says.
    function tiledBorderless() { return frameOn && Settings.get("tiledLook") !== "titlebars"; }
    function tiledRing() { return frameOn && Settings.get("tiledLook") === "frame"; }
    function tiledBorder(w) {
        if (tiledBorderless() || (frameOn && inBarGroup(w))) takeBorder(w);
        else giveBorder(w);
    }
    // In a tabbed or stacked group that shows its bar (more than one child placed): i3's tab is
    // then the window's only decoration (x.c draws the child's title in the tab), so in the
    // titlebars look too the window's own title bar goes while it is in the group.
    function inBarGroup(w) {
        var c = model.byWin[id(w)];
        if (!c || c.type !== "con") return false;
        for (var p = c.parent; p && p.type !== "ws"; p = p.parent) {
            if ((p.layout === "tabbed" || p.layout === "stacked") &&
                p.nodes.filter(function (k) { return project(k); }).length > 1) return true;
        }
        var ws = Tree.wsOf(c);
        return !!ws && (ws.layout === "tabbed" || ws.layout === "stacked") &&
               ws.nodes.filter(function (k) { return project(k); }).length > 1;
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
            // A title bar just given back (floated, then tiled again before the app answered) isn't
            // there yet either: noted, and the pass that takes it comes when it lands (OPEN.md 55,
            // probe 98: a 0.5 s client kept its title bar for good).
            if (!serverDecorated(w)) { borderDue[key] = true; return; }
            // The bounds KWin sent with the border (refitOnFrameChange): the placement area less
            // the border, as sendRoleConfigure has it.
            var f = w.frameGeometry, c = w.clientGeometry, area = workspace.clientArea(KWin.PlacementArea, w);
            var bounds = { width: area.width - (f.width - c.width), height: area.height - (f.height - c.height), first: true };
            w.noBorder = true;
            delete borderDue[key];
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
        delete borderDue[key];
        if (!tookBorder[key]) return;
        delete tookBorder[key];
        if (!w.deleted && w.noBorder) w.noBorder = false;
    }

    // The focused workspace, or null (no focus yet).
    function focusedWs() {
        var f = model.focused;
        return f ? (f.type === "ws" ? f : Tree.wsOf(f)) : null;
    }
    // The workspace a window that just appeared gets (the rules in
    // Placement.target): a modal dialog goes with its parent (C3), one that asked for
    // a hidden desktop keeps it (C4), any other opens on the focused workspace (C1), wherever
    // KWin's active output put it. The switch KWin made to activate it is undone (C2), unless it
    // asked. A modal dialog is given its parent's desktop directly, never relocate's move via all
    // desktops, which would take the parent along (probe 90: KWin ties the two in setDesktops).
    // -> { ws, why } or null (not on one desktop, as wsForWindow).
    function placeNew(w) {
        if (!w.output || (w.desktops.length !== 1 && !w.onAllDesktops)) return null;
        // On all desktops (sticky): as a window on the desktop its output shows;
        // the push then keeps it on whatever that output shows.
        var desk = w.onAllDesktops ? deskNum(workspace.currentDesktopForScreen(w.output)) : deskNum(w.desktops[0]);
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
        }
        // An output assignment on top, as i3's con_move_to_output_name after the workspace one:
        // that output's visible workspace, if the output is here.
        var assignedOut = assigned && assigned.output ? outputNamed(assigned.output, fws ? outputOf(fws) : workspace.activeScreen) : null;
        if (assignedOut) {
            var shown = deskNum(workspace.currentDesktopForScreen(assignedOut));
            if (shown >= 1) t = { ws: shown, why: "assign" };
        }
        if (!t) t = Placement.target({ desk: desk, modal: !!w.modal, parentWs: parent ? Tree.wsOf(parent).num : null },
                                     Placement.shownBefore(outputs, pendingShown), fws ? fws.num : null);
        // On, or asking for, a virtual desktop past 10: not kwin-i3's (decision 9), so the focused
        // workspace, as any new window (C1).
        if (t.ws > NAMES.length) {
            if (!fws) return null;
            t = { ws: fws.num, why: "focused" };
        }
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
    // SwitchToOtherDesktop). Another app's dialog opens behind too (§5 C5).
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
    // i3's popup_during_fullscreen (manage.c:424-528; §10 V6): `smart`, the
    // fullscreen window's own transient (its transientFor chain reaches it) takes the focus;
    // `ignore`, nothing does; `leave_fullscreen`, a transient of any window ends the fullscreen
    // instead (con_disable_fullscreen) and opens without the focus; `all`, a floating newcomer
    // (`kind`: i3's want_floating) takes it.
    function keepsFullscreenFocus(w, ws, fresh, kind) {
        // A newcomer that opens fullscreen itself (mpv --fs, a game) takes the workspace's
        // fullscreen over, as in i3 (manage.c: con_toggle_fullscreen, fs = NULL): no hand-back.
        if (!fresh || !activatedNow(w) || w.fullScreen) return null;
        var fs = model.fullscreenOn(ws);
        if (!fs || fs.win === id(w) || !wins[fs.win]) return null;
        var how = Settings.get("popupDuringFullscreen");
        if (how === "smart" && transientOf(w, wins[fs.win])) return null;
        if (how === "all" && kind !== "tiling") return null;
        if (how === "leave_fullscreen" && w.transient) {
            log("FULLSCREEN " + wins[fs.win].caption + ": ends for " + w.caption + " (leave_fullscreen)");
            wins[fs.win].fullScreen = false;    // fullScreenChanged then clears the tree's flag
        }
        if (workspace.currentDesktopForScreen(outputOf(ws)) !== deskOf(ws.num)) return null;
        return wins[fs.win];
    }

    // fullscreen_blocks_floating_render, for an existing floating window w: its workspace has
    // another window fullscreen, and popupDuringFullscreen doesn't let it over (`all` lets every
    // floating window over, `smart` the fullscreen window's own transients).
    function fullscreenBlocks(w) {
        var con = model.byWin[id(w)];
        if (!con || con.type !== "floating" || w.fullScreen) return false;
        var fs = model.fullscreenOn(Tree.wsOf(con));
        if (!fs || fs === con || !wins[fs.win]) return false;
        // The fullscreen window's own modal dialog: KWin activates it in its place whatever is
        // asked (activation.cpp findModal, §5 C5), so handing back would only loop.
        if (w.modal && transientOf(w, wins[fs.win])) return false;
        var how = Settings.get("popupDuringFullscreen");
        if (how === "all") return false;
        if (how === "smart" && transientOf(w, wins[fs.win])) return false;
        return true;
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
        // the window is placed.
        var fws = focusedWs(), placed = fresh ? placeNew(w) : null;
        var ws = placed ? placed.ws : fresh ? null : wsForWindow(w);
        if (!ws) { connectWindow(w); return; }
        if (!ruleRan[key]) ruleRan[key] = {};
        var kind = Rules.classify(w, { ws: ws.num, current: null, ran: ruleRan[key], crossing: !!crossing[key] });
        // A window on all desktops that a rule tiles (`floating disable`, as i3's for_window over
        // its sticky float): off all desktops onto its workspace first, KWin's tiles being one
        // desktop's (§3 R3, X4).
        if (kind === "tiling" && w.onAllDesktops && !crossing[key] && deskOf(ws.num)) {
            placing[key] = true;
            relocating++;
            try { w.desktops = [deskOf(ws.num)]; } finally { delete placing[key]; relocating--; }
            log("STICKY " + shortCaption(w) + " tiled by a rule: on workspace " + ws.num);
        }
        // Not just appeared (a load, a window taken back after a desktop change), in no tile and
        // kept above: a window kwin-i3 had floating, the flag being the one durable mark of it,
        // so it stays floating whatever the rules say.
        if (kind === "tiling" && !fresh && !w.tile && (w.keepAbove || atLoadFloating[key])) kind = "floating";
        // No border and not to be framed: a session restore of one kwin-i3 took, or a reload
        // after the effect went (review R1-4). Given back; a rule forcing it wins anyway.
        if (w.noBorder && !(tiledBorderless() && kind === "tiling")) w.noBorder = false;
        wins[key] = w;
        if (!w.fullScreen && w.maximizeMode !== 0) w.setMaximize(false, false);
        recordUntiled(w);
        var fs = keepsFullscreenFocus(w, ws, fresh, kind);
        if (kind === "floating" || kind === "sticky") {
            model.setSticky(model.openFloating(key, ws), kind === "sticky");
            setFloatingLook(w, true);
            if (fresh) clampFloating(w);
        } else model.open(key, ws);          // under a fullscreen window: second in the focus stack
        if (w.fullScreen) model.setFullscreen(key, true);
        if (w.minimized) model.setMinimized(key, true);
        connectWindow(w);
        // i3's manage.c:437: a newcomer takes the focus only on the focused output's visible
        // workspace (§5 C1, C3); one that asked for its desktop takes it there (C4). Otherwise
        // the focus goes back to what had it (KWin activated the window already). A newcomer
        // whose modal dialog KWin activated in its place (activatedNow) takes its place in the
        // focus order right behind the dialog, as i3 focuses a window at its opening before its
        // dialog: without it, a close beside them went to an older window (step A).
        var visibleHere = workspace.currentDesktopForScreen(outputOf(ws)) === deskOf(ws.num);
        var takes = !placed || placed.why === "asked" ||
            Placement.takesFocus(visibleHere, !fws || outputOf(ws) === outputOf(fws), !!fws);
        // popup_during_fullscreen all: a floating newcomer under its workspace's fullscreen window
        // takes the focus wherever that workspace is visible, any output (manage.c:520); i3's
        // invisible-workspace rule still holds (manage.c:609). Review 2026-10-28.
        var fsHere = model.fullscreenOn(ws);
        if (!takes && visibleHere && kind !== "tiling" && fsHere && fsHere.win !== key &&
            Settings.get("popupDuringFullscreen") === "all") takes = true;
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
        // A newcomer on its way to another output or desktop stays hidden until it is placed:
        // the pass that moves it waits for the effect to have it.
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
        var go = function () { if (!done) { done = true; holdNamed[key] = true; then(); } };
        holdNamed[key] = "waiting";
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "HoldNew", key, ms, guard("held", go));
        later(50, go);
    }
    function showHeld() {
        Object.keys(holdNamed).forEach(function (key) {
            // Not moved yet: a pass for something else (a focus, another workspace) ran first.
            if (holdNamed[key] === "waiting") return;
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
        delete told[key]; delete ringTold[key]; delete dragTold[key];
        delete wins[key]; delete expected[key]; delete armed[key]; delete selfFitAt[key]; delete selfFitLater[key]; delete lastFit[key]; delete pinFit[key]; delete fsFit[key]; delete keptAbove[key]; delete tookBorder[key]; delete borderDue[key]; delete borderGone[key]; delete placing[key];
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
    // the pointer has crossed another window (tests/live/79-close-focus.sh).
    // Recorded for every focused window with a parent (i3's con_next_focused for all of them).
    var closingNext = {};   // window id -> con

    // Closed: drop it, and focus goes where the model says (a window made sticky or ignored is
    // still on screen and probably in use, so dropWindow alone doesn't move focus): i3's choice
    // if one was recorded and is still there, over KWin's.
    function forgetWindow(w) {
        var key = id(w), next = closingNext[key];
        delete closingNext[key]; delete ruleRan[key]; delete connected[key]; delete closeWatched[key];
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
    // for a browser is seconds).
    function reclassify(w) {
        var key = id(w), con = model.byWin[key];
        if (!con) { adoptWindow(w); return; }
        if (Rules.keptOut(w)) { dropWindow(w); return; }
        var floating = con.type === "floating";
        if (!ruleRan[key]) ruleRan[key] = {};
        var kind = Rules.classify(w, { ws: Tree.wsOf(con).num, current: con.sticky ? "sticky" : floating ? "floating" : "tiling", ran: ruleRan[key], crossing: !!crossing[key] });
        var wantFloating = kind !== "tiling";      // "sticky" floats too
        if (wantFloating === floating) return;
        if (!wantFloating && con.sticky) unstick(w, con);     // a rule tiles it: off all desktops first (X4)
        model.toggleFloating(con);
        setFloatingLook(w, wantFloating);
        if (wantFloating) { untile(w); floatAtRecord(w); clampFloating(w); }
        schedule(Tree.wsOf(model.byWin[key]));
    }

    function connectWindow(w) {
        var key = id(w);
        if (connected[key]) return;
        connected[key] = true;
        var dragging = false;
        // Before KWin activates its choice (closingNext, above): i3's next focus for every close
        // of the focused window, a top-level or floating one too (§5 C7).
        w.closed.connect(guard("closed", function () {
            var con = model.byWin[key];
            closingTree = w;
            if (con && model.focused === con && con.parent) closingNext[key] = model.nextFocused(con);
            // i3 4.24's drain_drag_events: a window unmapping on the focused workspace ends a drag at
            // once (DRAG_ABORT, drag.c:77-87), and it is no revert: the drop or the resize happens
            // where the pointer last was, unless the dragged window or its target is the one
            // going (tiling_drag.c:325 con_exists, resize.c:274) (§9 G7, Z7).
            if (drag && con && focusedWs() === Tree.wsOf(con)) {
                callDBus(DRAG[0], DRAG[1], DRAG[2], "Cancel");
                endDragAtClose(con, shortCaption(w));
            }
        }));
        w.readyForPaintingChanged.connect(guard("ready", function () { reclassify(w); }));
        w.captionChanged.connect(guard("caption", function () { reclassify(w); if (Object.keys(barTold).length) kick(); }));
        w.transientChanged.connect(guard("transient", function () { reclassify(w); }));
        w.hiddenByShowDesktopChanged.connect(guard("show desktop", readShowing));
        w.windowClassChanged.connect(guard("class", function () { reclassify(w); }));
        // The window menu's No Border and Keep Above (useractions.cpp, setNoBorder, setKeepAbove):
        // both flags are kwin-i3's on its windows, as i3 owns the border and ignores a request
        // to keep a window above (handlers.c:683-707 acts on fullscreen, attention, sticky
        // only), so a pass puts them back at once. noBorder notifies as decorationPolicyChanged.
        // A pass's own writes are skipped.
        function reassert() {
            var con = model.byWin[key];
            if (con && !reconciling) schedule(Tree.wsOf(con));
        }
        w.decorationPolicyChanged.connect(guard("noborder", reassert));
        w.keepAboveChanged.connect(guard("above", reassert));
        w.minimizedChanged.connect(guard("minimized", function () {
            var focusedBefore = model.focused;
            var con = model.setMinimized(key, w.minimized);     // i3's scratchpad rule (§5 C9)
            // The focused window minimized and KWin's own pick not a window of the tree (none, the
            // desktop, a gap strip under the pointer): the focus goes to i3's next here, else the
            // pass would activate the minimized window and KWin un-minimize it (review
            // 2026-10-28). With a tree window picked, windowActivated has done this already.
            if (con && w.minimized && focusedBefore === con) {
                var next = model.nextFocused(con);
                log("MINIMIZED " + conCaption(con) + ": i3's next " + conCaption(next));
                model.activate(next);
                wantFocus();
            }
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
            if (!con) { if (w.desktops.length === 1 || w.onAllDesktops) adoptWindow(w); return; }
            if (w.onAllDesktops) {
                // Put on all desktops (the window menu, a client, a rule; §3 X4, §10 V10):
                // i3's sticky floating: floated if tiling, marked, pushed to what its
                // output shows.
                if (!con.sticky) makeSticky(w, con);
                return;
            }
            if (w.desktops.length !== 1) {
                // On two desktops, not all (§3 R13): not ours until it is on one again.
                dropWindow(w);
                return;
            }
            if (con.sticky) {
                // Taken off all desktops onto one (X4): no longer sticky; it stays floating on
                // that desktop's workspace (i3's _NET_WM_DESKTOP index: moved there, below).
                model.setSticky(con, false);
                log("STICKY " + shortCaption(w) + " off: on workspace " + deskNum(w.desktops[0]));
            }
            if (placing[key] || dragging) return;   // ours, or settled when the drag ends
            // Moved to a virtual desktop past 10 (the Overview): not a workspace (decision 9), so it
            // leaves the tree, as one on two desktops does (R13).
            if (deskNum(w.desktops[0]) > NAMES.length) { dropWindow(w); return; }
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
        // pass: the model, not KWin's move, says where it belongs (plan.md decision 10;
        // 40-monitors). Not during a drag (its end settles the workspace), nor kwin-i3's own
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
        // A border kwin-i3 took, given back by the window menu, or one due (borderDue): on Wayland
        // the title bar comes with the client's answer to the configure (configureDecoration),
        // after the pass that wanted it read frame = client and skipped it (takeBorder). The
        // frame keeps its tile's size and the client shrinks by the title bar (probe 96, 2026-10-30).
        w.clientGeometryChanged.connect(guard("client", function () {
            if ((tookBorder[key] || borderDue[key]) && !w.noBorder && !reconciling && model.byWin[key] && serverDecorated(w)) schedule(Tree.wsOf(model.byWin[key]));
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
    // already (i3's x_push_changes with mouse_warping output):
    // only for a pass a key or an outside switch asked for (byKey), as i3 warps from workspace_show
    // and the focus commands, never from a close (the start menu closing sent the pointer across;
    // 72-pointer-stays). checked: this pass has KWin's answer that Show Desktop
    // is off (below).
    var focusedOutput = null;   // the output the focus was last applied or taken on, by name (not focusOutput, the action below)
    function pointerOn() { var p = workspace.cursorPos; return screenAt(p.x, p.y); }
    function warps() { return Settings.get("mouseWarping") !== "none"; }
    function applyFocus(byKey, checked) {
        var f = model.focused;
        if (!f) return;
        // A passive pass (no key action: a window closed, a reload, a monitor change) leaves an
        // open window kwin-i3 doesn't manage with the focus: a panel popup, a dialog, KRunner.
        // Taking it closed the tray's popups when their tooltip went. When
        // that window closes, its own pass brings kwin-i3's focus back. The desktop and the
        // panel hold the focus only when nothing else does, so they don't count.
        var a = workspace.activeWindow;
        if (!byKey && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock) return;
        // Except with Show Desktop on: then the desktop holds the focus on purpose (Plasma's edit
        // mode turns it on as the panel's menu closes, and the menu closing is this pass), and
        // activating a tile it hid turns it off (kwin activation.cpp activateWindow), which ended
        // the edit mode before its window showed. Scripts can't read
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
        // A container focused (focus parent): KWin's focus goes to the window it would descend
        // to, as i3's X focus follows con_descend_focused.
        if (f.type === "con" && f.win === null) {
            var d = model.descendFocused(f);
            if (d !== f && d.win !== null) f = d;
        }
        if (f.type === "ws" || f.win === null) {
            // KWin's Switch to Screen focuses a window there, or the desktop (activation.cpp
            // switchToOutput); an open popup is spared by the passive pass's first check above, so this
            // needs no guard of its own (a fault here alone changed nothing, 73-places-itself).
            if (workspace.activeScreen !== s) invoke("Switch to Screen " + Workspaces.ordered().indexOf(s));
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
        var w = workspace.activeWindow, f = model.focused;
        if (w && model.byWin[id(w)]) {
            // A container chosen with focus parent stays focused while KWin's active window is in it.
            for (var p = model.byWin[id(w)].parent; f && f.type === "con" && f.win === null && p; p = p.parent)
                if (p === f) return f;
            model.focusWin(id(w));
            return model.byWin[id(w)];
        }
        return model.focused;
    }

    // ---- actions (keys) --------------------------------------------------------------------

    var DIRS = { left: Tree.LEFT, right: Tree.RIGHT, up: Tree.UP, down: Tree.DOWN };
    function step() { return Settings.get("resizeStep") / 100; }

    // A floating window moves and resizes by floatingStep px, as i3's 10 px (cmd_move_direction,
    // cmd_resize_floating). The window, or null: a tiled con, whose
    // keys are the tree's, or a floating window KWin holds fullscreen or maximized, whose keys
    // do nothing (nudgeFloating and growFloating take them).
    function floatingWin(c) {
        var w = c && c.type === "floating" ? wins[c.win] : null;
        return w && !w.fullScreen && w.maximizeMode === 0 ? w : null;
    }
    function screenAt(x, y) {
        return workspace.screens.filter(function (s) { return inRect(s.geometry, x, y); })[0] || null;
    }
    function screenOverlapping(r) {         // output_containing_rect's largest overlap
        var best = null, most = 0;
        workspace.screens.forEach(function (s) {
            var g = s.geometry;
            var w = Math.min(r.x + r.width, g.x + g.width) - Math.max(r.x, g.x);
            var h = Math.min(r.y + r.height, g.y + g.height) - Math.max(r.y, g.y);
            if (w > 0 && h > 0 && w * h > most) { most = w * h; best = s; }
        });
        return best;
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
        // i3's get_output_from_rect: the output holding its centre, else the one it overlaps most.
        var s = screenAt(r.x + r.width / 2, r.y + r.height / 2) || screenOverlapping(r), ws = Tree.wsOf(c);
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
        clampFloating(w);       // i3's cmd_resize_floating: floating_check_size
        return true;
    }

    // ---- i3's tiling drag (tiling_drag.c) ---------------------
    // The helper takes the press (plugin/tilingdrag.cpp) and runs the hidden "Tiling Drag" action;
    // from there kwin-i3 polls its State() until the drop or the cancel, shows the drop on
    // kwini3hold's indicator, and drops in the tree (Tree drop). The window stays put meanwhile.

    // The helper's list of floating windows, for float to tile (§9 G13): told whether or not the
    // frame is on, and all again after each SetOn(true) (the helper reloaded asks a reconfigure).
    function tellDragFloating(key, on) {
        if (dragTold[key] === on) return;
        dragTold[key] = on;
        callDBus(DRAG[0], DRAG[1], DRAG[2], "SetFloating", key, on);
    }
    function tellDrag(on) {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "SetOn", on);
        dragTold = {};
        barsHelperTold = on ? null : "";            // the bars again with the next pass (tellBars)
        if (!on) callDBus(DRAG[0], DRAG[1], DRAG[2], "SetBars", "");
        if (on) for (var k in model.byWin) if (model.byWin[k].type === "floating" && wins[k]) tellDragFloating(k, true);
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
        return model.leaves(ws).filter(function (c) { return visibleLeaf(c) && !Tree.isHidden(c) && (!fs || fs === c); });
    }
    function hasDropTargets(floating) {     // has_drop_targets; a floating window needs only one
        var n = 0;
        shownWorkspaces().forEach(function (v) {
            var k = dropTargetsOf(v.ws).length;
            n += k ? k : v.ws.nodes.length ? 0 : 1;
        });
        return n > (floating ? 0 : 1);
    }
    function inRect(r, x, y) { return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height; }
    // con_rect_size_in_orientation: a split's px along its own orientation, for the resize floor.
    function splitSize(split) {
        var r = conRect(split);
        return split.layout === "h" ? r.width : r.height;
    }
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
    // The centre's band under the pointer (tabbed, stacked, swap), for the indicator.
    function bandRect(plan) {
        if (!plan.bands) return null;
        for (var i = 0; i < plan.bands.length; i++) if (plan.bands[i].band === plan.band) return plan.bands[i].rect;
        return null;
    }
    // The indicator, and over a window's centre its three bands' icons (plan.bands: tabbed,
    // stacked, swap), the one under the pointer highlighted.
    function indicate(rect, plan) {
        var r = rect ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] : [0, 0, 0, 0];
        var b = [0, 0, 0, 0, -1];
        if (plan && plan.bands) {
            var c = plan.rect;
            b = [Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height),
                 plan.bands.map(function (x) { return x.band; }).indexOf(plan.band)];
        }
        var key = r.join(",") + "|" + b.join(",");
        if (!drag || key === drag.rect) return;
        drag.rect = key;
        if (!frameOn) return;
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetDropIndicator", r[0], r[1], r[2], r[3]);
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetDropBands", b[0], b[1], b[2], b[3], b[4]);
    }
    function dragState(s) {
        if (!drag) return;
        drag.busy = false;
        if (drag.resize) { resizeState(s); return; }
        var f = String(s).split(" "), phase = f[0], x = Number(f[2]), y = Number(f[3]);
        if (phase === "drag" || phase === "drop") {
            var con = drag.con;
            // A tab's drag is reported by the window the helper took the press with (drag.via).
            if ((model.byWin[f[1]] !== con && f[1] !== drag.via) || model.byWin[con.win] !== con || con.type !== drag.type) { endDrag("its window is gone"); return; }
            drag.plan = model.dropPlan(con, findDropTarget(x, y), x, y, conRect, parentZone(wins[con.win]));
            if (phase === "drag") { indicate(drag.plan && (bandRect(drag.plan) || drag.plan.rect), drag.plan); return; }
            dropOn(drag.plan, " at " + x + "," + y);
            return;
        }
        endDrag(phase === "cancel" ? "cancelled" : "ended");
    }
    // The drop, by plan (the drag's last, or the release's).
    function dropOn(plan, where) {
        var con = drag.con, from = Tree.wsOf(con), to = plan && Tree.wsOf(plan.target);
        // A centre drop onto a window: its top band makes the two a tabbed group, its middle a
        // stacked one, its bottom swaps them, Shift or not (§9 G11); onto a window in a group it
        // joins the group (i3's con_move_to_target). Onto an empty workspace it is a move. A
        // floating window (float to tile, §9 G13) goes after the target in the bottom band: a
        // swap would float the target.
        var swap = !!plan && plan.type === Tree.CENTER && plan.target.type !== "ws" && drag.type === "con";
        var unfloated = drag.type === "floating" && plan ? unfloatForDrop(con) : null;
        if (unfloated) con = unfloated;
        // Unfloated, the tree changed whatever the drop does after.
        var dropped = (drag.type !== "floating" || !!unfloated) && (model.drop(con, plan, swap) || !!unfloated);
        endDrag(dropped ? "dropped " + plan.type + (plan.type !== Tree.CENTER ? " " + plan.dir : "") + (plan.band ? " " + plan.band : "") + (swap ? " (swap)" : "") +
                          where : "no drop" + where);
        if (dropped) {
            schedule(from);
            if (to && to !== from) schedule(to);
            schedule(Tree.wsOf(con));
            wantFocus();
        }
    }
    // Float to tile: tiled first, as the floating toggle does (i3's floating_disable), then the
    // tiling drop puts it in its place.
    function unfloatForDrop(con) {
        var w = wins[con.win];
        if (con.sticky && w) unstick(w, con);
        var leaf = model.floatingDisable(con);
        if (leaf && w) setFloatingLook(w, false);
        return leaf;
    }
    // A window closing on the focused workspace mid-drag (closed, above): the drag ends now and
    // does what it would at the release, from where the pointer last was.
    function endDragAtClose(closing, caption) {
        var why = " (" + caption + " closed on the focused workspace)";
        if (drag.resize) {
            var rz = drag.resize, part = rz.part;
            var now = model.resizeParticipants(drag.con, rz.dir);
            if (drag.lastPos === undefined || closing === part.first || closing === part.second || closing === drag.con ||
                !now || now.first !== part.first || now.second !== part.second) { endDrag("ended, no resize" + why); return; }
            var px = Math.round(drag.lastPos - rz.start), ws = Tree.wsOf(part.first);
            var done = px !== 0 && model.resizeNeighbouring(part.first, part.second, px, rz.size);
            endDrag((done ? "resized " + (rz.o === "h" ? "width" : "height") + " " + px + " px" : "no resize") + why);
            if (done) schedule(ws);
            return;
        }
        var plan = drag.plan;
        if (closing === drag.con || !plan || plan.target === closing || drag.con.type !== drag.type) { endDrag("ended, no drop" + why); return; }
        dropOn(plan, why);
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
        if (!drag) return;
        // An answer that never comes (the helper unloaded mid-drag: KWin's callDBus calls back only
        // on a reply) would leave the drag on for good, every later drag and the pointer's
        // crossings refused: after a second without one, it ends.
        if (drag.busy) {
            if (Date.now() - drag.busySince > 1000) endDrag("the helper stopped answering");
            return;
        }
        drag.busy = true;
        drag.busySince = Date.now();
        dragCursor(true, drag.shape);
        callDBus(DRAG[0], DRAG[1], DRAG[2], "State", guard("drag state", dragState));
    }
    // The hidden action: a drag began. Only a tiled window of kwin-i3's, or a floating one (float
    // to tile, §9 G13), and only with somewhere else to drop it (has_drop_targets); otherwise
    // the press was a click.
    function startDrag() {
        callDBus(DRAG[0], DRAG[1], DRAG[2], "State", guard("drag start", function (s) {
            var f = String(s).split(" "), con = model.byWin[f[1]];
            if (f[0] !== "drag" || drag) return;
            // A drag from a tab: the press was taken with the window shown then; the tab's own.
            var via = null;
            if (tabDrag && tabDrag.key === f[1] && model.byWin[tabDrag.leaf.win] === tabDrag.leaf) { con = tabDrag.leaf; via = f[1]; }
            tabDrag = null;
            var ours = !!con && (con.type === "con" || con.type === "floating");
            if (!ours || !wins[con.win] || !hasDropTargets(con.type === "floating")) {
                log("DRAG not started: " + (ours ? "nowhere to drop" : "not a window of kwin-i3's"));
                return;
            }
            var timer = new QTimer();
            timer.interval = 16;            // a frame, about: the helper keeps only the last position
            timer.timeout.connect(guard("drag poll", pollDrag));
            drag = { con: con, type: con.type, timer: timer, busy: false, plan: null, rect: "", shape: 0, resize: null, via: via };
            log("DRAG " + conCaption(con) + (con.type === "floating" ? " (floating: to tile)" : ""));
            dragCursor(true);
            dragState(s);
            if (drag) timer.start();
        }));
    }

    // ---- i3's mouse resize of tiled windows (click.c, resize.c) ------
    // Meta+right on a tiled window, or in the gap beside one: the helper takes the press and runs
    // the hidden "Tiling Resize" action. As in i3, nothing changes while the pointer moves: a 2 px
    // bar follows it along the boundary, and the shares change once at the release.

    // The tiles' smallest extent along o: windows' minimums (frameMin, with the inner gap) added
    // up along a split and the largest across it, as minOf does for a projection.
    function minExtent(c, o) {
        if (c.win !== null) { var fm = frameMin(wins[c.win]); return (o === "h" ? fm.w : fm.h) + gaps(Tree.wsOf(c)).inner; }
        var vals = c.nodes.filter(function (k) { return conRect(k).width > 0; }).map(function (k) { return minExtent(k, o); });
        return vals.reduce(function (a, b) { return c.layout === o ? a + b : Math.max(a, b); }, 0);
    }
    // floating_mod_on_tiled_client: the nearest of the four edges to the press, no thirds, no
    // limit, and nothing if that edge has nothing to resize against (§9 Z1); a tie does nothing.
    // The distance is absolute: a press in the gap is outside the frame.
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
        // i3's: the nearest edge, and nothing if it has nothing to resize against (§9 Z1).
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
        var a = conRect(ff), b = conRect(fs), f = conRect(part.first), sr = conRect(part.second), inner = gaps(ws).inner;
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
            drag.lastPos = pos;
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
    // was nothing, and the helper's resize is cancelled.
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

    // ---- the pointer --------------------------------------

    // i3's check_crossing_screen_boundary (handlers.c): with focus follows mouse, the pointer
    // moving onto another output over the root window or a dock focuses that output's visible
    // workspace: its fullscreen window, else its last focus, or the empty workspace, with no
    // warp (the pointer is there). Over a tiling or floating window, KWin's own focus follows
    // mouse activates it (§5 B1), a turn later (probe 91). Over an override-redirect window (a
    // popup spanning the boundary) the model's focus moves and the popup keeps the keyboard (D7).
    // Per motion this costs one rectangle test per output and one comparison; the hit test runs
    // only while the focus is on another output than the pointer's.
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
        if (was === null || drag || !focusFollowsMouse()) return;
        // i3 checks on every motion over the root or a dock, not only at a crossing
        // (handlers.c check_crossing_screen_boundary): nothing while the pointer's output holds
        // the focus, one comparison; the hit test only when it doesn't (focus moved to another
        // output by a key, mouseWarping off), as i3 does.
        var fws = focusedWs(), fout = fws ? outputOf(fws) : null;
        if (fout && fout.name === s.name) return;
        var under = windowUnder(p.x, p.y, s);
        if (under && wins[id(under)]) return;           // KWin's focus follows mouse takes it (B1)
        var ws = shownWs(s);
        if (!ws) return;
        var target = focusOf(ws);
        if (model.focused === target) return;
        model.activate(target);
        log("POINTER onto " + s.name + (under ? " over " + shortCaption(under) : "") + ": the focus follows to workspace " + ws.num);
        wantFocus();
    }
    // Show Desktop, kept for windowUnder: it hides every window kwin-i3 manages and none it keeps
    // out (breaksShowingDesktop, workspace.cpp:1743), yet `hidden` stays false (isHidden leaves it
    // out). A script reads neither the window's flag nor the mode, but hears each window's
    // hiddenByShowDesktopChanged (probe 97, 2026-10-30): each one asks KWin for the mode, and
    // only the answer to the last question counts.
    var desktopShowing = false, showingAsked = 0;
    function readShowing() {
        var n = ++showingAsked;
        callDBus("org.kde.KWin", "/KWin", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin",
                 "showingDesktop", guard("showing desktop", function (showing) {
            if (n === showingAsked) desktopShowing = !!showing;
        }));
    }
    // The topmost window under a point, on the output's visible desktop; null for the bare root.
    // A tile Show Desktop hides is no window there: the pointer is over the desktop (§5 B1).
    function windowUnder(x, y, s) {
        var order = workspace.stackingOrder, desk = workspace.currentDesktopForScreen(s);
        for (var i = order.length - 1; i >= 0; i--) {
            var w = order[i];
            if (w.deleted || w.minimized || w.hidden || w.output !== s) continue;
            if (desktopShowing && wins[id(w)]) continue;
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
        var ws = s ? shownWs(s) : null;
        if (!ws) return;
        model.activate(focusOf(ws));
        log("ACTIVE " + shortCaption(w) + " (the desktop): the focus goes to workspace " + ws.num);
        wantFocus();
    }
    // i3's start (main.c): the focus on the output under the pointer, at its workspace's focus
    // (§12 P2, §5 E1).
    function focusUnderPointer() {
        var s = pointerOn() || workspace.activeScreen, ws = shownWs(s);
        if (!ws) return;
        model.activate(focusOf(ws));
        focusedOutput = s.name;     // else a first key crossing outputs found it null: no warp
    }
    // While an override-redirect window has the keyboard (KRunner, a menu, a panel popup), no
    // key of kwin-i3's fires, as i3's bindings don't while dmenu holds it; Escape first (§5
    // A3-A5; panel popups included). The safety valve and the dump are not keys.
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
            // dialog): only keys that move the focus do, as in i3.
            var a = workspace.activeWindow;
            var keep = model.focused === focusBefore && a && !a.deleted && !wins[id(a)] && !a.desktopWindow && !a.dock;
            if (!keep) wantFocus(true);
            log("ACTION " + name);
        });
    }

    var actions = {
        "Split H": function (c) { model.split(c, "h"); indicatorFor = c; },
        "Split V": function (c) { model.split(c, "v"); indicatorFor = c; },
        "Toggle Split": function (c) { model.toggleSplit(c); indicatorFor = c; },
        // i3's layout stacking / layout tabbed: the focused window's container (con_set_layout).
        "Layout Stacking": function (c) { if (c) model.setLayout(c, "stacked"); },
        "Layout Tabbed": function (c) { if (c) model.setLayout(c, "tabbed"); },
        "Focus Parent": function () { model.focusParent(); },
        "Floating Toggle": function (c) {
            if (!c) return;
            var w = wins[c.win];
            // A sticky window made tiling (§3 X4, C of the stage's spec): off all desktops first,
            // onto its workspace's; KWin's tiles belong to one desktop (≠ i3, which keeps the flag).
            if (c.sticky && w) unstick(w, c);
            var n = model.toggleFloating(c);
            if (n && w) {
                setFloatingLook(w, n.type === "floating");
                if (n.type === "floating") { untile(w); floatAtRecord(w); clampFloating(w); }
            }
        },
        "Focus Mode Toggle": function () { model.focusModeToggle(); },
        // i3's fullscreen toggle and kill: KWin's own actions, on its active window, managed or
        // not; a stock Plasma binds neither key.
        "Fullscreen": function () { invoke("Window Fullscreen"); },
        // i3's kill on a container (focus parent) closes every window in it, on a workspace
        // every window there, floating ones too (con_close); else KWin's own, on any window.
        "Close": function () {
            var f = model.focused;
            if (f && f.win === null && (f.type === "con" || f.nodes.length || (f.floating && f.floating.length))) {
                var all = model.leaves(f).concat(f.type === "ws" ? f.floating : []);
                all.forEach(function (c) { if (wins[c.win]) wins[c.win].closeWindow(); });
                return;
            }
            invoke("Window Close");
        },
        // The helper's mode (plugin/resizemode.cpp): without it nothing happens, and the load
        // report says the mode needs the plugins (checkHelperKeys).
        "Resize Mode": function () { callDBus(MODE[0], MODE[1], MODE[2], "SetMode", mode ? "" : "resize"); },
        // i3's exit, Plasma's way to leave as endSession says (K17): its logout screen's prompts
        // (log out and shut down ask, then go ahead after 30 s; docs/kwin-notes.md, "Plasma"), or
        // PowerDevil's suspend, which asks nothing.
        "Exit": function () {
            var how = Settings.get("endSession");
            if (how === "sleep") {
                callDBus("org.kde.Solid.PowerManagement", "/org/kde/Solid/PowerManagement/Actions/SuspendSession",
                    "org.kde.Solid.PowerManagement.Actions.SuspendSession", "suspendToRam");
                return;
            }
            var prompt = { logout: "promptLogout", shutdown: "promptShutDown", ask: "promptAll" }[how];
            callDBus("org.kde.LogoutPrompt", "/LogoutPrompt", "org.kde.LogoutPrompt", prompt);
        },
        "Terminal": function () { callDBus(MODE[0], MODE[1], MODE[2], "LaunchTerminal"); },
        "Launcher": function () { callDBus("org.kde.krunner", "/App", "org.kde.krunner.App", "display"); },
        // i3's resize mode, as direct keys (a script can't have mode-only keys): resizeStep ppt,
        // or floatingStep px on a floating window.
        "Shrink Width": function (c) { if (!growFloating(c, "width", -1)) model.resize(c, "width", -step(), splitSize); },
        "Grow Width": function (c) { if (!growFloating(c, "width", 1)) model.resize(c, "width", step(), splitSize); },
        "Shrink Height": function (c) { if (!growFloating(c, "height", -1)) model.resize(c, "height", -step(), splitSize); },
        "Grow Height": function (c) { if (!growFloating(c, "height", 1)) model.resize(c, "height", step(), splitSize); },
        // i3's reload: KWin reconfigures (reparses kwinrc), and settingsChanged below takes the
        // new values. The config form saves without telling KWin.
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
        // i3's old_focus is the focus before the switch (workspace.c:464-468): read here, not after
        // KWin's own activation at the switch has reached the model.
        var old = model.focused;
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
        // (con_fullscreen_permits_focusing).
        var fs = model.fullscreenOn(ws);
        model.activate(fs || model.descendFocused(ws));
        pushSticky(outputOf(ws), old);
    }

    // i3's output_push_sticky_windows (output.c:83-120):
    // after a change of what output s shows, every sticky floating window on its other
    // workspaces moves to the shown one, in the model only (KWin draws a window on all desktops
    // wherever its output is). `old`, the focus before the switch: a sticky window that had it
    // keeps it (workspace_show calls with old_focus); null otherwise (a move, an output change).
    function pushSticky(s, old) {
        var ws = wsModel(shownOn(s)), others = [];
        Object.keys(model.workspaces).forEach(function (n) {
            var m = model.workspaces[n];
            if (m !== ws && m.floating.some(function (c) { return c.sticky; }) && outputOf(m) === s) others.push(m);
        });
        if (!others.length) return;
        var moved = model.pushSticky(ws, others, old);
        if (!moved.length) return;
        log("STICKY " + moved.map(function (c) { return wins[c.win] ? shortCaption(wins[c.win]) : "?"; }).join(", ") + " pushed to workspace " + ws.num + " on " + s.name);
        others.forEach(schedule);
        schedule(ws);
        wantFocus();
    }
    // A window put on all desktops (X4): i3's sticky floating. Floated if tiling (its tile left),
    // marked, pushed to what its output shows.
    function makeSticky(w, con) {
        if (con.type !== "floating") {
            con = model.toggleFloating(con);
            setFloatingLook(w, true);
            untile(w); floatAtRecord(w); clampFloating(w);
        }
        model.setSticky(con, true);
        log("STICKY " + shortCaption(w) + " on: floating, on every workspace of " + (w.output ? w.output.name : "its output"));
        schedule(Tree.wsOf(con));
        if (w.output) pushSticky(w.output, null);
    }
    // Off all desktops, onto its workspace's desktop, by kwin-i3 (Sticky Toggle, Floating Toggle):
    // the model's flag goes here, and desktopsChanged sees kwin-i3's own move (placing).
    function unstick(w, con) {
        var key = id(w), ws = Tree.wsOf(con);
        model.setSticky(con, false);
        placing[key] = true;
        relocating++;
        try { w.desktops = [deskOf(ws.num)]; } finally { delete placing[key]; relocating--; }
        log("STICKY " + shortCaption(w) + " off: on workspace " + ws.num);
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
        // A sticky window sent to N stays on N, hidden if N is, until the next workspace shown on
        // that output pushes it there: i3 pushes only at workspace_show, a new window, a sticky
        // change and _NET_WM_DESKTOP (output_push_sticky_windows' five callers), not at a move,
        // as in i3.
    }

    // ---- workspace commands with no default key -------------

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
    // i3's get_output_from_string (output.c) for an `assign … output X`: current, a direction from
    // the current output (wrapping), primary (the first output), nonprimary, or a name, case-insensitive
    // (randr.c get_output_by_name: the exact name only).
    function outputNamed(name, current) {
        var n = String(name).toLowerCase(), all = Workspaces.ordered();
        if (n === "current") return current;
        if (n === "left" || n === "right" || n === "up" || n === "down") return Workspaces.screenToward(current, n, true);
        if (n === "primary") return all[0] || null;
        if (n === "nonprimary") return all.length > 1 ? all[1] : null;
        for (var i = 0; i < all.length; i++) if (String(all[i].name).toLowerCase() === n) return all[i];
        return null;
    }
    // The output a direction names from `from` (i3's get_output_next_wrap, as the commands'
    // get_output_from_string), or "next" (the outputs' order, wrapping) or "primary" (the first in
    // it, Workspaces.ordered); null for none, or the same output.
    function screenBy(spec, from) {
        var all = Workspaces.ordered(), i = all.indexOf(from), t = null;
        if (spec === "next") t = all.length > 1 ? all[(i + 1) % all.length] : null;
        else if (spec === "primary") t = all[0];
        else t = Workspaces.screenToward(from, spec, true);
        return t && t !== from ? t : null;
    }
    // The screen next to the focused workspace's, in a direction (or next, primary).
    function screenFrom(spec) { return screenBy(spec, Workspaces.outputOf(focusedWsNum())); }
    // The model workspace an output shows.
    function visibleWsOn(t) { return wsModel(shownOn(t)); }
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
        var old = model.focused;    // i3's old_focus, before the switches (workspace.c)
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
            if (!back) back = unusedWorkspace(src, true);
            if (!back) { log("WSMOVE refused: no workspace left for " + src.name); return; }
        }
        Workspaces.setHome(n, t);
        if (back) showOn(deskOf(back), src);
        showOn(deskOf(n), t);
        var ws = wsModel(n), fs = model.fullscreenOn(ws);
        model.activate(fs || model.descendFocused(ws));
        // Both are i3's workspace_show, which pushes sticky windows (workspace.c:566): each
        // output's sticky windows go to what it shows now .
        if (back) pushSticky(src, old);
        pushSticky(t, old);
        // i3 shows the source's next workspace, then this one: the previous is the former.
        if (back) model.previousWs = back;
        log("WSMOVE " + n + " to " + t.name + (back ? ", " + src.name + " shows " + back : ""));
    }

    var SHIFTED = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];
    // Actions registered before and dead (2026-10-24: a Shift+symbol key fires only its symbol form).
    var RETIRED = ["kwin-i3 Move Right (;)"].concat(NAMES.map(function (k, i) { return "kwin-i3 Move to Workspace " + (i + 1); }));

    var KEYS = {
        "Split H": ["Meta+H"], "Split V": ["Meta+V"], "Toggle Split": ["Meta+E"],
        // Meta+W is Plasma's Overview on a stock install: make take-keys frees it, as any other.
        "Layout Stacking": ["Meta+S"], "Layout Tabbed": ["Meta+W"], "Focus Parent": ["Meta+A"],
        "Floating Toggle": ["Meta+Shift+Space"], "Focus Mode Toggle": ["Meta+Space"],
        "Fullscreen": ["Meta+F"], "Close": ["Meta+Shift+Q"],
        "Focus Left": ["Meta+Left", "Meta+J"], "Focus Down": ["Meta+Down", "Meta+K"],
        "Focus Up": ["Meta+Up", "Meta+L"], "Focus Right": ["Meta+Right", "Meta+;"],
        "Move Left": ["Meta+Shift+Left", "Meta+Shift+J"], "Move Down": ["Meta+Shift+Down", "Meta+Shift+K"],
        "Move Up": ["Meta+Shift+Up", "Meta+Shift+L"],
        // Shift+; arrives as ":": only Meta+: fires, Meta+Shift+; never does (probed 2026-10-24,
        // KWin 6.7.5; i3ws registered both). The same holds for Shift+digit below.
        "Move Right": ["Meta+Shift+Right", "Meta+:"],
        // i3's resize mode (§8 K4): Meta+R enters, then the helper takes J K L ; and
        // the arrows and runs these four, unbound (a user who wants them flat binds them).
        "Resize Mode": ["Meta+R"],
        "Shrink Width": [], "Grow Height": [], "Shrink Height": [], "Grow Width": [],
        "Reload Settings": ["Meta+Shift+C"],
        // i3's exit, terminal and launcher (K17, K18): Plasma's way to leave (endSession), the
        // default terminal, KRunner.
        "Exit": ["Meta+Shift+E"], "Terminal": ["Meta+Return"], "Launcher": ["Meta+D"],
    };

    var UNBOUND = {
        // i3's `sticky toggle`: KWin's "on all desktops" flag;
        // desktopsChanged does the rest (makeSticky, or off it onto its workspace's desktop).
        "Sticky Toggle": function (c) {
            var w = c && wins[c.win];
            if (!w) return;
            if (w.onAllDesktops) unstick(w, c); else w.onAllDesktops = true;
        },
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
        // No default key, as in i3: bound by the user in
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

    // ---- the load-time report ---------------------------------------

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
    //. Its part closes once, on the answer or after 3 s, so a
    // D-Bus call that never answers can't hold back the rest of the report.
    function checkLayoutKeys() {
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
                // "" is KWin's xkb default, US, where the system sets no layout (Arch's own
                // default, 2026-10-29: the long name still says English (US)).
                var names = (list || []).map(function (l) { return String(l[0]) || "us"; });
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
        var k = KeyName.of(key);
        if (KEYS.Launcher.indexOf(k) >= 0) return String(h[0]).indexOf("krunner") >= 0;
        if (KEYS.Terminal.indexOf(k) >= 0) return !!terminalService && String(h[0]) === terminalService;
        return false;
    }
    function checkTakenKeys() {
        if (!Settings.get("warnTakenKeys")) { log("TAKEN not checked (warnTakenKeys off)"); return; }
        // Closed once, on the answers or after 3 s, as the other parts: a reply that never comes
        // can't hold back the rest of the report.
        reportOpen();
        var closed = false;
        function close(title, lines) {
            if (closed) return;
            closed = true;
            reportClose(title, lines);
        }
        later(3000, function () { close("", []); });
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
                close(n + (n === 1 ? " key is" : " keys are") + " taken by other shortcuts", taken);
            }
            if (!left) { done(); return; }
            mine.forEach(function (k) {
                callDBus("org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel", "action", k,
                         guard("taken keys", function (h) {
                    function one() { if (--left === 0) done(); }
                    if (!h || !h[1] || String(h[1]).indexOf("kwin-i3 ") === 0) { one(); return; }
                    // A holder that launches what the kwin-i3 action launches:
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
    // both on workspace 2 and windows tile on the wrong one.
    // Reported, never set: a script's value would last only to the next reconfigure. At load in
    // the report; later, when it becomes a problem (a second monitor, the setting turned off),
    // once per load on its own.
    var perOutputBad = false, perOutputLater = false;
    // The resize mode (Meta+R) and the terminal (Meta+Return) are the helper's (§8 K4, K18): without
    // it, said once at load (§13).
    // The product is the script and its two plugins (plan.md, "Scope"): without either, say what
    // goes. The helper from KWin's loaded plugins, the effect from its loaded effects (each loaded
    // under a hashed name: kwini3helper-<hash>, kwini3hold-<hash>).
    function checkHelperKeys() {
        reportOpen();
        var closed = false, helper = null, effect = null;
        function close() {
            if (closed) return;
            closed = true;
            var lines = [];
            if (helper === false) lines.push("Without the helper: no tiling drag or resize with the mouse, no focus from the frame, no resize mode (Meta+R), no terminal key (Meta+Return), no keys fitted to your keyboard layout, and the Configure form's Apply needs Meta+Shift+C.");
            if (effect === false) lines.push("Without the effect: no frame (tiling windows keep their title bars), no drag highlight, no atomic layout changes.");
            if (lines.length) lines.push("make plugin-install builds and loads them.");
            reportClose("kwin-i3's plugins aren't loaded", lines);
        }
        function heard() { if (helper !== null && effect !== null) close(); }
        later(3000, close);
        callDBus("org.kde.KWin", "/Plugins", "org.freedesktop.DBus.Properties", "Get", "org.kde.KWin.Plugins", "LoadedPlugins",
                 guard("helper keys", function (loaded) {
            helper = String(loaded).indexOf("kwini3helper") >= 0;
            if (!helper) log("HELPER not loaded: the mouse, frame focus, the resize mode and the terminal key do nothing");
            heard();
        }));
        callDBus("org.kde.KWin", "/Effects", "org.freedesktop.DBus.Properties", "Get", "org.kde.kwin.Effects", "loadedEffects",
                 guard("effect loaded", function (loaded) {
            effect = String(loaded).indexOf("kwini3hold") >= 0;
            if (!effect) log("EFFECT not loaded: no frame, no hold");
            heard();
        }));
    }
    function checkPerOutput(atLoad) {
        var was = perOutputBad, n = workspace.screens.length;
        perOutputBad = n >= 2 && !options.perOutputVirtualDesktops;
        log("PEROUTPUT " + (perOutputBad ? "off, " + n + " screens" : "ok"));
        var lines = ["With more than one output, kwin-i3 needs System Settings > Virtual Desktops > " +
                     "\"Switch desktops independently for each screen\" on. With it off, a desktop switch " +
                     "changes every output, and windows tile on the wrong one."];
        if (atLoad) { reportOpen(); reportClose("per-output desktops are off", perOutputBad ? lines : []); return; }
        if (!perOutputBad || was || perOutputLater) return;
        perOutputLater = true;
        reportOpen();
        reportClose("per-output desktops are off", lines);
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
        // The drop indicator has no timeout of its own in the effect.
        try { if (drag) endDrag("released"); } catch (e) { log("ERROR in release (drag end): " + e); }
        // A window crossing to another output is on all desktops until it arrives (relocate).
        try { Object.keys(crossing).forEach(function (key) { if (wins[key]) arrive(wins[key]); }); }
        catch (e) { log("ERROR in release (crossing): " + e); }
        try { if (mode) callDBus(MODE[0], MODE[1], MODE[2], "SetMode", ""); } catch (e) { log("ERROR in release (mode): " + e); }
        try { forgetRings(); } catch (e) { log("ERROR in release (rings): " + e); }
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
            if (!mine.length) return null;
            if (mine.length === 1) return { win: id(mine[0]), percent: total };
            // Several windows in one tile: a group kwin-i3 placed (projectGroup), its bar the empty
            // tile just before: a bar of one row per window is stacked, else tabbed. The tabs in
            // the order KWin lists them, kwin-i3's tab order; the one on top is shown. A
            // group whose shown tab was a split comes back as a group of that tab's windows.
            var sib = tile.parent ? tile.parent.tiles : [], at = sib.indexOf(tile), bar = at > 0 ? sib[at - 1] : null;
            var rows = bar && !bar.tiles.length && !bar.windows.length ? Math.round(bar.absoluteGeometry.height / BAR_ROW) : 1;
            return { layout: rows > 1 && rows === mine.length ? "stacked" : "tabbed", percent: total,
                     kids: mine.map(function (w) { return { win: id(w), percent: 0 }; }) };
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
        // A group with its bar is a vertical pair of tiles: alone in it, it is that group.
        if (kids.length === 1 && (kids[0].layout === "tabbed" || kids[0].layout === "stacked")) { kids[0].percent = total; return kids[0]; }
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
                // The focus order from the stacking, bottom first, before any pass: a group's tab
                // on top is its focused one, so the first pass shows (and raises) that one, not
                // the first tab. adoptRest sets the global focus after.
                workspace.stackingOrder.forEach(function (w) {
                    var c = model.byWin[id(w)];
                    if (c && c.type === "con" && Tree.wsOf(c) === ws) model.focusWin(id(w));
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
    // A window kwin-i3 doesn't manage closing: KWin then activates its own next choice before
    // windowRemoved (workspace.cpp removeWindow), which is not the user's (windowActivated).
    // Every window, those there at load too; once each (a rebuild adopts again).
    function watchClose(w) {
        var key = id(w);
        if (closeWatched[key]) return;
        closeWatched[key] = true;
        w.closed.connect(guard("closed outside", function () { if (!wins[id(w)]) closingOutside = w; }));
    }
    function adoptRest(m, done) {
        atLoadFloating = {};
        if (m && m.floating) m.floating.forEach(function (k) { atLoadFloating[k] = true; });
        var all = workspace.stackingOrder.slice();
        workspace.windowList().forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); });
        all.forEach(function (w) {
            watchClose(w);
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

    // A desktop removed or moved: workspace N is desktop N by
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
                wins = {}; expected = {}; armed = {}; lastFit = {}; pinFit = {}; fsFit = {}; selfFitAt = {}; selfFitLater = {}; ruleRan = {}; dirty = {}; placing = {};
                // borderGone stays, as tookBorder: the windows and their taken borders outlive the
                // model, and the GTK 4 bounds are learnt only when the border goes (campaign 2,
                // seed 11: a desktop removed, then a taller tile stayed 26 px short).
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
            watchClose(w);
            adoptWindow(w, true);
        }));
        workspace.windowRemoved.connect(guard("windowRemoved", function (w) { closingOutside = null; closingTree = null; forgetWindow(w); }));
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
            // next, over KWin's choice; the next pass applies it.
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
            // A floating window activated on a workspace with another window fullscreen (Alt+Tab,
            // the task manager, an app's request): i3 neither draws it over the fullscreen one nor
            // focuses it (render.c:253-270 fullscreen_blocks_floating_render, with
            // popup_during_fullscreen's exceptions; con_fullscreen_permits_focusing), so the
            // fullscreen window takes the focus back, as a new window's does (§5 C5, §10 V6b).
            if (!switching && fullscreenBlocks(w)) {
                var fsw = wins[model.fullscreenOn(Tree.wsOf(model.byWin[id(w)])).win];
                log("FULLSCREEN " + shortCaption(fsw) + ": keeps the focus over " + shortCaption(w) + " (activated)");
                workspace.activeWindow = fsw;
                return;
            }
            // A modal dialog activated: its parent takes the place right behind it in the focus
            // order, as in i3 the parent was focused at its opening (KWin activates a new window's modal dialog in its place, so the parent never got in).
            if (w.modal && w.transientFor && !w.transientFor.deleted && model.byWin[id(w.transientFor)]) model.focusWin(id(w.transientFor));
            model.focusWin(id(w));
            // The pointer follows an activation to another output (Alt+Tab, the task manager, an
            // app's request; i3's focus_on_window_activation ends in workspace_show), unless it
            // is there already (§5 A2); kwin-i3's own activations warp from applyFocus. Not KWin's
            // pick at a close (closingTree): the close's pass corrects it, and i3 sets no warp
            // at a close (tree.c).
            if (w.output && !closingTree) {
                var crossed = focusedOutput !== null && focusedOutput !== w.output.name;
                focusedOutput = w.output.name;
                if (crossed && !switching && warps() && pointerOn() !== w.output) invoke("MoveMouseToFocus");
            }
            // No pass follows KWin's own activation (focus follows mouse, a click, Alt+Tab): the
            // rings are told here; kwin-i3's own are told at the end of its pass.
            if (!switching) tellRings();
        }));
        workspace.cursorPosChanged.connect(guard("pointer", pointerMoved));
        seedPointer();
        readShowing();
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
        registerShortcut("kwin-i3 Tab Click", "kwin-i3: a group's tab clicked (run by the mouse, no key)", "",
                         guard("Tab Click", tabEvent));
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
        //. No reply asked: without the plugin, nothing happens.
        callDBus("org.kde.KWin", "/kwini3helper", "net.local.kwini3helper", "FitKeys");
        // All open their part of the report before any can close it: one notification, also when
        // the parts that answer at once (below) close before the others open theirs.
        reportOpen();
        checkTakenKeys();
        checkLayoutKeys();
        checkHelperKeys();
        checkPerOutput(true);
        reportClose("", []);
        options.perOutputVirtualDesktopsChanged.connect(guard("per-output", function () {
            checkPerOutput(false);
            if (options.perOutputVirtualDesktops) reshowHomes();
        }));
        scheduleAll();
        rememberShown();
    }

    // KWin reconfigured: take the settings again and act on what changed. Also called once just
    // after a load (KWin's own start-up reconfigure), with nothing changed.
    var RULE_KEYS = ["forWindow", "assign", "floatingWorkspaces"];
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
        callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "Stats", guard("frame check", function (m) {
            answered = true;
            if (n === effectAsk) {
                frameMisses = 0;
                marks = !!(m && m.floating && m.floating.length !== undefined);
                effectSeen = !!m;
                if (!m || m.focused !== focusTold) focusTold = null;     // a reloaded effect: tell it again
                // The frame first, so the windows adopted below see it (review of (iii)+(iv), 3).
                setFrame(!!(m && m.supported && m.frameWidth !== undefined));
                tellRing();             // again on every answer: a reloaded effect starts with the ring on
                // An effect that lost what it was told (reloaded while the frame stayed on): tell
                // it again (finding 1).
                if (marks) {
                    var has = {};
                    for (var i = 0; i < m.floating.length; i++) has[m.floating[i]] = true;
                    var lost = Object.keys(told).some(function (k) { return told[k] === true && !has[k]; });
                    // The rings likewise (SetRing; Stats lists the windows it holds a class for).
                    var rings = {};
                    (m.rings || []).forEach(function (k) { rings[k] = true; });
                    if (Object.keys(ringTold).some(function (k) { return !rings[k]; })) { ringTold = {}; lost = true; }
                    // The bars likewise: a reloaded effect lost them; a reloaded script never
                    // told the ones the effect still draws.
                    var bars = {};
                    (m.bars || []).forEach(function (k) { bars[k] = true; if (!barTold[k]) callDBus("org.kde.KWin", "/kwini3hold", "net.local.kwini3hold", "SetBar", k, 0, 0, 0, 0, false, 0, "", ""); });
                    Object.keys(barTold).forEach(function (k) { if (!bars[k]) { delete barTold[k]; kick(); } });
                    if (lost) { told = {}; scheduleAll(); }
                }
            }
            finish(m);
        }));
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
        told = {}; ringTold = {}; barTold = {};       // a new effect knows nothing: the next pass tells it again
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
        var changed = Settings.load();
        // Every reconfigure, the helper may be new (it asks for one at load); after the load, or a
        // changed gap would leave Meta+right's and the gap press's reach at the old one.
        tellDrag(true);
        if (!changed.length) return;
        log("SETTINGS " + changed.join(" "));
        // The rules changed: every rule runs anew on every window (each window's record cleared),
        // as a reload would in i3; a window a rule doesn't
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
    // preferAssigned: Move Workspace to Output replacing an output's last workspace first takes one
    // assigned to that output and not yet in use, as i3 (workspace_move_to_output); else, as
    // i3's create_workspace_on_output, the lowest not assigned elsewhere.
    function unusedWorkspace(s, preferAssigned) {
        if (preferAssigned) {
            for (var k = 1; k <= NAMES.length; k++) {
                if (Workspaces.assigned(k) !== s.name || model.workspaces[k] || Workspaces.showing(k)) continue;
                Workspaces.ensure(k);
                if (!deskOf(k)) continue;
                Workspaces.setHome(k, s);
                return k;
            }
        }
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
    // Overview included). Else N is
    // that output's. Not while monitors come and go: screensChanged settles those. A focus change
    // across outputs brings the pointer, as a key does (§5 A2).
    function shownOutside(e) {
        if (rebuilding) return;
        var names = workspace.screens.map(function (s) { return s.name; });
        if (Object.keys(lastShown).some(function (n) { return names.indexOf(n) < 0; }) ||
            names.some(function (n) { return !(n in lastShown); })) return;
        var num = e.current, output = null;
        workspace.screens.forEach(function (s) { if (s.name === e.output) output = s; });
        if (!output || num < 1 || !deskOf(num)) return;
        // A virtual desktop past 10 shown from outside (the Overview): not kwin-i3's (decision 9),
        // so the output goes back to what it showed.
        if (num > NAMES.length) {
            if (e.previous >= 1 && e.previous <= NAMES.length && deskOf(e.previous)) {
                showOn(deskOf(e.previous), output);
                log("SHOWN " + num + " on " + output.name + " outside kwin-i3: past 10, not a workspace; " + e.previous + " again");
            }
            return;
        }
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
        var ws = wsModel(num), old = model.focused;
        model.activate(focusOf(ws));
        pushSticky(outputOf(ws), old);
        wantFocus(true);
        rememberShown();
    }
    // Outputs came or went (i3's randr.c): a lost output's workspaces
    // move to the first output for good, assignments not read (i3's move_content);
    // a new output takes the workspaces assigned to it and shows its lowest, else its first
    // assigned, else the lowest free one; then the first output's visible workspace gets the
    // focus (§5 D5), the pointer following (A2). src/outputs.js decides from a snapshot; the
    // reconcile's relocate carries the windows, over KWin's own moves (plan.md decision 10).
    function outputState() {
        var st = { outputs: Workspaces.ordered().map(function (s) { return s.name; }), homes: {}, assigned: {}, occupied: {}, focused: null };
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
        var names = Workspaces.ordered().map(function (s) { return s.name; });
        var lost = Object.keys(lastShown).filter(function (n) { return names.indexOf(n) < 0; });
        var added = names.filter(function (n) { return !(n in lastShown); });
        // Desktop changes queued this turn are the outputs' own (KWin giving a new or a lost
        // output's desktop away), not a user's `workspace N`: shownOutside, a turn later, would
        // see the refreshed lastShown below and take them for one.
        if (lost.length || added.length) pendingShown = [];
        var first = Workspaces.ordered()[0], fws = focusedWs();
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
            if (show) Workspaces.ensure(show);      // its first assigned one may not exist yet (i3 makes it)
            if (show && deskOf(show)) {
                if (!Workspaces.hasHome(show)) Workspaces.setHome(show, X);
                if (workspace.currentDesktopForScreen(X) !== deskOf(show)) showOn(deskOf(show), X);
            }
            log("OUTPUT " + name + " here" + (moving.length ? ": workspace " + moving.join(", ") + " moved to it" : "") +
                (show ? "; it shows " + show : "") + (shown.length ? "; " + shown.join(", ") : ""));
        });
        lastShown = {};
        rememberShown();
        workspace.screens.forEach(function (s) { pushSticky(s, null); });   // sticky windows follow what each output shows now
        seedPointer();
        armRefit();
        scheduleAll();
        // D. The first output's visible workspace gets the focus (i3 focuses the primary output
        // after every output change); the pointer follows when it isn't there (A2).
        if ((lost.length || added.length) && first) {
            var ws = shownWs(first);
            if (ws) {
                model.activate(focusOf(ws));
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
// ---- src/main.js
// Entry point: runs last, after every other src/ file is defined.
KI3.start();
