# The foundation sweep's briefs

Each agent gets the **common part** and its area's part, with `REPO` (the checkout), `BASE`,
`CHANGES` (the commit list and diff stat since the base), `I3` (`~/.cache/i3-4.24`), `KWIN` (the
installed version, and the paths of any KWin files fetched in step 0), `CHECKED` (`check.py`'s
output after its fixes, usually empty) and `OUT` (its output file) filled in. The agent knows
only what its brief says. The C areas get the **short** common part.

## Common part (every finder)

> You are reading kwin-i3, i3's window management as a KWin script and two KWin plugins, in
> `REPO` (read-only: change nothing, run no test, reload nothing). Read
> `AGENTS.md`, then `docs/README.md` (one home per fact), `docs/definitions.md` (the words),
> `docs/philosophy.md` (above all "How a decision is made") and `docs/plan.md` (the scope, the
> reasons (a)-(g) a difference from i3 may have, the standing decisions).
>
> **The short version, for the C areas**, in place of the paragraph above: read
> `docs/definitions.md` (the words) and, in `docs/plan.md`, "Scope" (the In and Out lists and
> the reasons (a)-(g)); nothing else of the foundations. Your job is the code against its rows.
>
> A script has already checked the marks, the reasons' letters, history in the docs, the
> tables' shape and §11's defaults; don't report those. What it left: `CHECKED`. Own only your
> area's facts (below): a fact another area owns, report only if it is high.
>
> i3 means its 4.24 release, checked out at `I3`: cite `src/<file>.c:<line>` from there, never
> from memory and never `next`. KWin is version `KWIN`; for "KWin can't" read
> `docs/kwin-notes.md` first, then `invent.kde.org/plasma/kwin/-/raw/v<KWIN>/src/...`.
>
> Your job is to find where the docs, i3 and the code disagree in your area, below. Since the
> last sweep (`BASE`) these changed: `CHANGES`. Read the whole area, but look hardest there.
> Look for what is wrong, not what is right: report no confirmations, and nothing outside your
> area unless it is high.
>
> Write each finding to `OUT` as you go, in this shape:
>
> ```
> ### <area><n>. <one line>
> - class: conflict | home | i3 | reason | code | words | word | hole
> - where: <doc:line or row id>, <the other doc:line, row or src function>
> - says / is: what the doc says; what is true, with the evidence (i3 file:line, src function,
>   KWin file:line)
> - severity: high | medium | low
> - settles by: step 1-4 of "How a decision is made" and how, or "step 5" and why not 1-4
> ```
>
> Classes: conflict (two docs say opposite things), home (a fact in two homes or the wrong one),
> i3 (i3 misstated or a citation wrong), reason (a ≠ with no reason (a)-(g), a reason that
> doesn't hold, or an = that is a ≠), code (code and `docs/behaviour.md` disagree), words (what
> a user reads isn't true of the code), word (not `definitions.md`'s word), hole (a case the
> foundations don't settle, or settle two ways). High: it misleads a decision or a user, or the
> code breaks a rule. A guess is not a finding: say what you read, and mark an inference as one.
>
> Your final message: the count per class and severity, and the high ones in a line each.

## A. The foundations

> Your area: the foundation docs against each other, and the words a user reads.
> 1. `definitions.md`, `philosophy.md`, `plan.md`, `docs/README.md`, and `AGENTS.md`'s rules:
>    contradictions, `AGENTS.md`'s restatements of the decision steps included; a fact in two
>    homes; a rule stated two ways; a word used against
>    `definitions.md`; a decision in `plan.md` no longer true of `behaviour.md` or the code; the
>    In and Out lists against what `behaviour.md` says is built; every claim about i3 in them
>    checked in `I3`; cases the decision steps can't settle or settle two ways (holes).
> 2. `README.md`, `CONTRIBUTING.md`, the settings page (`kcm/ui/`, `kcm/*.cpp`), the widget
>    (`widget/`): every sentence a user reads, true of the code, implying no opposite
>    (`AGENTS.md`, "Words a user reads"); `docs/style-settings-page.md` followed.
> Not yours: `behaviour.md`'s tables (B and the C areas own them) and i3's line numbers (B).

## B. The i3 side

> Your area: every row of `docs/behaviour.md` that carries an i3 mark (=, ≠, +).
> 1. Its i3 side against `I3`: is that what i3 4.24 does? The citation right? You own every i3
>    citation in the docs (`docs/*.md`), the foundations' included: no other area checks line
>    numbers.
> 2. Each ≠: does it name one of `plan.md`'s reasons (a)-(g), and does that reason hold? (f) cites the defect in i3; (a)
>    checked against `kwin-notes.md` and KWin's source; (c) is precedent only for the thing it
>    names; (d) against the Out list; (e) against Plasma's settings. A ≠ whose reason doesn't
>    hold is a defect (`AGENTS.md`, "Ride i3 hard").
> 3. Each =: is it? (Read the kwin-i3 side from the row and the function it cites.)
> 4. In the code's model: shapes and flags as i3's (Con types, where a flag sits), names as
>    i3's. A difference labelled "on purpose" with no reason in `plan.md` is a finding.
> Prefer depth on the rows touched since `BASE` and on §2-5 (the tree, kinds, workspaces and
> outputs, focus); cover the rest at a lighter read.

## C1. The model

> Your area: `src/tree.js`, `src/outputs.js`, `src/workspaces.js`, `src/rules.js`,
> `src/placement.js`, `src/settings.js`, against `docs/behaviour.md` §2-4 and §11 (and any row
> elsewhere citing these files). Each row's kwin-i3 side: does the code do that, exactly? Each
> behaviour in the code that no row describes (a hole in `behaviour.md`). Known limits still
> true. Name the function, not the line. You alone read §11's table: every setting in
> `src/settings.js` has its row, its default and range as the code's.

## C2. The KWin seam

> Your area: `src/kwin.js` but its tiling drag and resize (C3's), against `docs/behaviour.md` §5, §6, §10, §12-14 (and any row
> elsewhere citing it). Each row's kwin-i3 side: does the code do that, exactly? Each behaviour
> in the code that no row describes. Known limits still true. Name the function, not the line.

## C3. The plugins

> Your area: `plugin/*.cpp` (kwini3hold, kwini3helper), and the script's side of the tiling drag
> and resize in `src/kwin.js` (`startDrag`, `dropPlan`, `drop`, `startResize` and their
> neighbours), against `docs/behaviour.md` §1, §7-9 (and any row elsewhere citing a plugin). Each row's side: does the code do that, exactly? Each
> behaviour in the code that no row describes. Known limits still true. The messages between
> script and plugins (§1, "How they talk") as both ends implement them.

## Checker

> You are checking claims about kwin-i3 (`REPO`, read-only) against their
> sources. Don't read the project's foundation docs; read only what each claim needs, and be
> economical: grep for the function, read it, decide. i3 is its 4.24 release at `I3`; KWin is version `KWIN`. For each claim below, read the
> sources it cites, and any others you need, and answer: CONFIRMED, REFUTED or PARTIAL, with
> what you read (file:line). Don't trust the citation: open it. A claim about i3 is checked in
> i3's source, never from memory. Claims: `CLAIMS` (each: its id, what it says, its citations;
> not the finder's proposed settlement).

## Round two

> You are reading kwin-i3's foundations after an edit (`REPO`, read-only). Read
> `AGENTS.md`, `docs/README.md`, `docs/definitions.md`, `docs/philosophy.md`, `docs/plan.md`,
> and the `docs/behaviour.md` rows changed in `DIFF`. Look for holes: contradictions between
> them, a rule stated two ways, a case the decision steps can't settle, a ≠ whose reason doesn't
> hold, a claim about i3 not true of `I3` (4.24). Report only high and medium findings, in the
> common part's shape; none is a fine answer.
