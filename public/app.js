// Sharing a map from here is gone, not hidden: both halves of it (a snapshot file and a
// link) asked for server routes that do not exist, and a button that answers 404 is worse
// than no button. The map is read from the laboratory, so a guest is invited there.

// A shared view runs this exact file with the model handed to it instead of fetched, and
// with everything that writes disabled. Same renderer as the dashboard, by construction —
// there is no second implementation to drift.

const listEl = document.getElementById('list');      // the project tile grid
const mainEl = document.getElementById('main');
const detailEl = document.getElementById('detail');  // one project, once opened
const railEl = document.getElementById('rail');
const topProjEl = document.getElementById('topProj');
const topToolsEl = document.getElementById('topTools');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
let projects = [];
let selected = null; // path

function toast(msg, isErr){
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.className='toast'; }, 2200);
}
function hue(str){ let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))%360; return h; }
function basename(p){ return p.replace(/\/+$/,'').split('/').pop(); }
function displayName(p){ return (p.name && p.name.trim()) || basename(p.path); }
function byPath(p){ return projects.find(x=>x.path===p); }

// What the detail panel actually renders from. If none of this changed there is
// nothing to rebuild.
function projSig(p){ return p ? [p.path, p.name||'', p.description||'', p.exists?1:0].join('\u0000') : ''; }
// The only thing a background refresh can change about the open project is whether
// its folder is still there — update that in place.
function refreshDetailBits(){
  const p = byPath(selected); if(!p) return;
  const miss = document.getElementById('dMiss'); if(miss) miss.style.display = p.exists ? 'none' : 'block';
}
async function load(keepSelection){
  const r = await fetch('/api/projects'); const d = await r.json();
  const before = projSig(byPath(selected));
  projects = d.projects || [];
  if (keepSelection && !byPath(selected)) selected = null;
  renderList();
  // Rebuilding the detail panel throws away scroll position, a half-typed field, the
  // open preview page and the copy you were about to make — and replays the panel
  // animation, which is the flash. This runs on every window focus, so it must only
  // rebuild when the selected project really changed.
  if (before !== projSig(byPath(selected)) || (selected && !detailEl.firstChild)) renderDetail();
  else refreshDetailBits();
}

// The IDE icon set, verbatim: viewBox 24, no fill, currentColor stroke at 1.7 with round
// caps and joins. Same geometry as every glyph in ide.gitmir.com, so nothing looks foreign.
const IPATH = {
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  tasks:    "M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  schema:   "M5 4h5v4H5zM14 4h5v4h-5zM9 16h6v4H9zM7 8v4h10V8M12 12v4",
  columns:  "M4 4h7v16H4zM13 4h7v16h-7z",
  gauge:    "M4 20V10M10 20V4M16 20v-7M22 20V8M3 20h18",
  user:     "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  eye:      "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  refresh:  "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  code:     "M16 18l6-6-6-6M8 6l-6 6 6 6",
  layers:   "M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  compass:  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM16 8l-2 6-6 2 2-6 6-2z",
  table:    "M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16",
  filter:   "M3 4h18l-7 8v6l-4 2v-8L3 4z",
  list:     "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  play:     "M5 3l14 9-14 9V3z",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  check:    "M20 6 9 17l-5-5",
  scales:   "M12 3v18M7 21h10M12 6 4 9m8-3 8 3M4 9l-2.5 5a2.5 2.5 0 0 0 5 0L4 9zm16 0-2.5 5a2.5 2.5 0 0 0 5 0L20 9z",
  branch:   "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 6v3a6 6 0 0 1-6 6H6",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  copy:     "M9 9h11v11H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  spark:    "M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4",
  github:   "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-1-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 19.9 5 4.9 4.9 0 0 0 19.8 1.4S18.7 1 16 2.9a13.4 13.4 0 0 0-7 0C6.3 1 5.2 1.4 5.2 1.4A4.9 4.9 0 0 0 5.1 5 5.2 5.2 0 0 0 3.8 8.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-1 2.6V22",
};
function svgIcon(name, size, style){
  return '<svg width="' + (size||18) + '" height="' + (size||18) + '" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
    + (style ? ' style="' + style + '"' : '') + '><path d="' + IPATH[name] + '"/></svg>';
}
const ICON = {
  clock: svgIcon('refresh', 13),
  code:  svgIcon('code', 13, 'color:var(--cyan)'),
};

// The home screen. Projects are the whole surface here rather than a column beside
// something else, because until you have opened one there is nothing else to look at.
function renderList(){
  const q = searchEl.value.trim().toLowerCase();
  const list = projects.filter(p => !q || displayName(p).toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
  countEl.textContent = projects.length ? projects.length + (projects.length === 1 ? ' project' : ' projects') : '';
  listEl.innerHTML = '';
  if (!list.length){
    const e = document.createElement('div'); e.className='grid-empty';
    e.innerHTML = projects.length
      ? 'Nothing matches <b>' + esc(searchEl.value.trim()) + '</b>.'
      : 'No projects yet. <b>＋ Add project</b> and point it at any folder on any disk — '
        + 'then open it, connect a laboratory, and the map, the queue and the log fill up as you work.';
    listEl.appendChild(e); return;
  }
  list.forEach((p, i) => {
    const el = document.createElement('div');
    // The same object the IDE renders: a glass plate with the lit rim, the entrance sweep,
    // a header strip carrying the status badge and the name, then body / divider / footer.
    el.className = 'glass edge hoverable clickable prj-card' + (p.exists ? '' : ' missing');
    el.draggable = true; el.dataset.path = p.path; el.tabIndex = 0;
    el.style.setProperty('--enter', Math.min(i * 70, 840) + 'ms');

    const q = p.queue || {};
    const status = !p.exists ? ['badge-danger', 'Missing']
      : q.pending ? ['badge-amber', q.pending + ' open']
      : p.hasModel ? ['badge-cyan', 'Mapped']
      : ['badge-ghost', 'Not mapped'];

    el.innerHTML =
      '<span class="holo-scan" aria-hidden="true"></span>' +
      '<div class="prj-strip">' +
        '<span class="prj-gridfx" aria-hidden="true"></span>' +
        '<span class="prj-strip-status"><span class="badge ' + status[0] + '">'
          + '<span class="dot"></span>' + esc(status[1]) + '</span></span>' +
        '<span class="prj-strip-name"></span>' +
      '</div>' +
      '<div class="col gap-3 grow prj-body">' +
        '<div class="prj-desc muted text-sm"></div>' +
        '<div class="divider" style="margin:auto 0 0"></div>' +
          '<div class="pj-rw"></div>' +
        '<div class="between gap-2">' +
          '<span class="row gap-2 dim text-xs">' + ICON.clock + '<span class="pj-log"></span></span>' +
          '<span class="prj-method">' + ICON.code + '<span class="pj-model"></span></span>' +
        '</div>' +
      '</div>';
    el.querySelector('.prj-strip-name').textContent = displayName(p);
    // The description is what a person wrote about this project; the path is the fallback,
    // because a card with an empty paragraph looks broken rather than empty.
    el.querySelector('.prj-desc').textContent = p.description || p.path;
    el.querySelector('.pj-log').textContent = p.tasks ? p.tasks + ' done' : 'no work yet';
    // A card is where somebody decides which project to open. "No model" reads as a
    // missing feature; "Set this one up" reads as the next thing to do.
    el.querySelector('.pj-model').textContent = p.hasModel ? 'Ready' : 'Set this one up';
    // How much of the work here was doing it twice. The one number on a card worth
    // comparing between projects, and the reason to open this one rather than that one.
    // Absent rather than zero when nothing has been worked — see the server.
    const rw = p.rework, rwEl = el.querySelector('.pj-rw');
    if(rw && rwEl){
      const hrs = m => m < 90 ? m+'m' : (m/60 < 10 ? (m/60).toFixed(1) : Math.round(m/60))+'h';
      rwEl.className = 'pj-rw ' + (rw.pct >= 50 ? 'hot' : rw.pct >= 25 ? 'warm' : 'cool');
      rwEl.innerHTML =
        '<div class="pj-rw-h"><span>rework</span><b>'+rw.pct+'%</b></div>'+
        '<div class="pj-rw-bar"><i style="width:'+Math.min(100, rw.pct)+'%"></i></div>'+
        '<div class="pj-rw-s">'+hrs(rw.minutes)+' of '+hrs(rw.totalMinutes)+' · '+
          rw.changes+' change'+(rw.changes===1?'':'s')+'</div>';
      rwEl.title = 'Of the measured work on this project, '+rw.pct+'% was done again after review sent it back.';
    }

    const open = () => {
      // Everything below belongs to the project being left: a hand-picked what-if, a
      // selected task, a layer showing that task. Carrying them into another project
      // would show one product's answer on another product's map.
      if(selected!==p.path){ modelSrc=null; logicEntityId=null;
        changesData=null; changesFor=null; impactPick=null; adhocIds=[]; mapLayer='none';
          // Where the last project stood in getting started says nothing about this
          // one. Left behind, it opened a project with no map onto a tab full of
          // diagrams that cannot exist yet.
          stepData=null; qPrice=null; qPriceFor=null; stepSkipWait=false; }
      selected = p.path; renderDetail();
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } });
    wireDrag(el);
    listEl.appendChild(el);
  });
}

// Home and project are two different screens, not two states of one. The rail and the
// project header only exist once something is open; the search and Add only when nothing is.
function setShell(open){
  listEl.classList.toggle('off', !!open);
  railEl.classList.toggle('on', !!open);
  topProjEl.classList.toggle('on', !!open);
  topToolsEl.style.display = open ? 'none' : 'flex';
  countEl.style.display = open ? 'none' : '';
}

const RAIL = [
  { tab:'home',     ic:'compass',  l:'Overview' },
  { tab:'settings', ic:'settings', l:'Setup' },
  { tab:'tasks',    ic:'tasks',    l:'Tasks' },
  { tab:'model',    ic:'schema',   l:'Model',   badge:'modelBadge' },
  { tab:'queue',    ic:'columns',  l:'Queue',   badge:'queueBadge' },
  { tab:'audit',    ic:'gauge',    l:'Audit' },
  { tab:'team',     ic:'user',     l:'Team',    badge:'teamBadge' },
  { tab:'preview',  ic:'eye',      l:'Preview', only:'preview' },
];
function renderRail(){
  railEl.innerHTML = RAIL
    .filter(r => r.only !== 'preview' || PREVIEW_OK)
    // Before there is a map there is nothing for these to show. A row of tabs that
    // all open the same "nothing here yet" is worse than no row: it reads as a
    // broken product rather than an unfinished setup.
    .filter(r => !locked() || r.tab === 'home' || r.tab === 'settings')
    .map(r => '<button class="rl" data-tab="' + r.tab + '" title="' + r.l + '">'
      + svgIcon(r.ic, 20) + '<span class="l">' + r.l + '</span>'
      + (r.badge ? '<span class="badge" id="' + r.badge + '"></span>' : '') + '</button>').join('')
    + '<div class="rail-foot">'
    + '<a href="https://github.com/gitmir-hello/gitmir-local" target="_blank" rel="noopener" title="Source on GitHub">'
    + svgIcon('github', 16) + '</a><span>AGPL</span></div>';
  railEl.querySelectorAll('.rl').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // The rail is redrawn after the gate is known, which is after setTab ran. Without
  // this the current tab loses its highlight and the app looks like it is nowhere.
  railEl.querySelectorAll('.rl').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
}

let taskTimer = null;
let queueTimer = null;
// The first screen inside a project used to be a settings form — a name field and
// a description box, in a tool bought for what it knows about the product.
let activeTab = 'home';
// Which page of Setup is open — kept across re-renders, so it does not snap back.
let setupSub = 'skills';
function setTab(tab){
  if(locked() && tab !== 'home' && tab !== 'settings') tab = 'home';
  activeTab = tab;
  clearInterval(stepPoll);
  document.querySelectorAll('.rl').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active', p.dataset.pane===tab));
  clearInterval(queueTimer);
  if(tab==='home' && selected) renderHome(selected);
  if(tab==='model' && selected) loadModel(selected);
  if(tab==='queue' && selected){ loadQueue(selected); queueTimer=setInterval(()=>{ if(selected && activeTab==='queue' && !document.hidden) loadQueue(selected); }, 4000); }
  if(tab==='audit' && selected) renderChangeAudit(document.getElementById('auditView'), null, ++modelViewSeq);
  if(tab==='team'){ renderTeam(); teamPoll(); }
  if(tab==='preview') pvInit();
}
function renderDetail(){
  const p = byPath(selected);
  clearInterval(taskTimer);
  clearInterval(stepPoll);
  // Not knowing yet counts as locked. Opening a project onto its Model tab and
  // taking the diagrams away a second later is worse than waiting a beat.
  if(p && !stepData) activeTab = 'home';
  if (!p){
    setShell(false);
    detailEl.innerHTML = '';
    renderList();
    return;
  }
  const wrap = document.createElement('div'); wrap.className='detail-wrap';
  wrap.innerHTML =
    '<div class="pane" data-pane="home"><div id="homeView"></div></div>' +
    '<div class="pane" data-pane="audit"><div id="auditView"></div></div>' +
    '<div class="pane" data-pane="settings">' +
      '<div class="field"><div class="row-lbl"><label>Name</label><span class="saved" id="savedN">saved ✓</span></div>' +
        '<input class="f-name" id="fName"></div>' +
      '<div class="d-path"><span id="dPath"></span>' +
        '<button class="rev" id="revBtn" title="Reveal in Finder">🗂</button></div>' +
      '<div class="d-missing" id="dMiss">⚠ Folder not found on disk — it may have been moved or the drive disconnected.</div>' +
      '<div class="field"><div class="row-lbl"><label>Description</label><span class="saved" id="savedD">saved ✓</span></div>' +
        '<textarea class="f-desc" id="fDesc" placeholder="What this project is about, notes, TODO…"></textarea></div>' +
      '<div class="actions">' +
        // Two buttons, not one button and a switch. A switch that renames a button
        // leaves a question — which one will it start? — and the answer lives in a
        // state you cannot see while you are pressing it. Two buttons each do one
        // thing, and there is nothing to get out of sync.
        agentRunButtons() +
        '<button class="ghost" id="finderBtn">🗂 Finder</button>' +
        '<button class="del" id="delBtn">🗑 Remove</button>' +
      '</div>' +
      // Two ways of working, each with enough to say to need its own page: the
      // procedures you hand Claude, and wiring your editor to this model. Stacked
      // on one screen the second was a footnote under the first.
      '<div class="setup-sub">' +
        '<button class="mpill sub-pill active" data-sub="skills">Skills</button>' +
        '<button class="mpill sub-pill" data-sub="mcp">Connect Local MCP</button>' +
      '</div>' +
      '<div class="sub-pane" data-sub="skills">' +
        '<div class="skills-box">' +
          '<div class="skills-label">Copy one and paste it into '+agentName()+' (⌘V + Enter)</div>' +
          '<div class="skills-btns" id="skillsBtns"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sub-pane" data-sub="mcp" style="display:none">' +
        '<div class="mcp-box" id="mcpBox"></div>' +
      '</div>' +
    '</div>' +
    '<div class="pane" data-pane="tasks">' +
      '<div class="tasks-head"><span class="t">What Claude did</span><span class="upd" id="taskUpd"></span></div>' +
      '<div id="taskList"></div>' +
    '</div>' +
    '<div class="pane" data-pane="model">' +
      '<div class="ingest" id="ingestBox"></div>' +
      '<div class="model-stale" id="modelStale"></div>' +
      '<div class="model-src" id="modelSrc"></div>' +
      '<div class="model-head">' +
        '<div class="model-subnav" id="modelNav"></div>' +
        '<span class="upd" id="modelUpd"></span>' +
        '<button class="mrefresh" id="modelRefresh" title="Refresh model">⟳</button>' +
      '</div>' +
      '<div id="modelView"><div class="model-empty">Opening model…</div></div>' +
    '</div>' +
    '<div class="pane" data-pane="queue">' +
      '<div class="tasks-head"><span class="t">Task queue — todo · in progress · verify · done</span></div>' +
      '<div class="audit" id="auditBox"></div>' +
      '<div id="queueView"><div class="model-empty">Loading…</div></div>' +
    '</div>' +
    '<div class="pane" data-pane="preview">'+
      '<div class="tasks-head"><span class="t">Preview &amp; pick — open a page, click an element, get a task</span><span class="upd" id="pvUrlNow"></span></div>'+
      '<div class="pv-bar">'+
        '<input class="ti pv-url" id="pvUrl" placeholder="https://example.com/pricing" autocomplete="off" spellcheck="false">'+
        '<button class="ghost" id="pvGo">Go</button>'+
        '<button class="ghost pv-pick" id="pvPick" disabled>◎ Select</button>'+
      '</div>'+
      '<div class="pv-frame-wrap"><iframe class="pv-frame" id="pvFrame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>'+
        '<div class="pv-empty" id="pvEmpty">'+
          '<div class="pv-glyph">⌖</div>'+
          '<div class="pv-lead">nothing loaded</div>'+
          '<div class="pv-h">Open a page, then click the thing you want changed</div>'+
          '<div class="pv-sub">The page is fetched by this machine and shown from here, so a site that refuses to be framed still opens. Press <b>◎ Select</b>, click an element, and you get a task that names it — and the files it probably lives in.'+
          '<span class="pv-note">Sandboxed: the site runs the picker but cannot reach this dashboard. Pages behind a login render logged out.</span></div>'+
          '<div class="pv-eg" id="pvEg"></div>'+
        '</div>'+
      '</div>'+
      '</div>'+
    '<div class="pane" data-pane="team">' +
      '<div class="tasks-head"><span class="t">Team Bridge — route model &amp; tasks between your machines</span><span class="upd" id="teamUpd"></span></div>' +
      '<div id="teamView"><div class="model-empty">Loading…</div></div>' +
    '</div>';
  setShell(true);
  renderRail();
  // Fill it from the project list we already have, so the count is there on arrival
  // instead of appearing only once someone opens the Queue tab.
  const qb=document.getElementById('queueBadge');
  if(qb && p.queue && p.queue.todo) qb.textContent = String(p.queue.todo);
  topProjEl.innerHTML =
    '<button class="tp-back" title="All projects">←</button>' +
    '<span class="tp-nm"></span><span class="tp-pa"></span>';
  topProjEl.querySelector('.tp-nm').textContent = displayName(p);
  topProjEl.querySelector('.tp-pa').textContent = p.path;
  topProjEl.querySelector('.tp-back').addEventListener('click', ()=>{ selected=null; renderDetail(); });
  detailEl.innerHTML = ''; detailEl.appendChild(wrap);

  const nameEl = wrap.querySelector('#fName');
  const descEl = wrap.querySelector('#fDesc');
  nameEl.value = p.name || '';
  nameEl.placeholder = basename(p.path);
  descEl.value = p.description || '';
  wrap.querySelector('#dPath').textContent = p.path;
  wrap.querySelector('#dMiss').style.display = p.exists ? 'none' : 'block';

  // autosave (debounced) + on blur
  const saveName = debounce(()=>update(p.path, {name:nameEl.value}, '#savedN'), 500);
  const saveDesc = debounce(()=>update(p.path, {description:descEl.value}, '#savedD'), 600);
  nameEl.addEventListener('input', ()=>{ saveName(); });
  nameEl.addEventListener('blur', ()=>update(p.path, {name:nameEl.value}, '#savedN'));
  descEl.addEventListener('input', ()=>{ saveDesc(); });
  descEl.addEventListener('blur', ()=>update(p.path, {description:descEl.value}, '#savedD'));

  wrap.querySelectorAll('[data-run-agent]').forEach(b=>b.addEventListener('click', ()=>{
    setAgent(b.dataset.runAgent);      // what you ran is what the rest of the page should say
    open(p, b.dataset.runAgent);
    renderDetail();
  }));
  wrap.querySelector('#finderBtn').addEventListener('click', ()=>reveal(p));
  wrap.querySelector('#revBtn').addEventListener('click', ()=>reveal(p));
  wrap.querySelector('#delBtn').addEventListener('click', ()=>remove(p));
  wrap.querySelectorAll('.tab-btn').forEach(b=> b.addEventListener('click', ()=> setTab(b.dataset.tab)));
  wrap.querySelector('#modelRefresh').addEventListener('click', ()=>{ if(selected) loadModel(selected); });
  if(selected) loadNextStep(selected).then(()=>{ if(selected===p.path) renderSkillButtons(); });
  setTab(activeTab);
  wrap.querySelectorAll('.sub-pill').forEach(b=>b.addEventListener('click',()=>{
    setupSub = b.dataset.sub;
    wrap.querySelectorAll('.sub-pill').forEach(x=>x.classList.toggle('active', x.dataset.sub===setupSub));
    wrap.querySelectorAll('.sub-pane').forEach(x=>{ x.style.display = x.dataset.sub===setupSub ? '' : 'none'; });
  }));
  if(setupSub!=='skills'){
    const b=wrap.querySelector('.sub-pill[data-sub="'+setupSub+'"]');
    if(b) b.click();
  }
  renderSkillButtons();
  renderMcpBox();
  mcpLiveStatus();

  refreshTasks(p.path);
  taskTimer = setInterval(()=>{ if(selected && activeTab==='tasks' && !document.hidden) refreshTasks(selected); }, 4000);
}

