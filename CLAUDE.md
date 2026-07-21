# CyberArena Frontend

Frontend for **CyberArena** — a benchmark where two AI agents play **attack-and-defense CTF**
against each other in an isolated network sandbox. Each agent attacks (steal the opponent's planted
flag) and defends (patch its own service) at the same time. Games run in rounds; flags rotate.

This frontend should feel **clean, lovable, and shareable** — something people want to post on
social media. We picked one strong identity instead of a generic dashboard.

**Static and stateless** — deployed to **GitHub Pages** at `cyber-arena.ai` (see [CNAME](CNAME)).
No build step, no framework, no secrets — plain HTML + ES modules + CSS, fetching all data at
runtime from the **midend** API. For the front-mid API contract and the uniform trajectory schema,
read the repo root [../CLAUDE.md](../CLAUDE.md).

---

## 1. Pages

| File | Module | Purpose |
|---|---|---|
| `index.html` | *(none — inline)* | **Homepage / explainer.** Self-contained marketing page. Fetches **nothing**. |
| `leaderboard.html` | `assets/js/leaderboard.js` | Season standings of entrants (⟨model × harness⟩ pairs). |
| `runs.html` | `assets/js/runs.js` | Match archive (results ledger); rows link into a match thread. |
| `games.html` | `assets/js/games.js` | Challenge/game catalogue (reads the challenge registry). |
| `trajectory.html` | `assets/js/trajectory.js` | One match as a chat thread between the two agents, with a per-team minimap for scrubbing. Opened via `trajectory.html?run=<id>`. |
| `blogs.html` | *(none — inline)* | **Blogs / technical report** landing. Currently a placeholder card; swap in the real report link when published. |
| `about.html` | *(inline)* | Team + contact. Uses `assets/data/contributors.js`. |

Every **data page** follows the same shape: a small HTML shell (nav + masthead + empty mount
points) + a `<script type="module">` that fetches from the API and renders. Page CSS extends
`assets/css/base.css`.

> **`index.html` is the odd one out** — it is a purely static explainer with an inline `<script>`.
> It does **not** import `config.js`/`util.js` and does **not** hit the API. Treat it as a
> standalone landing page. Everything below about the API applies to the other four pages.

---

## 2. Data source — the midend API

This is the **integration** frontend: all data is fetched at runtime from the **midend** front-mid
API, not bundled `data/*.json`.

[`assets/js/config.js`](assets/js/config.js) resolves two base URLs at runtime (no build step):

- **`API_BASE`** → the midend. Resolution order (first hit wins):
  1. `?api=<url>` query param (persisted to `localStorage`)
  2. `localStorage['midend_api']`
  3. `window.MIDEND_API` (inline global for a prod deploy)
  4. default `https://api.cyber-arena.ai`
- **`REGISTRY_BASE`** → the public challenge-warehouse repo, served via jsDelivr CDN by default;
  override with `?reg=<base>`. Used by the Games page. Helper: `reg('/index.json')`.

Use `api('/api/...')` to build midend URLs. Endpoints used: `/api/harnesses`, `/api/leaderboard`,
`/api/runs`, `/api/runs/{id}/trajectory`, `/api/runs/{id}/analysis`, and the SSE
`/api/runs/{id}/stream` for live matches. A match is opened by job **id**:
`trajectory.html?run=<id>`.

**Local debug:** run the midend on `:8900`, then open any page with `?api=http://localhost:8900`.

---

## 3. Shared helpers — [`assets/js/util.js`](assets/js/util.js)

