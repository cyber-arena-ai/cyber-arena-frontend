// Games — the challenge arena. Probes the warehouse registry (index.json) and
// renders every challenge as a card. No hardcoded list; add a YAML + rebuild the
// index and it shows up here automatically.
import { loadJSON, loadHarnesses, esc, setActiveNav, api } from './util.js';
import { reg } from './config.js';

setActiveNav('games.html');

const D = await loadJSON(reg('/index.json'));
const chals = D.challenges || [];

const coverURL = c => reg('/' + (c.cover?.image || `covers/${c.slug}.png`));
const avatarURL = c => reg('/avatar/' + c.contributor + '.png');
const originLabel = t => (t === 'ctf' ? 'CTF' : t === 'real-world' ? 'REAL-WORLD' : '');

/* ---- masthead / dek / summary ---- */
const contributors = [...new Set(chals.map(c => c.contributor))];
const ctf = chals.filter(c => c.origin?.type === 'ctf').length;
const real = chals.filter(c => c.origin?.type === 'real-world').length;

document.getElementById('mastmeta').textContent = `${chals.length} challenges`;
document.getElementById('dek').innerHTML =
  `<b>${chals.length} challenges</b> across ${contributors.length} contributors — the services agents attack and defend.`;
document.getElementById('summary').innerHTML = `
  <div><b>${chals.length}</b><span>Challenges</span></div>
  <div class="acc-b"><b>${real}</b><span>Real-world</span></div>
  <div class="acc-p"><b>${ctf}</b><span>CTF</span></div>
  <div><b>${contributors.length}</b><span>Contributors</span></div>`;

/* ---- cards (title always shown; details slide up on hover) ---- */
function chip(t) {
  const origin = t === 'ctf' || t === 'real-world';
  return `<span class="chip${origin ? ' chip-o' : ''}">${esc(t)}</span>`;
}
function tagChips(tags, max = 5) {
  const shown = tags.slice(0, max), extra = tags.length - shown.length;
  return shown.map(chip).join('') + (extra > 0 ? `<span class="chip chip-more">+${extra}</span>` : '');
}
function diffPill(d) { return `<span class="gdiff ${d || ''}">${esc(d || '')}</span>`; }
function authorLink(c, avClass) {
  const gh = `https://github.com/${encodeURIComponent(c.contributor)}`;
  return `<a class="gauthor" href="${gh}" target="_blank" rel="noopener" title="@${esc(c.contributor)} on GitHub">
    <img class="gav ${avClass}" loading="lazy" src="${avatarURL(c)}" alt="" onerror="this.style.visibility='hidden'">
    <span class="ghandle">${esc(c.contributor)}</span></a>`;
}

