---
name: foundation-sweep
description: kwin-i3's foundation sweep - read the foundation docs against each other, behaviour.md against i3 4.24's source, and the code against behaviour.md; settle every finding from the docs, fix what they settle, and bring the maintainer only the conflicts between foundations. Run every so often, or after a stretch of building.
---

# The foundation sweep

The foundations (`docs/definitions.md`, `docs/philosophy.md`, `docs/plan.md`) and their
precedents (`docs/behaviour.md`'s rows, `plan.md`'s standing decisions) decide what kwin-i3 does;
the maintainer's decisions live in them (`philosophy.md`, "How a decision is made"). Building
drifts away from them: a stretch of work that follows i3 more closely, a rule changed in code
but not in its doc, a fact copied into a second home. The sweep finds that drift, settles each
piece from the docs, and leaves the maintainer only what the docs can't settle: **conflicts
between foundations, never individual issues**.

It runs in six steps. Steps 1 and 3 use agents (and step 5's round two); the rest is the session's own work, ending with an evaluation of the sweep itself. Any agent
can follow it: where it says "agent", use whatever sub-agent your harness has; never an
orchestrator whose cost can't be bounded at launch.

## 0. Prepare

1. **i3's source, pinned**: the 4.24 release (`plan.md`, "i3 means the 4.24 release"), checked
   out once outside the repo:
   `git clone -q --depth 1 --branch 4.24 https://github.com/i3/i3 ~/.cache/i3-4.24`
   (`git -C ~/.cache/i3-4.24 describe --tags` says `4.24`). Every i3 citation is
   `src/<file>.c:<line>` in that tree.
2. **KWin's source, the installed version** (`rpm -q kwin`, `pacman -Q kwin`), for any reason (a)
   "KWin can't" a finding questions: `invent.kde.org/plasma/kwin/-/raw/v<version>/src/...`.
   `docs/kwin-notes.md` first: most of what KWin can't do is already there.
3. **The base**: the last sweep is the last commit whose subject starts `Foundation sweep:`
   (`git log -1 --grep='^Foundation sweep:' --format=%h`; before the first one, `531b86b`, the
   foundations' rewrite). `git log --oneline BASE..HEAD` and
   `git diff --stat BASE..HEAD -- docs src plugin kcm widget` show what changed since; each
   brief gets that list, so agents read the whole area but look hardest where it moved.
4. **A working directory outside the repo** (the session's scratch directory) holding one file
   per area, so the findings survive the session's context. Nothing from it enters the tree
   (`docs/README.md`: a review is not kept as a file).

## 1. Find (agents, in the background)

One agent per area, launched together; the briefs are in `briefs.md` beside this file, each
given the base, the change list, the i3 path and the output file. Five areas by default:

| area | reads | against |
|---|---|---|
| A. The foundations | `definitions.md`, `philosophy.md`, `plan.md`, `docs/README.md`, `AGENTS.md`'s doc rules; the words a user reads (`README.md`, `CONTRIBUTING.md`, the settings page `kcm/ui/`, the widget) | each other, i3's source, the code for the user's words |
| B. The i3 side | every `behaviour.md` row with an i3 mark (=, ≠, +) | i3 4.24's source; `plan.md`'s reasons (a)-(e) |
| C1. The model | `src/tree.js`, `outputs.js`, `workspaces.js`, `rules.js`, `placement.js`, `settings.js` | `behaviour.md` §2-4, §11 |
| C2. The KWin seam | `src/kwin.js` | `behaviour.md` §5, §6, §10, §12-14 |
| C3. The plugins | `plugin/*.cpp` | `behaviour.md` §1, §7-9 |

Fewer when little changed (merge C1 into C2); never more than six finders. The person stays
reachable while they run: answer them, and read each area's file as its agent finishes.

**A finding** (every agent writes them in this shape):

```
### <area><n>. <one line>
- class: conflict | home | i3 | reason | code | words | word | hole
- where: <doc:line or row id>, <the other doc:line, row or src function>
- says / is: what the doc says; what is true, with the evidence (i3 file:line, src function,
  KWin file:line)
- severity: high (misleads a decision or a user, or the code breaks a rule) | medium | low
- settles by: step 1-4 of "How a decision is made" and how, or "step 5" and why not 1-4
```

The classes: **conflict** two docs say opposite things; **home** a fact in two homes or the
wrong one (`docs/README.md`); **i3** i3 misstated or a citation wrong; **reason** a ≠ with no
reason (a)-(e), a reason that doesn't hold, or an = that is a ≠; **code** the code and
`behaviour.md` disagree; **words** what a user reads isn't true of the code; **word** a word not
`definitions.md`'s; **hole** a case the foundations don't settle, or settle two ways.

## 2. Settle (the session)

Merge duplicates across areas. Then, for each finding, run `philosophy.md`'s steps 1-4 yourself:

- **Settled by the docs, or by i3's source for something in scope**: it is a fix. Doc wrong:
  edit the doc. Code wrong: an `OPEN.md` item (one per behaviour) with i3's file:line and the
  doc row it breaks, or one stage of a build plan if there are many.
- **A hole step 4 can close** (the premise, i3's source, what KWin allows, the precedents
  settle it): the missing principle written into its home, as a proposal in the report.
- **Step 5 only**: two foundations that genuinely conflict, or the product's direction. These
  are the maintainer's.

## 3. Check (agents)

Every finding of severity high, every finding settled as a code fix, every reason finding and
every step-5 conflict goes to a **checker**: one or two agents not shown the finder's
conclusion, given only the claim and its citations, asked to confirm or refute each from the
sources (`briefs.md`, "Checker"). A refuted finding goes; a partial one is restated as checked.
Medium and low doc-only findings are checked by the session as it fixes them.

## 4. Report to the maintainer

In the conversation, not a file. Short, numbered once, each number one topic:

1. **The conflicts** (step 5 only), grouped by the foundation they would change. Each: the two
   sides, cited; i3's way (file:line); the precedents (row ids, decision numbers); the reasons
   (a)-(e) that bear; **the recommendation, written as the edit to the foundation**, with cost
   against value. Never as options away from i3 (`AGENTS.md`, "Follow the docs").
2. **The holes closed at step 4**: each one line, the principle written and where.
3. **Fixed without asking**: counts per class and per doc, one line each; the notable ones named.
4. **Code mismatches**: the `OPEN.md` items or build-plan stages proposed, a line each. Code
   changes need the go; nothing goes live without the desktop owner's go.

## 5. Fix, then review again

- **Docs**: commit as settled, grouped by doc, the commit saying why; the conflicts' edits once
  the maintainer answers. A rule change edits its foundation in the same commit
  (`philosophy.md`, "The foundations stay true").
- **Code**: by `AGENTS.md` and `docs/testing.md`'s lean runs: the go, the build, `make unit` and
  the changed scenarios, the go to reload. Long runs in the background with a recurring check.
- **Round two**: one fresh agent reads the edited foundations and the changed rows
  (`briefs.md`, "Round two"); its high findings are settled and fixed the same way. Two rounds
  at most; a third round's finding goes into `OPEN.md`.
- **Close**: the last commit's subject starts `Foundation sweep:` and says what the sweep
  covered (the base, the areas, the counts): the next sweep's base.

## 6. Evaluate the sweep

A sweep runs only once in a while, so each one is judged at its end, and the judgement improves
this skill for the next. Keep a tally from step 1 on, in the working directory, so the numbers
are measured, not remembered. Per area:

- **Yield**: findings, and how many survived settling and checking as real (fixed, a hole
  closed, a conflict). A finder whose findings were mostly refuted, duplicates or low needs a
  sharper brief; one that found nothing may cover too little or too much.
- **Precision**: refuted by the checker, or found wrong while fixing; the kind of mistake
  (cited from memory, read the wrong function, an inference stated as fact).
- **Misses**: what round two, the fixing, or the maintainer found that its area should have
  caught. A miss is the strongest signal: name the brief line that would have caught it.
- **Settling**: the conflicts the maintainer answered against the recommendation, and the
  findings settled at steps 1-4 that the maintainer would have settled otherwise. Either means
  a foundation, or the settling rule here, is unclear.
- **Cost**: agents run, against the budget; each agent's tokens and time where the harness
  reports them.

Then a short evaluation in the conversation: what worked, what didn't, and **each proposed change
to `SKILL.md` or `briefs.md` as the edit itself** (an area split or merged, a brief line added
or cut, a class or a step changed, the budget). With the maintainer's go, the edits go in the
same `Foundation sweep:` commit. The tally itself stays out of the tree; only the improved skill
lands.

## Budget

Five finders, one or two checkers, one or two round-two readers: seven to nine agents, in small
batches, each read by the session. Say the count before launching; ask before going past it.
