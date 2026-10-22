#!/usr/bin/env python3
"""Fuzz kwin-i3 for a while: many seeds in parallel, each failure replayed and shrunk.

  tests/fuzz/run.py [--minutes 20] [--jobs 4] [--budget 90] [--seed 1] [--skip I8,..]   (make fuzz)

Every seed runs tests/fuzz/fuzz.py in its own headless test KWin. A failure is replayed twice
(0 of 2: "flaky", kept but not shrunk), then shrunk by delta debugging to the shortest action
list that still fails with the same signature, and that list is replayed 3 times for a rate.
Results: tests/fuzz/out/REPORT.md, one section per signature; per seed, tests/fuzz/out/<seed>/.
Only the first failure of each signature is shrunk; the others are counted.
"""
import argparse, concurrent.futures as cf, json, os, shutil, subprocess, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
FUZZ = os.path.join(HERE, "fuzz.py")
MAX_TRIES = 40               # replays one shrink may spend
MAX_SHRINK = 600             # and seconds
lock = threading.Lock()
SKIP = []                    # ["--skip", codes] for every inner run
groups = {}                  # signature -> {"seeds": [...], "state": "shrinking"/"done", ...}


def inner(args, out, budget):
    shutil.rmtree(out, ignore_errors=True)
    env = dict(os.environ, KI3_TIMEOUT=str(int(budget + 40)))
    subprocess.run([os.path.join(ROOT, "tools", "testkwin.sh"), FUZZ] + args + SKIP + ["--out", out],
                   env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=budget + 60)
    try:
        return json.load(open(os.path.join(out, "result.json")))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"ok": False, "harness": "no result (testkwin timed out or crashed)"}


def replay(actions, out):
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "in.json")
    json.dump({"actions": actions}, open(path, "w"))
    budget = 20 + 3 * len(actions)
    return inner(["replay", path], os.path.join(out, "run"), budget)


def fails_same(actions, sig, out):
    r = replay(actions, out)
    return r.get("signature") == sig


def ddmin(actions, sig, work):
    """Zeller's delta debugging, over actions, with a cap on replays."""
    tries = [0]
    stop = time.time() + MAX_SHRINK
    def test(c):
        if time.time() > stop:
            tries[0] = MAX_TRIES
            return False
        tries[0] += 1
        return fails_same(c, sig, os.path.join(work, "try%d" % tries[0]))
    n = 2
    while len(actions) >= 2 and tries[0] < MAX_TRIES:
        chunk = max(1, len(actions) // n)
        parts = [actions[i:i + chunk] for i in range(0, len(actions), chunk)]
        reduced = False
        for i in range(len(parts)):
            if tries[0] >= MAX_TRIES:
                break
            rest = [a for j, p in enumerate(parts) if j != i for a in p]
            if rest and test(rest):
                actions, n, reduced = rest, max(n - 1, 2), True
                break
        if not reduced:
            if n >= len(actions):
                break
            n = min(len(actions), n * 2)
    return actions, tries[0]


def handle_failure(seed, out, r):
    sig = r["signature"]
    with lock:
        g = groups.setdefault(sig, {"seeds": [], "state": None, "first": r["failures"][0]})
        g["seeds"].append(seed)
        if g["state"]:
            return
        g["state"] = "shrinking"
    actions = json.load(open(os.path.join(out, "trace.json")))["actions"][:r["steps"]]
    work = os.path.join(out, "shrink")
    again = sum(fails_same(actions, sig, os.path.join(work, "again%d" % i)) for i in range(2))
    if again == 0:
        with lock:
            g.update(state="flaky", seed=seed, actions=actions, rate="0/2 replays")
        return
    small, tries = ddmin(actions, sig, work)
    rate = sum(fails_same(small, sig, os.path.join(work, "final%d" % i)) for i in range(3))
    json.dump({"signature": sig, "actions": small}, open(os.path.join(out, "shrunk.json"), "w"), indent=1)
    with lock:
        g.update(state="done", seed=seed, actions=small, rate="%d/3 replays" % rate,
                 note="from %d steps in %d tries" % (len(actions), tries))


def run_seed(seed, budget):
    out = os.path.join(OUT, str(seed))
    r = inner(["gen", "--seed", str(seed), "--budget", str(budget)], out, budget)
    if r.get("signature"):
        handle_failure(seed, out, r)
    elif r.get("harness"):
        with lock:
            groups.setdefault("harness: " + r["harness"], {"seeds": [], "state": "harness"})["seeds"].append(seed)
    else:
        with lock:
            groups.setdefault("ok", {"seeds": [], "state": "ok"})["seeds"].append(seed)
    report()


def report():
    with lock:
        lines = ["# Fuzz report (%s)" % time.strftime("%Y-%m-%d %H:%M"), ""]
        ok = groups.get("ok", {}).get("seeds", [])
        lines.append("Clean seeds: %d. Each section below is one signature.\n" % len(ok))
        for sig, g in sorted(groups.items()):
            if sig == "ok":
                continue
            lines.append("## %s\n" % sig)
            lines.append("- seeds: %s; state: %s" % (" ".join(map(str, g["seeds"])), g["state"]))
            if g.get("first"):
                lines.append("- first message: `%s`" % g["first"][1])
            if g.get("rate"):
                lines.append("- reproduces: %s %s" % (g["rate"], g.get("note", "")))
            if g.get("actions"):
                lines.append("- actions (seed %s, `tests/fuzz/out/%s/shrunk.json`):\n" % (g["seed"], g["seed"]))
                lines += ["      " + json.dumps(a) for a in g["actions"]]
            lines.append("")
        os.makedirs(OUT, exist_ok=True)
        open(os.path.join(OUT, "REPORT.md"), "w").write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=20)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--budget", type=float, default=90, help="seconds of actions per seed")
    ap.add_argument("--seed", type=int, default=1, help="first seed")
    ap.add_argument("--skip", default="", help="invariants not to stop for (known bugs), e.g. I8")
    a = ap.parse_args()
    if a.skip:
        SKIP[:] = ["--skip", a.skip]
    subprocess.run([os.path.join(ROOT, "build.sh")], check=True, stdout=subprocess.DEVNULL)
    end = time.time() + a.minutes * 60
    seed = a.seed
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        running = set()
        while time.time() < end or running:
            while time.time() < end and len(running) < a.jobs:
                running.add(ex.submit(run_seed, seed, a.budget)); seed += 1
            done, running = cf.wait(running, return_when=cf.FIRST_COMPLETED)
            for f in done:
                f.result()
    report()
    print(open(os.path.join(OUT, "REPORT.md")).read())


if __name__ == "__main__":
    main()
