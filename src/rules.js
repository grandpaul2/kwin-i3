// Which windows kwin-i3 manages, and which of those float rather than tile. Mostly what the
// patched Krohnkite decided (its shouldIgnore / shouldFloat, defaults from its main.xml), so
// nothing changed at the switch-over from it. Settings are comma-separated lists in kwinrc's
// [Script-kwin-i3] group (not Krohnkite's): ignoreClass, ignoreRole, floatingClass,
// floatingTitle (a window whose caption contains one of the words floats). Read from Settings at
// each judgement, so a reload changes them (src/settings.js).

var Rules = (function () {
    var S = function (key) { return Settings.get(key); };

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
        if (has(S("ignoreClass"), w.resourceClass) || has(S("ignoreClass"), w.resourceName) ||
            has(S("ignoreRole"), w.windowRole)) return "ignore";
        // On Wayland a dialog is a normal window; only transient/modal mark it (phase 0).
        if (w.transient || w.modal || fixedSize(w)) return "float";
        if (w.dialog || w.splash || w.utility) return "float";
        if (String(w.caption) === "kwin-i3 capture note") return "float";   // tools/capture's own box
        if (has(S("floatingClass"), w.resourceClass) || has(S("floatingClass"), w.resourceName) ||
            titleHas(w.caption, S("floatingTitle"))) return "float";
        return "tile";
    }

    return { classify: classify };
})();
