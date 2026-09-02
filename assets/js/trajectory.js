// Trajectory (single match) — chat thread + Sublime-style minimap
import { loadJSON, loadHarnesses, fmtTime, esc, setActiveNav, api } from './util.js';

setActiveNav('trajectory.html');

const params = new URLSearchParams(location.search);
let runId = params.get('run');

// "Random Match": no ?run given -> pick from runs that were played AND have
// a thread to show (withtraj=1) — otherwise most picks land on an
// `unavailable` match whose artifact was GC'd before we could parse it.
if(!runId){
  try {
    const pool = (await loadJSON(api('/api/runs?nofail=1&withtraj=1'))).runs || [];
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

// winner is null while a match is live — show a "live · X vs Y" headline then
const leader = D.score.team1 === D.score.team2 ? null
  : (D.score.team1 > D.score.team2 ? 'team1' : 'team2');
const captured = (D.attack_flags?.team1 || 0) > 0;
if(isSolo){
  // no opponent => no "def." and no "draw"; the result is whether it captured
  const live = D.status === 'running'
    ? `<mark style="background:${HH.team1.color}">LIVE</mark> ` : '';
  document.getElementById('hl').innerHTML = D.status === 'failed' || D.status === 'running'
    ? `${live}${cname('team1')} <em>solo run</em>`
    : captured
      ? `<mark style="background:${HH.team1.color}">${t1.label}</mark> captured solo`
      : `${cname('team1')} <em>solo run</em> — no capture`;
} else if(D.status === 'failed'){
  document.getElementById('hl').innerHTML =
    `${cname('team1')} <em>vs</em> ${cname('team2')}`;
} else if(!D.winner){
  const lead = leader ? HH[leader].color : HH.team1.color;
  document.getElementById('hl').innerHTML =
    `<mark style="background:${lead}">LIVE</mark> ${cname('team1')} <em>vs</em> ${cname('team2')}`;
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
    h += `<div class="day" data-mm-type="round" data-mm-label="R${rstarts[ri].r}"><span>◆ Round ${rstarts[ri].r} · ${fmtTime(rstarts[ri].t)}</span></div>`;
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
  const s = D.status;
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
   One row per (round x team): what happened to that team's own flag, and how
   its service held up. Both halves span every round and every service, because
   a match can carry several challenges and a challenge several flag stores.
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

  const flagCell = (cell) => {
    if(!cell) return `<span class="pill mut">no data</span>`;
    const out = [];
    if(cell.lost === true)      out.push(`<span class="pill bad">${esc(cell.status)}</span>`);
    else if(cell.status)        out.push(`<span class="pill ok">held</span>`);
    else if(cell.planted)       out.push(`<span class="pill mut">planted</span>`);
    // a read-precondition tamper is keyed on `repair`, never on `status`:
    // status can read PRESENT again after a successful repair
    if(cell.tampered)           out.push(`<span class="pill warn">tampered</span>`);
    const caps = (cell.captures || []).filter(c => c.scored).length;
    const tries = (cell.captures || []).length;
    if(tries) out.push(`<span class="cap">${caps}/${tries} captured</span>`);
    return out.join(' ') || `<span class="pill mut">—</span>`;
  };

  const svcCell = (s) => {
    if(!s) return `<span class="pill mut">no data</span>`;
    const cls = s.failed ? 'warn' : 'ok';
    const bits = [`<span class="pill ${cls}">${s.uptime_pct ?? '—'}%</span>`,
                  `<span class="cap">${s.passed}/${s.probes} probes</span>`];
    if(s.worst_level) bits.push(`<span class="cap">worst: ${esc(s.worst_level)}</span>`);
    if(s.restarts)    bits.push(`<span class="cap">${s.restarts} restart${s.restarts>1?'s':''}</span>`);
    if(s.final === 'down') bits.unshift(`<span class="pill bad">down</span>`);
    return bits.join(' ');
  };

  const rows = [];
  for(const svc of services){
    for(const r of rounds){
      for(const tk of teamKeys){
        const half = PR.teams[tk] || {};
        const stores = ((half.flags || {})[r] || {})[svc] || {};
        const keys = Object.keys(stores);
        const svcStat = ((half.service || {})[r] || {})[svc];
        // one row per flag store, so several flags in one service stay visible
        const storeKeys = keys.length ? keys : [''];
        storeKeys.forEach((sk, i) => {
          rows.push(`<tr>
            <td class="rn">${i === 0 ? 'R' + r : ''}</td>
            <td class="tm ${tk === 'team1' ? 't1' : 't2'}">${
              i === 0 ? esc((tk === 'team1' ? t1 : t2).label) : ''}</td>
            <td class="num">${keys.length > 1 ? esc(sk) : ''}</td>
            <td>${flagCell(stores[sk])}</td>
            <td>${i === 0 ? svcCell(svcStat) : ''}</td>
          </tr>`);
        });
      }
    }
  }

  host.innerHTML = `
    <div class="rhead"><span>Round board</span>
      <span class="svc">${services.map(esc).join(' · ')}</span></div>
    <table class="rtable">
      <thead><tr><th>round</th><th>team</th><th>store</th>
        <th>own flag</th><th>service health</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <div class="rnote">Own flag is the defender's copy — a capture reads it, it does not
      remove it, so a stolen flag still reads <b>held</b>. Health is measured per probe
      (process / tcp / http / checker), not per event.</div>`;
}
renderRounds();

/* ---- live streaming (in-flight matches) ---- */
// never stream into a placeholder: the midend does not write placeholders for
// live runs, so this pairing should not occur — but appending turns underneath
// an "unavailable" notice would be incoherent if it ever did.
if(D.status === 'running' && !D.parse_failed){
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
    D.winner = winner; D.status = 'finished';
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
  if(!a && (D.status !== 'finished' || !D.succeeded || D.parse_failed)){
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
