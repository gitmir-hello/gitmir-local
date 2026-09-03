/* =============================================================================
 * Scenes: the product model, in the shape the HUD renderer expects.
 *
 * The renderer knows nothing about products. It asks a scene for nodes, edges
 * and a few hooks. This file is the whole of what GitMir tells it.
 *
 * The one thing worth understanding here is nesting. A node may carry
 * `children: { nodes, edges }`, and the renderer expands it in place — the area
 * grows and its contents are laid out inside it. That is why these scenes do
 * not have to choose between "readable" and "complete": the top level stays at
 * a size a person can take in, and the detail is one click inside it.
 * ========================================================================== */

/** Model rows are plain [label, value] pairs — no live values to resolve. */
const HUD_STATIC = {
  groupRows: () => [],
  leaf: {
    // Deliberately null. A leaf that reports data here becomes openable, and an
    // openable node swallows the click to expand a card of its own — which took
    // the click away from the context popup, the thing that assembles the
    // deterministic context for this object and turns it into a queued task.
    // That popup is the detail view; a card drawn on canvas is not worth losing it.
    init: () => null,
    rows: () => [],
    step: () => {},
    stats: () => ({}),
    progress: () => 0,
  },
  resolveRow: (n, row) => ({ value: String(row[1] == null ? '' : row[1]) }),
};

/* One hue per kind of thing in the product. The renderer ships five node kinds,
 * and mapping ten model kinds onto them made routes, functions and screens the
 * same blue — on a data-flow diagram that is most of the picture saying nothing.
 * These are handed to the renderer, which merges them into its own table. */
const HUD_PALETTE = {
  gm_area:      { color: [96, 232, 255],  accent: [186, 246, 255], glow: 1.00 },
  gm_entity:    { color: [96, 246, 176],  accent: [214, 248, 255], glow: 0.90 },
  gm_function:  { color: [110, 160, 255], accent: [186, 246, 255], glow: 0.85 },
  gm_route:     { color: [170, 130, 255], accent: [214, 200, 255], glow: 0.90 },
  gm_screen:    { color: [255, 140, 215], accent: [255, 214, 240], glow: 0.90 },
  gm_event:     { color: [255, 178, 78],  accent: [255, 214, 130], glow: 1.15 },
  gm_journey:   { color: [255, 214, 130], accent: [255, 244, 210], glow: 1.25 },
  gm_lifecycle: { color: [255, 122, 96],  accent: [255, 214, 130], glow: 1.05 },
  gm_reaction:  { color: [90, 220, 210],  accent: [200, 255, 250], glow: 0.85 },
  gm_state:     { color: [140, 190, 255], accent: [214, 248, 255], glow: 0.80 },
  gm_decision:  { color: [255, 214, 60],  accent: [255, 245, 180], glow: 1.10 },
  gm_effect:    { color: [96, 246, 176],  accent: [214, 255, 235], glow: 0.85 },
  gm_trigger:   { color: [170, 130, 255], accent: [220, 200, 255], glow: 0.95 },
  gm_care:      { color: [255, 92, 110],  accent: [255, 200, 120], glow: 1.10 },
  gm_changed:   { color: [255, 92, 110],  accent: [255, 214, 130], glow: 1.30 },
  // The thing the question was asked about, and nothing else on the map.
  gm_origin:    { color: [178, 128, 255], accent: [232, 214, 255], glow: 1.35 },
  // Where the code does not do what the product says. It outranks the object's own
  // colour on purpose: at the zoom where rows disappear, colour is all that is left,
  // and this is the one fact that has to survive that.
  gm_wrong:     { color: [255, 64, 96],   accent: [255, 220, 140], glow: 1.40 },
  // Known, and decided. A product with declared limits is not a product with
  // surprises, and the picture should not read them the same.
  gm_accepted:  { color: [190, 150, 90],  accent: [255, 226, 170], glow: 0.80 },
  // Declared but not built. Deliberately not the colour of anything real: the
  // whole point of drawing on this map is that you can tell at a glance which of
  // it exists and which is a decision somebody has not carried out yet.
  gm_proposed:  { color: [150, 130, 255], accent: [220, 210, 255], glow: 1.20 },
  gm_partial:   { color: [255, 178, 78],  accent: [255, 226, 170], glow: 1.10 },
};

