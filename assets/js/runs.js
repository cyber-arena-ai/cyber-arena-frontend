// Runs directory — all matches this season (competitor-agnostic)
import { loadJSON, loadHarnesses, fmtTime, esc, setActiveNav, renderPager, api, dropdown } from './util.js';

setActiveNav('runs.html');

// The API returns every run by default; the page pages client-side over the
// whole list, so D.count and the rendered rows always agree.
//   nofail=1   drop matches that never happened
//   withtraj=1 drop runs with no readable thread — `unavailable` (the backend
//              GC'd the artifact before we parsed it) and `pending`
// Together: matches that were played AND can be opened.
const [D, H] = await Promise.all([loadJSON(api('/api/runs?nofail=1&withtraj=1')), loadHarnesses()]);
D.updated = D.updated || new Date().toISOString().slice(0, 10);
const runs = D.runs;  // already newest-first from the API

// A `solo` run has ONE agent: the orchestrator fills the opposing seat with an
// `idle` placeholder, which is not a competitor and must never be rendered as
// one. Head-to-head stats therefore run over duels only — counted with solo in,
// a lone agent that failed to capture reads as a "draw" (14 of 45 did).
const isSolo = r => r.mode === 'solo';
const duels = runs.filter(r => !isSolo(r));
const solos = runs.filter(isSolo);

const decisive = duels.filter(r => r.winner !== 'draw').length;
const draws = duels.filter(r => r.winner === 'draw').length;
// distinct entrants are <model × harness> combos, not bare models — the same
// model under two harnesses is two entrants. A solo run contributes its one
// real agent; the idle seat is not an entrant.
const entrants = [...new Map(
  runs.flatMap(r => isSolo(r) ? [r.teams.team1] : [r.teams.team1, r.teams.team2])
      .map(t => [H.comboKey(t), t])
).values()];

// Decisive/Draws are duel-only, so the tiles do not sum to the match total —
// the dek names the solo remainder that accounts for the difference.
const soloNote = solos.length ? ` · ${solos.length} solo ${solos.length === 1 ? 'run' : 'runs'}` : '';
// dek adapts: if the whole season is one matchup, name it; otherwise stay generic
document.getElementById('dek').innerHTML = entrants.length === 2
  ? `<b>${D.count} matches</b> this season · ${H.comboLabel(entrants[0])} vs ${H.comboLabel(entrants[1])}${soloNote}.`
  : `<b>${D.count} matches</b> this season · ${entrants.length} model × harness entrants${soloNote}.`;
document.getElementById('mastmeta').textContent = `${D.count} matches`;

document.getElementById('summary').innerHTML = `
  <div><b>${D.count}</b><span>Matches</span></div>
  <div class="acc-b"><b>${decisive}</b><span>Decisive</span></div>
  <div class="acc-p"><b>${draws}</b><span>Draws</span></div>
  <div><b>${entrants.length}</b><span>Entrants</span></div>`;

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const dateLabel = (d, t) => {
  const [, m, day] = (d || '2026-01-01').split('-');
  return `<b>${MONTHS[+m-1]} ${+day}</b>${t || ''}`;
};
const statusTag = r => {
  if(r.display === 'live')            return `<span class="stag live-tag"><i class="fa-solid fa-circle"></i> LIVE</span>`;
  if(r.display === 'pending')         return `<span class="stag ana-tag" title="the backend has this queued — no result yet"><i class="fa-solid fa-hourglass-half"></i> pending</span>`;
  if(r.display === 'unavailable')     return `<span class="stag anafail-tag" title="this run could not be parsed — its artifact is missing or unreadable">unavailable</span>`;
  if(r.display === 'canceled')        return `<span class="stag fail-tag" title="stopped before it could finish — any score it shows is whatever the board held when it was killed">cancelled</span>`;
  if(r.display === 'analysis_failed') return `<span class="stag anafail-tag" title="deep analysis gave up after retries">analysis failed</span>`;
  if(r.display === 'failed')          return `<span class="stag fail-tag">failed</span>`;
  return '';
};
// only flag hint mode (agents got the vuln hint); hard mode is the default and
// stays untagged
const modeTag = r =>
  r.hint === true ? `<span class="stag hint-tag" title="hint mode — agents were given the vulnerability hint">hint</span>` : '';

// solo: one agent, so its capture count is the whole result — a "100 – 0"
// against an idle seat would imply an opponent that was never there
const captured = r => (r.attack_flags?.team1 || 0) > 0;
function scoreHTML(r, h1, h2){
  if(isSolo(r)){
    const s = captured(r) ? `style="color:${h1.color}"` : 'class="lo"';
    return `<span ${s}>${r.score.team1}</span>`;
  }
  const s1 = r.winner === 'team1' ? `style="color:${h1.color}"` : 'class="lo"';
  const s2 = r.winner === 'team2' ? `style="color:${h2.color}"` : 'class="lo"';
  return `<span ${s1}>${r.score.team1}</span><span class="dash">–</span><span ${s2}>${r.score.team2}</span>`;
}
function winTag(r, hw, duo){
  // a solo run is won or drawn against nobody — report what it actually did
  if(isSolo(r)) return captured(r)
    ? `<span class="tag" style="background:${duo};color:var(--paper);border-color:var(--ink)">Captured</span>`
    : `<span class="tag draw">No capture</span>`;
  if(r.winner === 'draw') return `<span class="tag draw">Draw</span>`;
  const org = hw.org ? ` · ${hw.org}` : '';   // org from the harness table, not the (empty) team field
  // the tag wears the winner's own combo color (model|harness duo, solid when
  // they agree) — not the per-team accent, which is stock blue/pink today
  return `<span class="tag" style="background:${duo};color:var(--paper);border-color:var(--ink)" title="${hw.fullName}">${hw.shortName}${org}</span>`;
}

