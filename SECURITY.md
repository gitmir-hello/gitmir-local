# Security & privacy

**Short version:** with no Intelligence key set, this tool opens no outbound
connection of its own — none, to anybody. Set `GITMIR_LAB_KEY` and one thing
changes: questions about your product go to Intelligence, and answers come
back.

**Your source code is not in either direction, on any path, at any setting.**
There is no code in this repository that reads a file out of your project and
puts it on a socket, and no endpoint anywhere in it that would accept one. That
is the claim this page exists to let you check, and everything below is written
so you can check it rather than believe it.

This matters most for teams under an NDA. So the next section names every socket
this tool can open, the file that opens it, and what goes through it.

## What touches the network

Nothing on this list happens on its own. Each item waits for something you do:
setting a key, typing a URL, pressing a button, entering a workspace key.

**Always — and only to your own machine**

1. **The dashboard ↔ your browser — `localhost` only.** The tool serves a local
   web UI on `http://localhost:4599`. Every request the page makes (`/api/...`)
   goes to that local server on this machine. Nothing leaves the loopback
   interface, and the server refuses any `/api/*` request whose `Host` is not
   localhost or whose `Origin` is foreign (`server.ts`, `sameOrigin()`) — so a
   web page you happen to be visiting cannot drive this tool, and DNS rebinding
   is closed.
   The MCP server makes one call of the same kind: `gitmir_setup` asks a
   dashboard running on this machine to add the folder (`mcp.ts`, to
   `http://localhost:<port>/api/add`), and writes the list itself when nothing
   answers.

**Only if you have connected Intelligence** — that is, only if `GITMIR_LAB_KEY`
is set in the environment the tool starts in:

2. **Intelligence — questions out, answers back.** `lib/lab.js` reads a
   projection for the viewer (`GET https://lab.gitmir.com/view/...`) and asks
   questions over MCP (`POST https://lab.gitmir.com/mcp`), both with a key as a
   bearer token: the agent key if one is saved, otherwise your personal key.
   `GITMIR_LAB_URL` points both at another Intelligence, and is taken only as
   https, or as plain http on 127.0.0.1. What goes out is the question: handles,
   names, the business words you would say out loud in a stand-up. What comes
   back is the answer. Neither carries a line of your code.
   With no key, `connected()` answers from the environment variable and
   deliberately does not probe the network — so an unset key opens no socket even
   to find out.
3. **The connector, if you fetch one.** `lib/connector.js` downloads an
   executable from Intelligence and runs it here. It exists precisely for
   source that may not leave the building: it reads the repository on this
   machine and sends the reading, not the repository. The download is checked
   against the SHA-256 Intelligence names separately and is discarded if it
   does not match. It is fetched and run with your personal key, never the agent
   key, and that key is sent only to the origin Intelligence itself is served
   from — if it points the download anywhere else, nothing is fetched and the
   key is not sent there.

**Only when you press the button**

4. **Your coding agent — under *your* account.** This tool's job is to *launch*
   `claude` (or `codex`) in your project folder. Once running, it talks to its
   own provider with your own credentials, exactly as it does when you run it
   yourself in a terminal. **This tool adds nothing to that and sees none of
   it.** If you trust your agent, nothing here changes your exposure; if you do
   not, nothing here increases it.
5. **The Preview tab — the URL you type.** `server.ts` fetches the address you
   entered and serves it back through the local origin. It fetches nothing you
   did not type.
6. **The change-audit form — the numbers on that screen.** Filling in the form
   on the Audit tab and pressing Send posts to
   `https://ide.gitmir.com/api/audit-request` (`server.ts`; overridable with
   `GITMIR_AUDIT_ENDPOINT`). The screen prints the exact JSON before you send it:
   the counts and durations already on that screen, the labels it groups them
   under, your email address, and an hourly rate only if you tick the box for it.
   No file, no path, no code.
7. **The Team bridge — an outbound WebSocket.** `relay.ts` connects to the GitMir
   relay after you enter a workspace key, pick a project and press Connect. See
   the section below for exactly what travels.
8. **`gitmir update` — a `git pull`.** It updates the clone from the repository
   you cloned it from, and does nothing else.

That is the whole list, and it is checkable in one command:

```bash
grep -n 'fetch(\|new WebSocket' *.ts lib/*.js *.mjs
```

Nine hits, and every one of them is above.

## What this tool never does

- **Never sends your source code.** Not on any path, not behind a flag, not as an
  attachment. There is no code path in this repository that reads a file from
  your project and puts it on a socket, and no endpoint that would accept one.
- **No telemetry, analytics, or phone-home.** There is no usage tracking of any
  kind, reduced, anonymised or otherwise. The one usage record that exists —
  `.gitmir/usage.jsonl`, one line per MCP answer — is written to your disk and
  read by nothing but the dashboard on the same machine.
- **No account for the local half.** The queue, the findings, the change audit
  and the task log ask for nothing and log you into nothing. A key is what buys
  answers about your product, and it buys nothing else.
- **Never acts in the background.** Nothing is fetched, sent or shared on a
  timer. Every item on the list above waits for a key, a keystroke or a click.
