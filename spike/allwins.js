function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
workspace.windowList().forEach(function (w) { log("w '" + w.caption + "' class=" + w.resourceClass + " x11=" + w.x11 + " normal=" + w.normalWindow + " managed=" + w.managed); });
log("count " + workspace.windowList().length);
