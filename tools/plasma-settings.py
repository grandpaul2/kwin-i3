#!/usr/bin/env python3
# make uninstall's give-back of the Plasma settings the settings page's Plasma Settings changed
# (kcm/setup.cpp writes the save, by the same rule): each key gets its old value back (deleted
# where it wasn't set) only where Plasma still has what kwin-i3 wrote; one changed since keeps the
# change, its old value printed. Then KWin re-reads its settings.
#   restore
# The save: $XDG_STATE_HOME/kwin-i3/plasma-settings.json (~/.local/state). Only kreadconfig6,
# kwriteconfig6, busctl and the standard library.
import json, os, subprocess, sys

STATE = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"),
                     "kwin-i3", "plasma-settings.json")


def raw(e):
    """The key as written, or None where it isn't set (kreadconfig6 can't tell "" from unset:
    --default with a value no setting has can)."""
    unset = "\x01kwin-i3-unset"
    v = subprocess.run(["kreadconfig6", "--file", e["file"], "--group", e["group"], "--key", e["key"],
                        "--default", unset], check=True, capture_output=True, text=True).stdout.rstrip("\n")
    return None if v == unset else v


def write(e, value):
    cmd = ["kwriteconfig6", "--notify", "--file", e["file"], "--group", e["group"], "--key", e["key"]]
    subprocess.run(cmd + (["--delete"] if value is None else [value]), check=True)


def restore():
    if not os.path.exists(STATE):
        print("plasma-settings: nothing saved")
        return
    saved = json.load(open(STATE))
    for id, e in list(saved.items()):
        where = f"{e['file']} [{e['group']}] {e['key']}"
        try:
            now = raw(e)
            if now == e["set"]:
                write(e, e["old"])
                print(f"  {where}: given back ({'unset' if e['old'] is None else e['old']})")
            elif now != e["old"]:
                print(f"  {where}: changed since kwin-i3 set it; left as it is (it was: {'unset' if e['old'] is None else e['old']})")
        except subprocess.CalledProcessError as err:
            print(f"  {where}: not given back ({err}); kept in the save")
            continue
        del saved[id]
    if saved:
        with open(STATE, "w") as f:
            json.dump(saved, f, indent=1)
        print(f"plasma-settings: {len(saved)} left in {STATE}")
    else:
        os.remove(STATE)
        print("plasma-settings: done")
    subprocess.run(["busctl", "--user", "call", "org.kde.KWin", "/KWin", "org.kde.KWin", "reconfigure"],
                   capture_output=True)


if __name__ == "__main__":
    {"restore": restore}[sys.argv[1] if len(sys.argv) > 1 else ""]()
