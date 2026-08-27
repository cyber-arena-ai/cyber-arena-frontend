// Leaderboard — standings published by CAMPAIGNS.
//
// The midend ranks nothing. A campaign (cyber-arena-deploy/campaign/) pulls the
// run list, applies its own selection and algorithm, and publishes the result;
// this page lists what is registered and lets the reader choose whose standings
// to read. That is the point: a ranking is one campaign's opinion, named and
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
  // ?campaign=<id> makes a particular campaign's standings linkable
  const want = new URLSearchParams(location.search).get('campaign');
  let current = campaigns.find(c => c.id === want) || campaigns[0];

  dek.innerHTML = `<b>${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}</b>`
    + ` · each ranks the archive its own way — pick whose standings to read.`;

  const paintPicker = () => {
    picker.innerHTML = campaigns.map(c =>
      `<button data-c="${c.id}" class="${c.id === current.id ? 'on' : ''}"
         title="${esc(c.description || '')}">${esc(c.name || c.id)} <b>${c.entries}</b></button>`
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
  let d;
  try { d = await loadJSON(api(`/api/campaigns/${encodeURIComponent(id)}`)); }
  catch { board.innerHTML = `<div class="notice"><span class="tag">error</span>
    <div>Could not load <b>${esc(id)}</b>.</div></div>`; return; }

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
      <span>updated <b>${ago(d.ranked_at || d.updated_at)}</b></span>
    </div>
    ${notes ? `<ul class="lb-notes">${notes}</ul>` : ''}
  </div>`;
}
