// Запуск коннектора — для репозиториев, которые не могут покинуть эту машину.
//
// Обычный путь другой: репозиторий подключается в лаборатории, она его тянет и
// читает у себя. Это проще и дешевле, и большинству этого достаточно.
//
// Но у части клиентов исходник выпускать нельзя — NDA, регламент, отраслевое
// требование. Тогда читать его должно то, что стоит рядом с ним. Коннектор
// делает ровно это: собирает модель здесь и отправляет только её.
//
// Почему он не лежит в этом репозитории. Внутри него — логика извлечения, то
// самое, чего в открытом коде нет и не будет. Здесь только запуск: скачать,
// проверить, выполнить, показать вывод.
//
// Что здесь честно сказать человеку, и что сказано в коде и на экране: исходник
// не уезжает — уезжает модель, и лаборатория её видит. Кому нужно, чтобы не
// видела и она, нужен весь контур у себя.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { lab, key as labKey } from './lab.js';

const home = () => {
  const d = path.join(os.homedir(), '.gitmir', 'connector');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/** Где лежит скачанный коннектор и что мы о нём знаем. */
export function installed() {
  const dir = home();
  const js = path.join(dir, 'gitmir-connector.js');
  const bin = path.join(dir, 'gitmir-connector' + (process.platform === 'win32' ? '.exe' : ''));
  const at = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };
  if (fs.existsSync(bin)) return { kind: 'binary', path: bin, at: at(bin) };
  if (fs.existsSync(js)) return { kind: 'script', path: js, at: at(js) };
  return null;
}

/**
 * Забрать коннектор из лаборатории.
 *
 * Скачанное проверяется отпечатком, который лаборатория называет отдельно. Не
 * ради секретности — соединение и так по TLS, — а потому что это исполняемый
 * файл на машине клиента: молча выполнить то, что пришло по сети, нельзя даже
 * от себя самих.
 */
export async function fetchConnector() {
  const k = labKey();
  if (!k) return { ok: false, error: 'Connect a laboratory first — the connector is issued with your key.' };
  const dir = home();
  let meta;
  try {
    const r = await fetch(lab().home + '/connector/latest', { headers: { authorization: 'Bearer ' + k } });
    if (!r.ok) return { ok: false, error: 'The laboratory has no connector for this account yet.' };
    meta = await r.json();
  } catch (e) {
    return { ok: false, error: 'Could not reach the laboratory: ' + String(e?.message || e) };
  }
  const name = meta.kind === 'binary'
    ? 'gitmir-connector' + (process.platform === 'win32' ? '.exe' : '')
    : 'gitmir-connector.js';
  let body;
  try {
    const r = await fetch(meta.url, { headers: { authorization: 'Bearer ' + k } });
    if (!r.ok) return { ok: false, error: 'Download failed: ' + r.status };
    body = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return { ok: false, error: 'Download failed: ' + String(e?.message || e) };
  }
  const got = crypto.createHash('sha256').update(body).digest('hex');
  if (meta.sha256 && got !== meta.sha256) {
    return { ok: false, error: 'What arrived is not what the laboratory said it sent. Nothing was written.' };
  }
  const to = path.join(dir, name);
  fs.writeFileSync(to, body, { mode: meta.kind === 'binary' ? 0o755 : 0o644 });
  return { ok: true, kind: meta.kind, path: to, version: meta.version || null };
}

/**
 * Выполнить коннектор и отдавать его вывод строкой за строкой.
 *
 * Вывод идёт наружу как есть: сборка занимает минуты, и человек, запустивший её,
 * должен видеть, что она делает, а не смотреть на слово «работает».
 */
export function run({ project, as = '', onLine = () => {} }) {
  const it = installed();
  if (!it) return Promise.resolve({ ok: false, error: 'The connector is not here yet. Fetch it first.' });
  const k = labKey();
  if (!k) return Promise.resolve({ ok: false, error: 'Connect a laboratory first.' });

  const args = ['--project', project, '--key', k, ...(as ? ['--as', as] : []), '--lab', lab().home];
  const cmd = it.kind === 'binary' ? it.path : process.execPath;
  const argv = it.kind === 'binary' ? args : [it.path, ...args];

  return new Promise((resolve) => {
    /* Окружение передаётся как есть — и это здесь главное.
     *
     * Адрес модели ИИ задаёт клиент: OPENAI_BASE_URL на его собственную
     * развёрнутую модель. Без этого исходник уходил бы в OpenAI, и обещание
     * «код не покидает ваш контур» было бы неправдой. */
    const p = spawn(cmd, argv, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const feed = (buf) => {
      tail += String(buf);
      const lines = tail.split(/\r?\n/);
      tail = lines.pop() || '';
      for (const l of lines) onLine(l);
    };
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    p.on('error', (e) => resolve({ ok: false, error: String(e?.message || e) }));
    p.on('close', (code) => {
      if (tail) onLine(tail);
      resolve(code === 0 ? { ok: true } : { ok: false, error: 'The connector stopped with code ' + code });
    });
  });
}
