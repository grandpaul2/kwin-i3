#!/usr/bin/env python3
# A stand-in notification server for the test KWin's private bus (tests/live/35-taken-keys.sh):
# prints every Notify call, one line each, after READY.
import sys, dbus, dbus.service, dbus.mainloop.glib
from gi.repository import GLib
dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
class N(dbus.service.Object):
    @dbus.service.method("org.freedesktop.Notifications", in_signature="susssasa{sv}i", out_signature="u")
    def Notify(self, app, rid, icon, summary, body, actions, hints, timeout):
        print("NOTIFY", repr(str(app)), repr(str(summary)), repr(str(body)), list(map(str, actions)), dict(hints), int(timeout), flush=True)
        return 7
    @dbus.service.method("org.freedesktop.Notifications", out_signature="as")
    def GetCapabilities(self): return ["body"]
    @dbus.service.method("org.freedesktop.Notifications", out_signature="ssss")
    def GetServerInformation(self): return ("fake", "x", "1", "1.2")
bus = dbus.SessionBus()
name = dbus.service.BusName("org.freedesktop.Notifications", bus)
N(bus, "/org/freedesktop/Notifications")
print("READY", flush=True)
GLib.MainLoop().run()
