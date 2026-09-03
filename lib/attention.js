// What the object context says needs a person, right now.
//
// The model already knows more than anyone reads out of it: that the code has
// moved past it, that a finding describes a file which has since changed, that a
// planned task reaches two areas while its ticket named one, that nobody owns a
// third of the product. Every one of those is derivable, and every one of them
// was sitting in a view somebody had to think to open.
//
// So it is derived here instead, continuously, and each item carries the one
// action that answers it. That is the honest form of "it does it by itself": the
// system does the noticing, a person still does the deciding. A governance tool
// that quietly acts on its own findings is a tool nobody can defend in an audit.
//
// Ordered by what it costs to ignore, not by how easy it is to compute.

import { readFindings, openOnly } from './findings.js';

/**
 * @typedef {{key:string, level:'act'|'check'|'note', title:string, why:string,
 *   action:{label:string, go:string, arg?:string}, n?:number}} Item
 * @typedef {{col:string, file:string, title:string, ids:string[], declared:boolean,
 *   approved:string|null, mtime:number, n:number}} Task
 */

/**
 * Everything worth a person's attention, worst first.
 *
 * Takes what the caller already loaded rather than reading again: this runs on
 * every visit to the first screen, and re-walking a repository to render a list
 * would make the fastest claim in the product the slowest page in it.
 */
/** @param {{projectPath:string, model:any, exists:boolean, stale?:boolean, staleFile?:string, tasks?:Task[]}} a @returns {Item[]} */
export function attention({ projectPath, model, exists, stale = false, staleFile = '', tasks = [] }) {
  /** @type {Item[]} */
  const out = [];

  /* Не подключённая лаборатория — не повод бросать всё остальное.
   *
   * Прежде здесь стоял выход: нет модели — вот единственный пункт, до свидания.
   * Это было верно, пока модель строилась тут же; теперь это значило бы, что
   * человек без учётной записи не видит ни просроченных находок, ни задач без
   * одобрения, которые лежат у него в репозитории и никуда не делись. */
  if (!exists) {
    out.push({
      key: 'no-lab', level: 'note',
      title: 'No laboratory is connected',
      why: 'What the product does, what depends on what, and how far a change would reach are '
         + 'answered there. Everything below is what can be seen from this machine alone.',
      action: { label: 'Connect one', go: 'lab' },
    });
  }

  // --- findings whose ground shifted ---------------------------------------
  const F = readFindings(projectPath).findings;
  const open = openOnly(F);
  const staleFindings = open.filter((f) => f.stale);
  if (staleFindings.length) {
    out.push({
      key: 'stale-findings', level: 'check', n: staleFindings.length,
      title: `${staleFindings.length} recorded deviation${staleFindings.length > 1 ? 's need' : ' needs'} re-checking`,
      why: 'The code they were found in has changed since. A confident answer about code that moved is worse than no answer.',
      action: { label: 'Re-check them', go: 'spec' },
    });
  }
  const undecided = open.filter((f) => !f.stale && f.severity === 'high');
  if (undecided.length) {
    out.push({
      key: 'high-findings', level: 'act', n: undecided.length,
      title: `${undecided.length} place${undecided.length > 1 ? 's where' : ' where'} your product does something other than what you promised`,
      why: 'These matter. Either somebody fixes them, or somebody decides to live with them — and that decision gets written down here.',
      action: { label: 'Look at them', go: 'spec' },
    });
  }
  /* Отсюда ушли два повода, и оба ушли не потому, что перестали быть важны.
   *
   * «Задача дотягивается дальше, чем говорит её карточка» и «нарисовано, но не
   * построено» считаются по модели. Модели на этой машине больше нет — она в
   * лаборатории, и эти два повода вернутся её ответом. Считать их здесь заново
   * значило бы держать здесь модель, то есть не сделать ровно того, ради чего
   * всё это затевалось.
   */


  // --- work waiting on a decision ------------------------------------------
  const unapproved = tasks.filter((t) => t.col === 'todo' && !t.approved && t.ids && t.ids.length);
  if (unapproved.length) {
    out.push({
      key: 'unapproved', level: 'check', n: unapproved.length,
      title: `${unapproved.length} task${unapproved.length > 1 ? 's are' : ' is'} queued without an approval`,
      why: 'Nobody has said yes to these yet. Your assistant is told to ask before starting work nobody approved.',
      action: { label: 'Look at the work', go: 'queue' },
    });
  }

  // --- nobody answers for part of the product -------------------------------
  const mods = model.modules || [];
  const orphan = mods.filter((m) => m && !m.owner);
  if (orphan.length) {
    out.push({
      key: 'no-owner', level: 'note', n: orphan.length,
      title: `${orphan.length} of ${mods.length} areas have no owner`,
      why: 'When something goes wrong here, nobody knows who to ask, and a change here has nobody to check it.',
      action: { label: 'Show me', go: 'ownership' },
    });
  }

  // --- nothing has ever been checked against the written rules --------------
  if (!F.length) {
    out.push({
      key: 'never-audited', level: 'note',
      title: 'Nobody has checked the code against what you promised',
      why: 'When the code and the plan quietly disagree, you usually find out in front of a customer. This finds it first and writes it down.',
      action: { label: 'Check it now', go: 'skill', arg: 'spec-audit' },
    });
  }

  const rank = { act: 0, check: 1, note: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/**
 * What the model caught before it shipped.
 *
 * Distinct sets, not sums. Twenty tasks each reaching the same forty objects is
 * forty objects, not eight hundred — and a number that counts them eight hundred
 * times is the kind that gets picked apart in the first minute of a review.
 */
/* Что задачи назвали — считается здесь; докуда они дотягиваются — в лаборатории.
 *
 * Разница между этими двумя числами и есть то, ради чего продукт покупают, и
 * поэтому второе из них не считается на клиентской машине: чтобы посчитать
 * охват, нужна модель, а держать модель здесь мы перестали. Первое остаётся —
 * оно берётся из самих задач и ничего о продукте не раскрывает.
 */
/** @param {{tasks?:Task[]}} a */
export function caught({ tasks = [] }) {
  const named = new Set();
  let n = 0;
  for (const t of tasks) {
    if (!t.ids || !t.ids.length) continue;
    n++;
    for (const id of t.ids) named.add(id);
  }
  return { tasks: n, named: named.size, reached: 0, unnamed: 0, high: 0 };
}

/** The one skill that fits where this project actually is. */
/** @param {{exists:boolean, stale?:boolean, model?:any, tasks?:Task[], findings?:number, sourceFiles?:number}} a */
export function nextSkill({ exists, stale, model, tasks = [], findings = 0, sourceFiles = 0 }) {
  if (!exists) {
    // A repository too large to read in one pass needs the fragmenting variant,
    // and finding that out after a failed pass is an expensive way to learn it.
    return sourceFiles > 600
      ? { name: 'task-planner', why: 'Nothing is queued yet — write the work down before starting it.' }
      : { name: 'task-planner', why: 'Nothing is queued yet — write the work down before starting it.' };
  }
  if (!findings) return { name: 'spec-audit', why: 'Read the written rules against the code and record where they disagree.' };
  const todo = tasks.filter((t) => t.col === 'todo').length;
  const running = tasks.filter((t) => t.col === 'inprogress' || t.col === 'verify').length;
  if (running) return { name: 'task-runner', why: 'Work is in flight. Run the queue to empty, checks and all.' };
  if (todo) return { name: 'task-runner', why: `${todo} task${todo > 1 ? 's are' : ' is'} queued and nothing is running them.` };
  return { name: 'task-planner', why: 'Turn what you found into tasks that carry their own checks.' };
}
