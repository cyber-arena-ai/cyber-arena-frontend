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

// Challenge registry — served straight from the public challenge-warehouse repo
// (no midend). Default is the jsDelivr CDN mirror of the repo; override with
// ?reg=<base> (e.g. a local http server on the warehouse) for debug.
const regQuery = qs.get('reg');
if (regQuery) localStorage.setItem('registry_base', regQuery);

export const REGISTRY_BASE = (
  regQuery ||
  localStorage.getItem('registry_base') ||
  (typeof window !== 'undefined' && window.REGISTRY_BASE) ||
  'https://cdn.jsdelivr.net/gh/cyber-arena-ai/challenge-warehouse@main'
).replace(/\/$/, '');

// path is relative to _registry/ (e.g. reg('/index.json'), reg('/covers/x.png'))
export const reg = path => `${REGISTRY_BASE}/_registry${path.startsWith('/') ? '' : '/'}${path}`;

// The archive corpus, in one place: real results plus matches still being
// played, and only ones whose thread can be opened. It is a POLICY, not a
// convenience — three pages have to agree on it or Random Match and the Games
// view show a different set of matches than the Runs page does.
//
// `running` is not optional: a live match is `outcome=running, parse=ok`, and
// dropping it takes the LIVE rows off the Runs page. Cancelled matches are
// deliberately out — one stopped 18 seconds in still records whatever the board
// held, which reads as a nil-nil draw.
export const ARCHIVE_RUNS = '/api/runs?outcome=succeeded,running&parse=ok';
