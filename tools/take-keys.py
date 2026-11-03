#!/usr/bin/env python3
# Gives back the shortcut keys kwin-i3 once took from other shortcuts. kwin-i3 no longer takes
# keys: a key it shares with a Plasma shortcut runs kwin-i3's command while the key override is on
# (keysOverride, plugin/keyoverride.h), with Plasma's shortcuts unchanged. What remains:
#   restore  (make uninstall) give every saved holder its saved keys back where it still holds
#            what kwin-i3 left it ("set"); a holder changed since keeps the change, its old keys
#            printed. The settings page's "Free Meta+T" row still takes Meta+T (kcm/setup.cpp)
#            and records it here.
#   migrate  (make install, once the new helper is loaded) the same for every record but Meta+T's,
#            the keys an earlier kwin-i3 took; prints "migrated" if there were any, so the install
#            turns the key override on: the reader had chosen kwin-i3's keys.
# The save: $XDG_STATE_HOME/kwin-i3/taken-keys.json (~/.local/state). Only busctl and the
# standard library.
import json, os, subprocess, sys

KGA = ["org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel"]
STATE = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"),
                     "kwin-i3", "taken-keys.json")
MODS = [(0x10000000, "Meta"), (0x04000000, "Ctrl"), (0x08000000, "Alt"), (0x02000000, "Shift")]
SPECIAL = {0x20: "Space", 0x01000012: "Left", 0x01000013: "Up", 0x01000014: "Right", 0x01000015: "Down"}


def call(dest, path, iface, method, sig="", *args):
    cmd = ["busctl", "--user", "--json=short", "call", dest, path, iface, method]
    if sig:
        cmd += [sig] + [str(a) for a in args]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    return json.loads(out)["data"] if out.strip() else None


def name(code):   # for the printout only; kwin-i3's own is src/keyname.js
    k = code & 0x01FFFFFF
    key = SPECIAL.get(k) or (chr(k) if 0x20 < k < 0x7F else hex(k))
    return "+".join([n for m, n in MODS if code & m] + [key])


def keys_of(comp, action):   # a(ai): each entry a struct holding a key sequence, [[key, 0, 0, 0]]
    return [s[0] for s in call(*KGA, "shortcutKeys", "as", 4, comp, action, "x", action)[0]]


def set_keys(comp, action, seqs):
    flat = []
    for s in seqs:
        flat += [len(s)] + list(s)
    call(*KGA, "setForeignShortcutKeys", "asa(ai)", 4, comp, action, "x", action, len(seqs), *flat)


def holder(code):
    h = call(*KGA, "action", "i", code)[0]
    return (h[0], h[1], h[3]) if len(h) >= 2 else None


def active(comp):   # a holder whose app isn't running doesn't block the key (probed 2026-10-24)
    path = call(*KGA, "getComponent", "s", comp)[0]
    return call("org.kde.kglobalaccel", path, "org.kde.kglobalaccel.Component", "isActive")[0]


def write(saved):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE + ".new", "w") as f:
        json.dump(saved, f, indent=1)
    os.replace(STATE + ".new", STATE)


def same(a, b):
    return sorted(map(tuple, a)) == sorted(map(tuple, b))


def unchanged(e, now):
    """The holder still holds what kwin-i3 left it. A save from before "set" was kept: taking
    only removes keys, so any key its old keys didn't have is the user's."""
    if "set" in e:
        return same(now, e["set"])
    return all(any(same([s], [o]) for o in e["keys"]) for s in now)


TILE_EDITOR = "kwin|Edit Tiles"      # kcm/setup.cpp TileEditor


def restore(which=lambda id: True, label="give back"):
    if not os.path.exists(STATE):
        print(f"{label}: nothing saved")
        return 0
    saved = json.load(open(STATE))
    given = 0
    for id, e in list(saved.items()):
        if not which(id):
            continue
        comp, action = e["component"], e["action"]
        try:
            now = keys_of(comp, action)
            if same(now, e["keys"]):
                print(f"  {comp} / {action}: already has its keys")
            elif unchanged(e, now):
                set_keys(comp, action, e["keys"])
                print(f"  {comp} / {action}: keys restored")
            else:
                old = ", ".join(name(s[0]) for s in e["keys"] if s and s[0]) or "none"
                print(f"  {comp} / {action}: changed since kwin-i3 took its key; left as it is (it had: {old})")
        except subprocess.CalledProcessError as err:
            print(f"  {comp} / {action}: not restored ({err.stderr.strip()}); kept in the save")
            continue
        del saved[id]
        given += 1
        write(saved)
    left = [id for id in saved if which(id)]
    if left:
        print(f"{label}: {len(left)} left in {STATE}; run it again later")
    elif not saved:
        os.remove(STATE)
        print(f"{label}: done")
    return given


def migrate():
    if restore(lambda id: id != TILE_EDITOR, "migrate"):
        print("migrated")


if __name__ == "__main__":
    {"restore": restore, "migrate": migrate}[sys.argv[1] if len(sys.argv) > 1 else ""]()
