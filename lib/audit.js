// How much of a change was first-pass work, and how much was everything after.
//
// Every change has two times: from the request to the first version worth
// showing, and from there to acceptance — the "you misunderstood", the second
// attempt, the second review. A tracker records one duration and calls it the
// task, so the expensive half has never had a number against it.
//
// Nothing is marked by hand. The rounds a developer goes through with an agent
// already leave task files behind, and the queue already moves them between four
// folders. This watches those moves and writes them down.
//
// Two rules the rest of this file exists to keep:
//
//   The record is append-only. A metric nobody can take apart is a metric nobody
//   argues with, and one nobody argues with is one nobody believes.
//
//   No person is in it. Not a name, not an email, not a machine. The audit cuts
//   by area of the product, never by who did the work — an engineer who finds a
//   tool reporting upward how many rounds they needed will uninstall it, and be
//   right to.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = ['.gitmir', 'audit'];
const MAX_BYTES = 20 * 1024 * 1024;      // then a new file; nothing is ever deleted
const COLS = { todo: 'todo', inprogress: 'doing', verify: 'verify', done: 'done' };

const dirOf = (p) => path.join(p, ...DIR);
const logOf = (p) => path.join(dirOf(p), 'events.jsonl');

/** `Change:` — which request this task belongs to, however many tasks it grew into. */
export function parseChange(md) {
  const head = String(md || '').split(/\r?\n/).slice(0, 14).join('\n');
  const m = head.match(/^\s*Change:\s*(.+?)\s*$/im);
  return m ? m[1].replace(/\.md$/i, '').trim().slice(0, 200) : '';
}

/** Where every task in the queue is right now, and what it says about itself. */
export function snapshot(projectPath) {
  const out = new Map();
  // Which area each model id belongs to, so a task's `Touches:` can be written onto
  // the event as areas. Resolved here rather than when the audit is read: a task
  // gets deleted, a model gets rebuilt, and an append-only record that depends on
  // either of those to still exist is not append-only in any useful sense.
  const area = areaIndex(projectPath);
  for (const [folder, col] of Object.entries(COLS)) {
    const dir = path.join(projectPath, 'tasks', folder);
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of names.slice(0, 800)) {
      const full = path.join(dir, f);
      let md = '', mtime = 0;
      try { md = fs.readFileSync(full, 'utf8').slice(0, 20000); } catch { continue; }
      try { mtime = fs.statSync(full).mtimeMs; } catch {}
      const id = f.replace(/\.md$/i, '');
      const head = md.split(/\r?\n/).slice(0, 14).join('\n');
      const attempt = parseInt((head.match(/^\s*Attempt:\s*(\d+)\s*$/im) || [])[1], 10);
      out.set(id, {
        id, col, mtime,
        // A task with no Change: is its own root. That is the honest reading of a
        // task nobody traced to a request, and it keeps old queues countable.
        change: parseChange(md) || id,
        kind: ((head.match(/^\s*Type:\s*(build|verify|fix)\s*$/im) || [])[1] || '').toLowerCase() || undefined,
        attempt: Number.isNaN(attempt) ? undefined : attempt,
          ...touched(head, area),
      });
    }
  }
  return out;
}

/* Раньше здесь читалась модель, чтобы узнать, в какой области живёт каждая часть
 * продукта: аудит считает не только «сколько переделали», но и «где». Модель в
 * лаборатории, и разбивку по областям теперь даёт она — а до тех пор счёт ведётся
 * по самим ручкам, без группировки. Это меньше, чем было, но это правда. */
function areaIndex() { return new Map(); }

/**
 * What a task said it would change: the objects themselves, and the areas they live in.
 *
 * Both, not one. The areas are what the product map is drawn in, but "which area cost
 * the most rework" is a question you can only act on if you can then ask which thing
 * inside it did — and a task names the things, not the area.
 */
function touched(head, area) {
  const line = (head.match(/^\s*Touches:\s*(.+?)\s*$/im) || [])[1];
  if (!line) return {};
  const ids = new Set(), areas = new Set();
  for (const raw of line.split(/[,\s]+/)) {
    const id = raw.trim();
    if (!id || !/^[a-z][a-z0-9-]{1,60}$/i.test(id)) continue;
    ids.add(id);
    const owner = area.get(id);
    if (owner) areas.add(owner);
  }
  return {
    ids: ids.size ? [...ids].slice(0, 24) : undefined,
    areas: areas.size ? [...areas].slice(0, 8) : undefined,
  };
}