- `loadJSON(path)` — fetch + throw on non-OK.
- `loadHarnesses()` — loads `/api/harnesses` and returns `{ table, get, comboKey, comboLabel }`:
  - `get(x)` — resolve a team/agent object (`{model, harness?}`) or a legacy bare model string to
    its harness meta. **Always returns a usable object** (color/shortName/fullName). An explicit
    `harness` field wins (matched loosely: id, fullName, cli name, declared aliases); else the
    table's model→harness binding, then family-prefix, then a fallback.
  - `comboKey(x)` — dedupe/ranking key for the ⟨model × harness⟩ entity.
  - `comboLabel(x)` — compact `"model · HH"` label.
  - `duoCSS(x)` — CSS background for the **half-half combo indicator**: model color |
    harness color, collapsing to a solid when they agree. Used on discs/chips/avatars.
  - `modelColor(x)` — the model half's own color (model→harness binding / prefix / synth).
  - `distinctPair(t1, t2)` — per-team **accent** colors for theming (`--t1`/`--t2`, text,
    borders): picks whichever component color differs between the two entrants.

  **Use this for all competitor identity/colors — never hardcode per-agent colors.**
- `fmtTime(s)`, `esc(s)`, `initials(m)`, `setActiveNav(pageHref)`.

---

## 4. Design system — Riso Zine (fixed)

Two-color riso-print "gazette": warm paper, bold ink borders with hard offset shadows, chunky
display weights, subtle paper grain. Defined in [`assets/css/base.css`](assets/css/base.css).
**Keep this style.**

- **Tokens** (CSS vars): `--paper #F7F3EC`, `--paper2 #FFFDF8`, `--ink #1A1A1A`, `--blue #2540FF`
  (team 1), `--pink #FF3D7F` (team 2), `--purple #6B2BD9` (shared infra), `--green #0E9E6E`,
  `--mut`, `--line`.
- **Fonts:** Hanken Grotesk (display/body/labels) + JetBrains Mono (data/code). No italic serif.
- **Shared chrome** in `base.css`: `.nav`, `.mast`/`.kicker`, `.headline`/`.dek`, `.sech` (section
  header — a two-part title/subtitle bar), `.colophon`, plus the paper-grain overlay.
- Each competitor's color, short name, and full name come from the harness table at
  `/api/harnesses` — resolve via `loadHarnesses().get(entity)` (pass the whole object, not the bare
  model — see Conventions). The match thread is the exception: with only two teams on the page it
  themes with the stock `--blue`/`--pink` (`--t1`/`--t2` CSS defaults); harness identity there is
  textual (the "model · Harness" lines and shortName chips).

---

## 5. Conventions

- **Never hardcode competitor identities.** Runs are currently Claude Code vs OpenAI Codex, but
  future games will feature other agents — always derive labels/models/orgs from the data.
- **The competitive entity is a ⟨model × harness⟩ pair, never the bare model.** The same model can
  run under different harnesses in future seasons. Resolve identity by passing the whole team/agent
  object to `loadHarnesses().get(...)` — it honors an explicit `harness` field when the API serves
  one (id, fullName, cli name, or a declared alias all match) and only falls back to the table's
  model→harness binding when the field is absent. Use `comboKey(...)` for dedupe/counting and
  `comboLabel(...)` for compact "model · HH" labels. Never merge or count entrants by model alone.
  **A combo's color is never invented:** indicators wear the half-half model|harness disc
  (`duoCSS`), and per-team accents come from `distinctPair` (the component that differs).
  Harnesses/models outside the table get a synthesized stable identity (initials + hashed
  palette color) — the table is a curation layer, not a fixed pool.
- Consumed data comes from the midend API at runtime, never inlined. Harness identity/colors come
  from `/api/harnesses`.
- Pages are small ES modules over a shared `util.js` (+ `config.js`); page CSS extends `base.css`.
- **Match thread additions:** a live (`status:"running"`) match streams new feed items over SSE and
  updates the scoreboard; finished+succeeded matches show a post-match **analysis panel**
  (attack-outcome A/B/C, intended-vs-cheat flags, time-utilization).

---

## 6. The homepage (`index.html`) in detail

Self-contained. Structure top→bottom:

