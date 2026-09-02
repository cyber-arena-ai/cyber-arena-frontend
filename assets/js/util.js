// CyberArena — shared helpers
import { api } from './config.js';

export { api, API_BASE } from './config.js';

export async function loadJSON(path, init){
  const res = await fetch(path, init);
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
/* ---- vendor colour system -------------------------------------------------
   COLOUR IS CARRIED BY THE VENDOR, not the harness. A model's identity is who
   built it, so `claude-opus-4-8` is Anthropic blue whether it ran under Claude
   Code, opencode, or anything else — otherwise the same model changes colour
   between rows and the eye reads it as two competitors.

   Hues are spread as far apart as nine vendors allow (the wheel is only 360°),
   and separation is reinforced with lightness where hue alone would be tight.
   Anthropic/OpenAI keep the riso --blue/--pink so the existing pages do not
   shift under this change.

   A NATIVE harness — one built by the model's own vendor, claude+claude-code,
   gpt+codex, qwen+qwen — shares the vendor colour, so the combo disc renders
   solid. A vendor-neutral harness (opencode, openhands, nexau) has no colour of
   its own and takes a graphite tone, letting the model's vendor dominate. That
   is the whole rule: colour tells you the vendor, and a split disc tells you the
   model is running somewhere other than home. */
export const VENDORS = {
  anthropic: { label: 'Anthropic', color: '#2540FF' },  // blue    231°
  openai:    { label: 'OpenAI',    color: '#FF3D7F' },  // pink    340°
  google:    { label: 'Google',    color: '#0E9E6E' },  // green   160°
  xai:       { label: 'xAI',       color: '#6B2BD9' },  // violet  267°
  deepseek:  { label: 'DeepSeek',  color: '#1AA3C4' },  // cyan    191°
  moonshot:  { label: 'Moonshot',  color: '#E8761A' },  // orange   27°
  alibaba:   { label: 'Alibaba',   color: '#8C8A00' },  // olive    78°
  zhipu:     { label: 'Zhipu',     color: '#9E1B1B' },  // crimson   0° (dark)
  meta:      { label: 'Meta',      color: '#2F6B1F' },  // forest  107° (dark)
};
// A harness with no vendor of its own. Deliberately colourless: it must not
// compete with the vendor hue it sits beside.
const NEUTRAL = '#5A5347';

// model name -> vendor. Ordered: the FIRST match wins, so a more specific
// prefix must come before a looser one.
const MODEL_VENDOR = [
  [/^claude|^opus|^sonnet|^haiku|^fable/, 'anthropic'],
  [/^gpt|codex|^o[1-4]\b/,               'openai'],
  [/^gemini/,                            'google'],
  [/^grok/,                              'xai'],
  [/^deepseek|^ds-/,                     'deepseek'],
  [/^kimi|^moonshot/,                    'moonshot'],
  [/^qwen|^qwq/,                         'alibaba'],
  [/^glm|^chatglm/,                      'zhipu'],
  [/^llama/,                             'meta'],
];
// harness -> the vendor that builds it, or null for vendor-neutral. Keys are
// normalised, so `dsh`, `deepseek` and `deepseek-cli` all land in one place.
const HARNESS_VENDOR = {
  claude: 'anthropic', claudecode: 'anthropic', cc: 'anthropic',
  codex: 'openai', openaicodex: 'openai', cx: 'openai',
  gemini: 'google', geminicli: 'google',
  grok: 'xai', grokcli: 'xai',
  deepseek: 'deepseek', dsh: 'deepseek', deepseekcli: 'deepseek',
  kimi: 'moonshot', kimicli: 'moonshot',
  qwen: 'alibaba', qwencode: 'alibaba',
  llama: 'meta', llamacli: 'meta',
  // vendor-neutral: general harnesses that run anyone's model
  opencode: null, openhands: null, nexau: null, script: null, idle: null,
};

const _norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The vendor id for a model name, or '' when nothing matches. */
export function vendorOf(model){
  const m = String(model ?? '').toLowerCase().trim();
  for(const [re, v] of MODEL_VENDOR) if(re.test(m)) return v;
  return '';
}
/** The vendor id a harness belongs to: '' when vendor-neutral or unknown. */
export function harnessVendorOf(harness){
  const k = _norm(harness);
  if(k in HARNESS_VENDOR) return HARNESS_VENDOR[k] || '';
  return vendorOf(harness);   // e.g. a harness literally named "claude-code"
}

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
  // The model half's colour is its VENDOR's — never the harness it happens to
  // be running under, or the same model would change colour between rows.
  // The harness table is only consulted for a model whose vendor we cannot
  // name, so a curated entry still beats a hash.
  const modelColor = x => {
    const m = model(x);
    const v = vendorOf(m);
    if(v) return VENDORS[v].color;
    return (byModel[m] || byPrefix(m) || synth(m)).color;
  };
  // A harness wears its own vendor's colour (claude-code is Anthropic blue) and
  // graphite when it has none — a general harness must not compete with the
  // vendor hue beside it.
  const harnessColor = x => {
    const h = get(x);
    const v = harnessVendorOf((x && typeof x === 'object' && x.harness) || h.id || h.fullName);
    if(v) return VENDORS[v].color;
    return _norm(h.id) in HARNESS_VENDOR ? NEUTRAL : h.color;
  };
  // Is the model running on a harness built by its own vendor?
  const isNative = x => {
    const v = vendorOf(model(x));
    const h = get(x);
    return !!v && v === harnessVendorOf((x && typeof x === 'object' && x.harness) || h.id || h.fullName);
  };
  // the <model × harness> combination is indicated as a HALF-HALF disc —
  // model color on top, harness color below — never an invented third color.
  // Collapses to a solid when the two halves agree (model bound to harness).
  const duoCSS = x => {
    const mc = modelColor(x), hc = harnessColor(x);
    return mc === hc ? hc : `linear-gradient(180deg, ${mc} 0 50%, ${hc} 50% 100%)`;
  };
  // per-team ACCENT colors (--t1/--t2, text, borders — places that need one
  // color): pick the component that actually differs between the two entrants
  // — harness color when distinct, else model color, else a palette shift
  // (true mirror match). Takes the raw entities, returns harness-identity
  // objects with `color` set to the accent.
  // vendor identity for a legend or a tooltip
  const vendor = x => {
    const v = vendorOf(model(x));
    return v ? { id: v, ...VENDORS[v] } : { id: '', label: 'unknown', color: modelColor(x) };
  };
  const distinctPair = (x1, x2) => {
    // vendor first: it is the axis a reader is most likely to care about
    const h1 = get(x1), h2 = get(x2);
    const m1 = modelColor(x1), m2 = modelColor(x2);
    if(m1 !== m2) return [{ ...h1, color: m1 }, { ...h2, color: m2 }];
    const c1 = harnessColor(x1), c2 = harnessColor(x2);
    if(c1 !== c2) return [{ ...h1, color: c1 }, { ...h2, color: c2 }];
    return [h1, { ...h2, color: PALETTE.find(c => c !== h1.color) }];
  };
  return { get, comboKey, comboLabel, duoCSS, modelColor, harnessColor,
           isNative, vendor, distinctPair };
}

