// Round 4 (headless only), after the review: tile.manage() instead of window.tile=,
// a hidden workspace, and an output change.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
workspace.setCurrentDesktopForScreen(D[0], S[0]);
workspace.setCurrentDesktopForScreen(D[1], S[1]);
function fresh(root) { while (root.tiles.length) root.tiles[root.tiles.length - 1].remove(); root.padding = 0; var t = root.split(1); t.forEach(function (x) { x.padding = 0; }); return root; }
var r1 = fresh(workspace.rootTile(S[0], D[0]));
var r3 = fresh(workspace.rootTile(S[0], D[2]));
log("A manage(a) on shown D1: " + r1.tiles[0].manage(w.a));
log("A manage(c) on shown D1: " + r1.tiles[1].manage(w.c));
// B: wrong desktop first, then right desktop, on hidden D3
log("B manage(b) into D3 while b is on D1: " + r3.tiles[0].manage(w.b));
w.b.desktops = [D[2]];
log("B manage(b) into D3 after desktops=[D3]: " + r3.tiles[0].manage(w.b));
// window.tile= once, to see the deprecation message in kwin.out
w.d.tile = r1.tiles[1];
log("round4 write done");
