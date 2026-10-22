// Spike, headless test KWin only: can a script build an i3 tree out of KWin tiles,
// per screen *and* per desktop, and do windows follow?
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
function dump(t, depth) {
    log("  ".repeat(depth) + (t.isLayout ? "layout dir=" + t.layoutDirection : "leaf") + " [" + r(t.absoluteGeometry) + "] windows=" + t.windows.map(function (w) { return w.caption; }).join("|"));
    for (var i = 0; i < t.tiles.length; i++) dump(t.tiles[i], depth + 1);
}
function clear(root) { while (root.tiles.length) root.tiles[root.tiles.length - 1].remove(); }

var S = workspace.screens, D = workspace.desktops;
var wins = workspace.windowList().filter(function (w) { return w.normalWindow; });
wins.sort(function (a, b) { return a.caption < b.caption ? -1 : 1; });
log("windows: " + wins.map(function (w) { return w.caption + "@" + w.output.name; }).join(", "));

// Screen 0 shows desktop 1, screen 1 shows desktop 2.
workspace.setCurrentDesktopForScreen(D[0], S[0]);
workspace.setCurrentDesktopForScreen(D[1], S[1]);
log("S0 shows " + workspace.currentDesktopForScreen(S[0]).name + ", S1 shows " + workspace.currentDesktopForScreen(S[1]).name);

var root0 = workspace.rootTile(S[0], D[0]);
var root1 = workspace.rootTile(S[1], D[1]);
clear(root0); clear(root1);
log("after clear: root0 tiles=" + root0.tiles.length + " isLayout=" + root0.isLayout + " dir=" + root0.layoutDirection);

// Test 1: i3 "a | b" on S0/D1, then "split v" on b, c under b.
var halves = root0.split(1);   // Horizontal
log("root0.split(H) returned " + (halves ? halves.length : "null") + "; root0 tiles=" + root0.tiles.length);
dump(root0, 1);
var a = wins[0], b = wins[1], c = wins[2], d = wins[3];
a.desktops = [D[0]]; b.desktops = [D[0]]; c.desktops = [D[0]];
a.tile = root0.tiles[0];
b.tile = root0.tiles[1];
var bv = root0.tiles[1].split(2);   // Vertical, inside b's tile
log("b.split(V) returned " + (bv ? bv.length : "null"));
c.tile = root0.tiles[1].tiles[1];
// Test 2: a window on S1/D2's tree.
workspace.sendClientToScreen(d, S[1]);
d.desktops = [D[1]];
var dh = root1.split(1);
d.tile = root1.tiles[0];

log("write done");
