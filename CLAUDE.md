# CyberArena Frontend

Frontend for **CyberArena** — a benchmark where two AI agents play **attack-and-defense CTF**
against each other in an isolated network sandbox. Each agent attacks (steal the opponent's planted
flag) and defends (patch its own service) at the same time. Games run in rounds; flags rotate.

This frontend should feel **clean, lovable, and shareable** — something people want to post on
social media. We picked one strong identity instead of a generic dashboard.

## The three views

- **Leaderboard** (`leaderboard.html`) — season standings of agents/models.
- **Runs archive** (`runs.html`) — every match as a results ledger; rows link into a match thread.
- **Match thread** (`trajectory.html`) — one game as a chat thread between the two agents, with a
  per-team minimap for scrubbing. Open a game via `trajectory.html?run=<name>`.

## Design — Riso Zine

A two-color riso-print "gazette": warm paper, bold ink borders with hard offset shadows, chunky
display weights, subtle paper grain. Keep everything in this style.

- Palette (CSS vars in `assets/css/base.css`): `--paper`, `--ink`, `--blue`, `--pink`, `--purple`, `--green`.
- Fonts: **Hanken Grotesk** (display/body/labels) and **JetBrains Mono** (data/code). No italic serif.
- Each competitor's color, short name, and full name come from the harness table at
  `/api/harnesses` (served by the midend) — the color table for every agent harness. Resolve a model
  to its harness via `loadHarnesses()` in `util.js`; don't hardcode per-competitor colors. In the
  match thread the two teams theme via `--t1`/`--t2`.

## Data source — the midend API (integration build)

This is the **integration** frontend: all data is fetched at runtime from the **midend** front-mid
API, not bundled `data/*.json`. See the root [../CLAUDE.md](../CLAUDE.md) for the API contract and
the uniform trajectory schema.

- `assets/js/config.js` resolves the midend base URL at runtime (query `?api=`, `localStorage`,
  `window.MIDEND_API`, else `http://localhost:8900`). No build step, no secrets in the page.
- Endpoints used: `/api/harnesses`, `/api/leaderboard`, `/api/runs`, `/api/runs/{id}/trajectory`,
  `/api/runs/{id}/analysis`, and the SSE `/api/runs/{id}/stream` for live matches.
- A match is opened by job **id**: `trajectory.html?run=<id>`.

## Conventions

- **Never hardcode competitor identities.** Runs are currently Claude Code vs OpenAI Codex, but
  future games will feature other agents — always derive labels/models/orgs from the data.
- Consumed data comes from the midend API at runtime, never inlined. Harness identity/colors come
  from `/api/harnesses`.
- Pages are small ES modules over a shared `util.js` (+ `config.js`); page CSS extends `base.css`.
- **Match thread additions:** a live (`status:"running"`) match streams new feed items over SSE and
  updates the scoreboard; finished+succeeded matches show a post-match **analysis panel**
  (attack-outcome A/B/C, intended-vs-cheat flags, time-utilization).

## Running

Needs HTTP (ES modules + fetch), not `file://`. Start the midend first (see ../CLAUDE.md §8):

```
python3 -m http.server 8765   # then visit http://localhost:8765/
# points at http://localhost:8900 by default; override with ?api=<midend-url>
```
