// Trajectory (single match) — chat thread + Sublime-style minimap
import { loadJSON, loadHarnesses, fmtTime, esc, setActiveNav, api } from './util.js';

setActiveNav('trajectory.html');

const params = new URLSearchParams(location.search);
let runId = params.get('run');

// "Random Match": no ?run given -> pick from runs that were played AND have
// a thread to show (parse=ok) — otherwise most picks land on a run
// whose artifact was GC'd before we could parse it.
if(!runId){
  try {
    const pool = (await loadJSON(api('/api/runs?outcome=succeeded,running&parse=ok'))).runs || [];
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

// A `solo` run has ONE agent. The orchestrator still fills the opposing seat —
// with an `idle` placeholder carrying no harness, no turns and no tokens — but
// it is NOT a competitor, so nothing on this page may present it as one: no
// scoreboard side, no time budget, no minimap, no analysis card, and no
// win/draw verdict against it.
const isSolo = D.mode === 'solo';

// resolve each team to its <model × harness> identity for names/labels only.
// With just two teams on this page, theming stays on the stock theme colors —
// --t1/--t2 default to --blue/--pink in the CSS; harness identity is textual.
const HH = {
  team1: { ...H.get(t1), color: 'var(--blue)' },
  team2: { ...H.get(t2), color: 'var(--pink)' },
};

/* ---- headline + scoreboard ---- */
// no score in the headline — the scoreboard right below already carries it
const wlabel = D.winner === 'team1' ? t1.label : t2.label;
const llabel = D.winner === 'team1' ? t2.label : t1.label;

document.getElementById('mastcat').textContent = D.category;
document.getElementById('mastname').textContent = D.name;
document.title = isSolo ? `${D.name}: ${t1.label} solo · CyberArena`
                       : `${D.name}: ${t1.label} vs ${t2.label} · CyberArena`;
document.getElementById('dateline').textContent = D.date;

// defeated team: its own team color, struck through by a slightly (randomly)
// inclined cross-out in the WINNER's color
const defeated = (label, key, wkey) => {
  const tilt = ((2 + Math.random() * 5) * (Math.random() < .5 ? -1 : 1)).toFixed(1);
  return `<span class="defeat" style="color:${HH[key].color};--cross:${tilt}deg;--crossc:${HH[wkey].color}">${label}</span>`;
};

// both names in their team colors — used when nobody is defeated
const cname = key => `<span style="color:${HH[key].color}">${(key === 'team1' ? t1 : t2).label}</span>`;

// winner is null while a match is live — the headline is just the pairing then
// (the masthead's live chip is the one place that says LIVE)
const captured = (D.attack_flags?.team1 || 0) > 0;
if(isSolo){
  // no opponent => no "def." and no "draw"; the result is whether it captured
  document.getElementById('hl').innerHTML = D.outcome === 'failed' || D.outcome === 'running'
    ? `${cname('team1')} <em>solo run</em>`
    : captured
      ? `<mark style="background:${HH.team1.color}">${t1.label}</mark> captured solo`
      : `${cname('team1')} <em>solo run</em> — no capture`;
} else if(D.outcome === 'failed'){
  document.getElementById('hl').innerHTML =
    `${cname('team1')} <em>vs</em> ${cname('team2')}`;
} else if(!D.winner){
  document.getElementById('hl').innerHTML =
    `${cname('team1')} <em>vs</em> ${cname('team2')}`;
} else if(D.winner === 'draw'){
  document.getElementById('hl').innerHTML =
    `${cname('team1')} and ${cname('team2')} draw`;
} else {
  document.getElementById('hl').innerHTML =
    `<mark style="background:${HH[D.winner].color}">${wlabel}</mark> def. ${defeated(llabel, D.winner === 'team1' ? 'team2' : 'team1', D.winner)}`;
}

function side(team, key, cls){
  const w = isSolo ? (key === 'team1' && captured) : D.winner === key;
  // identity line = the full combo: model · harness
  const md = [team.model, HH[key].fullName].filter(Boolean).join(' · ');
  return `<div class="side ${cls} ${w?'win':''}">
    ${w?`<div class="stampwin">${isSolo ? 'Captured' : 'Winner'}</div>`:''}
    <div class="nm">${team.label}</div><div class="md">${md}</div>
    <div class="pts">${D.score[key]}</div>
    <div class="br"><i class="fa-solid fa-flag"></i> ${D.attack_flags[key]} captured · ${D.defense_patches[key]} patched</div></div>`;
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
      + `<div class="mnum"><i class="fa-solid fa-brain"></i> ${fmtTime(m.think_s)}${m.overlap?'*':''} · <i class="fa-solid fa-gear"></i> ${fmtTime(m.tool_s)} · <i class="fa-solid fa-pause"></i> ${fmtTime(m.untrack_s)} · ${m.out_tok.toLocaleString()} tok @ ${m.tok_per_s} tok/s</div></div>`;
  };
  mhost.innerHTML = `<div class="mhead">Time budget · <b class="mt-think-t">thinking</b> / <b class="mt-tool-t">tool exec</b> / <b class="mt-un-t">idle+untracked</b>`
    + `<span class="msub">thinking = Σ model-inference latency · tool = Σ tool exec · wall = game duration${Object.values(M).some(m=>m.overlap)?' · *concurrent API calls overlap wall':''}</span></div>`
    + mrow('team1',t1) + (isSolo ? '' : mrow('team2',t2));
}

/* ---- chat thread ---- */
// act-kind -> label; the backend uses an open set (bash/mcp/web/tool/…), so
// unknown kinds get a generic label rather than being mislabeled as a search
const ACT_LABELS = {
  bash: '<i class="fa-solid fa-terminal"></i> shell',
  mcp: '<i class="fa-solid fa-gear"></i> cyberarena tool',
  web: '<i class="fa-solid fa-magnifying-glass"></i> web search',
};
function actChip(a){
  const lbl = ACT_LABELS[a.k] || `<i class="fa-solid fa-gear"></i> ${a.k}`;
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
  // solo: the flag belongs to the challenge service, not to the idle seat —
  // "captured idle's flag" would name the placeholder as a victim
  const victim = isSolo ? null : (e.victim==='team1' ? t1.label : t2.label);
  if(e.k==='steal'){
    // any rejection reason (UNKNOWN | OWN | DUPLICATE | WRONG_PHASE | ERROR) — no points
    if(e.accepted === false)
      return `<div class="sys dup" data-kind="event" data-mm-type="dup" data-mm-team="${e.by}">${who} submitted a flag — rejected${e.reason ? ` (${esc(e.reason.toLowerCase().replace(/_/g,' '))})` : ''}, no points · ${fmtTime(e.t)}</div>`;
    return `<div class="sys steal ${e.by}" data-kind="event" data-mm-type="capture" data-mm-team="${e.by}"
              title="${fmtTime(e.t)} — ${who} captured ${victim ? `${victim}'s` : 'the'} flag">
              <b><i class="fa-solid fa-flag"></i> ${who}</b> captured ${victim ? `<b>${victim}'s</b>` : 'the'} flag<span class="tm">${fmtTime(e.t)} · +1 flag</span></div>`;
  }
  return `<div class="patchwrap" data-kind="event" data-mm-type="patch" data-mm-team="${e.by}" title="${fmtTime(e.t)} — ${who} patched">
            <span class="sys patch"><i class="fa-solid fa-wrench"></i> ${who} patched the service · ${fmtTime(e.t)}</span></div>`;
}

const rstarts = Object.entries(D.round_starts)
  .map(([r,t]) => ({ r:+r, t })).sort((a,b)=>a.t-b.t);

let ri = 0;
function renderItem(item){
  let h = '';
  while(ri < rstarts.length && item.t >= rstarts[ri].t){
    h += `<div class="day" data-mm-type="round" data-round="${rstarts[ri].r}" data-mm-label="R${rstarts[ri].r}"><span>◆ Round ${rstarts[ri].r} · ${fmtTime(rstarts[ri].t)}</span></div>`;
    ri++;
  }
  return h + (item.kind==='event' ? sysMsg(item) : bubble(item));
}
const chat = document.getElementById('chat');
// A run the midend could not parse still returns a schema-valid trajectory, but
// an empty one. Say so — an empty thread otherwise reads as "nothing happened".
if(D.parse_failed){
  chat.innerHTML = `<div class="thread-unavailable">
    <h3>Thread unavailable</h3>
    <p>This match ran, but its trajectory could not be reconstructed${D.parse_error ? ` — ${esc(D.parse_error)}` : ''}.</p>
    <p class="tu-note">The match record above is from the backend job. The turn-by-turn thread needs the run artifact, which is missing or unreadable.</p>
  </div>`;
} else {
  chat.innerHTML = D.feed.map(renderItem).join('');
}

/* ---- per-team minimaps ---- */
document.getElementById('mmh1').textContent = HH.team1.shortName;
document.getElementById('mmh1').title = `${t1.label} · ${HH.team1.fullName}`;
// solo: the idle seat has no track to scrub — drop its minimap entirely rather
// than render an empty lane that reads as an opponent who did nothing
if(isSolo){
  document.querySelector('.minimap[data-team="team2"]')?.remove();
} else {
  document.getElementById('mmh2').textContent = HH.team2.shortName;
  document.getElementById('mmh2').title = `${t2.label} · ${HH.team2.fullName}`;
}

document.getElementById('mmlegend').innerHTML = `
  <span><i class="s" style="background:${HH.team1.color};border-color:var(--ink)"></i>${t1.label} capture</span>
  ${isSolo ? '' : `<span><i class="s" style="background:${HH.team2.color};border-color:var(--ink)"></i>${t2.label} capture</span>`}
  <span><i class="s g"></i>service patch</span>
  <span><i class="s d"></i>rejected submission</span>
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
  const s = D.outcome;
  const chip = s === 'running' ? '<span class="live-chip"><i class="fa-solid fa-circle"></i> LIVE</span>'
    : s === 'failed' ? '<span class="fail-chip">failed</span>' : '';
  // only flag hint mode; hard is the default and stays untagged
  const mode = D.hint === true ? '<span class="mode-chip hint" title="hint mode — agents were given the vulnerability hint">hint</span>' : '';
  el.innerHTML = `${D.category || ''} ${mode} ${chip}`;
}
statusBadge();

/* ---- rebuild scoreboard/headline (used by live updates) ---- */
function refreshBoard(){
  const board = document.getElementById('board');
  if(isSolo){
    board.style.gridTemplateColumns = '1fr';   // .board is 1fr/80px/1fr for a duel
    board.innerHTML = side(t1,'team1','t1');
    return;
  }
  board.innerHTML =
    side(t1,'team1','t1') + `<div class="mid">vs</div>` + side(t2,'team2','t2');
}

/* ---- per-round board -------------------------------------------------
   ONE LINE PER TEAM (two at most, one for a solo run), each line a strip of
   round segments. A segment is a narrow mark per rival flag, plus a service
   block: a mark is filled when that team snatched THAT rival flag in that
   round and hollow when it did not — filled in the RIVAL's colour, since the
   flag being taken is the rival's, and the block's HEIGHT is how much of its own
   service stayed up. Own-flag status is NOT drawn — a capture reads a flag
   without removing it, so a defender's copy reads held almost always, and a
   bar that is full every round says nothing. It rides in the tooltip instead,
   with the per-service figures. A match can carry several services, so the
   block is probe-weighted across them.
   Absent for runs parsed before the midend produced this table (and for runs
   whose artifact was GC'd, which can never have it) — so the section hides
   itself rather than drawing an empty frame. */
function renderRounds(){
  const host = document.getElementById('rounds');
  const PR = D.per_round;
  if(!host) return;
  if(!PR || !PR.teams || !PR.rounds?.length){ host.innerHTML = ''; return; }

  const teamKeys = isSolo ? ['team1'] : ['team1','team2'];
  // round 0 is the pre-game plant, before ROUND_START 1 — not a played round
  const rounds = PR.rounds.filter(r => r > 0);
  if(!rounds.length){ host.innerHTML = ''; return; }
  const services = PR.services || [];

  // Every segment draws the SAME flags in the SAME order, so the nth mark
  // means the same flag in every round and on both team lines. Order follows
  // the declared service list, then the store name, with `default` first —
  // discovery order would let a flag that first appears in round 3 jump slot.
  // A slot is only worth a column if it is a REAL flag somewhere: planted, or
  // read, or actually taken. An event the backend could not attribute lands in
  // a placeholder store (service "?", planted:false, an UNKNOWN rejected
  // submission) — giving that a column would draw a dotted mark in every round
  // for a flag that never existed. Its attempts still count in the tooltip.
  const FKEY = [];
  const real = new Set();
  const seen = new Map();
  for(const tk of teamKeys) for(const r of rounds)
    for(const [svc, byStore] of Object.entries(((PR.teams[tk] || {}).flags || {})[r] || {}))
      for(const [sk, c] of Object.entries(byStore || {})){
        const k = `${svc}\u0000${sk}`;
        if(!seen.has(k)) seen.set(k, { k, svc, sk,
          label: svc + (sk && sk !== 'default' ? '/' + sk : '') });
        if(c && (c.planted === true || c.status ||
                 (c.captures || []).some(x => x.scored))) real.add(k);
      }
  seen.forEach((f, k) => { if(real.has(k)) FKEY.push(f); });
  const svcRank = f => { const i = services.indexOf(f.svc); return i < 0 ? services.length : i; };
  FKEY.sort((a, b) => svcRank(a) - svcRank(b) || a.svc.localeCompare(b.svc)
    || (a.sk === 'default' ? -1 : b.sk === 'default' ? 1 : a.sk.localeCompare(b.sk)));

  // every service and store of one round collapsed to two percentages + the
  // detail line the tooltip shows, so nothing is lost, only folded
  const roundStat = (tk, r) => {
    const half = PR.teams[tk] || {};
    const flags = (half.flags || {})[r] || {};
    const svcs  = (half.service || {})[r] || {};
    let stores = 0, held = 0, tampered = false, caps = 0, tries = 0;
    const detail = [], byKey = {};
    for(const [svc, byStore] of Object.entries(flags)){
      for(const [sk, c] of Object.entries(byStore || {})){
        if(!c) continue;
        const k = `${svc}\u0000${sk}`;
        const cs = c.captures || [];
        const took = cs.filter(x => x.scored).length;
        // attempts count wherever they landed, including the placeholder store
        caps += took;
        tries += cs.length;
        byKey[k] = { took, tries: cs.length };
        // ...but a placeholder is not a flag, so it must not drag the defense
        // reading: one phantom store beside one real flag would read 50% held.
        if(!real.has(k)) continue;
        stores++;
        // a capture READS the flag: being robbed is not losing it. Defense is
        // status, offense is captures — the two are never conflated.
        if(c.lost !== true && c.status) held++;
        if(c.tampered) tampered = true;
        const name = svc + (sk && sk !== 'default' ? '/' + sk : '');
        const state = c.lost === true ? (c.status || 'lost') : c.status ? 'held'
          : c.planted ? 'planted' : 'no record';
        detail.push(`${name}: ${state}${c.tampered ? ' + tampered' : ''}`);
      }
    }
    let probes = 0, passed = 0, restarts = 0, down = false;
    for(const [svc, sv] of Object.entries(svcs)){
      if(!sv) continue;
      probes += sv.probes || 0;
      passed += sv.passed || 0;
      restarts += sv.restarts || 0;
      if(sv.final === 'down') down = true;
      detail.push(`${svc}: ${sv.passed}/${sv.probes} probes`
        + (sv.worst_level ? `, worst ${sv.worst_level}` : '')
        + (sv.restarts ? `, ${sv.restarts} restart${sv.restarts > 1 ? 's' : ''}` : ''));
    }
    return { flag: stores ? Math.round(100 * held / stores) : null, known: stores > 0,
             svc: probes ? Math.round(100 * passed / probes) : null,
             tampered, caps, tries, down, detail, byKey };
  };

  // a bar is a full-height TRACK with a fill — so 0% still shows the slot it
  // occupies instead of vanishing, and a missing measure reads as absent
  const bar = (cls, pct, extra = '', label = false) => {
    if(pct === null) return `<span class="rbbar ${cls} nd"></span>`;
    const num = label ? `<b class="${pct >= 50 ? 'in' : 'out'}">${pct}%</b>` : '';
    return `<span class="rbbar ${cls}${extra}"><i style="height:${pct}%"></i>${num}</span>`;
  };

  // one mark per flag, each binary: filled = this team took THAT flag in this
  // round. With no record for it the mark reads as absent — hollow would claim
  // "took nothing", which is a different statement from "we do not know".
  const flagMarks = (st, tk) => {
  const rival = isSolo ? '' : (tk === 'team1' ? t2 : t1).label;
  return FKEY.map(f => {
    const v = st.byKey[f.k];
    const cls = !v ? ' nd' : v.took > 0 ? ' on' : '';
    const state = !v ? 'no record' : v.took > 0 ? `taken${v.took > 1 ? ` x${v.took}` : ''}`
      : v.tries ? `${v.tries} attempt${v.tries > 1 ? 's' : ''}, none scored` : 'not taken';
    return `<span class="rbflag${cls}" title="${esc(f.label)}${
      rival ? ` (${esc(rival)}'s)` : ''} — ${state}"></span>`;
  }).join('');
  };

  const segment = (tk, r) => {
    const st = roundStat(tk, r);
    const tip = [`R${r}`,
      st.flag === null ? 'flag: no data' : `own flag ${st.flag}% held`,
      st.svc === null ? 'service: no data' : `service ${st.svc}% up`,
      st.tampered ? 'tampered + repaired' : '',
      st.down ? 'service ended down' : '',
      st.tries ? `${st.caps}/${st.tries} captured off the opponent` : '',
      ...st.detail].filter(Boolean).join(' · ');
    return `<div class="rbseg" data-round="${r}" title="${esc(tip)}">
      <div class="rbbars">${flagMarks(st, tk)}${bar('svc', st.svc, '', true)}</div>
      </div>`;
  };

  const line = (tk) => `<div class="rbline ${tk === 'team1' ? 't1' : 't2'}${isSolo ? ' solo' : ''}">
      <div class="rbteam">${esc((tk === 'team1' ? t1 : t2).label)}</div>
      <div class="rbsegs">${rounds.map(r => segment(tk, r)).join('')}</div>
    </div>`;

  host.innerHTML = `
    <div class="rhead"><span>Round board</span>
      <span class="svc">${services.filter(sv => FKEY.some(f => f.svc === sv)
        || teamKeys.some(tk => rounds.some(r =>
             (((PR.teams[tk] || {}).service || {})[r] || {})[sv])))
        .map(esc).join(' · ')}</span></div>
    <div class="rblegend">
      <span><i class="k flagon"></i><i class="k flagoff"></i> rival flag caught</span>
      <span><i class="k svc"></i> uptime</span>
      <span><i class="k nd"></i> no data</span>
    </div>
    ${teamKeys.map(line).join('')}`;
}

renderRounds();

/* ---- thread <-> round board: one reading position ----------------------
   The board sits directly above the thread, so it doubles as the thread's map:
   scrolling the thread lights the round being read, and clicking a round
   scrolls the thread to where that round starts. Both directions run off the
   SAME anchors — the round rules already in the feed — so they cannot drift
   apart, and a live match that grows new rounds needs no extra wiring. */
function linkRoundsToThread(){
  const host = document.getElementById('rounds');
  const segs = host ? [...host.querySelectorAll('.rbseg')] : [];
  if(!segs.length) return;
  // the rules are re-read only when the feed actually grew (live appends),
  // never on every scroll tick
  let days = [], seen = -1;
  const refresh = () => {
    if(chat.children.length === seen) return;
    seen = chat.children.length;
    days = [...chat.querySelectorAll('.day[data-round]')]
      .map(el => ({ r: +el.dataset.round, el }));
  };
  // a round counts as the one being read once its rule has passed the top edge
  const current = () => {
    refresh();
    if(!days.length) return null;
    const y = chat.scrollTop + 24;
    let cur = days[0].r;
    for(const d of days){ if(d.el.offsetTop <= y) cur = d.r; else break; }
    return cur;
  };
  const paint = () => {
    const r = current();
    segs.forEach(sg => sg.classList.toggle('on', r !== null && +sg.dataset.round === r));
  };
  segs.forEach(sg => {
    sg.addEventListener('click', () => {
      refresh();
      const d = days.find(x => x.r === +sg.dataset.round);
      if(d) chat.scrollTop = Math.max(0, d.el.offsetTop - 8);
    });
    // a click target must be reachable without a mouse
    sg.tabIndex = 0;
    sg.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sg.click(); }
    });
  });
  chat.addEventListener('scroll', paint);
  window.addEventListener('resize', paint);
  paint();
}
linkRoundsToThread();

