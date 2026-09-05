#!/usr/bin/env node
/**
 * GitMir Local — MCP server.
 *
 * The dashboard draws the product model for a person. This serves the same model,
 * as text, to whatever agent the developer already works in — Claude Code, Cursor,
 * anything that speaks MCP. Both read the same files on disk and share the same
 * arithmetic (lib/impact.js), so they cannot answer the same question differently.
 *
 * Transport is stdio, per the MCP spec: newline-delimited JSON-RPC on stdin/stdout,
 * UTF-8, and NOTHING on stdout that is not a protocol message. Every diagnostic
 * goes to stderr — a stray console.log here corrupts the stream and the client
 * silently loses the connection.
 *
 * Launch: the MCP client starts this as a subprocess. Nothing listens on a port,
 * nothing leaves the machine, and the dashboard does not need to be running.
 *
 *   node mcp.ts [--project <path>]
 *
 * Without --project it reads the working directory the client launched it in; every
 * tool also takes an explicit `project` argument, which wins.
 */

import fs from 'node:fs';
import { report as reportProgress, clear as clearProgress } from './lib/progress.js';
import path from 'node:path';
import { readTasks } from './lib/read.js';
import { createTask, setApproval, COLUMNS } from './lib/write.js';
import { record as recordUse } from './lib/usage.js';
import { attention, caught, nextSkill } from './lib/attention.js';
import { lab, connected as labConnected } from './lib/lab.js';
import { readFindings, writeFinding, setFindingStatus, findingsByTarget, openOnly, findingsSummary,
  KINDS, SEVERITIES } from './lib/findings.js';

const PROTOCOL = '2025-06-18';           // the version this server implements
const SUPPORTED = new Set([PROTOCOL, '2025-03-26', '2024-11-05']);
const NAME = 'gitmir-local';
const VERSION = '1.0.0';

// ---------- project resolution ----------

function argProject(): string {
  const i = process.argv.indexOf('--project');
  const raw = i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
  return path.resolve(raw);
}
const DEFAULT_PROJECT = argProject();

function projectOf(args: Record<string, unknown>): string {
  const p = typeof args.project === 'string' && args.project.trim() ? args.project.trim() : DEFAULT_PROJECT;
  return path.resolve(p);
}

// ---------- shaping answers ----------

/** What was asked, in a line somebody can read back a month later. */
function describeCall(name: string, args: Record<string, unknown>): string {
  const bits = [name.replace(/^gitmir_/, '')];
  for (const k of ['id', 'task', 'dimension', 'q', 'name', 'column', 'status']) {
    const v = args[k];
    if (typeof v === 'string' && v) bits.push(`${k}=${v}`);
  }
  if (Array.isArray(args.ids) && args.ids.length) bits.push(`ids=${args.ids.length}`);
  return bits.join(' ');
}

// ---------- tools ----------

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  // Async is allowed: setting a project up asks a running dashboard to add it,
  // and that is a network call.
  run: (args: Record<string, unknown>, project: string) =>
    { text: string; isError?: boolean } | Promise<{ text: string; isError?: boolean }>;
};

// The spec's optional behaviour hints. Clients are told to treat annotations from an
// untrusted server as untrusted, which is exactly why the ones here are literal: a
// hint that shades the truth is worse than no hint, because a client may skip its
// confirmation prompt on the strength of it.
//
// Defaults, per the schema: readOnlyHint false, destructiveHint true, idempotentHint
// false, openWorldHint true. Every field below is stated rather than left to default,
// since the defaults are wrong for most of these tools.
type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

// Reading what is on disk: no writes at all — not even the usage journal, which is
// why tools/call skips it for these — and the world is closed, since the only files
// read are this machine's own. Repeating a read changes nothing.
const READS: ToolAnnotations = {
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
};

/* Замер исходника отсюда убран вместе с локальной сборкой.
 *
 * Он считал, влезает ли репозиторий в один проход, и если нет — предлагал ввод
 * по частям. И то и другое имело смысл, пока модель строилась на этой машине.
 * Она строится в Intelligence, и решение «в один проход или по частям» принимают
 * там, где читают. Здесь оставались только константы и тип: ни одна строка их не
 * звала, а описание инструмента и инструкция агенту продолжали обещать и замер,
 * и поэтапный ввод. Обещание, которого код не выполняет, дороже отсутствующей
 * возможности: агент идёт делать то, чего ему не дадут. */

function todoCount(project: string): number {
  try { return fs.readdirSync(path.join(project, 'tasks', 'todo')).filter((f) => f.endsWith('.md')).length; }
  catch { return 0; }
}

const PROJECT_ARG = {
  project: { type: 'string', description: 'Absolute path to the project. Omit to use the one this server was started in.' },
};

