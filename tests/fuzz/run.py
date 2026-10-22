#!/usr/bin/env python3
"""Fuzz kwin-i3 for a while: many seeds in parallel, each failure replayed and shrunk.

  tests/fuzz/run.py [--minutes 20] [--jobs 4] [--budget 90] [--seed 1] [--skip I8,..]   (make fuzz)

Every seed runs tests/fuzz/fuzz.py in its own headless test KWin. A failure is replayed twice
(0 of 2: "flaky", kept but not shrunk), then shrunk (see shrink()) to the shortest action list
that still fails with the same signature, and that list is replayed 3 times for a rate.
  tests/fuzz/run.py --reshrink 214,215    shrink saved failures again (after a shrinker change)
Results: tests/fuzz/out/REPORT.md, one section per signature; per seed, tests/fuzz/out/<seed>/.
Only the first failure of each signature is shrunk; the others are counted.
"""
import argparse, concurrent.futures as cf, json, os, shutil, subprocess, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
FUZZ = os.path.join(HERE, "fuzz.py")
MAX_TRIES = 150              # replays one shrink may spend
MAX_SHRINK = 1200            # and seconds
PAR = 3                      # replays at once, per shrink
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


def shrink(actions, sig, work):
    """Shortest action list that still fails with sig. Replays run PAR at a time, in rounds:
    1. the shortest failing suffix (most of a long trace is history the failure doesn't need);
    2. whole kinds of action dropped at once (every pointer move, every key of one name, ...);
    3. delta debugging (Zeller's ddmin) over what is left;
    4. single actions, one at a time, until none can go.
    Capped at MAX_TRIES replays and MAX_SHRINK seconds; progress goes to <work>/progress.txt."""
    os.makedirs(work, exist_ok=True)
    tries, batch, stop = [0], [0], time.time() + MAX_SHRINK
    def note(msg):
        with open(os.path.join(work, "progress.txt"), "a") as f:
            f.write("%s %3d tries  %3d actions  %s\n" % (time.strftime("%H:%M:%S"), tries[0], len(actions), msg))
    def first_failing(cands):
        """Replay candidates in parallel; the first (in order) that still fails, or None."""
        cands = [c for c in cands if c]
        if not cands or time.time() > stop:
            return None
        base = tries[0]
        def run1(c, n):                         # counted when it starts, not when queued
            with lock:
                if not budget_left():
                    return False
                tries[0] += 1
            return fails_same(c, sig, os.path.join(work, "try%s" % n))
        # The first that fails is taken at once, not the first in order: waiting for a whole
        # batch of ~25 long replays cost 12 minutes a step (2026-10-22). Candidates come
        # shortest first, so the first to fail is near the best; the rest are dropped.
        ex = cf.ThreadPoolExecutor(PAR)
        batch[0] += 1
        futs = {ex.submit(run1, c, "%d.%d" % (batch[0], i + 1)): c for i, c in enumerate(cands)}
        got = None
        for f in cf.as_completed(futs):
            if f.result():
                got = futs[f]
                break
        ex.shutdown(wait=got is None, cancel_futures=True)
        return got
    def budget_left():
        return tries[0] < MAX_TRIES and time.time() < stop
    note("start")
    # 1. suffixes, longest cut first
    while len(actions) > 4 and budget_left():
        n = len(actions)
        got = first_failing([actions[k:] for k in sorted({n * 7 // 8, n * 3 // 4, n // 2, n // 4, n // 8}, reverse=True) if 0 < k < n])   # shortest first
        if not got:
            break
        actions = got
        note("suffix")
    # 2. whole kinds of action
    changed = True
    while changed and budget_left():
        changed = False
        kinds = sorted({(a["op"], a.get("name") if a["op"] == "key" else None) for a in actions}, key=str)
        cands = [[a for a in actions if (a["op"], a.get("name") if a["op"] == "key" else None) != k] for k in kinds]
        cands += [[a for a in actions if a["op"] != op] for op in ("key", "point", "drag")]
        got = first_failing(sorted(cands, key=len))
        if got:
            actions, changed = got, True
            note("dropped a kind")
    # 3. ddmin
    n = 2
    while len(actions) >= 2 and budget_left():
        chunk = max(1, len(actions) // n)
        parts = [actions[i:i + chunk] for i in range(0, len(actions), chunk)]
        got = first_failing([[a for j, p in enumerate(parts) if j != i for a in p] for i in range(len(parts))])
        if got:
            actions, n = got, max(n - 1, 2)
            note("ddmin")
        elif n >= len(actions):
            break
        else:
            n = min(len(actions), n * 2)
    # 4. one at a time
    while len(actions) > 1 and budget_left():
        got = first_failing([actions[:i] + actions[i + 1:] for i in range(len(actions))])
        if not got:
            break
        actions = got
        note("single")
    note("done")
    return actions, tries[0]


def handle_failure(seed, out, r, confirm=True):
    sig = r["signature"]
    with lock:
        g = groups.setdefault(sig, {"seeds": [], "state": None, "first": r["failures"][0]})
        g["seeds"].append(seed)
        if g["state"]:
            return
        g["state"] = "shrinking"
    actions = json.load(open(os.path.join(out, "trace.json")))["actions"][:r["steps"]]
    work = os.path.join(out, "shrink")
    again = sum(fails_same(actions, sig, os.path.join(work, "again%d" % i)) for i in range(2)) if confirm else 1
    if again == 0:
        with lock:
            g.update(state="flaky", seed=seed, actions=actions, rate="0/2 replays")
        return
    small, tries = shrink(actions, sig, work)
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
    ap.add_argument("--reshrink", default="", help="seeds in tests/fuzz/out to shrink again, e.g. 214,215")
    a = ap.parse_args()
    if a.skip:
        SKIP[:] = ["--skip", a.skip]
    if a.reshrink:
        subprocess.run([os.path.join(ROOT, "build.sh")], check=True, stdout=subprocess.DEVNULL)
        def again(seed):
            out = os.path.join(OUT, seed)
            r = json.load(open(os.path.join(out, "result.json")))
            shutil.rmtree(os.path.join(out, "shrink"), ignore_errors=True)
            handle_failure(int(seed), out, r, confirm=False)   # known to reproduce
        with cf.ThreadPoolExecutor(len(a.reshrink.split(","))) as ex:
            list(ex.map(again, a.reshrink.split(",")))
        report()
        print(open(os.path.join(OUT, "REPORT.md")).read())
        return
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
