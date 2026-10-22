// Round 5 (headless only): details the adapter depends on.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
function rr(g) { return [g.x, g.y, g.width, g.height].map(function (v) { return Math.round(v * 1000) / 1000; }).join(","); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
var root = workspace.rootTile(S[0], D[0]);
while (root.tiles.length) root.tiles[root.tiles.length - 1].remove();
root.padding = 0;
// 1: a root with no children holding a window
log("1 manage a into childless root: " + root.manage(w.a));
// 3: root layoutDirection writable
log("3 root dir before=" + root.layoutDirection);
root.layoutDirection = 2;
log("3 root dir after set 2=" + root.layoutDirection);
root.layoutDirection = 1;
// 5: activeWindow set
workspace.activeWindow = w.b;
log("5 active after set b: " + (workspace.activeWindow ? workspace.activeWindow.caption : "null"));
// registerShortcut for (4)
registerShortcut("kwin-i3 Probe", "kwin-i3: probe", "Meta+Ctrl+Alt+F12", function () { log("4 shortcut fired"); });
log("round5 setup done");
