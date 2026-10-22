// Round 2 (headless only): sibling insert, padding 0, resizeByPixels, desktop change with a tile.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
var root = workspace.rootTile(S[0], D[0]);
while (root.tiles.length) root.tiles[root.tiles.length - 1].remove();
function zero(t) { t.padding = 0; for (var i = 0; i < t.tiles.length; i++) zero(t.tiles[i]); }
var two = root.split(1);
w.a.tile = root.tiles[0]; w.b.tile = root.tiles[1];
// Sibling: split b's tile in the SAME direction as its parent.
var r = root.tiles[1].split(1);
log("split(H) of a leaf in an H parent returned " + r.length + "; root now has " + root.tiles.length + " children");
w.c.tile = root.tiles[root.tiles.length - 1];
zero(root);
// Resize: grow a's tile 100 px at its right edge (Qt::RightEdge = 4).
root.tiles[0].resizeByPixels(100, 4);
// Move d to desktop 3 while it holds a tile on desktop 1.
var sideD = root.tiles[1].split(2);
w.d.tile = root.tiles[1].tiles[1];
w.d.desktops = [D[2]];
log("round2 done");
