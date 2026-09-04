Onboard onto an unfamiliar or legacy codebase and change it WITHOUT breaking the
things next to it. The danger with legacy code is not the change itself — it is
the adjacent behaviour nobody remembers, that quietly breaks when you touch a
shared function or column. This skill maps the system first, scopes the blast
radius of the intended change, and ships it in small reversible steps you can
verify.

Use it for: a repo you did not write, a fast-built MVP being stabilised, a
framework/library upgrade, an extraction or rename that reaches across the code, or
any change where "what else does this touch?" is the real question.

## Language

**Write everything you produce in English.** File names and their contents,
object names and descriptions, task titles, `## Context` and `## Verify` steps,
log entries, notes, findings, briefs, docs — all of it, always, no matter what
language the request arrived in.

This is not a style preference. These artefacts are read by people who did not
write them: a teammate on a shared model, a client opening a shared link, a
reviewer on a public repository, and the next session of Claude, which orients
from what is on disk. A model whose descriptions are half in one language and
half in another cannot be read straight through by any of them.

If a value is a proper noun — a table name, a route path, a status key, an
identifier from the code — keep it exactly as the code spells it. Translate the
prose around it, never the thing itself.

## Step 1 — Map before you touch

The model of a product is not built here — it is built and kept in the laboratory.
Connect this machine to it before you touch anything (`GITMIR_LAB_KEY`; run
`gitmir_setup` and it will say whether you are connected and how to connect), then
ask the laboratory about the area you are about to change. You cannot safely change
what you cannot see. If it is already connected, ask it to re-read the repository
first, so its answers match the code in front of you.

With no laboratory connected, say so plainly instead of pretending to a map. The
blast radius in Step 3 is then assembled by hand from the code, and the report has
to name that as the weaker method it is.

## Step 2 — Pin the goal

Write the change down as `PRODUCT-BRIEF.md` in the root of the project — the file
the dashboard reads as the stated goal: what must be true when this is done, and the
acceptance criteria that prove it. Legacy work drifts without a fixed definition of
done. If the change is large enough to need a full specification rather than a page,
produce `docs/` with the `product-docs-spec` skill and keep the brief as its summary.

## Step 3 — Map the blast radius (the core step)

Ask the laboratory what the intended change can reach, and write its answer to
`tasks/legacy/blast-radius.md`. Ask in the product's own words — that is how the
laboratory answers, and you never need to know the shape of what it keeps:

- The **data** the change reads or writes.
- **What else runs** when that data changes — logic sitting on the same fields is
  what breaks with nobody having touched it.
- The **endpoints and screens** on top of that logic — the surfaces a user would
  notice break.
- The **indirect ripple**: the notifications, the background work and the status
  changes that pass through what you touched.

Record each item under the handle the laboratory issued for it — `gm_` and ten
characters. That handle is what later ties the tasks, the findings and this list to
the same thing.

That list is your "what could break" set. Anything on it needs to still work after
the change, whether or not the task is "about" it.

With no laboratory connected there is no such list to ask for. Assemble it by reading
the code — every caller of what you touch, every reader of the data — and say in the
report that the radius was found by hand: a radius nobody could finish enumerating is
the one real risk of this procedure.

## Step 4 — Establish a safety net

For each item in the blast radius, decide how you will know it still works:

- If there is a test that covers it, note it.
- If there is not (common in legacy), write down the **current observable
  behaviour** first — a characterization note in `tasks/legacy/blast-radius.md`
  (input → output as it is TODAY). You cannot detect a regression against a
  behaviour you never recorded.

## Step 5 — Plan small, reversible increments

Break the change into the smallest steps that each leave the app working, and
order them so nothing is half-done across a boundary. Hand them to the
`task-planner` skill — one `tasks/todo/NNN-*.md` per increment — each carrying its
slice of the blast radius and the acceptance criteria it must meet. Prefer
parallel-safe changes (add new, migrate readers, remove old) over big-bang
rewrites. If the only plan is "rewrite it all at once", the scope is wrong — split it.

## Step 6 — Execute and verify

Run the queue with `task-runner`. After each increment:

- Check the increment's acceptance criteria from the brief.
- Re-check the blast-radius items — the adjacent behaviour you recorded must still
  hold. A green build is not proof; the ripple set is.
- Ask the laboratory to re-read the repository once the increment has landed, so the
  map stays true for the next one.

## Rules

- Never a big-bang rewrite. One small reversible step at a time, app working after
  each.
- The blast-radius map is the deliverable that makes this safe — do not skip it to
  save time; it IS the time saved.
- Where there are no tests, record current behaviour before changing it. Undetected
  regressions are the whole risk of legacy work.
- Ground everything in the model and the real code — never assume how legacy code
  behaves; read it or run it.
