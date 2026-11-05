#!/usr/bin/env python3
"""Play a video script into the test KWin (tools/video/stage.sh runs it; see tools/video/README.md).

  play.py SCRIPT TIMELINE T0

Real input through one libei connection held for the whole script (tools/inject.py opens one per
call, too slow for keys timed to captions). Each step is written to TIMELINE as
"ms<TAB>kind<TAB>text", ms counted from T0 (the epoch time the recording started).

Script lines (a line starting with # is a comment):
  say TEXT                         a caption, shown until the next one (say alone clears it),
                                   held long enough to read (read_time); a step's own caption
                                   likewise shows that long before its action
  key CHORD [CAPTION]              press a chord (Meta+Shift+Left), with its own caption if given
  open CHORD [as NAME] [CAPTION]   press a chord that opens a window; wait until kwin-i3 adds it
  run APP [as NAME] [CAPTION]      start an application; wait until kwin-i3 adds its window
  type TEXT                        type it, at a readable pace
  point NAME|park [CAPTION]        move the pointer, at a hand's pace, to a named window's centre,
                                   or back over the panel where it rests
  wait SECONDS                     hold
  pace [SECONDS]                   the hold after each later key, open, run or point (alone: back
                                   to HOLD)
NAME names the window that step opened, for later steps.
"""
import math, os, shlex, subprocess, sys, time
import dbus

if os.environ.get("KI3_INNER") != "1" or "/tmp/dbus-" not in os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""):
    sys.exit("play.py: only inside tools/testkwin.sh (this would type into the real desktop)")

HOLD = 2.4          # after each key: time for a viewer to see what it did


def read_time(text):
    """How long a caption shows before anything happens: long enough to be read first."""
    return max(1.5, 0.8 + 0.33 * len(text.split()))


START, END = 2.0, 3.0   # the desktop still before the first step; the last result held
OPEN_LIMIT = 15     # seconds for a new window before the run fails
TYPE_GAP = 0.12     # between typed characters
SPEED = 1400        # pointer, px a second, each move between 0.5 and 1.2 s
FRAME = 1 / 60

# evdev codes, as tests/live/lib.sh's EVDEV
EVDEV = {"Meta": 125, "Shift": 42, "Ctrl": 29, "Alt": 56,
         "Left": 105, "Right": 106, "Up": 103, "Down": 108, "Space": 57, "Tab": 15,
         "Enter": 28, "Return": 28, "Escape": 1, ";": 39}
EVDEV.update({c: n for n, c in enumerate("QWERTYUIOP", 16)})
EVDEV.update({c: n for n, c in enumerate("ASDFGHJKL", 30)})
EVDEV.update({c: n for n, c in enumerate("ZXCVBNM", 44)})
EVDEV.update({str((i + 1) % 10): i + 2 for i in range(10)})
TYPED = {" ": 57, "-": 12, ".": 52, "/": 53}

bus = dbus.SessionBus()


def chord_codes(chord):
    parts = chord.split("+")
    key, mods = parts[-1], parts[:-1]
    if key == ":":
        key, mods = ";", mods + ["Shift"]
    for p in mods + [key]:
        if p.upper() not in EVDEV and p not in EVDEV:
            sys.exit(f"play.py: unknown key {p!r} in {chord!r}")
    code = lambda p: EVDEV.get(p, EVDEV.get(p.upper()))
    m = [code(p) for p in mods]
    return ([f"key {c} down" for c in m] + [f"key {code(key)} down", f"key {code(key)} up"]
            + [f"key {c} up" for c in reversed(m)])


def char_codes(ch):
    if ch in TYPED:
        return [f"key {TYPED[ch]} down", f"key {TYPED[ch]} up"]
    if ch.upper() in EVDEV and len(ch) == 1:
        c = EVDEV[ch.upper()]
        if ch.isupper():
            return ["key 42 down", f"key {c} down", f"key {c} up", "key 42 up"]
        return [f"key {c} down", f"key {c} up"]
    sys.exit(f"play.py: can't type {ch!r}")


class Input:
    """tools/inject.py's connection, kept open; tracks where the pointer is."""
    def __init__(self, x, y):
        sender = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin", "ei-send")
        self.eis = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop"),
                                  "org.kde.KWin.EIS.RemoteDesktop")
        fd, self.cookie = self.eis.connectToEIS(1 | 2)
        fd = fd.take()
        self.p = subprocess.Popen([sender, str(fd)], pass_fds=[fd], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, text=True)
        os.close(fd)
        if self.p.stdout.readline().strip() != "ready":
            sys.exit("play.py: ei-send never became ready")
        self.x, self.y = x, y

    def send(self, cmds):
        for c in cmds:
            self.p.stdin.write(c + "\n"); self.p.stdin.flush()
            if self.p.stdout.readline().strip() != "ok":
                sys.exit(f"play.py: ei-send failed at: {c}")

    def glide(self, x, y):
        """Eased, one frame a step, as a hand moves it."""
        dist = math.hypot(x - self.x, y - self.y)
        steps = max(1, round(min(max(dist / SPEED, 0.5), 1.2) / FRAME))
        x0, y0 = self.x, self.y
        for i in range(1, steps + 1):
            t0 = time.time()
            e = 0.5 - 0.5 * math.cos(math.pi * i / steps)
            self.send([f"abs {round(x0 + (x - x0) * e)} {round(y0 + (y - y0) * e)}"])
            time.sleep(max(0, FRAME - (time.time() - t0)))
        self.x, self.y = x, y

    def close(self):
        self.p.stdin.close(); self.p.wait()
        try: self.eis.disconnect(self.cookie)
        except dbus.DBusException: pass


