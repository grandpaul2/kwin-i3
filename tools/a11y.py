#!/usr/bin/env python3
"""What a screen reader gets from an app in the test KWin, through AT-SPI
(docs/spec-settings-cleanup.md, "Tests"). Run inside tools/testkwin.sh after a11y_start
(tests/live/lib.sh), which gives the test its own accessibility bus.

  a11y.py dump APP                  the tree: [role] name, description, flags, labelled-by
  a11y.py audit APP PAGE            every control on the page titled PAGE named (its own name or
                                    its label's), no two alike, no empty heading; prints each
                                    failure, status 1 if any
  a11y.py box APP PAGE NAME         scroll NAME into view; print its centre "x y", window coords
                                    (PAGE "-": anywhere in the app, as the shell's Navigate Back)
  a11y.py focused APP               the name of the control with the keyboard focus
  a11y.py focus APP PAGE NAME       give NAME the keyboard focus (no click: a click opens a combo box)
  a11y.py names APP PAGE            every control's name, one per line, in tree order
  a11y.py enabled APP PAGE          the same, enabled and focusable ones only (what Tab should reach)

A control's name is what a screen reader says for it: its own accessible name, else the text of
the label it is labelled by (Kirigami's FormLayout links each field to its label), without the
label's colon. Only visible controls count (a hidden inline message's buttons don't).
"""
import sys
import time

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

CONTROLS = {"push button", "button", "check box", "radio button", "combo box", "spin button",
            "toggle button", "slider", "text", "color chooser"}
S = Atspi.StateType


def children(a):
    try:
        return [a.get_child_at_index(i) for i in range(a.get_child_count())]
    except Exception:
        return []


def walk(a, parent=None, seen=None):
    # Qt shows a window's tree twice, under the application and under the window: each object
    # once, by its path.
    seen = set() if seen is None else seen
    if a.path in seen:
        return
    seen.add(a.path)
    yield a, parent
    for c in children(a):
        yield from walk(c, a, seen)


def has(a, state):
    try:
        return a.get_state_set().contains(state)
    except Exception:
        return False


def labelled_by(a):
    try:
        for r in a.get_relation_set() or []:
            if r.get_relation_type() == Atspi.RelationType.LABELLED_BY and r.get_n_targets():
                return r.get_target(0).get_name() or ""
    except Exception:
        pass
    return ""


def name(a):
    own = a.get_name() or ""
    return own if own else labelled_by(a).rstrip(":").strip()


def is_control(a, parent):
    role = a.get_role_name()
    if role not in CONTROLS:
        return False
    # A spin box's or combo box's own text part, and a label's text, are parts of another
    # control, which carries the name.
    if role == "text" and parent is not None and parent.get_role_name() in ("spin button", "combo box", "label"):
        return False
    return True


def app_named(n):
    desk = Atspi.get_desktop(0)
    for _ in range(100):
        for a in children(desk):
            if a.get_name() == n:
                return a
        time.sleep(0.1)
    sys.exit(f"a11y: no app {n!r} on the accessibility bus")


def controls(app):
    return [a for a, p in walk(app) if is_control(a, p)]


def page(app, title):
    """The page titled TITLE: kcmshell6 puts each page (the main one, a pushed sub-page) in a panel
    named for its title, and keeps the main page in the tree under a sub-page."""
    for _ in range(50):
        for a, _ in walk(app):
            if a.get_role_name() == "panel" and a.get_name() == title and has(a, S.SHOWING):
                return a
        time.sleep(0.1)
    sys.exit(f"a11y: no page {title!r} showing")


def scroll_bars(app):
    return [b for b, _ in walk(app) if b.get_role_name() == "scroll bar" and has(b, S.SHOWING)
            and b.get_maximum_value() > b.get_minimum_value()]


def page_controls(app):
    """The controls under APP (a page, so not the shell's toolbar and buttons) that are shown:
    Qt marks a control scrolled out of view as not visible, as it does a hidden one, so the page
    is scrolled top to bottom and a control visible at any point counts (a list view creates its
    rows only as they come into view, so this finds those too). Left at the top."""
    found = {}
    def look():
        # What each one is, read when first seen: a list view deletes the rows it scrolls past.
        for a, p in walk(app):
            try:
                if a.path not in found and has(a, S.VISIBLE) and (is_control(a, p) or empty_heading(a, p)):
                    found[a.path] = {"name": name(a), "role": a.get_role_name(), "desc": a.get_description() or "",
                                     "enabled": has(a, S.ENABLED) and has(a, S.FOCUSABLE)}
            except Exception:
                pass
    bars = scroll_bars(app)
    look()
    for b in bars:
        lo, hi = b.get_minimum_value(), b.get_maximum_value()
        for i in range(0, 11):
            b.set_current_value(lo + (hi - lo) * i / 10)
            time.sleep(0.1)
            look()
        b.set_current_value(lo)
        time.sleep(0.1)
    return list(found.values())


def empty_heading(a, parent):
    # Kirigami's FormLayout gives every row a heading for its label, empty for a row without one.
    return a.get_role_name() == "heading" and not (a.get_name() or "").strip() \
        and parent is not None and parent.get_role_name() == "form"