/**
 * What moved between two snapshots.
 *
 * The time of a move is taken from the file when the file says something
 * plausible — the runner rewrites a task as it moves it, so its mtime is the
 * move — and from the clock when it does not. A dashboard that was closed all
 * night must not date the whole night to the moment it opened.
 */
export function transitions(prev, next, { since = 0, now = Date.now() } = {}) {
  const events = [];
  const at = (mtime) => new Date(mtime > since && mtime <= now + 1000 ? mtime : now).toISOString();
  for (const [id, cur] of next) {
    const was = prev.get(id);
    if (!was) { events.push(ev(cur, null, cur.col, at(cur.mtime))); continue; }
    if (was.col !== cur.col) events.push(ev(cur, was.col, cur.col, at(cur.mtime)));
  }
  for (const [id, was] of prev) {
    // A task that disappeared is not an acceptance. Somebody deleted it, or a
    // branch changed under the queue; either way it is not work that landed.
    if (!next.has(id)) events.push(ev(was, was.col, null, new Date(now).toISOString()));
  }
  return events;
  function ev(t, from, to, tISO) {
    const e = { t: tISO, change: t.change, task: t.id, from, to };
    if (t.attempt != null) e.attempt = t.attempt;
    if (t.kind) e.kind = t.kind;
      if (t.areas && t.areas.length) e.areas = t.areas;
      if (t.ids && t.ids.length) e.ids = t.ids;
    return e;
  }
}

/** Append, never rewrite. Rotates by size; nothing is deleted. */
export function record(projectPath, events) {
  if (!events || !events.length) return 0;
  try { fs.mkdirSync(dirOf(projectPath), { recursive: true }); } catch { return 0; }
  let file = logOf(projectPath);
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_BYTES) {
      let n = 2;
      while (fs.existsSync(path.join(dirOf(projectPath), `events-${n}.jsonl`))) n++;
      fs.renameSync(file, path.join(dirOf(projectPath), `events-${n}.jsonl`));
    }
  } catch {}
  try { fs.appendFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n'); }
  catch { return 0; }
  return events.length;
}

/** Every event recorded for this project, oldest first, across rotations. */
export function readEvents(projectPath) {
  let names = [];
  try { names = fs.readdirSync(dirOf(projectPath)).filter((f) => /^events(-\d+)?\.jsonl$/.test(f)); }
  catch { return []; }
  // events-2 is older than events.jsonl: rotation moves the full file aside.
  names.sort((a, b) => (b === 'events.jsonl' ? -1 : a === 'events.jsonl' ? 1 : a.localeCompare(b)));
  const out = [];
  for (const n of names) {
    let raw = '';
    try { raw = fs.readFileSync(path.join(dirOf(projectPath), n), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e && e.t && e.change) out.push(e); } catch {}
    }
  }
  out.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  return out;
}

/**
 * Working time between two moments.
 *
 * A gap longer than the cutoff is not work. A task left overnight did not take
 * fourteen hours, and a number that says it did is one nobody will defend in the
 * room where it matters. The cutoff is shown beside every figure it touched.
 */
/** The events of one change, split into the tasks it grew into. */
function splitTasks(list) {
  const by = new Map();
  for (const e of list) {
    if (!e.task) continue;
    if (!by.has(e.task)) by.set(e.task, []);
    by.get(e.task).push(e);
  }
  return [...by.values()];
}

/**
 * One task's two buckets, by the only rule the queue can actually witness:
 * work is rework once it has come BACK from review, and not before.
 */