def log_lines():
    try:
        with open(os.environ["KI3_LOG"]) as f:
            return f.read().splitlines()
    except FileNotFoundError:
        return []


def kjs(js):
    """tests/live/lib.sh's kjs: a throwaway KWin script; what it log()s, line by line."""
    n = f"kjs-{time.time_ns()}"
    path = os.path.join(os.environ["KI3_TMP"], n + ".js")
    with open(path, "w") as f:
        f.write('function log(s) { callDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", "Log", "kjs: " + s); }\n'
                f'try {{\n{js}\n}} catch (e) {{ log("ERROR " + e); }}\nlog("{n}-END");\n')
    before = len(log_lines())
    scripting = dbus.Interface(bus.get_object("org.kde.KWin", "/Scripting"), "org.kde.kwin.Scripting")
    scripting.loadScript(path, n, signature="ss")      # overloaded (s, ss): introspection picks s
    scripting.start()
    end, done = time.time() + 5, False
    while time.time() < end and not done:
        done = any(f"kjs: {n}-END" in l for l in log_lines()[before:])
        if not done:
            time.sleep(0.02)
    scripting.unloadScript(n)
    out = [l.split("kjs: ", 1)[1] for l in log_lines()[before:] if "kjs: " in l and f"{n}-END" not in l]
    if not done or any(l.startswith("ERROR ") for l in out):
        sys.exit(f"play.py: kjs failed: {out or 'no answer'}")
    return out


def windows():
    """internalId -> (x, y, w, h) of every normal window."""
    found = {}
    for l in kjs('workspace.windowList().forEach(function (w) { if (w.normalWindow) { var g = w.frameGeometry; '
                 'log(w.internalId + " " + g.x + " " + g.y + " " + g.width + " " + g.height); } });'):
        wid, *g = l.split()
        found[wid] = tuple(int(float(v)) for v in g)
    return found


def wait_new(log_before, ids_before):
    """kwin-i3 has added a window (its ADD line), and the new window's id."""
    end = time.time() + OPEN_LIMIT
    while time.time() < end:
        if any(" ADD " in f" {l}" for l in log_lines()[log_before:]):
            new = set(windows()) - ids_before
            if new:
                return new.pop()
        time.sleep(0.05)
    sys.exit("play.py: no new window within %d s" % OPEN_LIMIT)


def named(rest):
    """'[as NAME] [CAPTION]' -> (NAME or None, CAPTION)."""
    if rest.startswith("as "):
        _, name, *caption = rest.split(None, 2)
        return name, (caption[0] if caption else "")
    return None, rest


def main():
    script, timeline, t0 = sys.argv[1], sys.argv[2], float(sys.argv[3])
    park = tuple(int(v) for v in os.environ["KI3_VIDEO_PARK"].split(","))
    steps = []
    for n, line in enumerate(open(script), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cmd, _, rest = line.partition(" ")
        if cmd not in ("say", "key", "open", "run", "type", "point", "wait", "pace"):
            sys.exit(f"play.py: {script}:{n}: unknown step {cmd!r}")
        steps.append((n, cmd, rest.strip()))

    out = open(timeline, "w")
    def mark(kind, text):
        out.write(f"{int((time.time() - t0) * 1000)}\t{kind}\t{text}\n"); out.flush()
    def caption_first(caption):
        if caption:
            mark("caption", caption); time.sleep(read_time(caption))

    names = {}
    hold = HOLD
    io = Input(*park)
    time.sleep(START)
    for n, cmd, rest in steps:
        if cmd == "say":
            mark("caption", rest)
            if rest:
                time.sleep(read_time(rest))
        elif cmd == "wait":
            time.sleep(float(rest))
        elif cmd == "pace":
            hold = float(rest) if rest else HOLD
        elif cmd in ("key", "open"):
            chord, _, rest = rest.partition(" ")
            name, caption = named(rest.strip())
            caption_first(caption)
            log_before, ids_before = len(log_lines()), set(windows()) if cmd == "open" else set()
            mark("key", chord)
            io.send(chord_codes(chord))
            if cmd == "open":
                wid = wait_new(log_before, ids_before)
                if name: names[name] = wid
            time.sleep(hold)
        elif cmd == "run":
            app, _, rest = rest.partition(" ")
            name, caption = named(rest.strip())
            caption_first(caption)
            log_before, ids_before = len(log_lines()), set(windows())
            subprocess.Popen(shlex.split(app), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            wid = wait_new(log_before, ids_before)
            if name: names[name] = wid
            time.sleep(hold)
        elif cmd == "type":
            for ch in rest:
                io.send(char_codes(ch)); time.sleep(TYPE_GAP)
            time.sleep(0.6)
        elif cmd == "point":
            target, _, caption = rest.partition(" ")
            caption_first(caption.strip())
            if target == "park":
                x, y = park
            else:
                if target not in names:
                    sys.exit(f"play.py: {script}:{n}: no window named {target!r}")
                g = windows().get(names[target])
                if not g:
                    sys.exit(f"play.py: {script}:{n}: {target!r} is gone")
                x, y = g[0] + g[2] // 2, g[1] + g[3] // 2
            mark("point", target)
            io.glide(x, y)
            time.sleep(hold)
    time.sleep(END)
    mark("end", "")
    io.close()


main()
