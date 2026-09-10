// Запуск коннектора — для репозиториев, которые не могут покинуть эту машину.
//
// Обычный путь другой: репозиторий подключается в Intelligence — там его тянут
// и читают у себя. Это проще и дешевле, и большинству этого достаточно.
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
// не уезжает — уезжает модель, и её видит Intelligence. Кому нужно, чтобы не
// видел и он, нужен весь контур у себя.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
/* Коннектор ходит только с личным ключом (key), никогда с ключом агента: ключ
 * агента движок не пускает на /upload и /connector, и подставленный вместо
 * личного он получил бы отказ далеко отсюда, с непонятным текстом. */
import { lab, key as labKey, PERSONAL_KEY_NEEDED as NEEDS_PERSONAL_KEY } from './lab.js';

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
 * Забрать коннектор из Intelligence.
 *
 * Скачанное проверяется отпечатком, который Intelligence называет отдельно. Не
 * ради секретности — соединение и так по TLS, — а потому что это исполняемый
 * файл на машине клиента: молча выполнить то, что пришло по сети, нельзя даже
 * от себя самих.
 */
export async function fetchConnector() {
  const k = labKey();
  if (!k) return { ok: false, error: NEEDS_PERSONAL_KEY };
  const dir = home();
  let meta;
  try {
    const r = await fetch(lab().home + '/connector/latest', { headers: { authorization: 'Bearer ' + k } });
    if (!r.ok) return { ok: false, error: 'Intelligence has no connector for this account yet.' };
    meta = await r.json();
  } catch (e) {
    return { ok: false, error: 'Could not reach Intelligence: ' + String(e?.message || e) };
  }
  /* Адрес выдачи называет Intelligence, и брать его на веру нельзя: следом мы
   * отправляем по нему Bearer-ключ. Ошибка (или подмена) в этом ответе — и ключ
   * уезжает на чужой хост. Поэтому ключ уходит только на origin самого
   * Intelligence, а всё остальное отвергается вслух: «Download failed: fetch
   * failed» ничего не объясняет тому, кто уткнулся в адрес вида localhost. */
  let src = null;
  try { src = new URL(meta?.url, lab().home); } catch {}
  if (!src || src.origin !== new URL(lab().home).origin) {
    return { ok: false, error: 'Intelligence pointed the download at '
      + (meta?.url ? String(meta.url) : 'no address at all') + ', which is not '
      + lab().home + '. Nothing was downloaded, and your key was not sent there.' };
  }
  const name = meta.kind === 'binary'
    ? 'gitmir-connector' + (process.platform === 'win32' ? '.exe' : '')
    : 'gitmir-connector.js';
  let body;
  try {
    const r = await fetch(src.href, { headers: { authorization: 'Bearer ' + k } });
    if (!r.ok) return { ok: false, error: 'Download failed: ' + r.status };
    body = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return { ok: false, error: 'Download failed: ' + String(e?.message || e) };
  }
  const got = crypto.createHash('sha256').update(body).digest('hex');
  if (meta.sha256 && got !== meta.sha256) {
    return { ok: false, error: 'What arrived is not what Intelligence said it sent. Nothing was written.' };
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
 *
 * Заглушка `onLine` объявлена принимающей строку, а не пустой. Пустая выводила
 * типом «функция без аргументов», и проверка типов отвергала настоящий
 * обработчик, который строку принимает, — `npm run typecheck` падал на чистом
 * клоне, то есть один из двух заявленных скриптов был красным у всякого, кто
 * впервые скачал репозиторий.
 *
 * @param {{ project: string, as?: string, onLine?: (line: string) => void }} o
 */
export function run({ project, as = '', onLine = (/** @type {string} */ _l) => {} }) {
  // Ключ первым: без личного ключа коннектору нечего делать, скачан он или нет.
  const k = labKey();
  if (!k) return Promise.resolve({ ok: false, error: NEEDS_PERSONAL_KEY });
  const it = installed();
  if (!it) return Promise.resolve({ ok: false, error: 'The connector is not here yet. Fetch it first.' });

  /* Ключа в аргументах нет намеренно: командная строка чужого процесса видна в
   * `ps` любому пользователю машины и оседает в истории оболочек-обёрток. Ключ
   * едет окружением — см. spawn ниже. */
  const args = ['--project', project, ...(as ? ['--as', as] : []), '--lab', lab().home];
  const cmd = it.kind === 'binary' ? it.path : process.execPath;
  const argv = it.kind === 'binary' ? args : [it.path, ...args];

  return new Promise((resolve) => {
    /* Окружение передаётся как есть — и это здесь главное.
     *
     * Адрес модели ИИ задаёт клиент: OPENAI_BASE_URL на его собственную
     * развёрнутую модель. Без этого исходник уходил бы в OpenAI, и обещание
     * «код не покидает ваш контур» было бы неправдой.
     *
     * Этим же путём едет и ключ Intelligence: GITMIR_LAB_KEY здесь и так есть
     * (labKey() читает его оттуда), но задаём его явно — чтобы было видно, чем
     * заменён снятый аргумент --key. */
    const env = { ...process.env, GITMIR_LAB_KEY: k };
    // Ключ агента коннектору не нужен, и отдавать его незачем.
    delete env.GITMIR_LAB_AGENT_KEY;
    const p = spawn(cmd, argv, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
