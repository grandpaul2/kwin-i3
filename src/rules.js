// Which windows kwin-i3 manages, and which of those float rather than tile. Mostly what the
// patched Krohnkite decided (its shouldIgnore / shouldFloat, defaults from its main.xml), so
// nothing changed at the switch-over from it. Settings are comma-separated lists in kwinrc's
// [Script-kwin-i3] group (not Krohnkite's): ignoreClass, ignoreRole, floatingClass,
// floatingTitle (a window whose caption contains one of the words floats).

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
    var FLOAT_TITLE = list("floatingTitle", "");

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
        if (has(IGNORE_CLASS, w.resourceClass) || has(IGNORE_CLASS, w.resourceName) ||
            has(IGNORE_ROLE, w.windowRole)) return "ignore";
        // On Wayland a dialog is a normal window; only transient/modal mark it (phase 0).
        if (w.transient || w.modal || fixedSize(w)) return "float";
        if (w.dialog || w.splash || w.utility) return "float";
        if (has(FLOAT_CLASS, w.resourceClass) || has(FLOAT_CLASS, w.resourceName) ||
            titleHas(w.caption, FLOAT_TITLE)) return "float";
        return "tile";
    }

    return { classify: classify };
})();
