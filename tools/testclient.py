#!/usr/bin/env python3
"""A GTK 4 window for the live tests, able to be the awkward kinds Alacritty can't.

  testclient.py --title T [--size WxH] [--min WxH] [--fixed] [--dialog]
                [--map-delay SECONDS] [--retitle SECONDS:NEWTITLE]

--min       minimum size (GTK's size request), for windows bigger than their tile
--fixed     not resizable (Krohnkite floated these; so will kwin-i3)
--dialog    also open a modal dialog transient for the window, titled "<T> dialog"
            (on Wayland a transient must come from the same process)
--map-delay show the window only after this long, like a slow app
--retitle   change the title after this long, like the stage's Xephyr or a browser

Runs until killed. Software rendering, so it works in the headless test KWin.
"""
import argparse, os, sys

os.environ.setdefault("GSK_RENDERER", "cairo")
import gi
gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, GLib


def size(s):
    w, h = s.lower().split("x")
    return int(w), int(h)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--title", required=True)
    p.add_argument("--size", type=size, default=(400, 300))
    p.add_argument("--min", type=size)
    p.add_argument("--fixed", action="store_true")
    p.add_argument("--dialog", action="store_true")
    p.add_argument("--map-delay", type=float, default=0)
    p.add_argument("--retitle")
    a = p.parse_args()

    app = Gtk.Application(application_id=None)

    def activate(app):
        win = Gtk.ApplicationWindow(application=app, title=a.title)
        win.set_default_size(*a.size)
        win.set_child(Gtk.Label(label=a.title))
        if a.min:
            win.get_child().set_size_request(*a.min)
        if a.fixed:
            win.set_resizable(False)

        def show():
            win.present()
            if a.dialog:
                d = Gtk.Window(title=a.title + " dialog", transient_for=win, modal=True)
                d.set_default_size(200, 100)
                d.set_child(Gtk.Label(label="dialog"))
                d.present()
            if a.retitle:
                secs, new = a.retitle.split(":", 1)
                GLib.timeout_add(int(float(secs) * 1000), lambda: (win.set_title(new), False)[1])
            return False

        if a.map_delay:
            GLib.timeout_add(int(a.map_delay * 1000), show)
        else:
            show()

    app.connect("activate", activate)
    app.run([sys.argv[0]])


if __name__ == "__main__":
    main()
