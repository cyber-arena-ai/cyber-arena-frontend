// CyberArena — shared helpers
import { api } from './config.js';

export { api, API_BASE } from './config.js';

export async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Load the harness color table and return a resolver: get(model) -> harness meta.
// Always returns a usable object (falls back to family prefix, then a default).
// Now served by the midend (`/api/harnesses`) instead of a bundled file.
export async function loadHarnesses(path = api('/api/harnesses')){
  const table = await loadJSON(path);
  const byModel = {}, byId = {};
  table.harnesses.forEach(h => {
    byId[h.id] = h;
    (h.models || []).forEach(m => { byModel[m] = h; });
  });
  const byPrefix = m => {
    const s = String(m).toLowerCase();
    if(s.startsWith('claude')) return byId['claude-code'];
    if(s.startsWith('gpt') || s.includes('codex')) return byId['openai-codex'];
    if(s.startsWith('gemini')) return byId['gemini-cli'];
    if(s.startsWith('grok')) return byId['grok-cli'];
    if(s.startsWith('deepseek')) return byId['deepseek-cli'];
    if(s.startsWith('llama')) return byId['llama-cli'];
    return null;
  };
  return {
    table,
    get: m => byModel[m] || byPrefix(m) || { ...table.fallback, shortName: initials(m), fullName: m }
  };
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
