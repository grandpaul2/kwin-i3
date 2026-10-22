function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
var root0 = workspace.rootTile(workspace.screens[0], workspace.desktops[0]);
root0.tiles[1].tiles[1].remove();
log("removed c's tile");
