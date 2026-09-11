// Два ключа на одной машине, за ноль токенов:  node lab-keys-check.ts
//
// Intelligence здесь — заглушка node:http на 127.0.0.1 в этом же процессе: lib/lab.js
// смотрит на неё через GITMIR_LAB_URL, состояние и домашняя папка — во временной папке.
// Заглушка записывает, с каким Bearer пришёл каждый запрос, и по этим записям видно,
// какой ключ куда ушёл. Своих сетевых вызовов у проверки нет, зависимостей тоже — счёт
// аудита в SECURITY.md она не меняет. Ключи на экран не печатаются, только хвосты.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(ROOT, 'bin', 'gitmir.mjs');

let failed = 0, passed = 0;
function ok(name: string, cond: any, detail: any = '') {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✕ ' + name + (detail ? ' — ' + String(detail).slice(0, 600) : '')); }
}
const section = (t: string) => console.log('\n' + t);

// Ключи из окружения того, кто запускает, сюда не доходят: проверка — про lab.json.
delete process.env.GITMIR_LAB_KEY;
delete process.env.GITMIR_LAB_AGENT_KEY;

/* ---- место ----------------------------------------------------------------------- */
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmir-lab-keys-check-'));
const STATE = path.join(T, 'state');
const HOME = path.join(T, 'home');
const WORK = path.join(T, 'work');
const NOBIN = path.join(T, 'nobin'); // PATH, в котором нет claude
for (const d of [STATE, HOME, WORK, NOBIN]) fs.mkdirSync(d, { recursive: true });
const KEYFILE = path.join(STATE, 'lab.json');

// Хвосты у ключей разные: по ним `gitmir lab status` их и различает.
const KEYS: string[] = [];
while (KEYS.length < 4) {
  const k = 'ctx_' + crypto.randomBytes(24).toString('base64url');
  if (!KEYS.some((x) => x.slice(-4) === k.slice(-4))) KEYS.push(k);
}
const [K1, K2, K3, K4] = KEYS;
const tail = (k: string | null) => (k ? '…' + k.slice(-4) : 'none');

/* ---- заглушка Intelligence ------------------------------------------------------- */
// Коннектор-скрипт говорит только хвост ключа, который ему дали, и есть ли у него ключ агента.
const CONNECTOR = [
  "const k = process.env.GITMIR_LAB_KEY || '';",
  "console.log('tail ' + k.slice(-4));",
  "console.log('agent ' + (process.env.GITMIR_LAB_AGENT_KEY ? 'present' : 'absent'));",
].join('\n') + '\n';
const CONNECTOR_SHA = crypto.createHash('sha256').update(CONNECTOR).digest('hex');

type Seen = { method: string, path: string, bearer: string | null };
const seen: Seen[] = [];
const server = http.createServer((req, res) => {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  seen.push({ method: req.method || '', path: u.pathname, bearer });
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code: number, obj: any) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!bearer) return json(401, { error: 'no key' });
    if (req.method === 'GET' && u.pathname === '/view/projects') return json(200, { projects: [{ id: 'acme-web' }] });
    if (req.method === 'POST' && u.pathname === '/mcp') {
      let id = null;
      try { id = JSON.parse(body).id; } catch {}
      return json(200, { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'acme-web' }] } });
    }
    if (req.method === 'GET' && u.pathname === '/connector/latest') {
      return json(200, { kind: 'script', url: '/connector/gitmir-connector.js', sha256: CONNECTOR_SHA, version: '0.0.0-check' });
    }
    if (req.method === 'GET' && u.pathname === '/connector/gitmir-connector.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(CONNECTOR);
    }
    return json(404, { error: 'no such route' });
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const LAB = `http://127.0.0.1:${(server.address() as any).port}`;

process.env.GITMIR_STATE = STATE;
process.env.GITMIR_LAB_URL = LAB;
// Коннектор кладёт себя в ~/.gitmir/connector — пусть это будет временная папка.
process.env.HOME = HOME;
if (process.platform === 'win32') process.env.USERPROFILE = HOME;
if (os.homedir() !== HOME) {
  console.error(`\n  The home folder did not move to ${HOME}; stopping before anything writes into the real one.\n`);
  process.exit(1);
}

const L: any = await import(pathToFileURL(path.join(ROOT, 'lib', 'lab.js')).href);
const C: any = await import(pathToFileURL(path.join(ROOT, 'lib', 'connector.js')).href);

