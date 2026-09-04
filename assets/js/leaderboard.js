// Leaderboard — standings published by CAMPAIGNS.
//
// The midend is a RELAY. It persists nothing about a ranking — it keeps a
// routing table of campaign ids and endpoints, and asks the campaign itself for
// everything else, behind a short-TTL response cache. A cached copy served
// while the campaign is unreachable arrives marked `stale`, and is shown as
// such: a held ranking must never be presented as a current one. A campaign (cyber-arena-deploy/campaign/) is a persistent
// process beside the midend: it pulls the run list, applies its own selection
// and algorithm, and serves the result over loopback. So every field on this
// page is the campaign's own word, read live — including its type. That is the point: a ranking is one campaign's opinion, identified and
// comparable, not an unattributed number handed down by the server.
//
// The table is GENERIC. Each campaign declares its own `columns`, so a new
// campaign with a different algorithm renders here without a frontend change.
import { loadJSON, loadHarnesses, setActiveNav, api, dropdown } from './util.js';

setActiveNav('leaderboard.html');

const dek = document.getElementById('dek');
const picker = document.getElementById('campaigns');
const head = document.getElementById('lb-head');
const facts = document.getElementById('lb-facts');
const board = document.getElementById('board');
const lead = document.getElementById('lead');
const rows = document.getElementById('rows');
const clearBoard = () => { lead.innerHTML = ''; lead.className = 'lead';
                           lead.style.background = ''; rows.innerHTML = '';
                           facts.innerHTML = ''; };

const [list, H] = await Promise.all([
  loadJSON(api('/api/campaigns')).catch(() => ({ campaigns: [] })),
  loadHarnesses(),
]);
const campaigns = list.campaigns || [];

