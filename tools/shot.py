#!/usr/bin/env python3
"""Screenshots of a KWin output over D-Bus (org.kde.KWin.ScreenShot2), for the live tests.

  shot.py capture <output-name> <file.png>       e.g. Virtual-0; what KWin would show now
  shot.py probe <file.png> <x> <y> [<x> <y>...]  prints "r,g,b" of each pixel, space-separated
  shot.py same <file.png> <x> <y> <r,g,b> [tol]  exit 0 if the pixel is that colour (+-tol, default 24)

KWin answers only callers it trusts; the test KWin runs with KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1
(tools/testkwin.sh). The capture renders through the effect chain, so it shows what an effect is
drawing.

A probe is a process start, two imports and a PNG decode (~45 ms): a test reading many pixels of
one capture asks for them in one probe (78-rounded-corners read 734 one at a time, 44 s).
"""
import os, sys


def capture(output, path):
    import dbus                                 # only here: a probe needs no bus
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
    # QImage RGB32, ARGB32, ARGB32_Premultiplied (KWin 6.7) are B,G,R,A in memory;
    # RGBX8888, RGBA8888, RGBA8888_Premultiplied (KWin 6.8) are R,G,B,A.
    order = {4: "BGRA", 5: "BGRA", 6: "BGRA", 16: "RGBA", 17: "RGBA", 18: "RGBA"}.get(fmt)
    if order is None:
        sys.exit("shot: unexpected image format %d" % fmt)
    img = Image.frombuffer("RGBA", (width, height), data, "raw", order, stride, 1)
    img.convert("RGB").save(path)


def pixels(path, coords):
    """Coordinates are logical, as the scenarios' geometry is; the capture is native, so with
    KI3_SCALE (tools/testkwin.sh) each reads the middle of the pixels its logical pixel covers."""
    from PIL import Image
    s = float(os.environ.get("KI3_SCALE", "1"))
    with Image.open(path) as img:
        rgb = img.convert("RGB")
        return [rgb.getpixel((int((int(x) + 0.5) * s), int((int(y) + 0.5) * s))) for x, y in coords]


def pixel(path, x, y):
    return pixels(path, [(x, y)])[0]


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "capture":
        capture(a[1], a[2])
    elif a[0] == "probe":
        xy = a[2:]
        if not xy or len(xy) % 2:
            sys.exit(__doc__)
        print(" ".join("%d,%d,%d" % p for p in pixels(a[1], zip(xy[0::2], xy[1::2]))))
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