/* ---- помощники ------------------------------------------------------------------- */
const SENTENCE = 'The Local Connector uses your personal key, not an agent key: gitmir lab <your personal key>';
// Отказ называет, где личный ключ: /account/access теперь только выбирает место агента.
const WHERE = SENTENCE + ' — it is on ' + LAB + '/account/me';
const HOST = new URL(LAB).host;
const put = (d: any, mode = 0o600) => { fs.rmSync(KEYFILE, { force: true }); fs.writeFileSync(KEYFILE, JSON.stringify(d), { mode }); };
const file = () => { try { return JSON.parse(fs.readFileSync(KEYFILE, 'utf8')); } catch { return null; } };
const mode600 = () => process.platform === 'win32' || (fs.statSync(KEYFILE).mode & 0o777) === 0o600;
async function during(fn: () => any): Promise<{ result: any, sent: Seen[] }> {
  const from = seen.length;
  const result = await fn();
  return { result, sent: seen.slice(from) };
}
const tails = (s: Seen[]) => s.map((x) => `${x.method} ${x.path} ${tail(x.bearer)}`).join(', ') || 'no request';
const sentOnlyWith = (s: Seen[], k: string, n: number) => s.length === n && s.every((x) => x.bearer === k);
// Никакое окно из восьми знаков ключа не должно попасть в вывод; хвост из четырёх — можно.
const leaks = (out: string) => KEYS.filter((k) => {
  for (let i = 0; i + 8 <= k.length; i++) if (out.includes(k.slice(i, i + 8))) return true;
  return false;
}).map(tail);
const usesOf = (kind: string, source: string) => (L.keys().find((r: any) => r.kind === kind && r.source === source) || {}).uses;

/* ---- {key: K1, agentKey: K2} ----------------------------------------------------- */
section('lab.json {key: K1, agentKey: K2}');
put({ key: K1, agentKey: K2 });
{
  const v = await during(() => L.view('projects'));
  ok('view("projects") sends Bearer K2', sentOnlyWith(v.sent, K2, 1) && v.result.projects?.[0]?.id === 'acme-web', tails(v.sent));
  const a = await during(() => L.ask('gitmir_projects'));
  ok('ask("gitmir_projects") sends Bearer K2', sentOnlyWith(a.sent, K2, 1) && a.result.text === 'acme-web', tails(a.sent));
  const f = await during(() => C.fetchConnector());
  ok('fetchConnector() sends Bearer K1, on both of its requests', f.result.ok === true && sentOnlyWith(f.sent, K1, 2),
    tails(f.sent) + ' ' + String(f.result.error || ''));
  ok('connected() is true; key() is K1 and agentKey() is K2', L.connected() === true && L.key() === K1 && L.agentKey() === K2);
  const src = L.keySource();
  ok('keySource() says /mcp and /view use the saved agent key', src && src.source === 'saved' && src.key === 'agent', JSON.stringify(src));
  ok('keys(): the agent key serves assistants, the personal key the Local Connector',
    JSON.stringify(usesOf('agent', 'saved')) === '["assistants"]' && JSON.stringify(usesOf('personal', 'saved')) === '["connector"]',
    JSON.stringify(L.keys()));
  ok('keys() carries last four characters and never a key', !JSON.stringify(L.keys()).includes(K1.slice(0, 8)) && !JSON.stringify(L.keys()).includes(K2.slice(0, 8))
    && L.keys().every((r: any) => r.last4.length === 4));

  // Коннектору уходит личный ключ, а ключ агента из окружения с ним не едет.
  process.env.GITMIR_LAB_AGENT_KEY = K3;
  const lines: string[] = [];
  const r = await during(() => C.run({ project: 'acme-web', onLine: (l: string) => lines.push(l) }));
  delete process.env.GITMIR_LAB_AGENT_KEY;
  ok('run() hands the connector K1 and no agent key', r.result.ok === true && r.sent.length === 0
    && lines.includes('tail ' + K1.slice(-4)) && lines.includes('agent absent'), lines.join(' | ').replace(/tail (.{4})/, 'tail …$1'));
}

