// Settings: every key kwin-i3 reads from kwinrc's [Script-kwin-i3] group, with its type and
// default (docs/spec-settings.md). The one table the config form (package/contents/config/
// main.xml) and the README follow; tests/unit/settings.test.js holds the three together.
//
// Read at load and again on every KWin reconfigure (options.configChanged; Meta+Shift+C asks for
// one): the config form writes the file and tells KWin nothing (genericscriptedconfig.cpp
// ScriptingConfig::reload is a TODO in 6.7.5), and a script sees a new value only once KWin has
// reparsed its config. load() returns the keys whose value changed.

var Settings = (function () {
    var TABLE = {
        ignoreClass: { type: "list", def: "krunner,yakuake,spectacle,kded5,xwaylandvideobridge," +
            "plasmashell,ksplashqml,org.kde.plasmashell,org.kde.polkit-kde-authentication-agent-1," +
            "org.kde.kruler,kruler,kwin_wayland,ksmserver-logout-greeter" },
        ignoreRole: { type: "list", def: "quake" },
        floatingClass: { type: "list", def: "" },
        floatingTitle: { type: "list", def: "" },
        debugLog: { type: "bool", def: "false" },
        resizeStep: { type: "int", def: "10", min: 1, max: 50 },                // %, i3's "10 ppt"
        defaultOrientation: { type: "choice", def: "auto", choices: ["auto", "horizontal", "vertical"] },
        focusWrapping: { type: "choice", def: "yes", choices: ["yes", "no", "force", "workspace"] },
        workspaceOutputs: { type: "outputs", def: "" },                         // "1=DP-4, 2=DP-6"
        gapsInner: { type: "int", def: "0", min: 0, max: 100 },                 // px between windows
        gapsOuter: { type: "int", def: "0", min: 0, max: 200 },                 // px more at the screen edge
    };
    var values = {};

    // Every value is read as text (KConfig stores text) and parsed here, so a value the form
    // wrote and one written by hand read the same; one that doesn't parse is the default.
    function parse(t, text) {
        var type = t.type;
        if (type === "int") {
            if (!/^-?[0-9]+$/.test(text)) return null;
            var n = parseInt(text, 10);
            return n >= t.min && n <= t.max ? n : null;
        }
        if (type === "choice") return t.choices.indexOf(text) >= 0 ? text : null;
        // i3's "workspace N output X": { N: output name }. A malformed entry is skipped (and
        // logged), the rest still apply.
        if (type === "outputs") {
            var out = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^([0-9]+)\s*=\s*(\S+)$/.exec(e);
                if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2];
                else log("WARN setting workspaceOutputs: ignoring \"" + e + "\" (want N=OUTPUT, N 1-10)");
            });
            return out;
        }
        if (type === "list")
            return text.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
        if (type === "bool") {
            if (text === "true") return true;
            if (text === "false") return false;
            return null;
        }
        return text;
    }

    function load() {
        var changed = [];
        Object.keys(TABLE).forEach(function (key) {
            var t = TABLE[key];
            var v = parse(t, String(readConfig(key, t.def)).trim());
            if (v === null) {
                log("WARN setting " + key + ": not a valid " + t.type + ", using the default");
                v = parse(t, t.def);
            }
            if (JSON.stringify(v) !== JSON.stringify(values[key])) changed.push(key);
            values[key] = v;
        });
        DEBUG_LOG = values.debugLog;
        return changed;
    }

    load();
    return {
        get: function (key) { return values[key]; },
        load: load,
        table: TABLE,
    };
})();
