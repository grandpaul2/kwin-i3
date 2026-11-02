#!/usr/bin/env python3
# make take-keys / make restore-keys: free the keys kwin-i3 registered
# that another shortcut holds (that one fires, kwin-i3's doesn't), and put them back.
#   take     for each kwin-i3 key whose firing holder (KGlobalAccel.action) is another action,
#            of a component that is active (an inactive one's key doesn't block kwin-i3's), and
#            that doesn't launch what kwin-i3's action launches (KRunner on the Launcher's key, the
#            default terminal on the Terminal's: the same thing fires either way):
#            save that holder's keys, then remove just that key from it. kwin-i3's action works
#            at once. A second run takes what is still taken and keeps the first save.
#   restore  give every saved holder its saved keys back where it still holds what kwin-i3 left
#            it ("set"); a holder changed since keeps the change, its old keys printed.
# The settings page's Keys (kcm/keys.cpp) writes the same save, the same way.
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


def take():
    loaded = call("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "isScriptLoaded", "s", "kwin-i3")
    if not loaded or not loaded[0]:
        sys.exit("take-keys: kwin-i3 is not loaded; its keys must exist first")
    infos = call("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component", "allShortcutInfos")[0]
    mine = [(k, i[0]) for i in infos if i[0].startswith("kwin-i3 ") for k in i[6] if k]
    terminal = subprocess.run(["kreadconfig6", "--file", "kdeglobals", "--group", "General", "--key", "TerminalService",
                               "--default", "org.kde.konsole.desktop"], capture_output=True, text=True).stdout.strip()

    def same_launch(action, h):   # as src/kwin.js sameLaunch: KRunner's on Launcher, the terminal's on Terminal
        if h[1] != "_launch":
            return False
        return (action == "kwin-i3 Launcher" and "krunner" in h[0]) or (action == "kwin-i3 Terminal" and h[0] == terminal)
    saved = json.load(open(STATE)) if os.path.exists(STATE) else {}
    took = 0
    for code, mine_action in mine:
        for _ in range(5):                 # a key several shortcuts hold: taken from each in turn
            h = holder(code)
            if not h or h[1].startswith("kwin-i3 ") or same_launch(mine_action, h) or not active(h[0]):
                break
            comp, action, friendly = h
            seqs = keys_of(comp, action)
            entry = saved.setdefault(comp + "|" + action, {"component": comp, "action": action, "keys": seqs})
            write(saved)                   # saved before each change, so a failure loses nothing
            set_keys(comp, action, [s for s in seqs if s[0] != code])
            entry["set"] = keys_of(comp, action)
            write(saved)
            now = holder(code)
            ok = not now or now[1].startswith("kwin-i3 ")
            print(f"  {name(code)}: taken from {friendly} ({comp})" + ("" if ok else f"; {now[2]} holds it too"))
            took += 1
    print(f"take-keys: {took} taken" + (f"; make restore-keys puts them back ({STATE})" if took else ", nothing was taken"))


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


def restore():
    if not os.path.exists(STATE):
        print("restore-keys: nothing saved")
        return
    saved = json.load(open(STATE))
    for id, e in list(saved.items()):
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
        write(saved)
    if saved:
        print(f"restore-keys: {len(saved)} left in {STATE}; run it again later")
    else:
        os.remove(STATE)
        print("restore-keys: done")


if __name__ == "__main__":
    {"take": take, "restore": restore}[sys.argv[1] if len(sys.argv) > 1 else ""]()
