// Leaderboard — season standings
import { loadJSON, loadHarnesses, setActiveNav, api } from './util.js';

setActiveNav('leaderboard.html');

const [D, H] = await Promise.all([loadJSON(api('/api/leaderboard')), loadHarnesses()]);
const agents = D.agents;

// derived standings expose `points` (Σ score); a backend-authoritative feed may
// add `elo`. Prefer elo when present, else points — never render "undefined".
const rating = a => a.elo ?? a.points ?? 0;
const ratingLabel = agents[0].elo != null ? 'ELO' : 'Points';

document.getElementById('dek').innerHTML =
  `Agents ranked by record across <b>${D.total_games} matches</b> of attack-and-defense this season.`;
document.getElementById('colophon').textContent = `CyberArena 2026 · Updated ${D.updated}`;

const L = agents[0], hL = H.get(L.model);
const lead = document.getElementById('lead');
lead.style.background = hL.color;
lead.innerHTML = `
  <div class="big">1</div>
  <div>
    <div class="stamp">CHAMPION · ${hL.shortName}</div>
    <div class="who">${L.model}</div>
    <div class="org">${hL.fullName} · ${L.org}</div>
    <div class="nums">
      <div><b>${rating(L)}</b><span>${ratingLabel}</span></div>
      <div><b>${L.wins}–${L.losses}</b><span>Record</span></div>
      <div><b>${L.flags_attack}</b><span>Flags taken</span></div>
      <div><b>${L.flags_defend}</b><span>Flags held</span></div>
    </div>
  </div>`;

document.getElementById('rows').innerHTML = agents.slice(1).map(a => {
  const h = H.get(a.model);
  return `
  <div class="row">
    <div class="n">${a.rank}</div>
    <div class="nm"><span class="hchip" style="background:${h.color}" title="${h.fullName}">${h.shortName}</span>${a.model}<em>${a.org}</em></div>
    <div class="elo">${rating(a)}</div>
    <div class="rec"><span class="win">Won</span>${a.wins} <span class="loss">Lost</span>${a.losses}</div>
  </div>`;
}).join('');
