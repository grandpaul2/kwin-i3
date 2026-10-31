#!/usr/bin/env python3
"""Stand-ins for the windows Plasma shows that kwin-i3 doesn't manage, for the live tests: an X11
window of a given type, as KWin classes it (x11window.cpp's supported types). By default a panel
popup, _KDE_NET_WM_WINDOW_TYPE_APPLET_POPUP (Window::isAppletPopup);
--type tooltip, notification, osd, dialog, desktop (Plasma's desktop, the wallpaper's window). The test KWins have no Plasma shell to show real ones.
Runs until killed.
  popupclient.py --title p --geometry 300x200+100+400 [--type tooltip] [--no-input]
"""
import argparse
from Xlib import X, Xatom, display

p = argparse.ArgumentParser()
p.add_argument("--title", default="popup")
p.add_argument("--geometry", default="300x200+100+400")
p.add_argument("--type", default="popup", choices=["popup", "tooltip", "notification", "osd", "dialog", "desktop"])
p.add_argument("--no-input", action="store_true", help="never takes the keyboard (a tooltip, an OSD)")
a = p.parse_args()
size, _, pos = a.geometry.partition("+")
w, h = (int(v) for v in size.split("x"))
x, y = (int(v) for v in pos.split("+"))

d = display.Display()
s = d.screen()
win = s.root.create_window(x, y, w, h, 0, s.root_depth, X.InputOutput, X.CopyFromParent,
                           background_pixel=s.white_pixel,
                           event_mask=X.ExposureMask | X.KeyPressMask | X.StructureNotifyMask)
win.set_wm_name(a.title)
win.change_property(d.intern_atom("_NET_WM_NAME"), d.intern_atom("UTF8_STRING"), 8, a.title.encode())
TYPES = {"popup": "_KDE_NET_WM_WINDOW_TYPE_APPLET_POPUP", "tooltip": "_NET_WM_WINDOW_TYPE_TOOLTIP",
         "notification": "_NET_WM_WINDOW_TYPE_NOTIFICATION", "osd": "_KDE_NET_WM_WINDOW_TYPE_ON_SCREEN_DISPLAY",
         "dialog": "_NET_WM_WINDOW_TYPE_DIALOG", "desktop": "_NET_WM_WINDOW_TYPE_DESKTOP"}
win.change_property(d.intern_atom("_NET_WM_WINDOW_TYPE"), Xatom.ATOM, 32, [d.intern_atom(TYPES[a.type])])
win.set_wm_hints(flags=1, input=0 if a.no_input else 1)   # InputHint: whether it takes the keyboard
win.set_wm_normal_hints(flags=1 | 4, x=x, y=y)   # USPosition, PPosition: where it was asked
win.map()
d.flush()
while True:
    d.next_event()
