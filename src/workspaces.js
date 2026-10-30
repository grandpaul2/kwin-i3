// Workspaces and monitors, carried over from i3ws (~/.dotfiles, plasma/.../kwin/scripts/i3ws).
// Workspace N is virtual desktop N. It lives on one monitor (its "home"), shown there or hidden;
// Plasma 6.7's per-output desktops let each monitor show a different one.
//
// Homes are output *names*, always of a connected output: when a monitor goes away its workspaces
// move to a remaining one for good, and a returning monitor gets back only the workspaces assigned
// to it, as in i3 (randr.c; docs/plan.md decision 10, redo stage 4: src/outputs.js decides,
// src/kwin.js screensChanged acts).

var Workspaces = (function () {
    var home = {};          // ws num -> output name
    var MAX = 10;           // kwin-i3's keys: Meta+1..0

    // i3 creates a workspace when it is first used: KWin's desktops up to num, appended so none
    // moves, never removed (KWin saves the count; docs/records/spec-desktops-on-demand.md). A stock
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
        reset: function () { home = {}; },      // the model rebuilt (docs/records/spec-desktop-changes.md)
    };
})();
