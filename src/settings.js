// Settings: every key in kwinrc's [Script-kwin-i3] group, with its type and default
// (docs/records/spec-settings.md). The plugins read theirs too (the frame's, the hold's,
// tilingDrag), each with its own fallback for a value this table would refuse. The one table the config form (package/contents/config/
// main.xml) and the README follow; tests/unit/settings.test.js holds the three together.
//
// Read at load and again on every KWin reconfigure (options.configChanged; Meta+Shift+C asks for
// one): the config form writes the file and tells KWin nothing (genericscriptedconfig.cpp
// ScriptingConfig::reload is a TODO in 6.7.5), and a script sees a new value only once KWin has
// reparsed its config. load() returns the keys whose value changed.

var Settings = (function () {
    // The window rules in i3's syntax, one per line (src/rules.js parses them; docs/behaviour.md
    // §3, §11 N12-N15). The defaults float the Plasma tools i3 would float (Spectacle, the
    // password prompt, KRuler, plasmashell's ordinary windows, the desktop portal's dialogs: Qt
    // dialogs on X11, typeless and often parentless on Wayland); the system windows are built in.
    var DEFAULT_RULES = "[class=\"^org\\.kde\\.spectacle$\"] floating enable; " +
        "[class=\"^org\\.kde\\.polkit-kde-authentication-agent-1$\"] floating enable; " +
        "[class=\"^(org\\.kde\\.)?kruler$\"] floating enable; " +
        "[class=\"^(org\\.kde\\.)?plasmashell$\" window_type=\"normal\"] floating enable; " +
        "[class=\"^org\\.freedesktop\\.impl\\.portal\\.desktop\\.kde$\"] floating enable";
    var TABLE = {
        forWindow: { type: "text", def: DEFAULT_RULES },                        // for_window [criteria] floating enable|disable
        assign: { type: "text", def: "" },                                      // assign [criteria] → N | output X
        floatingMinimumSize: { type: "size", def: "75x50" },                    // i3's floating_minimum_size
        floatingMaximumSize: { type: "size", def: "0x0" },                      // floating_maximum_size: 0x0 all outputs together, -1x-1 none
        debugLog: { type: "bool", def: "false" },
        warnTakenKeys: { type: "bool", def: "true" },                         // the notice at load
        resizeStep: { type: "int", def: "10", min: 1, max: 50 },                // %, i3's "10 ppt"
        floatingStep: { type: "int", def: "10", min: 1, max: 200 },             // px a floating window moves or resizes, i3's "10 px"
        defaultOrientation: { type: "choice", def: "auto", choices: ["auto", "horizontal", "vertical"] },
        focusWrapping: { type: "choice", def: "yes", choices: ["yes", "no", "force", "workspace"] },
        mouseWarping: { type: "choice", def: "output", choices: ["output", "none"] },   // i3's mouse_warping (§5 A2)
        // i3's popup_during_fullscreen (§10 V6; redo stage 8): what a new window may do on a workspace with a fullscreen window.
        popupDuringFullscreen: { type: "choice", def: "smart", choices: ["smart", "ignore", "leave_fullscreen", "all"] },
        // i3's tiling_drag (§9 G3): which presses start the tiling drag; read by the helper from kwinrc.
        tilingDrag: { type: "choice", def: "modifier titlebar", choices: ["off", "modifier", "titlebar", "modifier titlebar"] },
        workspaceOutputs: { type: "outputs", def: "" },                         // "1=DP-4 HDMI-A-1, 2=DP-6": a list per number
        workspaceAutoBackAndForth: { type: "bool", def: "false" },              // i3's workspace_auto_back_and_forth
        gapsInner: { type: "int", def: "2", min: 0, max: 100 },                 // px between windows, even (an odd one counts as the even below)
        gapsOuter: { type: "int", def: "0", min: -100, max: 200 },              // px more at the screen edge; negative takes from it (down to half the inner gap)
        // i3's gaps top|right|bottom|left (§11 N2; redo stage 7): that side's outer gap, -1 for gapsOuter.
        gapsTop: { type: "int", def: "-1", min: -1, max: 200 },
        gapsRight: { type: "int", def: "-1", min: -1, max: 200 },
        gapsBottom: { type: "int", def: "-1", min: -1, max: 200 },
        gapsLeft: { type: "int", def: "-1", min: -1, max: 200 },
        workspaceGaps: { type: "wsgaps", def: "" },                             // i3's "workspace N gaps inner|outer|… M", in place of the global ones
        smartGaps: { type: "choice", def: "off", choices: ["off", "on", "inverse_outer"] },   // i3's smart_gaps
        // i3's hide_edge_borders (§7 L6): smart and smart_no_gaps drop a lone window's ring; the
        // per-edge values hide the ring's side at the output's edge (the strip stays: KWin's reason).
        hideEdgeBorders: { type: "choice", def: "none", choices: ["none", "vertical", "horizontal", "both", "smart", "smart_no_gaps"] },
        // The frame: drawn by kwini3hold, its room left by the script (frameWidth); here so the form has them.
        // i3's colour classes (§7 L3): focused and unfocused (focused_inactive left out, Paul
        // 2026-10-28); the indicator is the side where the next window opens on a
        // window alone in its split (L4), an empty colour being the class's frame colour.
        frameWidth: { type: "int", def: "1", min: 1, max: 10 },
        frameActive: { type: "colour", def: "#4c7899" },
        frameInactive: { type: "colour", def: "#333333" },
        frameIndicatorActive: { type: "colour", def: "#3daee9" },
        frameIndicatorInactive: { type: "colour", def: "" },
        // Window modes (docs/records/spec-window-modes.md): workspaces whose new windows open floating, as
        // Plasma windows; and the frame on floating windows too, in the same colour classes (L11).
        floatingWorkspaces: { type: "workspaces", def: "" },                     // "3, 7"
        frameOnFloating: { type: "bool", def: "false" },
        // How tiled windows look (docs/records/spec-tiled-look.md): i3's frame, their own title bars, or
        // neither. Without kwini3hold every one is "titlebars".
        tiledLook: { type: "choice", def: "frame", choices: ["frame", "titlebars", "bare"] },
        // Tiled windows' corners, rounded by kwini3hold (docs/records/spec-rounded-corners.md).
        roundedCorners: { type: "bool", def: "true" },
        holdEnabled: { type: "bool", def: "true" },
        holdTimeoutMs: { type: "int", def: "200", min: 10, max: 2000 },
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
        // "WxH", 0 and -1 allowed (Rules.parseSize); i3 writes "75 x 50": spaces taken, given back
        // without (review 2026-10-28: rejected, the default stood in silently).
        if (type === "size") { var sz = /^\s*(-?[0-9]+)\s*x\s*(-?[0-9]+)\s*$/.exec(text); return sz ? sz[1] + "x" + sz[2] : null; }
        if (type === "text") return text;                                              // the rules, parsed by Rules
        if (type === "colour") return text === "" ? "" : /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;   // "": the effect's own fallback (an indicator: its class's colour)
        // i3's "workspace N gaps inner|outer|horizontal|vertical|top|right|bottom|left M" (gaps.c:
        // in place of the global ones, as gaps_for_workspace), one per line or separated by ";" or ",",
        // "workspace" optional: "3 gaps inner 10, 5 gaps outer 0" -> { 3: { inner: 10 }, 5: { top: 0,
        // right: 0, bottom: 0, left: 0 } }. An outer side may be negative, as the global one
        // (computeGaps holds it at half the inner gap). A malformed entry is skipped (and logged),
        // the rest still apply.
        if (type === "wsgaps") {
            var ws = {};
            text.split(/[\n;,]/).forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^(?:workspace\s+)?([0-9]+)\s+gaps\s+(inner|outer|horizontal|vertical|top|right|bottom|left)\s+(-?[0-9]+)$/.exec(e);
                if (!m || +m[1] < 1 || +m[1] > 10) { log("WARN setting workspaceGaps: ignoring \"" + e + "\" (want N gaps inner|outer|horizontal|vertical|top|right|bottom|left M, N 1-10)"); return; }
                var g = ws[+m[1]] || (ws[+m[1]] = {}), v = +m[3];
                var sides = { inner: ["inner"], outer: ["top", "right", "bottom", "left"], horizontal: ["left", "right"], vertical: ["top", "bottom"] }[m[2]] || [m[2]];
                sides.forEach(function (s) { g[s] = v; });
            });
            return ws;
        }
        // i3's "workspace N output A B …": { N: [output names] }, the first connected one wins
        // (§4 W5; redo stage 4). "1=DP-4 HDMI-A-1, 2=DP-6": names space-separated, so an output
        // name can't contain a space (i3's can't either). A malformed entry is skipped (and
        // logged), the rest still apply.
        if (type === "outputs") {
            var out = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                var m = /^([0-9]+)\s*=\s*(\S+(?:\s+\S+)*)$/.exec(e);
                if (m && +m[1] >= 1 && +m[1] <= 10) out[+m[1]] = m[2].split(/\s+/);
                else log("WARN setting workspaceOutputs: ignoring \"" + e + "\" (want N=OUTPUT [OUTPUT …], N 1-10)");
            });
            return out;
        }
        // Workspace numbers, 1-10: { N: true }. Anything else is skipped (and logged).
        if (type === "workspaces") {
            var set = {};
            text.split(",").forEach(function (e) {
                e = e.trim();
                if (!e) return;
                if (/^[0-9]+$/.test(e) && +e >= 1 && +e <= 10) set[+e] = true;
                else log("WARN setting floatingWorkspaces: ignoring \"" + e + "\" (want workspace numbers 1-10)");
            });
            return set;
        }
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