/* ---- live streaming (in-flight matches) ---- */
// never stream into a placeholder: the midend does not write placeholders for
// live runs, so this pairing should not occur — but appending turns underneath
// an "unavailable" notice would be incoherent if it ever did.
if(D.outcome === 'running' && !D.parse_failed){
    // ?since = what we already rendered, so the FIRST connect sends only new
    // turns. On a RECONNECT the browser re-requests this same url with `since`
    // frozen at page-load, so resumption rides on the SSE event id instead:
    // the server stamps each feed frame with its index and honours Last-Event-ID.
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
    D.winner = winner; D.outcome = 'succeeded';
    es.close();
    statusBadge();
    // reload to pull the frozen + analyzed match
    setTimeout(() => location.reload(), 1500);
  });
  es.onerror = () => {
    // Don't kill the stream on a transient drop — EventSource retries by
    // itself, and Last-Event-ID makes the retry resume rather than replay, so
    // a blip no longer costs the rest of the match. Give up only once the
    // browser has (readyState CLOSED, e.g. the run 404s).
    if(es.readyState === EventSource.CLOSED) es.close();
  };
}

/* ---- analysis panel (finished + succeeded) ---- */
function analysisFailedNote(){
  const panel = document.createElement('section');
  panel.className = 'analysis';
  panel.innerHTML =
    `<div class="an-sech">Post-match analysis <span class="an-valid warn">analysis failed</span></div>
     <p class="an-fail-note">Deep analysis could not be produced for this match after repeated attempts. The match thread below is complete.</p>`;
  document.getElementById('metrics').after(panel);
}
/* Analysis is MANUAL. The midend FSM decides what the button does:
     not_triggered    -> square button, clickable  ("run analysis")
     working_on       -> grey, disabled            ("working on")
     ready            -> hidden, panel renders
     analysis_failure -> hidden, fail note renders
     not_available    -> hidden (live or failed match)                  */
