// Round 3 (headless only): an X11 window in a tile; fullscreen and maximize of a tiled window.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption.slice(0, 1)] = x; });
log("windows: " + Object.keys(w).map(function (k) { return k + (w[k].x11 ? "(X11)" : "(wl)") + "=" + w[k].caption.slice(0,15); }).join(", "));
var root = workspace.rootTile(S[0], D[0]);
while (root.tiles.length) root.tiles[root.tiles.length - 1].remove();
root.split(1);
root.tiles[0].padding = 0; root.tiles[1].padding = 0;
w.a.tile = root.tiles[0];
w.x.tile = root.tiles[1];
log("set tiles");
