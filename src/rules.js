// Which kind each window is (docs/behaviour.md §3, docs/spec-redo-3-kinds-rules.md): i3's kinds,
// decided as i3's manage.c decides them, then the user's rules in i3's own syntax (`forWindow`:
// `for_window [criteria] floating enable|disable`; `assign [criteria] → N | output X`), read from
// kwinrc's [Script-kwin-i3] group (src/settings.js). The old list settings (`floatingClass`,
// `floatingTitle`, `floatingWorkspaces`, and a user's own `ignoreClass`/`ignoreRole` entries) are
// read on as rules, so nothing a user set changes at the update (C).
//
// Kinds: "tiling", "floating" and "sticky" (on all desktops: floating, on every workspace of its
// output, redo stage 9) are in the tree; "dock" (a panel), "root" (the desktop window) and
// "override-redirect" (KRunner, popups, menus, notifications, OSDs, Plasma's system windows) are
// kept out of it.

var Rules = (function () {
    var S = function (key) { return Settings.get(key); };

    function has(arr, v) { return arr.indexOf(String(v)) >= 0; }
    function managed(kind) { return kind === "tiling" || kind === "floating" || kind === "sticky"; }

    // ---- the kinds kept out of the tree ---------------------------------------------------------

    // i3's kind of a window kept out of the tree: "dock", "root", "override-redirect", or null
    // for one that may be in the tree. Plasma's system windows are Normal windows on Wayland,
    // where i3 would never see them: a built-in list, not a setting (R5). Spectacle's region
    // overlays (one Normal fullscreen window per output, probe 93) are override-redirect too
    // (Paul's call 60): in the tree they would gather on the focused workspace. An
    // override-redirect window holds the keyboard against kwin-i3's keys (§5 A3), as dmenu in i3.
    var OVERRIDE_CLASSES = ["krunner", "kded5", "kded6", "xwaylandvideobridge", "ksplashqml",
                            "kwin_wayland", "ksmserver-logout-greeter"];
    var SPECTACLE = ["spectacle", "org.kde.spectacle"];
    var PLASMASHELL = /^(org\.kde\.)?plasmashell$/;
    function i3Kind(w) {
        if (w.dock) return "dock";
        if (w.desktopWindow) return "root";
        // kwini3helper's strips over the gaps are kwin-i3's own, as i3's frames: no client.
        if (String(w.caption) === "kwin-i3 gap") return "override-redirect";
        if (w.popupWindow || w.menu || w.dropdownMenu || w.popupMenu || w.tooltip ||
            w.onScreenDisplay || w.comboBox || w.dndIcon || w.appletPopup) return "override-redirect";
        // Plasma's notifications are Plasma's (philosophy.md), by class as the default rule names
        // plasmashell; another app's notification-type window (an X11 toast) floats, as i3's
        // manage.c:466. KWin shows a script no X11-only property to tell them apart by.
        if ((w.notification || w.criticalNotification) && PLASMASHELL.test(String(w.resourceClass))) return "override-redirect";
        if (has(OVERRIDE_CLASSES, w.resourceClass) || has(OVERRIDE_CLASSES, w.resourceName)) return "override-redirect";
        if (w.fullScreen && (has(SPECTACLE, w.resourceClass) || has(SPECTACLE, w.resourceName))) return "override-redirect";
        return null;
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

    // i3's `window_type` criterion values (match.c), from KWin's type flags.
    function windowType(w) {
        if (w.dialog) return "dialog";
        if (w.utility) return "utility";
        if (w.toolbar) return "toolbar";
        if (w.splash) return "splash";
        if (w.notification) return "notification";
        return "normal";
    }

    // i3's float at manage (manage.c:466-500): a dialog, utility, toolbar or splash window (X11
    // types too: R2), a transient, a modal, a fixed size; and tools/capture's note (R8).
    function floatsByDefault(w) {
        if (w.transient || w.modal || fixedSize(w)) return true;
        if (w.dialog || w.utility || w.toolbar || w.splash || w.notification || w.criticalNotification) return true;
        return String(w.caption) === "kwin-i3 capture note";
    }

    // ---- the rules ------------------------------------------------------------------------------

    var CRITERIA = ["class", "instance", "title", "window_role", "window_type", "workspace", "floating", "tiling", "all"];
    var escapeRe = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };

    // i3's window_type values (match.c); kwin-i3's windows only ever have the first six, the
    // rest are kept out of the tree, as Plasma's notifications are (philosophy.md).
    var WINDOW_TYPES = ["normal", "dialog", "utility", "toolbar", "splash", "notification", "menu", "dropdown_menu", "popup_menu", "tooltip"];

    // i3 compiles a criterion with PCRE2 (regex.c). JavaScript's own syntax, strict (the u flag),
    // reads most of it; what it refuses and i3 configs commonly hold, a leading (?i) and escaped
    // punctuation (\-, \ , \_), is read as PCRE would: the case-insensitive flag, loose escapes.
    // Possessive quantifiers and atomic groups stay unreadable: WARN, the rule skipped.
    function regex(src, where) {
        try { return new RegExp(src, "u"); } catch (e) { /* PCRE-only syntax: try loosely below */ }
        var flags = "", body = src;
        if (/^\(\?i\)/.test(body)) { flags = "i"; body = body.slice(4); }
        try { return new RegExp(body, flags); }
        catch (e) { log("WARN setting " + where + ": \"" + src + "\" isn't a regular expression kwin-i3 can read (" + e.message + ")"); return null; }
    }

    // `[class="^x$" title="y"]` -> { class: RegExp, title: RegExp } (`floating`, `tiling`, `all`
    // take no value); null with a logged WARN for anything else. Values are quoted, `\"` inside.
    function parseCriteria(text, where) {
        var crit = {}, rest = text.trim(), n = 0;
        while (rest.length) {
            var m = /^(\w+)(?:\s*=\s*"((?:[^"\\]|\\.)*)")?\s*/.exec(rest);
            if (!m || !has(CRITERIA, m[1])) { log("WARN setting " + where + ": can't read the criteria \"" + text + "\""); return null; }
            rest = rest.slice(m[0].length);
            var key = m[1];
            if (key === "floating" || key === "tiling" || key === "all") {
                if (m[2] !== undefined) { log("WARN setting " + where + ": " + key + " takes no value (\"" + text + "\")"); return null; }
                crit[key] = true;
            } else if (m[2] === undefined) {
                log("WARN setting " + where + ": " + key + " needs a quoted value (\"" + text + "\")");
                return null;
            } else if (key === "window_type") {
                // A keyword in i3, matched case-insensitively against the window's one type
                // (match.c, strcasecmp), not a regular expression.
                var type = m[2].toLowerCase();
                if (!has(WINDOW_TYPES, type)) { log("WARN setting " + where + ": window_type \"" + m[2] + "\" isn't one of i3's (" + WINDOW_TYPES.join(", ") + ")"); return null; }
                crit[key] = { test: function (v) { return v === type; } };
            } else {
                crit[key] = regex(m[2].replace(/\\"/g, "\""), where);
                if (!crit[key]) return null;
            }
            n++;
        }
        if (!n) { log("WARN setting " + where + ": empty criteria"); return null; }
        return crit;
    }

    // Rules are separated by line breaks or `;` outside quotes (kwinrc keeps line breaks; the
    // default in main.xml is one line). -> the pieces, trimmed, empty ones dropped.
    function split(text) {
        var out = [], cur = "", quoted = false;
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (c === "\\" && quoted && i + 1 < text.length) { cur += c + text.charAt(++i); continue; }
            if (c === "\"") quoted = !quoted;
            // A line break ends a rule whatever the quotes: one stray " (a typo) no longer joins
            // the lines below into it, losing their ;-separated rules too (review 2026-10-28).
            if (c === "\n" || c === "\r") { out.push(cur); cur = ""; quoted = false; continue; }
            if (c === ";" && !quoted) { out.push(cur); cur = ""; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    }
    // One rule per line: `[criteria] command`. -> [{ crit, rest, src }], bad lines skipped.
    function lines(text, where) {
        var out = [];
        split(String(text || "")).forEach(function (line) {
            var src = line.trim();
            if (!src) return;
            var m = /^\[((?:[^\]"]|"(?:[^"\\]|\\.)*")*)\]\s*(.*)$/.exec(src);
            if (!m) { log("WARN setting " + where + ": a rule starts with [criteria]: \"" + src + "\""); return; }
            var crit = parseCriteria(m[1], where);
            if (crit) out.push({ crit: crit, rest: m[2].trim(), src: src });
        });
        return out;
    }

    // `forWindow`: [{ crit, floating: true|false, src }]. Only `floating enable|disable` (R9).
    function parseForWindow(text) {
        var out = [];
        lines(text, "forWindow").forEach(function (r) {
            var m = /^floating\s+(enable|disable)$/.exec(r.rest);
            if (!m) { log("WARN setting forWindow: only \"floating enable\" and \"floating disable\" are rules here: \"" + r.src + "\""); return; }
            out.push({ crit: r.crit, floating: m[1] === "enable", src: r.src });
        });
        return out;
    }

    // `assign`: [{ crit, workspace: N } | { crit, output: name }]; `→` or `->`, `workspace`,
    // `number` optional before N (1-10), as i3 takes them.
    function parseAssign(text) {
        var out = [];
        lines(text, "assign").forEach(function (r) {
            var m = /^(?:(?:→|->)\s*)?(?:workspace\s+)?(?:number\s+)?([0-9]+)$/.exec(r.rest);
            if (m) {
                if (+m[1] < 1 || +m[1] > 10) { log("WARN setting assign: workspace " + m[1] + " isn't one of 1-10: \"" + r.src + "\""); return; }
                out.push({ crit: r.crit, workspace: +m[1], src: r.src });
                return;
            }
            m = /^(?:(?:→|->)\s*)?output\s+(\S+)$/.exec(r.rest);
            if (m) { out.push({ crit: r.crit, output: m[1], src: r.src }); return; }
            log("WARN setting assign: want \"→ N\", \"workspace N\" or \"output X\": \"" + r.src + "\"");
        });
        return out;
    }

    // The old list settings as rules (C): a class or name matched whole, a title as a substring,
    // a Floating workspace's number; a user's own ignore entries float too (R5: a user can't make
    // a window override-redirect; Paul's call 43), reported once at load (`translated`).
    var OLD_IGNORE_CLASS = ["krunner", "yakuake", "spectacle", "kded5", "xwaylandvideobridge", "plasmashell",
                            "ksplashqml", "org.kde.plasmashell", "org.kde.polkit-kde-authentication-agent-1",
                            "org.kde.kruler", "kruler", "kwin_wayland", "ksmserver-logout-greeter"];
    var OLD_IGNORE_ROLE = ["quake"];
    function oldRules() {
        var out = [], ignored = [];
        function rule(key, pattern, from) {
            var crit = {}; crit[key] = new RegExp(pattern, "u");
            out.push({ crit: crit, floating: true, src: from });
        }
        S("floatingClass").forEach(function (c) { rule("class", "^" + escapeRe(c) + "$", "floatingClass " + c); rule("instance", "^" + escapeRe(c) + "$", "floatingClass " + c); });
        S("floatingTitle").forEach(function (t) { rule("title", escapeRe(t), "floatingTitle " + t); });
        Object.keys(S("floatingWorkspaces")).forEach(function (n) { rule("workspace", "^" + n + "$", "floatingWorkspaces " + n); });
        S("ignoreClass").forEach(function (c) {
            if (has(OLD_IGNORE_CLASS, c)) return;       // the old default: its kind is built in now
            ignored.push("class " + c);
            rule("class", "^" + escapeRe(c) + "$", "ignoreClass " + c); rule("instance", "^" + escapeRe(c) + "$", "ignoreClass " + c);
        });
        S("ignoreRole").forEach(function (r) {
            if (has(OLD_IGNORE_ROLE, r)) return;
            ignored.push("role " + r);
            rule("window_role", "^" + escapeRe(r) + "$", "ignoreRole " + r);
        });
        return { rules: out, ignored: ignored };
    }

    // Parsed once per text (the settings are re-read on every KWin reconfigure).
    var cache = { key: null, forWindow: null, assign: null, ignored: null };
    function current() {
        var key = JSON.stringify([S("forWindow"), S("assign"), S("floatingClass"), S("floatingTitle"),
                                  S("floatingWorkspaces"), S("ignoreClass"), S("ignoreRole")]);
        if (cache.key !== key) {
            var old = oldRules();
            cache.key = key;
            cache.forWindow = old.rules.concat(parseForWindow(S("forWindow")));
            cache.assign = parseAssign(S("assign"));
            cache.ignored = old.ignored;
        }
        return cache;
    }
    // The user's old ignore entries read as floating rules, for the load report (C).
    function translated() { return current().ignored.slice(); }

    // All of a rule's criteria must match (match.c). ctx: { ws: the workspace number the window
    // is on or opens on (null: unknown), kind: its kind before the rule }.
    function matches(crit, w, ctx) {
        for (var key in crit) {
            var re = crit[key], v;
            if (key === "all") continue;
            if (key === "floating") { if (ctx.kind !== "floating") return false; continue; }
            if (key === "tiling") { if (ctx.kind !== "tiling") return false; continue; }
            if (key === "class") v = w.resourceClass;
            else if (key === "instance") v = w.resourceName;
            else if (key === "title") v = w.caption;
            else if (key === "window_role") v = w.windowRole;
            else if (key === "window_type") v = windowType(w);
            else if (key === "workspace") { if (ctx.ws === null || ctx.ws === undefined) return false; v = ctx.ws; }
            if (!re.test(String(v === undefined || v === null ? "" : v))) return false;
        }
        return true;
    }

    // ---- the verdicts ---------------------------------------------------------------------------

    // The window's kind (A). ctx: { ws: the workspace it is on or opens on, current: its kind in
    // the tree ("tiling"/"floating") for a window already adopted, else null, ran: {} the rules
    // already run on it (by index; i3 runs each rule at most once per window, only to apply it,
    // X2), filled in here }. A window with `current` keeps it unless a rule not yet run matches.
    // The kind of a window kept out of the tree, or null for one that is in it (A1-A5).
    function keptOut(w) {
        if (w.deleted) return "override-redirect";
        var kept = i3Kind(w);
        if (kept) return kept;
        if (!w.normalWindow && !(w.dialog || w.utility || w.toolbar || w.splash || w.notification || w.criticalNotification)) return "override-redirect";
        return null;
    }
    // "sticky": on all virtual desktops (i3's _NET_WM_DESKTOP all, manage.c:486-490: "float it and
    // make it sticky"; redo stage 9): in the tree, floating. The rules run after, as i3's
    // for_window does (run_assignments, manage.c:588): `floating disable` tiles it, which here
    // takes it off all desktops (KWin's tiles belong to one desktop, §3 X4; kwin.js adopts it so);
    // `floating enable` leaves it sticky. ctx.current "sticky" for one in the tree already.
    function classify(w, ctx) {
        ctx = ctx || {};
        var kept = keptOut(w);
        if (kept) return kept;
        // Not while kwin-i3 itself has it on all desktops to carry it across outputs (ctx.crossing,
        // kwin.js relocate): a caption change then floated a tiled window for good (review 2026-10-28).
        var sticky = w.onAllDesktops && !ctx.crossing;
        var kind = sticky ? (ctx.current === "tiling" ? "tiling" : "sticky")
                          : ctx.current === "sticky" ? "floating" : ctx.current || (floatsByDefault(w) ? "floating" : "tiling");
        var ran = ctx.ran || {}, rules = current().forWindow;
        for (var i = 0; i < rules.length; i++) {
            if (ran[i]) continue;
            if (!matches(rules[i].crit, w, { ws: ctx.ws, kind: kind === "sticky" ? "floating" : kind })) continue;
            ran[i] = true;
            kind = rules[i].floating ? (sticky ? "sticky" : "floating") : "tiling";
        }
        return kind;
    }

    // `assign` for a window that just appeared (N12): { workspace: N } or { output: name }, the
    // first rule that matches, else null. The window's kind before rules is what `floating` and
    // `tiling` criteria see (i3 runs assign at manage, before for_window).
    // No kind yet: i3 reads assignments before the con exists (manage.c), so a `floating` or
    // `tiling` criterion never matches in an assign (match.c, window_mode; review 2026-10-28).
    // Both kinds, as i3 applies both: the first matching workspace assignment, then the first
    // matching output one on top of it (manage.c:289, :354; review 2026-10-28). -> null, or
    // { workspace, output } with one or both set.
    function assignFor(w) {
        var rules = current().assign, out = null;
        for (var i = 0; i < rules.length; i++) {
            if (!matches(rules[i].crit, w, { ws: null, kind: null })) continue;
            out = out || {};
            if (rules[i].workspace && !out.workspace) out.workspace = rules[i].workspace;
            if (rules[i].output && !out.output) out.output = rules[i].output;
        }
        return out;
    }

    // i3's floating_minimum_size / floating_maximum_size (N15): "WxH"; 0 means i3's default (75x50
    // for the minimum, all outputs together for the maximum), -1 no limit. -> { w, h } or null.
    function parseSize(text) {
        var m = /^\s*(-?[0-9]+)\s*x\s*(-?[0-9]+)\s*$/.exec(String(text));
        return m && +m[1] >= -1 && +m[2] >= -1 ? { w: +m[1], h: +m[2] } : null;
    }

    return { classify: classify, keptOut: keptOut, i3Kind: i3Kind, managed: managed, assignFor: assignFor, translated: translated,
             parseForWindow: parseForWindow, parseAssign: parseAssign, parseSize: parseSize, windowType: windowType };
})();

if (typeof module !== "undefined") module.exports = Rules;
