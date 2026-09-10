// Intelligence: where the model lives now.
//
// This tool used to build and keep a model on your disk. It no longer does. The
// model is built and kept by Intelligence, and reached over MCP — the same way
// your assistant reaches it. Everything here that needs a model asks
// Intelligence; everything that does not keeps working with no account at all.
//
// That split is deliberate and worth stating, because half of this tool is
// useful on its own: the task queue, the findings, the audits that walk a running
// application. None of those need a model. Turning the whole tool into a login
// screen would have been the easy way to sell Intelligence and the fast way to
// lose the people who have not bought it yet.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_HOME = 'https://lab.gitmir.com';

/* Адрес Intelligence. GITMIR_LAB_URL — для стенда и проверок: https, а http только на
 * 127.0.0.1, — по открытому http уехал бы ключ. Неподходящий адрес не принимается, и
 * ключ туда не уходит. */
function home() {
  const raw = (process.env.GITMIR_LAB_URL || '').trim();
  if (!raw) return DEFAULT_HOME;
  try {
    const u = new URL(raw);
    if (u.username || u.password) return DEFAULT_HOME;
    if (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1')) return u.origin;
  } catch {}
  return DEFAULT_HOME;
}

/* Форма id проекта — та же, что кабинет принимает в адресе /mcp. Проверяется до
 * регистрации: кривой id иначе прописался бы у ассистента и отказывал бы уже на
 * первом вопросе, далеко от команды, которая его записала. */
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

/** Where the model lives, and where a person goes to get one. */
export const lab = () => {
  const HOME = home();
  return {
    home: HOME,
    signIn: HOME + '/login',
    signUp: HOME + '/signup',
    mcp: HOME + '/mcp',
    keys: HOME + '/account/access',
    /* Адрес, с которого соединение начинается в одном проекте. Функция, а не
     * строка: без id такого адреса нет. В ответы экрану lab() уходит через
     * JSON, и функция там просто выпадает — форма ответа не меняется. */
    mcpFor: (id) => {
      const v = String(id == null ? '' : id);
      if (!PROJECT_ID.test(v)) {
        throw new Error('That is not a project id: ' + JSON.stringify(v) + '. A project id is '
          + 'lowercase letters, digits and dashes, up to 61 characters, and does not start with a dash.');
      }
      return HOME + '/mcp?project=' + v;
    },
  };
};

/* Где лежит ключ этой машины.
 *
 * Не в репозитории — никогда. Ключ даёт право читать модель продукта, а
 * репозиторий коммитят, показывают на экране и кладут в архив. Он живёт рядом с
 * остальным состоянием пульта, в домашней папке, и правами только для хозяина. */
const STATE = () => process.env.GITMIR_STATE || path.join(os.homedir(), '.gitmir');
const KEYFILE = () => path.join(STATE(), 'lab.json');

/* Ключей на машине два, и в lab.json лежит {key, agentKey, at}.
 *
 * Личный ключ (key) перестанет открывать /mcp и /view, а ключ агента (agentKey) не
 * пускают на /upload и /connector — одним ключом обе двери не открыть. Поэтому
 * ассистенты ходят с ключом агента, а Local Connector — с личным. */

/** Что лежит в lab.json. Нет файла или он битый — ключей нет. */
function saved() {
  try {
    const d = JSON.parse(fs.readFileSync(KEYFILE(), 'utf8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch { return {}; }
}
const fieldOf = (d, name) => String((d && d[name]) || '').trim() || null;
const envOf = (name) => (process.env[name] || '').trim() || null;

/**
 * Личный ключ этой машины, или ничего. С ним ходит Local Connector.
 *
 * Переменная окружения бьёт файл: так проще один раз запустить с чужим ключом,
 * ничего не перезаписав. Раньше был только этот путь — и это значило, что
 * подключиться из пульта было нечем вовсе: способа ввести ключ не существовало
 * ни на одном экране, а переменная окружения в самом репозитории не упоминалась
 * ни разу.
 */
export function key() {
  const env = (process.env.GITMIR_LAB_KEY || '').trim();
  if (env) return env;
  try {
    const d = JSON.parse(fs.readFileSync(KEYFILE(), 'utf8'));
    return String(d.key || '').trim() || null;
  } catch { return null; }
}

/**
 * Ключ, с которым ходят ассистенты: /mcp и /view.
 *
 * Нет ключа агента — берётся личный: машина с сегодняшним lab.json, где лежит
 * только key, работает как работала.
 */
export function agentKey() {
  return envOf('GITMIR_LAB_AGENT_KEY') || fieldOf(saved(), 'agentKey') || key();
}

/* Порядок выбора — тот же, что в key() и agentKey(); вынесен, чтобы экран и
 * `gitmir lab status` не держали своих копий и не разошлись с тем, что шлётся. */
function candidates() {
  const d = saved();
  const rows = [
    { kind: 'agent', source: 'environment', name: 'GITMIR_LAB_AGENT_KEY', value: envOf('GITMIR_LAB_AGENT_KEY') },
    { kind: 'agent', source: 'saved', name: 'agentKey', value: fieldOf(d, 'agentKey') },
    { kind: 'personal', source: 'environment', name: 'GITMIR_LAB_KEY', value: envOf('GITMIR_LAB_KEY') },
    { kind: 'personal', source: 'saved', name: 'key', value: fieldOf(d, 'key') },
  ].filter((r) => r.value);
  return { rows, forAssistants: rows[0] || null, forConnector: rows.find((r) => r.kind === 'personal') || null };
}

/**
 * Откуда ключ, с которым ходят /mcp и /view, и какой он — ключ агента или личный.
 * null — ключа нет вовсе.
 */
export function keySource() {
  const it = candidates().forAssistants;
  return it ? { source: it.source, key: it.kind, name: it.name } : null;
}

/**
 * Ключи на этой машине и кто каким пользуется: assistants (/mcp и /view) и
 * connector (Local Connector). Сам ключ наружу не отдаётся — только последние
 * четыре знака: терминалы и вкладки попадают в скриншоты.
 */
export function keys() {
  const c = candidates();
  return c.rows.map((r) => ({
    kind: r.kind, source: r.source, name: r.name, last4: r.value.slice(-4),
    uses: [r === c.forAssistants ? 'assistants' : null, r === c.forConnector ? 'connector' : null].filter(Boolean),
  }));
}

/**
 * Запомнить ключ на этой машине: с { agent: true } — ключ агента, иначе личный.
 * Второй ключ при этом остаётся на месте.
 *
 * Права 0600 и домашняя папка — а не переменная окружения в профиле оболочки,
 * которую человек однажды скопирует в чат вместе с остальным профилем.
 */
export function remember(k, { agent = false } = {}) {
  const v = String(k || '').trim();
  if (!v) throw new Error('There is no key in that.');
  // У ключей агента тот же префикс ctx_, так что проверка одна на оба.
  if (!/^ctx_[A-Za-z0-9_-]{16,}$/.test(v)) {
    throw new Error('That does not look like an Intelligence key. They start with ctx_ '
      + 'and you copy them whole from ' + lab().keys + '.');
  }
  fs.mkdirSync(STATE(), { recursive: true });
  const f = KEYFILE();
  const prev = saved();
  const personal = agent ? fieldOf(prev, 'key') : v;
  const forAgents = agent ? v : fieldOf(prev, 'agentKey');
  const next = { ...(personal ? { key: personal } : {}), ...(forAgents ? { agentKey: forAgents } : {}),
    at: new Date().toISOString() };
  // Имя временного файла случайное: оставшийся от упавшего запуска мог быть с другими правами.
  const tmp = f + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, f);
  return f;
}

/** Забыть оба ключа. Отключение обязано быть таким же простым, как подключение. */
export function forget() {
  try { fs.unlinkSync(KEYFILE()); return true; } catch { return false; }
}

/* Ответ там, где нужен личный ключ, а есть только ключ агента. Одна фраза на
 * коннектор и `gitmir lab status`, чтобы они не разошлись. */
export const PERSONAL_KEY_NEEDED = 'The Local Connector uses your personal key, not an agent key: gitmir lab <your personal key>';

/**
 * Is an Intelligence key set on this machine?
 *
 * The one place the whole client asks. Every screen, every tool and every line of
 * text that says anything about Intelligence reads this and nothing else —
 * private copies of the same question are how one answer ends up contradicting
 * another inside a single reply.
 *
 * It answers about the key and only about the key. We deliberately do not probe
 * the network here: a slow or offline check would make every screen that merely
 * wants to say "no key yet" wait for a timeout. So the wording built on it must
 * not promise more than a key — whether Intelligence actually answers is known
 * only once something asks it, and `view()` and `ask()` report that separately.
 */
// Про тот ключ, с которым ходят ассистенты: у одного личного ключа это он же.
export const connected = () => agentKey() !== null;

/**
 * The answer every model-shaped surface gives until Intelligence is connected.
 *
 * One shape, one wording, one place to change it. Scattered copies of "no model
 * here" drift into four different explanations of the same situation, and the
 * person reading the fourth one concludes the tool is broken.
 */
export function needsLab(what = 'This') {
  return {
    lab: lab(),
    connected: false,
    error: what + ' comes from Intelligence, and this machine is not connected to it yet.',
    how: [
      'The model of a product is built and kept at ' + home() + ' — not on this machine.',
      'Sign in (or sign up) there, open MCP access, copy the key, and set it as '
        + 'GITMIR_LAB_KEY in the environment this tool starts in.',
      'Everything here that does not need a model keeps working without it: the task '
        + 'queue, findings, and the audits that walk a running application.',
    ],
  };
}

/**
 * Read a projection the viewer can draw from.
 *
 * MCP answers in text, because an agent reads it. A picture needs shape, and the
 * Intelligence serves the same projection in a machine-readable form on its own
 * path: names, business words, handles. Nothing more than the text already says —
 * which is the point, and the reason a viewer can exist at all without the model
 * ever being on this machine.
 */
export async function view(what, params = {}) {
  const k = agentKey();
  if (!k) return needsLab();
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(lab().home + '/view/' + what + (qs ? '?' + qs : ''), {
      headers: { authorization: 'Bearer ' + k },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { connected: true, error: (body && body.error) || ('Intelligence answered ' + res.status),
        lab: lab() };
    }
    return { connected: true, ...body };
  } catch (e) {
    return { connected: true, error: 'Intelligence is not answering: ' + String(e?.message || e),
      lab: lab() };
  }
}

/**
 * Ask Intelligence something over MCP.
 *
 * Deliberately thin and deliberately unfinished: the tools it will call
 * (the map, an area, the neighbours of a handle, findings, the task queue) do not
 * exist in Intelligence yet. Until they do, every caller gets `needsLab`
 * and says so on screen rather than pretending.
 */
export async function ask(tool, args = {}) {
  const k = agentKey();
  if (!k) return needsLab();
  try {
    const res = await fetch(lab().mcp, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { connected: true, error: (body && body.error && body.error.message)
        || ('Intelligence answered ' + res.status), lab: lab() };
    }
    const text = body?.result?.content?.[0]?.text;
    return { connected: true, text: typeof text === 'string' ? text : '', raw: body?.result || null };
  } catch (e) {
    // "Not answering" and "refused" are different news, and the screen needs the
    // first one — otherwise the reader looks for the fault on their own machine.
    return { connected: true, error: 'Intelligence is not answering: ' + String(e?.message || e),
      lab: lab() };
  }
}