function card(c, i) {
  const cl = c.classification || {}, svc = c.service || {};
  const ports = Object.values(svc.ports || {}).join(' · ');
  const accent = c.cover?.accent || 'var(--ink)';
  // --d staggers the float-in, capped so a big catalogue doesn't crawl
  return `<div class="gcard" data-slug="${c.slug}" tabindex="0" role="link" aria-label="${esc(c.title || c.slug)}" style="--accent:${accent};--d:${Math.min(i, 12) * 70}ms">
    <div class="gcover"><img loading="lazy" src="${coverURL(c)}" alt=""></div>
    <div class="ginfo">
      <div class="gbanner"><h3 class="gtitle">${esc(c.title || c.slug)}</h3>${diffPill(cl.difficulty)}</div>
      <div class="gdetails">
        <p class="gtagline">${esc(c.card?.tagline || '')}</p>
        <div class="gtags">${tagChips(c.tags || [])}</div>
        <div class="gmeta">
          <span class="gvuln">${esc(cl.vuln_class || '')}</span>
          ${svc.protocol ? `<span class="gport">${esc(svc.protocol)} ${esc(ports)}</span>` : ''}
        </div>
        <div class="gfoot">
          ${authorLink(c, '')}
          <span class="gorigin ${c.origin?.type || ''}">${originLabel(c.origin?.type)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

const grid = document.getElementById('grid');
// resting peek = each card's own title-bar height (1 or 2 lines), so the whole
// title always shows before hover
function setPeeks() {
  grid.querySelectorAll('.gcard').forEach(card => {
    const b = card.querySelector('.gbanner');
    if (b) card.style.setProperty('--peek', b.offsetHeight + 'px');
  });
}
function renderGrid(list) {
  grid.innerHTML = list.length ? list.map(card).join('') : `<p class="empty">No challenges match.</p>`;
  setPeeks();
}
renderGrid(chals);
// title wrap (and thus banner height) shifts with fonts + column width
if (document.fonts?.ready) document.fonts.ready.then(setPeeks);
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(setPeeks, 150); });

// cards are click-handled divs (so the author can be a real <a>); any click that
// isn't on a real link opens the detail sheet via the hash
grid.addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const card = e.target.closest('.gcard');
  if (card) location.hash = card.dataset.slug;
});
grid.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const card = e.target.closest('.gcard');
  if (card) { e.preventDefault(); location.hash = card.dataset.slug; }
});

/* ---- filters — origin + surface facets that are actually present ---- */
const FACETS = ['ctf', 'real-world', 'web', 'binary', 'crypto', 'net', 'rev', 'misc'];
const present = FACETS.filter(f => chals.some(c => (c.tags || []).includes(f)));
const count = f => f === 'all' ? chals.length : chals.filter(c => (c.tags || []).includes(f)).length;
document.getElementById('filt').innerHTML =
  [{ k: 'all', l: 'all' }, ...present.map(f => ({ k: f, l: f }))]
    .map((f, i) => `<button data-f="${f.k}" class="${f.k} ${i === 0 ? 'on' : ''}">${f.l} <b>${count(f.k)}</b></button>`)
    .join('');
document.querySelectorAll('#filt button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#filt button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const f = b.dataset.f;
  renderGrid(f === 'all' ? chals : chals.filter(c => (c.tags || []).includes(f)));
});

/* ---- match history (from the midend; challenge slug == run.name) ---- */
let _runs;   // undefined=not fetched, null=fetch failed, [] / [...] = loaded
async function allRuns() {
  if (_runs !== undefined) return _runs;
  try { _runs = (await loadJSON(api('/api/runs?all=true'))).runs || []; }
  catch { _runs = null; }
  return _runs;
}
let _H;
async function harnesses() {
  if (_H !== undefined) return _H;
  try { _H = await loadHarnesses(); } catch { _H = null; }
  return _H;
}
// a team is a <model × harness> entrant — label both halves when resolvable
const teamLabel = (H, t) =>
  (H && (t.model || t.harness)) ? H.comboLabel(t) : (t.model || t.label || '?');
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function dLabel(d) { const [, m, day] = (d || '2026-01-01').split('-'); return `${MON[+m-1]} ${+day}`; }

function runRow(r, H) {
  const t1 = r.teams?.team1 || {}, t2 = r.teams?.team2 || {};
  const w = r.winner;
  const s1 = `<b class="${w === 'team1' ? 'win' : ''}">${r.score?.team1 ?? '–'}</b>`;
  const s2 = `<b class="${w === 'team2' ? 'win' : ''}">${r.score?.team2 ?? '–'}</b>`;
  const state = r.state === 'live'
    ? `<span class="hstate live"><i class="fa-solid fa-circle"></i> live</span>`
    : r.state === 'failed' ? `<span class="hstate failed">failed</span>` : '';
  return `<a class="hrow" href="trajectory.html?run=${r.id}">
    <span class="hdate">${dLabel(r.date)}</span>
    <span class="hvs">${esc(teamLabel(H, t1))} <em>vs</em> ${esc(teamLabel(H, t2))}</span>
    <span class="hscore">${s1}<i>–</i>${s2}</span>
    ${state}
    <i class="arw hgo"></i>
  </a>`;
}
async function loadHistory(slug) {
  const el = document.getElementById('sheet-history');
  if (!el) return;
  const [runs, H] = await Promise.all([allRuns(), harnesses()]);
  if (runs === null) { el.innerHTML = `<p class="hnote">Match history unavailable.</p>`; return; }
  const mine = runs.filter(r => r.name === slug);
  el.innerHTML = mine.length
    ? mine.map(r => runRow(r, H)).join('')
    : `<p class="hnote">No matches recorded yet.</p>`;
}

/* ---- detail sheet ---- */
const sheet = document.getElementById('sheet');
const sheetCard = document.getElementById('sheet-card');

function openSheet(c) {
  const cl = c.classification || {}, o = c.origin || {}, svc = c.service || {};
  const ports = Object.entries(svc.ports || {}).map(([k, v]) => `${k}:${v}`).join(' · ');
  const src = o.url
    ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.source || o.reference || 'source')} <i class="arw up"></i></a>`
    : esc(o.source || '—');
  sheetCard.style.setProperty('--accent', c.cover?.accent || 'var(--ink)');
  sheetCard.innerHTML = `
    <button class="sheet-x" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    <div class="sheet-cover"><img src="${coverURL(c)}" alt=""></div>
    <div class="sheet-body">
      <div class="sheet-head"><h2>${esc(c.title || c.slug)}</h2>${diffPill(cl.difficulty)}</div>
      <p class="sheet-tagline">${esc(c.card?.tagline || '')}</p>
      <div class="gtags">${(c.tags || []).map(chip).join('')}</div>
      <p class="sheet-summary">${esc(c.card?.summary || '')}</p>
      <div class="sheet-ad">
        <div><h4><i class="fa-solid fa-bolt"></i> Attack</h4><p>${esc(c.card?.attack || '')}</p></div>
        <div><h4><i class="fa-solid fa-shield-halved"></i> Defense</h4><p>${esc(c.card?.defense || '')}</p></div>
      </div>
      <dl class="sheet-facts">
        <dt>Vulnerability</dt><dd>${esc(cl.vuln_class || '—')}${cl.cve ? ` · ${esc([].concat(cl.cve).join(', '))}` : ''}</dd>
        <dt>Service</dt><dd>${esc(svc.stack || '—')}${ports ? ` · ${esc(ports)}` : ''}</dd>
        <dt>Origin</dt><dd><span class="gorigin ${o.type || ''}">${originLabel(o.type)}</span> ${src}</dd>
        <dt>Author</dt><dd>${authorLink(c, 'sm')}</dd>
      </dl>
      <div class="sheet-hist">
        <h4><i class="fa-solid fa-clock-rotate-left"></i> Match history</h4>
        <div class="hlist" id="sheet-history"><p class="hnote">Loading…</p></div>
      </div>
    </div>`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  loadHistory(c.slug);
}
function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

// the hash is the source of truth — cards are <a href="#slug">, so a click, a
// shared link, or back/forward all route through here
function syncFromHash() {
  const c = chals.find(x => x.slug === decodeURIComponent(location.hash.slice(1)));
  if (c) openSheet(c); else closeSheet();
}
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
window.addEventListener('hashchange', syncFromHash);
syncFromHash();