/* ---- {key: K1} ------------------------------------------------------------------- */
section('lab.json {key: K1} only — a machine set up before two keys');
put({ key: K1 });
{
  const v = await during(() => L.view('projects'));
  ok('view("projects") sends Bearer K1', sentOnlyWith(v.sent, K1, 1), tails(v.sent));
  const a = await during(() => L.ask('gitmir_projects'));
  ok('ask("gitmir_projects") sends Bearer K1', sentOnlyWith(a.sent, K1, 1), tails(a.sent));
  const f = await during(() => C.fetchConnector());
  ok('fetchConnector() sends Bearer K1', f.result.ok === true && sentOnlyWith(f.sent, K1, 2), tails(f.sent));
  const src = L.keySource();
  ok('keySource() says /mcp and /view use the saved personal key', src && src.source === 'saved' && src.key === 'personal', JSON.stringify(src));
  ok('keys(): the one key serves both', JSON.stringify(usesOf('personal', 'saved')) === '["assistants","connector"]', JSON.stringify(L.keys()));
}

/* ---- {agentKey: K2} -------------------------------------------------------------- */
section('lab.json {agentKey: K2} only');
put({ agentKey: K2 });
{
  const v = await during(() => L.view('projects'));
  ok('view("projects") sends Bearer K2', sentOnlyWith(v.sent, K2, 1), tails(v.sent));
  const a = await during(() => L.ask('gitmir_projects'));
  ok('ask("gitmir_projects") sends Bearer K2', sentOnlyWith(a.sent, K2, 1), tails(a.sent));
  const f = await during(() => C.fetchConnector());
  ok('fetchConnector() sends nothing and answers the personal-key sentence, naming /account/me',
    f.sent.length === 0 && f.result.ok === false && f.result.error === WHERE, tails(f.sent) + ' ' + JSON.stringify(f.result));
  const r = await during(() => C.run({ project: 'acme-web' }));
  ok('run() sends nothing, starts nothing and answers the same sentence',
    r.sent.length === 0 && r.result.ok === false && r.result.error === WHERE, JSON.stringify(r.result));
  ok('key() is null, and connected() is still true', L.key() === null && L.connected() === true);
}

/* ---- окружение ------------------------------------------------------------------- */
section('keys from the environment');
put({ key: K1, agentKey: K2 });
process.env.GITMIR_LAB_AGENT_KEY = K3;
{
  const v = await during(() => L.view('projects'));
  ok('GITMIR_LAB_AGENT_KEY wins over the saved agent key for view()', sentOnlyWith(v.sent, K3, 1), tails(v.sent));
  const f = await during(() => C.fetchConnector());
  ok('and fetchConnector() still sends the personal key', sentOnlyWith(f.sent, K1, 2), tails(f.sent));
  ok('keys() marks the saved agent key as unused', JSON.stringify(usesOf('agent', 'saved')) === '[]'
    && JSON.stringify(usesOf('agent', 'environment')) === '["assistants"]', JSON.stringify(L.keys()));
}
delete process.env.GITMIR_LAB_AGENT_KEY;
put({ agentKey: K2 });
process.env.GITMIR_LAB_KEY = K3;
{
  const v = await during(() => L.view('projects'));
  ok('a saved agent key wins over GITMIR_LAB_KEY for view()', sentOnlyWith(v.sent, K2, 1), tails(v.sent));
  const f = await during(() => C.fetchConnector());
  ok('and fetchConnector() sends GITMIR_LAB_KEY', sentOnlyWith(f.sent, K3, 2), tails(f.sent));
}
delete process.env.GITMIR_LAB_KEY;

/* ---- remember и forget ----------------------------------------------------------- */
section('remember() and forget()');
put({ key: K1 }, 0o644);
{
  L.remember(K2, { agent: true });
  let d = file();
  ok('remember(K2, {agent: true}) keeps key, sets agentKey, and the file is 0600',
    d && d.key === K1 && d.agentKey === K2 && typeof d.at === 'string' && mode600(), JSON.stringify(d && Object.keys(d)));
  L.remember(K3);
  d = file();
  ok('remember(K3) replaces key and keeps agentKey', d && d.key === K3 && d.agentKey === K2 && mode600());
  let refused = false;
  try { L.remember('not-a-key', { agent: true }); } catch { refused = true; }
  d = file();
  ok('a key that does not start with ctx_ is refused, and both saved keys stay', refused && d.key === K3 && d.agentKey === K2);
  ok('no temporary file is left beside lab.json', fs.readdirSync(STATE).filter((f) => f.startsWith('lab.json.')).length === 0,
    fs.readdirSync(STATE).join(', '));
  ok('forget() removes the file with both keys', L.forget() === true && !fs.existsSync(KEYFILE)
    && L.key() === null && L.agentKey() === null && L.connected() === false && L.keySource() === null);
  const none = await during(() => L.view('projects'));
  ok('with no key, view() asks nothing and says it is not connected', none.sent.length === 0 && none.result.connected === false);
}