let PICKER_OK = true;
let SKILLS = [];
async function loadSkillsList(){
  try{ SKILLS = (await (await fetch('/api/skills')).json()).skills || []; }catch{ SKILLS = []; }
  renderSkillButtons();
  renderMcpBox();
}
// Skills grouped by WHEN you reach for them, not alphabetically. Eleven flat buttons is a
// list to read; four small groups is a decision you can make at a glance.
const SKILL_GROUPS = [
  { title:'Understand what exists', tone:'api',
    hint:'Build a model of the product from the real code, then read it instead of the repo.',
    items:{} },
  { title:'Decide what to build', tone:'event',
    hint:'Turn raw input into something precise enough to build from, before any code.',
    items:{ 'product-docs-spec':'table' } },
  { title:'Build and prove it', tone:'module',
    hint:'Plan with checks, run the queue, audit the result, keep the record.',
    items:{ 'task-planner':'list', 'task-runner':'play', 'app-audit':'shield',
            'spec-audit':'scales', 'task-log':'check' } },
  { title:'Work on code you inherited', tone:'server',
    hint:'Change an old system without breaking it, or move it to a new stack at parity.',
    items:{ 'legacy-maintenance':'branch', 'stack-port':'external' } },
];

// Which skill this project actually needs next, from /api/overview. Eight cards
// shown at once is an inventory; a person needs the one that fits where they are.
let nextStep = null, nextStepFor = null, showAllSkills = false;
async function loadNextStep(pathStr){
  if(nextStepFor===pathStr) return nextStep;
  try{
    const o=await fetch('/api/overview?path='+encodeURIComponent(pathStr)).then(r=>r.json());
    nextStep = o && o.ok ? o.next : null; nextStepFor = pathStr;
  }catch{ nextStep=null; }
  return nextStep;
}

// One card: what it is for, its name, and the copy it does when clicked.
function skillCard(s, why, eyebrow){
  const w=document.createElement('div'); w.className='sk-one';
  w.innerHTML='<div class="sk-next-h">'+esc(eyebrow)+'</div>'+
    '<div class="sk-next-w">'+esc(why||'')+'</div>'+
    '<button class="sk-next-b" type="button">'+
      '<span class="sk-next-t">'+esc(s.pain||s.title||s.name)+'</span>'+
      '<span class="sk-next-n">'+esc(s.name)+'</span>'+
      '<span class="sk-next-c">Copy it — then paste into '+agentName()+' (⌘V + Enter)</span>'+
    '</button>';
  w.querySelector('.sk-next-b').addEventListener('click', ()=>copySkill(s.name, s.title||s.name));
  return w;
}

function renderSkillButtons(){
  const box = document.getElementById('skillsBtns');
  if(!box) return;
  box.innerHTML = '';
  if(!SKILLS.length){ box.innerHTML = '<div class="skills-empty">no skills in skills.json</div>'; return; }

  // Building the object context comes first and stays first. It is what every
  // other skill answers from, and it is re-run whenever the code moves — hiding
  // it behind a suggestion means the one thing somebody came here to do is the
  // one thing they cannot find. The derived next step sits under it, when it is
  // something else.
  /* Здесь стояла ветка «сначала показать сборщик модели, потом остальное».
   *
   * Сборщика больше нет: модель строится в лаборатории, и переменная под него
   * осталась пустой. Ветка от этого стала недостижимой, а строка, вычислявшая
   * «этот шаг и есть сборщик», продолжала читать поле у пустого значения — и
   * роняла отрисовку панели, как только появлялся следующий шаг. Первый показ
   * проходил, второй оставлял пустое место: кнопок «скопировать процедуру»
   * больше не было, и понять почему было нечем.
   *
   * Ветка убрана целиком. Ниже процедуры и так раскладываются по группам. */
  const byName_ = {}; for(const s of SKILLS) byName_[s.name]=s;
  const step = nextStep && byName_[nextStep.name] ? byName_[nextStep.name] : null;
  if(step && !showAllSkills){
    const w=document.createElement('div'); w.className='sk-next';
    w.appendChild(skillCard(step, nextStep.why, 'Start here'));
    const all=document.createElement('button'); all.className='sk-all'; all.type='button';
    all.textContent='All eight skills \u2192';
    all.addEventListener('click', ()=>{ showAllSkills=true; renderSkillButtons(); });
    w.appendChild(all);
    box.appendChild(w);
    return;
  }
  if(step && showAllSkills){
    const back=document.createElement('button'); back.className='sk-all back'; back.type='button';
    back.textContent='\u2190 Just the next step';
    back.addEventListener('click', ()=>{ showAllSkills=false; renderSkillButtons(); });
    box.appendChild(back);
  }

  const byName = {};
  for(const s of SKILLS) byName[s.name] = s;
  const placed = {};
  const groups = SKILL_GROUPS.map(g => ({
    title: g.title, hint: g.hint, tone: g.tone,
    list: Object.keys(g.items).filter(n => byName[n]).map(n => { placed[n]=1; return [byName[n], g.items[n]]; }),
  })).filter(g => g.list.length);
  // A skill added to skills.json that this file has never heard of still shows up, rather
  // than silently vanishing because it is not in a group.
  const rest = SKILLS.filter(s => !placed[s.name]).map(s => [s, 'spark']);
  if(rest.length) groups.push({ title:'Other', hint:'', tone:'api', list:rest });

  for(const g of groups){
    const sec = document.createElement('div');
    sec.className = 'sk-group';
    sec.innerHTML =
      '<div class="sk-head"><span class="eyebrow">' + esc(g.title) + '</span><span class="hud-rule"></span></div>' +
      (g.hint ? '<div class="sk-hint">' + esc(g.hint) + '</div>' : '') +
      '<div class="sk-grid"></div>';
    const grid = sec.querySelector('.sk-grid');
    for(const [s, icon] of g.list){
      const it = document.createElement('button');
      it.className = 'sk-tile'; it.type = 'button';
      it.title = 'Copy ' + (s.title || s.name) + ' — paste into ' + agentName();
      it.style.setProperty('--tone', 'var(--c-' + (g.tone || 'api') + ')');
      it.innerHTML =
        '<span class="sk-cover">' +
          '<span class="sk-gridfx" aria-hidden="true"></span>' +
          '<span class="sk-art">' + svgIcon(icon, 46) + '</span>' +
          '<span class="sk-go">' + svgIcon('copy', 15) + '</span>' +
        '</span>' +
        '<span class="sk-body">' +
          // The pain first, in the words someone arrives with. The name means
          // nothing until you know which problem it is for, and the description
          // is mechanics — useful once you have decided to read on.
          (s.pain ? '<span class="sk-pain">' + esc(s.pain) + '</span>' : '') +
          '<span class="sk-name">' + esc(s.title || s.name) + '</span>' +
          (s.desc ? '<span class="sk-desc">' + esc(s.desc) + '</span>' : '') +
        '</span>';
      it.addEventListener('click', async () => {
        it.classList.add('done');
        setTimeout(() => it.classList.remove('done'), 1400);
        await copySkill(s.name, s.title || s.name);
      });
      grid.appendChild(it);
    }
    box.appendChild(sec);
  }
}
async function copySkill(name, title){
  try{
    const d = await (await fetch('/api/skill?name='+encodeURIComponent(name))).json();
    if(!d.text) throw new Error(d.error || 'no text');
    await copyToClipboard(d.text);
    toast('Copied: '+(title||name)+' ✓  Paste into '+agentName()+' (⌘V) and Enter');
  }catch(e){ toast('Copy failed: '+(e.message||e), true); }
}

/* ---------- model (.gitmir) visualization ---------- */
// ---- what every view has to say about itself --------------------------------
// A diagram nobody can name is a shop window. Each view states three things in
// the same place, in the same order: what it is, what it lets you decide, and
// how to work it. Written once here so no view can quietly ship without them.
const VIEW_HEAD = {
  audit:      ['How much of a change was first-pass work',
               'Work that passed review, and work that had to be done again because it did not. The split is taken from the queue itself: a task moving back from verify is the product saying it did not pass, and only what follows that is rework.',
               'Open any number to see what it was computed from. Time is counted from queue moves, and a gap longer than the idle cutoff is not counted as work.'],
  map:        ['The product as its parts',
               'Start any conversation here: what the product is made of, and what crosses between the parts.',
               'Hover a card for its controls. OPEN goes inside an area, CONTEXT gives you its context and a task.'],
  journeys:   ['One path a person walks',
               'What a user actually does, step by step, and what runs under each step. Breaking one of these is what someone notices.',
               'Pick a journey above. Each step names the screen, endpoint or function behind it.'],
  er:         ['Business objects and what links them',
               'The nouns your product is about, and which of them reference which. Where a change to one object lands.',
               'Click an object for its fields, who writes it and who reads it.'],
  flow:       ['Where data moves between areas',
               'Which area sends data to which, and what moves — an object written, an event raised, an endpoint answered.',
               'Open an area to see the chain it runs: screen, endpoint, function, object.'],
  events:     ['What raises a signal and what reacts',
               'The places where one part of the product sets another in motion without calling it directly. The links that surprise people.',
               'Click an event to see everything that raises it and everything that handles it.'],
  logic:      ['When an object changes state',
               'The rules the product enforces on one object over its life, and what fires on each transition.',
               'Pick an object above. Open a transition to see the effects it triggers.'],
  decisions:  ['Every branch and the condition on it',
               'The points where the product decides, written as the condition it actually checks. Where a policy lives.',
               'Pick a lifecycle. Each branch shows its condition and who may take it.'],
  impact:     ['What a planned change reaches',
               'Before anyone writes code: what a task touches, how much of the product that is, and whether anything sensitive is in reach.',
               'Pick a task, or estimate a change by hand. Every number shows the arithmetic under it.'],
  ownership:  ['Who answers for each part',
               'The team to route work to, the person to ask before changing it, and the parts nobody has claimed.',
               'Owners come from the model. A blank owner is a finding, not a formatting problem.'],
  confidence: ['Where this model is guessing',
               'Which parts of every other view to trust, and which to doubt. Read it before quoting a number.',
               'Each gap is work: something the model does not know about your product yet.'],
  mismatch:   ['What was approved against what was done',
               'Whether finished work stayed inside the scope it declared. Work outside that scope is the thing worth catching.',
               'Click any object to open it. "Touched, never declared" is where to look first.'],
  spec:       ['Where the code does not do what the product says',
               'Every known deviation between the written rules and the running code, on the objects it sits on — so a change that touches one cannot be planned in ignorance of it.',
               'Accepting one records who decided and why. That is the difference between a product with known limits and a product with surprises.'],
  design:     ['What the product should become',
               'Elements you declare here are the same shape as the model, so the map draws them beside what exists and every declaration can be checked against the rebuilt model.',
               'Add an element, say what data moves where, then turn it into tasks. The checks come from what you declared — code appearing is not the same as the thing you drew existing.'],
  changed:    ['How the product changed between two dates',
               'What the product gained, lost and renamed over a period — read from the versions of the model your repository already has.',
               'Pick two versions. Anything under "no longer in the model" is either finished work or a rebuild that lost its grip.'],
  timeline:   ['The product changing, in order',
               'What has been done and when, with what each piece of work touched.',
               'Click a chip to open that object and see everything else that has touched it.'],
  overview:   ['The model at a glance',
               'How much of the product is recorded, dimension by dimension.',
               'Thin numbers here mean the model has not learned that part yet.'],
};
function viewHead(key){
  const h=VIEW_HEAD[key]; if(!h) return '';
  return '<div class="vhead">'+
    '<div class="vh-t">'+esc(h[0])+'</div>'+
    '<div class="vh-g"><span>What it gives you</span>'+esc(h[1])+'</div>'+
    '<div class="vh-h"><span>How to use it</span>'+esc(h[2])+'</div>'+
  '</div>';
}

// One subject at a time. Eight journeys stacked down a tall page is a
// shop window: nothing can be compared, nothing can be found, and eight canvases
// animate at once. Pick one.
function subjectPicker(items, currentId, onPick){
  const box=document.createElement('div'); box.className='ent-picker';
  for(const it of items){
    const b=document.createElement('button');
    b.className='epill'+(it.id===currentId?' active':'');
    b.textContent=it.label; if(it.title) b.title=it.title;
    b.addEventListener('click', ()=>onPick(it.id));
    box.appendChild(b);
  }
  return box;
}

let modelData = null;
// Where the code does not do what the product says. Held next to the model rather
// than inside it: the model is rebuilt from code and would throw these away.
let findingsData = { findings: [], summary: null };
async function loadFindings(pathStr){
  if(!pathStr){ findingsData={findings:[],summary:null}; if(window.hudSetFindings) window.hudSetFindings([]); return; }
  try{
    const r=await fetch('/api/findings?path='+encodeURIComponent(pathStr));
    findingsData=await r.json();
  }catch{ findingsData={findings:[],summary:null}; }
  if(!Array.isArray(findingsData.findings)) findingsData.findings=[];
  // Every diagram reads the same registry, so a mark cannot appear on one and not another.
  if(window.hudSetFindings) window.hudSetFindings(findingsData.findings);
}
const findingsOnId = (id)=> (findingsData.findings||[]).filter(f=>(f.touches||[]).includes(id));
let modelFor=null;   // which project modelData belongs to
let modelView = 'map';
let journeyPick = null;   // one journey on screen at a time, not all eight
let decisionPick = null;
// Every view switch bumps this. Laying a diagram out is async, so without it a slow
// view keeps appending into the pane after someone has already moved to another one —
// which reads as "the new view is broken" when it was overwritten a second later.
let modelViewSeq = 0;
// A render started by the view dispatcher carries its generation and is cancelled when
// the view moves on. A render triggered by an action inside the view — approving a task,
// removing a what-if chip — carries none, and must not be mistaken for a stale one.
const viewAlive = (s) => s == null || s === modelViewSeq;
let logicEntityId = null;
let modelSrc = null;   // null = this project's own model; otherwise a teammate's name
let mermaidReady = null;
// Six questions, in the order someone asks them. Ten pills in a row is a list of
// features; these are the things an enterprise reader actually arrives wanting to
// settle, and the views underneath each one are how it gets settled.
const MODEL_VIEWS = MODEL_GROUPS.flatMap(g=>g.views);
const groupOfView = (k)=> (MODEL_GROUPS.find(g=>g.views.some(v=>v.key===k))||MODEL_GROUPS[0]).key;
// Layers paint the product map with something other than its own structure: how much
// each area has been changing, what a change there would cost, who to ask first.
const MAP_LAYERS = [
  {key:'none',  label:'Structure', hint:'The product as it is wired.'},
  {key:'heat',  label:'Heat',      hint:'How often work has touched each area.'},
  {key:'rework',label:'Rework',    hint:'How much of the work in each area was doing it a second time.'},
  {key:'risk',  label:'Risk',      hint:'What a change in each area would reach.'},
  {key:'owner', label:'Ownership', hint:'Who is accountable for each area.'},
  {key:'change',label:'This change', hint:'Where the task picked in Impact lands.'},
];
let mapLayer='none';
const EFF_RU={create:'create',update:'update',recalculate:'recalculate',sync:'sync',notify:'notify',link:'link',delete:'delete'};


// holo style (as in your IDE): accent color per node type, glyphs, dark-navy bg + grid
function trunc(s,n){ s=String(s==null?'':s); return s.length>n ? s.slice(0,n-1)+'…' : s; }

  '<pattern id="hgrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0 H0 V28" fill="none" stroke="rgba(120,210,255,.06)" stroke-width="1"/></pattern>'+
  '</defs>'+
  '<style>'+
  '.he{fill:none;stroke:rgba(120,210,255,.32);stroke-width:1.6}'+
  '.he-spine{stroke:#2fd8ff;stroke-width:2;opacity:.95}'+
  '.he-branch{stroke:#ffb86b;stroke-width:1.8}'+
  '.he-effect{stroke:#34f0a6;stroke-dasharray:5 3}'+
  '.he-data{stroke:#2fd8ff;stroke-dasharray:2 3;opacity:.85}'+
  '.he-trigger{stroke:#7e8cff}'+
  '.hchip rect{fill:rgba(6,16,30,.96);stroke:rgba(52,240,166,.5)}'+
  '.hchip text{fill:#7dffce;font:600 11px "JetBrains Mono",ui-monospace,monospace}'+
  '.hcard{fill:rgba(10,18,36,.94);stroke-width:1.5}'+
  '.hnode:hover .hcard{filter:brightness(1.3)}'+
  '.hclk{cursor:pointer}.hnode.hclk:hover .hcard{filter:brightness(1.55)}'+
  '.hname{fill:#dceaff;font:600 13px "Onest",-apple-system,BlinkMacSystemFont,sans-serif}'+
  '.hsub{fill:#7286a6;font:500 11px "JetBrains Mono",ui-monospace,monospace}'+
  '.hfield{fill:#9fb2d0;font:500 11px "JetBrains Mono",ui-monospace,monospace}'+
  '</style>';