function taskWork(list, cutoffMs) {
  list.sort((a, b) => a.ts - b.ts);
  const firstDoing = list.find((e) => e.to === 'doing');
  if (!firstDoing) return null;
  let settled = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].to === 'done') { settled = list[i]; break; }
    if (list[i].from === 'done') { settled = null; break; }
  }
  const firstReturn = list.find((e) => e.from === 'verify' && e.to === 'doing');
  const stop = settled ? settled.ts : Infinity;
  const upTo = list.filter((e) => e.ts >= firstDoing.ts && (firstReturn ? e.ts <= firstReturn.ts : e.ts <= stop)).map((e) => e.ts);
  const after = firstReturn ? list.filter((e) => e.ts >= firstReturn.ts && e.ts <= stop).map((e) => e.ts) : [];
  return { first: workedMs(upTo, cutoffMs), after: workedMs(after, cutoffMs) };
}

function workedMs(stamps, cutoffMs) {
  if (stamps.length < 2) return { ms: 0, dropped: 0, droppedMs: 0 };
  let total = 0, dropped = 0, droppedMs = 0;
  for (let i = 1; i < stamps.length; i++) {
    const d = stamps[i] - stamps[i - 1];
    if (d <= 0) continue;
    if (d <= cutoffMs) { total += d; continue; }
    // Over the cutoff, so it is not counted — the rule is that a night is not work.
    // But a queue move cannot tell a night from six hours of unbroken work, so what
    // was dropped is counted and shown. A timer that quietly discards the longest
    // stretches reads as fast work, which is the opposite of what happened.
    dropped++; droppedMs += d;
  }
  return { ms: total, dropped, droppedMs };
}

/**
 * The numbers, and enough of their working to take them apart.
 *
 * Definitions are the ones published on /audit-methodology. If this ever
 * disagrees with that page, the page is the contract — change it deliberately or
 * change this, but never let them drift.
 */
