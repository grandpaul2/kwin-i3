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