// Text must be clipped to the CARD's pixel width, not to a fixed character count —
// a 32-char description in 11px mono is ~211px and spilled far outside a 168px node.
// Advance widths: JetBrains Mono 11px is monospace at 0.6em = 6.6px; Onest 600 13px is
// proportional, ~7.3px on average (rounded up so wide glyphs still fit).
const CW_NAME = 7.3, CW_MONO = 6.6;
const SUB_LH = 15;                 // line height of a description line
function fitPx(s, px, cw){
  const max = Math.floor(px / cw);
  if (max < 2) return '';
  return trunc(s, max);
}
// Wrap a description across as many lines as it needs, so nothing is lost to an
// ellipsis. Words that are longer than a line (a long id, a path) are hard-split.
function wrapPx(s, px, cw){
  const max = Math.max(6, Math.floor(px / cw));
  // NOTE: this whole script is emitted from a template literal, so the backslash
  // must be doubled here — a bare \s would reach the browser as /s+/ and split
  // the text on the letter "s" ("workspace" -> "work pace").
  const words = String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const pushLong = (w) => { let r = w; while (r.length > max) { lines.push(r.slice(0, max)); r = r.slice(max); } return r; };
  for (const w of words) {
    if (!cur) { cur = w.length > max ? pushLong(w) : w; continue; }
    if ((cur + ' ' + w).length <= max) { cur += ' ' + w; continue; }
    lines.push(cur);
    cur = w.length > max ? pushLong(w) : w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [];
}
// Card height for a node that shows a title plus N description lines.
const subH = (n) => 50 + Math.max(0, n - 1) * SUB_LH;


/* ---- WHICH AGENT ------------------------------------------------------------
 *
 * One choice, remembered, honoured everywhere. It used to live only in the MCP
 * panel, and every other screen said "Claude": run Claude, open Claude here, paste
 * into Claude. Somebody working in Codex was offered four buttons for a program
 * they do not have, and nothing anywhere hinted that theirs would do.
 *
 * Defaults to whichever is actually installed, Claude first — the dashboard knows,
 * because the server looked. */
const AGENTS = { claude: 'Claude', codex: 'Codex' };
function agentPick(){
  let v = null;
  try{ v = localStorage.getItem('gitmir.agent'); }catch{}
  if(v === 'claude' || v === 'codex') return v;
  const has = window.__GITMIR_AGENTS__ || {};
  return (!has.claude && has.codex) ? 'codex' : 'claude';
}
function agentName(){ return AGENTS[agentPick()]; }
function setAgent(v){ try{ localStorage.setItem('gitmir.agent', v); }catch{} }

/**
 * A button per agent. Pressing one starts THAT one, and also remembers it, so the
 * sentences elsewhere on the page — where to paste, what to say — follow whatever
 * the person actually uses rather than a preference they set once and forgot.
 */
function agentRunButtons(){
  const has = window.__GITMIR_AGENTS__ || {};
  return Object.entries(AGENTS).map(([k,label])=>
    '<button class="run" data-run-agent="'+k+'"'+
      ((k==='claude'?has.claude:!!has.codex) ? '' : ' title="Not found on this machine — the terminal will say so"')+
    '>▶ Run '+label+'</button>').join('');
}

/** The two-way switch itself. `onPick` redraws whatever screen it sits on. */
function agentRadios(cls){
  const has = window.__GITMIR_AGENTS__ || {};
  const now = agentPick();
  return '<div class="ag-pick '+(cls||'')+'">'+
    Object.entries(AGENTS).map(([k,label])=>
      '<button class="ag-x'+(now===k?' on':'')+'" data-agent="'+k+'" type="button">'+
        '<i class="ag-dot"></i>'+label+
        ((k==='claude'?has.claude:!!has.codex) ? '<i class="ag-here" title="found on this machine"></i>' : '')+
      '</button>').join('')+
  '</div>';
}
/** Wire every switch inside `root`; after a pick, re-render via `redraw`. */
function wireAgentPick(root, redraw){
  root.querySelectorAll('.ag-x').forEach(b=>b.addEventListener('click', ()=>{
    setAgent(b.dataset.agent);
    if(typeof redraw === 'function') redraw();
  }));
}

// ---- MCP: what it is, and the exact line that connects it -------------------
// The command carries this install's own path and the selected project's path,
// because the two things people get wrong are where mcp.ts lives and which
// folder they are asking about.
/**
 * Has an agent actually reached us about this project?
 *
 * Not "is it registered" — a registration that does not work looks identical to one
 * that does. This is the only honest answer: something that was not this dashboard
 * asked us about this project, and here is when.
 */
async function mcpLiveStatus(){
  const el = document.getElementById('mcpLive'); if(!el || !selected) return;
  let d = null;
  try{ d = await (await fetch('/api/steps?path='+encodeURIComponent(selected))).json(); }catch{}
  if(!el.isConnected) return;
  const ok = d && d.ok && d.agentSeen;
  el.className = 'mcp-live ' + (ok ? 'on' : 'off');
  el.innerHTML = '<i></i><span>' + (ok
    ? '<b>Connected.</b> Your assistant has asked us about this project — the wiring works.'
    : '<b>Not heard from your assistant yet.</b> Run the command below, then close your editor and open it again. '
      + 'Ask it anything about this product and this line turns green by itself.')
    + '</span>';
}

function renderMcpBox(){
  const box=document.getElementById('mcpBox'); if(!box) return;
  const home=window.__GITMIR_HOME__||'/path/to/gitmir-local';
  const proj=selected||'/path/to/your/project';
  const q=s=>'"'+String(s).replace(/"/g,'\\"')+'"';
  // Show the command that exists on THIS machine. `gitmir` arrives with the
  // installer, not with a clone, and printing it to somebody who cloned sends them
  // looking for something that is not there.
  const hasCli = !!window.__GITMIR_CLI__;
  // `claude mcp add` defaults to local scope — the registration lives in the folder
  // the command was run from. Somebody who runs it once and then opens their editor
  // in a project finds nothing and concludes it did not work. -s user covers every
  // project; the server answers about whichever one the editor was opened in.

  // WHICH AGENT. Two clients, and the difference is not cosmetic: Codex has no
  // scope flag, so the registration has to name the project, and it does not
  // implement MCP prompts, so the eight skills arrive as tools rather than slash
  // commands. Printing Claude's instructions to a Codex user would be wrong on
  // both counts, and they would find out the slow way.
  const agents = window.__GITMIR_AGENTS__ || {};
  // Remember the choice: somebody who works in Codex should not re-pick it on
  // every visit. Default to what is actually installed, Claude first.
  // One choice for the whole dashboard — the same one the Setup and onboarding
  // screens use. Two keys meant picking Codex here and still being told to run
  // Claude two screens later.
  const pick = agentPick();
  const isCodex = pick === 'codex';

  const rawAdd='claude mcp add -s user gitmir -- node '+q(home+'/mcp.ts');
  const claudeAdd = hasCli ? 'gitmir mcp add' : rawAdd;
  const claudeHere = hasCli ? 'gitmir mcp add-here'
    : 'claude mcp add -s project gitmir -- node '+q(home+'/mcp.ts');
  // Codex writes ~/.codex/config.toml and has no scope, so the command pins the
  // project by absolute path. `add-here` writes .codex/config.toml in the folder.
  const codexAdd = hasCli ? 'gitmir mcp add --codex'
    : 'codex mcp add gitmir -- node '+q(home+'/mcp.ts')+' --project '+q(proj);
  const codexHere = hasCli ? 'gitmir mcp add-here --codex' : '';
  const add = isCodex ? codexAdd : claudeAdd;
  const addHere = isCodex ? codexHere : claudeHere;
  // Same reasoning as the register command: show the short form when the launcher
  // is on this machine, and the long one when it is not.
  // `setup`, not `model`: there is no model command any more — the model is not built
  // here — and mcp-check answers an unknown one with its own usage, which reads as a
  // broken install to somebody who ran exactly what this page told them to run.
  const check = hasCli ? 'gitmir check '+q(proj)
    : 'cd '+q(home)+' && node mcp-check.ts '+q(proj)+' setup';

  // Four steps, each answering the same three questions in the same order: what
  // you do, what it buys, and how you know it worked. The page before this put
  // that last one in grey small print at the bottom — which is where somebody
  // looks only after they have already decided the thing is broken.
  const step=(n, title, why, cmd, cmdNote, proof)=>
    '<div class="ms">'+
      '<div class="ms-n">'+n+'</div>'+
      '<div class="ms-b">'+
        '<div class="ms-t">'+title+'</div>'+
        '<div class="ms-w">'+why+'</div>'+
        (cmd? '<button class="ms-cmd" data-copy="'+esc(cmd)+'" title="Copy">'+
                '<span class="ms-cmd-c">'+esc(cmd)+'</span><span class="ms-cmd-a">Copy</span></button>'+
              (cmdNote? '<div class="ms-cmd-n">'+cmdNote+'</div>':'') : '')+
        // The proof line is a flex row of exactly two things: the label and the
        // sentence. Without the wrapper every <b> and <code> inside becomes a flex
        // item of its own and the gap prises the words apart.
        '<div class="ms-p"><span>You know it worked when</span><div>'+proof+'</div></div>'+
      '</div>'+
    '</div>';

  box.innerHTML=
    // The first question anybody has on this page is "did it work", and until now the
    // only way to answer it was to interrogate the agent — which the tester tried,
    // asked it for a list of arguments, got nothing recognisable, and marked the whole
    // block untested. The dashboard already knows.
    '<div class="mcp-live" id="mcpLive"><i></i><span>Checking…</span></div>'+
    // The choice comes first, because everything below it changes: the command,
    // where it lands, whether a project can be pinned, and whether the skills
    // arrive as slash commands.
    // The same switch component as everywhere else. Here it is a choice of
    // instructions rather than a launch, so it stays a switch — the two commands
    // below differ, and you pick which one you are reading.
    '<div class="mcp-pick">'+
      '<span class="mcp-pick-l">Connecting from</span>'+
      agentRadios('')+
      (isCodex
        ? '<span class="mcp-pick-n">Codex has no per-project scope, so the command below names the project.</span>'
        : '<span class="mcp-pick-n">Registered once, for every project — the server answers about the folder your editor is open in.</span>')+
    '</div>'+
    '<div class="mcp-lead">'+
      '<div class="mcp-lead-t">The same model, inside the editor you already work in</div>'+
      '<p>The dashboard is where <b>you</b> look at the object context. MCP is how <b>your agent</b> reads it '+
      'while it works — what an object is, what breaks if it changes, what a task would touch, where the code '+
      'already disagrees with the spec — instead of re-reading your repository at the start of every session.</p>'+
      '<p class="mcp-lead-n">It has no screen of its own and it moves nothing out of here. The diagrams, the change '+
      'radius and the record stay in this dashboard; MCP answers in text, to the agent, in your editor.</p>'+
    '</div>'+

    '<div class="mcp-steps">'+
    step(1,
      'Register this project with your agent',
      'One command, once. It writes a line into your Claude config and nothing else — no service and no port. '+
      'Registered for every project: the server answers about whichever folder your editor is open in. The model '+
      'itself comes from the laboratory over <code>GITMIR_LAB_KEY</code>, so that part does need an account; '+
      'the queue, the findings and the audits do not.',
      add,
      (isCodex
        ? ('Codex keeps one global config and offers no scope, so this registration names the project. '+
           (addHere
             ? 'For a second repository, run <b>'+esc(addHere)+'</b> inside it — that writes a '+
               '<code>.codex/config.toml</code> you can commit, and Codex reads it in a trusted project.'
             : 'For a second repository, add another <code>[mcp_servers.gitmir]</code> block to its own '+
               '<code>.codex/config.toml</code>.'))
        : (hasCli
          ? 'To pin it to one repository instead — in a <code>.mcp.json</code> you commit, so teammates get it without '+
            'being told — run <b>'+esc(addHere)+'</b> in that folder.'
          : 'This is the long form because <b>gitmir</b> is not on your PATH — you are running a clone rather than an '+
            'install. <code>curl -fsSL https://ide.gitmir.com/install.sh | sh</code> gives you the short one. To pin it '+
            'to one repository instead, run <code>'+esc(addHere)+'</code> in that folder — <code>.mcp.json</code> is '+
            'committed, so teammates get it too.')),
      '<code>'+(isCodex?'codex':'claude')+' mcp list</code> shows <b>gitmir</b> as connected.') +
    step(2,
      isCodex ? 'Restart Codex' : 'Restart the editor',
      'An MCP client reads its config once, at startup. Skipping this is the most common reason people conclude the '+
      'connection failed — the command worked, the editor simply had not looked yet.',
      '', '',
      'Your agent lists tools whose names start with <b>gitmir_</b>.') +
    step(3,
      'Say: <i>set this project up with GitMir</i>',
      (isCodex
        ? 'All eight procedures arrive with the server as <b>tools</b> — Codex does not implement MCP prompts, so '+
          'they are not slash commands there. Nothing is lost and nothing is pasted: the agent lists them with '+
          '<code>gitmir_skills</code> and fetches one with <code>gitmir_skill</code>, and the server says so in its '+
          'own instructions at startup. This one adds the folder to this dashboard, creates the task queue, and says '+
          'what is still missing, including the model if there is none yet.'
        : 'All eight procedures arrive with the server — as slash commands, and as tools the agent can call on its own. '+
          'Nothing is pasted. This one adds the folder to this dashboard, creates the task queue, and says what is still '+
          'missing, including the model if there is none yet.'),
      '', '',
      isCodex
        ? 'The project appears here with a queue, and the agent reports what it did.'
        : 'The project appears here with a queue, the agent reports what it did, and typing <b>/</b> lists the skills.') +
    step(4,
      'Ask it something only the model knows',
      '<i>What breaks if I change the order status?</i> The point is not that it answers — it is where the answer comes '+
      'from: the object context, walked from real links, with a line stating how fresh it is.',
      '', '',
      'The answer names objects and areas from your model, and opens with how fresh that model is.') +
    '</div>'+

    '<div class="mcp-card check">'+
      '<div class="mcp-card-t">Check it without an editor</div>'+
      '<p>An MCP server has no screen, which makes a broken setup hard to tell from a working one. This starts the '+
      'server exactly as your editor would, asks it to set this project up, and prints the answer for a person.</p>'+
      '<button class="ms-cmd" data-copy="'+esc(check)+'" title="Copy"><span class="ms-cmd-c">'+esc(check)+
      '</span><span class="ms-cmd-a">Copy</span></button>'+
    '</div>'+

    '<div class="mcp-card warn">'+
      '<div class="mcp-card-t">If the answers are not what you expected</div>'+
      '<div class="mcp-q"><b>Everything comes back "there is no model here yet".</b> Not a broken connection — this '+
      'machine is not pointed at a laboratory, which is where the model of a product is built and kept. Open '+
      '<a href="https://lab.gitmir.com/account/access" target="_blank" rel="noopener">lab.gitmir.com/account/access</a>, '+
      'copy the key, set it as <code>GITMIR_LAB_KEY</code> in the environment, and start the server again.</div>'+
      '<div class="mcp-q"><b>No gitmir_ tools are listed.</b> The client has not re-read its config. Restart it, then '+
      'check <code>'+(isCodex?'codex':'claude')+' mcp list</code>.</div>'+
      (isCodex
        ? '<div class="mcp-q"><b>Typing / does not list the skills.</b> Expected — Codex has no MCP prompts. Ask the '+
          'agent for them instead: <i>list the gitmir skills</i>, or let it call <code>gitmir_skills</code> itself.</div>'+
          '<div class="mcp-q"><b>It answers about the wrong project.</b> The registration names one folder. Either '+
          're-run it from the repository you mean, or give that repository its own <code>.codex/config.toml</code>.</div>'
        : '<div class="mcp-q"><b>It answers about the wrong project.</b> Without <code>--project</code> the server '+
          'answers about whatever directory the agent started in — open the editor in the repository you mean, or pin '+
          'it with <code>'+esc(addHere)+'</code>.</div>')+
    '</div>'+

    '<div class="mcp-foot">MCP changes who does the typing, not what gets done. All of it can be done by hand from the '+
    '<b>Skills</b> page — <b>task-planner</b> writes work that carries its own '+
    'checks.</div>';

  // Picking an agent rewrites the panel: every command, proof line and caveat below
  // depends on it, so re-render rather than patch.
  wireAgentPick(box, ()=>{ renderMcpBox(); mcpLiveStatus(); });

  box.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click', async ()=>{
    try{ await copyToClipboard(b.dataset.copy); toast('Copied ✓  Paste it into a terminal'); }
    catch(e){ toast('Copy failed — select the line and press ⌘C', true); }
  }));
}

// ---- the HUD renderer, mounted into the same frame the other diagrams use ----
// Only one lives at a time: the canvas runs an animation loop, and a superseded
// view that keeps drawing is both a leak and a liar.
// A view may hold several diagrams at once — Journeys lists one per process — so
// this is a list, not a single handle. Keeping one killed every diagram but the last.
let hudLive=[];
function hudDrop(){ for(const h of hudLive.splice(0)){ try{h.destroy();}catch(e){} } window.__HUD_API__=null; }
function renderHud(container, scene, seq){
  // Deliberately does NOT drop the others: a view may mount several. Switching
  // views calls hudDrop(), and a canvas replaced inside its own container is
  // detached, which the engine notices and shuts itself down for.
  if(!scene || !scene.nodes || !scene.nodes.length){
    container.innerHTML='<div class="model-empty">Nothing to draw here yet.</div>'; return; }
  container.innerHTML=
    '<div class="dgm">'+
      '<div class="dgm-bar">'+
        '<button class="dgm-b" data-a="fit" title="Fit to view">Fit</button>'+
        '<button class="dgm-b" data-a="back" title="One level up (Esc)">Back</button>'+
        '<button class="dgm-b" data-a="labels" title="Edge labels (L)">Labels</button>'+
        '<button class="dgm-b" data-a="bloom" title="Glow (B)">Glow</button>'+
        '<span class="dgm-hint">hover a card for its OPEN and CONTEXT controls · Esc goes back · drag to pan · wheel to zoom</span>'+
        '<button class="dgm-b dgm-full" data-a="full" title="Fullscreen">⛶</button>'+
      '</div>'+
      '<div class="dgm-canvas hud-canvas"><canvas></canvas></div>'+
    '</div>';
  const cv=container.querySelector('canvas');
  let h;
  try{ h=window.HUD_MOUNT(cv, scene, { onDestroy:()=>{ hudLive=hudLive.filter(x=>x!==h); } }); }
  catch(e){ container.innerHTML='<div class="model-empty">Renderer failed: '+esc(e.message||e)+'</div>'; return; }
  hudLive.push(h);
  window.__HUD_API__=h;                 // the most recent one, for probing
  // A scene can ask to arrive already open — the radius view lands inside the
  // area holding the object it was taken from, so the answer is on screen.
  if(scene.autoOpen) setTimeout(()=>{ try{ h.open(scene.autoOpen); }catch(e){} }, 260);
  window.__HUD_ALL__=hudLive;           // all of them: a view may hold several
  container.querySelector('.dgm-bar').addEventListener('click',(ev)=>{
    const b=ev.target.closest('.dgm-b'); if(!b||!h) return;
    const a=b.dataset.a;
    if(a==='fit') h.fit();
    else if(a==='back') h.back();
    else if(a==='labels') h.flags.labels=!h.flags.labels;
    else if(a==='bloom') h.flags.bloom=!h.flags.bloom;
    // Native fullscreen rather than an overlay: the canvas is one element, and the
    // ResizeObserver already redraws it at whatever box it is given.
    else if(a==='full'){
      const frame=container.querySelector('.dgm');
      if(document.fullscreenElement) document.exitFullscreen();
      else if(frame && frame.requestFullscreen) frame.requestFullscreen();
    }
  });
  if(seq!=null && !viewAlive(seq)) hudDrop();
}


// Pan/zoom canvas like ide.gitmir.com's VisualBuilder: drag to pan, wheel zooms to
// the cursor, click (not drag) a node fires onNodeClick.

let modelReq = 0;
/* Одна карточка на все экраны, которым нужна модель.
 *
 * Разные формулировки одного и того же положения читаются как разные поломки:
 * человек, увидевший четвёртую, решает, что сломан инструмент. */
function labCard(d){
  const L = (d && d.lab) || {};
  const how = ((d && d.how) || []).map(x=>'<li>'+esc(x)+'</li>').join('');
  return '<div class="model-empty lab-card">'
    + '<h3>The model lives in the laboratory</h3>'
    + '<p>'+esc((d && d.error) || 'This machine is not connected to a laboratory yet.')+'</p>'
    + (how ? '<ul>'+how+'</ul>' : '')
    + '<p class="lab-go">'
    +   '<a class="btn primary" href="'+esc(L.signUp||'https://lab.gitmir.com/signup')+'" target="_blank" rel="noopener">Open the laboratory</a> '
    +   '<a class="btn" href="'+esc(L.signIn||'https://lab.gitmir.com/login')+'" target="_blank" rel="noopener">I already have an account</a>'
    + '</p>'
    /* Поле для ключа стоит здесь, а не в настройках.
     *
     * Это единственный экран, на котором человек узнаёт, что подключения нет, —
     * и до сих пор он же был тупиком: рассказывал про лабораторию и не давал
     * ничего сделать. Способ подключиться должен стоять там, где сказано, что
     * подключения нет. */
    + '<div class="lab-key">'
    +   '<label for="labKey">Already have a key? Paste it — it is saved on this machine only.</label>'
    +   '<div class="lab-key-row">'
    +     '<input id="labKey" type="password" autocomplete="off" spellcheck="false" placeholder="ctx_…">'
    +     '<button class="btn primary" id="labKeySave" type="button">Connect</button>'
    +   '</div>'
    +   '<div class="lab-key-say" id="labKeySay"></div>'
    + '</div>'
    + '</div>';
}

/* Подключение по ключу, введённому руками.
 *
 * Ключ уходит на свой же сервер и обратно не возвращается ни разу: поле
 * очищается сразу, а ответ говорит только о том, что лаборатория приняла и что
 * теперь видно. Ошибку показываем словами лаборатории — «ключ не подошёл»
 * человек чинит иначе, чем «лаборатория не отвечает». */
function wireLabKey(){
  const btn=document.getElementById('labKeySave'); if(!btn) return;
  const inp=document.getElementById('labKey'), say=document.getElementById('labKeySay');
  const go=async()=>{
    const v=(inp.value||'').trim(); if(!v) return;
    btn.disabled=true; say.className='lab-key-say'; say.textContent='Asking the laboratory…';
    try{
      const r=await fetch('/api/lab/key',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:v})});
      const d=await r.json();
      inp.value='';
      if(!r.ok||d.error){ say.className='lab-key-say bad'; say.textContent=d.error||'That did not work.'; btn.disabled=false; return; }
      say.className='lab-key-say ok';
      say.textContent='Connected. It can read: '+((d.products&&d.products.length)?d.products.join(', '):'nothing yet');
      setTimeout(()=>{ if(typeof loadModel==='function') loadModel(selected); load(true); }, 700);
    }catch(e){ say.className='lab-key-say bad'; say.textContent='Could not reach this dashboard.'; btn.disabled=false; }
  };
  btn.addEventListener('click', go);
  inp.addEventListener('keydown',(e)=>{ if(e.key==='Enter') go(); });
}

/* Карта областей — то, с чего смотрелка начинается.
 *
 * Рисуется по проекции: имя, деловое слово, ручка. Ни идентификатора, ни
 * устройства модели здесь нет и быть не может — их и не присылают. Клик по
 * области открывает её содержимое тем же путём.
 */
function drawMap(view, d){
  const areas=d.areas||[], links=d.links||[];
  if(!areas.length){
    view.innerHTML='<div class="model-empty"><b>Nothing has been read yet.</b><br>'
      +'The laboratory has this repository but no model of it. Build one there, and this fills in.</div>';
    return;
  }
  const head='<div class="lab-fresh">'+esc(d.freshness||'')
    +(d.stale?' <b class="stale">STALE — the code has moved since</b>':'')+'</div>';
  const cards=areas.map(a=>{
    const counts=Object.entries(a.counts||{})
      .map(([w,n])=>'<span>'+n+' '+esc(w)+(n===1?'':'s')+'</span>').join('');
    return '<button class="area" data-area="'+esc(a.handle||a.name)+'">'
      +'<b>'+esc(a.name)+'</b>'
      +'<span class="area-n">'+a.total+'</span>'
      +(a.description?'<p>'+esc(a.description)+'</p>':'')
      +'<div class="area-c">'+counts+'</div></button>';
  }).join('');
  const leans=links.length
    ? '<div class="leans"><h4>Which leans on which</h4>'
      +links.slice(0,12).map(l=>'<div>'+esc(l.from)+' → '+esc(l.to)+' <i>'+l.weight+'</i></div>').join('')
      +'</div>' : '';
  view.innerHTML=head+'<div class="areas">'+cards+'</div>'+leans;
  for(const b of view.querySelectorAll('.area')) b.onclick=()=>openArea(view, b.dataset.area);
}

