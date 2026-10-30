// Where a new window goes, and which outside desktop switch it caused (docs/records/spec-redo-1-new-windows.md,
// A and B). Pure functions of recorded state, so they are unit-tested (tests/unit/placement.test.js);
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
        // it showed before them (review 2026-10-28; the last overwrote it).
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
