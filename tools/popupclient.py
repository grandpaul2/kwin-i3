#!/usr/bin/env python3
"""A stand-in for a Plasma panel popup, for the live tests (docs/spec-popup-grace.md): an X11
window typed _KDE_NET_WM_WINDOW_TYPE_APPLET_POPUP, which KWin classes as an applet popup
(Window::isAppletPopup; x11window.cpp supports NET::AppletPopupMask). The test KWins have no
Plasma panel to open a real one. Runs until killed.
  popupclient.py --title p --geometry 300x200+100+400
"""
import argparse
from Xlib import X, Xatom, display

p = argparse.ArgumentParser()
p.add_argument("--title", default="popup")
p.add_argument("--geometry", default="300x200+100+400")
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
win.change_property(d.intern_atom("_NET_WM_WINDOW_TYPE"), Xatom.ATOM, 32,
                    [d.intern_atom("_KDE_NET_WM_WINDOW_TYPE_APPLET_POPUP")])
win.set_wm_hints(flags=1, input=1)          # InputHint: it takes the keyboard focus, as a popup does
win.set_wm_normal_hints(flags=1 | 4, x=x, y=y)   # USPosition, PPosition: where it was asked
win.map()
d.flush()
while True:
    d.next_event()