const TOOLS: Tool[] = [

  {
    // The person watching the dashboard cannot see a chat window. Without this they
    // watch a folder and guess — and the case that strands them is the one where the
    // agent stopped to ask them something, which a folder can never show.
    name: 'gitmir_progress',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    title: 'Say what you are doing right now',
    description:
      'Tell the dashboard what you are currently doing on this project, so the person watching it ' +
      'sees progress instead of a blank wait. Call it when you START building or refreshing the ' +
      'model, when you move on to WRITING files, when you are BLOCKED waiting for an answer from ' +
      'the person (put the question in `note` — this is the one that matters most), and when you ' +
      'are DONE. Cheap, safe, and it writes nothing but a one-line status file.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        stage: { type: 'string', enum: ['started', 'reading', 'writing', 'blocked', 'done', 'failed'],
          description: 'started · reading the code or the brief · writing the model files · blocked on a question for the person · done · failed' },
        note: { type: 'string', description: 'One short line for a human. If blocked, the exact question you are waiting on.' },
      },
      required: ['stage'],
    },
    async run(args: Record<string, unknown>, project: string) {
      const stage = String(args.stage || '');
      const note = String(args.note || '');
      const ok = reportProgress(project, stage, note);
      if (!ok) return { text: `Could not record "${stage}" — carry on, this is only a status line.` };
      return { text: stage === 'blocked'
        ? `Recorded: waiting on the person${note ? ` — "${note}"` : ''}. The dashboard now shows them the question. Ask it in the chat too.`
        : `Recorded: ${stage}${note ? ` — ${note}` : ''}. The dashboard is showing it.` };
    },
  },
  {
    // Setting a project up is what everyone hits first, and every step of it was
    // something the person had to know to ask for: add the folder to the
    // dashboard, make the queue, build the model. An agent can do all of it — it
    // just needed a tool to call, since prompts only fire when a person types a
    // slash command.
    name: 'gitmir_setup',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    title: 'Set this project up for GitMir',
    description:
      'Prepare a project to be worked on with GitMir: put it on the dashboard, create the task ' +
      'queue folders, and say what is still missing — above all whether this machine is ' +
      'connected to Intelligence, which is where the model of a product is built and kept. ' +
      'Call this the first time you touch a project, or whenever another tool answers "there ' +
      'is no model here". It also lists what works with no Intelligence account at all: the task ' +
      'queue, findings, and the audits that walk a running application. Creates only folders ' +
      'and a list entry; it never edits code.',
    inputSchema: { type: 'object', properties: { ...PROJECT_ARG }, required: [] },
    async run(_args: Record<string, unknown>, project: string) {
      const lines: string[] = [];
      lines.push(`Project: ${project}`);
      lines.push('');

      lines.push(`Dashboard: ${await registerWithDashboard(project)}`);

      const made: string[] = [];
      for (const col of COLUMNS) {
        const d = path.join(project, 'tasks', col);
        if (!fs.existsSync(d)) { try { fs.mkdirSync(d, { recursive: true }); made.push(col); } catch {} }
      }
      lines.push(made.length ? `Task queue: created tasks/${made.join(', tasks/')}` : 'Task queue: already there');

      /* Модель здесь больше не строится и не хранится.
       *
       * Она живёт в Intelligence и приходит по MCP — тем же путём, каким её берёт
       * ассистент. Причина не в удобстве: устройство модели — то, чем этот продукт
       * отличается от grep, и держать его на чужом диске значит раздавать его.
       *
       * Всё, что модели не требует, работает и без учётной записи: очередь задач,
       * находки, обходы живого приложения. Об этом сказано прямо — иначе человек
       * читает «нужен ключ» и уходит, не поняв, что половина инструмента уже
       * работает у него. */
      lines.push('');
      if (labConnected()) {
        /* «Ключ задан» и «Intelligence ответил» — разные новости.
         *
         * labConnected() отвечает только про ключ (см. lib/lab.js), а ни один
         * инструмент отсюда в Intelligence пока не ходит. Поэтому здесь не может
         * стоять «connected»: человек с опечаткой в ключе прочитал бы, что всё в
         * порядке, и остался бы без единственного экрана, который объясняет, что
         * делать. И адрес Intelligence называется в обеих ветках — иначе тот, кто
         * уже подключился, знает, что модель есть, и не знает, куда за ней идти. */
        lines.push('Intelligence: a key is set (GITMIR_LAB_KEY). Nothing here has asked Intelligence');
        lines.push('yet, so this says the key is present, not that it was accepted.');
        lines.push('');
        lines.push(`The model of this product is built and kept there: ask it over MCP at ${lab().mcp}.`);
        lines.push(`Keys are managed at ${lab().keys}.`);
        lines.push('');
        lines.push('Next: gitmir_skill("task-planner") writes tasks that carry their own checks, and');
        lines.push('gitmir_skill("task-log") keeps the record of what was done.');
      } else {
        lines.push('Intelligence: not connected — and that is where the model of a product lives.');
        lines.push('');
        lines.push(`Connect it at ${lab().signIn} (sign up at ${lab().signUp}), then open`);
        lines.push(`${lab().keys}, copy the key, and set it as GITMIR_LAB_KEY.`);
        lines.push('');
        lines.push('Until then this server still does everything that does not need a model:');
        lines.push('  gitmir_queue         the task queue in tasks/');
        lines.push('  gitmir_create_task   write a task, with its own checks');
        lines.push('  gitmir_approve       mark one approved');
        lines.push('  gitmir_findings      what has been recorded against this project');
        lines.push('  gitmir_attention     what needs a person right now');
        lines.push('  gitmir_skills        the written procedures, including the app audit');
      }

      return { text: lines.join('\n') };
    },
  },
  {
    name: 'gitmir_skills',
    annotations: READS,
    title: 'The GitMir skills and when to use one',
    description:
      'List the GitMir skills — the written procedures for turning a brief into a written ' +
      'specification, planning work that carries its own checks, running the queue, auditing a ' +
      'running app, reading the written rules against the code, and working on inherited code. ' +
      'Call this when you are about to do one of those things, then fetch the one you need ' +
      'with gitmir_skill and follow it. Returns names and what each is for, not the text.',
    inputSchema: { type: 'object', properties: { ...PROJECT_ARG }, required: [] },
    run(_args: Record<string, unknown>, _project: string) {
      const defs = skillDefs();
      if (!defs.length) return { text: 'No skills found in this installation.', isError: true };
      const out = ['GitMir skills. Fetch one with gitmir_skill("<name>") and follow it.', ''];
      for (const d of defs) out.push(`${d.name}\n    ${d.description}`);
      out.push('');
      out.push('No model yet? Call gitmir_setup — it says what is missing, and which of these');
      out.push('procedures work without one. The model itself is built in Intelligence.');
      return { text: out.join('\n') };
    },
  },
  {
    name: 'gitmir_skill',
    annotations: READS,
    title: 'The full text of one skill',
    description:
      'Return one GitMir skill in full, so you can follow it yourself. Use it after gitmir_skills, ' +
      'or straight away when you already know which one you need — ' +
      'task-planner to plan, task-runner to work the queue. The text is the instruction: read it and ' +
      'carry it out against this project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        name: { type: 'string', description: 'Skill name, e.g. "task-planner".' },
      },
      required: ['name'],
    },
    run(args: Record<string, unknown>, project: string) {
      const want = String(args.name || '').trim().replace(/\.md$/, '');
      const def = skillDefs().find((d) => d.name === want);
      if (!def) {
        return { text: `No skill called "${want}". Call gitmir_skills for the list.`, isError: true };
      }
      return { text: `Follow these instructions for the project at ${project}.\n\n---\n\n${skillText(def)}` };
    },
  },
  {
    name: 'gitmir_queue',
    annotations: READS,
    title: 'The planned work and its approvals',
    description:
      'List the work planned for this project — the task files under tasks/ — with the handles ' +
      'each one says it touches and whether it has been approved. Call this when the user asks ' +
      'what is queued, what is being worked on, or what still needs approval before it runs. How ' +
      'far a task actually reaches is answered by Intelligence, not by this server.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        column: { type: 'string', enum: ['todo', 'inprogress', 'verify', 'done'], description: 'Only this column.' },
      },
    },
    run(args, project) {
      /* Очередь читается с диска и работает без Intelligence.
       *
       * Раньше рядом с каждой задачей стоял риск, посчитанный по локальной модели.
       * Считать его здесь больше нечем и незачем: радиус — вопрос к Intelligence,
       * он на него и отвечает. Задачи от этого не перестают быть задачами. */
      /* Пустая очередь и пустая колонка — разные ответы.
       *
       * Проверка на пустоту стоит ДО фильтра: иначе вопрос «что в verify?» при
       * четырёх задачах в todo возвращал isError и «задач нет вообще». Пустая
       * колонка — это ответ, а не сбой, и isError на нём заставляет агента
       * считать сломанным сервер, а не свою догадку. */
      const all = readTasks(project);
      if (!all.length) {
        return { text: `No task files under ${path.join(project, 'tasks')}. The task-planner skill writes them.`, isError: true };
      }
      const col = typeof args.column === 'string' ? args.column : '';
      const tasks = col ? all.filter((t) => t.col === col) : all;
      if (!tasks.length) {
        return { text: `Nothing in ${col}. The queue holds ${all.length} task(s) in the other columns — call this again without \`column\` to see them.` };
      }
      const L: string[] = [];
      /* Оговорка не снимается по факту ключа.
       *
       * Охват задачи считает Intelligence, и подключение само по себе его сюда не
       * приносит: ниже как считались `touches` из самого файла задачи, так и
       * считаются. Убрать строку по ключу значило бы сделать ответ не полнее, а
       * менее честным. */
      L.push(labConnected()
        ? '(the queue is shown; how far each task reaches is answered by Intelligence, not from here)'
        : '(Intelligence is not connected — the queue is shown, the reach of each task is not)', '');
      for (const t of tasks) {
        const tail = t.ids.length
          ? `  touches ${t.ids.length} part(s) of the product, ${t.declared ? 'declared' : 'inferred'}`
          : '';
        L.push(`[${t.col}] ${t.file}\n  ${t.title}${tail ? '\n' + tail : ''}${t.approved ? `\n  approved: ${t.approved}` : ''}`);
      }
      return { text: L.join('\n') };
    },
  },

  {
    name: 'gitmir_attention',
    annotations: READS,
    title: 'What needs a person right now',
    description:
      'What this project needs a person for right now, worked out from what is in the repository: ' +
      'tasks queued without an approval, recorded deviations whose files have since changed, ' +
      'deviations nobody has decided on, and whether anything has ever been checked against the ' +
      'written rules. Call this at the start of a session instead of asking what to do, and after ' +
      'finishing work to see what it left behind. Each item says what it is, why it costs something ' +
      'to ignore, and what closes it. What only the model can see — the code having moved past it, ' +
      'parts of the product nobody owns — is answered by Intelligence instead.',
    inputSchema: { type: 'object', properties: { ...PROJECT_ARG } },
    run(_args: Record<string, unknown>, project: string) {
      /* Что требует человека — из того, что видно отсюда.
       *
       * Часть поводов приходила от модели: код ушёл вперёд, ничейные части
       * продукта. Их теперь знает Intelligence, и они вернутся сюда его ответом,
       * когда у него появится чем отвечать. Остальные поводы — задачи без
       * одобрения, находки, чьи файлы с тех пор менялись — лежат в репозитории и
       * считаются здесь, как считались. */
      const tasks = readTasks(project);
      /* `exists` — «Intelligence у этой машины есть», а не литерал.
       *
       * Здесь стояла константа false, и пункт «Intelligence is not connected»
       * печатался при выставленном ключе — в одной сессии с gitmir_setup,
       * который тот же ключ видел правильно. Признак берётся из того же
       * единственного места, что и во всём остальном клиенте. */
      const hasLab = labConnected();
      const items = attention({
        projectPath: project, model: {}, exists: hasLab,
        stale: false, staleFile: '', tasks,
      });
      const L: string[] = [];
      if (!items.length) {
        L.push('Nothing needs a person here. The model matches the code, every recorded deviation has been decided, and no planned task reaches further than its ticket says.');
      } else {
        const word = { act: 'DO', check: 'CHECK', note: 'NOTE' } as Record<string, string>;
        L.push(`${items.length} thing(s) need a person, worst first:`);
        L.push('');
        for (const i of items) {
          L.push(`[${word[i.level] || i.level}] ${i.title}`);
          L.push(`  why: ${i.why}`);
          L.push(`  closes it: ${i.action.label}${i.action.arg ? ` (${i.action.arg})` : ''}`);
          L.push('');
        }
      }
      const n = nextSkill({ exists: hasLab, stale: false, model: {}, tasks,
                            findings: readFindings(project).findings.length });
      L.push('');
      L.push(`If you are looking for what to do next: the ${n.name} procedure fits where this project is — ${n.why}`);
      L.push(`Fetch it in full with gitmir_skill("${n.name}").`);
      if (!hasLab) {
        L.push('');
        L.push(`Some of what needs a person is only visible from the model — the code having moved past `
             + `it, parts nobody owns. That lives in Intelligence: ${lab().home}`);
      }
      return { text: L.join('\n') };
    },
  },

  {
    name: 'gitmir_flag',
    // Writes one file under .gitmir/findings/. Safe to repeat: the same rule on the
    // same object updates the record in place rather than queueing a second copy.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    title: 'Record where the code disagrees with the product',
    description:
      'Record that the code does not do what the product is supposed to do. Call this the ' +
      'moment you find one — reading a spec against the code, reviewing, or answering a ' +
      'question — instead of only describing it in the conversation. A finding written here ' +
      'is attached to the objects it sits on, shows on every diagram that draws them, warns ' +
      'anyone planning a change that reaches them, and is still there next week; a finding ' +
      'described in a reply is gone when the conversation ends. This is not a task: a task is ' +
      'work someone intends to do, a finding is a fact about the product that stays true until ' +
      'it is fixed or somebody decides to live with it.',
    inputSchema: {
      type: 'object',
      required: ['rule', 'actual'],
      properties: {
        ...PROJECT_ARG,
        rule: { type: 'string', description: 'What the product is supposed to do, in the product\'s own words. Not "should validate input" — the actual rule.' },
        actual: { type: 'string', description: 'What the code does instead, naming the function or route you read it from.' },
        consequence: { type: 'string', description: 'What goes wrong for a person because of the gap. This is what makes it arguable.' },
        source: { type: 'string', description: 'Where the rule is written: a spec section, a ticket, a decision. "spec 5.2", "docs/spec.md#pricing".' },
        touches: { type: 'array', items: { type: 'string' }, description: 'The handles this sits on, as Intelligence issued them — "gm_" and ten characters. This is what makes it visible on the diagrams.' },
        kind: { type: 'string', enum: [...KINDS], description: 'contradicts-spec: does something else. not-implemented: does nothing. undefined: the spec never said. risk: works, will not survive production.' },
        severity: { type: 'string', enum: [...SEVERITIES] },
        readFrom: { type: 'array', items: { type: 'string' }, description: 'Repo-relative files you read this from. When one of them changes, the finding asks to be re-checked instead of quietly going stale.' },
        id: { type: 'string', description: 'Only to update a specific finding you already know the id of.' },
      },
    },
    run(args: Record<string, unknown>, project: string) {
      const r = writeFinding(project, args as any);
      if (!r.ok) return { text: r.why || 'Could not record it.', isError: true };
      const f = r.finding;
      const L = [
        `${r.updated ? 'Updated' : 'Recorded'} finding ${f.id}.`,
        '',
        `  rule    ${f.rule}`,
        `  actual  ${f.actual}`,
      ];
      if (f.consequence) L.push(`  costs   ${f.consequence}`);
      if (f.source) L.push(`  source  ${f.source}`);
      L.push(`  on      ${f.touches.length ? f.touches.join(', ') : '(no handles — it will not show on any diagram until it has some)'}`);
      L.push('');
      L.push('It is on the dashboard now, marked on every object it touches, and anyone planning a change that reaches them will be warned.');
      /* Совет должен указывать на то, что существует.
       *
       * Здесь стояло «take the ids from gitmir_navigate» — инструмента с таким
       * именем среди одиннадцати нет, и агент, послушавшийся совета, получал
       * -32602 ровно в тот момент, когда пытался дописать запись правильно. */
      if (!f.touches.length) L.push('Add `touches` with the handles Intelligence issued ("gm_" and ten characters) to make it visible where it matters.');
      /* Повторная находка на принятом дефекте не возвращается в открытые.
       *
       * writeFinding сохраняет прежний статус, и «It is on the dashboard now»
       * читается как «она в списке открытых», а gitmir_findings показывает по ней
       * ноль. Разницу видно только отсюда — здесь она и называется. */
      if (r.updated && (f.status === 'accepted' || f.status === 'fixed')) {
        L.push(`This finding is already marked ${f.status}`
          + (f.decision ? ` (by ${f.decision.by}: ${f.decision.why})` : '')
          + `, and stays that way — it will not appear among the open ones. Reopen it with `
          + `gitmir_accept_finding(id: "${f.id}", status: "open") if it is live again.`);
      }
      if (!f.readFrom.length) L.push('Add `readFrom` with the files you read, so the finding asks to be re-checked when they change.');
      return { text: L.join('\n') };
    },
  },

  {
    name: 'gitmir_findings',
    annotations: READS,
    title: 'Where the code disagrees with the product',
    description:
      'Everything recorded about where this product does not do what it is supposed to. Call ' +
      'this before changing anything, when asked what is wrong with the product, when picking ' +
      'what to work on, or to check whether something you just noticed is already known. Says ' +
      'which findings are open, which were accepted deliberately and by whom, and which need ' +
      're-checking because the code they describe has moved since.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        id: { type: 'string', description: 'One model id — only findings sitting on that object.' },
        status: { type: 'string', enum: ['open', 'accepted', 'fixed', 'all'], description: 'Default open.' },
      },
    },
    run(args: Record<string, unknown>, project: string) {
      const all = readFindings(project).findings;
      if (!all.length) {
        return { text: 'Nothing recorded for this project yet. Use gitmir_flag when you find a place where the code does not do what the product says — reading a spec against the code is the usual way to find them.' };
      }
      const want = typeof args.status === 'string' ? args.status : 'open';
      let list = want === 'all' ? all : all.filter((f: any) => f.status === want);
      if (typeof args.id === 'string' && args.id) {
        const by = findingsByTarget(all);
        list = (by.get(args.id) || []).filter((f: any) => want === 'all' || f.status === want);
        if (!list.length) return { text: `Nothing recorded on ${args.id}.` };
      }
      const s = findingsSummary(all);
      const L = [`${s.open} open, ${s.accepted} accepted, ${s.fixed} fixed` +
        (s.stale ? ` — ${s.stale} need re-checking, the code they describe has moved.` : '.'), ''];
      for (const f of list) {
        L.push(`[${f.severity}] ${f.id}${f.stale ? '  (RE-CHECK: ' + f.movedFile + ' has changed)' : ''}`);
        L.push(`  should  ${f.rule}${f.source ? `   (${f.source})` : ''}`);
        L.push(`  does    ${f.actual}`);
        if (f.consequence) L.push(`  costs   ${f.consequence}`);
        if (f.touches.length) L.push(`  on      ${f.touches.join(', ')}`);
        if (f.status === 'accepted' && f.decision) L.push(`  ACCEPTED by ${f.decision.by} on ${f.decision.at}: ${f.decision.why}`);
        L.push('');
      }
      return { text: L.join('\n') };
    },
  },

  {
    name: 'gitmir_accept_finding',
    // Records a decision. Destructive because it can also reopen one, which drops
    // the signature off a decision somebody made.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    title: 'Decide what to do about a finding',
    description:
      'Record that a known deviation is accepted — the product will keep behaving this way on ' +
      'purpose — or that it has been fixed, or reopen one. Accepting needs a name and a reason: ' +
      'the whole point of the record is that somebody can be asked about it later. Call this ' +
      'when the user decides to live with something, or after work that closes one.',
    inputSchema: {
      type: 'object',
      required: ['id', 'status'],
      properties: {
        ...PROJECT_ARG,
        id: { type: 'string', description: 'The finding id, from gitmir_findings.' },
        status: { type: 'string', enum: ['accepted', 'fixed', 'open'] },
        by: { type: 'string', description: 'Who decided. Required to accept.' },
        why: { type: 'string', description: 'Why it is acceptable. Required to accept.' },
      },
    },
    run(args: Record<string, unknown>, project: string) {
      const r = setFindingStatus(project, String(args.id || ''), String(args.status || ''),
        { by: args.by, why: args.why });
      if (!r.ok) return { text: r.why || 'Could not record the decision.', isError: true };
      const f = r.finding;
      if (f.status === 'accepted' && f.decision) {
        return { text: `${f.id} is accepted: ${f.decision.why}\n  decided by ${f.decision.by} on ${f.decision.at}\n\nIt still shows on the diagrams, marked as a decision rather than a defect — which is the difference between a product that has known limits and one that has surprises.` };
      }
      if (f.status === 'fixed') return { text: `${f.id} is marked fixed. It stays in the record: what the product used to get wrong is part of its history.` };
      return { text: `${f.id} is open again.` };
    },
  },

  {
    name: 'gitmir_create_task',
    // Writes, but only ever adds: a new file under tasks/todo/, never a replacement.
    // Not idempotent — calling it twice queues the work twice.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    title: 'Queue a task',
    description:
      'Write a task into this project\'s queue (tasks/todo/) so it can be run and checked ' +
      'later. Call this when the user asks to note something down, plan work, or turn a ' +
      'finding into work rather than doing it now. A task must carry the checks that prove ' +
      'it worked — write them as numbered steps a person could follow. Naming the handles ' +
      'it will change is what lets Intelligence say what else the change would reach.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        title: { type: 'string', description: 'One line naming the task.' },
        task: { type: 'string', description: 'What to do — precise enough to finish in one pass.' },
        verify: {
          type: 'array', items: { type: 'string' },
          description: 'Numbered steps that prove it works. A task with no way to check it is not ready to run.',
        },
        touches: {
          type: 'array', items: { type: 'string' },
          description: 'Handles this task will CHANGE (not the ones it reads), as Intelligence issued them, e.g. ["gm_261dcdf61e","gm_9b4c1a7f30"].',
        },
        context: { type: 'string', description: 'Optional: the slice of the product the runner needs.' },
      },
      required: ['title', 'task', 'verify'],
    },
    run(args, project) {
      const title = String(args.title || '').trim();
      const task = String(args.task || '').trim();
      const verify = Array.isArray(args.verify) ? args.verify.map((x) => String(x).trim()).filter(Boolean) : [];
      if (!title || !task) return { text: 'Both `title` and `task` are required.', isError: true };
      // A task nobody can check is a wish. The dashboard enforces this by convention;
      // here it is enforced by refusing to write the file.
      if (!verify.length) {
        return {
          text: 'Refusing to write a task with no `verify` steps. A requirement you cannot check is a wish, ' +
                'not a task — give the numbered steps that would prove it works, and mark any that only a person can judge.',
          isError: true,
        };
      }

      /* `touches` — ручки, выданные Intelligence (`gm_` и десять знаков).
       *
       * Проверить их здесь нечем: модели на этой машине нет, а ручка ничего о
       * себе не сообщает — в том и смысл. Поэтому записываем как есть и говорим
       * об этом прямо, если написано не похожее на ручку: молча проглоченная
       * опечатка превращается в задачу, которая ссылается в пустоту. */
      const touches = Array.isArray(args.touches) ? args.touches.map((x) => String(x).trim()).filter(Boolean) : [];
      const odd = touches.filter((h) => !/^gm_[0-9a-f]{10}$/.test(h));
      const warn = odd.length
        ? `\n\nNote: these do not look like handles Intelligence issues (gm_ and ten characters) `
          + `and were written down anyway — check them: ${odd.join(', ')}`
        : '';

      const body = [
        `# ${title}`, '', 'Type: build',
        ...(touches.length ? [`Touches: ${touches.join(', ')}`] : []),
        '',
        ...(typeof args.context === 'string' && args.context.trim() ? ['## Context', '', args.context.trim(), ''] : []),
        '## Task', '', task, '',
        '## Verify', '', ...verify.map((s, i) => `${i + 1}. ${s}`), '',
      ].join('\n');

      const file = createTask(project, title, body);
      const L = [`Wrote tasks/todo/${file}`];
      if (!touches.length) {
        L.push('', 'No `touches` given. A task that does not say what it reaches cannot be ordered '
                 + 'against the others, and nobody can tell what it would break.');
      }
      return { text: L.join('\n') + warn };
    },
  },

  {
    name: 'gitmir_approve',
    // Edits a file that already exists, and with `withdraw` removes a line from it —
    // so destructive is the honest answer even though the common path only adds one.
    // Not idempotent either: approving an approved task rewrites the timestamp.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    title: 'Approve or withdraw approval',
    description:
      'Record that a queued task has been approved to run — or withdraw that approval. Call ' +
      'this only when the user explicitly says to approve something; it writes an "Approved:" ' +
      'line into the task file that travels with the task and is read by whoever runs it. ' +
      'Show the task\'s impact and risk first if they have not seen it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PROJECT_ARG,
        file: { type: 'string', description: 'The task file name, e.g. 010-partial-refund.md.' },
        column: { type: 'string', enum: ['todo', 'inprogress', 'verify', 'done'], description: 'Which queue folder it is in. Defaults to searching for it.' },
        by: { type: 'string', description: 'Who approved it — recorded in the line.' },
        withdraw: { type: 'boolean', description: 'Remove the approval instead of adding one.' },
      },
      required: ['file'],
    },
    run(args, project) {
      const want = path.basename(String(args.file || '').trim());
      if (!want) return { text: '`file` is required.', isError: true };
      const tasks = readTasks(project);
      const col = typeof args.column === 'string' && COLUMNS.includes(args.column)
        ? args.column
        : (tasks.find((x) => x.file === want) || {}).col;
      if (!col) {
        return {
          text: `No task file named ${want}. Tasks in this project:\n` +
            (tasks.map((x) => `  ${x.col}/${x.file}  ${x.title}`).join('\n') || '  (none)'),
          isError: true,
        };
      }
      try {
        const approved = setApproval(project, col, want, {
          by: String(args.by || '').trim().slice(0, 60), undo: !!args.withdraw,
        });
        return {
          text: approved
            ? `Approved ${col}/${want} — wrote "Approved: ${approved}" into the task file. It travels with the task and whoever runs it will see it.`
            : `Withdrew approval on ${col}/${want} — the Approved: line is gone and the file is as it was.`,
        };
      } catch (e) {
        return { text: `Could not write to ${col}/${want}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  },
];


// ---------- prompts: the skills, without copy-paste ----------
//
// The tools answer from a model. Building that model is a skill — instructions an
// agent follows — and until now the only way to get one into a session was to copy
// text out of the dashboard. MCP prompts remove that step: the same server that
// answers questions also carries the skill that makes answering possible, so a
// project with no model is one command away from having one instead of being a
// dead end.
//
// Prompts are user-controlled by design — clients usually surface them as slash
// commands — which is the right shape for these: nobody wants an agent deciding on
// its own to re-model the repository.

type SkillDef = {
  name: string; title: string; description: string;
  file: string;                 // resolved path on disk, not a bare name
  strip?: boolean;              // the file carries frontmatter that must not reach an agent
  prepend?: string;             // text the skill must be read with, from the registry
};

/**
 * Put this project on the dashboard's list. The dashboard owns projects.json,
 * so if it is running we ask it rather than writing under it; only when nothing
 * answers do we edit the file ourselves. Either way it is idempotent — a project
 * already on the list is left exactly as it is.
 */
async function registerWithDashboard(projectPath: string): Promise<string> {
  const port = Number(process.env.GITMIR_PORT || 4599) || 4599;
  const body = JSON.stringify({ path: projectPath });
  try {
    const res = await fetch(`http://localhost:${port}/api/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://localhost:${port}` },
      body,
      signal: AbortSignal.timeout(1200),
    });
    if (res.ok) return `added to the running dashboard on port ${port}`;
    return `the dashboard answered ${res.status}; it may already be on the list`;
  } catch {
    // Nothing listening: write the list ourselves so it is there when it starts.
    const file = path.join(import.meta.dirname, 'projects.json');
    let list: { name: string; path: string; description: string }[] = [];
    try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(raw)) list = raw; } catch {}
    if (list.some((p) => p && p.path === projectPath)) return 'already on the dashboard list';
    list.push({ name: path.basename(projectPath), path: projectPath, description: '' });
    try {
      fs.writeFileSync(file, JSON.stringify(list, null, 2));
      return 'written to the dashboard list — it will be there when you start it';
    } catch (e) {
      return `could not write the dashboard list: ${(e as Error).message}`;
    }
  }
}