export function metrics(events, { periodDays = 7, idleCutoffHours = 4, now = Date.now() } = {}) {
  const cutoffMs = idleCutoffHours * 3600 * 1000;
  const from = periodDays ? now - periodDays * 86400 * 1000 : 0;

  // Grouped over every event, then filtered by when the change STARTED — not by
  // which of its events happen to fall inside the window.
  //
  // Cutting the events themselves looks equivalent and is not: a change that began
  // the day before the window opens loses the move that started it, and its first
  // pass is then measured from whatever it did next. That reports "0m to the first
  // review" for work that took two days, which is worse than reporting nothing.
  // A change belongs to the window it began in, whole, or it is left out.
  const all = new Map();
  for (const e of events) {
    const ts = Date.parse(e.t);
    if (!ts) continue;
    if (!all.has(e.change)) all.set(e.change, []);
    all.get(e.change).push({ ...e, ts });
  }
  const byChange = new Map();
  for (const [change, list] of all) {
    let first = Infinity;
    for (const e of list) if (e.ts < first) first = e.ts;
    if (first >= from) byChange.set(change, list);
  }

  const rows = [];
  for (const [change, list] of byChange) {
    list.sort((a, b) => a.ts - b.ts);
    const firstDoing = list.find((e) => e.to === 'doing');
    if (!firstDoing) continue;                    // never started: backlog, not cost
    const firstVerify = list.find((e) => e.to === 'verify' && e.ts >= firstDoing.ts);

    // Returns from review, and the reviews themselves.
    const iterations = list.filter((e) => e.from === 'verify' && e.to === 'doing').length;
    const reviewCycles = list.filter((e) => e.to === 'verify').length;

    // Tasks of this change that were created after the first version was shown —
    // the work nobody knew about when the estimate was given.
    // A task withdrawn before it ever landed is not a discovery — somebody wrote it
    // and thought better of it. One deleted *after* reaching done is ordinary tidying
    // and still counts: it was real work.
    const withdrawn = new Set();
    for (const e of list) if (e.to === null) withdrawn.add(e.task);
    for (const e of list) if (e.to === 'done') withdrawn.delete(e.task);
    const late = firstVerify
      ? new Set(list.filter((e) => e.from === null && e.ts > firstVerify.ts && !withdrawn.has(e.task))
          .map((e) => e.task)).size
      : 0;

    // The last landing that stuck: a done with nothing after it.
    let settled = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].to === 'done') { settled = list[i]; break; }
      if (list[i].from === 'done') { settled = null; break; }
    }

    // Which areas of the product this change reached, taken off its own events so
    // the record stays readable after the tasks are gone.
    const areas = new Set(), objects = new Set();
    for (const e of list) {
      for (const a of (e.areas || [])) areas.add(a);
      for (const o of (e.ids || [])) objects.add(o);
    }

    /* A change is priced from its TASKS, not from a window around its first review.
     *
     * The window treats a change as one piece of work shown once. That holds for a
     * request that became two or three tasks. It falls apart on an ingest of six
     * hundred: task 001 reaches verify in the first minute, and every task after it
     * — all of them first-time work — lands "after the first verify" and is counted
     * as rework. The screen said 93% rework beside `returns: 0`, which is the two
     * numbers on one row contradicting each other.
     *
     * Summing the tasks fixes both the split and the total. Effort, not elapsed: two
     * people on two tasks for an hour cost two hours, and this number is priced by
     * an hourly rate. */
    let fpMs = 0, afMs = 0, dropped = 0, droppedMs = 0;
    for (const one of splitTasks(list)) {
      const t1 = taskWork(one, cutoffMs);
      if (!t1) continue;                          // never started: backlog, not cost
      fpMs += t1.first.ms; afMs += t1.after.ms;
      dropped += t1.first.dropped + t1.after.dropped;
      droppedMs += t1.first.droppedMs + t1.after.droppedMs;
    }
    const fp = { ms: fpMs, dropped, droppedMs };
    const af = { ms: afMs, dropped: 0, droppedMs: 0 };

    rows.push({
      change, areas: [...areas], objects: [...objects],
      tasks: new Set(list.map((e) => e.task)).size,
      firstPassMs: fp.ms,
      afterFirstPassMs: af.ms,
      // What the cutoff refused to count, kept beside the number it shaped.
      droppedGaps: fp.dropped + af.dropped,
      droppedMs: fp.droppedMs + af.droppedMs,
      // Minutes as well as milliseconds: every reader of a row wants minutes, and a
      // row that reports raw milliseconds under a column headed "First pass" rounds
      // to a confident zero.
      get firstPassMinutes() { return Math.round(this.firstPassMs / 60000); },
      get afterFirstPassMinutes() { return Math.round(this.afterFirstPassMs / 60000); },
      iterations, reviewCycles, lateDiscoveries: late,
      reachedVerify: !!firstVerify,
      settled: !!settled,
      startedAt: new Date(firstDoing.ts).toISOString(),
    });
  }

  const n = rows.length;
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const clean = rows.filter((r) => r.iterations === 0 && r.reachedVerify).length;

  return {
    periodDays, idleCutoffHours,
    changes: n,
    firstPassMinutes: Math.round(sum((r) => r.firstPassMs) / 60000),
    afterFirstPassMinutes: Math.round(sum((r) => r.afterFirstPassMs) / 60000),
    iterationsPerChange: n ? Math.round((sum((r) => r.iterations) / n) * 10) / 10 : 0,
    reviewCycles: sum((r) => r.reviewCycles),
    lateDiscoveries: sum((r) => r.lateDiscoveries),
    // What the cutoff threw away, so the timers above can be read knowing it.
    droppedGaps: sum((r) => r.droppedGaps),
    droppedMinutes: Math.round(sum((r) => r.droppedMs) / 60000),
    // Only over changes that got as far as a review: a change still in its first
    // pass has not passed or failed anything yet.
    firstPassRatio: rows.filter((r) => r.reachedVerify).length
      ? Math.round((clean / rows.filter((r) => r.reachedVerify).length) * 100) / 100
      : 0,
    rows,
  };
}

/**
 * Where the time after the first pass concentrates, by area of the product.
 *
 * By area, never by person. The map from a change to an area comes from the ids
 * its tasks declared in `Touches:`, so it says "returns cost 29h", never "Pyotr
 * cost 29h" — and there is no cut in this file, in the API, or in the export
 * that could say the second thing.
 */
/**
 * The same two numbers, for ONE task.
 *
 * `metrics` groups by `Change:`, because a change is the unit somebody asked for
 * and the unit an estimate is given against. That is right for the audit and wrong
 * for the queue: an ingest writes six hundred tasks under one header, and the
 * change's rework drawn on each card reads as each card's — the same red bar three
 * hundred times, including on tasks nobody has started.
 *
 * A task's own two numbers are the same shape, scoped to its own events:
 *
 *   first pass  — from the moment work began on it to the moment it was first
 *                 handed over for checking;
 *   after       — everything from that hand-over until it finally landed. Zero when
 *                 it was never sent back, which is what "it worked first time" means.
 *
 * The idle cutoff applies the same way: a gap longer than the cutoff is not somebody
 * working slowly, it is somebody having gone home, and it is not counted.
 */
