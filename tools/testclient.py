#!/usr/bin/env python3
"""A GTK 4 window for the live tests, able to be the awkward kinds Alacritty can't.

  testclient.py --title T [--size WxH] [--min WxH] [--fixed] [--dialog]
                [--map-delay SECONDS] [--retitle SECONDS:NEWTITLE] [--app-id ID]

--min       minimum size (GTK's size request), for windows bigger than their tile
--fixed     not resizable (Krohnkite floated these; so will kwin-i3)
--dialog    also open a modal dialog transient for the window, titled "<T> dialog"
            (on Wayland a transient must come from the same process)
--map-delay show the window only after this long, like a slow app
--retitle   change the title after this long, like the stage's Xephyr or a browser
--app-id    the Wayland app id, which KWin reports as the window class (for the ignore rules)
--clicks    append every raw button press/release the window receives to FILE ("press 1",
            "release 3"), so a test can tell which clicks KWin passed on

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
    p.add_argument("--app-id")
    p.add_argument("--clicks")
    a = p.parse_args()

    if a.app_id:
        GLib.set_prgname(a.app_id)          # GTK uses it as the xdg_toplevel app id
    app = Gtk.Application(application_id=None)

    def activate(app):
        win = Gtk.ApplicationWindow(application=app, title=a.title)
        win.set_default_size(*a.size)
        win.set_child(Gtk.Label(label=a.title))
        if a.min:
            win.get_child().set_size_request(*a.min)
        if a.fixed:
            win.set_resizable(False)
        if a.clicks:
            def note(what):
                with open(a.clicks, "a") as f:
                    f.write(what + "\n")
            # A click gesture, any button. (EventControllerLegacy's "event" reaches Python as None.)
            # "unpaired-release" is a release whose press this window never saw.
            g = Gtk.GestureClick(button=0, propagation_phase=Gtk.PropagationPhase.CAPTURE)
            g.connect("pressed", lambda g, n, x, y: note("press %d" % g.get_current_button()))
            g.connect("released", lambda g, n, x, y: note("release %d" % g.get_current_button()))
            g.connect("unpaired-release", lambda g, x, y, b, s: note("unpaired-release %d" % b))
            win.add_controller(g)

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
