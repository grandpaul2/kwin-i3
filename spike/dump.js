// Read-only: every screen's tree for desktops 1-3, and every normal window.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function r(g) { return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }
function dump(t, depth) {
    log("  ".repeat(depth) + (t.isLayout ? "layout dir=" + t.layoutDirection : "leaf") + " [" + r(t.absoluteGeometry) + "] windows=" + t.windows.map(function (w) { return w.caption; }).join("|"));
    for (var i = 0; i < t.tiles.length; i++) dump(t.tiles[i], depth + 1);
}
log("--- dump");
var S = workspace.screens;
for (var i = 0; i < S.length; i++) {
    log(S[i].name + " shows " + workspace.currentDesktopForScreen(S[i]).name);
    for (var d = 0; d < 3; d++) { log(" " + workspace.desktops[d].name); dump(workspace.rootTile(S[i], workspace.desktops[d]), 2); }
}
workspace.windowList().filter(function (w) { return w.normalWindow; }).forEach(function (w) {
    log("win " + w.caption + " on " + w.output.name + " desk=" + w.desktops.map(function (x) { return x.name; }) + " frame=[" + r(w.frameGeometry) + "] tile=" + (w.tile ? "[" + r(w.tile.absoluteGeometry) + "]" : "null"));
});
