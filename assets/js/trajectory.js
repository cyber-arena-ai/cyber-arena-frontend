// Trajectory (single match) — chat thread + Sublime-style minimap
import { loadJSON, loadHarnesses, fmtTime, esc, setActiveNav, api } from './util.js';

setActiveNav('trajectory.html');

const params = new URLSearchParams(location.search);
let runId = params.get('run');

// "Random Match": no ?run given -> pick a random match from the run list
if(!runId){
  try {
    const pool = (await loadJSON(api('/api/runs'))).runs || [];
    if(pool.length) runId = pool[Math.floor(Math.random() * pool.length)].id;
  } catch { /* fall through to the message below */ }
}
if(!runId){
  document.getElementById('chat').innerHTML =
    '<p style="padding:20px">No matches available yet.</p>';
  throw new Error('no run to display');
}

const [D, H] = await Promise.all([loadJSON(api(`/api/runs/${runId}/trajectory`)), loadHarnesses()]);
const t1 = D.teams.team1, t2 = D.teams.team2;

// resolve each team to its harness and theme the page with its color
const HH = { team1: H.get(t1.model), team2: H.get(t2.model) };
const wrap = document.querySelector('.wrap');
wrap.style.setProperty('--t1', HH.team1.color);
wrap.style.setProperty('--t2', HH.team2.color);

/* ---- headline + scoreboard ---- */
const wlabel = D.winner === 'team1' ? t1.label : t2.label;
const llabel = D.winner === 'team1' ? t2.label : t1.label;
const wpts = Math.max(D.score.team1, D.score.team2);
const lpts = Math.min(D.score.team1, D.score.team2);

document.getElementById('mastcat').textContent = D.category;
document.getElementById('mastname').textContent = D.name;
document.getElementById('dateline').textContent = D.date;

// winner is null while a match is live — show a "live · X vs Y" headline then
const leader = D.score.team1 === D.score.team2 ? null
  : (D.score.team1 > D.score.team2 ? 'team1' : 'team2');
if(!D.winner){
  const lead = leader ? HH[leader].color : HH.team1.color;
  document.getElementById('hl').innerHTML =
    `<mark style="background:${lead}">LIVE</mark> ${t1.label} <em>vs</em> ${t2.label} · ${D.score.team1}–${D.score.team2}`;
} else if(D.winner === 'draw'){
  document.getElementById('hl').innerHTML =
    `<mark style="background:${HH.team1.color}">${t1.label}</mark> and <em>${t2.label}</em> draw ${D.score.team1}–${D.score.team2}`;
} else {
  document.getElementById('hl').innerHTML =
    `<mark style="background:${HH[D.winner].color}">${wlabel}</mark> def. <em>${llabel}</em> · ${wpts}–${lpts}`;
}
document.getElementById('byline').textContent =
  `${D.rounds}-round attack-and-defense · ${D.category}. ${D.challenge}`;
document.getElementById('colophon').textContent = `CyberArena 2026 · ${D.date}`;

function side(team, key, cls){
  const w = D.winner === key;
  return `<div class="side ${cls} ${w?'win':''}">
    ${w?'<div class="stampwin">Winner</div>':''}
    <div class="nm">${team.label}</div><div class="md">${team.model}</div>
    <div class="pts">${D.score[key]}</div>
    <div class="br">⚑ ${D.attack_flags[key]} captured · ${D.defense_patches[key]} patched</div></div>`;
}
refreshBoard();  // initial scoreboard paint (same renderer live updates use)

