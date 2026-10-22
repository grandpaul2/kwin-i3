function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
var w = {}; workspace.windowList().forEach(function (x) { if (x.normalWindow) w[x.caption.slice(0, 1)] = x; });
if (typeof PHASE === "undefined") {}
var a = w.a;
if (!a.fullScreen) { a.fullScreen = true; log("a fullscreen on"); }
