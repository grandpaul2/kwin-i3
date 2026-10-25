// The workspace widget's logic (docs/spec-workspace-widget.md): from Plasma's data, which
// workspaces to show, the monitor each lives on, and its windows. Plain JS, no QML: main.qml
// imports it, and tests/unit/widget.test.js loads it in node.
//
// Input, as main.qml gathers it from Plasma's task manager:
//   desktops:  [id, ...]                    workspace N is desktops[N - 1] (kwin-i3's rule)
//   names:     [name, ...]                  the desktops' names, same order
//   screens:   [{ name, x, y, width, height }]
//   shown:     { screenName: desktopId }    what each monitor shows (per-monitor desktops)
//   windows:   [{ desktops: [id], onAll, x, y, width, height, active }]
// Output: one entry per workspace in use, by number:
//   { num, id, name, screen, width, height, windows: [{ x, y, width, height, active }] (fractions
//     of the monitor), shown, focused }

function overlap(a, b) {
    var w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    var h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
}

function clamp(v) { return Math.max(0, Math.min(1, v)); }

// The monitor a workspace lives on: the one showing it; else the one most of its windows' area is
// on (with per-monitor desktops a workspace's windows are on its monitor); else the first.
function monitorOf(id, screens, shown, wins) {
    for (var i = 0; i < screens.length; i++)
        if (shown[screens[i].name] === id) return screens[i];
    var best = null, bestArea = 0;
    screens.forEach(function (s) {
        var area = 0;
        wins.forEach(function (w) { area += overlap(w, s); });
        if (area > bestArea) { best = s; bestArea = area; }
    });
    return best || screens[0] || null;
}

// Workspaces in use (i3bar's rule, decision 2): windows on it, or shown on a monitor. Windows on
// all desktops belong to none (kwin-i3 manages none of them).
function workspaces(d) {
    var out = [];
    var shownIds = {};
    Object.keys(d.shown).forEach(function (s) { shownIds[d.shown[s]] = s; });
    var activeWin = d.windows.filter(function (w) { return w.active && !w.onAll; })[0] || null;
    d.desktops.forEach(function (id, i) {
        var wins = d.windows.filter(function (w) { return !w.onAll && w.desktops.indexOf(id) >= 0; });
        var isShown = shownIds[id] !== undefined;
        if (!wins.length && !isShown) return;
        var mon = monitorOf(id, d.screens, d.shown, wins);
        if (!mon) return;
        var focused = isShown && (activeWin ? activeWin.desktops.indexOf(id) >= 0 : false);
        out.push({
            num: i + 1, id: id, name: (d.names && d.names[i]) || String(i + 1),
            screen: mon.name, width: mon.width, height: mon.height,
            windows: wins.map(function (w) {
                var x0 = clamp((w.x - mon.x) / mon.width), y0 = clamp((w.y - mon.y) / mon.height);
                var x1 = clamp((w.x + w.width - mon.x) / mon.width), y1 = clamp((w.y + w.height - mon.y) / mon.height);
                return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, active: !!w.active };
            }).filter(function (r) { return r.width > 0 && r.height > 0; }),
            shown: isShown, focused: focused,
        });
    });
    // With no active window, the focused monitor's workspace is unknown: none is marked focused.
    return out;
}

// The workspace a scroll goes to (decision 5): the next or previous one in use, from the focused
// one (else the first shown), wrapping as i3bar does. null with nothing to go to.
function step(list, dir) {
    if (!list.length) return null;
    var at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].focused) at = i;
    if (at < 0) for (var j = 0; j < list.length; j++) if (list[j].shown) { at = j; break; }
    if (at < 0) return list[0].num;
    return list[(at + (dir > 0 ? 1 : list.length - 1)) % list.length].num;
}

if (typeof module !== "undefined") module.exports = { workspaces: workspaces, step: step, monitorOf: monitorOf };