/* ---- gitmir lab ------------------------------------------------------------------ */
const CLI_ENV = { PATH: NOBIN, HOME, GITMIR_STATE: STATE, GITMIR_LAB_URL: LAB, LANG: 'C' };
function gitmir(args: string[]): Promise<{ code: number, stdout: string, stderr: string, sent: Seen[] }> {
  const from = seen.length;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: WORK, env: CLI_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code == null ? 1 : code, stdout, stderr, sent: seen.slice(from) }); });
  });
}
const lineWith = (out: string, k: string) => out.split('\n').find((l) => l.includes(tail(k))) || '';

section('gitmir lab add --project acme-web --key K2, with no claude on PATH');
put({ key: K1 });
{
  const r = await gitmir(['lab', 'add', '--project', 'acme-web', '--key', K2]);
  const d = file();
  ok('exits 0', r.code === 0, r.stderr);
  ok('key stays K1 and agentKey becomes K2', d && d.key === K1 && d.agentKey === K2);
  ok('lab.json keeps mode 0600', mode600());
  ok('the connection check went with Bearer K2', r.sent.length > 0 && r.sent.every((x) => x.bearer === K2), tails(r.sent));
  ok('the hand-registration line quotes the project address, at local scope',
    r.stdout.includes(`"${LAB}/mcp?project=acme-web"`) && /claude mcp add -s local gitmir-lab /.test(r.stdout), r.stdout);
  ok('no key text reaches stdout (or stderr)', leaks(r.stdout + r.stderr).length === 0, leaks(r.stdout + r.stderr).join(', '));
}

/* Подсказки о ключе: ключ агента делают внутри проекта или репозитория, личный — на
 * /account/me, а даты конца личных ключей в клиенте нет (её назначает кабинет). */
const ISO_DATE = /\b20\d\d-\d\d-\d\d\b/;
const HINT = `use a key made for that project or repository: open it on ${HOST} and press Connect an AI agent`;

section('the key hints: lab add --project, lab add, and lab with no key');
put({ key: K1 });
{
  const r = await gitmir(['lab', 'add', '--project', 'acme-web']);
  ok('lab add --project acme-web exits 0 and quotes the project address', r.code === 0
    && r.stdout.includes(`"${LAB}/mcp?project=acme-web"`), r.stdout + r.stderr);
  ok('it says where a key for that place is made', r.stdout.includes(HINT), r.stdout);
  ok('it says the personal key stops on /mcp, with no date', r.stdout.includes('stops working on /mcp on the date shown in the cabinet')
    && !ISO_DATE.test(r.stdout), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0);
}
put({ key: K1 });
{
  const r = await gitmir(['lab', 'add']);
  const line = r.stdout.split('\n').find((l) => l.includes('Older personal keys stop working on /mcp')) || '';
  ok('lab add without --project adds one line on older personal keys, with no date, suggesting --project', r.code === 0
    && line.includes('on the date shown in the cabinet') && line.includes('gitmir lab add --project <id>') && !ISO_DATE.test(r.stdout), r.stdout);
}
put({ agentKey: K2 });
{
  const r = await gitmir(['lab', 'add', '--project', 'acme-web']);
  ok('with a saved agent key, lab add --project says it reads only its own place and where to make another',
    r.code === 0 && r.stdout.includes(`agent key ending …${K2.slice(-4)}`) && r.stdout.includes(HINT), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0);
}
fs.rmSync(KEYFILE, { force: true });
{
  const r = await gitmir(['lab']);
  ok('lab with no key sends people to Connect an AI agent, and names /account/me for the Local Connector', r.code === 0
    && r.stdout.includes('Connect an AI agent') && r.stdout.includes(`${LAB}/account/me`) && r.sent.length === 0, r.stdout);
}
put({ key: K1 });
{
  const r = await gitmir(['lab']);
  ok('lab when connected names /account/me for the Local Connector', r.code === 0
    && r.stdout.includes(`personal key is on ${LAB}/account/me`) && r.stdout.includes(HINT), r.stdout);
}

