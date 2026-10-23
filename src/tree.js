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
        this.tidy();
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
    // moving a window took several presses to cross (Paul, 2026-10-22). A one-child split
    // holding a window stays: that is what Split H makes, and what a move goes into.
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
        this.tidy();
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
