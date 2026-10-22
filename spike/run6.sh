#!/usr/bin/env bash
source ../tests/live/lib.sh
client --title a; sleep 2
kjs '
var w = workspace.windowList().filter(function (x) { return x.normalWindow; })[0];
["interactiveMoveResizeStarted","interactiveMoveResizeFinished","maximizedChanged","minimizedChanged","fullScreenChanged","desktopsChanged","outputChanged","tileChanged","readyForPaintingChanged","captionChanged","transientChanged","windowClassChanged","moveResizedChanged","activeChanged"].forEach(function (s) { log("window." + s + ": " + (w[s] && typeof w[s].connect === "function")); });
["windowAdded","windowRemoved","windowActivated","currentDesktopChanged","screensChanged","desktopsChanged"].forEach(function (s) { log("workspace." + s + ": " + (workspace[s] && typeof workspace[s].connect === "function")); });
log("QTimer: " + typeof QTimer);
var t = new QTimer(); t.singleShot = true; t.interval = 0; t.timeout.connect(function () { log("timer fired"); }); t.start();
log("maximizeMode=" + w.maximizeMode + " minSize=" + w.minSize.width + "x" + w.minSize.height + " readyForPainting=" + w.readyForPainting + " internalId=" + w.internalId);
'
sleep 0.5; grep -c "timer fired" "$KI3_LOG"
