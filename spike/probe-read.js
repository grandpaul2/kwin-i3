// Read-only: print every screen's tile tree for every desktop. Changes nothing.
function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
function dump(t, depth) {
    var g = t.absoluteGeometry;
    var line = "  ".repeat(depth) + (t.isLayout ? "layout dir=" + t.layoutDirection : "leaf") +
        " [" + Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height) + "]" +
        " windows=" + t.windows.length + " pad=" + t.padding;
    log("" + line);
    for (var i = 0; i < t.tiles.length; i++) dump(t.tiles[i], depth + 1);
}
var s = workspace.screens;
for (var i = 0; i < s.length; i++) {
    log("screen " + s[i].name + " shows " + workspace.currentDesktopForScreen(s[i]).name);
    for (var d = 0; d < 3; d++) {
        var desk = workspace.desktops[d];
        var r = workspace.rootTile(s[i], desk);
        log(" " + desk.name + ": root=" + (r ? "yes" : "null"));
        if (r) dump(r, 2);
    }
}
var ws = workspace.windowList();
for (var j = 0; j < ws.length; j++) if (ws[j].normalWindow)
    log("win " + ws[j].caption.slice(0, 30) + " tile=" + (ws[j].tile ? "yes" : "null"));
