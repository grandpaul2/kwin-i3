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
