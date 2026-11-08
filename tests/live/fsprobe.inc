# Shared by the 90-92 probes: an X11 window "fsx" that asks, once $KI3_TMP/go exists, to move onto
# the other output with _NET_MOVERESIZE_WINDOW (KWin refuses a fullscreen window's plain
# ConfigureRequest, events.cpp:451, but not this). $1: start fullscreen (1) or not (0).
fsx=$KI3_TMP/fsx.py
cat >"$fsx" <<'EOF'
import os, sys, time
from Xlib import X, Xatom, display
from Xlib.protocol import event
d = display.Display(); s = d.screen()
win = s.root.create_window(100, 100, 400, 300, 0, s.root_depth, X.InputOutput, X.CopyFromParent,
                           background_pixel=s.white_pixel, event_mask=X.StructureNotifyMask)
win.set_wm_name("fsx")
win.change_property(d.intern_atom("_NET_WM_NAME"), d.intern_atom("UTF8_STRING"), 8, b"fsx")
if sys.argv[1] == "1":
    win.change_property(d.intern_atom("_NET_WM_STATE"), Xatom.ATOM, 32, [d.intern_atom("_NET_WM_STATE_FULLSCREEN")])
win.map(); d.flush()
while not os.path.exists(sys.argv[2]): time.sleep(0.05)
ev = event.ClientMessage(window=win, client_type=d.intern_atom("_NET_MOVERESIZE_WINDOW"),
                         data=(32, [(1 << 8) | (1 << 9) | (1 << 12), 1280 + 200, 100, 0, 0]))
s.root.send_event(ev, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
d.flush()
while True: d.next_event()
EOF
info() { kjs 'workspace.windowList().forEach(function (w) { if (w.caption === "fsx") log(w.output.name + " desk=" + (w.desktops.length ? workspace.desktops.indexOf(w.desktops[0]) + 1 : "all") + " fs=" + w.fullScreen + " tile=" + (w.tile !== null) + " " + w.frameGeometry.x + "," + w.frameGeometry.y + " " + w.frameGeometry.width + "x" + w.frameGeometry.height); })'; }
fsx_start() { python3 "$fsx" "$1" "$KI3_TMP/go" >/dev/null 2>&1 & poll _has_window fsx; }
fsx_go() {
    echo "    before the request: $(info)"
    touch "$KI3_TMP/go"; sleep 3
    echo "    after the request:  $(info)"
    grep -E 'DESKTOP|OUTPUT|CROSSING|FLOAT' "$KI3_LOG" | sed 's/^/    log: /'
    echo "    trees: 1 $(tree 1) | 2 $(tree 2)"
}