/* ---- per-team time budget (thinking / tool exec / idle+untracked) ---- */
const M = D.metrics, mhost = document.getElementById('metrics');
if(mhost && M){
  const mrow = (key, team) => {
    const m = M[key]; if(!m) return '';
    const w = m.wall_s || 1;
    const seg = (cls,v,lbl) => v>0
      ? `<span class="mseg ${cls}" style="width:${100*v/w}%" title="${lbl} ${fmtTime(v)}">${100*v/w>=9?lbl:''}</span>` : '';
    return `<div class="mrow"><div class="mlbl" style="color:${HH[key].color}">${team.label}</div>`
      + `<div class="mbar">${seg('mt-think',m.think_s,'think')}${seg('mt-tool',m.tool_s,'tool')}${seg('mt-un',m.untrack_s,'idle')}</div>`
      + `<div class="mnum">🧠 ${fmtTime(m.think_s)}${m.overlap?'*':''} · ⚙ ${fmtTime(m.tool_s)} · ⏸ ${fmtTime(m.untrack_s)} · ${m.out_tok.toLocaleString()} tok @ ${m.tok_per_s} tok/s</div></div>`;
  };
  mhost.innerHTML = `<div class="mhead">Time budget · <b class="mt-think-t">thinking</b> / <b class="mt-tool-t">tool exec</b> / <b class="mt-un-t">idle+untracked</b>`
    + `<span class="msub">thinking = Σ model-inference latency · tool = Σ tool exec · wall = game duration${Object.values(M).some(m=>m.overlap)?' · *concurrent API calls overlap wall':''}</span></div>`
    + mrow('team1',t1) + mrow('team2',t2);
}

/* ---- chat thread ---- */
// act-kind -> label; the backend uses an open set (bash/mcp/web/tool/…), so
// unknown kinds get a generic label rather than being mislabeled as a search
const ACT_LABELS = { bash: '$ shell', mcp: '⚙ cyberarena tool', web: '⌕ web search' };
function actChip(a){
  const lbl = ACT_LABELS[a.k] || `⚙ ${a.k}`;
  const txt = a.k==='mcp' ? a.x + '()' : a.x;
  return `<div class="act ${a.k}"><span class="al">${lbl}</span><code>${esc(txt)}</code></div>`;
}
function bubble(turn){
  const team = D.teams[turn.team], pos = turn.team==='team1' ? 'left' : 'right';
  const think = turn.think ? `<div class="think">${esc(turn.think)}</div>` : '';
  const acts = turn.acts.length ? `<div class="acts">${turn.acts.map(actChip).join('')}</div>` : '';
  return `<div class="msg ${pos} ${turn.team}" data-kind="turn" data-has-think="${turn.think?1:0}"
            data-mm-type="turn" data-mm-team="${turn.team}">
    <div class="ava">${HH[turn.team].shortName}</div>
    <div class="bub"><div class="bh"><span class="who">${team.label}</span><span class="tm">${fmtTime(turn.t)}</span></div>${think}${acts}</div>
  </div>`;
}
function sysMsg(e){
  const who = e.by==='team1' ? t1.label : t2.label;
  const victim = e.victim==='team1' ? t1.label : t2.label;
  if(e.k==='steal'){
    if(e.reason==='DUPLICATE')
      return `<div class="sys dup" data-kind="event" data-mm-type="dup" data-mm-team="${e.by}">${who} re-submitted a stolen flag — duplicate, no points · ${fmtTime(e.t)}</div>`;
    return `<div class="sys steal ${e.by}" data-kind="event" data-mm-type="capture" data-mm-team="${e.by}"
              title="${fmtTime(e.t)} — ${who} captured ${victim}'s flag">
              <b>⚑ ${who}</b> captured <b>${victim}'s</b> flag<span class="tm">${fmtTime(e.t)} · +1 flag</span></div>`;
  }
  return `<div class="patchwrap" data-kind="event" data-mm-type="patch" data-mm-team="${e.by}" title="${fmtTime(e.t)} — ${who} patched">
            <span class="sys patch">⟳ ${who} patched the service · ${fmtTime(e.t)}</span></div>`;
}

const rstarts = Object.entries(D.round_starts)
  .map(([r,t]) => ({ r:+r, t })).sort((a,b)=>a.t-b.t);

let ri = 0;
function renderItem(item){
  let h = '';
  while(ri < rstarts.length && item.t >= rstarts[ri].t){
    h += `<div class="day" data-mm-type="round" data-mm-label="R${rstarts[ri].r}"><span>◆ Round ${rstarts[ri].r} · ${fmtTime(rstarts[ri].t)}</span></div>`;
    ri++;
  }
  return h + (item.kind==='event' ? sysMsg(item) : bubble(item));
}
const chat = document.getElementById('chat');
chat.innerHTML = D.feed.map(renderItem).join('');

/* ---- per-team minimaps ---- */
document.getElementById('mmh1').textContent = HH.team1.shortName;
document.getElementById('mmh1').title = t1.label;
document.getElementById('mmh2').textContent = HH.team2.shortName;
document.getElementById('mmh2').title = t2.label;

