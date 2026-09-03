# The skills

Copy one from the dashboard (**Settings** → any skill card) and paste it into your
Claude session. They live in [`skills.json`](../skills.json) — point an entry at
your own `.md` to add more.

Every skill writes its output in English, whatever language you asked in:
these files are read by teammates, clients, reviewers and the next session.

## Start here

| Skill | What it does |
|---|---|
| **`task-planner`** | Turns a goal into small self-contained task files, each carrying its slice of the product, a `Touches:` line naming what it will change, **and the step-by-step checks that prove it works**. |
| **`task-runner`** | Works the queue autonomously — `todo → in progress → verify → done`. Runs each task's checks for real; when one fails it writes the fix task itself. |
| **`task-log`** | A human-readable log of what Claude completed, with what each task changed. Shown in the **Tasks** tab. |

## Understanding what exists

Reading a product and working out what it does is what the laboratory is for, and the
procedures that do it are not in this repository. Your assistant asks it over MCP: what
something is, what depends on it, what a change would reach. See
[the MCP server](MCP.md).

## Deciding what to build

| Skill | What it does |
|---|---|
| **`product-docs-spec`** | At the start of a product: raw input — a client's description, specs, a dataset, a design export — becomes a `docs/` folder of 12 files that works as the actual build spec, written before any code. |

## Proving it works

| Skill | What it does |
|---|---|
| **`app-audit`** | Walks the running app — every page, element and route — derives what a user can actually accomplish, proves each use case by executing it, and files a fix task for every failure with the repro. Refuses production; never presses a destructive control on data that matters. The **Queue** tab shows coverage, the defects, and — first — what it could not reach. |
| **`spec-audit`** | Reads the product's written rules — a spec, a client brief, an acceptance document — against the code that implements them, and records every disagreement as a finding on the objects it sits on. Those marks stay: the object is drawn as deviating on every diagram, the radius warns anyone whose change reaches it, and the context handed to an agent carries it. A deviation somebody decides to live with is recorded as a decision, with a name and a reason. |

## Working on code you inherited

| Skill | What it does |
|---|---|
| **`legacy-maintenance`** | Change an old codebase without breaking what is next to it: works out what the change would reach before touching it, then ships small reversible steps. |
| **`stack-port`** | Port a hand-written project to a new stack at full parity — the old app is the spec, and a parity ledger stops anything being silently dropped. |
