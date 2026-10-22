#!/usr/bin/env python3
"""Send real pointer and keyboard input into the test KWin (tools/testkwin.sh only).

  inject.py 'abs 640 360' 'btn left down' 'abs 900 360' 'btn left up'
  echo 'key 125 down' | inject.py -

Asks the test KWin for a libei connection (org.kde.KWin.EIS.RemoteDesktop.connectToEIS) and runs
tools/bin/ei-send on it. KWin keeps the connection only while the D-Bus client that asked for it
stays on the bus, so this process stays until ei-send is done. Commands: see tools/ei-send.c.

Refuses to run against the real session: the bus must be a private one (testkwin.sh sets
KI3_INNER and a /tmp bus address).
"""
import os, subprocess, sys
import dbus

if os.environ.get("KI3_INNER") != "1" or "/tmp/dbus-" not in os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""):
    sys.exit("inject.py: only inside tools/testkwin.sh (this would type into the real desktop)")

here = os.path.dirname(os.path.abspath(__file__))
sender = os.path.join(here, "bin", "ei-send")
if not os.path.exists(sender):
    sys.exit("inject.py: tools/bin/ei-send is missing: run make tools")

cmds = sys.stdin.read().splitlines() if sys.argv[1:] == ["-"] else sys.argv[1:]

bus = dbus.SessionBus()
eis = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop"),
                     "org.kde.KWin.EIS.RemoteDesktop")
fd, cookie = eis.connectToEIS(1 | 2)          # keyboard | pointer (KWin's portal flags)
fd = fd.take()
try:
    p = subprocess.Popen([sender, str(fd)], pass_fds=[fd], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, text=True)
    if p.stdout.readline().strip() != "ready":
        p.wait(); sys.exit("inject.py: ei-send never became ready")
    for c in cmds:
        p.stdin.write(c + "\n"); p.stdin.flush()
        if p.stdout.readline().strip() != "ok":
            p.wait(); sys.exit(f"inject.py: failed at: {c}")
    p.stdin.close()
    sys.exit(p.wait())
finally:
    try: eis.disconnect(cookie)
    except dbus.DBusException: pass