/* Внутрь одной области. Тем же запросом, той же проекцией. */
async function openArea(view, which){
  view.innerHTML='<div class="model-empty">Opening…</div>';
  let d; try{ d=await (await fetch('/api/lab?path='+encodeURIComponent(selected)
    +'&area='+encodeURIComponent(which))).json(); }
  catch{ view.innerHTML='<div class="model-empty">Failed to reach the laboratory.</div>'; return; }
  if(d.error){ view.innerHTML='<div class="model-empty">'+esc(d.error)+'</div>'; return; }
  const rows=(d.inside||[]).map(o=>'<li data-h="'+esc(o.handle)+'"><b>'+esc(o.name)+'</b> <i>'+esc(o.kind)+'</i>'
    +(o.description?'<p>'+esc(o.description)+'</p>':'')+'</li>').join('');
  const out=(d.reaches||[]).map(r=>'<button class="area sm" data-area="'+esc(r.handle)+'">'
    +esc(r.area)+' <i>'+r.links+'</i></button>').join('');
  view.innerHTML='<button class="b sm quiet" id="backMap">← All areas</button>'
    +'<h3 class="area-h">'+esc(d.name)+'</h3>'
    +(d.description?'<p class="lead">'+esc(d.description)+'</p>':'')
    +'<p class="mono-note">'+d.total+' thing'+(d.total===1?'':'s')
    +(d.truncated?', showing the first '+(d.inside||[]).length:'')+'</p>'
    +'<ul class="inside">'+rows+'</ul>'
    +(out?'<h4 class="area-h4">Reaches into</h4><div class="areas sm">'+out+'</div>':'');
  view.querySelector('#backMap').onclick=()=>loadModel(selected);
  for(const b of view.querySelectorAll('.area')) b.onclick=()=>openArea(view, b.dataset.area);
  for(const li of view.querySelectorAll('.inside li')) li.onclick=()=>openThing(view, li.dataset.h, which);
}

/* Одна вещь и её связи — обе стороны.
 *
 * «На что опирается» видно и так, если читать код. «Кто опирается на это» — нет,
 * и именно это ломается при правке. Поэтому вторая сторона названа отдельно, а
 * не слита с первой в общий список соседей.
 */
async function openThing(view, handle, backTo){
  view.innerHTML='<div class="model-empty">Opening…</div>';
  let d; try{ d=await (await fetch('/api/lab?path='+encodeURIComponent(selected)
    +'&subject='+encodeURIComponent(handle))).json(); }
  catch{ view.innerHTML='<div class="model-empty">Failed to reach the laboratory.</div>'; return; }
  if(d.error){ view.innerHTML='<div class="model-empty">'+esc(d.error)+'</div>'; return; }
  const side=(rows,none)=>rows.length
    ? '<ul class="inside">'+rows.map(x=>'<li data-h="'+esc(x.handle)+'"><b>'+esc(x.name)+'</b> <i>'
        +esc(x.kind)+'</i>'+(x.area?' <span class="in">in '+esc(x.area)+'</span>':'')+'</li>').join('')+'</ul>'
    : '<p class="mono-note">'+none+'</p>';
  view.innerHTML='<button class="b sm quiet" id="backArea">← Back</button>'
    +'<h3 class="area-h">'+esc(d.name)+' <i class="kind">'+esc(d.kind)+'</i></h3>'
    +(d.area?'<p class="mono-note">in '+esc(d.area)+'</p>':'')
    +'<h4 class="area-h4">Depends on</h4>'+side(d.dependsOn||[],'nothing the model records')
    +'<h4 class="area-h4">Depended on by</h4>'+side(d.dependedOnBy||[],'nothing the model records')
    +(d.more?'<p class="mono-note">'+d.more+' more not shown</p>':'');
  view.querySelector('#backArea').onclick=()=>backTo?openArea(view,backTo):loadModel(selected);
  for(const li of view.querySelectorAll('.inside li')) li.onclick=()=>openThing(view, li.dataset.h, backTo);
}

async function loadModel(pathStr){
  const view=document.getElementById('modelView'); if(!view) return;
  const req = ++modelReq;   // this call's identity
  view.innerHTML='<div class="model-empty">Loading model…</div>';
  /* Модель приходит из лаборатории, а не с этого диска.
   *
   * Пока она не подключена, отвечать нечем — и экран говорит об этом прямо,
   * вместо пустой рамки, которая читается как поломка. */
  let d; try{ d=await (await fetch('/api/lab?path='+encodeURIComponent(pathStr))).json(); }
  catch{ if(req===modelReq) view.innerHTML='<div class="model-empty">Failed to reach the laboratory.</div>'; return; }
  if(req!==modelReq) return;
  if(d && d.connected===false){ view.innerHTML=labCard(d); wireLabKey(); modelData=null; return; }
  if(d && d.error){ view.innerHTML='<div class="model-empty"><b>The laboratory could not answer.</b><br>'+esc(d.error)+'</div>'; modelData=null; return; }
  modelData=d; modelFor=pathStr;
  drawMap(view, d);
}


let ingSel = null;   // which fragment cell is expanded


function recordAnswer(entry){
  if(!selected || modelSrc) return;              // a shared snapshot is not this project's record
  /* The ids the answer NAMED, and no others.
   *
   * This used to widen the list to the blast radius first, so opening one area
   * recorded 375 objects and the source behind all of them — 1047 files, 3.4 MB —
   * against the sixteen characters actually shown. One such line put the project's
   * headline ratio at 785×. The MCP side has always recorded what its answer
   * contained; this now matches it, and the two records mean the same thing. */
  fetch('/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ path:selected, ...entry, ids:entry.ids||[] })}).catch(()=>{});
}

// The first screen of a project: what the object context is, what it replaced,
// what it caught, and the one thing to do next.
//
// Everything here is measured. The product is sold on spending less — on agents
// answering from a model instead of crawling a repository, and on people
// deciding from evidence instead of instinct — and until this screen existed
// nothing in the product counted either. A tool that asks to be believed is in a
// weaker position than one that shows the number, especially in a room where
// somebody has to justify the spend.
const KB = (b) => b >= 1048576 ? (b/1048576).toFixed(1)+' MB' : Math.round((b||0)/1024)+' KB';
async function renderHome(pathStr){
  const view=document.getElementById('homeView'); if(!view) return;
  const p=byPath(pathStr)||{};
  view.innerHTML='<div class="model-empty">Reading the project…</div>';

  // Until this project has a map, the whole product is one screen: the next thing
  // to do. Everything else is built out of the map and would open empty.
  const st = await loadSteps(pathStr);
  if(selected!==pathStr) return;
  renderRail();
  if(st && st.ok && st.step < 3){ renderSteps(view, pathStr, st); return; }

  const o = await fetch('/api/overview?path='+encodeURIComponent(pathStr)).then(r=>r.json()).catch(()=>null);
  if(selected!==pathStr) return;
  if(!o || !o.ok){ view.innerHTML='<div class="model-empty">Could not read this project.</div>'; return; }

  const s=o.usage.summary, C=o.caught;
  /* Модель здесь может отсутствовать — и обычно отсутствует.
   *
   * Она живёт в лаборатории, и сервер честно отдаёт `model: null`. Строка ниже
   * читала поле у этого `null` и роняла отрисовку целиком: экран навсегда
   * оставался на «Reading the project…», ничего не сообщив. Отсутствие модели —
   * обычное состояние, а не сбой, и рисовать надо и его. */
  const objects=Object.values((o.model&&o.model.counts)||{}).reduce((a,b)=>a+b,0);

  let h='<div class="hm">';
  h+='<div class="hm-top"><div class="hm-name">'+esc(p.name||pathStr.split('/').pop())+'</div>'+
     '<div class="hm-path">'+esc(pathStr)+'</div></div>';

  // The map is kept in the laboratory, so "no map here" is an ordinary state rather than
  // a loss — nothing on this disk went missing. Previously this branch printed "the map is
  // gone", offered a button that redrew the same screen, and stopped: everything else this
  // machine does know about the project — what needs a person, the queue, the record — was
  // hidden behind a dead end. Say what is missing, point at the screen that can fix it, and
  // carry on drawing the rest.
  h+='<div class="hm-hero'+(o.exists?'':' empty')+'">';
  if(!o.exists){
    h+='<div class="hm-hero-h">No map of this product yet</div>'+
       '<p>The map is built and kept in the laboratory — it is never written into this folder. '+
       'Point this machine at a laboratory that has read this repository, and everything below fills in.</p>'+
       '<div class="hm-next"><button class="run" data-go="lab">Connect a laboratory</button></div>';
  } else if(s.answers){
    // Two different claims, and only the first is about size. The second is the one
    // people actually want: not "how much less was read" but "would I have found all
    // of this by searching?" — and an object the request never named is the witness.
    //
    // The headline is a measured fact or it is nothing. Nothing records the size of the
    // source an answer stood in any more — that is read where the repository is read, in
    // the laboratory — so the division has no numerator, and "0.0×" set in the largest
    // type on the screen is a claim rather than a missing value.
    const measured = s.asked > 0 && s.askedWould > 0;
    h+=(measured ? '<div class="hm-big">'+s.ratio.toFixed(1)+'×</div><div class="hm-big-l">less read to answer</div>' : '')+
       (measured
         ? '<p><b>'+s.asked+' answer'+(s.asked===1?'':'s')+'</b> to a question, '+KB(s.askedServed)+' in all. '+
           'What they covered lives in <b>'+s.askedFiles+' file'+(s.askedFiles===1?'':'s')+'</b> — '+KB(s.askedWould)+
           ' of source.'+
           (s.catalogues ? ' '+s.catalogues+' request'+(s.catalogues===1?'':'s')+' for the whole map '+
             (s.catalogues===1?'is':'are')+' left out of this: the map stands behind the whole repository, and averaging '+
             'that in would put one call in charge of the number.' : '')+
           ' A fact about this repository, not a claim about what an agent would otherwise have done with it.</p>'
         : '<p><b>'+s.answers+' answer'+(s.answers===1?'':'s')+'</b> served from the model, '+KB(s.served)+' in total. '+
           'How much source they replaced is not counted on this machine: the repository is read where the map '+
           'is made, so that comparison arrives with the map.</p>')+
       (s.linked
         ? '<p class="hm-linked"><b>'+s.linked+'</b> of the <b>'+s.objects+'</b> objects in those answers '+
           'share no word with what was asked — they were reached by following links. '+
           'A search over the words at hand would not have shown them, and they are the ones a change breaks '+
           'later, because nobody knew they were connected.</p>'
         : '');
  } else {
    // The shorthand reads well and registers against whatever directory the agent
    // happens to be in. On a screen about one project that is the wrong command,
    // so this offers the explicit one — pinned to this folder — and it is a button
    // that copies it, not a box that looks like a button and does nothing.
    const q=s=>'"'+String(s).replace(/"/g,'\\"')+'"';
    const addCmd = window.__GITMIR_CLI__ ? 'gitmir mcp add'
      : 'claude mcp add -s user gitmir -- node '+q((window.__GITMIR_HOME__||'.')+'/mcp.ts');
      // Somebody who chose to paste by hand has already answered this question.
      // Repeating the command at them on every visit reads as the tool not listening.
      const pasting = stepData && stepData.mode === 'skills';
      h+='<div class="hm-hero-h">Your map is ready. Nothing has used it yet.</div>'+
         '<p>Ask your assistant something about your product — what breaks if you change this, which rules apply '+
         'here, what a change would touch. Every answer it takes from the map is counted below, next to how much '+
         'it would have had to read without one.</p>'+
         (pasting
           ? '<div class="hm-cmd-w">You chose to copy and paste, so nothing needs setting up. '+
             '<button class="hm-link" data-go="skill">Open the instructions →</button>'+
             '<br><br>Want your assistant to fetch things by itself instead? '+
             '<button class="hm-link" data-go="mcp">Connect it in one command →</button></div>'
           : '<button class="hm-cmd" data-copy="'+esc(addCmd)+'" title="Copy this command">'+
             '<span class="hm-cmd-c">'+esc(addCmd)+'</span><span class="hm-cmd-a">Copy</span></button>'+
             '<div class="hm-cmd-w">Run it once in a terminal, then <b>close your editor and open it again</b> — '+
             'it only looks for new tools when it starts. Everything else arrives with it; nothing to paste. '+
             '<button class="hm-link" data-go="mcp">Show me the whole thing →</button></div>');
  }
  h+='</div>';

  // --- what needs a person --------------------------------------------------
  if(o.attention && o.attention.length){
    h+='<div class="hm-sec">What needs you</div><div class="hm-att">';
    for(const a of o.attention){
      h+='<div class="hm-a '+esc(a.level)+'">'+
         '<div class="hm-a-t">'+esc(a.title)+'</div>'+
         '<div class="hm-a-w">'+esc(a.why)+'</div>'+
         '<button class="hm-a-b" data-go="'+esc(a.action.go)+'"'+(a.action.arg?' data-arg="'+esc(a.action.arg)+'"':'')+'>'+
         esc(a.action.label)+'</button></div>';
    }
    h+='</div>';
  } else {
    h+='<div class="hm-sec">What needs you</div>'+
       '<div class="hm-clear">Nothing right now. The map matches your code, every disagreement found so far has been '+
       'decided one way or the other, and no planned piece of work reaches further than it was asked to.</div>';
  }

  // --- what it caught before anyone wrote code ------------------------------
  if(C && C.tasks){
    h+='<div class="hm-sec">Caught before the code was written</div><div class="hm-row">'+
       card('Tickets named', C.named+' objects', 'across '+C.tasks+' task'+(C.tasks===1?'':'s')+' that name part of the model', 'queue')+
       card('The model showed', C.reached+' of '+objects, 'what those tasks actually reach, walked from real links', 'impact')+
       card('Nobody had mentioned', C.unnamed+' of them', C.unnamed? 'found before anyone opened an editor' : 'the tickets named everything they touch', 'impact', C.unnamed?'warn':'')+
       (C.high? card('At high risk', C.high+' task'+(C.high===1?'':'s'), 'reaching a quarter of the product or more', 'impact', 'bad') : '')+
       '</div>';
  }

  // --- what you have --------------------------------------------------------
  // "Your product, mapped" used to stand first here, counting things and adding up bytes
  // off a model file on this disk. There is no such file, so both numbers were invented —
  // one of them by a function that does not exist. The Model tab shows the laboratory's own
  // totals, which are the only ones anybody should be quoting.
  //
  // Freshness is a positive claim, and it is made by whoever holds the map. Nothing here
  // compares anything: `stale` arrives as a literal false, so "Matches your code" was said
  // about a repository nobody had looked at. The card claims it only when the answer
  // actually carries a freshness signal — which is what the laboratory sends with the map,
  // and which this screen will pass on the day it is given one.
  const freshKnown = !!(o.freshness || o.stale || o.staleFile);
  h+='<div class="hm-sec">What you have</div><div class="hm-row">'+
     card('Read out of your code', o.source.files+' file'+(o.source.files===1?'':'s'), KB(o.source.bytes)+' of code, read once so nobody has to read it again', null)+
     (freshKnown
       ? card('Still true?', o.stale?'Your code has moved on':'Matches your code',
              o.stale? esc(o.staleFile||'')+' changed after the map was made — ask the laboratory to read it again' : 'Nothing has changed since the map was made', 'model', o.stale?'warn':'')
       : card('Still true?', 'Not known here',
              'The map states its own freshness, and this machine has not been handed one. The Model tab says it before it draws anything.', 'model'))+
     '</div>';

  // --- the record -----------------------------------------------------------
  if(o.usage.entries.length){
    h+='<div class="hm-sec">What was asked, and what it served</div><div class="hm-log">';
    for(const e of o.usage.entries){
      h+='<div class="hm-e"><span class="hm-e-w">'+esc(e.by||'agent')+'</span>'+
         '<span class="hm-e-q">'+esc(e.q||e.tool)+'</span>'+
         '<span class="hm-e-n">'+KB(e.served)+'</span>'+
         '<span class="hm-e-v">'+(e.wouldBytes? 'covered '+e.ids+' objects living in '+KB(e.wouldBytes) : e.ids+' objects')+'</span>'+
         '<span class="hm-e-t">'+esc(String(e.at||'').slice(0,16).replace('T',' '))+'</span></div>';
    }
    h+='</div><div class="hm-note">Kept in <code>.gitmir/usage.jsonl</code>, in this project. It is never sent anywhere — there is no GitMir telemetry, and this is the record that lets you check that claim rather than take it.</div>';
  }

  h+='</div>';
  view.innerHTML=h;
  wire();

  function wire(){
    view.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click', async ()=>{
      try{ await copyToClipboard(b.dataset.copy); toast('Copied ✓  Paste it into a terminal'); }
      catch(e){ toast('Copy failed: '+(e.message||e), true); }
    }));
    view.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{
      const g=b.dataset.go, arg=b.dataset.arg;
      if(g==='mcp'){ setTab('settings'); setupSub='mcp'; renderDetail(); return; }
      if(g==='build-model'||g==='skill'){ setTab('settings'); setupSub='skills'; renderDetail(); return; }
      // Everything about the product opens the Model tab, which reads the laboratory.
      //
      // 'lab' arrives from the attention list ("Connect one"). There is no lab tab and no
      // lab pane, so setTab('lab') took the active class off every tab and every pane and
      // left an empty frame; the Model tab is where a laboratory is actually reached, and
      // unconnected it draws the card with the sign-in and the key.
      //
      // 'impact', 'spec' and 'ownership' used to open a sub-view of a model held on this
      // disk. Those sub-views are gone with it, so asking for one by name is a way to land
      // nowhere. The map the laboratory serves is what the tab shows now.
      if(g==='lab'||g==='model'||g==='impact'||g==='spec'||g==='ownership'){ setTab('model'); return; }
      setTab(g);
    }));
  }
  function card(label, value, sub, go, tone){
    return '<div class="hm-card '+(tone||'')+'"'+(go?' data-go="'+go+'" role="button" tabindex="0"':'')+'>'+
      '<div class="hm-c-l">'+esc(label)+'</div><div class="hm-c-v">'+esc(value)+'</div>'+
      '<div class="hm-c-s">'+sub+'</div></div>';
  }
}


// What the product should become, declared on the map.
//
// Not a drawing tool. A drawing tool makes boxes, and nothing downstream can check
// anything against a box. Here every element is the same shape as a model object —
// same dimension, same id prefix, same relationship fields — so the moment the code
// catches up, the declaration is checkable by looking it up rather than by reading
// a picture. Positions are computed, as everywhere else: the product's own rule is
// that a diagram somebody can drag into a preferred shape can be made to say
// anything.
let designData = null, designFor = null, designAdd = null, designOpen = null;
// Whether the picture is in declaring mode. Kept out here so switching views and
// back does not silently drop you out of it mid-thought.
let designOn = false;


function fsClose(){ const ov=document.getElementById('fsOverlay'); if(ov){ ov.classList.remove('show'); ov.innerHTML=''; } }




// Display name of the model currently on screen (folder key → real name).
function srcLabel(){
  if(!modelSrc) return 'mine';
  const s=((modelData&&modelData.shared)||[]).find(x=>x.name===modelSrc);
  return (s&&s.label)||modelSrc;
}
// In fullscreen the browser paints only the fullscreen element's subtree, so an
// overlay parked on <body> is invisible exactly when someone is looking hardest
// at the diagram. Every overlay is parented to whoever currently owns the screen.
function overlayHost(){ return document.fullscreenElement || document.body; }
function mountOverlay(ov){ const h=overlayHost(); if(ov.parentNode!==h) h.appendChild(ov); return ov; }
// Entering or leaving fullscreen moves whatever is open along with it.
document.addEventListener('fullscreenchange', ()=>{
  const h=overlayHost();
  for(const id of ['ctxOverlay','taskOverlay','addOverlay','pvOverlay']){
    const o=document.getElementById(id);
    if(o && o.classList.contains('show') && o.parentNode!==h) h.appendChild(o);
  }
});



