// Built by build.sh from src/ — do not edit; edit src/ and rebuild.
// ---- src/log.js
// Logging. KWin drops print() from scripts on this machine (the kwin_scripting category is off),
// so lines go over D-Bus to tools/logsink.py when [Script-kwin-i3] debugLog=true. Silent otherwise:
// if nothing owns the name, the call fails quietly.
var DEBUG_LOG = readConfig("debugLog", false) === true || readConfig("debugLog", "") === "true";

function log(line) {
    if (!DEBUG_LOG) return;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", String(line));
}
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
//   - No stacked/tabbed layouts, marks, urgency or scratchpad (Paul, 2026-10-21).

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
    M.activate = function (con) {
        focusUp(con);
        this.focused = con;
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
    };

    // ---- moving (move.c) -------------------------------------------------------------------

    function lowestCommonAncestor(a, b) {
        for (var pa = a; pa; pa = pa.parent)
            for (var pb = b; pb; pb = pb.parent)
                if (pa === pb) return pa;
        throw new Error("lowestCommonAncestor: not in the same tree");
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

    // ---- focus (tree.c get_tree_next / tree_next) ------------------------------------------

    // Directional focus with i3's default focus_wrapping (yes): out of the workspace to the
    // visible workspace of the neighbouring output, else wrap inside the innermost container of
    // that orientation. Returns what is focused now, or null if nothing changed.
    M.focusDir = function (dir) {
        var con = this.focused;
        if (!con) return null;
        var previous = isBefore(dir), o = orientationOf(dir), firstWrap = null, next = null;
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
                if (!firstWrap && permitsFocusing(wrap)) firstWrap = wrap;
            }
            con = parent;
        }
        if (!next) {
            var ws = this.env.outputNeighbour ? this.env.outputNeighbour(wsOf(this.focused), dir) : null;
            next = ws || firstWrap;
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

    return {
        Model: Model,
        wsOf: wsOf,
        LEFT: LEFT, RIGHT: RIGHT, UP: UP, DOWN: DOWN,
        create: function (env) { return new Model(env); }
    };
})();

if (typeof module !== "undefined") module.exports = Tree;
// ---- src/rules.js
// Which windows kwin-i3 manages, and which of those float rather than tile. Mostly what the
// patched Krohnkite decided (its shouldIgnore / shouldFloat, defaults from its main.xml), so
// nothing changes for Paul at switch-over. Settings come from kwin-i3's own [Script-kwin-i3]
// group, not Krohnkite's; the floatingTitle default is the stage's Xephyr title
// ("STAGE (streamed)", as ~/.dotfiles setup.sh set for Krohnkite).

var Rules = (function () {
    function list(key, def) {
        return String(readConfig(key, def)).split(",").map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; });
    }
    var IGNORE_CLASS = list("ignoreClass", "krunner,yakuake,spectacle,kded5,xwaylandvideobridge," +
        "plasmashell,ksplashqml,org.kde.plasmashell,org.kde.polkit-kde-authentication-agent-1," +
        "org.kde.kruler,kruler,kwin_wayland,ksmserver-logout-greeter");
    var IGNORE_ROLE = list("ignoreRole", "quake");
    var FLOAT_CLASS = list("floatingClass", "");
    var FLOAT_TITLE = list("floatingTitle", "STAGE (streamed)");

    function has(arr, v) { return arr.indexOf(String(v)) >= 0; }
    function titleHas(caption, words) {
        for (var i = 0; i < words.length; i++) if (String(caption).indexOf(words[i]) >= 0) return true;
        return false;
    }

    // "ignore": not ours at all. "float" / "tile": managed.
    function classify(w) {
        if (w.deleted || !w.normalWindow || w.popupWindow || w.specialWindow) return "ignore";
        if (w.onAllDesktops || w.skipTaskbar) return "ignore";
        if (has(IGNORE_CLASS, w.resourceClass) || has(IGNORE_CLASS, w.resourceName) ||
            has(IGNORE_ROLE, w.windowRole)) return "ignore";
        // On Wayland a dialog is a normal window; only transient/modal mark it (phase 0).
        if (w.transient || w.modal || !w.resizeable) return "float";
        if (w.dialog || w.splash || w.utility) return "float";
        if (has(FLOAT_CLASS, w.resourceClass) || has(FLOAT_CLASS, w.resourceName) ||
            titleHas(w.caption, FLOAT_TITLE)) return "float";
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

    // i3's numbering at login: workspace 1 on the primary screen, 2 on the next, ... (KWin lists
    // the primary first). i3ws did this on every load, so reloading it mid-session reshuffled the
    // monitors (2026-10-21); kwin-i3 does it only when it starts with no windows (a login).
    function numberScreens() {
        var s = workspace.screens;
        for (var i = 0; i < s.length && i < workspace.desktops.length; i++) {
            workspace.setCurrentDesktopForScreen(workspace.desktops[i], s[i]);
            home[i + 1] = s[i].name;
        }
    }

    return {
        deskOf: deskOf, deskNum: deskNum, showing: showing, outputOf: outputOf,
        setHome: setHome, hasHome: hasHome, screenToward: screenToward, numberScreens: numberScreens,
        homes: function () { return home; },
    };
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
            var ms = t.windows[0].minSize, g = screen.geometry;
            min = { width: ms.width / g.width, height: ms.height / g.height };
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

    // The smallest a projected subtree can be, in pixels: windows' minimum sizes added up along a
    // split and the largest across it.
    function minOf(p) {
        if (p.win !== undefined) {
            var m = wins[p.win].minSize;
            return { w: m.width, h: m.height };
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
                var m = axis === "w" ? w.minSize.width : w.minSize.height;
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
// ---- src/main.js
// Entry point: runs last, after every other src/ file is defined.
KI3.start();
