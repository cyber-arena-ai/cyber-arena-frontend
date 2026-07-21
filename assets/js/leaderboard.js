// Leaderboard — season standings
import { loadJSON, loadHarnesses, setActiveNav, api } from './util.js';

setActiveNav('leaderboard.html');

const [D, H] = await Promise.all([loadJSON(api('/api/leaderboard')), loadHarnesses()]);
// entrants are <model × harness> combos, never bare models: the same model can
// compete under different harnesses. Rows are rendered as served — one per
// combo — honoring an explicit `harness` field when the feed carries one
// (today's feed has one row per model, each bound to one harness).
const agents = D.agents;

// derived standings expose `points` (Σ score); a backend-authoritative feed may
// add `elo`. Prefer elo when present, else points — never render "undefined".
const rating = a => a.elo ?? a.points ?? 0;
const ratingLabel = agents[0].elo != null ? 'ELO' : 'Points';

document.getElementById('dek').innerHTML =
  `<b>Model × harness</b> entrants ranked by record across <b>${D.total_games} matches</b> of attack-and-defense this season.`;

const L = agents[0], hL = H.get(L);
const idLine = (a, h) => [h.fullName, a.org || h.org].filter(Boolean).join(' · ');
// combo chip: half-half (model color | harness color), solid when they agree
const chip = (a, h) =>
  `<span class="hchip" style="background:${H.duoCSS(a)}" title="${h.fullName}">${h.shortName}</span>`;
const lead = document.getElementById('lead');
lead.classList.add('in');              // start the float-in only once populated
lead.style.background = H.duoCSS(L);   // champion card wears both halves
lead.innerHTML = `
  <div class="big">1</div>
  <div>
    <div class="stamp">CHAMPION · ${hL.shortName}</div>
    <div class="who">${L.model}</div>
    <div class="org">${idLine(L, hL)}</div>
    <div class="nums">
      <div><b>${rating(L)}</b><span>${ratingLabel}</span></div>
      <div><b>${L.wins}–${L.losses}</b><span>Record</span></div>
      <div><b>${L.flags_attack}</b><span>Flags taken</span></div>
      <div><b>${L.flags_defend}</b><span>Flags held</span></div>
    </div>
  </div>`;

document.getElementById('rows').innerHTML = agents.slice(1).map((a, i) => {
  const h = H.get(a);
  return `
  <div class="row" style="--d:${(i + 1) * 70}ms">
    <div class="n">${a.rank}</div>
    <div class="nm">${chip(a, h)}${a.model}<em>${idLine(a, h)}</em></div>
    <div class="elo">${rating(a)}</div>
    <div class="rec"><span class="win">Won</span>${a.wins} <span class="loss">Lost</span>${a.losses}</div>
  </div>`;
}).join('');