/* ---------- task queue view ---------- */
async function loadQueue(pathStr){
  const view=document.getElementById('queueView'); if(!view) return;
  let q; try{ q=await (await fetch('/api/queue?path='+encodeURIComponent(pathStr))).json(); }catch{ return; }
  if(selected!==pathStr) return;
  renderAudit(q);   // before the no-tasks return: an audit can outlive its tasks
  const total=(q.todo||[]).length+(q.inprogress||[]).length+(q.verify||[]).length+(q.done||[]).length;
  // The badge counts todo: what is waiting to be picked up. Verify is built but unproven —
  // it is shown in its own column, and it is not a number that says "start something".
  const badge=document.getElementById('queueBadge');
  if(badge) badge.textContent = (q.todo||[]).length ? String((q.todo||[]).length) : '';
  // The queue is where someone decides what to run next, so the impact figures have to be
  // here without a detour through the Model tab. Both loads are cheap and local; if the
  // model has not been read yet, read it and draw the queue again once it lands.
  await loadChanges(true);
    await loadQueuePrice(pathStr);
  if(!modelData || modelFor!==pathStr){ loadModel(pathStr).then(()=>{ if(selected===pathStr && activeTab==='queue') loadQueue(pathStr); }); }
  if(!total){ view.innerHTML='<div class="model-empty"><b style="font-size:17px">No work here yet</b><br><br>Tell your assistant what you want changed — in your own words. It writes the work down as small steps, each one with its own way of proving it worked.<br><br>The steps move across this board on their own: <b>to do → in progress → verify → done</b>. Nothing reaches <b>done</b> until its checks actually pass, so a green board means it works, not that somebody said so.<br><br>You can also start from a picture: open <b>Model</b>, click any part of your product and choose <b>＋ Create task</b>.</div>'; return; }
  const cols=[['todo','To do','#8aa0ff'],['inprogress','In progress','#ffb86b'],['verify','Verify','#c084fc'],['done','Done','#34f0a6']];
  let html='<div class="q-cols">';
  for(const [k,label,acc] of cols){ const items=q[k]||[];
    html+='<div class="q-col"><div class="q-col-h" style="color:'+acc+'">'+label+' <span class="q-n">'+items.length+'</span></div><div class="q-list">';
    if(!items.length) html+='<div class="q-empty">—</div>';
    for(const it of items){
      // What the impact view already knows about this exact file: which model objects it
      // names, how far that reaches, and whether anyone approved it. Showing it here is
      // the point — the queue is where someone decides what to run next.
      const ci = queueImpact(it.file);
      // The two prices of the change this task belongs to: one hairline, cyan for
      // what the first pass cost, red for everything after it.
      const pr = queuePrice(it.file);
      html+='<div class="q-card q-clk" data-col="'+esc(k)+'" data-file="'+esc(it.file)+'" title="Open full task" style="border-left-color:'+acc+'">'+
        '<div class="q-t">'+esc(it.title)+'</div><div class="q-f">'+esc(it.file)+'</div>'+
        (ci ? '<div class="q-imp">'+
                (ci.approved?'<span class="q-ok" title="Approved '+esc(ci.approved)+'">✓ approved</span>':'')+
                '<button class="q-risk '+ci.level+'" data-imp="'+esc(it.file)+'" title="Open this in Impact">'+
                  esc(ci.level)+' · '+ci.n+' object'+(ci.n===1?'':'s')+'</button>'+
              '</div>' : '')+
        (pr ? '<div class="q-pr" title="'+esc(pr.title)+'">'+caBar(pr.first, pr.after, 'pr-mini', pr.unknown)+
              (pr.label?'<span class="v">'+esc(pr.label)+'</span>':'')+'</div>' : '')+
        '</div>';
    }
    html+='</div></div>';
  }
  view.innerHTML=html+'</div>';
  view.querySelectorAll('.q-clk').forEach(c=> c.addEventListener('click', ()=> openTaskPopup(pathStr, c.dataset.col, c.dataset.file)));
  // The risk pill is a jump, not a label: it opens the Model tab on Impact with this
  // task already selected.
  view.querySelectorAll('.q-risk').forEach(b=> b.addEventListener('click', (e)=>{
    e.stopPropagation();
    impactPick=b.dataset.imp; modelView='impact'; setTab('model');
  }));
}

// Risk and object count for one task file, computed only when both the model and the
// change ledger are already in hand. The queue never waits on either.
// What the audit knows about the change each queued task belongs to. Read once per
// queue load, from the same file the Audit tab reads, so the two cannot disagree.
let qPrice = null, qPriceFor = null, qPriceAt = 0;
async function loadQueuePrice(pathStr){
  // The queue redraws every four seconds; re-reading the whole event log that often
  // to redraw an unchanged hairline would be the most expensive thing on the screen.
  if(qPriceFor===pathStr && qPrice && Date.now()-qPriceAt < 15000) return qPrice;
  try{
    const d = await (await fetch('/api/audit?path='+encodeURIComponent(pathStr)+'&days=180')).json();
    const by = new Map();
    for(const r of (d.rows||[])) by.set(r.change, r);
    // Per TASK — what a card is. The per-change rows stay, for the Audit tab.
    const byTask = new Map();
    for(const r of (d.byTask||[])) byTask.set(r.task, r);
    qPrice = { by, byTask, rate:d.rate||0, cur:d.currency||'USD' };
  }catch{ qPrice = { by:new Map(), byTask:new Map(), rate:0, cur:'USD' }; }
  qPriceFor = pathStr; qPriceAt = Date.now();
  return qPrice;
}
/**
 * What THIS task cost: the two numbers the board is for.
 *
 *   first pass — from the moment work began on it to the moment it was first handed
 *                over for checking;
 *   after      — everything from that hand-over until it landed. Zero when it was
 *                never sent back, and zero is the point: it means it worked first time.
 *
 * It used to read the per-CHANGE row, and a change is however many tasks one request
 * grew into. On an ingest that is six hundred tasks under one `Change:` header, so
 * every card showed the same thirteen minutes of rework — including the three hundred
 * and fifty nobody had started. A card now shows its own measurement or nothing.
 */
function queuePrice(file){
  if(!qPrice || !qPrice.byTask) return null;
  // Events name a task the way the queue names its file, without the extension.
  const r = qPrice.byTask.get(file.replace(/\.md$/i,''));
  // No row means work never began on it — not "it cost nothing", which is a
  // measurement, but that there is nothing to measure.
  if(!r) return null;
  if(!r.firstPassMinutes && !r.afterFirstPassMinutes) return null;
  const rate = qPrice.rate, cur = qPrice.cur;
  const unknown = !r.firstPassMinutes && r.droppedGaps > 0;
  return {
    first: r.firstPassMinutes, after: r.afterFirstPassMinutes, unknown,
    // Only rework gets a number beside the bar: it is the one that costs.
    label: r.afterFirstPassMinutes ? (rate ? caMoney(r.afterFirstPassMinutes, rate, cur) : caPlain(r.afterFirstPassMinutes)) : '',
    title: (unknown ? 'First pass not measured — it ran longer than the idle cutoff. '
                    : 'First pass '+caPlain(r.firstPassMinutes)+'. ')
         + (r.afterFirstPassMinutes
             ? 'Then '+caPlain(r.afterFirstPassMinutes)+' more after it came back'
               + (r.returns ? ', returned '+r.returns+' time'+(r.returns===1?'':'s') : '')
               + (rate ? ' — '+caMoney(r.afterFirstPassMinutes, rate, cur)+' of it rework' : '')+'.'
             : 'It was never sent back — done first time.'),
  };
}

/* Здесь лежал целый слой: рисование графа модели, подменю смотрелки и окно
 * «поделиться картой». Он остался от времени, когда модель строилась и хранилась
 * на этой машине.
 *
 * Модель уехала в лабораторию, а вместе с ней ушли и функции, на которых слой
 * стоял: kindOf, labelOf, objById, blastRadius — их в этом репозитории нет ни
 * одной. То есть слой не просто не нужен: любая ветка, до него дотянувшаяся,
 * падала с ReferenceError. Держался он лишь на том, что дотянуться было неоткуда —
 * окно «поделиться» включалось переменной, которую никто не выставляет.
 *
 * Вырезан целиком, и вместе с ним — таблица наших видов объектов с приставками
 * идентификаторов. Ей в открытом репозитории не место: клиент видит смысл своего
 * продукта, но не то, из чего у нас собрана модель. Карту и радиус рисует
 * вкладка Model по проекции от лаборатории. */

function queueImpact(file){
  /* Радиус изменения знает лаборатория, а не этот файл. Пока вкладка Model не
   * отдаст его вместе с задачей, здесь честно нечего показать — и это лучше
   * числа, посчитанного ни по чему. */
  return null;
}


let auSel = null;   // which page cell is expanded
// The audit report the skill asks for leads with the gaps, and so does this: a panel that
// shows only the defects invites the reading that everything else was checked.
function renderAudit(q){
  const box=document.getElementById('auditBox'); if(!box) return;
  const a=q.audit;
  if(!a || !a.counts || !a.counts.total){ box.innerHTML=''; box.style.display='none'; return; }
  box.style.display='block';
  const c=a.counts, seen=(c.passed||0)+(c.failed||0);
  const pct = c.total ? Math.round(seen*100/c.total) : 0;

  let html='<div class="ing-hd"><span class="ing-t">App audit</span>'+
    '<span class="ing-n">'+ingNum(seen)+' of '+ingNum(c.total)+' pages walked</span>'+
    '<span class="ing-pct">'+pct+'%</span></div>'+
    '<div class="ing-bar"><i style="width:'+pct+'%"></i></div>';

  html+='<div class="ing-tape">';
  for(const g of (a.pages||[])){
    const t='#'+g.n+' '+(g.url||'')+' — '+g.status+
      (g.useCases?(', '+g.useCases+' use cases'):'')+
      (g.notExercised&&g.notExercised.length?(', '+g.notExercised.length+' not pressed'):'');
    html+='<i class="ic '+g.status+(auSel===g.n?' sel':'')+'" data-pg="'+g.n+'" title="'+esc(t)+'"></i>';
  }
  html+='</div><div class="ing-frag" id="auFrag"></div>';

  // What the run could NOT see. This is the part that decides how much the rest is worth.
  const gaps=[];
  if(c.pending) gaps.push('<b>'+c.pending+'</b> page'+(c.pending>1?'s':'')+' not walked yet');
  if(c.unreachable) gaps.push('<b>'+c.unreachable+'</b> unreachable');
  if(c.skipped) gaps.push('<b>'+c.skipped+'</b> skipped');
  if(a.notExercised) gaps.push('<b>'+a.notExercised+'</b> destructive control'+(a.notExercised>1?'s':'')+' left unpressed');
  if(a.driver==='curl') gaps.push('<b>no browser</b> — API only, the interface went unchecked');
  if(!(a.auth||[]).length) gaps.push('<b>no auth state recorded</b>');
  else if((a.auth||[]).length===1) gaps.push('one auth state only (<b>'+esc(a.auth[0])+'</b>)');
  if(a.caps) for(const k of Object.keys(a.caps).slice(0,6)) gaps.push(esc(k)+' capped at <b>'+esc(String(a.caps[k]))+'</b>');
  html+='<div class="au-gaps">'+(gaps.length
    ? 'Not covered: '+gaps.join(' · ')+'.'
    : 'Every page walked, every control exercised, no caps applied.')+'</div>';

  const run=[];
  if(a.target) run.push('target <b>'+esc(a.target)+'</b>');
  if(a.env) run.push('env <b>'+esc(a.env)+'</b>');
  if(a.driver) run.push('driver <b>'+esc(a.driver)+'</b>');
  if((a.auth||[]).length) run.push('auth <b>'+a.auth.map(esc).join(', ')+'</b>');
  if(a.at) run.push('ran <b>'+esc(fmtTime(a.at))+'</b>');
  if(run.length) html+='<div class="au-run">'+run.map(x=>'<span>'+x+'</span>').join('')+'</div>';

  const sv=a.sev||{};
  const chips=['critical','major','minor','intermittent'].filter(k=>sv[k]);
  if(chips.length) html+='<div class="au-sev">'+chips.map(k=>'<span class="sv '+k+'">'+sv[k]+' '+k+'</span>').join('')+'</div>';

  if((a.findings||[]).length){
    html+='<div class="au-find">';
    for(const f of a.findings){
      html+='<div class="af"><div class="af-h"><span class="sv '+f.severity+'">'+esc(f.severity)+'</span>'+
        '<span class="af-t">'+esc(f.title||'(untitled)')+'</span>'+
        '<span class="af-p">'+esc(f.page||'')+(f.step?(' step '+f.step):'')+'</span></div>';
      if(f.expected) html+='<div class="af-r"><i>expected</i>'+esc(f.expected)+'</div>';
      if(f.observed) html+='<div class="af-r af-x"><i>observed</i>'+esc(f.observed)+'</div>';
      const tail=[];
      if(f.task) tail.push('fix task <b>'+esc(f.task)+'</b>');
      if(f.evidence) tail.push(esc(f.evidence));
      if(tail.length) html+='<div class="af-r"><i>filed</i>'+tail.join(' · ')+'</div>';
      html+='</div>';
    }
    html+='</div>';
    if(a.findingsTotal>a.findings.length)
      html+='<div class="ing-note">Showing '+a.findings.length+' of '+ingNum(a.findingsTotal)+
        ' — the rest are in <code>.gitmir/audit/findings.json</code>.</div>';
  } else if(!c.pending){
    html+='<div class="ing-note">No defects were observed. That covers what is listed above and nothing else.</div>';
  }

  if((a.mismatches||[]).length){
    html+='<div class="au-mm"><b>Sources disagree:</b><br>';
    for(const m of a.mismatches) html+='<code>'+esc(m.what||'')+'</code> — '+esc(m.detail||m.kind||'')+'<br>';
    html+='</div>';
  }

  box.innerHTML=html;
  const tape=box.querySelector('.ing-tape');
  if(tape) tape.addEventListener('click', (e)=>{
    const cell=e.target.closest('.ic'); if(!cell) return;
    const n=Number(cell.dataset.pg);
    auSel = (auSel===n) ? null : n;
    box.querySelectorAll('.ic').forEach(x=> x.classList.toggle('sel', Number(x.dataset.pg)===auSel));
    paintAuPage(a);
  });
  paintAuPage(a);
}
function paintAuPage(a){
  const el=document.getElementById('auFrag'); if(!el) return;
  const g=(a.pages||[]).find(x=>x.n===auSel);
  if(!g){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  let h='<div class="fh">#'+g.n+' '+esc(g.url||'')+(g.title?(' · '+esc(g.title)):'')+' — '+esc(g.status)+'</div>';
  const bits=[];
  if(g.auth) bits.push('auth '+esc(g.auth));
  if(g.useCases) bits.push(g.useCases+' use cases');
  if(g.interactive) bits.push(g.interactive+' interactive elements');
  if(g.dataEls) bits.push(g.dataEls+' data regions');
  if((g.foundBy||[]).length) bits.push('found by '+g.foundBy.map(esc).join(' + '));
  if(bits.length) h+='<div>'+bits.join(' · ')+'</div>';
  if(g.task) h+='<div>task <code>'+esc(g.task)+'</code></div>';
  if((g.notExercised||[]).length) h+='<div style="color:#ffb86b">not pressed: '+g.notExercised.map(esc).join(', ')+'</div>';
  if(g.note) h+='<div style="color:#ffb86b">'+esc(g.note)+'</div>';
  el.innerHTML=h;
}

async function openTaskPopup(pathStr, col, file){
  let d; try{ d=await (await fetch('/api/task-file?path='+encodeURIComponent(pathStr)+'&col='+encodeURIComponent(col)+'&file='+encodeURIComponent(file))).json(); }
  catch{ toast('Failed to read task', true); return; }
  if(!d || !d.ok){ toast(d&&d.error==='not found'?'Task file no longer exists':'Failed to read task', true); return; }
  const COLS={todo:['To do','#8aa0ff'], inprogress:['In progress','#ffb86b'], verify:['Verify','#c084fc'], done:['Done','#34f0a6']};
  const meta=COLS[col]||['Task','#2fd8ff'];
  let ov=document.getElementById('taskOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='taskOverlay'; ov.className='ctx-overlay'; overlayHost().appendChild(ov); }
  ov.innerHTML=
    '<div class="ctx-modal">'+
      '<div class="ctx-head"><span class="q-badge" style="color:'+meta[1]+'; border-color:'+meta[1]+'">'+esc(meta[0])+'</span>'+
        '<div class="ctx-title">'+esc(file)+'</div><button class="ctx-x" title="Close (Esc)">✕</button></div>'+
      '<pre class="ctx-pre">'+esc(d.content||'')+'</pre>'+
      '<div class="ctx-actions">'+
        '<button class="ghost tk-copy">📋 Copy task</button>'+
        '<button class="del tk-close">Close</button>'+
      '</div>'+
    '</div>';
  mountOverlay(ov).classList.add('show');
  const close=()=>{ ov.classList.remove('show'); ov.innerHTML=''; };
  ov.querySelector('.ctx-x').addEventListener('click', close);
  ov.querySelector('.tk-close').addEventListener('click', close);
  ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  ov.querySelector('.tk-copy').addEventListener('click', async ()=>{ await copyToClipboard(d.content||''); toast('Task copied ✓'); });
}










function copyToClipboard(text){
  if(navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject)=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); resolve();
    }catch(e){ reject(e); }
  });
}
// Quotes MUST be escaped too: model data (including a teammate's shared model, which
// arrives over the network) is interpolated into HTML/SVG attributes like data-cid="…",
// and a value containing a quote would otherwise inject attributes into the page.
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(iso){ try{ const d=new Date(iso); if(isNaN(d)) return iso; return d.toLocaleString('en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch{ return iso; } }
async function refreshTasks(pathStr){
  let d; try{ d = await (await fetch('/api/tasks?path='+encodeURIComponent(pathStr))).json(); }catch{ return; }
  if (selected !== pathStr) return;               // switched to another project
  const cont = document.getElementById('taskList'); if(!cont) return;
  const tasks = d.tasks || [];
  const uEl = document.getElementById('taskUpd'); if(uEl) uEl.textContent = d.updated ? ('updated '+fmtTime(d.updated)) : '';
  if(!tasks.length){
    cont.innerHTML = '<div class="tasks-empty">No entries yet.<br>1) <b>▶ Run '+agentName()+'</b> · 2) in Settings click <b>📋 task-log</b> · 3) paste into '+agentName()+' (⌘V) and Enter — it will start logging what it does here.</div>';
    return;
  }
  const icon = s => s==='done'?'✅':s==='in_progress'?'🔧':'⬜';
  cont.innerHTML = tasks.slice().reverse().map(t=>{
    const files = (t.files||[]).map(f=>'<span class="file">'+esc(f)+'</span>').join('');
    return '<div class="task '+(t.status||'')+'">'+
      '<div class="ic">'+icon(t.status)+'</div>'+
      '<div class="body"><div class="tt">'+esc(t.title||'—')+'</div>'+
      (t.detail?'<div class="dd">'+esc(t.detail)+'</div>':'')+
      ((files||t.ts)?'<div class="meta">'+files+(t.ts?'<span class="ts">'+esc(fmtTime(t.ts))+'</span>':'')+'</div>':'')+
      '</div></div>';
  }).join('');
}

function debounce(fn, ms){ let t; return ()=>{ clearTimeout(t); t=setTimeout(fn, ms); }; }

async function update(pathStr, patch, savedSel){
  const item = byPath(pathStr); if(item) Object.assign(item, patch);
  await fetch('/api/update', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:pathStr, ...patch})});
  // reflect name change in the sidebar without full reload
  if (patch.name !== undefined){
    const it = [...listEl.children].find(c=>c.dataset && c.dataset.path===pathStr);
    if (it) it.querySelector('.nm').textContent = displayName(item);
  }
  if (savedSel){ const s=document.querySelector(savedSel); if(s){ s.classList.add('show'); clearTimeout(s._t); s._t=setTimeout(()=>s.classList.remove('show'),1200);} }
}

async function open(p, which){
  const agent = which || agentPick();
  const r = await fetch('/api/open', {method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path:p.path, agent})});
  if(!r.ok){ const d=await r.json().catch(()=>({})); toast('Error: '+(d.error||r.status), true); return; }
  // What actually started, not what was asked for. A server left running from an
  // older build ignores the agent, and this is where that becomes visible.
  const d = await r.json().catch(()=>({}));
  const ran = String(d.ran || '');
  const mismatch = ran && agent === 'codex' && /claude/i.test(ran);
  toast(mismatch
    ? 'Started ' + ran + ', not Codex — the dashboard server is from an older build. Restart it: gitmir restart'
    : 'Opening “'+displayName(p)+'” in Terminal with '+(AGENTS[agent]||agent)+'…', mismatch);
}
async function reveal(p){
  await fetch('/api/reveal', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:p.path})});
}
async function remove(p){
  if(!confirm('Remove “'+displayName(p)+'” from the list?\n\nThe folder on disk is NOT deleted — only the card is removed.')) return;
  await fetch('/api/remove', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:p.path})});
  if (selected===p.path) selected = null;
  toast('Removed from list'); load();
}

