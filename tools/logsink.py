#!/usr/bin/env python3
"""Receive log lines from a KWin script over the session bus and append them to a file.

KWin drops print() from scripts unless the kwin_scripting logging category is on, and turning
it on needs a KWin restart. So scripts call:
    callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", line)
Usage: logsink.py <file> [bus name]   (runs until killed; run it under `timeout`)
The default name is the test log's; tools/capture passes net.local.kwini3.dump.
"""
import sys, time
import dbus, dbus.service, dbus.mainloop.glib
from gi.repository import GLib

NAME = sys.argv[2] if len(sys.argv) > 2 else "net.local.kwini3.log"

class Sink(dbus.service.Object):
    def __init__(self, bus, out):
        super().__init__(bus, "/")
        self.out = out

    @dbus.service.method(NAME, in_signature="s", out_signature="")
    def Log(self, line):
        stamp = time.strftime("%H:%M:%S ")
        with open(self.out, "a") as f:          # one call may carry several lines
            f.writelines(stamp + l + "\n" for l in line.split("\n"))

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName(NAME, bus, do_not_queue=True)
Sink(bus, sys.argv[1])
GLib.MainLoop().run()
