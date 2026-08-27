// Leaderboard — standings published by CAMPAIGNS.
//
// The midend is a RELAY. It persists nothing about a ranking — it keeps a
// routing table of campaign ids and endpoints, and asks the campaign itself for
// everything else, behind a short-TTL response cache. A cached copy served
// while the campaign is unreachable arrives marked `stale`, and is shown as
// such: a held ranking must never be presented as a current one. A campaign (cyber-arena-deploy/campaign/) is a persistent
// process beside the midend: it pulls the run list, applies its own selection
// and algorithm, and serves the result over loopback. So every field on this
// page is the campaign's own word, read live — including its name. That is the point: a ranking is one campaign's opinion, named and
// comparable, not an unattributed number handed down by the server.
//
// The table is GENERIC. Each campaign declares its own `columns`, so a new
// campaign with a different algorithm renders here without a frontend change.
import { loadJSON, loadHarnesses, setActiveNav, api } from './util.js';

setActiveNav('leaderboard.html');

const dek = document.getElementById('dek');
const picker = document.getElementById('campaigns');
const board = document.getElementById('board');

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

if(!campaigns.length){
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

  dek.innerHTML = `<b>${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}</b>`
    + ` · each ranks the archive its own way — pick whose standings to read.`;

  const paintPicker = () => {
    // an offline campaign has no name to show — the midend does not keep one —
    // so it is listed by id and visibly marked, not hidden
    picker.innerHTML = campaigns.map(c =>
      `<button data-c="${c.id}" class="${c.id === current.id ? 'on' : ''}${c.online ? '' : ' off'}"
         title="${esc(c.online ? (c.description || '') : (c.error || 'not responding'))}"
        >${esc(c.name || c.id)}${c.stale ? ' <i class="pstale" title="cached; the campaign is not answering">·</i>' : ''} <b>${c.online ? c.entries : '—'}</b></button>`
    ).join('');
    picker.querySelectorAll('button').forEach(b => b.onclick = () => {
      current = campaigns.find(c => c.id === b.dataset.c);
      const u = new URL(location);
      u.searchParams.set('campaign', current.id);
      history.replaceState(null, '', u);
      paintPicker(); show(current.id);
    });
  };
  paintPicker();
  show(current.id);
}

function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function show(id){
  board.innerHTML = `<p class="lb-loading">Loading ${esc(id)}…</p>`;

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
    board.innerHTML = meta(d) + `<div class="notice"><span class="tag">pending</span>
      <div><b>${esc(d.name || id)}</b> is registered but has not published a ranking yet.</div></div>`;
    return;
  }

  const head = `<tr><th class="c-rank">#</th><th class="c-ent">Entrant</th>
    <th class="c-score">Rate</th>${cols.map(c => `<th>${esc(c.label || c.key)}</th>`).join('')}</tr>`;

  const rows = entries.map(e => {
    // identity is resolved HERE, from the harness table — the campaign only ever
    // publishes the raw <model x harness> pair
    const t = e.entrant || {};
    const h = H.get(t);
    const duo = H.duoCSS(t);
    const pct = Math.max(0, Math.min(100, Math.round((e.score ?? 0) * 100)));
    return `<tr class="${e.provisional ? 'prov' : ''}${e.rank === 1 ? ' top' : ''}">
      <td class="c-rank">${e.rank ?? ''}</td>
      <td class="c-ent">
        <span class="duo" style="background:${duo}"></span>
        <span class="lb-model">${esc(e.label || t.model || '?')}</span>
        <i class="hb" title="${esc(h.fullName)}">${esc(h.shortName)}</i>
        ${e.provisional ? `<span class="prov-tag" title="too few matches to be meaningful — ranked below everyone who cleared the bar">provisional</span>` : ''}
      </td>
      <td class="c-score">
        <span class="sc">${esc(e.score_label ?? pct + '%')}</span>
        <span class="scbar"><i style="width:${pct}%;background:${h.color}"></i></span>
      </td>
      ${cols.map(c => `<td>${esc((e.stats || {})[c.key] ?? '—')}</td>`).join('')}
    </tr>`;
  }).join('');

  board.innerHTML = meta(d) + `<div class="lb-wrap"><table class="lb">
    <thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

// What a reader needs in order to trust the number: how it was computed, over
// how much of the archive, what was left out, and how stale it is.
function meta(d){
  const s = d.source || {};
  const notes = (d.notes || []).map(n => `<li>${esc(n)}</li>`).join('');
  return `<div class="lb-meta">
    <div class="lb-algo"><span class="tag">how</span>${esc(d.algorithm || '—')}</div>
    <div class="lb-facts">
      ${s.runs_used != null ? `<span><b>${s.runs_used}</b> of ${s.runs_total} runs ranked</span>` : ''}
      <span>ranked <b>${ago(d.ranked_at)}</b></span>
      ${d.stale ? `<span class="lb-stale" title="${esc(d.stale_reason || 'campaign unreachable')}">
        cached — the campaign stopped answering ${Math.round(d.stale_age_s)}s ago</span>` : ''}
    </div>
    ${notes ? `<ul class="lb-notes">${notes}</ul>` : ''}
  </div>`;
}