async function addProject(bodyObj){
  const r = await fetch('/api/add', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bodyObj||{})});
  return r.json();
}
function openAddModal(){
  let ov=document.getElementById('addOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='addOverlay'; ov.className='ctx-overlay'; overlayHost().appendChild(ov); }
  ov.innerHTML=
    '<div class="ctx-modal" style="max-width:560px">'+
      '<div class="ctx-head"><div class="ctx-title">Add a project</div><button class="ctx-x" title="Close (Esc)">✕</button></div>'+
      '<div class="ctx-note">Paste the full path to the project folder — open it in your file manager and copy the path from the address bar.'+(PICKER_OK?' Or use <b>Browse…</b> to pick it.':'')+'</div>'+
      '<div class="ctx-taskl" style="margin:14px 18px 0">Folder path</div>'+
      '<input class="ctx-task" id="addPath" style="min-height:0; height:44px; line-height:22px; font-family:var(--font-mono)" placeholder="e.g.  C:&#92;projects&#92;my-app   or   /Users/you/projects/my-app" autocomplete="off" spellcheck="false">'+
      '<div class="ctx-actions">'+
        '<button class="run" id="addGo">＋ Add</button>'+
        (PICKER_OK?'<button class="ghost" id="addBrowse">🗂 Browse…</button>':'')+
        '<button class="del" id="addCancel">Cancel</button>'+
      '</div>'+
    '</div>';
  mountOverlay(ov).classList.add('show');
  const inp=ov.querySelector('#addPath');
  const close=()=>{ ov.classList.remove('show'); ov.innerHTML=''; };
  const go=async ()=>{
    const p=(inp.value||'').trim(); if(!p){ toast('Enter a folder path', true); inp.focus(); return; }
    const d=await addProject({path:p});
    if(d.added){ selected=d.project.path; await load(); close(); toast('Added: '+displayName(d.project)); }
    else if(d.duplicate){ selected=d.path; await load(); close(); toast('Already in the list', true); }
    else if(d.error){ toast(d.error, true); inp.focus(); }
    else close();
  };
  ov.querySelector('.ctx-x').addEventListener('click', close);
  ov.querySelector('#addCancel').addEventListener('click', close);
  ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  ov.querySelector('#addGo').addEventListener('click', go);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
  const bb=ov.querySelector('#addBrowse');
  if(bb) bb.addEventListener('click', async ()=>{
    toast('Opening folder picker…');
    let d; try{ d=await (await fetch('/api/pick',{method:'POST'})).json(); }catch{ d={}; }
    if(d.path){ inp.value=d.path; toast('Picked ✓'); }
    else if(d.pickerFailed){ toast('Native picker unavailable — paste the path instead', true); }
    else { document.getElementById('toast').className='toast'; }
    inp.focus();
  });
  setTimeout(()=>inp.focus(), 40);
}
/* Обвязка пульта. Условие «а вдруг это страница поделённой карты» отсюда ушло
 * вместе с самой такой страницей: включалась она переменной, которую в этом
 * репозитории не выставляет никто. */
document.getElementById('addBtn').addEventListener('click', openAddModal);
searchEl.addEventListener('input', renderList);
window.addEventListener('focus', ()=>load(true)); // refresh folder status on return

// drag & drop reorder
let dragEl = null;
function wireDrag(el){
  el.addEventListener('dragstart', ()=>{ dragEl = el; el.classList.add('drag'); });
  el.addEventListener('dragend', ()=>{ el.classList.remove('drag'); saveOrder(); });
  el.addEventListener('dragover', (e)=>{ e.preventDefault(); if(el!==dragEl) el.classList.add('dragover'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('dragover'));
  el.addEventListener('drop', (e)=>{
    e.preventDefault(); el.classList.remove('dragover');
    if(!dragEl || dragEl===el) return;
    const items = [...listEl.children];
    if(items.indexOf(dragEl) < items.indexOf(el)) el.after(dragEl); else el.before(dragEl);
  });
}
async function saveOrder(){
  const paths = [...listEl.children].map(c=>c.dataset && c.dataset.path).filter(Boolean);
  await fetch('/api/reorder', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({paths})});
  projects.sort((a,b)=> paths.indexOf(a.path)-paths.indexOf(b.path));
}

/* ---------------- preview & pick (client) ---------------- */
let PREVIEW_OK = true;
let PV_ORIGIN = '';   // preview is served from a different host, see /api/env
let pvPicked = null;
// A literal backtick would terminate the HTML template this script is emitted from.
const TICK = String.fromCharCode(96);
function pvMem(){ try{ return JSON.parse(localStorage.getItem('gitmir.preview')||'{}'); }catch{ return {}; } }
function pvRemember(u){ if(!selected) return; const m=pvMem(); m[selected]=u; try{ localStorage.setItem('gitmir.preview', JSON.stringify(m)); }catch{} }
function pvInit(){
  const go=document.getElementById('pvGo'), pick=document.getElementById('pvPick'),
        input=document.getElementById('pvUrl'), frame=document.getElementById('pvFrame');
  if(!go) return;
  if(go.dataset.wired){                       // already bound; just restore what was open
    if(!frame.src && input.value.trim()) pvOpen(input.value.trim());
    return;
  }
  go.dataset.wired='1';
  // Reopen whatever this project was last pointed at, so switching tabs or projects
  // does not throw the page away.
  const eg=document.getElementById('pvEg');
  if(eg && !eg.childElementCount){
    // Starting points that actually work: this dashboard, and the usual dev-server port.
    for(const u of ['http://localhost:4599/', 'http://localhost:3000/', 'https://example.com/']){
      // Plain string ops on purpose: a slash escape in a regex would not survive
      // being emitted from the HTML template literal below.
      let lbl=u; const q=lbl.indexOf('://'); if(q>=0) lbl=lbl.slice(q+3);
      if(lbl.endsWith('/')) lbl=lbl.slice(0,-1);
      const b2=document.createElement('button'); b2.className='pv-egb'; b2.textContent=lbl;
      b2.addEventListener('click', ()=>pvOpen(u)); eg.appendChild(b2);
    }
  }
  const last=pvMem()[selected];
  if(last && !input.value){ input.value=last; pvOpen(last); }
  const load=()=>{ const v=input.value.trim(); if(v) pvOpen(v); };
  go.addEventListener('click', load);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') load(); });
  pick.addEventListener('click', ()=> pvSetPick(!pick.classList.contains('on')));
}
function pvOpen(v){
  const input=document.getElementById('pvUrl'), frame=document.getElementById('pvFrame'),
        pick=document.getElementById('pvPick'), empty=document.getElementById('pvEmpty');
  if(!frame) return;
  if(!/^https?:/i.test(v)) v='https://'+v;   // no slashes: an escaped / would not survive the template
  input.value=v; pvRemember(v);
  if(empty) empty.style.display='none';
  const wrap=frame.parentElement; if(wrap) wrap.classList.add('loaded');
  frame.classList.add('on');
  frame.src=PV_ORIGIN+'/api/preview?url='+encodeURIComponent(v);
  if(pick) pick.disabled=false;
  pvSetPick(false);
  const box=document.getElementById('pvPicked'); if(box) box.innerHTML='';
}
let pvAck=null;
function pvSetPick(on){
  const pick=document.getElementById('pvPick'), frame=document.getElementById('pvFrame');
  if(!pick||!frame) return;
  pick.classList.toggle('on', on);
  pick.textContent = on ? '◉ Click an element…' : '◎ Select';
  try{ frame.contentWindow.postMessage({type: on?'gitmir:pick-on':'gitmir:pick-off'}, '*'); }catch{}
  // Do not let the button claim it is armed when the picker never answered — that is
  // indistinguishable from "hovering does nothing" and looks like the feature is broken.
  clearTimeout(pvAck);
  if(on) pvAck=setTimeout(()=>{
    const b=document.getElementById('pvPick');
    if(b && b.classList.contains('on')){
      b.classList.remove('on'); b.textContent='◎ Select';
      toast('The picker is not running on this page — press Go to reload it.', true);
    }
  }, 1200);
}
// The preview frame is sandboxed without allow-same-origin, so its origin is "null".
// Trust it by identity (the window we created), not by origin string.
window.addEventListener('message', async (e)=>{
  const frame=document.getElementById('pvFrame');
  if(!frame || e.source!==frame.contentWindow) return;
  const d=e.data||{};
  if(d.type==='gitmir:pick-state'){ clearTimeout(pvAck); const b=document.getElementById('pvPick');
    if(b){ b.classList.toggle('on', !!d.on); b.textContent = d.on ? '◉ Click an element…' : '◎ Select'; } return; }
  if(d.type==='gitmir:pick-cancelled'){ pvSetPick(false); return; }
  if(d.type!=='gitmir:picked') return;
  pvSetPick(false);
  pvPicked=d;
  await pvRenderPicked(d);
});
// Picking an element builds the text you paste into Claude Code and puts it straight
// on the clipboard, then shows it so you can see exactly what was copied.
function pvText(d, hits, model, what){
  const c=d.candidates||{};
  const L=[];
  // The element itself comes first — that is what the agent has to recognise. Then
  // the facts about it, then where it lives, then what to do.
  L.push('## The element I picked (with everything inside it)');
  L.push(TICK+TICK+TICK+'html');   // literal backticks would end the template
  L.push(d.html || '');
  L.push(TICK+TICK+TICK);
  L.push('');
  L.push('## What it is');
  L.push('- page: ' + (d.url||''));
  L.push('- tag: ' + (d.tag||'?') + ((c.classes&&c.classes.length) ? ' · classes: ' + c.classes.slice(0,8).join(' ') : ''));
  if(c.text) L.push('- visible text: "' + c.text.slice(0,200) + '"');
  if(c.testid) L.push('- data-testid: ' + c.testid);
  if(c.id) L.push('- id: ' + c.id);
  if(c.aria) L.push('- aria-label: ' + c.aria);
  if(d.attrs && d.attrs.href) L.push('- href: ' + d.attrs.href);
  L.push('- CSS selector: ' + (d.selector||''));
  if(d.ancestors && d.ancestors.length) L.push('- sits inside: ' + d.ancestors.join(' > '));
  L.push('');
  L.push('## Where it probably lives in this project');
  if(hits && hits.length){
    for(const h of hits.slice(0,14)) L.push('- ' + h.file + ':' + h.line + '  — matched ' + JSON.stringify(h.needle.slice(0,60)));
    L.push('');
    L.push('Those are text matches, not proof — open them and confirm before changing anything.');
  } else {
    L.push('- nothing in this project matched its text, id or classes. It may be rendered from data,');
    L.push('  or this page is not built by this project. Find the source before editing — do not guess a file.');
  }
  if(model && model.length){
    L.push('');
    L.push('From the .gitmir model: ' + model.map(f=>f.name).join(', '));
  }
  L.push('');
  L.push('## Do the following');
  L.push((what && what.trim()) ? what.trim() : '<describe it here, or just type it to Claude after pasting>');
  return L.join('\n');
}

async function pvRenderPicked(d){
  const c=d.candidates||{};
  // Look the element up in the project first, so the copied text carries the files.
  const UTIL=/^(flex|grid|block|inline|hidden|relative|absolute|fixed|w-|h-|p[xytblr]?-|m[xytblr]?-|text-|bg-|border|rounded|shadow|gap-|items-|justify-|font-|leading-|tracking-|space-|max-|min-|overflow|z-|opacity|transition|duration|cursor|select-)/;
  const needles=[];
  if(c.text) needles.push(c.text.slice(0,80));
  if(c.text){ const plain=c.text.replace(/[^p{L}p{N} ]/gu,'').trim(); if(plain && plain!==c.text) needles.push(plain.slice(0,80)); }
  if(c.testid) needles.push(c.testid);
  if(c.id) needles.push(c.id);
  for(const cl of (c.classes||[])) if(cl.length>3 && !UTIL.test(cl)) needles.push(cl);
  let r={hits:[],fromModel:[],searched:0};
  try{ r=await (await fetch('/api/preview-find',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path:selected, needles})})).json(); }catch{}
  pvPicked._hits=r.hits||[]; pvPicked._model=r.fromModel||[];
  const text=pvText(d, r.hits, r.fromModel);
  pvPicked._text=text;

  // Try to copy immediately. A message from the frame is not a user gesture, so the
  // browser may refuse — say which happened instead of claiming success.
  let copied=false;
  try{ await copyToClipboard(text); copied=true; }catch{}

  let ov=document.getElementById('pvOverlay');
  if(!ov){ ov=document.createElement('div'); ov.id='pvOverlay'; ov.className='ctx-overlay'; overlayHost().appendChild(ov); }
  ov.innerHTML=
    '<div class="ctx-modal">'+
      '<div class="ctx-head"><div class="ctx-title">'+esc(d.tag||'element')+(c.text?' — “'+esc(c.text.slice(0,60))+'”':'')+'</div>'+
        '<button class="ctx-x" title="Close (Esc)">✕</button></div>'+
      '<div class="ctx-note">'+(copied
        ? '✓ Copied to the clipboard — paste it into Claude Code (⌘V + Enter) and it will know which element you mean.'
        : 'Press <b>Copy</b> below, then paste it into Claude Code (⌘V + Enter).')+'</div>'+
      '<pre class="ctx-pre" id="pvPre">'+esc(text)+'</pre>'+
      '<div class="ctx-taskl">What should change about this element?</div>'+
      '<textarea class="ctx-task" id="pvWhat" placeholder="e.g. make this image lazy-load and give it an alt text"></textarea>'+
      '<div class="ctx-actions">'+
        '<button class="run pv-copy">📋 '+(copied?'Copy again':'Copy')+'</button>'+
        '<button class="ghost pv-task">＋ Queue as a task</button>'+
        '<button class="del pv-close">Close</button>'+
      '</div>'+
    '</div>';
  mountOverlay(ov).classList.add('show');
  const close=()=>{ ov.classList.remove('show'); ov.innerHTML=''; };
  ov.querySelector('.ctx-x').addEventListener('click', close);
  ov.querySelector('.pv-close').addEventListener('click', close);
  ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  const what=ov.querySelector('#pvWhat'), pre=ov.querySelector('#pvPre');
  const current=()=> pvText(d, r.hits, r.fromModel, what.value);
  // Keep the preview honest: it shows exactly what a copy would put on the clipboard.
  what.addEventListener('input', ()=>{ pre.textContent=current(); });
  ov.querySelector('.pv-copy').addEventListener('click', async ()=>{
    try{ await copyToClipboard(current()); toast('Copied ✓  paste into '+agentName()); }catch{ toast('Could not copy — select the text and copy it', true); }
  });
  ov.querySelector('.pv-task').addEventListener('click', ()=>{
    const w=what.value.trim();
    if(!w){ toast('Say what should change first', true); what.focus(); return; }
    close(); pvQueueTask(current(), d, w);
  });
  setTimeout(()=>{ try{ what.focus(); }catch{} }, 30);
}
// Optional: the same text, dropped into the queue instead of the clipboard.
async function pvQueueTask(text, d, what){
  const c=(d && d.candidates)||{};
  const title=(what && what.trim()) ? what.trim().split('\n')[0].slice(0,80)
            : ((c.text ? c.text.slice(0,60) : (d && d.tag) || 'element') + ' — from the page');
  const content='# '+title+'\n\n## Context\nPicked from '+((d&&d.url)||'')+' in the Preview tab.\n\n'+text+'\n';
  const r=await (await fetch('/api/task',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({path:selected, title, content})})).json();
  if(r.ok){ toast('Task created in tasks/todo ✓'); if(activeTab==='queue') loadQueue(selected); }
  else toast('Failed: '+(r.error||'error'), true);
}


