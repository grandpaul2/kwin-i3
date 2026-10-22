function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
function rr(g) { return [g.x, g.y, g.width, g.height].map(function (v) { return Math.round(v * 1000) / 1000; }).join(","); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
var root = workspace.rootTile(S[0], D[0]);
log("1 a frame=[" + r(w.a.frameGeometry) + "] tile=" + (w.a.tile ? rr(w.a.tile.relativeGeometry) : "null") + " root.windows=" + root.windows.length);
// 2: three children, then set sizes 0.5/0.3/0.2 by relativeGeometry
root.unmanage(w.a);
var t = root.split(1);
root.tiles[1].split(1);
log("2 children=" + root.tiles.length + " rel=" + root.tiles.map(function (x) { return rr(x.relativeGeometry); }).join(" | "));
var shares = [0.5, 0.3, 0.2], x = 0, sig = 0;
root.tiles.forEach(function (c) { c.relativeGeometryChanged.connect(function () { sig++; }); });
for (var i = 0; i < 3; i++) {
    var g = root.tiles[i].relativeGeometry;
    root.tiles[i].relativeGeometry = { x: x, y: 0, width: shares[i], height: 1 };
    x += shares[i];
    log("2 after setting child " + i + ": " + root.tiles.map(function (c) { return rr(c.relativeGeometry); }).join(" | "));
}
log("2 relativeGeometryChanged signals: " + sig);