const ago = iso => {
  if(!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if(!isFinite(s)) return 'unknown';
  if(s < 90) return 'just now';
  if(s < 5400) return `${Math.round(s / 60)}m ago`;
  if(s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// The same scale for a DURATION rather than an instant. A snapshot's age is
// unbounded — a finished campaign can be months stopped — so raw seconds would
// read as a number nobody parses.
const forS = s => {
  if(!isFinite(s)) return 'a while';
  if(s < 90) return `${Math.round(s)}s`;
  if(s < 5400) return `${Math.round(s / 60)} min`;
  if(s < 172800) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
};

if(!campaigns.length){
  head.style.display = 'none';   // no picker to head, and no list under it
  dek.style.display = '';
  dek.innerHTML = `<b>No campaigns registered.</b>`;
  board.innerHTML = `<div class="notice"><span class="tag">empty</span>
    <div>Standings are produced by <b>campaigns</b> — ranking processes that read the
    match archive and publish their results here. None has registered yet, so there is
    nothing to show. This page stays deliberately blank rather than inventing a ranking.</div></div>`;
} else {
  // ?campaign=<id> makes a particular campaign's standings linkable.
  // Default to one that is actually answering — landing on an offline campaign
  // when a working one exists would read as "the leaderboard is broken".
  const want = new URLSearchParams(location.search).get('campaign');
  let current = campaigns.find(c => c.id === want)
             || campaigns.find(c => c.online) || campaigns[0];

  // no dek here: the campaign's own meta block and the picker heading the list
  // say it. The element stays for the no-campaigns case, hidden while there is
  // something to show.
  dek.style.display = 'none';

  const paintPicker = () => {
    // A campaign is identified by its ID and nothing else — the midend keeps only
    // the routing, so the id is the one string that always exists, and it is the
    // same string in the ledger, the logs and the URL. A campaign that is not
    // answering is listed and marked, never hidden: a wedged process must not
    // look deregistered.
    dropdown(picker, {
      value: current.id,
      options: campaigns.map(c => ({
        value: c.id,
        label: c.id,
        // Facts about the TABLE, so they hang off having one — `entries` is
        // present for a live, cached OR stored document, and absent only when
        // nothing came back at all. Gating these on `online` (which means
        // "answered just now") blanked the count and the description for
        // precisely the stopped campaigns whose tables are kept on purpose.
        count: c.entries ?? '—',
        title: c.entries != null
          ? [c.campaign_type && `${c.campaign_type} scheduler`, c.description]
              .filter(Boolean).join(' — ')
          : (c.error || 'not responding'),
        // One word: the campaign is not answering. The picker is a chooser, not
        // a status board — how old the copy is belongs on the list it labels,
        // and the facts line says it once a campaign is chosen.
        tag: c.online ? '' : 'offline',
      })),
      onChange: id => {
        current = campaigns.find(c => c.id === id);
        const u = new URL(location);
        u.searchParams.set('campaign', current.id);
        history.replaceState(null, '', u);
        show(current.id);
      },
    });
  };
  paintPicker();
  show(current.id);
}

function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function show(id){
  board.innerHTML = `<p class="lb-loading">Loading ${esc(id)}…</p>`;
  clearBoard();

  // The ranking is fetched live from the campaign process, so "registered but
  // not answering" is a real state with its own 503 — report it as that,
  // naming what the campaign last managed, rather than as a generic failure or
  // (worse) an empty leaderboard that looks like nobody has played.
  let d;
  try {
    const res = await fetch(api(`/api/campaigns/${encodeURIComponent(id)}`));
    const payload = await res.json().catch(() => null);
    if(!res.ok){
      const det = payload?.detail;
      const c = det?.campaign;
      board.innerHTML = `<div class="notice"><span class="tag">offline</span>
        <div><b>${esc(id)}</b> is registered but not responding, so there is no
        ranking to show. The midend relays this campaign rather than caching it,
        so nothing is served while it is down — deliberately, since a remembered
        ranking would go quietly wrong.
        ${c?.last_seen ? ` Last heard from <b>${esc(ago(c.last_seen))}</b>.` : ''}
        <br><span class="lb-err">${esc(det?.error || `HTTP ${res.status}`)}</span></div></div>`;
      return;
    }
    d = payload;
  } catch {
    board.innerHTML = `<div class="notice"><span class="tag">error</span>
      <div>Could not reach the midend to load <b>${esc(id)}</b>.</div></div>`;
    return;
  }

  const entries = d.entries || [];
  const cols = d.columns || [];

  // A registered campaign that has not published a ranking yet is a real state,
  // not an error — say so instead of rendering an empty table.
  if(!entries.length){
    clearBoard();
    paintFacts(d);
    board.innerHTML = meta(d) + `<div class="notice"><span class="tag">pending</span>
      <div><b>${esc(id)}</b> is registered but has not published a ranking yet.</div></div>`;
    return;
  }

  board.innerHTML = meta(d);
  paintFacts(d);

  // Identity is resolved HERE, from the harness table — the campaign only ever
  // publishes the raw <model x harness> pair.
  const idLine = h => [h.fullName, h.org].filter(Boolean).join(' · ');
  const statCells = e => cols.map(c =>
    `<div><b>${esc((e.stats || {})[c.key] ?? '—')}</b><span>${esc(c.label || c.key)}</span></div>`
  ).join('');

  // --- champion block ---
  const L = entries[0], hL = H.get(L.entrant || {});
  // Sorting puts provisional entrants last, so a provisional leader means NOBODY
  // cleared the match minimum. Crowning them "champion" on one or two games would
  // be exactly the overclaim the ranking is built to avoid — say what it is.
  const stamp = L.provisional
    ? `PROVISIONAL · ${esc(hL.shortName)}`
    : `CHAMPION · ${esc(hL.shortName)}`;
  lead.className = `lead in${L.provisional ? ' prov' : ''}`;
  lead.style.background = H.duoCSS(L.entrant || {});   // wears both halves of the combo
  lead.innerHTML = `
    <div class="big">1</div>
    <div>
      <div class="stamp">${stamp}</div>
      <div class="who">${esc(L.label || L.entrant?.model || '?')}</div>
      <div class="org">${esc(idLine(hL))}</div>
      <div class="nums">
        <div class="score"><b>${esc(L.score_label ?? '')}</b><span>${esc(scoreLabel(d))}</span></div>
        ${statCells(L)}
      </div>
    </div>`;

  // --- the rest of the field ---
  rows.innerHTML = entries.slice(1).map((e, i) => {
    const t = e.entrant || {}, h = H.get(t);
    return `
    <div class="row${e.provisional ? ' prov' : ''}" style="--d:${Math.min(i, 12) * 70}ms">
      <div class="n">${e.rank ?? ''}</div>
      <div class="nm">
        <span class="hchip" style="background:${H.duoCSS(t)}" title="${esc(h.fullName)}">${esc(h.shortName)}</span>${esc(e.label || t.model || '?')}
        ${e.provisional ? `<i class="prov-tag" title="too few matches to be meaningful — ranked below everyone who cleared the bar">provisional</i>` : ''}
        <em>${esc(idLine(h))}</em>
      </div>
      <div class="elo">${esc(e.score_label ?? '')}</div>
      <div class="stats">${statCells(e)}</div>
    </div>`;
  }).join('');
}

// The score's own name comes from the campaign's algorithm line — it is not
// always a win rate, and labelling every campaign's number "Rate" would be a lie
// the moment one ranks by something else.
function scoreLabel(d){
  const a = String(d.algorithm || '').toLowerCase();
  if(a.includes('win rate')) return 'Win rate';
  if(a.includes('elo')) return 'ELO';
  if(a.includes('points')) return 'Points';
  return 'Score';
}

// How the ranking was computed. `d.notes` (the campaign's per-filter exclusion
// breakdown) is deliberately not rendered — the header's "N of M runs ranked"
// carries the same point. It remains in the API for anyone who wants the detail.
function meta(d){
  return `<div class="lb-meta">
    ${d.campaign_type ? `<div class="lb-algo"><span class="tag">type</span>${esc(d.campaign_type)}${
      d.description ? ` — ${esc(d.description)}` : ''}</div>` : ''}
    <div class="lb-algo"><span class="tag">how</span>${esc(d.algorithm || '—')}</div>
  </div>`;
}

// What the reader needs in order to trust the list they are looking at: over how
// much of the archive it was computed, and how stale it is. It sits in the
// Standings header, beside the picker, so it reads as a caption on THIS list
// rather than as another fact about the campaign.
function paintFacts(d){
  const s = d.source || {};
  // ONE freshness fact, never two. A stale copy's `ranked_at` is the campaign's
  // own, so printing it beside the staleness reads as a contradiction —
  // "ranked just now · cached 32s ago" — even though both are true. When the
  // copy is not live, its age IS the freshness, so it replaces the line rather
  // than sitting next to it.
  facts.innerHTML = `
    ${s.runs_used != null ? `<span><b>${s.runs_used}</b> of ${s.runs_total} runs ranked</span>` : ''}
    ${d.stale
      ? `<span class="lb-stale" title="${esc(d.stale_reason || 'campaign unreachable')}">cached <b>${forS(d.stale_age_s)} ago</b></span>`
      : `<span>ranked <b>${ago(d.ranked_at)}</b></span>`}`;
}
