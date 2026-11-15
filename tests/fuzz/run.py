#!/usr/bin/env python3
"""Fuzz kwin-i3 for a while: many seeds in parallel; new failures confirmed, shrunk separately.

  tests/fuzz/run.py [--minutes 20] [--jobs 4] [--budget 90] [--seed 1] [--skip I8,..]   (make fuzz)
  tests/fuzz/run.py --reshrink all|214,215   shrink the saved failures (make fuzz-shrink)

Every seed runs tests/fuzz/fuzz.py in its own headless test KWin. A failure with a signature in
tests/fuzz/known.txt (a bug already in OPEN.md) is counted and nothing more. A new one is
replayed twice (0 of 2: "flaky") and recorded; `--reshrink` then shrinks it (see shrink()) to
the shortest action list that still fails with the same signature, replayed 3 times for a rate.
Shrinking runs apart from the campaign: inside it, a failing seed would hold a job slot for as
long as it shrinks.
Results: tests/fuzz/out/REPORT.md, one section per signature; per seed, tests/fuzz/out/<seed>/,
and one console line per seed as it ends ("seed 12 ok", "seed 13 I10 ...") for whoever watches.
Only the first failure of each signature is confirmed and shrunk; the others are counted.
If the first FAIL_FAST seeds to end all fail with one signature, the campaign stops: that is the
setup (a stale invariant, a broken build), not a bug.
"""

import argparse
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out")
FUZZ = os.path.join(HERE, "fuzz.py")
MAX_TRIES = 150  # replays one shrink may spend
MAX_SHRINK = 1200  # and seconds
PAR = 3  # replays at once, per shrink
lock = threading.Lock()
SKIP = []  # ["--skip", codes] for every inner run
groups = {}  # signature -> {"seeds": [...], "state": "shrinking"/"done", ...}
FAIL_FAST = 8  # the first this many seeds failing alike stop the campaign
ended = []  # each finished seed's signature ("ok" for a clean one), in order
stop = threading.Event()
KNOWN = os.path.join(HERE, "known.txt")


def known_signatures():
    """Signatures of bugs already in OPEN.md: one per line, "#" comments; a line matches a
    signature it is a prefix of."""
    try:
        return [l.strip() for l in open(KNOWN) if l.strip() and not l.startswith("#")]
    except FileNotFoundError:
        return []


def inner(args, out, budget):
    shutil.rmtree(out, ignore_errors=True)
    env = dict(os.environ, KI3_TIMEOUT=str(int(budget + 40)))
    # The plugins too, when built (make fuzz builds them): the kwini3hold effect runs under the
    # same random actions as kwin-i3.
    plugins = os.path.join(ROOT, "plugin", "build", "bin")
    if os.path.isdir(plugins):
        env["KI3_PLUGIN"] = plugins
    subprocess.run(
        [os.path.join(ROOT, "tools", "testkwin.sh"), FUZZ]
        + args
        + SKIP
        + ["--out", out],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=budget + 60,
        check=False,
    )
    try:
        return json.load(open(os.path.join(out, "result.json")))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"ok": False, "harness": "no result (testkwin timed out or crashed)"}