def ancestors(a):
    out = []
    try:
        p = a.get_parent()
        while p is not None and len(out) < 64:
            out.append(p)
            p = p.get_parent()
    except Exception:
        pass
    return out


def dump(app):
    depth = {}
    for a, p in walk(app):
        d = depth[a] = depth.get(p, -1) + 1 if p is not None else 0
        flags = "".join(c for c, s in (("F", S.FOCUSABLE), ("f", S.FOCUSED), ("e", S.ENABLED),
                                         ("V", S.VISIBLE), ("s", S.SHOWING)) if has(a, s))
        desc = a.get_description() or ""
        lb = labelled_by(a)
        print("  " * d + f"[{a.get_role_name()}] {a.get_name() or ''!r}"
              + (f" desc={desc!r}" if desc else "") + f" {flags}" + (f" labelledby={lb!r}" if lb else ""))


def audit(app):
    bad = []
    seen = {}
    found = page_controls(app)
    if not [c for c in found if c["role"] != "heading"]:
        bad.append("no controls found: nothing was audited")
    for c in found:
        n, role = c["name"], c["role"]
        if role == "heading":
            bad.append("an empty heading in the form (a row without a label)")
        elif not any(c.isalpha() for c in n) and n:
            bad.append(f"{role} named only {n!r}, which says nothing about what it is")
        elif not n:
            bad.append(f"unnamed {role}" + (f" (description {c['desc']!r})" if c["desc"] else ""))
        else:
            seen.setdefault(n, []).append(role)
    bad += [f"{len(r)} controls named {n!r} ({', '.join(r)})" for n, r in seen.items() if len(r) > 1]
    for b in bad:
        print(b)
    return 1 if bad else 0


def find(app, n):
    hits = [a for a, p in walk(app) if is_control(a, p) and name(a) == n]
    if not hits:
        sys.exit(f"a11y: no control named {n!r}")
    return hits[0]


def viewport(app):
    """The page's visible band, top and bottom in window coordinates: its vertical scroll bar spans
    it (the shell's header and buttons cover the rest of the window)."""
    for b in scroll_bars(app):
        e = b.get_extents(Atspi.CoordType.WINDOW)
        if e.height > e.width:
            return e.y, e.y + e.height
    return 0, 100000


def in_view(a, h):
    e = a.get_extents(Atspi.CoordType.WINDOW)
    return has(a, S.SHOWING) and e.y >= h[0] and e.y + e.height <= h[1]


def fixed(app, a):
    """True for a control that scrolling doesn't move (in the page's header, say)."""
    bars = scroll_bars(app)
    if not bars:
        return True
    b = bars[0]
    v, y = b.get_current_value(), a.get_extents(Atspi.CoordType.WINDOW).y
    b.set_current_value(b.get_minimum_value() if v > b.get_minimum_value() else b.get_maximum_value())
    time.sleep(0.2)
    moved = a.get_extents(Atspi.CoordType.WINDOW).y != y
    b.set_current_value(v)
    time.sleep(0.2)
    return not moved


def box(app, n):
    a = find(app, n)
    h = viewport(app)
    if not in_view(a, h) and has(a, S.SHOWING) and fixed(app, a):
        h = (-100000, 100000)
    if not in_view(a, h):
        # The page's vertical scroll bar, set through its value (0-100) until the control is in
        # view: the injected wheel can't scroll (tools/ei-send).
        for b in scroll_bars(app):
            lo, hi = b.get_minimum_value(), b.get_maximum_value()
            for i in range(0, 21):
                b.set_current_value(lo + (hi - lo) * i / 20)
                time.sleep(0.05)
                if in_view(a, h):
                    break
            if in_view(a, h):
                break
        time.sleep(0.3)                          # the page settles after the jump
    e = a.get_extents(Atspi.CoordType.WINDOW)
    if not in_view(a, h):
        sys.exit(f"a11y: {n!r} can't be scrolled into view (at {e.x},{e.y})")
    print(e.x + e.width // 2, e.y + e.height // 2)


def focused(app):
    # The focused control, not the focused containers around it.
    hits = [a for a, p in walk(app) if has(a, S.FOCUSED) and is_control(a, p)]
    print(name(hits[-1]) if hits else "")


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, app = sys.argv[1], app_named(sys.argv[2])
    if cmd == "dump":
        dump(app)
    elif cmd == "audit":
        sys.exit(audit(page(app, sys.argv[3])))
    elif cmd == "box":
        box(app if sys.argv[3] == "-" else page(app, sys.argv[3]), sys.argv[4])
    elif cmd == "focused":
        focused(app)
    elif cmd == "focus":
        a = find(page(app, sys.argv[3]), sys.argv[4])
        sys.exit(0 if a.grab_focus() else f"a11y: {sys.argv[4]!r} won't take the focus")
    elif cmd == "names":
        for c in page_controls(page(app, sys.argv[3])):
            if c["role"] != "heading":
                print(c["name"])
    elif cmd == "enabled":
        for c in page_controls(page(app, sys.argv[3])):
            if c["enabled"] and c["role"] != "heading":
                print(c["name"])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
