// Leaderboard — intentionally empty.
//
// The midend's derived standings were removed: ranking by raw win count over a
// cache that also held unparseable placeholder runs produced standings that
// were not defensible (volume beat winrate, the `idle` agent was an entrant,
// and one model split across two rows on an empty harness field).
//
// The page keeps its title and nav so the route stays valid and linkable. Give
// it a real ranking model — or an authoritative feed from the backend — before
// rendering anything here again.
import { setActiveNav } from './util.js';

setActiveNav('leaderboard.html');
