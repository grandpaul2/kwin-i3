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
