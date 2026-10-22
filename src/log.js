// Logging. KWin drops print() from scripts on this machine (the kwin_scripting category is off),
// so lines go over D-Bus to tools/logsink.py when [Script-kwin-i3] debugLog=true. Silent otherwise:
// if nothing owns the name, the call fails quietly.
var DEBUG_LOG = readConfig("debugLog", false) === true || readConfig("debugLog", "") === "true";

function log(line) {
    if (!DEBUG_LOG) return;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", String(line));
}