/* ---------------- team bridge (client) ---------------- */
let teamState=null, teamSeenTaskT=null, teamSeenModelT=null, RELAY_URL_DEFAULT='ws://localhost:4600';
function loadTeamMem(){ try{ return JSON.parse(localStorage.getItem('gitmir.team')||'{}'); }catch{ return {}; } }
function saveTeamMem(o){ try{ localStorage.setItem('gitmir.team', JSON.stringify(o)); }catch{} }
function taTime(t){ try{ return new Date(t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }catch{ return ''; } }
function activityHtml(activity){
  if(!activity||!activity.length) return '<div class="team-empty">No activity yet.</div>';
  return activity.map(a=> '<div class="team-act"><span class="ta-k">'+esc(a.kind)+'</span><span class="ta-t">'+esc(a.text)+'</span><span class="ta-time">'+taTime(a.t)+'</span></div>').join('');
}
function connectHtml(s){
  return ''
  + '<div class="team-card">'
  +   '<div class="team-lede">Connect this machine to your team through the GitMir relay. The relay only <b>routes</b> — your model and tasks move between your team\'s machines and nothing is stored on our servers. Requires a paid Team plan.</div>'
  +   '<div class="field"><label>Workspace key</label><input class="ti" id="teamKey" placeholder="wsk_…" autocomplete="off" spellcheck="false"></div>'
  +   '<div class="field"><label>Display name</label><input class="ti" id="teamName" placeholder="Your name"></div>'
  +   '<div class="field"><label>Project ID <span class="lbl-hint">from the Team bridge panel at ide.gitmir.com — this is the room</span></label><input class="ti" id="teamPid" placeholder="e.g. cms0a1b2c3" autocomplete="off" spellcheck="false"></div>'
  +   '<div class="field"><label>Bind to project <span class="lbl-hint">the local folder this machine works in</span></label><select class="ti" id="teamProj"></select></div>'
  +   '<div class="field"><label>Relay URL</label><input class="ti" id="teamUrl" placeholder="ws://localhost:4600" spellcheck="false"></div>'
  +   '<div class="team-actions"><button class="run" id="teamConnectBtn">▚ Connect</button><span class="team-cstate" id="teamCStatus"></span></div>'
  + '</div>'
  + '<div class="team-card"><div class="team-feed-h">Activity</div><div id="teamDyn"></div></div>';
}
function liveHtml(s){
  var bound = s.projectPath ? ('bound: '+esc(basename(s.projectPath))) : 'no project bound';
  return ''
  + '<div class="team-card">'
  +   '<div class="team-status-row">'
  +     '<span class="team-dot on"></span>'
  +     '<span class="team-self">'+esc((s.self&&s.self.name)||s.name||'me')+'</span>'
  +     '<span class="team-plan">plan: '+esc(s.plan||'—')+'</span>'
  +     '<span class="team-bound">'+bound+'</span>'
  +   '</div>'
  +   '<div class="team-mirror" id="teamMirror"></div>'
  +   '<div class="team-members" id="teamMembers"></div>'
  +   '<div class="team-ops"><button class="del" id="teamDiscBtn">Disconnect</button></div>'
  + '</div>'
  + '<div class="team-card">'
  +   '<div class="team-feed-h">Send a task to the team</div>'
  +   '<input class="ti" id="teamTaskTitle" placeholder="Task title">'
  +   '<textarea class="ti" id="teamTaskBody" placeholder="Optional details (markdown)"></textarea>'
  +   '<div class="team-actions"><button class="run" id="teamSendBtn">➤ Send task</button></div>'
  + '</div>'
  + '<div class="team-card"><div class="team-feed-h">Activity</div><div id="teamDyn"></div></div>';
}
function wireConnect(){
  const view=document.getElementById('teamView'); if(!view) return;
  const sel=view.querySelector('#teamProj');
  const mem=loadTeamMem();
  sel.innerHTML = projects.map(p=> '<option value="'+esc(p.path)+'">'+esc(displayName(p))+'</option>').join('') || '<option value="">— add a project first —</option>';
  const wantPath = mem.path || selected || (projects[0] && projects[0].path);
  if(wantPath) sel.value = wantPath;
  view.querySelector('#teamKey').value = mem.key || '';
  view.querySelector('#teamName').value = mem.name || '';
  view.querySelector('#teamPid').value = mem.projectId || '';
  view.querySelector('#teamUrl').value = mem.url || (teamState && teamState.url) || RELAY_URL_DEFAULT;
  view.querySelector('#teamConnectBtn').addEventListener('click', teamDoConnect);
}
async function teamDoConnect(){
  const view=document.getElementById('teamView'); if(!view) return;
  const key=view.querySelector('#teamKey').value.trim();
  const name=view.querySelector('#teamName').value.trim();
  const path=view.querySelector('#teamProj').value;
  const projectId=view.querySelector('#teamPid').value.trim();
  const url=view.querySelector('#teamUrl').value.trim();
  if(!key){ toast('Enter a workspace key', true); return; }
  saveTeamMem({key,name,url,path,projectId});
  const cs=view.querySelector('#teamCStatus'); if(cs) cs.innerHTML='<span class="team-connecting">connecting…</span>';
  try{
    const r=await (await fetch('/api/team/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,name,path,projectId,url})})).json();
    teamState=r.status||teamState;
  }catch{ toast('Connect failed', true); }
  teamPoll();
}
function wireLive(){
  const view=document.getElementById('teamView'); if(!view) return;
  view.querySelector('#teamDiscBtn').addEventListener('click', async ()=>{
    await fetch('/api/team/disconnect',{method:'POST'});
    toast('Disconnected from the team'); teamState=null; teamPoll();
  });
  view.querySelector('#teamSendBtn').addEventListener('click', async ()=>{
    const t=view.querySelector('#teamTaskTitle'), b=view.querySelector('#teamTaskBody');
    const title=t.value.trim(); if(!title){ toast('Task needs a title', true); return; }
    const r=await (await fetch('/api/team/send-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title, body:b.value})})).json();
    if(r.ok){ toast('Task sent to the team'); t.value=''; b.value=''; } else toast(r.error||'Send failed', true);
    teamPoll();
  });
}
// The owner flips this switch, but it is THIS machine that uploads — so it is stated
// plainly and always, never behind a tooltip. Spec 4.3.
function mirrorHtml(s){
  const lvl=s.sharing||'local';
  const label={local:'Nothing leaves this machine',tasks:'This project mirrors: the task queue',full:'This project mirrors: the task queue + the product model'}[lvl]
    || 'Nothing leaves this machine';
  const note={local:'The relay routes between your machines live and keeps nothing.',
              tasks:'Task titles, bodies, status and acceptance criteria are stored on GitMir so your team can follow along. Source code never is.',
              full:'Tasks and a snapshot of the laboratory are stored on GitMir. Source code never is.'}[lvl]||'';
  return '<div class="mirror-hd"><span class="mirror-dot '+esc(lvl)+'"></span><b>'+esc(label)+'</b>'
    + '<span class="mirror-lvl">'+esc(lvl)+'</span></div>'
    + '<div class="mirror-note">'+esc(note)+' Set by the project owner at ide.gitmir.com — it cannot be changed from here.</div>';
}
function teamUpdateDynamic(s){
  const mir=document.getElementById('teamMirror'); if(mir) mir.innerHTML=mirrorHtml(s);
  const dyn=document.getElementById('teamDyn'); if(dyn) dyn.innerHTML=activityHtml(s.activity);
  const mem=document.getElementById('teamMembers');
  if(mem) mem.innerHTML=(s.members||[]).map(x=> '<span class="team-chip'+(s.self&&x.id===s.self.id?' me':'')+'">'+esc(x.name)+'</span>').join('') || '<span class="team-empty">just you — waiting for teammates to join…</span>';
  const cs=document.getElementById('teamCStatus');
  if(cs) cs.innerHTML = s.error ? '<span class="team-err">✕ '+esc(s.error)+'</span>'
                       : (s.connecting?'<span class="team-connecting">connecting…</span>':'');
}
function renderTeam(){
  const view=document.getElementById('teamView'); if(!view) return;
  const s=teamState||{connected:false};
  const mode = s.connected ? 'live' : 'connect';
  if(view.dataset.mode!==mode){
    view.dataset.mode=mode;
    view.innerHTML = mode==='live' ? liveHtml(s) : connectHtml(s);
    if(mode==='live') wireLive(); else wireConnect();
  }
  teamUpdateDynamic(s);
  const upd=document.getElementById('teamUpd');
  if(upd) upd.textContent = s.connected ? ('online · '+((s.members||[]).length)+' member(s)') : (s.connecting?'connecting…':'offline');
}
async function teamPoll(){
  let s; try{ s=await (await fetch('/api/team/status')).json(); }catch{ return; }
  teamState=s;
  const badge=document.getElementById('teamBadge');
  if(badge){ badge.textContent = s.connected ? ('●'+((s.members||[]).length||'')) : (s.connecting?'…':''); badge.className='badge'+(s.connected?' on':''); }
  // notify on a NEW incoming task (activity is newest-first; incoming tasks start with "from ")
  const inc=(s.activity||[]).filter(a=> a.kind==='task' && /^from /.test(a.text));
  const newestT = inc.length ? inc[0].t : null;
  if(teamSeenTaskT===null){ teamSeenTaskT=newestT; }
  else if(newestT && newestT>teamSeenTaskT){
    teamSeenTaskT=newestT;
    const who=(inc[0].text.match(/^from (.+?) →/)||[])[1]||'a teammate';
    toast('📥 New task from '+who);
    if(selected){ refreshTasks(selected); if(activeTab==='queue') loadQueue(selected); }
  }
  // A teammate's model arriving used to be invisible unless the Model tab was open.
  const rx=(s.activity||[]).filter(a=> a.kind==='model' && /^received /.test(a.text));
  const newestM = rx.length ? rx[0].t : null;
  if(teamSeenModelT===null){ teamSeenModelT=newestM; }
  else if(newestM && newestM>teamSeenModelT){
    teamSeenModelT=newestM;
    const who=(rx[0].text.match(/from (.+?) →/)||[])[1]||'a teammate';
    toast('⇪ '+who+' shared their model — see the Model tab');
    if(selected && activeTab==='model') loadModel(selected);   // pick up the new source
  }
  if(activeTab==='team') renderTeam();
}

document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ fsClose(); for(const id of ['ctxOverlay','addOverlay','taskOverlay','pvOverlay']){ const o=document.getElementById(id); if(o){ o.classList.remove('show'); o.innerHTML=''; } } } });

// ---------- boot ----------
// A shared view has no projects to list, no bridge to poll and no environment to ask
// about — every one of those calls would 404 on a page served from somewhere else.
async function loadChanges(force){
  const p = selected; if(!p) return null;
  if(!force && changesData && changesFor===p) return changesData;
  try{
    const r = await fetch('/api/changes?path='+encodeURIComponent(p));
    changesData = await r.json(); changesFor = p;
  }catch{ changesData=null; }
  return changesData;
}

const COL_LABEL = { todo:'todo', inprogress:'running', verify:'verify', done:'done' };












// Searching the model by name so a change can be described before a task exists.
const IMP_MAX_SEEDS = 14;

function kindWord(k, n){
  const w={entity:'object', function:'function', route:'endpoint', frontend:'screen',
    event:'event', statusFlow:'lifecycle', reaction:'rule', serverUnit:'unit', field:'field'}[k]||k;
  return n+' '+w+(n===1?'':'s');
}

const caHrs = (min)=>{
  if(!min) return '0<small>m</small>';
  if(min < 90) return Math.round(min)+'<small>m</small>';
  const h = min/60;
  return (h<10 ? h.toFixed(1) : Math.round(h))+'<small>h</small>';
};
// A change has two prices: what the first pass cost, and what everything after it
// cost. Almost every report adds them together and calls the total "the feature",
// which is exactly the number that cannot be acted on — you cannot decide anything
// about a sum whose halves behave differently.
const CUR = { USD:'$', EUR:'€', GBP:'£', RUB:'₽', PLN:'zł', UAH:'₴', KZT:'₸', GEL:'₾', TRY:'₺', INR:'₹' };
const caMoney = (min, rate, cur)=>{
  const v = (min/60)*rate;
  const s = CUR[cur]||'';
  const n = v >= 100000 ? Math.round(v/1000)+'k' : v >= 1000 ? (Math.round(v/100)/10)+'k' : Math.round(v);
  return s ? (s==='zł' ? n+' '+s : s+n) : n+' '+cur;
};
/**
 * The split bar. Cyan first, red after — the order the work happened in.
 *
 * `unknown` is for a change whose first pass the idle cutoff refused to measure:
 * its first half is not zero, it is unmeasured, and drawing that as a bar filled
 * end to end with rework would be a lie told in the most convincing form available.
 */
function caBar(first, after, cls, unknown){
  if(unknown) return '<div class="'+(cls||'pr-bar')+'"><i class="u" style="width:100%"></i></div>';
  const tot = Math.max(1, first+after);
  return '<div class="'+(cls||'pr-bar')+'"><i class="a" style="width:'+(first/tot*100).toFixed(1)+'%"></i>'
       + '<i class="b" style="width:'+(after/tot*100).toFixed(1)+'%"></i></div>';
}
/** True when the cutoff ate this change's first pass rather than it being zero. */
const caUnmeasured = (r)=> !r.firstPassMinutes && r.droppedGaps > 0;
const caPlain = (min)=> !min ? '0m' : (min<90 ? Math.round(min)+'m' : (min/60<10 ? (min/60).toFixed(1) : Math.round(min/60))+'h');

async function renderChangeAudit(view, m, seq){
  view.innerHTML = viewHead('audit') + '<div class="au-thin">Reading the queue…</div>';
  let d;
  try{
    const r = await fetch('/api/audit?path='+encodeURIComponent(selected)+'&days='+caDays+'&idle='+caIdle);
    d = await r.json();
  }catch(e){ d = {error:String(e&&e.message||e)}; }
  if(seq!==modelViewSeq) return;
  caData = d;

  let html = viewHead('audit');
  html += '<div class="au-bar">';
  for(const n of [7,30,90]) html += '<button class="epill'+(caDays===n?' on':'')+'" data-days="'+n+'">'+n+' days</button>';
  html += '<span style="flex:1"></span><span class="au-k">idle cutoff</span>';
  for(const n of [2,4,8]) html += '<button class="epill'+(caIdle===n?' on':'')+'" data-idle="'+n+'">'+n+'h</button>';
  html += '</div>';

  if(d.error){ view.innerHTML = html + '<div class="au-thin">Could not read the record: '+esc(d.error)+'</div>'; return; }

  const rows = d.rows||[];
  // Not enough data is said out loud. A pretty zero here would be the tool lying
  // about the one thing it exists to measure.
  // Nothing at all is its own screen: there is no bar to draw and no rule to explain.
  if(!rows.length){
    html += '<div class="au-thin">Nothing has moved through the queue in this window yet. '
      + 'The audit fills itself in as work happens — no setup, nothing to switch on.<br><br>'
      + 'What gets collected: every move a task makes between <code>todo → in progress → verify → done</code>, '
      + 'grouped by the <code>Change:</code> line on the task. Nothing else, and nothing about who did it.</div>'
      + caPrivacy(d);
    view.innerHTML = html;
    caBind(view, m, seq);
    return;
  }

  /*
   * Thin data used to hide the whole screen, and that was the wrong cut.
   *
   * The intent was right — do not put a confident number in front of somebody when
   * three changes went into it. But hiding the numbers also hid the bar, the hourly
   * rate, the rules the numbers are computed under, and the list of where they land.
   * A tester with two changes reported six features as missing, and was right to:
   * from the outside there is no difference between "not enough data to say" and
   * "this was never built".
   *
   * So the screen is the same screen. What thin data changes is the sentence at the
   * top, and that nothing can be sent onward — sending a two-change audit is the one
   * thing here that would actually mislead somebody.
   */
  const thin = rows.length < 4;
  if(thin){
    html += '<div class="st-hint" style="margin:0 0 16px"><b>Early numbers — '+rows.length+' change'
      + (rows.length===1?'':'s')+' so far.</b> Everything below is real and computed from your queue, '
      + 'but a handful of changes is a small sample: one long night or one awkward review moves these a lot. '
      + 'They settle as more work goes through. How much is enough depends on your work, and we do not claim a figure for it.</div>';
  }

  const cards = [
    ['First-pass ratio', Math.round((d.firstPassRatio||0)*100)+'<small>%</small>',
     'Changes that reached verify once and were accepted — no round trips.',
     'Of <b>'+d.changes+'</b> changes in the window, <b>'+rows.filter(r=>r.iterations===0&&r.reachedVerify).length+'</b> went through verify once. '
     + 'A change that never reached verify is not counted either way.'],
    ['After the first pass', caHrs(d.afterFirstPassMinutes),
     'Work done after review sent something back — from the moment it returned to the moment it landed. Zero when nothing came back.',
     'Summed across <b>'+d.changes+'</b> changes, from each one’s first entry into verify to its last settled done. '
     + 'Gaps longer than <b>'+d.idleCutoffHours+'h</b> are dropped — a change left overnight is not work.'],
    ['First pass', caHrs(d.firstPassMinutes),
     'Work up to the point something first came back from review — or all of it, when nothing did.',
     'From the first move into <b>in progress</b> to the first move into <b>verify</b>, per change, summed. Same idle cutoff.'],
    ['Iterations per change', (d.iterationsPerChange||0).toFixed(1),
     'How many times work came back from verify.',
     '<b>'+rows.reduce((s,r)=>s+r.iterations,0)+'</b> returns from verify across <b>'+d.changes+'</b> changes.'],
    ['Review cycles', String(d.reviewCycles||0),
     'Every entry into verify, first and repeat.',
     'Counted as moves into <b>verify</b>. A change reviewed three times contributes three.'],
    ['Late discoveries', String(d.lateDiscoveries||0),
     'Work that appeared only after the change had already been put up for review.',
     'Tasks whose first event is later than their change’s first verify — <b>'+d.lateDiscoveries+'</b> of them.'],
  ];
  html += caPriceBlock(d);
  html += '<div class="au-priv" style="margin:0 0 12px">Over <b>'+d.periodDays+' days</b>, <b>'+d.changes+'</b> change'+(d.changes===1?'':'s')+'. '
       +  'A change counts if it <i>started</i> inside the window, whole — one that began earlier is left out rather than measured from its middle. '
       +  'Within a change, a gap longer than the <b>'+d.idleCutoffHours+'h</b> cutoff is not counted as work'
       +  (d.droppedGaps
            ? ', which excluded <b>'+d.droppedGaps+' stretch'+(d.droppedGaps===1?'':'es')+'</b> worth '+caPlain(d.droppedMinutes)
              +  ' — a queue move cannot tell a night from a long unbroken sitting, so neither is counted. Widen the cutoff if your work runs in longer stretches.'
            // Nothing to drop means the buttons above genuinely change nothing, and
            // somebody clicking them and seeing the same number every time concludes
            // they are broken. Say which it is.
            : '. Nothing in this sample has a gap that long, so moving the cutoff does not change these numbers.')
       +  '</div>';
  html += '<div class="au-grid">';
  for(const [k,v,hint,from] of cards){
    html += '<details class="au-card"><summary><div class="au-k">'+esc(k)+'</div><div class="au-v">'+v+'</div>'
         +  '<div class="au-h">'+esc(hint)+'</div>'
         // A card that opens has to look like one. Without this the only clue was the
         // cursor, and a tester reported not knowing what to click.
         +  '<div class="au-more"><span class="chev"></span>what this was computed from</div></summary>'
         +  '<div class="au-from">'+from+'</div></details>';
  }
  html += '</div>';

  // By area, then by the things inside it. An area with a bad number is an argument;
  // the objects underneath it are the part somebody can act on.
  const tree = d.tree || { areas: [], objects: [] };
  if(tree.areas.length){
    html += '<div class="ov-sec">Where the rework concentrates</div><div class="au-rows">';
    for(const a of tree.areas.slice(0,10)){
      html += '<div class="au-row"><span>'+esc(a.name)+'</span>'
           +  '<span class="rwc">'+caBar(a.totalMinutes-a.minutes, a.minutes, 'pr-mini')
           +    '<b>'+(a.pct==null?'—':a.pct+'%')+'</b>'
           +    '<i>'+caPlain(a.minutes)+' of '+caPlain(a.totalMinutes)+' · '+a.changes+' change'+(a.changes===1?'':'s')+'</i>'
           +  '</span></div>';
    }
    html += '</div>';
  }
  if(tree.objects.length){
    html += '<details class="au-thin" style="max-width:none"><summary style="cursor:pointer">'
         +  'The parts inside them — '+tree.objects.length+' object'+(tree.objects.length===1?'':'s')+' that tasks named</summary>'
         +  '<div class="au-rows" style="margin-top:12px">';
    for(const o of tree.objects.slice(0,40)){
      html += '<div class="au-row"><span>'+esc(o.name)
           +  (o.together ? '<em class="rw-tog">always changed together</em>' : '')
           +  '</span>'
           +  '<span class="rwc">'+caBar(o.totalMinutes-o.minutes, o.minutes, 'pr-mini')
           +    '<b>'+(o.pct==null?'—':o.pct+'%')+'</b>'
           +    '<i>'+caPlain(o.minutes)+' of '+caPlain(o.totalMinutes)+'</i></span></div>';
    }
    html += '</div><div style="margin-top:10px">An object carries the rework of every change that named it in '
         +  '<code>Touches:</code> — a change\u2019s rework belongs to the change, and there is no honest way to split four '
         +  'hours of redoing between the three objects a task mentioned. Things that were never named apart share one row '
         +  'for exactly that reason: it is one measurement about all of them, not several identical ones. '
         +  'An area carries each change once, however many of its objects were named, which is why the areas do not add up '
         +  'to the project total and should not.</div></details>';
  }

  html += caRowsTable(rows, d.rate, d.currency);
  html += caPrivacy(d);
  html += '<div class="ov-sec">What to do with this</div>'
       +  '<div class="au-thin">Every change above carries two prices, and the red half is the one that moves. '
       +  'Read it per change to see which requests came back and why; read it by area to see where that concentrates. '
       +  'That is enough to act on it yourself — the record is yours, in your project, and nothing here is hidden behind us.<br><br>'
       +  'If you would rather not work it out alone: we build development systems that run at the lowest cost we can get them to, '
       +  'and we have spent years on the part that produces the red half. Send the audit and we will read it and write back '
       +  'about what, in our experience, actually shrinks — and what it takes.<br><br>'
       +  (thin
            ? '<button class="btn" disabled title="Not yet — a handful of changes is too thin to send anywhere">'
              + 'Discuss these results</button> <span style="color:var(--ink-3);font-size:13.5px">'
              + 'available once a few more changes have gone through — sending a two-change audit would waste your time and ours</span>'
            : '<button class="btn" id="au-send">Discuss these results</button>')
       +  '</div>'
       +  '<div id="au-form"></div>';

  view.innerHTML = html;
  caBind(view, m, seq);
}

function caRowsTable(rows, rate, cur){
  let h = '<div class="ov-sec">The changes these came from</div><div class="au-thin" style="max-width:none; overflow-x:auto">'
        + '<table class="au-tab"><tr><th>Change</th><th>Split</th><th>First pass</th><th>Rework</th>'
        + (rate?'<th>Rework cost</th>':'')+'<th>Returns</th><th>Reviews</th><th>Late</th><th>Settled</th></tr>';
  for(const r of rows.slice(0,40)){
    h += '<tr><td>'+esc(r.change)+'</td>'
      +  '<td style="width:110px" title="'+(caUnmeasured(r)?'The first pass here ran longer than the idle cutoff, so it was not measured — this is not a change that was all rework':'')+'">'
      +    caBar(r.firstPassMinutes, r.afterFirstPassMinutes, 'pr-mini', caUnmeasured(r))+'</td>'
      +  '<td>'+(caUnmeasured(r)?'<span style="color:var(--dim)">not measured</span>':caPlain(r.firstPassMinutes))+'</td>'
      +  '<td>'+caPlain(r.afterFirstPassMinutes)+'</td>'
      +  (rate?'<td style="color:#ff9b83">'+caMoney(r.afterFirstPassMinutes, rate, cur)+'</td>':'')
      +  '<td>'+r.iterations+'</td><td>'+r.reviewCycles+'</td><td>'+r.lateDiscoveries+'</td><td>'+(r.settled?'yes':'not yet')+'</td></tr>';
  }
  h += '</table>';
  if(rows.length>40) h += '<div style="margin-top:8px">Showing the 40 most recent of '+rows.length+'.</div>';
  return h + '</div>';
}

function caPrivacy(d){
  return '<div class="au-priv"><b>What this records.</b> Queue moves only: which task went to which column, when, and the '
    + '<code>Change:</code> it belongs to. The file is <code>.gitmir/audit/events.jsonl</code> in your project — it carries no name, '
    + 'no email and no machine, and the audit is cut by area of the model, never by person.<br>'
    + '<b>What leaves this machine.</b> Nothing, unless you press the button below and send it: then the numbers on this screen '
    + 'and the fields you type, shown in full before you send. Your code and your model stay here.'
    + (d.developers>1 ? '<br><b>'+d.developers+' people</b> committed to this repository in the window — counted from git at this moment, as a number only; no name is stored or sent.' : '')
    + '</div>';
}

function caBind(view, m, seq){
  view.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{ caDays=+b.dataset.days; renderChangeAudit(view,m,seq); }));
  view.querySelectorAll('[data-idle]').forEach(b=>b.addEventListener('click',()=>{ caIdle=+b.dataset.idle; renderChangeAudit(view,m,seq); }));
  const rateEl = view.querySelector('#pr-rate'), curEl = view.querySelector('#pr-cur');
  const saveRate = ()=>{
    const body = { path:selected, rate:Number(rateEl.value)||0, currency:curEl.value };
    fetch('/api/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(()=>renderChangeAudit(view, m, seq)).catch(()=>{});
  };
  if(rateEl){ rateEl.addEventListener('change', saveRate); curEl.addEventListener('change', saveRate); }
  const send = view.querySelector('#au-send');
  if(send) send.addEventListener('click',()=> caForm(view.querySelector('#au-form')));
}

// The form that sends the audit. Two rules it must not break: the person sees the
// exact bytes before they leave, and a failed send never eats what they typed.
function caForm(host){
  if(!host || !caData) return;
  if(host.dataset.open==='1'){ host.innerHTML=''; host.dataset.open='0'; return; }
  host.dataset.open='1';
  const opened = Date.now();
  host.innerHTML =
    '<div class="au-form">'
    + '<label class="au-k">Email <span style="color:#e0654e">·</span> required</label><input id="ca-email" type="email" autocomplete="email">'
    + '<label class="au-k">Name</label><input id="ca-name" autocomplete="name">'
    + '<label class="au-k">Company</label><input id="ca-co" autocomplete="organization">'
    + '<label class="au-k">Anything you want us to look at</label><textarea id="ca-note"></textarea>'
    + '<input class="au-hp" id="ca-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
    + (caData.rate ? '<label style="display:flex;gap:8px;align-items:center;color:var(--dim);font-size:12.5px">'
        + '<input type="checkbox" id="ca-rate" checked> Include your hourly rate ('+caMoney(60, caData.rate, caData.currency)+'/h) so we can talk in money rather than hours'
        + '</label>' : '')
    + '<div class="au-k">Exactly what gets sent</div><div class="au-pay" id="ca-pay"></div>'
    + '<div class="au-err" id="ca-err" style="display:none"></div>'
    + '<div style="display:flex; gap:8px"><button class="btn" id="ca-go">Send</button>'
    + '<button class="btn ghost" id="ca-x">Cancel</button></div>'
    + '</div>';

  const payload = ()=> ({
    kind: 'audit',
    email: (host.querySelector('#ca-email').value||'').trim(),
    name: (host.querySelector('#ca-name').value||'').trim() || undefined,
    company: (host.querySelector('#ca-co').value||'').trim() || undefined,
    note: (host.querySelector('#ca-note').value||'').trim() || undefined,
    hp: host.querySelector('#ca-hp').value || '',
    ms: Date.now()-opened,
    audit: {
      periodDays: caData.periodDays, changes: caData.changes,
      developers: caData.developers,   // undefined when this is not a git checkout — the key drops out
      firstPassRatio: Math.round((caData.firstPassRatio||0)*1000)/1000,
      firstPassMinutes: Math.round(caData.firstPassMinutes||0),
      afterFirstPassMinutes: Math.round(caData.afterFirstPassMinutes||0),
      iterationsPerChange: Math.round((caData.iterationsPerChange||0)*100)/100,
      reviewCycles: caData.reviewCycles, lateDiscoveries: caData.lateDiscoveries,
      idleCutoffHours: caData.idleCutoffHours,
      // Only when the box above is ticked. A blended rate is the sender's own
      // business data, and it goes out because they chose it, not because we set a
      // default that reads well for us.
      ...(caData.rate && host.querySelector('#ca-rate') && host.querySelector('#ca-rate').checked
          ? { hourlyRate: caData.rate, currency: caData.currency,
              reworkCost: Math.round((caData.afterFirstPassMinutes/60)*caData.rate) }
          : {}),
      areas: (caData.areas||[]).slice(0,10).map(a=>({ area:a.area, afterFirstPassMinutes:Math.round(a.afterFirstPassMinutes) })),
    },
    gitmir: { version: caData.version||'', generatedAt: new Date().toISOString() },
  });
  const paint = ()=>{ host.querySelector('#ca-pay').textContent = JSON.stringify(payload(), null, 2); };
  paint();
  host.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input', paint));
  host.querySelectorAll('input[type=checkbox]').forEach(el=>el.addEventListener('change', paint));

  host.querySelector('#ca-x').addEventListener('click', ()=>{ host.innerHTML=''; host.dataset.open='0'; });
  host.querySelector('#ca-go').addEventListener('click', async ()=>{
    const err = host.querySelector('#ca-err'), go = host.querySelector('#ca-go');
    const body = payload();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)){
      err.style.display='block'; err.textContent='An email address is needed — it is where the answer goes.'; return;
    }
    err.style.display='none'; go.disabled=true; go.textContent='Sending…';
    let out;
    try{
      // Sent from the local server, not the browser: the endpoint scores a request
      // with no Origin as suspicious, and the browser cannot set one cross-site.
      const r = await fetch('/api/audit-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      out = await r.json();
      if(!r.ok || !out.ok) throw new Error(out.error||('HTTP '+r.status));
    }catch(e){
      go.disabled=false; go.textContent='Send';
      err.style.display='block';
      err.textContent = 'It did not go through: '+(e&&e.message||e)+'. Nothing you typed was lost — press Send again.';
      return;
    }
    host.innerHTML = '<div class="au-thin"><b>The results are with us.</b><br><br>'
      + 'We will look at where your time concentrates and write to <b>'+esc(body.email)+'</b> — with what, in our experience, '
      + 'actually shortens, and what it takes. Usually within a working day.<br><br>'
      + 'We received nothing from your code.</div>';
    host.dataset.open='0';
  });
}


