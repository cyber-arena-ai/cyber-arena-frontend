/* CyberArena — homepage "watch this now" strip.
   One live match at a time under the hero buttons, rolling to another RANDOM
   live match every ROTATE_MS, in a new randomly-picked accent colour. Renders NOTHING at all when no match is running:
   the host element stays empty, so a quiet day shows the homepage exactly as it
   was before.

   The matchup line is bare model names — this is a teaser, and the full
   <model x harness> identity is one click away on the match thread.

   Two facts about /api/live shape this file:
     · most live rows are `mode:"solo"` — the second seat is the orchestrator's
       `idle` placeholder, NOT a competitor. It is never drawn as one.
     · `duration_s` counts SCOREBOARD events, so it reads 0 for a match that has
       not scored yet. Elapsed comes from `started_at` (the job's created_at)
       and ticks locally; duration_s is only the fallback for a cached row
       written before that field existed. */
import { loadJSON, fmtTime, runSeconds, esc, api } from './util.js';

const ROTATE_MS = 5000;    // the user-facing cadence: a different match every 5s
const REFRESH_MS = 60000;  // re-ask who is live, so the strip empties when nobody is
const SLIDE_MS = 460;      // must match the .ln-slide transition in index.html

// The strip re-themes on every rotation. The palette is READ from the riso
// accents base.css already declares, rather than restated here, so a change to
// the design system's colours reaches this strip with no edit.
const ACCENTS = ['--pink', '--blue', '--purple', '--green']
  .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim())
  .filter(Boolean);

const host = document.getElementById('liveNow');
if (host) {
  // `card` is the frame and never moves; `slide` is the layer inside it that
  // carries one match and travels when the strip rotates
  let runs = [], cur = null, card = null, slide = null, tick = null, accent = ACCENTS[0];

  // a random OTHER accent, so consecutive matches never wear the same colour
  const nextAccent = () => {
    const others = ACCENTS.filter(c => c !== accent);
    return others.length ? others[Math.floor(Math.random() * others.length)] : accent;
  };

  // The strip spans exactly the three hero buttons, left edge to right edge.
  // Measured rather than expressed in CSS: .hero-cta is a full-width centring
  // flex row, so its box is not the buttons' box. Re-measured on resize, and
  // once more after webfonts land (they change the buttons' width).
  const cta = document.querySelector('.hero-cta');
  function fitToButtons() {
    const btns = cta ? [...cta.children] : [];
    if (!btns.length) return;
    const box = btns.map(b => b.getBoundingClientRect());
    // Narrow viewports wrap the three buttons onto separate centred lines, and
    // their union box is then just the widest button (155px at 360px wide) —
    // far too narrow. "As wide as the buttons" only means anything while they
    // are a single row; once they stack, fill the column instead.
    const oneRow = new Set(box.map(b => Math.round(b.top))).size === 1;
    host.style.width = oneRow
      ? `${Math.max(...box.map(b => b.right)) - Math.min(...box.map(b => b.left))}px`
      : '100%';
  }
  fitToButtons();
  addEventListener('resize', fitToButtons);
  if (document.fonts) document.fonts.ready.then(fitToButtons);

  // the bare model name: the backend spells some as "<vendor>/<model>"
  // ("openai/gemini-3.7-flash"), and the vendor half is noise on a teaser
  const seat = t => esc(String(t.model ?? '?').split('/').pop());

  // ONE renderer for the duration, used both to build a slide and to tick it.
  // The slide has to arrive already showing its time — filling the cell after
  // the roll made every incoming match flash an empty box for up to a second.
  const clockHTML = r => {
    const s = runSeconds(r);
    return s === null
      ? '<i class="fa-regular fa-hourglass"></i> just started'
      : `<i class="fa-regular fa-clock"></i> ${fmtTime(s)}`;
  };

  // a random OTHER match — never the one already on screen, so every swap is
  // visibly a swap (with one live match there is nothing to rotate to)
  const pick = () => {
    const others = runs.filter(r => r.id !== cur?.id);
    const from = others.length ? others : runs;
    return from[Math.floor(Math.random() * from.length)];
  };

  // one match's layer, detached — the caller decides how it enters
  function build(r) {
    cur = r;
    const solo = r.mode === 'solo';
    card.href = `trajectory.html?run=${encodeURIComponent(r.id)}`;
    const el = document.createElement('span');
    el.className = 'ln-slide';
    el.style.setProperty('--ln-accent', accent);
    el.innerHTML = `
      <span class="ln-who"><b>${seat(r.teams.team1)}</b>${solo
        ? '<span class="ln-vs">solo run</span>'
        : `<span class="ln-vs">vs</span><b>${seat(r.teams.team2)}</b>`}</span>
      <span class="ln-live"><i class="fa-solid fa-circle"></i> LIVE</span>
      <span class="ln-chal"><span>${esc(r.challenge || r.name || '')}</span></span>
      <span class="ln-clock">${clockHTML(r)}</span>
      <span class="ln-go"><i class="fa-solid fa-arrow-right"></i></span>`;
    return el;
  }

  // ONE frame for the life of the page — it holds the border and the drop
  // shadow, which must not move when the match inside it changes
  function mount(r) {
    card = document.createElement('a');
    card.className = 'live-now';
    card.title = 'watch this match live';
    host.replaceChildren(card);
    card.style.setProperty('--ln-shadow', accent);
    slide = build(r);
    card.appendChild(slide);
  }

  // both layers travel at once: the old one rides up and out, the next rises
  // into its place from below
  function roll(r) {
    if (!slide) return mount(r);
    const out = slide;
    accent = nextAccent();
    // the outgoing slide keeps the colour it was built with; the frame's
    // shadow crosses to the arriving one's over the same 460ms
    card.classList.add('rolling');
    card.style.setProperty('--ln-shadow', accent);
    const next = build(r);
    next.classList.add('enter');              // absolute, one height below
    card.appendChild(next);
    slide = next;                             // clock() ticks the arriving card
    void next.offsetWidth;                    // commit that start position
    next.classList.add('settle');
    out.classList.add('leave');
    setTimeout(() => {
      // same tick, so no frame is ever painted with the arriving layer still
      // absolute and the outgoing one already gone (the frame would collapse)
      out.remove();
      next.classList.remove('enter', 'settle');
      card.classList.remove('rolling');   // back to an instant :hover shadow
    }, SLIDE_MS + 40);
  }

  // the running duration, refreshed every second against the wall clock
  function clock() {
    const el = slide && slide.querySelector('.ln-clock');
    if (el && cur) el.innerHTML = clockHTML(cur);
  }

  async function refresh() {
    let live = [];
    // a dead midend must leave the homepage alone, not break it
    try { live = (await loadJSON(api('/api/live'))).runs || []; } catch { live = []; }
    runs = live;
    if (!runs.length) {
      host.replaceChildren(); card = slide = cur = null;
      clearInterval(tick); tick = null;
      return;
    }
    // keep showing the current match if it is still running; the rotation, not
    // the refresh, is what changes what you are looking at
    const still = runs.find(r => r.id === cur?.id);
    if (still) { cur = still; clock(); } else mount(pick());
    if (!tick) tick = setInterval(clock, 1000);
  }

  await refresh();
  setInterval(() => { if (runs.length > 1) roll(pick()); }, ROTATE_MS);
  setInterval(refresh, REFRESH_MS);
}
