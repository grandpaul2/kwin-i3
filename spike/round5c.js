function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
var root = workspace.rootTile(workspace.screens[0], workspace.desktops[0]);
function rr(g) { return [g.x, g.y, g.width, g.height].map(function (v) { return Math.round(v * 1000) / 1000; }).join(","); }
// 2b: set sizes in reverse order, to see whether order matters
var shares = [0.2, 0.3, 0.5], xs = [0, 0.2, 0.5];
for (var i = 2; i >= 0; i--) root.tiles[i].relativeGeometry = { x: xs[i], y: 0, width: shares[i], height: 1 };
log("2b reverse-order set: " + root.tiles.map(function (c) { return rr(c.relativeGeometry); }).join(" | "));
