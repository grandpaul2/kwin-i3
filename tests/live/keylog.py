#!/usr/bin/env python3
# Probe client: a window that appends every key press and release it receives to a file.
import sys, gi
gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, GLib
title, path = sys.argv[1], sys.argv[2]
def on_activate(app):
    w = Gtk.ApplicationWindow(application=app, title=title)
    w.set_default_size(400, 300)
    c = Gtk.EventControllerKey()
    def log(kind, keyval, state):
        with open(path, "a") as f:
            f.write(f"{title} {kind} {Gtk.accelerator_name(keyval, state)}\n")
    c.connect("key-pressed", lambda _c, kv, kc, st: (log("press", kv, st), False)[1])
    c.connect("key-released", lambda _c, kv, kc, st: log("release", kv, st))
    w.add_controller(c)
    w.present()
app = Gtk.Application(application_id=None)
app.connect("activate", on_activate)
app.run([])
