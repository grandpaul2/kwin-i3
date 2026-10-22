function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
["b"].forEach(function (k) { var x = w[k]; log("D3-shown " + k + " frame=[" + r(x.frameGeometry) + "] tile=" + (x.tile ? "[" + r(x.tile.absoluteGeometry) + "]" : "null")); });