document.getElementById('mmlegend').innerHTML = `
  <span><i class="s" style="background:${HH.team1.color};border-color:var(--ink)"></i>${t1.label} capture</span>
  <span><i class="s" style="background:${HH.team2.color};border-color:var(--ink)"></i>${t2.label} capture</span>
  <span><i class="s g"></i>service patch</span>
  <span><i class="s d"></i>duplicate</span>
  <span><i class="s" style="border:0;border-top:2px solid #c3b9a3;width:14px;height:0"></i>round start</span>`;

const minimaps = [...document.querySelectorAll('.minimap')];

function buildMinimaps(){
  const scrollH = chat.scrollHeight || 1;
  minimaps.forEach(mini => {
    const team = mini.dataset.team;
    const marks = mini.querySelector('.marks');
    marks.innerHTML = '';
    [...chat.children].forEach(el => {
      if(el.style.display === 'none') return;
      const type = el.dataset.mmType;
      if(!type) return;
      // round markers appear in both columns; everything else only in its team's column
      if(type !== 'round' && el.dataset.mmTeam !== team) return;
      const top = (el.offsetTop + el.offsetHeight/2) / scrollH * 100;
      const m = document.createElement('div');
      m.className = 'mk ' + type;
      m.style.top = top + '%';
      if(el.title) m.title = el.title;
      marks.appendChild(m);
    });
  });
  updateView();
}
function updateView(){
  const scrollH = chat.scrollHeight || 1, vis = chat.clientHeight;
  document.querySelectorAll('.mm-view').forEach(v => {
    v.style.height = (vis / scrollH * 100) + '%';
    v.style.top = (chat.scrollTop / scrollH * 100) + '%';
  });
}
function scrubTo(body, clientY){
  const rect = body.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  chat.scrollTop = ratio * chat.scrollHeight - chat.clientHeight / 2;
}
let dragBody = null;
minimaps.forEach(mini => {
  const body = mini.querySelector('.mm-body');
  body.addEventListener('mousedown', e => { dragBody = body; scrubTo(body, e.clientY); e.preventDefault(); });
});
window.addEventListener('mousemove', e => { if(dragBody) scrubTo(dragBody, e.clientY); });
window.addEventListener('mouseup', () => { dragBody = null; });
chat.addEventListener('scroll', updateView);
window.addEventListener('resize', buildMinimaps);

buildMinimaps();
// re-measure once web fonts settle (layout heights shift as they load)
if(document.fonts && document.fonts.ready) document.fonts.ready.then(buildMinimaps);
window.addEventListener('load', buildMinimaps);

/* ---- filters ---- */
document.querySelectorAll('.filt button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.filt button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const f = b.dataset.f;
  chat.querySelectorAll('[data-kind="turn"]').forEach(el => {
    let show = true;
    if(f === 'event') show = false;
    else if(f === 'think') show = el.dataset.hasThink === '1';
    el.style.display = show ? '' : 'none';
    el.querySelectorAll('.acts').forEach(a => a.style.display = (f === 'think') ? 'none' : '');
  });
  chat.querySelectorAll('[data-kind="event"]').forEach(el => {
    el.style.display = (f === 'think') ? 'none' : '';
  });
  buildMinimaps();
});

/* ---- status badge ---- */
function statusBadge(){
  const el = document.getElementById('mastcat');
  const s = D.status;
  const chip = s === 'running' ? '<span class="live-chip">● LIVE</span>'
    : s === 'failed' ? '<span class="fail-chip">failed</span>' : '';
  el.innerHTML = `${D.category || ''} ${chip}`;
}
statusBadge();

/* ---- rebuild scoreboard/headline (used by live updates) ---- */
function refreshBoard(){
  document.getElementById('board').innerHTML =
    side(t1,'team1','t1') + `<div class="mid">vs</div>` + side(t2,'team2','t2');
}