// The headline: what this period cost, split at the moment somebody first said the
// work was ready for review. Money only appears once a rate is given — a default
// rate would be the only number on this screen nobody could check.
function caPriceBlock(d){
  const fp = d.firstPassMinutes||0, af = d.afterFirstPassMinutes||0, tot = fp+af;
  const rate = d.rate||0, cur = d.currency||'USD';
  const pct = tot ? Math.round(af/tot*100) : 0;
  let h = '<div class="pr-wrap">';
  h += '<div class="pr-top">'
    +  '<div class="pr-sum">'+(rate ? caMoney(tot, rate, cur) : caPlain(tot))+'</div>'
    +  '<div class="pr-sub">'+(rate
         ? 'What <b>'+d.changes+'</b> change'+(d.changes===1?'':'s')+' cost over '+d.periodDays+' days, at '+caMoney(60, rate, cur)+'/h. '
           + '<b style="color:#ff9b83">'+caMoney(af, rate, cur)+'</b> of it — '+pct+'% — went on rework: work done again after review sent it back.'
         : 'Measured time for <b>'+d.changes+'</b> change'+(d.changes===1?'':'s')+'. <b>'+pct+'%</b> of it went on rework — work done again after review sent it back. '
           + 'Add an hourly rate below to read that in money.')
    +  '</div></div>';
  h += caBar(fp, af);
  h += '<div class="pr-key">'
    +  '<span class="k1"><i class="dot"></i>First pass <b>'+caPlain(fp)+(rate?' · '+caMoney(fp, rate, cur):'')+'</b></span>'
    +  '<span class="k2"><i class="dot"></i>Rework <b>'+caPlain(af)+(rate?' · '+caMoney(af, rate, cur):'')+'</b></span>'
    +  '</div>';
  h += '<div class="pr-rate"><span class="au-k">Hourly rate</span>'
    +  '<input id="pr-rate" type="number" min="0" step="1" value="'+(rate||'')+'" placeholder="0">'
    +  '<select id="pr-cur">'+Object.keys(CUR).map(c=>'<option'+(c===cur?' selected':'')+'>'+c+'</option>').join('')+'</select>'
    +  '<span class="h">Blended cost of an engineering hour. Stays on this machine — it is not written into your repository.</span>'
    +  '</div>';
  // The honest sentence. Priced measured time is not an invoice, and the difference
  // is where a number like this normally gets torn apart in the room.
  h += '<div class="au-priv" style="margin:10px 0 0">This prices the time this screen measured — time between queue moves, minus gaps longer than the '
    +  '<b>'+d.idleCutoffHours+'h</b> cutoff. It is not an invoice and not everyone’s salary: it is what the measured work would cost at the rate you gave.</div>';
  return h + '</div>';
}

/* ---------------------------------------------------------------------------
 * Getting started.
 *
 * Everything this tool does is made out of one thing: a map of what the product
 * is. Without it, every screen is an empty diagram — so until it exists we show
 * one screen at a time and nothing else at all. Not to be strict: an empty maze
 * is harder than a single door.
 *
 * The words here are for somebody who has never heard of an object model, has
 * not read the README, and is deciding in the next thirty seconds whether this
 * was worth installing.
 * ------------------------------------------------------------------------ */
let stepData = null, stepPoll = null;
// Set when somebody says they have run the command. It only skips the waiting
// screen — it never claims the connection works, because we still do not know.
let stepSkipWait = false;

// What arrives when the map does. Written as what you get, not as what it is.
const UNLOCKS = [
  ['Ask about your own product',
   '“What happens if I change the price?” — answered from your product, not guessed. You get a real answer, with the parts it touches.'],
  ['See what a change breaks — before it is written',
   'Point at anything and see what depends on it, in both directions. The expensive surprises are the ones nobody thought to look for.'],
  ['Your AI stops guessing',
   'It gets the exact slice of the product it needs, with the rules it must not break. Less reading, fewer wrong turns, cheaper answers.'],
  ['Catch where the code stopped matching the plan',
   'The place your product quietly does something else than what you promised. Found and written down, not argued about.'],
  ['Turn drawings into work',
   'Sketch what you want on the map. It becomes tasks. Afterwards you can see how much of what you drew actually got built.'],
  ['See what each change really cost',
   'Every request has two prices: doing it, and doing it again. The second one is the one you can shrink.'],
];

function stepRail(step){
  // Step two connects the laboratory; nothing is made here. The rail is the one line
  // that says what the screen it sits on is for, so it says the same thing.
  const names = ['Connect your assistant', 'Connect the laboratory', 'Everything else'];
  let h = '<div class="st-rail">';
  names.forEach((n,i)=>{
    const k = i+1;
    h += (i?'<i class="ln"></i>':'')
      +  '<div class="s '+(k<step?'ok':k===step?'on':'')+'"><b>'+(k<step?'✓':k)+'</b>'+esc(n)+'</div>';
  });
  return h+'</div>';
}

async function loadSteps(pathStr){
  try{ stepData = await (await fetch('/api/steps?path='+encodeURIComponent(pathStr))).json(); }
  catch{ stepData = null; }
  return stepData;
}

/** True while the project has no map — the whole product stays folded away. */
// Locked until proven otherwise: with no answer yet, offer the two screens that are
// always safe rather than a row of tabs that may be about to disappear.
const locked = ()=> !stepData || !stepData.ok || stepData.step < 3;

function renderSteps(view, pathStr, d){
  clearInterval(stepPoll);
  let h = '<div class="st-wrap">' + stepRail(d.step);

  if(d.step === 1){
    h += '<h2 class="st-h">First, let your assistant talk to GitMir</h2>'
      +  '<p class="st-p">GitMir does not write your code. It keeps a map of what your product is, and hands the right piece of it '
      +  'to whoever is working — you, or your AI assistant. Pick how they should talk to each other. You can change this later.</p>'
      +  '<div class="st-pick">'
      +  '<div class="st-card pick" data-mode="mcp">'
      +    '<div class="tag">Recommended · one command</div>'
      +    '<h4>Connect it once, and forget it</h4>'
      +    '<p>Your assistant gets everything by itself — the map, the instructions, all of it. You never copy or paste anything again.</p>'
      +    '<button class="run go">Show me the command</button>'
      +  '</div>'
      +  '<div class="st-card pick" data-mode="skills">'
      +    '<div class="tag">Works anywhere</div>'
      +    '<h4>I will copy and paste</h4>'
      +    '<p>Nothing to set up. You copy a short instruction from this app and paste it into your chat when you need it. '
      +    'Slower, but it works with any assistant.</p>'
      +    '<button class="ghost go">Use this way</button>'
      +  '</div></div>'
      +  '<div class="st-note">Not sure? Take the first one. If it does not work in your editor, the second one always does.</div>';
  }

  else if(d.step === 2 && d.mode === 'mcp' && !d.agentSeen && !stepSkipWait){
    // Chosen the connected route, nothing has come through yet. Two moves, and the
    // second one is the one everybody skips, so it gets a card of its own.
    // The very first screen offered one command, for one product, with nothing to
    // say the other was possible. Somebody who works in Codex met an instruction for
    // a program they do not have, on the step whose whole job is getting them in.
    const dir = window.__GITMIR_DIR__ || window.__GITMIR_HOME__ || '';
    const qq = s => '"'+String(s).replace(/"/g,'\\"')+'"';
    const codexNow = agentPick() === 'codex';
    const cmd = codexNow
      ? (window.__GITMIR_CLI__ ? 'gitmir mcp add --codex'
        // Codex has no scope, so the registration names the project — see the MCP panel.
        : 'codex mcp add gitmir -- node '+qq(dir+'/mcp.ts')+' --project '+qq(pathStr))
      : (window.__GITMIR_CLI__ ? 'gitmir mcp add'
        : 'claude mcp add -s user gitmir -- node '+qq(dir+'/mcp.ts'));
    h += '<h2 class="st-h">Two moves and your assistant is connected</h2>'
      +  '<p class="st-p">Registering the server asks nothing of you — no account, no password, and nothing '
      +  'leaves your computer: it writes one line into your assistant\'s config. The map itself is read from '
      +  'the laboratory, with a key you set in the next step. It takes about ten seconds.</p>'
      +  '<div class="st-agent"><span class="st-agent-l">Which assistant</span>'+agentRadios('')+'</div>'
      +  '<div class="st-do">'
      +  '<div class="st-do-c one"><div class="num">1</div>'
      +    '<h5>Run this one line</h5>'
      +    '<div class="st-cmd"><span>'+esc(cmd)+'</span></div>'
      +    '<div class="act"><button class="run big-btn" data-copy="'+esc(cmd)+'">Copy the line</button></div></div>'
      +  '<div class="st-do-c two"><div class="num">2</div>'
      +    '<h5>Close your editor and open it again</h5>'
      +    '<p>It only looks for new tools when it starts up. <b>This is the step everyone skips</b>, and then thinks '
      +    'nothing happened.</p>'
      +    '<div class="act"><button class="ghost big-btn" data-skip="1">Done both — next step</button></div></div>'
      +  '<div class="st-do-c three wait"><div class="num">3</div>'
      +    '<h5>We notice by ourselves</h5>'
      +    '<p>As soon as your assistant asks us anything, this page moves on. You do not have to tell us.'
      +    (codexNow ? ' Codex has no MCP prompts, so the eight skills arrive as tools rather than slash '
                     + 'commands — ask it to list them, or let it call <code>gitmir_skills</code> itself.' : '')+'</p>'
      +    '<div class="act"><div class="st-wait"><i class="st-dot"></i>Listening…</div></div></div>'
      +  '</div>'
      +  '<div class="st-note">Rather not connect anything? '
      +  '<button class="st-back" data-mode="skills">Copy and paste instead — works with any assistant</button></div>';
  }

  else {
    // The last thing between somebody and the product is connecting the laboratory —
    // not building anything here.
    //
    // This screen used to say "open your agent in this folder and tell it to build the
    // GitMir model", promise that the map lands in a folder inside the project, and wait
    // for map files to appear. Nothing here builds a model, no such folder is written,
    // and step three only ever arrives with a key — so the one screen whose job is to end
    // could not end. It now asks for the only thing that actually moves it on.
    const L = d.laboratory || {};
    const keys   = L.keys   || 'https://lab.gitmir.com/account/access';
    const signUp = L.signUp || 'https://lab.gitmir.com/signup';
    const setKey = 'export GITMIR_LAB_KEY=your-key-here';
    const brief  = d.brief || '';

    h += '<div class="st-mid">'
      +  '<div class="big">Now connect the laboratory</div>'
      +  '<p>The map of your product — its parts, what they do, and what a change would reach — is built and '
      +  'kept at <b>lab.gitmir.com</b> from the code in this repository. It is not built on this machine and '
      +  'nothing about it is written into this folder. The dashboard reads it with a key, and so does your '
      +  'assistant. Everything that does not need the map — the task queue, the findings, the audits — has been '
      +  'working all along without one.</p></div>';

    h += '<div class="st-do">';

    h += '<div class="st-do-c one"><div class="num">1</div>'
      +    '<h5>Get a key</h5>'
      +    '<p>Sign in to the laboratory and open your access page. It is the same key your assistant uses '
      +    'through MCP, so this is done once for both.</p>'
      // Links, not buttons: they open the laboratory in another tab. The button classes
      // are class-scoped, so they style an <a> too — the two properties a browser gives a
      // link and not a button are the ones set here.
      +    '<div class="act two">'
      +      '<a class="run big-btn" style="justify-content:center;text-decoration:none" '
      +        'href="'+esc(keys)+'" target="_blank" rel="noopener">Open my access page</a>'
      +      '<a class="ghost big-btn" style="display:inline-flex;justify-content:center;text-decoration:none" '
      +        'href="'+esc(signUp)+'" target="_blank" rel="noopener">I have no account yet</a>'
      +    '</div></div>';

    h += '<div class="st-do-c two"><div class="num">2</div>'
      +    '<h5>Set it as GITMIR_LAB_KEY</h5>'
      +    '<p>In the environment this dashboard is started from — your shell profile, or the terminal you '
      +    'launch it in. We never write it to disk ourselves.</p>'
      +    '<div class="st-cmd"><span>'+esc(setKey)+'</span></div>'
      +    '<div class="act"><button class="run big-btn" data-copy="'+esc(setKey)+'">Copy the line</button></div></div>';

    h += '<div class="st-do-c three wait"><div class="num">3</div>'
      +    '<h5>Start the dashboard again</h5>'
      +    '<p>The key is read once, when the server starts, so a page already open cannot see one that arrived '
      +    'after it. Close this dashboard, start it again, and open this project.</p>'
      +    '<div class="act"><div class="st-wait"><i class="st-dot"></i>No key yet</div></div></div>';

    h += '</div>';

    // An empty folder is the one case where the laboratory has nothing to read. What gets
    // written here is a plain file in the repository, read along with the code — the map
    // is still made there, not here.
    if(!d.hasCode && !brief){
      h += '<div class="st-hint"><b>This folder is empty, so there is nothing to read yet.</b> '
        +  'Write a few sentences about what you are building: who uses it, what they do with it, what it has '
        +  'to get right. It is saved into the repository as a plain file and read along with the code.'
        +  '<textarea class="st-ta" id="st-brief" placeholder="A booking site for a small hotel. Guests pick dates and a room, pay a deposit, and get a confirmation. The owner sees the day’s arrivals and can block dates while a room is being repaired."></textarea>'
        +  '<div class="act"><button class="run big-btn" id="st-save">Save it into the project</button></div></div>';
    }

    // An assistant that stopped to ask something is the one state a person cannot see from
    // here, and the one that strands them. It has nothing to do with the map.
    if(d.progress && d.progress.stage === 'blocked'){
      h += '<div class="st-hint"><b>Your assistant is waiting on you</b> — it asked a question in the chat and '
        +  'stopped. Go and answer it; it carries on the moment you do.'
        +  (d.progress.note ? '<br><br>It asked: <b>'+esc(d.progress.note)+'</b>' : '')
        +  '</div>';
    }

    h += '<div class="st-note">Prefer to work by copying and pasting? '
      +  '<button class="st-back" data-go="skill">Open the full instruction</button>'
      +  '<br><br>Nothing about your code is copied into this folder, and the map never lands here: it is read '
      +  'from the laboratory when a screen or your assistant asks for it.</div>';

    h += '<div class="st-un"><div class="st-un-h">And this is what opens up the second it is here</div><div class="st-un-g">';
    for(const [t2,s] of UNLOCKS) h += '<div class="st-un-i"><b>'+esc(t2)+'</b><span>'+esc(s)+'</span></div>';
    h += '</div></div>';
  }

  h += '</div>';
  view.innerHTML = h;

  view.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click', async ()=>{
    try{ await copyToClipboard(b.dataset.copy); toast('Copied ✓'); }catch(e){ toast('Copy failed', true); }
  }));
  const saveBtn = view.querySelector('#st-save');
  if(saveBtn) saveBtn.addEventListener('click', async ()=>{
    const ta = view.querySelector('#st-brief'), text = (ta.value||'').trim();
    if(text.length < 20){ toast('A few more words — a couple of sentences is enough', true); ta.focus(); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    let d2 = null;
    try{
      d2 = await (await fetch('/api/brief',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ path:pathStr, text })})).json();
    }catch(e){ d2 = { error:String(e&&e.message||e) }; }
    saveBtn.disabled = false; saveBtn.textContent = 'Save it into the project';
    if(!d2 || !d2.ok){ toast('Could not save it: '+((d2&&d2.error)||'unknown'), true); return; }
    toast('Saved as '+d2.file+' — the laboratory reads it with the rest of the repository');
    renderHome(pathStr);
  });
  // Waiting for a hello that may never come is a dead end: an assistant that never
  // needs a GitMir tool never says one. The way forward must not depend on it.
  wireAgentPick(view, ()=>renderHome(pathStr));
  view.querySelectorAll('[data-skip]').forEach(b=>b.addEventListener('click', ()=>{
    stepSkipWait = true; renderHome(pathStr);
  }));
  view.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click', async ()=>{
    await fetch('/api/update',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ path:pathStr, mode:b.dataset.mode })}).catch(()=>{});
    renderHome(pathStr);
  }));
  view.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{
    setTab('settings'); setupSub = b.dataset.go==='mcp' ? 'mcp' : 'skills'; renderDetail();
  }));

  // The two waiting screens end by themselves. Polling is the honest thing here:
  // the person is told nothing needs refreshing, so nothing may need refreshing.
  if(d.step < 3){
    // Everything the screen shows has to be in this signature, or the screen does not
    // change when it changes. It used to compare the step alone, which is why an agent
    // could report four stages in a row into a page that never redrew — the exact
    // "nothing happens" people reported.
    // `modelFiles` stood in this list and in the checklist above it. Nothing has ever sent
    // that field: a map is not made of files here. Whether a laboratory is connected is the
    // fact this screen now turns on, so that is what it watches.
    const sig = (x)=> !x ? '' : [x.step, x.agentSeen, x.queue, !!(x.laboratory && x.laboratory.connected), x.brief,
      x.progress && x.progress.stage, x.progress && x.progress.note, x.progress && x.progress.stale].join('|');
    stepPoll = setInterval(async ()=>{
      if(selected !== pathStr || activeTab !== 'home'){ clearInterval(stepPoll); return; }
      if(document.hidden) return;   // a background tab is nobody watching
      const before = sig(d);
      const n = await loadSteps(pathStr);
      if(!n || !n.ok) return;
      if(sig(n) !== before){
        clearInterval(stepPoll);
        // The one moment in this product worth marking. Somebody just did the thing
        // that makes everything else exist; saying so costs nothing and lands.
        if(n.step === 3) toast('The laboratory is connected — everything just opened up');
        else if(n.agentSeen && !d.agentSeen) toast('Your assistant said hello. Connected.');
        else if(n.progress && n.progress.stage === 'blocked'
                && !(d.progress && d.progress.stage === 'blocked')) toast('Your assistant is asking you something');
        renderHome(pathStr);
      }
    }, 3000);
  }
}
