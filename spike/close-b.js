function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", s); }
workspace.windowList().forEach(function (x) { if (x.caption === "b") x.closeWindow(); });
log("closed b");