/* skills.json — список процедур этой установки, и он один на обе двери.
 *
 * Дашборд читал его и соблюдал stripFrontmatter и prepend; MCP-путь шёл мимо —
 * сканировал каталог skills/ и отдавал файл как есть. Из-за этого через MCP
 * агент получал YAML-шапку вместо инструкции, а у product-docs-spec терял
 * обязательную преамбулу («писать в этом проходе только внутрь docs/») и
 * принимался за код. Каталог остаётся запасным вариантом: установка без
 * skills.json по-прежнему отдаёт то, что лежит в skills/. */
function registeredSkills(): SkillDef[] {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'skills.json'), 'utf8')); }
  catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: SkillDef[] = [];
  for (const s of raw as Record<string, unknown>[]) {
    if (!s || typeof s.name !== 'string' || typeof s.file !== 'string') continue;
    const file = path.isAbsolute(s.file) ? s.file : path.join(import.meta.dirname, s.file);
    if (!fs.existsSync(file)) continue;             // a registered skill that is not installed is not on offer
    const desc = typeof s.desc === 'string' && s.desc.trim() ? s.desc : describeSkillFile(file);
    out.push({
      name: s.name,
      title: typeof s.title === 'string' && s.title ? s.title : s.name,
      description: desc.replace(/\s+/g, ' ').slice(0, 300),
      file,
      strip: !!s.stripFrontmatter,
      prepend: typeof s.prepend === 'string' ? s.prepend : '',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function folderSkills(): SkillDef[] {
  const dir = path.join(import.meta.dirname, 'skills');
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { return []; }
  const out: SkillDef[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    const name = f.replace(/\.md$/, '');
    out.push({ name, file, title: name, description: describeSkillFile(file) });
  }
  return out;
}

function skillDefs(): SkillDef[] {
  const listed = registeredSkills();
  return listed.length ? listed : folderSkills();
}

// The description is what a client shows in its command list, so take the skill's
// own words: the frontmatter description where there is one, else the opening line.
function describeSkillFile(file: string): string {
  let head = '';
  try { head = fs.readFileSync(file, 'utf8').slice(0, 4000); } catch { return ''; }
  let desc = '';
  const fm = /^---\n([\s\S]*?)\n---/.exec(head);
  if (fm) {
    // A folded block runs until a line that starts back at column 0. The old
    // pattern ended it at `$`, which with /m is the end of the FIRST line — so
    // every multi-line description was cut to its opening clause.
    const d = /^description:\s*(?:>-?[^\n]*\n((?:[ \t]+[^\n]*\n?)+)|([^\n]*))/m.exec(fm[1]);
    if (d) desc = (d[1] || d[2] || '').split(/\r?\n/).map((s) => s.trim()).join(' ').trim();
  }
  if (!desc) {
    const body = fm ? head.slice(fm[0].length) : head;
    desc = body.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' ');
  }
  return desc.replace(/\s+/g, ' ').slice(0, 300);
}

// The frontmatter is a registry entry, not an instruction: served to an agent it
// reads as the first paragraph of the skill. Same rule as the dashboard applies.
function stripFrontmatter(text: string): string {
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      const after = text.indexOf('\n', end + 1);
      if (after !== -1) return text.slice(after + 1).replace(/^\s+/, '');
    }
  }
  return text;
}

