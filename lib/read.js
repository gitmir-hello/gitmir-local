// Reading the task queue off disk, and what each task says it will touch.
//
// This file used to read the model as well. It does not any more: the model is
// built and kept by the laboratory, and this tool asks for answers rather than
// holding the thing that produces them. What stayed is the half that never needed
// a model — the queue in `tasks/`, which is useful on a machine with no account.
//
// What a task names has changed shape with it. It used to name internal ids; it
// now names **handles** — `gm_` plus ten hex characters, issued by the laboratory.
// A handle points at a part of the product and says nothing else: not its kind,
// not its neighbours, not the order it was written in. That is the point. A task
// file can be committed to a public repository without publishing how the model
// underneath is arranged.
//
// Node-side only — this one touches the filesystem.

import fs from 'node:fs';
import path from 'node:path';

/** A handle as the laboratory issues it. Opaque by construction. */
export const HANDLE = /\bgm_[0-9a-f]{10}\b/g;

export function idList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v.slice(0, 400)) {
    const s = String(x == null ? '' : x).trim().slice(0, 80);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Read the handles a task declares it will touch. Two spellings are accepted
// because both read naturally in a task file: a `Touches:` line next to `Type:`,
// and a `## Touches` section listing one handle per bullet. Handles are only taken
// from those places — the `## Context` section legitimately names parts the task
// merely reads, and counting those as changes would inflate every blast radius.
export function parseTouches(text) {
  // Split on both endings. A file checked out on Windows ends its lines with
  // \r\n, and in JavaScript `.` does not match \r — it is a line terminator —
  // so `(.*)$` stopped short of it and the Touches: line never matched at all.
  // Every task then looked as though it had declared no scope.
  const lines = text.split(/\r?\n/);
  let picked = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = /^\s*touches\s*:\s*(.*)$/i.exec(line);
    if (inline) {
      picked += ' ' + inline[1];
      for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) picked += ' ' + lines[j];
      continue;
    }
    if (/^\s*#{1,6}\s*touches\b/i.test(line)) {
      for (let j = i + 1; j < lines.length && !/^\s*#{1,6}\s/.test(lines[j]); j++) picked += ' ' + lines[j];
    }
  }
  return idList(picked.match(HANDLE) || []);
}

/**
 * Every task in the queue with the handles it names.
 *
 * `known` is optional and comes from the laboratory when this machine is
 * connected: handles the model actually issued. Given it, a handle the model does
 * not know is dropped — a typo or a stale reference would otherwise put a phantom
 * node in the blast radius. Without it — no account, or the laboratory not
 * answering — every handle is taken at face value, because the alternative is a
 * queue that reads as empty on a machine that is simply offline.
 *
 * A `Touches:` line is the task saying so itself; without one, fall back to every
 * handle the task mentions anywhere. The planner is told to write the slice of the
 * product a task touches into `## Context`, so those handles are a statement of
 * scope rather than a coincidence. `declared` says which it was, because that
 * decides how much to trust the numbers computed from it.
 */
export function readTasks(projectPath, known) {
  const knows = (h) => !known || known.has(h);
  const out = [];
  for (const col of ['todo', 'inprogress', 'verify', 'done']) {
    const dir = path.join(projectPath, 'tasks', col);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { continue; }
    for (const f of files.slice(0, 400)) {
      let text = '';
      try { text = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 60000); } catch { continue; }
      const title = (text.split(/\r?\n/).find((l) => l.trim()) || f).replace(/^#+\s*/, '').trim().slice(0, 160);
      const declaredIds = parseTouches(text).filter(knows);
      const ids = declaredIds.length ? declaredIds
        : idList(text.match(HANDLE) || []).filter(knows);
      const ap = /^\s*approved\s*:\s*(.+)$/im.exec(text);
      // The request this task grew out of. Everything the audit counts is grouped
      // by it, so a round that produced four tasks reads as one change.
      const chg = /^\s*change\s*:\s*(.+)$/im.exec(text.split(/\r?\n/).slice(0, 14).join('\n'));
      let mtime = 0; try { mtime = fs.statSync(path.join(dir, f)).mtimeMs; } catch {}
      out.push({
        col, file: f, n: Number((/^(\d+)/.exec(f) || [])[1]) || 0, title, ids,
        change: chg ? chg[1].replace(/\.md$/i, '').trim().slice(0, 200) : '',
        declared: declaredIds.length > 0, approved: ap ? ap[1].trim().slice(0, 80) : null, mtime,
      });
    }
  }
  return out;
}
