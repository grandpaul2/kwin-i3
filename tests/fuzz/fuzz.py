#!/usr/bin/env python3
"""One fuzz run inside tools/testkwin.sh: random actions, pixel invariants after every step.

  fuzz.py gen --seed S --budget SECONDS --out DIR    generate actions from the seed and run them
  fuzz.py replay TRACE --out DIR                     run the actions recorded in TRACE
  --skip I8,...                                      do not stop for these invariants (known bugs)

Either way DIR gets trace.json (every action, fully resolved: window captions and coordinates,
never indexes), result.json, the kwin-i3 log, and the last Dump State. A run stops at the first
step whose invariants fail. tests/fuzz/run.py drives this: many seeds, replays, shrinking.
Design and review: docs/fuzz-design.md.
"""
import argparse, json, os, random, re, signal, subprocess, sys, time

if os.environ.get("KI3_INNER") != "1" or "/tmp/dbus-" not in os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""):
    sys.exit("fuzz.py: only inside tools/testkwin.sh (this would drive the real desktop)")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))     # shot.py, the screenshots I11 reads
LOG = os.environ["KI3_LOG"]
TMP = os.environ["KI3_TMP"]
MAX_WINDOWS = 8
KEYS = list(json.load(open(os.path.join(ROOT, "tests", "keys.json"))))   # never the Selftest ones
# Meta+Shift+N's action id kept its "(symbol)" (src/kwin.js registerKeys): without it, from
# 2026-10-24 until 2026-10-30, the fuzzer's moves to a workspace invoked nothing.
KEYS += ["Workspace %d" % n for n in range(1, 5)] + ["Move to Workspace %d (symbol)" % n for n in range(1, 5)]
# The unbound ones, as in i3 (docs/records/spec-workspace-commands.md): sticky, back-and-forth,
# next/prev, the outputs. A quarter of the key draws, so the bound keys keep most of them.
UNBOUND = ["Sticky Toggle", "Workspace Back and Forth", "Move to Workspace Back and Forth"]
UNBOUND += ["%s %s%s" % (v, d, o) for v in ("Workspace", "Move to Workspace") for d in ("Next", "Prev") for o in ("", " on Output")]
UNBOUND += ["%s %s" % (v, d) for v in ("Focus Output", "Move to Output", "Move Workspace to Output")
            for d in ("Left", "Right", "Up", "Down", "Next", "Primary")]
UNBOUND += ["%s %d (no back-and-forth)" % (v, n) for v in ("Workspace", "Move to Workspace") for n in (1, 2)]
EVDEV = {"Meta": 125, "Shift": 42, "Ctrl": 29, "Alt": 56}


def busctl(*args, timeout=5):
    return subprocess.run(["busctl", "--user"] + list(args), capture_output=True, text=True, timeout=timeout)


class Harness(Exception):
    """The test machinery failed, not kwin-i3: reported apart from invariant failures."""


