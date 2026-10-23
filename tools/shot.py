#!/usr/bin/env python3
"""Screenshots of a KWin output over D-Bus (org.kde.KWin.ScreenShot2), for the live tests.

  shot.py capture <output-name> <file.png>       e.g. Virtual-0; what KWin would show now
  shot.py probe <file.png> <x> <y>               prints "r,g,b" of that pixel
  shot.py same <file.png> <x> <y> <r,g,b> [tol]  exit 0 if the pixel is that colour (+-tol, default 24)

KWin answers only callers it trusts; the test KWin runs with KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1
(tools/testkwin.sh). The capture renders through the effect chain, so it shows what an effect is
drawing (docs/spec-atomic-layout.md, test 1).
"""
import os, sys

import dbus


def capture(output, path):
    from PIL import Image
    bus = dbus.SessionBus()
    obj = bus.get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2")
    iface = dbus.Interface(obj, "org.kde.KWin.ScreenShot2")
    r, w = os.pipe()
    fd = dbus.types.UnixFd(w)
    os.close(w)
    attrs = iface.CaptureScreen(output, {"native-resolution": True}, fd)
    width, height, stride = int(attrs["width"]), int(attrs["height"]), int(attrs["stride"])
    fmt = int(attrs["format"])
    data = b""
    with os.fdopen(r, "rb") as f:
        while len(data) < stride * height:
            chunk = f.read(stride * height - len(data))
            if not chunk:
                break
            data += chunk
    if fmt not in (4, 5, 6):                    # QImage RGB32, ARGB32, ARGB32_Premultiplied
        sys.exit("shot: unexpected image format %d" % fmt)
    img = Image.frombuffer("RGBA", (width, height), data, "raw", "BGRA", stride, 1)
    img.convert("RGB").save(path)


def pixel(path, x, y):
    from PIL import Image
    with Image.open(path) as img:
        return img.convert("RGB").getpixel((int(x), int(y)))


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "capture":
        capture(a[1], a[2])
    elif a[0] == "probe":
        print("%d,%d,%d" % pixel(a[1], a[2], a[3]))
    elif a[0] == "same":
        got = pixel(a[1], a[2], a[3])
        want = tuple(int(v) for v in a[4].split(","))
        tol = int(a[5]) if len(a) > 5 else 24
        ok = all(abs(g - w) <= tol for g, w in zip(got, want))
        if not ok:
            print("pixel %s,%s is %d,%d,%d, wanted %s" % (a[2], a[3], *got, a[4]))
        sys.exit(0 if ok else 1)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
