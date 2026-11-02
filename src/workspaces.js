// Workspaces as KWin's desktops, and the workspaceOutputs setting.
// Workspace N is virtual desktop N. Which output it lives on is the model's (src/tree.js, i3's
// output level; src/kwin.js places them); Plasma 6.7's per-output desktops let each monitor
// show a different one.

var Workspaces = (function () {
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

    // KWin's outputs, the primary first (System Settings > Display's order): `screenOrder`, the
    // order KWin's own "Switch to Screen N" counts in (useractions.cpp). `screens` is the backend's
    // order (DRM connectors), which only matches by luck. i3's outputs list starts at the primary
    // too (get_first_output, randr.c:80-98).
    function ordered() {
        var o = workspace.screenOrder;
        return o && o.length ? o : workspace.screens;
    }

    // i3's numbering at login (init_ws_for_output, randr.c:456-520): each output, primary first,
    // shows its first assigned workspace (the lowest number set to it: the setting is keyed by
    // number, where i3 takes its config's first), else the lowest-numbered workspace that is free
    // and not set to another output (create_workspace_on_output); with none set, 1 on the
    // primary, 2 on the next, ... Workspaces set to an output are placed there first (`place`,
    // src/kwin.js's, as for every placement). i3ws did this on every load, so reloading it
    // mid-session reshuffled the monitors (2026-10-21); kwin-i3 does it only when it starts with
    // no windows (a login).
    // Workspaces a screen needs are created (ensure), so each monitor has its own.
    function numberScreens(place) {
        var s = ordered(), n = workspace.desktops.length, taken = {};
        var a = Settings.get("workspaceOutputs");
        Object.keys(a).forEach(function (k) { if (+k <= n && assigned(+k)) place(+k, screenNamed(assigned(+k))); });
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
            place(pick, s[i]);
        }
    }

    return {
        deskOf: deskOf, deskNum: deskNum, ensure: ensure, showing: showing, screenNamed: screenNamed,
        numberScreens: numberScreens, ordered: ordered,
        assigned: assigned, assignedList: assignedList, assignedScreen: assignedScreen,
    };
})();