def replay(actions, out):
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "in.json")
    Path(path).write_text(json.dumps({"actions": actions}))
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
            f.write(
                f"{time.strftime('%H:%M:%S')} {tries[0]:3d} tries  {len(actions):3d} actions  {msg}\n"
            )

    def first_failing(cands):
        """Replay candidates in parallel; the first (in order) that still fails, or None."""
        # Only real reductions: a candidate equal to the trace (dropping a kind it has none of)
        # would "still fail" and loop step 2 until MAX_TRIES ran out.
        cands = [c for c in cands if c and len(c) < len(actions)]
        if not cands or time.time() > stop:
            return None
        tries[0]

        def run1(c, n):  # counted when it starts, not when queued
            with lock:
                if not budget_left():
                    return False
                tries[0] += 1
            return fails_same(c, sig, os.path.join(work, f"try{n}"))

        # The first that fails is taken at once, not the first in order: waiting for a whole
        # batch of long replays costs minutes a step. Candidates come
        # shortest first, so the first to fail is near the best; the rest are dropped.
        ex = cf.ThreadPoolExecutor(PAR)
        batch[0] += 1
        futs = {
            ex.submit(run1, c, f"{batch[0]}.{i + 1}"): c for i, c in enumerate(cands)
        }
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
        got = first_failing(
            [
                actions[k:]
                for k in sorted(
                    {n * 7 // 8, n * 3 // 4, n // 2, n // 4, n // 8}, reverse=True
                )
                if 0 < k < n
            ]
        )  # shortest first
        if not got:
            break
        actions = got
        note("suffix")
    # 2. whole kinds of action
    changed = True
    while changed and budget_left():
        changed = False
        kinds = sorted(
            {(a["op"], a.get("name") if a["op"] == "key" else None) for a in actions},
            key=str,
        )
        cands = [
            [
                a
                for a in actions
                if (a["op"], a.get("name") if a["op"] == "key" else None) != k
            ]
            for k in kinds
        ]
        cands += [
            [a for a in actions if a["op"] != op] for op in ("key", "point", "drag")
        ]
        got = first_failing(sorted(cands, key=len))
        if got:
            actions, changed = got, True
            note("dropped a kind")
    # 3. ddmin
    n = 2
    while len(actions) >= 2 and budget_left():
        chunk = max(1, len(actions) // n)
        parts = [actions[i : i + chunk] for i in range(0, len(actions), chunk)]
        got = first_failing(
            [
                [a for j, p in enumerate(parts) if j != i for a in p]
                for i in range(len(parts))
            ]
        )
        if got:
            actions, n = got, max(n - 1, 2)
            note("ddmin")
        elif n >= len(actions):
            break
        else:
            n = min(len(actions), n * 2)
    # 4. one at a time
    while len(actions) > 1 and budget_left():
        got = first_failing(
            [actions[:i] + actions[i + 1 :] for i in range(len(actions))]
        )
        if not got:
            break
        actions = got
        note("single")
    note("done")
    return actions, tries[0]


def handle_failure(seed, out, r, confirm=True, do_shrink=True, skip_known=False):
    sig = r["signature"]
    with lock:
        g = groups.setdefault(
            sig, {"seeds": [], "state": None, "first": r["failures"][0]}
        )
        g["seeds"].append(seed)
        if g["state"]:
            return
        if skip_known and any(sig.startswith(k) for k in known_signatures()):
            g["state"] = "known (OPEN.md); not replayed"
            return
        g["state"] = "confirming"
    actions = json.loads(Path(out, "trace.json").read_text())["actions"][: r["steps"]]
    work = os.path.join(out, "shrink")
    again = (
        sum(fails_same(actions, sig, os.path.join(work, f"again{i}")) for i in range(2))
        if confirm
        else 1
    )
    if again == 0:
        with lock:
            g.update(state="flaky", seed=seed, actions=actions, rate="0/2 replays")
        return
    if not do_shrink:
        with lock:
            g.update(
                state="confirmed, not shrunk yet (make fuzz-shrink)",
                seed=seed,
                rate=f"{again}/2 replays",
            )
        return
    with lock:
        g["state"] = "shrinking"
    small, tries = shrink(actions, sig, work)
    rate = sum(
        fails_same(small, sig, os.path.join(work, f"final{i}")) for i in range(3)
    )
    Path(out, "shrunk.json").write_text(
        json.dumps({"signature": sig, "actions": small}, indent=1)
    )
    with lock:
        g.update(
            state="done",
            seed=seed,
            actions=small,
            rate=f"{rate}/3 replays",
            note=f"from {len(actions)} steps in {tries} tries",
        )


def run_seed(seed, budget):
    out = os.path.join(OUT, str(seed))
    r = inner(["gen", "--seed", str(seed), "--budget", str(budget)], out, budget)
    if r.get("signature"):
        handle_failure(seed, out, r, do_shrink=False, skip_known=True)
    elif r.get("harness"):
        with lock:
            groups.setdefault(
                "harness: " + r["harness"], {"seeds": [], "state": "harness"}
            )["seeds"].append(seed)
    else:
        with lock:
            groups.setdefault("ok", {"seeds": [], "state": "ok"})["seeds"].append(seed)
    sig = r.get("signature") or (
        "harness: " + r["harness"] if r.get("harness") else "ok"
    )
    with lock:
        ended.append(sig)
        print(f"seed {seed} {sig}", flush=True)
        first = ended[:FAIL_FAST]
        if (
            len(first) == FAIL_FAST
            and first[0] != "ok"
            and all(x == first[0] for x in first)
            and not stop.is_set()
        ):
            stop.set()
            print(
                f"STOPPING: the first {FAIL_FAST} seeds all failed with {first[0]}: the setup, not a bug",
                flush=True,
            )
    report()


def report():
    with lock:
        lines = ["# Fuzz report ({})".format(time.strftime("%Y-%m-%d %H:%M")), ""]
        ok = groups.get("ok", {}).get("seeds", [])
        lines.append(f"Clean seeds: {len(ok)}. Each section below is one signature.\n")
        for sig, g in sorted(groups.items()):
            if sig == "ok":
                continue
            lines.append(f"## {sig}\n")
            lines.append(
                "- seeds: {}; state: {}".format(
                    " ".join(map(str, g["seeds"])), g["state"]
                )
            )
            if g.get("first"):
                lines.append("- first message: `{}`".format(g["first"][1]))
            if g.get("rate"):
                lines.append("- reproduces: {} {}".format(g["rate"], g.get("note", "")))
            if g.get("actions"):
                lines.append(
                    "- actions (seed {}, `tests/fuzz/out/{}/shrunk.json`):\n".format(
                        g["seed"], g["seed"]
                    )
                )
                lines += ["      " + json.dumps(a) for a in g["actions"]]
            lines.append("")
        os.makedirs(OUT, exist_ok=True)
        Path(OUT, "REPORT.md").write_text("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=20)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument(
        "--budget", type=float, default=90, help="seconds of actions per seed"
    )
    ap.add_argument("--seed", type=int, default=1, help="first seed")
    ap.add_argument(
        "--skip", default="", help="invariants not to stop for (known bugs), e.g. I8"
    )
    ap.add_argument(
        "--reshrink",
        default="",
        help="seeds in tests/fuzz/out to shrink, e.g. 214,215, or all (every unshrunk new failure)",
    )
    a = ap.parse_args()
    if a.skip:
        SKIP[:] = ["--skip", a.skip]
    if a.reshrink:
        subprocess.run(
            [os.path.join(ROOT, "build.sh")], check=True, stdout=subprocess.DEVNULL
        )
        seeds = a.reshrink.split(",")
        if a.reshrink == "all":
            # Every saved failure that is new (not a known signature) and not shrunk yet, the
            # first seed per signature.
            seeds, seen = [], set()
            for d in sorted(
                os.listdir(OUT),
                key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else 0),
            ):
                try:
                    r = json.loads(Path(OUT, d, "result.json").read_text())
                except (FileNotFoundError, json.JSONDecodeError, NotADirectoryError):
                    continue
                sig = r.get("signature")
                if (
                    not sig
                    or sig in seen
                    or any(sig.startswith(k) for k in known_signatures())
                ):
                    continue
                if os.path.exists(os.path.join(OUT, d, "shrunk.json")):
                    seen.add(sig)
                    continue
                seen.add(sig)
                seeds.append(d)
            if not seeds:
                print("nothing to shrink: every saved failure is known or shrunk")
                return
            print("shrinking seeds " + ", ".join(seeds))

        def again(seed):
            out = os.path.join(OUT, seed)
            r = json.loads(Path(out, "result.json").read_text())
            shutil.rmtree(os.path.join(out, "shrink"), ignore_errors=True)
            handle_failure(int(seed), out, r, confirm=False)  # known to reproduce

        with cf.ThreadPoolExecutor(max(1, min(2, len(seeds)))) as ex:
            list(ex.map(again, seeds))
        report()
        print(Path(OUT, "REPORT.md").read_text())
        return
    subprocess.run(
        [os.path.join(ROOT, "build.sh")], check=True, stdout=subprocess.DEVNULL
    )
    end = time.time() + a.minutes * 60
    seed = a.seed
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        running = set()
        while (time.time() < end and not stop.is_set()) or running:
            while time.time() < end and not stop.is_set() and len(running) < a.jobs:
                running.add(ex.submit(run_seed, seed, a.budget))
                seed += 1
            done, running = cf.wait(running, return_when=cf.FIRST_COMPLETED)
            for f in done:
                f.result()
    report()
    print(Path(OUT, "REPORT.md").read_text())


if __name__ == "__main__":
    main()