const anBtn = document.getElementById('an-btn');
const AN_POLL_MS = 3000;

function paintAnBtn(st){
  if(!anBtn) return;
  const n = st.attempts || 0, max = st.max_attempts || 0;
  if(st.status === 'not_triggered'){
    anBtn.hidden = false; anBtn.disabled = false;
    // n > 0 means an attempt already failed. Say so — silently reverting to
    // "analyse" reads as though the click never registered.
    anBtn.textContent = n ? `retry ${n}/${max}` : 'analyse';
    anBtn.title = n ? `the last analysis attempt failed — ${max - n} left`
                    : 'run post-match analysis';
    anBtn.classList.toggle('an-retry', n > 0);
  } else if(st.status === 'working_on'){
    // the same block, greyed and unclickable — same action, just running
    anBtn.hidden = false; anBtn.disabled = true;
    anBtn.textContent = 'analysing';
    anBtn.title = 'analysis in progress';
    anBtn.classList.remove('an-retry');
  } else {
    anBtn.hidden = true;                    // ready | analysis_failure | not_available
  }
}

async function anState(){
  try { return await loadJSON(api(`/api/runs/${runId}/analysis`), { cache: 'no-store' }); }
  catch { return { status: 'not_available' }; }
}

// Poll while the midend is working, then render whatever it settled on.
async function anPollUntilSettled(){
  for(;;){
    await new Promise(r => setTimeout(r, AN_POLL_MS));
    const st = await anState();
    paintAnBtn(st);
    if(st.status !== 'working_on'){ renderAnalysis(st); return; }
  }
}