// Findings, by the model id they sit on. Set once per render from the dashboard;
// the scene builders read it, so every diagram marks the same objects without each
// one having to be taught how.
let HUD_FINDINGS = new Map();
window.hudSetFindings = function (list) {
  HUD_FINDINGS = new Map();
  for (const f of (list || [])) {
    if (f.status === 'fixed') continue;
    for (const id of (f.touches || [])) {
      if (!HUD_FINDINGS.has(id)) HUD_FINDINGS.set(id, []);
      HUD_FINDINGS.get(id).push(f);
    }
  }
};
const findingsOn = (id) => HUD_FINDINGS.get(id) || [];

/**
 * Open deviations sitting anywhere inside an area.
 *
 * The top level of the map shows areas, not functions — and an area drawn clean
 * while something inside it is known to be wrong is the failure this whole layer
 * exists to prevent. A container carries what it contains.
 */
function findingsInArea(aid, m) {
  let n = 0;
  for (const [id, list] of HUD_FINDINGS) {
    if (!list.some((f) => f.status === 'open')) continue;
    if (moduleOf(id, m) === aid) n++;
  }
  return n;
}

const HUD_KINDS_LABEL = {
  entity: 'gm_entity', function: 'gm_function', route: 'gm_route',
  frontend: 'gm_screen', event: 'gm_event', process: 'gm_journey',
  statusFlow: 'gm_lifecycle', reaction: 'gm_reaction',
  serverUnit: 'gm_function', module: 'gm_area',
};

/**
 * Titles are not cut — the renderer wraps them and the card grows to fit — but
 * they do get their word boundaries back first.
 *
 * The model stores the real identifier, which is right: `registerCustomer` is
 * what the thing is called in the code and how anyone finds it again. Uppercase
 * it whole, though, and the one clue to where the words divide is gone:
 * REGISTERCUSTOMER. So the casing is turned into spaces before the case is.
 */