function renderList(list){
  document.getElementById('runs').innerHTML = list.map((r, i) => {
    // distinctPair: same-harness matchups still get two tellable-apart accents.
    // Resolve each team's duo gradient once and reuse it (vs-line + win tag).
    const solo = isSolo(r);
    const [h1, h2] = solo ? [H.get(r.teams.team1), null]
                          : H.distinctPair(r.teams.team1, r.teams.team2);
    const d1 = H.duoCSS(r.teams.team1), d2 = solo ? null : H.duoCSS(r.teams.team2);
    const win = !solo && r.winner && r.winner !== 'draw' ? r.winner : null;
    const hw = win === 'team1' ? h1 : win === 'team2' ? h2 : null;
    const ent = (t, h, d, c) =>
      `<span class="duo ${c}" style="background:${d}"></span>${t.model}<i class="hb" title="${h.fullName}">${h.shortName}</i>`;
    const inner = `
      <div class="rdate">${dateLabel(r.date, r.time)}</div>
      <div>
        <div class="rname">${r.name}${r.category ? ` <span class="badge ${r.category.toLowerCase()}">${r.category}</span>` : ''} ${modeTag(r)}${statusTag(r)}</div>
        <div class="rmeta">${r.challenge} · ${r.rounds} rounds · ${fmtTime(r.duration_s)}${r.campaign ? ` · <span class="cmp" title="commissioned by the ${esc(r.campaign.type)} campaign &quot;${esc(r.campaign.id)}&quot;">${esc(r.campaign.id)}</span>` : ''}</div>
        <div class="rvs">${ent(r.teams.team1, h1, d1, 'c1')}${solo
          ? ` <span class="vs">solo run</span>`
          : ` <span class="vs">vs</span> ${ent(r.teams.team2, h2, d2, 'c2')}`}</div>
      </div>
      <div class="rscore">${scoreHTML(r, h1, h2)}</div>
      <div class="rwin">${(solo || r.winner) ? winTag(r, hw, win === 'team2' ? d2 : d1) : ''}<span class="rounds">${r.display === 'live' ? 'watch live' : 'view thread'}</span></div>
      <div class="rgo"><i class="arw"></i></div>`;
    // stagger the float-in, capped so long ?limit=0 lists don't crawl
    return `<a class="run live" style="--d:${Math.min(i, 12) * 70}ms" href="trajectory.html?run=${r.id}">${inner}</a>`;
  }).join('');
}

/* ---- paging over the (filtered) archive ---- */
const PAGE = 20;
let shown = runs, page = 1;
function draw(scroll = false){
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  page = Math.min(page, pages);
  renderList(shown.slice((page - 1) * PAGE, page * PAGE));
  renderPager(document.getElementById('pager'), page, pages, p => { page = p; draw(true); });
  if(scroll) document.querySelector('.sech').scrollIntoView({ behavior: 'smooth' });
}
draw();

// status filters, by display state. `analysing` is gone — analysis is triggered
// by hand now, so an un-analysed match is just finished.
const STATES = [
  { key: 'all',             label: 'all' },
  { key: 'live',            label: 'live' },
  { key: 'finished',        label: 'finished' },
  { key: 'pending',         label: 'pending' },
  { key: 'unavailable',     label: 'unavailable' },
  { key: 'canceled', label: 'cancelled' },
  { key: 'analysis_failed', label: 'analysis failed' },
];
const count = k => k === 'all' ? runs.length : runs.filter(r => r.display === k).length;
document.getElementById('filt').innerHTML = STATES
  .filter(s => s.key === 'all' || count(s.key) > 0)   // only show tags that exist
  .map((s, i) => `<button data-s="${s.key}" class="${s.key} ${i === 0 ? 'on' : ''}">${s.label} <b>${count(s.key)}</b></button>`)
  .join('');

// The two filters compose: status is the row's display state, campaign is who
// commissioned it. A run submitted by hand has no campaign at all.
let fState = 'all', fCampaign = 'all';
function applyFilters(){
  shown = runs.filter(r =>
    (fState === 'all' || r.display === fState) &&
    (fCampaign === 'all'
      || (fCampaign === 'none' ? !r.campaign : r.campaign?.id === fCampaign)));
  page = 1;
  draw();
}

document.querySelectorAll('#filt button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#filt button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  fState = b.dataset.s;
  applyFilters();
});

// Campaign filter — the same dropdown the leaderboard uses. Only rendered when
// a campaign actually commissioned something in this archive, so a deploy that
// runs none never sees the control.
const campaigns = new Map();
for(const r of runs) if(r.campaign?.id) campaigns.set(r.campaign.id, r.campaign);
const chost = document.getElementById('cfilt');
if(chost && campaigns.size){
  const n = id => runs.filter(r => r.campaign?.id === id).length;
  const hand = runs.filter(r => !r.campaign).length;
  dropdown(chost, {
    label: 'campaign',
    value: 'all',
    options: [{ value: 'all', label: 'all campaigns', count: runs.length }]
      .concat([...campaigns.values()].map(c =>
        ({ value: c.id, label: c.id, count: n(c.id), tag: c.type || '' })))
      // runs submitted by hand belong to no campaign — worth selecting for on a
      // page where most rows may now carry one
      .concat(hand ? [{ value: 'none', label: 'ad-hoc', tag: 'no campaign', count: hand }] : []),
    onChange: v => { fCampaign = v; applyFilters(); },
  });
}