class Kwin:
    def __init__(self, out):
        self.out = out
        self.dumpfile = os.path.join(out, "dump.txt")
        self.sink = subprocess.Popen([os.path.join(ROOT, "tools", "logsink.py"), self.dumpfile,
                                      "net.local.kwini3.dump"])
        self.clients = {}           # --title name -> Popen
        self.log_seen = 0           # KI3_LOG lines already checked by I1
        self.jsn = 0
        # The frame is drawn (I11) while the plugins are there and the effect is loaded.
        self.plugins = bool(os.environ.get("KI3_PLUGIN"))
        self.effect = self.plugins
        # The desktops, counted here (the dump doesn't say); kwin-i3 adds one for Meta+N past the
        # last (34-desktops-on-demand), so the count is only a guide for the desktop action.
        self.desktops = int(os.environ.get("KI3_DESKTOPS", "10"))
        for _ in range(50):
            if busctl("status", "net.local.kwini3.dump").returncode == 0:
                break
            time.sleep(0.05)

    # ---- KWin access ---------------------------------------------------------------------

    def load(self):
        busctl("call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "loadScript", "ss",
               os.path.join(ROOT, "package", "contents", "code", "main.js"), "kwin-i3")
        busctl("call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "start")
        end = time.time() + 10
        while time.time() < end:
            if any(l.endswith("kwin-i3 loaded") for l in self.log_lines()):
                return
            time.sleep(0.05)
        raise Harness("kwin-i3 did not load")

    def log_lines(self):
        try:
            with open(LOG) as f:
                return f.read().splitlines()
        except FileNotFoundError:
            return []

    def dump(self):
        """One Dump State snapshot, parsed. In-process and atomic (design review 3)."""
        try:
            before = os.path.getsize(self.dumpfile)
        except FileNotFoundError:
            before = 0
        busctl("call", "org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
               "invokeShortcut", "s", "kwin-i3 Dump State")
        end = time.time() + 5
        while time.time() < end:
            try:
                with open(self.dumpfile) as f:
                    f.seek(before)
                    text = f.read()
            except FileNotFoundError:
                text = ""
            if text.rstrip().endswith("DUMP END"):
                for line in text.splitlines():
                    if line[9:].startswith("JSON "):
                        return json.loads(line[14:])
                raise Harness("dump without its JSON line")
            time.sleep(0.03)
        raise Harness("Dump State did not answer")

    def js(self, body):
        """Run a throwaway KWin script; waits until it has run."""
        self.jsn += 1
        n = "fz-%d-%d" % (os.getpid(), self.jsn)
        path = os.path.join(TMP, n + ".js")
        with open(path, "w") as f:
            f.write('try {\n%s\n} catch (e) {}\ncallDBus("net.local.kwini3.log", "/", "net.local.kwini3.log", '
                    '"Log", "kjs: %s-END");\n' % (body, n))
        busctl("call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "loadScript", "ss", path, n)
        busctl("call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "start")
        end = time.time() + 5
        while time.time() < end and not any(l.endswith("kjs: %s-END" % n) for l in self.log_lines()):
            time.sleep(0.03)
        busctl("call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "unloadScript", "s", n)

    def inject(self, cmds):
        r = subprocess.run([os.path.join(ROOT, "tools", "inject.py")] + cmds, capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            # Nothing may stay held down for the next action (design review 16).
            subprocess.run([os.path.join(ROOT, "tools", "inject.py")] +
                           ["key %d up" % k for k in EVDEV.values()] + ["btn left up", "btn right up"],
                           capture_output=True, timeout=10)
            raise Harness("inject failed: " + r.stderr.strip()[-200:])

    # ---- settling ------------------------------------------------------------------------

    def settle(self, pointer=False):
        """Quiet log (kjs lines aside) for 250 ms, then two dumps 100 ms apart that agree."""
        time.sleep(0.35 if pointer else 0.05)   # focus follows the mouse after 150 ms (review 5)
        end = time.time() + 10
        while time.time() < end:
            n = self.quiet_count()
            time.sleep(0.25)
            if self.quiet_count() != n:
                continue
            a = self.dump()
            time.sleep(0.1)
            b = self.dump()
            if shape(a) == shape(b) and self.quiet_count() == n:
                return b, a
        raise Harness("never settles")

    def quiet_count(self):
        return sum(1 for l in self.log_lines() if " kjs: " not in l)

    # ---- actions -------------------------------------------------------------------------

    def run(self, a):
        op = a["op"]
        if op == "open":
            self.clients[a["name"]] = subprocess.Popen(
                [os.path.join(ROOT, "tools", "testclient.py"), "--title", a["name"]] + a["args"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            want = 1.2 + (float(a["args"][a["args"].index("--map-delay") + 1]) if "--map-delay" in a["args"] else 0)
            end = time.time() + want + 4
            while time.time() < end:
                if any(w["caption"] == a["name"] for w in self.dump()["windows"]):
                    break
                time.sleep(0.1)
        elif op == "close":
            self.js('workspace.windowList().forEach(function (w) { if (w.caption === %s) w.closeWindow(); });'
                    % json.dumps(a["caption"]))
        elif op == "kill":
            p = self.clients.get(a["name"])
            if p and p.poll() is None:
                p.send_signal(signal.SIGKILL)
                p.wait()
        elif op == "key":
            busctl("call", "org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
                   "invokeShortcut", "s", "kwin-i3 " + a["name"])
        elif op == "selfresize":
            # A frame change kwin-i3 didn't ask for, as a client resizing itself (Firefox's
            # session restore; docs/records/spec-self-resize.md). It is asked back at most once a second
            # per window, so wait that out: a settle inside it would catch the refit half done.
            self.js('workspace.windowList().forEach(function (w) { if (w.caption === %s) '
                    'w.frameGeometry = { x: w.x, y: w.y, width: %d, height: %d }; });'
                    % (json.dumps(a["caption"]), a["w"], a["h"]))
            time.sleep(1.1)
        elif op == "fullscreen":
            busctl("call", "org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component",
                   "invokeShortcut", "s", "Window Fullscreen")
        elif op == "point":
            self.inject(["abs %d %d" % (a["x"], a["y"]), "wait 30"])
        elif op == "drag":
            x1, y1, x2, y2 = a["from"] + a["to"]
            cmds = ["abs %d %d" % (x1, y1), "wait 30", "key 125 down", "btn %s down" % a["button"]]
            for s in (1, 2, 3, 4):
                cmds += ["abs %d %d" % (x1 + (x2 - x1) * s // 4, y1 + (y2 - y1) * s // 4), "wait 0"]
            cmds += ["btn %s up" % a["button"], "key 125 up"]
            self.inject(cmds)
        elif op == "output":
            subprocess.run(["kscreen-doctor", "output.Virtual-1." + a["state"]], capture_output=True, timeout=10)
            want = 2 if a["state"] == "enable" else 1
            end = time.time() + 5
            while time.time() < end and len(self.dump()["outputs"]) != want:
                time.sleep(0.1)
            # KWin briefly puts windows on the old monitor; wait for kwin-i3's pass after it (review 10).
            time.sleep(0.5)
        elif op == "effect":
            # The effect gone and back (a Plasma update, the user's Desktop Effects page): kwin-i3
            # turns the frame off and on (FRAME lines), and I11 expects it drawn again.
            busctl("call", "org.kde.KWin", "/Effects", "org.kde.kwin.Effects", a["state"] + "Effect", "s", "kwini3hold")
            self.effect = a["state"] == "load"
            time.sleep(0.3)
        elif op == "desktop":
            # A desktop added, removed or moved outside kwin-i3 (Plasma's pager, System Settings;
            # docs/records/spec-desktop-changes.md): the workspaces are adopted again.
            self.js({"add": 'workspace.createDesktop(%d, "fz");',
                     "remove": "workspace.removeDesktop(workspace.desktops[%d]);",
                     "move": "workspace.moveDesktop(workspace.desktops[%d], %d);"}[a["do"]] % tuple(a["at"]))
            self.desktops += {"add": 1, "remove": -1, "move": 0}[a["do"]]
            time.sleep(0.3)
        else:
            raise Harness("unknown action " + op)
        return self.settle(pointer=op in ("point", "drag", "output"))

    def stop(self):
        for p in self.clients.values():
            if p.poll() is None:
                p.kill()
        self.sink.kill()


def shape(d):
    """What must be stable for a dump to count as settled."""
    return json.dumps([d["outputs"], [(w["id"], w["frame"], w["desktops"], w["min"]) for w in d["windows"]],
                       d["ws"]], sort_keys=True)


# ---- invariants (docs/fuzz-design.md, as amended by its review) ----------------------------

def inside(r, o):
    return r[0] >= o[0] and r[1] >= o[1] and r[0] + r[2] <= o[0] + o[2] and r[1] + r[3] <= o[1] + o[3]


def overlap(a, b):
    w = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    h = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return max(w, 0) * max(h, 0), (w, h)


MAX_PAD = 8     # the most a tile's padding takes off one side: the fuzzer's settings' gap and frame
# The frame's colours at their defaults (src/settings.js; 54-frame.sh): focused, unfocused, and the
# focused split indicator, drawn on the right or bottom side of a window alone in its split.
ACTIVE, INACTIVE, INDICATOR = (76, 120, 153), (51, 51, 51), (61, 174, 233)


def same(px, rgb, tol=24):
    return all(abs(a - b) <= tol for a, b in zip(px, rgb))


def frame_pixels(k, d, o, tiled, wins):
    """I11: each tiled window's frame is drawn, in its focus class, at the middle of each side of
    its tile's padding (tile minus want; corners left out, they may be rounded). A point under a
    floating window or a dialog is skipped: the frame is below it."""
    import shot
    path = os.path.join(TMP, "fz-%d.png" % os.getpid())
    try:
        shot.capture(o["name"], path)
    except Exception as e:
        raise Harness("screenshot failed: %s" % e)
    from PIL import Image
    img = Image.open(path).convert("RGB")
    covers = [w["frame"] for w in wins.values() if w["id"] not in {t["id"] for t in tiled}
              and not w["minimized"] and w["caption"] != "kwin-i3 gap" and set(w["desktops"]) & {o["shows"]}]
    bad = []
    for w in tiled:
        t, a = w["tile"], w.get("want")
        if not (t and a):
            continue
        sides = {"left": (t[0], a[1] + a[3] // 2) if a[0] > t[0] else None,
                 "top": (a[0] + a[2] // 2, t[1]) if a[1] > t[1] else None,
                 "right": (t[0] + t[2] - 1, a[1] + a[3] // 2) if a[0] + a[2] < t[0] + t[2] else None,
                 "bottom": (a[0] + a[2] // 2, t[1] + t[3] - 1) if a[1] + a[3] < t[1] + t[3] else None}
        for side, p in sides.items():
            if not p or any(inside([p[0], p[1], 1, 1], c) for c in covers):
                continue
            px = img.getpixel((p[0] - o["geom"][0], p[1] - o["geom"][1]))
            ok = [ACTIVE, INDICATOR] if w["active"] and side in ("right", "bottom") else [ACTIVE] if w["active"] else [INACTIVE]
            if not any(same(px, c) for c in ok):
                bad.append(("I11", "%s %s frame at %s is %s, not %s" % (
                    w["caption"], side, list(p), list(px), "active" if w["active"] else "inactive")))
                break
    return bad


def grown(w):
    """A tiled window's frame plus its tile's padding: its tile, when the frame is right."""
    f, t, a = w["frame"], w["tile"], w.get("want")
    if not (t and a):
        return f
    return [f[0] - (a[0] - t[0]), f[1] - (a[1] - t[1]),
            f[2] + (t[2] - a[2]), f[3] + (t[3] - a[3])]


def check(k, d, prev):
    """Invariant failures as (code, detail). prev is the earlier dump of the settle pair."""
    bad = []
    lines = k.log_lines()
    for l in lines[k.log_seen:]:
        if re.match(r"^.{9}(INVARIANT|ERROR|WARN)", l):
            bad.append(("I1", l[9:]))
            break
    k.log_seen = len(lines)
    if busctl("status", "org.kde.KWin").returncode != 0:
        return bad + [("I1", "KWin is gone")]
    wins = {w["id"]: w for w in d["windows"]}
    prev_min = {w["id"]: w["min"] for w in prev["windows"]}
    where = {}
    for n, ws in d["ws"].items():
        for i in ws["tiled"] + ws["floating"]:
            where.setdefault(i, []).append(int(n))
    for o in d["outputs"]:
        ws = d["ws"].get(str(o["shows"]))
        if not ws:
            continue
        tiled = [wins[i] for i in ws["tiled"] if i in wins and not wins[i]["minimized"]]
        if any(w["fullscreen"] for w in tiled):
            continue
        for w in tiled:
            if not inside(w["frame"], o["geom"]):
                bad.append(("I2", "%s %s outside %s %s" % (w["caption"], w["frame"], o["name"], o["geom"])))
            if w["min"] == prev_min.get(w["id"]) and (w["client"][2] < w["min"][0] or w["client"][3] < w["min"][1]):
                bad.append(("I5", "%s client %s below its minimum %s" % (w["caption"], w["client"][2:], w["min"])))
            # The rect kwin-i3 asks for, inside the tile's padding (the 1 px frame, the gaps: window
            # modes, 2026-10-24). It comes from kwin-i3's own windowRect, so it is checked on its own
            # too: inside its tile, by at most MAX_PAD a side (review: a wrong padding would move the
            # frame and "want" together, unseen). No fallback to the tile: a missing "want" fails.
            if w["tile"]:
                want = w.get("want")
                if not want:
                    bad.append(("I10", "%s has a tile but no want in the dump" % w["caption"]))
                elif not all(0 <= d <= MAX_PAD for d in (want[0] - w["tile"][0], want[1] - w["tile"][1],
                                                          w["tile"][0] + w["tile"][2] - want[0] - want[2],
                                                          w["tile"][1] + w["tile"][3] - want[1] - want[3])):
                    bad.append(("I10", "%s want %s is not just inside its tile %s" % (w["caption"], want, w["tile"])))
                elif any(abs(a - b) > 1 for a, b in zip(w["frame"], want)):
                    bad.append(("I10", "%s frame %s is not its tile's rect %s" % (w["caption"], w["frame"], want)))
        for i, a in enumerate(tiled):
            for b in tiled[i + 1:]:
                area, wh = overlap(a["frame"], b["frame"])
                if area:
                    bad.append(("I3", "%s and %s overlap by %dx%d on %s" % (a["caption"], b["caption"], wh[0], wh[1], o["name"])))
        if tiled:
            # Each frame grown back by its tile's padding (tile minus want), so a right frame covers
            # its tile exactly and a frame 1 px short still leaves a 1 px hole (the snap() bug this
            # was validated on, inside I10's 1 px slack).
            covered = sum(overlap(grown(w), o["geom"])[0] for w in tiled)
            if covered < o["geom"][2] * o["geom"][3]:
                bad.append(("I4", "%s: tiled windows cover %d of %d px (a hole)" % (o["name"], covered, o["geom"][2] * o["geom"][3])))
        if tiled and k.effect:
            bad += frame_pixels(k, d, o, tiled, wins)
        for i in ws["floating"]:
            w = wins.get(i)
            # not one with a fullscreen request KWin can't apply: a known limit (plan, policies)
            if w and not w["minimized"] and not w.get("pending") and overlap(w["frame"], o["geom"])[0] < 2500:
                bad.append(("I9", "floating %s at %s is off %s" % (w["caption"], w["frame"], o["name"])))
    for w in d["windows"]:
        if w["rule"] == "ignore" or w["minimized"] or len(w["desktops"]) != 1:
            continue
        got = where.get(w["id"], [])
        if not got:
            bad.append(("I6", "%s (%s) is in no workspace" % (w["caption"], w["rule"])))
        elif len(got) > 1:
            bad.append(("I6", "%s is in workspaces %s" % (w["caption"], got)))
        elif got[0] != w["desktops"][0]:
            bad.append(("I6", "%s is in workspace %d but on desktop %d" % (w["caption"], got[0], w["desktops"][0])))
    act = [w for w in d["windows"] if w["active"]]
    shown = {o["name"]: o["shows"] for o in d["outputs"]}
    for w in act:
        if w["desktops"] and shown.get(w["output"]) not in w["desktops"]:
            bad.append(("I8", "active %s is on desktop %s, %s shows %s" % (w["caption"], w["desktops"], w["output"], shown.get(w["output"]))))
    return bad


# ---- generation ----------------------------------------------------------------------------

def generate(rng, k, d, n_open):
    """One action, resolved against the current state (captions and coordinates recorded)."""
    mine = [w for w in d["windows"] if w["rule"] != "ignore" and re.match(r"w\d+", w["caption"])]
    shown = {o["shows"] for o in d["outputs"]}
    visible = [w for w in mine if set(w["desktops"]) & shown and not w["minimized"]]
    tiled_vis = [w for w in visible if any(w["id"] in d["ws"].get(str(s), {}).get("tiled", []) for s in shown)]
    alive = [n for n, p in k.clients.items() if p.poll() is None]
    choices = [("key", 40), ("point", 12), ("close", 8 if mine else 0), ("kill", 2 if alive else 0),
               ("fullscreen", 3), ("resize", 6 if tiled_vis else 0), ("move", 4 if visible else 0),
               ("selfresize", 4 if tiled_vis else 0),
               ("output", 2), ("open", 18 if len(alive) < MAX_WINDOWS else 0),
               ("effect", 1 if k.plugins else 0), ("desktop", 2)]
    op = rng.choices([c for c, _ in choices], [w for _, w in choices])[0]
    if op == "open":
        name = "w%d" % n_open
        kind = rng.choice(["plain", "plain", "plain", "fixed", "min", "min", "dialog", "slow", "retitle"])
        args = {"plain": [], "dialog": ["--dialog"], "slow": ["--map-delay", "1.0"],
                "retitle": ["--retitle", "0.5:%sr" % name],
                "fixed": ["--fixed", "--size", "%dx%d" % (rng.randrange(200, 900, 10), rng.randrange(150, 600, 10))],
                "min": ["--min", "%dx%d" % (rng.randrange(200, 1000, 10), rng.randrange(150, 650, 10))]}[kind]
        return {"op": "open", "name": name, "kind": kind, "args": args}
    if op == "close":
        return {"op": "close", "caption": rng.choice(mine)["caption"]}
    if op == "kill":
        return {"op": "kill", "name": rng.choice(alive)}
    if op == "key":
        return {"op": "key", "name": rng.choice(UNBOUND if rng.random() < 0.25 else KEYS)}
    if op == "fullscreen":
        return {"op": "fullscreen"}
    if op == "point":
        if visible and rng.random() < 0.8:
            f = rng.choice(visible)["frame"]
            return {"op": "point", "x": f[0] + f[2] // 2, "y": f[1] + f[3] // 2}
        o = rng.choice(d["outputs"])["geom"]
        return {"op": "point", "x": o[0] + rng.randrange(o[2]), "y": o[1] + rng.randrange(o[3])}
    if op == "resize":
        f = rng.choice(tiled_vis)["frame"]
        c = [f[0] + f[2] // 2, f[1] + f[3] // 2]
        return {"op": "drag", "button": "right", "from": c, "to": [c[0] + rng.randint(-250, 250), c[1] + rng.randint(-200, 200)]}
    if op == "selfresize":
        w = rng.choice(tiled_vis)
        return {"op": "selfresize", "caption": w["caption"],
                "w": max(100, w["frame"][2] + rng.randint(-300, 300)), "h": max(100, w["frame"][3] + rng.randint(-200, 200))}
    if op == "move":
        f = rng.choice(visible)["frame"]
        c = [f[0] + f[2] // 2, f[1] + f[3] // 2]
        o = rng.choice(d["outputs"])["geom"]
        return {"op": "drag", "button": "left", "from": c, "to": [o[0] + rng.randrange(o[2]), o[1] + rng.randrange(o[3])]}
    if op == "output":
        return {"op": "output", "state": "disable" if len(d["outputs"]) == 2 else "enable"}
    if op == "effect":
        return {"op": "effect", "state": "unload" if k.effect else "load"}
    if op == "desktop":
        n = k.desktops
        do = rng.choice(["add"] * (n < 12) + ["remove"] * (n > 2) + ["move"])
        at = {"add": [rng.randrange(n + 1)], "remove": [rng.randrange(n)],
              "move": [rng.randrange(n), rng.randrange(n)]}[do]
        return {"op": "desktop", "do": do, "at": at}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    g = sub.add_parser("gen"); g.add_argument("--seed", type=int, required=True)
    g.add_argument("--budget", type=float, default=90); g.add_argument("--out", required=True)
    r = sub.add_parser("replay"); r.add_argument("trace"); r.add_argument("--out", required=True)
    for x in (g, r):    # invariants not to stop for: a known bug that would hide the rest
        x.add_argument("--skip", default="", help="comma-separated codes, e.g. I8")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    start = time.time()
    trace, result = [], {"ok": True, "steps": 0}
    k = Kwin(a.out)
    try:
        k.load()
        d, prev = k.settle()
        if a.mode == "gen":
            rng = random.Random(a.seed)
            planned = None
            n_open = 1
        else:
            planned = json.load(open(a.trace))["actions"]
        i = 0
        while True:
            if planned is None:
                if time.time() - start > a.budget:
                    break
                act = generate(rng, k, d, n_open)
                if act["op"] == "open":
                    n_open += 1
            else:
                if i >= len(planned):
                    break
                act = planned[i]
            i += 1
            trace.append(act)
            d, prev = k.run(act)
            result["steps"] = len(trace)
            bad = [f for f in check(k, d, prev) if f[0] not in a.skip.split(",")]
            if bad:
                result.update(ok=False, failures=bad, signature=signature(bad[0]))
                break
    except Harness as e:
        result.update(ok=False, harness=str(e))
    except subprocess.TimeoutExpired as e:
        result.update(ok=False, harness="timeout: %s" % e.cmd)
    finally:
        try:
            last = k.dump()
            json.dump(last, open(os.path.join(a.out, "last-dump.json"), "w"), indent=1)
        except Exception:
            pass
        k.stop()
        json.dump({"seed": getattr(a, "seed", None), "actions": trace}, open(os.path.join(a.out, "trace.json"), "w"), indent=1)
        json.dump(result, open(os.path.join(a.out, "result.json"), "w"), indent=1)
        try:
            with open(LOG) as f, open(os.path.join(a.out, "ki3.log"), "w") as o:
                o.write(f.read())
        except FileNotFoundError:
            pass


def signature(f):
    """What a shrunk trace must still fail with: the invariant and its message without numbers."""
    code, detail = f
    detail = re.sub(r"\bw\d+r?\b", "W", detail)
    detail = re.sub(r"\{[0-9a-f-]+\}|-?\d+", "N", detail)
    return code + " " + detail


if __name__ == "__main__":
    main()
