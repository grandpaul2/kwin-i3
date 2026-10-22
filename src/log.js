// Logging. KWin drops print() from scripts on this machine (the kwin_scripting category is off),
// so lines go over D-Bus to tools/logsink.py when [Script-kwin-i3] debugLog=true. Silent otherwise:
// if nothing owns the name, the call fails quietly.
// The last LOG_KEEP lines are kept in memory either way, for "Dump State" (tools/capture).
var DEBUG_LOG = readConfig("debugLog", false) === true || readConfig("debugLog", "") === "true";
var LOG_KEEP = 300;
var logRing = [];

function log(line) {
    logRing.push(new Date().toTimeString().slice(0, 8) + " " + String(line).slice(0, 500));   // captions can be URLs
    if (logRing.length > LOG_KEEP) logRing.shift();
    if (!DEBUG_LOG) return;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", String(line));
}
