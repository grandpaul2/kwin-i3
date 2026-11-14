#!/usr/bin/env python3
"""The foundation sweep's mechanical checks: what a script finds for free, before any agent runs.

Run from the repo root: python3 .claude/skills/foundation-sweep/check.py
Prints one line per finding, grouped by check. The finders are given this output as already
found, so they spend nothing on it. Read-only.
"""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path.cwd()
BEHAVIOUR = ROOT / "docs/behaviour.md"
STANDING = ["docs/behaviour.md", "docs/plan.md", "docs/philosophy.md", "docs/definitions.md",
            "docs/README.md", "README.md", "CONTRIBUTING.md", "AGENTS.md"]
MARKS = ("=", "≠", "+")
ROW = re.compile(r"\| ([A-Z]\d+[a-z]?) \|")
PIPE = re.compile(r"(?<!\\)\|")
REASON = re.compile(r"[Rr]easons? \(|\([a-g]\)")


def cells(line):
    return [c.strip() for c in PIPE.split(line)[1:-1]]


def rows():
    for n, line in enumerate(BEHAVIOUR.read_text().splitlines(), 1):
        m = ROW.match(line)
        if m:
            c = cells(line)
            marks = [x for x in c if x in MARKS]
            if marks:
                yield n, m.group(1), marks[-1], c[-1]


def check_marks(out):
    """A ≠ row names one of plan.md's reasons, or is being fixed; an = row admits no difference."""
    for n, rid, mark, note in rows():
        fixing = "being fixed" in note.lower()
        if mark == "≠" and not fixing and not REASON.search(note):
            out.append(f"behaviour.md:{n} {rid}: ≠ with no reason (a)-(g)")
        if mark == "=" and "≠" in note:
            out.append(f"behaviour.md:{n} {rid}: marked = but its note carries a ≠")


# Where a date is a session stamp, not a fact: the rules and rows, and the code's comments. The
# README (a version's date), definitions.md (the Stage's start) and CONTRIBUTING may date facts.
DATELESS = ["docs/behaviour.md", "docs/plan.md", "docs/philosophy.md", "docs/README.md", "AGENTS.md"]
COMMENTED = ["src/*.js", "plugin/*.cpp", "plugin/*.h"]


def check_stamps(out):
    """State, not history: no 'Before,' and no stage or review stamps in the standing docs, and
    no dates in the rules, the rows or the code's comments."""
    pat = re.compile(r"\b[Bb]efore, |Refinement stage|code review of|the spec's|Decided \d|built \d")
    date = re.compile(r"\b20\d\d-\d\d-\d\d\b")
    for f in STANDING:
        p = ROOT / f
        if not p.exists():
            continue
        for n, line in enumerate(p.read_text().splitlines(), 1):
            found = list(pat.finditer(line))
            if f in DATELESS:
                found += list(date.finditer(line))
            for m in found:
                out.append(f"{f}:{n}: '{m.group(0)}' ({line.strip()[:70]}...)")
    for g in COMMENTED:
        for p in sorted(ROOT.glob(g)):
            for n, line in enumerate(p.read_text().splitlines(), 1):
                c = line.find("//")
                if c >= 0 and date.search(line[c:]):
                    out.append(f"{p.relative_to(ROOT)}:{n}: a dated comment ({line.strip()[:70]}...)")


def check_tables(out):
    """Every row of a table has its header's column count (an unescaped | splits a cell)."""
    for f in STANDING:
        p = ROOT / f
        if not p.exists():
            continue
        want = None
        for n, line in enumerate(p.read_text().splitlines(), 1):
            if line.startswith("|"):
                k = len(PIPE.findall(line))
                if want is None:
                    want = k
                elif k != want:
                    out.append(f"{f}:{n}: {k - 1} cells where the header has {want - 1}")
            else:
                want = None


def check_settings(out):
    """behaviour.md §11's defaults against src/settings.js and main.xml, the code deciding."""
    js = (ROOT / "src/settings.js").read_text()
    code = dict(re.findall(r"^\s*(\w+): \{[^}]*?def: \"([^\"]*)\"", js, re.M))
    xml = {}
    for e in ET.parse(ROOT / "package/contents/config/main.xml").iter():
        if e.tag.endswith("entry"):
            d = next((c.text or "" for c in e if c.tag.endswith("default")), "")
            xml[e.get("name")] = d.strip()
    doc = {}
    sec = BEHAVIOUR.read_text().split("## 11. Settings", 1)[1].split("\n## ", 1)[0]
    for line in sec.splitlines():
        if line.startswith("| `"):
            c = cells(line)
            keys = re.findall(r"`(\w+)`", c[0])
            parts = [x.strip() for x in c[1].split(", ")]
            for i, key in enumerate(keys):  # a row of several keys pairs them with its defaults
                doc[key] = parts[i] if len(parts) == len(keys) else c[1]
    for key in sorted(code):
        if key not in doc:
            out.append(f"behaviour.md §11: no row for `{key}` (src/settings.js has it)")
            continue
        d = doc[key].strip("`").split(" (")[0].strip("`")
        if d.lower() not in (code[key].lower(), "empty" if code[key] == "" else "\0") and \
                not (code[key] in ("true", "false") and d in ("on", "off")):
            out.append(f"behaviour.md §11 `{key}`: {doc[key]!r}, the code {code[key]!r}")
        if key in xml and xml[key].lower() != code[key].lower() and \
                not (xml[key] == "" and code[key] == ""):
            out.append(f"main.xml `{key}`: {xml[key]!r}, src/settings.js {code[key]!r}")


def main():
    checks = [("marks and reasons", check_marks), ("history and stamps", check_stamps),
              ("table shape", check_tables), ("settings defaults", check_settings)]
    total = 0
    for name, fn in checks:
        out = []
        try:
            fn(out)
        except Exception as e:  # a check that breaks says so; the others still run
            out.append(f"(the check failed: {e})")
        print(f"## {name}: {len(out)}")
        for line in out:
            print("- " + line)
        total += len(out)
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