if(anBtn) anBtn.addEventListener('click', async () => {
  paintAnBtn({ status: 'working_on' });
  try {
    const st = await loadJSON(api(`/api/runs/${runId}/analysis`), { method: 'POST' });
    paintAnBtn(st);
    if(st.status === 'working_on') return anPollUntilSettled();
    renderAnalysis(st);
  } catch { paintAnBtn({ status: 'not_triggered' }); }
});

async function renderAnalysis(pre){
  // D.analysis is the copy embedded in the trajectory — a cache hit with no
  // `status` field of its own, so tag it ready before the switch below.
  let a = pre || (D.analysis ? { ...D.analysis, status: 'ready' } : null);
  // Only a finished+succeeded match can ever have an analysis. Asking about a
  // live, failed or unparseable one is a guaranteed `not_available` round-trip.
  if(!a && (D.outcome !== 'succeeded' || D.parse_failed)){
    paintAnBtn({ status: 'not_available' });
    return;
  }
  if(!a) a = await anState();
  paintAnBtn(a);
  if(a.status === 'working_on') { anPollUntilSettled(); return; }
  if(a.status === 'analysis_failure'){ analysisFailedNote(); return; }
  if(!a || a.status !== 'ready' || a.error) return;

  // A/B/C = WHY an attack failed (rubric §2). Hover for the meaning.
  const CLS_MEAN = {
    A: "A — Can't break in (capability gap): never reached a working exploit",
    B: "B — Too slow / opponent already patched: had the exploit but lost on tempo or defense",
    C: "C — Had reach, never converted: reached the flag but never hand-fired submit_flag",
  };
  const cls = c => `<span class="cls cls-${c}" data-tip="${esc(CLS_MEAN[c] || '')}">${c}</span>`;
  const CLS_KEY = `<span class="an-key">A can't break · B too slow · C never converted</span>`;
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

  // TLDR = the validity verdict; the verdict word lives INSIDE the white chip
  // (readable on white), the reason sits on the black background. Details = headline.
  const vok = a.validity?.verdict === 'VALID';
  const verdictChip = `<span class="tldr">TLDR${a.validity?.verdict ? `<b class="verdict ${vok?'ok':'warn'}">${esc(a.validity.verdict)}</b>` : ''}</span>`;
  const vreason = a.validity?.reason ? esc(a.validity.reason) : '';

  // one card per module — the panel is a grid of riso cards, not one block
  const card = (cls, title, body) =>
    body ? `<article class="an-card ${cls}"><h4>${title}</h4>${body}</article>` : '';
  const utilBars = util('team1') + (isSolo ? '' : util('team2'));

  const panel = document.createElement('section');
  panel.className = 'analysis';
  panel.innerHTML = `
    <div class="an-sech">Post-match analysis</div>
    <div class="an-cards">
      ${(a.validity || a.headline) ? `<article class="an-card lede ${vok ? 'v-ok' : 'v-bad'}">
        <div class="tldr-cap">${verdictChip}${vreason ? ' ' + vreason : ''}</div>
        ${a.headline ? `<span class="lede-div"></span><p class="lede-details">${esc(a.headline)}</p>` : ''}
      </article>` : ''}
      ${card('t1', `${t1.label} — failed attacks ${CLS_KEY}`, `<ul class="an-list">${outcomeRows('team1')}</ul>`)}
      ${isSolo ? '' : card('t2', `${t2.label} — failed attacks ${CLS_KEY}`, `<ul class="an-list">${outcomeRows('team2')}</ul>`)}
      ${flagRows ? card('wide', 'Accepted flags — intended?', `<ul class="an-list flags">${flagRows}</ul>`) : ''}
      ${utilBars ? card('wide', `Time utilization <span class="an-key">productive / low-value / idle</span>`, utilBars) : ''}
      ${a.conversion ? card('note', 'Conversion', `<p>${esc(a.conversion)}</p>`) : ''}
      ${a.awareness ? card('note', 'Awareness', `<p>${esc(a.awareness)}</p>`) : ''}
    </div>`;
  document.getElementById('metrics').after(panel);
}
renderAnalysis();