export const fmtTime = s => `${Math.floor(s/60)}:${String(Math.round(s)%60).padStart(2,'0')}`;
export const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
export const initials = m => m.split(/[-\s]/)[0].slice(0,2).toUpperCase();

// page buttons for a paged list (runs archive, games grid) — hidden when one
// page; long ranges condense to 1 … n-1 n n+1 … last. `go(p)` re-renders.
export function renderPager(el, page, pages, go){
  if(pages <= 1){ el.innerHTML = ''; return; }
  const want = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [];
  let prev = 0;
  for(let p = 1; p <= pages; p++){
    if(!want.has(p)) continue;
    if(p - prev > 1) nums.push(`<span class="gap">…</span>`);
    nums.push(`<button data-p="${p}" class="${p === page ? 'on' : ''}">${p}</button>`);
    prev = p;
  }
  el.innerHTML = `<button data-p="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">←</button>
    ${nums.join('')}
    <button data-p="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="Next page">→</button>`;
  el.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => go(+b.dataset.p));
}

// mark the current page's nav link
export function setActiveNav(page){
  document.querySelectorAll('.navlinks a').forEach(a=>{
    if(a.getAttribute('href') === page) a.classList.add('active');
  });
}

/* ---- dropdown ------------------------------------------------------------
   A hand-built listbox, used wherever a page slices by campaign. Not a native
   <select>: that control cannot take the riso treatment and read as part of the
   page. The cost of dropping it is that everything it did for free has to be
   done here — roving focus, type-ahead-free arrow navigation, Escape, click-
   outside, and the ARIA that makes it announce as a listbox.

   options: [{ value, label, count?, tag?, title?, current? }]
   Returns { el, set(value), destroy() }. */
