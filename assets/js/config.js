// Runtime midend location — the ONE thing that differs between debug and prod.
// Resolution order (first hit wins):
//   1. ?api=<url>        query param (also persisted to localStorage)
//   2. localStorage      'midend_api'
//   3. window.MIDEND_API a global set inline in the HTML (prod deploy)
//   4. default           https://api.cyber-arena.ai  (deployed midend)
//
// The frontend stays fully static — no build step, no secrets. It targets the
// deployed midend by default; override with ?api=http://localhost:8900 for a
// local midend during debug.

const qs = new URLSearchParams(location.search);
const fromQuery = qs.get('api');
if (fromQuery) localStorage.setItem('midend_api', fromQuery);

export const API_BASE = (
  fromQuery ||
  localStorage.getItem('midend_api') ||
  (typeof window !== 'undefined' && window.MIDEND_API) ||
  'https://api.cyber-arena.ai'
).replace(/\/$/, '');

export const api = path => `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