function hudTitle(s) {
  let v = String(s == null ? '' : s);
  if (!/\s/.test(v)) {
    v = v.replace(/([a-z0-9])([A-Z])/g, '$1 $2')        // registerCustomer
         .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')     // parseHTMLResponse
         .replace(/_+/g, ' ');                          // register_customer
    if (v.indexOf('/') === -1) v = v.replace(/-+/g, ' ');  // mobile-menu, but not a route
  }
  return v.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Short type word for a model object, in the words the dashboard already uses. */
function hudTypeWord(id) {
  const k = kindOf(id);
  return ({ entity: 'OBJECT', function: 'FUNCTION', route: 'ENDPOINT', frontend: 'SCREEN',
    event: 'EVENT', process: 'JOURNEY', statusFlow: 'LIFECYCLE', reaction: 'REACTION',
    serverUnit: 'SERVICE', module: 'AREA', field: 'FIELD' })[k] || 'OBJECT';
}

/** One model object as a scene node: what it is, and enough of it to recognise. */
function hudObjectNode(id, m, extraRows) {
  const o = objById(id, m) || {};
  const k = kindOf(id);
  const rows = [['TYPE', hudTypeWord(id)]];
  if (o.file) rows.push(['FILE', String(o.file).split('/').pop().slice(0, 22)]);
  if (Array.isArray(o.fields) && o.fields.length) rows.push(['FIELDS', String(o.fields.length)]);
  if (Array.isArray(o.steps) && o.steps.length) rows.push(['STEPS', String(o.steps.length)]);
  if (o.method && o.path) rows.push(['ROUTE', String(o.method).toUpperCase()]);
  if (o.sensitive) rows.push(['CARE', 'SENSITIVE']);
  // A known deviation goes above anything else the rows would have said: it is the
  // one fact here that changes what somebody does next.
  const bad = findingsOn(id);
  const openBad = bad.filter((f) => f.status === 'open');
  if (openBad.length) rows.unshift(['SPEC', openBad.length > 1 ? openBad.length + ' DEVIATIONS' : 'DOES NOT MATCH']);
  else if (bad.length) rows.unshift(['SPEC', 'ACCEPTED GAP']);
  for (const r of (extraRows || [])) rows.push(r);
  return {
    id, modelId: id,
    kind: openBad.length ? 'gm_wrong'
      : bad.length ? 'gm_accepted'
      : o.sensitive ? 'gm_care' : (HUD_KINDS_LABEL[k] || 'gm_function'),
    title: hudTitle(labelOf(id, m) || id),
    tag: id.slice(0, 14),
    rows: rows.slice(0, 5),
    detailText: o.description || o.purpose || '',
  };
}


/* -----------------------------------------------------------------------------
 * Impact — what a change reaches. Same three columns as before (changed →
 * areas → journeys), except each area now opens into exactly which of its
 * objects are in reach. That was the thing the flat drawing could not say
 * without becoming unreadable.
 * -------------------------------------------------------------------------- */
function hudSceneImpact(t, m, br, hooks) {
  if (!br) return null;
  const seeds = br.seed || [];
  const reached = [...br.dist.keys()]
    .filter((id) => br.dist.get(id) > 0)
    .filter((id) => kindOf(id) !== 'field');   // a field is part of an object, not a node
  const nodes = [], edges = [];

  for (const id of seeds) {
    const n = hudObjectNode(id, m, [['IN THIS TASK', 'CHANGED']]);
    n.kind = 'gm_changed';
    nodes.push(n);
  }

  // Areas, each carrying the reached objects that live in it.
  const byArea = new Map();
  for (const id of reached) {
    if (hudIsJourney(id, m)) continue;
    const a = moduleOf(id, m) || '__other';
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(id);
  }
  for (const [aid, ids] of byArea) {
    const mod = objById(aid, m) || {};
    const counts = {};
    for (const id of ids) { const k = kindOf(id); counts[k] = (counts[k] || 0) + 1; }
    const rows = [['IN REACH', String(ids.length)]];
    for (const [k, n] of Object.entries(counts).slice(0, 3)) {
      rows.push([({ entity: 'OBJECTS', function: 'ACTIONS', frontend: 'SCREENS',
        route: 'ENDPOINTS', event: 'EVENTS', statusFlow: 'LIFECYCLES' })[k] || k.toUpperCase(), String(n)]);
    }
    if (mod.owner) rows.push(['OWNER', String(mod.owner).toUpperCase().slice(0, 16)]);
    const areaBad = ids.filter((id) => findingsOn(id).some((f) => f.status === 'open')).length;
    if (areaBad) rows.unshift(['SPEC', areaBad + (areaBad > 1 ? ' DEVIATIONS' : ' DEVIATION')]);
    nodes.push({
      id: 'area:' + aid, modelId: aid === '__other' ? null : aid, kind: areaBad ? 'gm_wrong' : 'gm_area',
      title: hudTitle(mod.name || 'Everything else'),
      tag: 'AREA', rows: rows.slice(0, 5),
      detailText: mod.description || '',
      children: { nodes: ids.slice(0, 60).map((id) => hudObjectNode(id, m)), edges: [] },
    });
    for (const s of seeds) edges.push([s, 'area:' + aid, '']);
  }

  // Journeys last: breaking one of these is what a person actually notices.
  for (const id of reached) {
    if (!hudIsJourney(id, m)) continue;
    const o = objById(id, m) || {};
    nodes.push({
      id, modelId: id, kind: 'gm_journey',
      title: hudTitle(labelOf(id, m) || id),
      tag: 'JOURNEY',
      rows: [['STEPS', String((o.steps || []).length)], ['ACTOR', String(o.actor || 'user').toUpperCase().slice(0, 14)]],
      detailText: o.description || '',
    });
    for (const [aid] of byArea) edges.push(['area:' + aid, id, '']);
  }

  return hudScene({
    title: 'IMPACT — ' + String((t && t.title) || 'this change').toUpperCase().slice(0, 40),
    subtitle: 'WHAT IT CHANGES → THE AREAS THAT REACHES → THE JOURNEYS THROUGH THEM',
    nodes, edges, m, hooks,
  });
}

/* -----------------------------------------------------------------------------
 * The scene object itself — data plus the hooks the renderer asks for.
 * -------------------------------------------------------------------------- */
function hudScene({ title, subtitle, nodes, edges, m, hooks }) {
  hooks = hooks || {};
  return Object.assign({}, HUD_STATIC, {
    title, subtitle,
    ticker: hooks.ticker || '',
    nodes, edges,
    // On a small graph every line can carry its name at once. Past a dozen there
    // is no room for thirty chips and they end up on each other and on the cards,
    // so the default flips: point at a card and its own lines say what they carry.
    // The Labels button (and L) turns them all on regardless.
    labels: nodes.length <= 9,
    kinds: HUD_PALETTE,
    // A working panel does not need a clock, a frame counter, or a second copy
    // of the hint already printed on the toolbar above it.
    telemetry: false,
    hints: false,
    inspector: false,
    reticle: false,
    minimap: nodes.length > 6,
    metric: { maxW: 250, colGap: 168, rowGap: 62 },
    viewInset: { top: 96, bottom: 74, left: 34, right: 34 },

    // A click has to be answerable with "which object of the product is this",
    // so the panel beside the canvas can show the same thing the model knows.
    onNodeSelect(n) {
      const id = n && n.src && n.src.modelId;
      if (hooks.onSelect) hooks.onSelect(id || null, n ? n.src : null);
    },
    onDrill(path) { if (hooks.onDrill) hooks.onDrill(path.map((s) => s && s.modelId).filter(Boolean)); },

    detail: {
      w: 560, h: 260,
      draw(ctx, n, x, y, w, h, s, alpha, t) {
        const src = n.src || {};
        const api = window.__HUD_API__;
        if (!api) return;
        const txt = src.detailText || '';
        api.drawText(ctx, String(n.title), x + 20, y + 30, {
          size: 15 * s, weight: 700, tracking: 1.6 * s, color: api.rgba(api.C.ice, alpha),
        });
        api.drawText(ctx, hudTypeWord(src.modelId || '') + (src.modelId ? '  ·  ' + src.modelId : ''),
          x + 20, y + 52, { size: 10.5 * s, weight: 400, tracking: 1.2 * s, color: api.rgba(api.C.cyan, 0.7 * alpha) });
        let yy = y + 80;
        for (const line of hudWrap(txt, 62).slice(0, 6)) {
          api.drawText(ctx, line, x + 20, yy, {
            size: 11.5 * s, weight: 400, tracking: 0.4 * s, color: api.rgba(api.C.paper, 0.78 * alpha) });
          yy += 18 * s;
        }
      },
    },
  });
}

/** A journey is a process a person walks; isJourney wants the object, not the id. */
function hudIsJourney(id, m) {
  if (kindOf(id) !== 'process') return false;
  const o = objById(id, m);
  return !!o && isJourney(o);
}

function hudWrap(text, cols) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = []; let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > cols) { if (line) out.push(line); line = w; }
    else line = (line ? line + ' ' : '') + w;
  }
  if (line) out.push(line);
  return out;
}