function skillText(def: SkillDef): string {
  let text = fs.readFileSync(def.file, 'utf8');
  if (def.strip) text = stripFrontmatter(text);
  if (def.prepend) text = def.prepend + text;
  return text;
}

// ---------- JSON-RPC over stdio ----------

function write(msg: unknown): void {
  // One message per line, and never a newline inside one — the framing is the
  // protocol here.
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function log(...a: unknown[]): void { process.stderr.write(a.map(String).join(' ') + '\n'); }

function result(id: unknown, res: unknown) { write({ jsonrpc: '2.0', id, result: res }); }
function fail(id: unknown, code: number, message: string) { write({ jsonrpc: '2.0', id, error: { code, message } }); }

// Async because one tool asks a running dashboard to add the project, and that
// is a network call. Replies still go out in whatever order they finish — every
// reply carries its request's id, which is what the protocol matches on.
async function handle(msg: any): Promise<void> {
  const { id, method, params } = msg || {};
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize': {
      const asked = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      // Answer with the client's version when we speak it, otherwise our latest —
      // the client decides whether it can live with that.
      const agreed = SUPPORTED.has(asked) ? asked : PROTOCOL;
      return result(id, {
        protocolVersion: agreed,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: NAME, title: 'GitMir Local', version: VERSION },
        // Инструкции читаются клиентом один раз при старте, и всё, что в них
        // обещано, агент считает доступным. Здесь были обещаны ответы «что от
        // этого зависит», «докуда дотянется изменение», «насколько это рискованно»
        // и признак STALE — под всё это инструментов больше нет, они уехали вместе
        // с моделью. Осталось перечислить то, что этот сервер действительно
        // делает, и назвать адрес, по которому спрашивают остальное.
        instructions:
          'This server answers about the work around a project on this machine: the task queue in ' +
          'tasks/, the findings recorded against it, approvals, progress for the person watching ' +
          'the dashboard, and the written procedures. It does NOT hold a model of the product — ' +
          'what something is, what depends on it and how far a change would reach are answered by ' +
          `Intelligence at ${lab().home} over this same protocol, on its own address (${lab().mcp}). ` +
          'Do not try to rebuild that here by reading the repository file by file. ' +
          'Start a session with gitmir_attention rather than asking the user what to do; call ' +
          'gitmir_setup the first time you touch a project — it puts it on the dashboard, makes ' +
          'the task queue, and says what is still missing. Record a place where the code does not ' +
          'do what the product promises with gitmir_flag the moment you find it, rather than only ' +
          'saying so in the conversation. The written procedures are gitmir_skills and ' +
          'gitmir_skill — fetch one and follow it yourself rather than asking the user to paste ' +
          'anything. ' +
          // Two procedures answer a request rather than a question, and an agent walks
          // straight past both: asked to plan, it starts editing. Say so here, where every
          // client reads it once at startup.
          'Two of those procedures answer a request rather than a question. When the user asks you to ' +
          'PLAN work — "plan this", "break this down", "what needs doing for X" — fetch ' +
          'gitmir_skill("task-planner") and follow it instead of starting to edit code: they asked for ' +
          'the work written down with its own checks, not for the work done. When they ask you to RUN ' +
          'the queue, fetch gitmir_skill("task-runner"). ' +
          'While you are on anything long — working the queue, auditing a running app, reading the ' +
          'written rules against the code — report each stage with gitmir_progress, and if you have ' +
          'to stop and ask the user something, report `blocked` with the question in it, because they are ' +
          'watching a dashboard and cannot see this conversation.',
      });
    }
    case 'notifications/initialized':
      return;                                   // nothing to gate on it — every method here is stateless
    case 'ping':
      return isRequest ? result(id, {}) : undefined;
    case 'prompts/list':
      return result(id, {
        prompts: skillDefs().map((s) => ({
          name: s.name, title: s.title, description: s.description,
          arguments: [{ name: 'note', description: 'Anything to add for this run — a target folder, a constraint, what to focus on.', required: false }],
        })),
      });
    case 'prompts/get': {
      const want = params && params.name;
      const def = skillDefs().find((s) => s.name === want);
      if (!def) return fail(id, -32602, `Unknown prompt: ${want}`);
      let body: string;
      try { body = skillText(def); } catch (e) {
        return fail(id, -32603, `Could not read skill ${path.basename(def.file)}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const note = params && params.arguments && typeof params.arguments.note === 'string' ? params.arguments.note.trim() : '';
      const text = `Follow these instructions for the project at ${DEFAULT_PROJECT}.\n\n` +
        body + (note ? `\n\n---\n\nFor this run specifically: ${note}\n` : '');
      return result(id, {
        description: def.description,
        messages: [{ role: 'user', content: { type: 'text', text } }],
      });
    }
    case 'tools/list':
      return result(id, {
        tools: TOOLS.map((t) => ({
          name: t.name, title: t.title, description: t.description,
          inputSchema: t.inputSchema, annotations: t.annotations,
        })),
      });
    case 'tools/call': {
      const name = params && params.name;
      const tool = TOOLS.find((t) => t.name === name);
      // An unknown tool is a protocol error; a tool that ran and could not answer
      // reports isError in its result. The spec draws that line and clients rely on it.
      if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
      const args: Record<string, unknown> = (params && params.arguments) || {};
      try {
        const project = projectOf(args);
        let st;
        try { st = fs.statSync(project); } catch { st = null; }
        if (!st || !st.isDirectory()) {
          return result(id, { content: [{ type: 'text', text: `Not a directory: ${project}` }], isError: true });
        }
        const out = await tool.run(args, project);
        /* Одна строка на каждый отданный ответ.
         *
         * Раньше здесь же считалось, во сколько файлов и байтов обошёлся бы тот
         * же вопрос без модели. Считать это можно только по модели, а её здесь
         * больше нет — и сравнение переезжает туда, где она живёт. Остаётся
         * запись самого факта: что спросили и сколько отдали. */
        /* Инструмент с readOnlyHint не пишет в чужой репозиторий. Точка.
         *
         * Журнал вёлся на каждый успешный вызов, включая пять инструментов,
         * объявленных read-only, — и первый же вопрос «что в очереди?» заводил
         * .gitmir/ в проекте, который человек только просматривал. Клиент вправе
         * пропустить подтверждение, поверив подсказке; подсказка, которая
         * подкрашивает правду, хуже отсутствующей — так сказано и там, где эти
         * подсказки объявлены. Пишущие инструменты в журнал попадают как прежде,
         * и дашборд по-прежнему записывает то, что спрашивают у него. */
        if (!out.isError && !tool.annotations.readOnlyHint) {
          try {
            recordUse(project, {
              tool: name,
              q: describeCall(name, args),
              served: Buffer.byteLength(out.text || '', 'utf8'),
              ids: [],
              linked: 0,
              catalogue: false,
              wouldFiles: 0,
              wouldBytes: 0,
              by: 'agent',
            });
          } catch { /* the diary never blocks the answer */ }
        }
        return result(id, { content: [{ type: 'text', text: out.text }], isError: !!out.isError });
      } catch (e: unknown) {
        log('tool failed:', name, e instanceof Error ? e.stack : String(e));
        return result(id, {
          content: [{ type: 'text', text: `${name} failed: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        });
      }
    }
    default:
      if (isRequest) return fail(id, -32601, `Method not found: ${method}`);
      return;                                   // unknown notification — ignore, per JSON-RPC
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buf += chunk;
  let nl: number;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    try { handle(msg).catch((e) => log('handler failed:', e)); } catch (e) {
      log('handler crashed:', e instanceof Error ? e.stack : String(e));
      if (msg && msg.id !== undefined && msg.id !== null) fail(msg.id, -32603, 'Internal error');
    }
  }
});
// The client closes stdin to shut us down; exiting keeps it from having to SIGTERM.
process.stdin.on('end', () => process.exit(0));

log(`${NAME} ${VERSION} on stdio — project: ${DEFAULT_PROJECT}`);