- **No third-party runtime dependencies.** `dependencies` is empty. What sits in
  `node_modules` is TypeScript and its type definitions, declared as
  `devDependencies` for `npm run typecheck` and never loaded when the tool runs.
  `vendor/` holds the two bundled fonts and the GITMIR marks — no diagram
  library, no framework, nothing else. The renderer is written for this project.

## Verify it yourself

You do not have to trust this page. Four independent ways to confirm it:

1. **Read the code.** Most of it is three files — `server.ts`, `public/app.js`
   and `relay.ts`, about 7,300 lines together. The rest is the MCP server
   `mcp.ts` (~1,000), the diagram renderer `public/hud.js` and
   `public/hud-scenes.js` (~3,800), `lib/*.js` (~1,700), plus `mcp-check.ts`,
   `bin/gitmir.mjs` and `relay-client.mjs`. Roughly 14,800 lines in all — and
   nothing behind them, because there is no dependency tree to audit. Do not take
   the figure from this page either; count it:

   ```bash
   wc -l *.ts *.mjs lib/*.js public/*.js bin/*.mjs
   ```
2. **Run it with no key.** Unset `GITMIR_LAB_KEY` and start it. The dashboard,
   the queue, the findings, the change audit and the task log all work, and the
   tool opens nothing outbound. The screens that describe the product say they
   are not connected rather than drawing a stale local copy — there is no local
   copy, which is also why one cannot be left behind on a laptop somebody stops
   using.
3. **Watch outbound connections.** Point Little Snitch / `lsof -i` / `tcpdump` at
   the process. With no key you will see loopback and nothing else. With a key
   you will see `lab.gitmir.com` when a screen asks a question about your
   product. And — only if you launch it — your agent talking to its own provider.
4. **Try to reach the local API from somewhere else.** It answers 403:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example'      http://127.0.0.1:4599/api/projects   # 403
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: http://evil.example' http://localhost:4599/api/projects   # 403
   curl -s -o /dev/null -w '%{http_code}\n'                              http://localhost:4599/api/projects   # 200
   ```

## Where your data lives (all local)

- **Projects list:** `projects.json` in this folder.
- **Task log / queue:** `.claude/tasks.json` and `tasks/` inside your projects.
- **Findings:** `.gitmir/findings/` inside your projects — one file each, plain
  text, yours to read, edit and commit.
- **What every MCP answer cost:** `.gitmir/usage.jsonl` inside your projects.
- **Skills:** `skills/*.md` in this folder — plain text you can read and edit.
- **What the product does:** not here. It is built and kept by Intelligence and
  reached over MCP. Nothing about it is written to this machine.

## Team bridge (optional, opt-in)

The dashboard has an optional **Team bridge** that connects your machine to your
teammates' machines through the GitMir relay. It is **off until you turn it on** —
you enter a workspace key, pick a project, and press Connect. It follows the same
rule as everything else here: **the relay routes, it does not store.**

- **While it is connected, your task queue is published to the room —
  automatically.** That is the point of the bridge, so be precise about what it
  means. While the Team panel is connected the tool watches `tasks/todo`,
  `tasks/inprogress`, `tasks/verify` and `tasks/done` and sends the room an
  updated list whenever a file changes: each task's **title, body text, status,
  order and acceptance criteria**. It is your task notes that travel. Disconnect
  and it stops immediately.
- **The product model does not travel over the bridge, in either direction.** The
  frame that used to carry one is neither sent nor accepted (`relay.ts`,
  `relay-client.mjs`): nothing a peer sends can write a file describing your
  product onto your disk, and nothing you do here can hand a copy of yours to a
  teammate. A copy of a product cannot be recalled once it is on somebody's
  laptop; who may see a model is decided by Intelligence, against a key that
  can be taken back.
- **Source code is never uploaded, at any level.** Not behind a flag, not as an
  attachment. No code path here sends file contents from your repository, and no
  endpoint on the server would accept them.
- **The mirroring level is set by the project owner, and the tool always shows
  it.** The Team panel states the current level in plain words and updates the
  moment the owner changes it. You cannot change it from here; you can always see
  it, and you can always disconnect.
- **Incoming tasks are inert.** A task from a teammate becomes a file in
  `tasks/todo/`, labelled as a request from a teammate. Nothing runs by itself;
  your local agent only acts on it when you run the queue.
- **Local API calls are same-origin only** — see the 403s above. Turning the
  bridge on from a page you happen to be visiting is not possible.
- **The key is a local credential.** Your workspace key is entered in the UI and
  kept **locally in your browser only** — never written into the repo, never
  committed, and sent nowhere except the relay, as the connection credential.
  Disconnect drops it from the running process.
- **Still zero-dependency.** The bridge uses Node's built-in WebSocket — no added
  npm packages, nothing new to audit beyond `relay.ts`.
- **Gated by your plan, not by us watching you.** Access to the relay requires a
  paid Team plan; a free key is refused at connect time. The gate is a plan
  check, not surveillance — no usage is tracked.

If you never open the Team panel, none of this runs.

## Reporting an issue

Found something that contradicts the above, or a vulnerability? Please email
**security@gitmir.com** (or open a private advisory on the repository). We take it
seriously — the whole point of this tool is that you can trust it because you can
check it.