/* -----------------------------------------------------------------------------
 * Every other diagram, from the spec its builder already produces.
 *
 * Those builders encode what each picture means — which lines are worth drawing
 * on a lifecycle, what counts as a branch on a decision map. None of that is a
 * rendering question, so none of it is rewritten here: this only translates the
 * shape they emit into the shape the renderer wants.
 * -------------------------------------------------------------------------- */
const HUD_SPEC_KIND = {
  module: 'gm_area', entity: 'gm_entity', process: 'gm_journey',
  state: 'gm_state', decision: 'gm_decision', start: 'gm_journey',
  trigger: 'gm_trigger', effect: 'gm_effect', function: 'gm_function',
  route: 'gm_route', frontend: 'gm_screen', event: 'gm_event',
  statusFlow: 'gm_lifecycle', reaction: 'gm_reaction',
};

function hudSceneFromSpec(spec, m, hooks, head) {
  if (!spec || !spec.nodes || !spec.nodes.length) return null;
  // A builder can mark a node as belonging to another one. On a lifecycle the
  // effects of a transition are exactly that: they hang off one transition and
  // lead nowhere, so as peers they tripled the node count and buried the thing
  // the diagram is actually about — which state follows which.
  const owned = new Map();
  for (const n of spec.nodes) {
    const by = n.meta && n.meta.ownedBy;
    if (!by) continue;
    if (!owned.has(by)) owned.set(by, []);
    owned.get(by).push(n.id);
  }
  const isOwned = new Set([].concat(...owned.values()));
  const specById = new Map(spec.nodes.map((n) => [n.id, n]));
  const nodes = spec.nodes.filter((n) => !isOwned.has(n.id)).map((n) => {
    const md = n.meta || {};
    const rows = [];
    // `sub` is prose about the node; `fields` are the lines the builder chose to
    // show. Both are already written for a person, so they go through unedited.
    for (const line of (md.subLines || [])) rows.push([String(line), '']);
    for (const f of (md.fields || [])) {
      const s = String(f);
      // "2 screens · 2 actions" reads better split than squeezed into one column.
      const cut = s.lastIndexOf('  ');
      rows.push(cut > 0 ? [s.slice(0, cut).trim(), s.slice(cut).trim()] : [s, '']);
    }
    const kids = (owned.get(n.id) || []).map((cid) => {
      const c = specById.get(cid), cm = (c && c.meta) || {};
      return {
        id: cid, modelId: (cm.ref && cm.ref.id) || null,
        kind: HUD_SPEC_KIND[cm.kind] || 'gm_effect',
        title: hudTitle(cm.label || cid),
        tag: String(cm.kind || '').slice(0, 14),
        rows: (cm.subLines || []).slice(0, 4).map((l) => [String(l), '']),
        detailText: cm.sub || '',
      };
    });
    return {
      id: n.id,
      modelId: (md.ref && md.ref.id) || null,
      kind: HUD_SPEC_KIND[md.kind] || 'gm_function',
      title: hudTitle(md.label || n.id),
      tag: String((md.ref && md.ref.id) || md.kind || '').slice(0, 14),
      rows: kids.length ? [[kids.length === 1 ? 'EFFECT' : 'EFFECTS', String(kids.length)]].concat(rows.slice(0, 4))
                        : rows.slice(0, 5),
      detailText: md.sub || '',
      children: kids.length ? { nodes: kids, edges: [] } : null,
    };
  });
  const have = new Set(nodes.map((n) => n.id));
  const edges = (spec.edges || [])
    .filter((e) => have.has(e.from) && have.has(e.to))
    .map((e) => [e.from, e.to, e.label || '']);
  return hudScene({
    title: (head && head.title) || 'DIAGRAM',
    subtitle: (head && head.subtitle) || '',
    nodes, edges, m, hooks,
  });
}

/** The one call site every migrated diagram goes through. */
function hudRenderSpec(container, spec, m, head, seq) {
  const scene = hudSceneFromSpec(spec, m,
    { onSelect: (id) => { if (id) openContextPopup(kindOf(id), id); } }, head);
  return renderHud(container, scene, seq);
}