/* ---- live streaming (in-flight matches) ---- */
if(D.status === 'running'){
  // ?since = what we already rendered, so the stream sends only NEW turns
  const es = new EventSource(api(`/api/runs/${runId}/stream?since=${D.feed.length}`));
  let rebuildTimer = null;
  const scheduleRebuild = () => {           // coalesce a burst of appends into one rebuild
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(buildMinimaps, 120);
  };
  // only stick to the bottom if the viewer is already there — never yank them
  // away from something they've scrolled up to read
  const nearBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
  es.addEventListener('feed', ev => {
    const item = JSON.parse(ev.data);
    const follow = nearBottom();
    chat.insertAdjacentHTML('beforeend', renderItem(item));
    const added = chat.lastElementChild;
    if(added) added.classList.add('fresh');   // brief highlight so new turns are visible
    D.feed.push(item);
    if(follow) chat.scrollTop = chat.scrollHeight;
    scheduleRebuild();
  });
  es.addEventListener('state', ev => {
    const st = JSON.parse(ev.data);
    if(st.score){ D.score = st.score; refreshBoard(); }
  });
  es.addEventListener('end', ev => {
    const { winner } = JSON.parse(ev.data);
    D.winner = winner; D.status = 'finished';
    es.close();
    statusBadge();
    // reload to pull the frozen + analyzed match
    setTimeout(() => location.reload(), 1500);
  });
  es.onerror = () => es.close();
}

/* ---- analysis panel (finished + succeeded) ---- */
async function renderAnalysis(){
  let a = D.analysis;
  if(!a && D.succeeded){
    try { a = await loadJSON(api(`/api/runs/${runId}/analysis`)); } catch { return; }
  }
  if(!a || a.status === 'pending' || a.error) return;

  const cls = c => `<span class="cls cls-${c}">${c}</span>`;
  const outcomeRows = t => (a.attack_outcomes?.[t] || []).map(o =>
    `<li>${cls(o.class)} <b>${esc(o.service||'')}</b>${o.round?` r${o.round}`:''} — ${esc(o.justification||'')}</li>`).join('') || '<li class="none">held all services</li>';
  const flagRows = (a.accepted_flags || []).map(f =>
    `<li><span class="flagv ${f.verdict==='INTENDED'?'ok':'warn'}">${esc(f.verdict||'')}</span> ${esc(f.team||'')}/${esc(f.service||'')}${f.round?` r${f.round}`:''} — ${esc(f.path||'')}</li>`).join('');
  const util = t => {
    const u = a.utilization?.[t]; if(!u) return '';
    const seg = (v,c,l) => v>0?`<span class="useg ${c}" style="width:${v}%" title="${l} ${v}%"></span>`:'';
    return `<div class="urow"><div class="ulbl" style="color:${HH[t].color}">${D.teams[t].label}</div>
      <div class="ubar">${seg(u.A_productive_pct,'u-a','productive')}${seg(u.B_lowvalue_pct,'u-b','low-value')}${seg(u.C_idle_pct,'u-c','idle')}</div>
      <div class="unum">${u.A_productive_pct||0}/${u.B_lowvalue_pct||0}/${u.C_idle_pct||0}</div></div>`;
  };

  const panel = document.createElement('section');
  panel.className = 'analysis';
  panel.innerHTML = `
    <div class="an-head">Post-match analysis
      <span class="an-valid ${a.validity?.verdict==='VALID'?'ok':'warn'}">${esc(a.validity?.verdict||'')}${a.validity?.reason?` · ${esc(a.validity.reason)}`:''}</span></div>
    ${a.headline ? `<p class="an-headline">${esc(a.headline)}</p>` : ''}
    <div class="an-grid">
      <div><h4>${t1.label} — failed attacks</h4><ul class="an-list">${outcomeRows('team1')}</ul></div>
      <div><h4>${t2.label} — failed attacks</h4><ul class="an-list">${outcomeRows('team2')}</ul></div>
    </div>
    ${flagRows ? `<h4>Accepted flags — intended?</h4><ul class="an-list flags">${flagRows}</ul>` : ''}
    <h4>Time utilization <span class="an-key">productive / low-value / idle</span></h4>
    ${util('team1')}${util('team2')}
    ${a.conversion ? `<p class="an-note"><b>Conversion:</b> ${esc(a.conversion)}</p>` : ''}
    ${a.awareness ? `<p class="an-note"><b>Awareness:</b> ${esc(a.awareness)}</p>` : ''}`;
  document.getElementById('metrics').after(panel);
}
renderAnalysis();