section('gitmir lab status');
put({ key: K1, agentKey: K2 });
{
  const r = await gitmir(['lab', 'status']);
  ok('exits 0', r.code === 0, r.stderr);
  const agent = lineWith(r.stdout, K2), personal = lineWith(r.stdout, K1);
  ok('the agent key: its last four, used by assistants (/mcp and /view)',
    agent.includes('assistants (/mcp and /view)') && !agent.includes('Local Connector'), r.stdout);
  ok('the personal key: its last four, used by the Local Connector',
    personal.includes('Local Connector') && !personal.includes('assistants'), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0, leaks(r.stdout + r.stderr).join(', '));
}
put({ key: K1 });
{
  const r = await gitmir(['lab', 'status']);
  const personal = lineWith(r.stdout, K1);
  ok('with only a personal key, its line names both uses', r.code === 0
    && personal.includes('assistants (/mcp and /view)') && personal.includes('Local Connector'), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0);
}
put({ agentKey: K2 });
{
  const r = await gitmir(['lab', 'status']);
  ok('with only an agent key, the Local Connector is said to need the personal key', r.code === 0
    && lineWith(r.stdout, K2).includes('assistants (/mcp and /view)') && r.stdout.includes(WHERE), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0);
}

section('gitmir lab add-here --project acme-web --key K3');
put({ key: K1, agentKey: K2 });
{
  const r = await gitmir(['lab', 'add-here', '--project', 'acme-web', '--key', K3]);
  const d = file();
  ok('exits 0; key stays K1 and agentKey becomes K3', r.code === 0 && d && d.key === K1 && d.agentKey === K3, r.stderr);
  ok('the line for .mcp.json refers to ${GITMIR_LAB_AGENT_KEY} rather than carrying a key',
    r.stdout.includes("'Authorization: Bearer ${GITMIR_LAB_AGENT_KEY}'"), r.stdout);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0, leaks(r.stdout + r.stderr).join(', '));
  ok('nothing was written into the folder', fs.readdirSync(WORK).length === 0, fs.readdirSync(WORK).join(', '));
}

section('gitmir lab <key>, the refusals, status and forget');
{
  const r = await gitmir(['lab', K4]);
  const d = file();
  ok('gitmir lab K4 saves the personal key and keeps agentKey', r.code === 0 && d && d.key === K4 && d.agentKey === K3 && mode600(), r.stderr);
  ok('no key text reaches stdout', leaks(r.stdout + r.stderr).length === 0);

  const before = fs.readFileSync(KEYFILE, 'utf8');
  const noProject = await gitmir(['lab', 'add', '--key', K1]);
  ok('--key without --project is refused and saves nothing', noProject.code !== 0 && fs.readFileSync(KEYFILE, 'utf8') === before, noProject.stdout);
  const badId = await gitmir(['lab', 'add', '--project', 'Bad_Id', '--key', K1]);
  ok('a bad project id is refused before the key is saved', badId.code !== 0 && fs.readFileSync(KEYFILE, 'utf8') === before, badId.stdout);
  const badKey = await gitmir(['lab', 'add', '--project', 'acme-web', '--key', 'nope']);
  ok('a key that is not a key is refused, and the saved keys stay', badKey.code !== 0 && fs.readFileSync(KEYFILE, 'utf8') === before, badKey.stdout);
  const all = [noProject, badId, badKey].map((x) => x.stdout + x.stderr).join('\n');
  ok('no key text in any refusal, and no request made', leaks(all).length === 0 && [noProject, badId, badKey].every((x) => x.sent.length === 0));

  const st = await gitmir(['status']);
  ok('gitmir status says assistants use the saved agent key', /Intelligence\s+connected \(agent key saved in /.test(st.stdout)
    && leaks(st.stdout + st.stderr).length === 0, st.stdout);

  const gone = await gitmir(['lab', 'forget']);
  ok('gitmir lab forget removes both keys', gone.code === 0 && !fs.existsSync(KEYFILE), gone.stdout);
}

/* ---- итог ------------------------------------------------------------------------ */
server.close();
fs.rmSync(T, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
