# The MCP server — your queue, inside your editor

The dashboard shows the queue, the findings and the approvals to a person. The MCP
server serves the same records, as text, to whatever agent you already work in —
Claude Code, Cursor, or anything else that speaks
[MCP](https://modelcontextprotocol.io).

Both read the same files on disk, so they cannot answer the same question two
different ways. Questions about the product itself — what it does, what depends on
what, how far a change reaches — are answered by neither: those go to
Intelligence, over its own MCP endpoint.

## Where it runs

On your machine, as a subprocess your editor starts. It speaks
[stdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) —
JSON-RPC over stdin and stdout.

- **No port, nothing uploaded.** The server listens on nothing. The one exception
  to "no network" is `gitmir_setup`, which asks a dashboard running on this machine
  to add the folder — and writes the list itself when nothing answers.
- **The dashboard does not need to be running.** They are two programs reading the
  same files.
- **ide.gitmir.com is not involved.** It stores no business logic by design, so
  there would be nothing there to read.

## Setup

One command, if you installed with the installer:

```bash
gitmir mcp add          # every project
gitmir mcp add-here     # or pin it to this repo, in a .mcp.json you commit
```

It registers at **user scope** on purpose. `claude mcp add` defaults to `local`, which
stores the registration in whichever directory you happened to run it from — so somebody
who runs it once and then opens their editor in a project finds nothing there and
reasonably concludes it did not work. At user scope the server is available everywhere and
answers about whichever folder the editor was opened in.

All eight skills arrive with it, as prompts — most clients surface those as slash
commands — and as tools the agent can call on its own. Nothing is pasted.

Point another MCP client at `mcp.ts` in this repository instead:

```json
{
  "mcpServers": {
    "gitmir": {
      "command": "node",
      "args": ["/path/to/gitmir-local/mcp.ts",
               "--project", "/path/to/your/project"]
    }
  }
}
```

`--project` is optional — without it the server uses the directory your client
launched it in, and every tool also takes a `project` argument that wins over both.
That is how one entry can answer about several repositories.

> The config file's location and key names are set by your client, not by the MCP
> spec. The shape above is what most clients use; check your client's own docs for
> where the file lives.

Requires Node 22.18+ — the same requirement as the dashboard, and for the same
reason: Node runs the TypeScript directly, so there is nothing to build.

## Seeing it work before you wire it up

An MCP server has no screen, which makes a broken setup hard to tell from a working
one. `mcp-check.ts` speaks the protocol and prints the answer for a person:

```
node mcp-check.ts examples/refund-shop init      # handshake — version, name, what it offers
node mcp-check.ts examples/refund-shop tools     # the tools and their behaviour hints
node mcp-check.ts examples/refund-shop prompts   # the procedures, served as prompts
node mcp-check.ts examples/refund-shop setup     # what the project still needs
node mcp-check.ts examples/refund-shop queue     # what is planned, and what is approved
node mcp-check.ts examples/refund-shop attention # what needs a person right now
node mcp-check.ts                                # every command
```

It starts `mcp.ts` as a subprocess and stops it again — the same thing your editor
does. Point it at your own project and you see exactly what an agent would read.

Three of its commands write: `new`, `approve`, `withdraw`. The rest only read.

## The tools

| Tool | Answers |
|---|---|
| `gitmir_setup` | Prepares a project: puts it on the dashboard, creates the task queue, and says what is still missing — including whether Intelligence is connected, which is where the answers about the product come from. |
| `gitmir_skills` · `gitmir_skill` | The written procedures and their full text. Prompts only fire when a person types a slash command; these are tools, so the agent can fetch a procedure and follow it on its own. |
| `gitmir_queue` | What work is planned, what does each task touch, what is approved? |
| `gitmir_flag` | Record that the code does not do what the product says. Written at the moment it is noticed, in one call — a finding described only in a reply is gone when the conversation ends. |
| `gitmir_attention` | What needs a person right now: deviations whose files have since changed, tasks queued without approval, work that has stalled. Each item says what closes it. Call it at the start of a session instead of asking what to do. It answers from this repository only — what a change reaches, and how far, is a question for Intelligence. |
| `gitmir_findings` | What is already known to be wrong, what was accepted on purpose and by whom, and what needs re-checking because the code has moved since. |
| `gitmir_accept_finding` | Record the decision: accepted (needs a name and a reason), fixed, or reopened. |
| `gitmir_create_task` | Turn a finding into queued work. Refuses to write a task with no `verify` steps — a requirement you cannot check is a wish, not a task. |
| `gitmir_approve` | Record that a task is approved to run, or withdraw it. Writes the `Approved:` line that travels with the task. |
| `gitmir_progress` | Say what you are doing right now, so the person watching the dashboard sees a status instead of a blank wait — above all `blocked`, with the question you are waiting on. |

These are the tools that work with nothing but your repository. What the product does,
what depends on what, and what a change would reach are answered by Intelligence over
its own MCP endpoint — see [lab.gitmir.com](https://lab.gitmir.com). Every answer from
there states how fresh the model is, because in an editor there is no banner to show it.

The key for that endpoint is made inside a project or repository: open it on
lab.gitmir.com and press **Connect an AI agent**.
[lab.gitmir.com/account/access](https://lab.gitmir.com/account/access) lists the projects and
repositories you can connect an agent to. The key is shown once, so copy it then, and it
reads only that place. The page gives the line for this machine:

```bash
gitmir lab add --project <id> --key <agent key>
# the same registration by hand, with the address in quotes:
claude mcp add -s local gitmir-lab --transport http "https://lab.gitmir.com/mcp?project=<id>" --header "Authorization: Bearer <agent key>"
```

`gitmir lab add --project <id>` registers that endpoint as
`"https://lab.gitmir.com/mcp?project=<id>"`, so the connection starts in that project, and
it does so at Claude Code's `local` scope rather than `user`: the entry belongs to the
folder you ran the command in, lives in Claude Code's own config outside the repository —
no file you could commit holds the key — and in that folder it wins over a `gitmir-lab`
added for every project. Starting in a project is a default, not a wider door: a question
that names another project still reaches only what the key reads. If you register it by
hand, keep the address in quotes; zsh reads an unquoted `?` as a filename pattern and
answers `no matches found` without running anything. `gitmir lab add-here --project <id>`
writes the same address into `.mcp.json` instead, with the key left as `${GITMIR_LAB_AGENT_KEY}`.

This machine keeps two keys, both in `~/.gitmir/lab.json`, readable by you only. The **agent
key** is the one Connect an AI agent made; your assistants use it, for `/mcp` and for the
drawings the dashboard reads from `/view`. `gitmir lab add --project <id> --key <agent key>`
saves it before registering, `add-here` takes `--key` the same way, and
`GITMIR_LAB_AGENT_KEY` in the environment wins over the saved one. Your **personal key** is
on [your account page](https://lab.gitmir.com/account/me) and `gitmir lab <key>` saves it. The
Local Connector uses it, and an agent key cannot stand in for it: uploads do not accept agent
keys. Until an agent key is saved, assistants use the personal key too, so a machine set up
earlier keeps working until older personal keys stop working on `/mcp`, on the date shown in
the cabinet. `gitmir lab status` shows each key by its last four characters, never the key
itself, and says what uses it.

## Setting a project up without doing it by hand

Connect the server, then tell your agent *set this project up with GitMir*. It
calls `gitmir_setup`, which registers the folder with the dashboard — asking a
running one over its own API, or writing the list itself if nothing answers —
creates `tasks/todo|inprogress|verify|done`, and reports what is left — including
whether Intelligence is connected, and how to connect it if not.

### Saying what it is doing

`gitmir_progress` exists because the person watching the dashboard cannot see the
chat. Long work would otherwise leave the screen saying "waiting" with nothing
behind it. The agent reports `started`,
`reading`, `writing`, `done` — and, the one that matters, `blocked`, with the
question it is waiting on.

That last case is the one that strands people: the agent stopped to ask something
perfectly reasonable, and the person is looking at a different window entirely. A
`blocked` report puts the question on the screen they are already watching.

It writes one line to `.gitmir/progress.json` and nothing else, and the dashboard
deletes it the moment the model appears — a status line that outlives its job stops
being believed. Nothing depends on it: pasted in as plain text with no tools at
all, the procedure writes the same file itself.

That is the whole reason those two are tools rather than prompts. A prompt is
user-controlled: it appears as a slash command and waits to be typed. A tool is
model-controlled, so the agent can reach for the procedure the moment it finds
it needs one.

`gitmir_setup` only ever creates folders and a list entry. It never touches code.

## Every answer leaves a line

The server appends one line to `.gitmir/usage.jsonl` for each answer it serves:
when, which tool, what was asked, and how many bytes went back.

That is the whole record, and it is the point: it is plain text on your disk, so
the no-telemetry claim is something you check rather than something you take. The
dashboard reads the same file, and so can you.

Nothing is sent anywhere.

## Where a finding lives, and why not in the model

`gitmir_flag` writes one file into `.gitmir/findings/` — deliberately next to the model
rather than inside it.

The model is derived from code and rebuilt whole. A rebuild on a real project dropped an
entity, an area and two lifecycles; a person's judgement written into the same files would
eventually be thrown away the same way. A finding is not an extraction — it is somebody's
reading of the gap between two descriptions of the product, and it has to outlive every
rebuild of one of them.

It is also not a task. A task is work somebody intends to do. Half of these are never
worked at all: they are accepted, on purpose, by somebody who writes down why — and that
signed decision is the part worth keeping.

Findings carry the files they were read from. When one of those files changes, the finding
says **re-check** rather than continuing to assert something about code that has moved.

## What it does not answer

What the product does, what depends on what, how far a change would reach, and how the
product has changed over time are answered by Intelligence, not by this server. The
procedures that produce those answers are not in this repository.

This server answers from what is in your repository and nowhere else: the task queue,
the findings, the approvals, the progress reports. That is deliberate — those are useful
on their own, and a tool that demands an account before it does anything is a tool nobody
tries.


To see it working before pointing it at your own code, use
[`examples/refund-shop`](../examples/refund-shop) — an invented shop with three tasks,
two of them still planned.

## The skills, without copy-paste

The server also serves every skill as an MCP **prompt** — most clients surface those as
slash commands. So the procedure you need is one command away in the session that told you
about it, instead of a trip to the dashboard to copy text.

Each prompt takes an optional `note` for the run ("focus on `src/`", "the spreadsheet
is the source"), and the project path is filled in for you.

Prompts are user-controlled by design, which is the right shape here: nobody wants an
agent deciding on its own to re-model the repository.

## What each tool admits about itself

Every tool carries the spec's behaviour hints, and they are literal — a client may skip
its confirmation prompt on the strength of one, so a hint that shades the truth is worse
than no hint at all.

| Tool | read-only | destructive | idempotent | open world |
|---|---|---|---|---|
| `gitmir_queue` · `gitmir_findings` · `gitmir_attention` · `gitmir_skills` · `gitmir_skill` | yes | no | yes | no |
| `gitmir_flag` | no | no | **yes** | no |
| `gitmir_accept_finding` | no | **yes** | no | no |
| `gitmir_setup` · `gitmir_progress` | no | no | **yes** | no |
| `gitmir_create_task` | no | no | **no** | no |
| `gitmir_approve` | no | **yes** | no | no |

`gitmir_create_task` is not idempotent because calling it twice queues the work twice.
`gitmir_flag` is idempotent because flagging the same rule on the same object updates the record rather than writing a second copy — which is what a re-audit should do. `gitmir_accept_finding` is destructive because reopening drops the signature off a decision somebody made.

`gitmir_approve` is marked destructive because `withdraw` removes a line from a file
that exists — even though the common path only adds one. Nothing here is open-world:
the only thing any tool touches is this machine's own `.gitmir/` and `tasks/` folders.

## What it does not do

- **No source reading.** It answers from `.gitmir/` and `tasks/` — the records people
  and agents wrote there. It never opens a source file to work something out.
- **No structured content.** The spec allows a machine-readable object alongside the
  text. The consumer here is a model reading prose, and the arithmetic it needs is in
  the prose already; a second serialization would double the payload to serve client
  code that does not exist yet.
- **No pagination cursors.** Eleven tools and eight prompts fit in one response. A
  `cursor` is accepted and ignored rather than rejected, so a paginating client works.