export function byTask(events, { idleCutoffHours = 4 } = {}) {
  const cutoffMs = idleCutoffHours * 3600 * 1000;
  const all = new Map();
  for (const e of events) {
    const ts = Date.parse(e.t);
    if (!ts || !e.task) continue;
    if (!all.has(e.task)) all.set(e.task, []);
    all.get(e.task).push({ ...e, ts });
  }

  const out = new Map();
  for (const [task, list] of all) {
    list.sort((a, b) => a.ts - b.ts);
    const firstDoing = list.find((e) => e.to === 'doing');
    // Never picked up. Not "cost nothing" — nothing happened, and a row saying zero
    // would be a measurement of it.
    if (!firstDoing) continue;
    const firstVerify = list.find((e) => e.to === 'verify' && e.ts >= firstDoing.ts);

    // The landing that stuck: a done with nothing after it.
    let settled = null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].to === 'done') { settled = list[i]; break; }
      if (list[i].from === 'done') { settled = null; break; }
    }

    /* Rework begins where something CAME BACK, not where it was first shown.
     *
     * Measuring from the first `verify` counts the wait for a review, and worse:
     * on a task that passed at once it calls the time between "here it is" and
     * "yes" rework, when nothing was reworked. The queue itself already says which
     * it was — a `verify → doing` move is the product telling you it did not pass.
     * No such move, no rework, and the number beside `returns: 0` is zero. */
    const firstReturn = list.find((e) => e.from === 'verify' && e.to === 'doing');
    const stop = settled ? settled.ts : Infinity;
    const upToFirst = list
      .filter((e) => e.ts >= firstDoing.ts && (firstReturn ? e.ts <= firstReturn.ts : e.ts <= stop))
      .map((e) => e.ts);
    const afterFirst = firstReturn
      ? list.filter((e) => e.ts >= firstReturn.ts && e.ts <= stop).map((e) => e.ts)
      : [];

    const fp = workedMs(upToFirst, cutoffMs);
    const af = workedMs(afterFirst, cutoffMs);
    const returns = list.filter((e) => e.from === 'verify' && e.to === 'doing').length;

    out.set(task, {
      task,
      change: firstDoing.change || null,
      firstPassMs: fp.ms,
      afterFirstPassMs: af.ms,
      droppedGaps: fp.dropped + af.dropped,
      droppedMs: fp.droppedMs + af.droppedMs,
      get firstPassMinutes() { return Math.round(this.firstPassMs / 60000); },
      get afterFirstPassMinutes() { return Math.round(this.afterFirstPassMs / 60000); },
      returns,
      reachedVerify: !!firstVerify,
      settled: !!settled,
      startedAt: new Date(firstDoing.ts).toISOString(),
    });
  }
  return out;
}

export function byArea(rows, names = {}) {
  const acc = new Map();
  for (const r of rows) {
    // A change spanning two areas counts once in each: it cost both of them. Splitting
    // the time between them would make the column sum to less than the total and
    // invite the reading that some of the hours went nowhere.
    for (const a of (r.areas || [])) {
      const cur = acc.get(a) || { ms: 0, changes: 0 };
      cur.ms += r.afterFirstPassMs; cur.changes++;
      acc.set(a, cur);
    }
  }
  return [...acc.entries()]
    .map(([area, v]) => ({ area, name: names[area] || area,
      afterFirstPassMinutes: Math.round(v.ms / 60000), changes: v.changes }))
    .sort((a, b) => b.afterFirstPassMinutes - a.afterFirstPassMinutes);
}

/**
 * How many people worked in this repository over the period — the number only.
 *
 * The event log deliberately carries no author, so this cannot be counted from
 * it, and it should not be: the promise is that the audit cuts work by process
 * and by area, never by person. But "four developers" is what makes "105 hours
 * after the first pass" mean anything, so the count is taken from git at the
 * moment it is asked for, and only ever as a count. No name is stored, sent, or
 * shown anywhere.
 */
