// Built by build.sh from src/ — do not edit; edit src/ and rebuild.
// ---- src/log.js
// Logging. KWin drops print() from scripts on this machine (the kwin_scripting category is off),
// so lines go over D-Bus to tools/logsink.py when [Script-kwin-i3] debugLog=true. Silent otherwise:
// if nothing owns the name, the call fails quietly.
var DEBUG_LOG = readConfig("debugLog", false) === true || readConfig("debugLog", "") === "true";

function log(line) {
    if (!DEBUG_LOG) return;
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", String(line));
}
// ---- src/tree.js
// The i3 tree: containers, leaves, focus stack, and every operation on them. No KWin calls here,
// so node can load and test this file directly (tests/unit). Filled in by phase 1.

var Tree = {};

if (typeof module !== "undefined") module.exports = Tree;
// ---- src/main.js
// Entry point: runs last, after every other src/ file is defined.
log("kwin-i3 loaded");
