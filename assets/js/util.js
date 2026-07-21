// CyberArena — shared helpers
import { api } from './config.js';

export { api, API_BASE } from './config.js';

export async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Load the harness color table and return a combo-aware resolver.
//
// The competitive entity is a <model × harness> pair — the same model can run
// under different harnesses in future seasons, so identity is never the model
// alone. `get(x)` accepts a team/agent object ({model, harness?}) or a bare
// model string (legacy). The harness half resolves in order:
//   1. an explicit `harness` field on the entity (matched loosely against the
//      table: id, fullName, cli binary name, declared aliases)
//   2. the model -> harness binding in the table (today's data: 1:1)
//   3. model-family prefix fallback
//   4. a SYNTHESIZED identity — initials + a stable color hashed from the name
//      out of the riso accent palette. The table is a curation layer, not a
//      fixed pool: unknown harnesses still get a distinct, stable identity.
// Always returns a usable object (color/shortName/fullName).
export async function loadHarnesses(path = api('/api/harnesses')){
  const table = await loadJSON(path);
  const byModel = {}, byId = {}, byAlias = {};
  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  table.harnesses.forEach(h => {
    byId[h.id] = h;
    (h.models || []).forEach(m => { byModel[m] = h; });
    // the backend names harnesses loosely ("claude", "codex"), so match wide
    [h.id, h.fullName, String(h.cli || '').split(/\s/)[0], ...(h.aliases || [])]
      .map(norm).filter(Boolean).forEach(a => { if(!byAlias[a]) byAlias[a] = h; });
  });
  const byPrefix = m => {
    const s = String(m ?? '').toLowerCase();
    if(s.startsWith('claude')) return byId['claude-code'];
    if(s.startsWith('gpt') || s.includes('codex')) return byId['openai-codex'];
    if(s.startsWith('gemini')) return byId['gemini-cli'];
    if(s.startsWith('grok')) return byId['grok-cli'];
    if(s.startsWith('deepseek')) return byId['deepseek-cli'];
    if(s.startsWith('llama')) return byId['llama-cli'];
    return null;
  };
  // synthesized identity for anything outside the table: initials + a color
  // picked deterministically (name hash) from the riso accent palette, so a
  // brand-new harness is stable and distinct without a table edit
  const PALETTE = ['#2540FF', '#FF3D7F', '#0E9E6E', '#6B2BD9', '#1AA3C4', '#E8761A', '#E8A11B', '#D62F2F'];
  const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const synth = name => {
    const n = String(name ?? '?');
    return { ...table.fallback, id: norm(n), shortName: initials(n), fullName: n,
             color: PALETTE[hash(norm(n)) % PALETTE.length], synthetic: true };
  };
  const model = x => (x && typeof x === 'object') ? x.model : x;
  const get = x => {
    // an explicit harness always wins — even unknown, it must not be rendered
    // as the model's table binding (that's exactly the 1:1 assumption we drop)
    if(x && typeof x === 'object' && x.harness) return byAlias[norm(x.harness)] || synth(x.harness);
    const m = model(x);
    return byModel[m] || byAlias[norm(m)] || byPrefix(m) || synth(m);
  };
  // dedupe/ranking key for an entity — model × harness, never model alone.
  // An explicit-but-unknown harness still keys distinctly (synth carries its
  // normalized name as the id).
  const comboKey = x => {
    const h = get(x);
    return `${model(x) || '?'}@${h.id || norm(h.fullName)}`;
  };
  const comboLabel = x => `${model(x) || '?'} · ${get(x).shortName}`;
  // the model half's own color: what the model alone resolves to
  const modelColor = x => { const m = model(x); return (byModel[m] || byPrefix(m) || synth(m)).color; };
  // the <model × harness> combination is indicated as a HALF-HALF disc —
  // model color on top, harness color below — never an invented third color.
  // Collapses to a solid when the two halves agree (model bound to harness).
  const duoCSS = x => {
    const mc = modelColor(x), hc = get(x).color;
    return mc === hc ? hc : `linear-gradient(180deg, ${mc} 0 50%, ${hc} 50% 100%)`;
  };
  // per-team ACCENT colors (--t1/--t2, text, borders — places that need one
  // color): pick the component that actually differs between the two entrants
  // — harness color when distinct, else model color, else a palette shift
  // (true mirror match). Takes the raw entities, returns harness-identity
  // objects with `color` set to the accent.
  const distinctPair = (x1, x2) => {
    const h1 = get(x1), h2 = get(x2);
    if(h1.color !== h2.color) return [h1, h2];
    const m1 = modelColor(x1), m2 = modelColor(x2);
    if(m1 !== m2) return [{ ...h1, color: m1 }, { ...h2, color: m2 }];
    return [h1, { ...h2, color: PALETTE.find(c => c !== h1.color) }];
  };
  return { get, comboKey, comboLabel, duoCSS, distinctPair };
}

export const fmtTime = s => `${Math.floor(s/60)}:${String(Math.round(s)%60).padStart(2,'0')}`;
export const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export const initials = m => m.split(/[-\s]/)[0].slice(0,2).toUpperCase();

// mark the current page's nav link
export function setActiveNav(page){
  document.querySelectorAll('.navlinks a').forEach(a=>{
    if(a.getAttribute('href') === page) a.classList.add('active');
  });
}
