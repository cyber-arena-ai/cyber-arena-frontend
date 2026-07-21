// Runs directory — all matches this season (competitor-agnostic)
import { loadJSON, loadHarnesses, fmtTime, setActiveNav, api } from './util.js';

setActiveNav('runs.html');

const [D, H] = await Promise.all([loadJSON(api('/api/runs')), loadHarnesses()]);
D.updated = D.updated || new Date().toISOString().slice(0, 10);
const runs = D.runs;  // already newest-first from the API (run_filter ordering)

const decisive = runs.filter(r => r.winner !== 'draw').length;
const draws = runs.filter(r => r.winner === 'draw').length;
// distinct entrants are <model × harness> combos, not bare models — the same
// model under two harnesses is two entrants
const entrants = [...new Map(
  runs.flatMap(r => [r.teams.team1, r.teams.team2]).map(t => [H.comboKey(t), t])
).values()];

// dek adapts: if the whole season is one matchup, name it; otherwise stay generic
document.getElementById('dek').innerHTML = entrants.length === 2
  ? `<b>${D.count} matches</b> this season · ${H.comboLabel(entrants[0])} vs ${H.comboLabel(entrants[1])}.`
  : `<b>${D.count} matches</b> this season · ${entrants.length} model × harness entrants.`;
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
  if(r.state === 'live')            return `<span class="stag live-tag"><i class="fa-solid fa-circle"></i> LIVE</span>`;
  if(r.state === 'analysing')       return `<span class="stag ana-tag"><i class="fa-solid fa-hourglass-half"></i> analysing</span>`;
  if(r.state === 'analysis_failed') return `<span class="stag anafail-tag" title="deep analysis gave up after retries">analysis failed</span>`;
  if(r.state === 'failed')          return `<span class="stag fail-tag">failed</span>`;
  return '';
};
// only flag hint mode (agents got the vuln hint); hard mode is the default and
// stays untagged
const modeTag = r =>
  r.hint === true ? `<span class="stag hint-tag" title="hint mode — agents were given the vulnerability hint">hint</span>` : '';

function scoreHTML(r, h1, h2){
  const s1 = r.winner === 'team1' ? `style="color:${h1.color}"` : 'class="lo"';
  const s2 = r.winner === 'team2' ? `style="color:${h2.color}"` : 'class="lo"';
  return `<span ${s1}>${r.score.team1}</span><span class="dash">–</span><span ${s2}>${r.score.team2}</span>`;
}
function winTag(r, hw, duo){
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
    const [h1, h2] = H.distinctPair(r.teams.team1, r.teams.team2);
    const d1 = H.duoCSS(r.teams.team1), d2 = H.duoCSS(r.teams.team2);
    const win = r.winner && r.winner !== 'draw' ? r.winner : null;
    const hw = win === 'team1' ? h1 : win === 'team2' ? h2 : null;
    const inner = `
      <div class="rdate">${dateLabel(r.date, r.time)}</div>
      <div>
        <div class="rname">${r.name}${r.category ? ` <span class="badge ${r.category.toLowerCase()}">${r.category}</span>` : ''} ${modeTag(r)}${statusTag(r)}</div>
        <div class="rmeta">${r.challenge} · ${r.rounds} rounds · ${fmtTime(r.duration_s)}</div>
        <div class="rvs"><span class="duo c1" style="background:${d1}"></span>${r.teams.team1.model}<i class="hb" title="${h1.fullName}">${h1.shortName}</i> <span class="vs">vs</span> <span class="duo c2" style="background:${d2}"></span>${r.teams.team2.model}<i class="hb" title="${h2.fullName}">${h2.shortName}</i></div>
      </div>
      <div class="rscore">${scoreHTML(r, h1, h2)}</div>
      <div class="rwin">${r.winner ? winTag(r, hw, win === 'team1' ? d1 : d2) : ''}<span class="rounds">${r.state === 'live' ? 'watch live' : 'view thread'}</span></div>
      <div class="rgo"><i class="arw"></i></div>`;
    // stagger the float-in, capped so long ?all=true lists don't crawl
    return `<a class="run live" style="--d:${Math.min(i, 12) * 70}ms" href="trajectory.html?run=${r.id}">${inner}</a>`;
  }).join('');
}
renderList(runs);

// status filters — all / live / analysing / finished / failed (by display state)
const STATES = [
  { key: 'all',             label: 'all' },
  { key: 'live',            label: 'live' },
  { key: 'analysing',       label: 'analysing' },
  { key: 'finished',        label: 'finished' },
  { key: 'analysis_failed', label: 'analysis failed' },
  { key: 'failed',          label: 'failed' },
];
const count = k => k === 'all' ? runs.length : runs.filter(r => r.state === k).length;
document.getElementById('filt').innerHTML = STATES
  .filter(s => s.key === 'all' || count(s.key) > 0)   // only show tags that exist
  .map((s, i) => `<button data-s="${s.key}" class="${s.key} ${i === 0 ? 'on' : ''}">${s.label} <b>${count(s.key)}</b></button>`)
  .join('');

document.querySelectorAll('#filt button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#filt button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const s = b.dataset.s;
  renderList(s === 'all' ? runs : runs.filter(r => r.state === s));
});