1. **Hero** — poster headline + two shadow-boxing robots.
   - Sprites: `assets/img/duel2_{blue,pink}_{idle,windup,punch,cross,upper,duck,slip}.webp` (14 files).
   - Robots **swing in on a curve** (Web Animations API), **sway** continuously, and throw a
     **random punch on click / Enter**. On scroll they **zoom smaller + move apart** while the
     content sheet rises over them (sticky hero + scroll-driven transform).
   - Layering: robots sit *behind* the headline/CTAs (which stay readable and clickable).
   - Per-frame sprite offsets live in the `CAL` object; punch choreography in `MOVES`. These are
     hand-tuned for a ~340px fighter.
2. **§01 The arena** — a **static** inline-SVG sandbox topology (facility network, game manager,
   two agents + vulnboxes, attack network), followed by an **animated match replay**: a scoreboard
   that ticks, a timeline with a sweeping playhead and STEAL/PATCH/rotate event stamps, and a
   commentary line. It loops on a ~27s clock (the `SCRIPT` array in the inline `<script>`, an
   illustrative match — not live data). The **topology syncs to the replay**: each event pulses
   the arena (steal → the attacker's exploit path + the victim vulnbox; patch → green on the
   patched box; rotate → purple on the game manager + both boxes), via `fireEvent()` and the
   `#atkBlue/#atkPink` paths + `#vb1flash/#vb2flash/#gmflash` overlays. The hero fighters are a
   separate system and are not driven by this replay.
3. **§02 Round loop**, **§03 Scoring** — the rules.
4. **§04 Inside the arena** — three info cards (challenges / sandbox / the record).
5. **Contributing institutions** — a CSS **conveyor belt** marquee. **Placeholder** seals/names.
6. Colophon.

**`prefers-reduced-motion`** is fully honored (no swing-in, no sway/punch, no belt; static
face-off layout).

### Open TODOs on the homepage
- **Institution seals/names/roles are placeholders** (`SEAL / LOGO`, "Institution One"…). Swap in
  the real list — search `TODO: replace placeholder` in `index.html`.
- The robot sprites are AI-generated riso art. If real agent art arrives, replace the 14 WebPs and
  re-check the `CAL`/`MOVES` offsets.
- Homepage does not read the harness table — the "Agent 1 / Agent 2" framing is generic on purpose.
  If you ever want live competitor identities in the hero, wire in `loadHarnesses()`.

---

## 7. Running locally

Needs HTTP (ES modules + fetch won't run from `file://`). Start the midend first if you're testing
the data pages (see ../CLAUDE.md §8):

```bash
cd frontend_integration
python3 -m http.server 8765           # then open http://localhost:8765/
# data pages default to https://api.cyber-arena.ai; for a local midend:
#   http://localhost:8765/runs.html?api=http://localhost:8900
```

---

## 8. Adding a new data page — the pattern

1. Create `foo.html`: copy the shell from `leaderboard.html` (nav + masthead + mount `<div>`s),
   link `base.css` + a new `assets/css/foo.css`, and `<script type="module" src="assets/js/foo.js">`.
2. In `foo.js`: `import { api } from './config.js'` and helpers from `./util.js`; fetch, then render
   into the mount points. Resolve any agent identity via `loadHarnesses()` (combo-aware — see §5).
3. Add a nav link in every page's `.navlinks` (they're duplicated per page — keep them in sync).
4. Keep it static: no inlined data, no secrets, all fetches through `api()`/`reg()`.

---

## 9. Repo layout

```
frontend_integration/
├── index.html            # homepage (static explainer, inline JS)
├── leaderboard.html runs.html games.html trajectory.html
├── CNAME                 # cyber-arena.ai (GitHub Pages)
├── CLAUDE.md             # this file — product context + practical map
└── assets/
    ├── css/  base.css + one per data page
    ├── js/   config.js util.js + one per data page
    ├── data/ list.js (institution belt) + contributors.js (about-page team)
    └── img/  duel2_*.webp (14 homepage robot sprites) + inst/ (institution seals)
```

> History note: the homepage was chosen from a set of design proposals that lived in `proposal/`.
> That workshop folder (drafts + robot-animation tuner + spare sprites) has been removed; only the
> 14 sprites the homepage actually uses were kept, in `assets/img/`.
