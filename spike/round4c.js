function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
var S = workspace.screens, D = workspace.desktops;
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption] = x; });
function show(tag) { ["a","b","c","d"].forEach(function (k) { var x = w[k]; log(tag + " " + k + " on " + x.output.name + " desk=" + x.desktops.map(function (q) { return q.name; }) + " frame=[" + r(x.frameGeometry) + "] tile=" + (x.tile ? "[" + r(x.tile.absoluteGeometry) + "]" : "null")); }); }
show("after-c-move");
workspace.setCurrentDesktopForScreen(D[2], S[0]);
log("S0 now shows " + workspace.currentDesktopForScreen(S[0]).name);