export function dropdown(host, { label = '', options = [], value, onChange }) {
  const opts = options.slice();
  let open = false, active = Math.max(0, opts.findIndex(o => o.value === value));

  const wrap = document.createElement('span');
  wrap.className = 'cpick';
  wrap.innerHTML =
    (label ? `<span class="cplabel">${esc(label)}</span>` : '') +
    `<span class="dd" data-open="false">
       <button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false">
         <span class="dd-cur"></span><b></b><i class="dd-car"></i>
       </button>
       <ul class="dd-menu" role="listbox" tabindex="-1"></ul>
     </span>`;
  const dd = wrap.querySelector('.dd');
  const btn = wrap.querySelector('.dd-btn');
  const menu = wrap.querySelector('.dd-menu');

  const paintBtn = () => {
    const o = opts.find(x => x.value === value) || opts[0] || {};
    wrap.querySelector('.dd-cur').textContent = o.label ?? '';
    wrap.querySelector('.dd-btn b').textContent = o.count ?? '';
    btn.title = o.title || '';
  };
  const paintMenu = () => {
    menu.innerHTML = opts.map((o, i) =>
      `<li role="option" data-v="${esc(o.value)}" title="${esc(o.title || '')}"
           aria-selected="${o.value === value}"
           class="${o.value === value ? 'on' : ''}${i === active ? ' act' : ''}"
         ><span>${esc(o.label)}${o.tag ? ` <span class="dd-tag">${esc(o.tag)}</span>` : ''}</span>`
      + `<b>${o.count ?? ''}</b></li>`).join('');
  };

  const setOpen = (v) => {
    open = v;
    dd.dataset.open = String(v);
    btn.setAttribute('aria-expanded', String(v));
    if (v) { active = Math.max(0, opts.findIndex(o => o.value === value)); paintMenu(); }
  };
  const choose = (v) => {
    if (v !== value) { value = v; paintBtn(); onChange?.(v); }
    setOpen(false);
    btn.focus();
  };
  const move = (d) => {
    if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    paintMenu();
    menu.children[active]?.scrollIntoView({ block: 'nearest' });
  };

  btn.onclick = (e) => { e.stopPropagation(); setOpen(!open); };
  menu.onclick = (e) => {
    const li = e.target.closest('li');
    if (li) { e.stopPropagation(); choose(li.dataset.v); }
  };
  // pointer highlight tracks the keyboard cursor, so the two never disagree
  menu.onmousemove = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const i = [...menu.children].indexOf(li);
    if (i !== active) { active = i; paintMenu(); }
  };
  wrap.onkeydown = (e) => {
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'Enter' || k === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); setOpen(false); btn.focus(); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Home') { e.preventDefault(); active = 0; paintMenu(); }
    else if (k === 'End') { e.preventDefault(); active = opts.length - 1; paintMenu(); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(opts[active]?.value); }
    else if (k === 'Tab') setOpen(false);
  };
  const onDoc = () => { if (open) setOpen(false); };
  document.addEventListener('click', onDoc);

  // set the closed state through the same path that toggles it, rather than
  // trusting the markup above to agree with it
  setOpen(false);
  paintBtn(); paintMenu();
  host.replaceChildren(wrap);
  return {
    el: wrap,
    set(v) { value = v; paintBtn(); paintMenu(); },
    destroy() { document.removeEventListener('click', onDoc); },
  };
}