export function developerCount(projectPath, periodDays = 30) {
  try {
    const out = execFileSync('git', ['log', `--since=${periodDays}.days.ago`, '--format=%aE'],
      { cwd: projectPath, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
    const set = new Set();
    for (const line of out.split('\n')) { const e = line.trim().toLowerCase(); if (e) set.add(e); }
    return set.size;
  } catch { return 0; }
}

/**
 * Rework as a share, for one scope.
 *
 * Rework is the time after a change was first put up for review. As a share it is
 * that time over the whole time — first pass plus rework — because "seven hours of
 * rework" means nothing until you know whether the change took eight hours or
 * eighty.
 *
 * Returns null rather than zero when there is nothing to divide: a scope nobody has
 * worked in has no rework rate, and printing 0% would say the opposite of that.
 */
export function reworkOf(rows) {
  let first = 0, after = 0, changes = 0;
  for (const r of rows) { first += r.firstPassMs; after += r.afterFirstPassMs; changes++; }
  const total = first + after;
  return total > 0
    ? { pct: Math.round((after / total) * 100), minutes: Math.round(after / 60000),
        totalMinutes: Math.round(total / 60000), changes }
    : null;
}

/**
 * Rework per element of the model, and per area, from the same rows.
 *
 * An element gets the rework of every change that named it in `Touches:`. An area
 * gets the rework of every change that touched anything inside it — counted once per
 * change, not once per object: a change that touched four things in one area cost
 * that area its rework once, and adding it four times would make an area's number
 * bigger than the project's.
 *
 * `names` maps ids to something a person recognises; anything missing keeps its id.
 */
export function reworkTree(rows, names = {}) {
  const byArea = new Map();
  // Which changes touched each object. Not how much — which ones, by position, so
  // objects that never move apart can be recognised.
  const seen = new Map();
  const put = (map, key, r) => {
    const cur = map.get(key) || { first: 0, after: 0, changes: 0 };
    cur.first += r.firstPassMs; cur.after += r.afterFirstPassMs; cur.changes++;
    map.set(key, cur);
  };
  rows.forEach((r, i) => {
    for (const a of (r.areas || [])) put(byArea, a, r);
    for (const id of (r.objects || [])) {
      const s = seen.get(id) || { sig: [], first: 0, after: 0, changes: 0 };
      s.sig.push(i); s.first += r.firstPassMs; s.after += r.afterFirstPassMs; s.changes++;
      seen.set(id, s);
    }
  });

  /*
   * Objects that were always named together are one row, not several identical ones.
   *
   * A change names the things it will touch, and its rework belongs to the change —
   * there is no way to split four hours of redoing between the three objects the task
   * mentioned, and inventing a split would be worse than not having one. So each of
   * them carries the whole figure, which is correct and reads as broken: three rows,
   * three times the same number, as though three separate things had been measured.
   *
   * Grouping says the true thing instead: these moved together every time, so this is
   * one measurement about all of them. Objects whose histories differ still get their
   * own rows, which is the case worth looking at.
   */
  const groups = new Map();
  for (const [id, s] of seen) {
    const key = s.sig.join(',');
    const g = groups.get(key) || { ids: [], first: s.first, after: s.after, changes: s.changes };
    g.ids.push(id);
    groups.set(key, g);
  }

  const shape = (id, name, v, extra = {}) => {
    const total = v.first + v.after;
    return {
      id, name,
      pct: total > 0 ? Math.round((v.after / total) * 100) : null,
      minutes: Math.round(v.after / 60000),
      totalMinutes: Math.round(total / 60000),
      changes: v.changes,
      ...extra,
    };
  };
  const objects = [...groups.values()].map((g) => {
    const ids = g.ids.slice(0, 8);
    return shape(ids[0], ids.map((i) => names[i] || i).join(' · '), g,
      { ids: g.ids, together: g.ids.length > 1, more: Math.max(0, g.ids.length - ids.length) });
  }).sort((a, b) => b.minutes - a.minutes);
  const areas = [...byArea.entries()]
    .map(([id, v]) => shape(id, names[id] || id, v))
    .sort((a, b) => b.minutes - a.minutes);
  return { objects, areas };
}
