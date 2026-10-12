// Pure rules helpers (no state changes): where Ahsoka can go, what a move collects, how many cards of a
// faction a player counts, and who holds a banner. Shared by the engine, the AI and the screen.
import { CHAR, FACTIONS, FACTION, GRID } from '../data/cards.js';

export const MIN_PLAYERS = 2, MAX_PLAYERS = 2;
export const DIRS = [
  { id: 'up', dr: -1, dc: 0, arrow: '↑', key: 'ArrowUp' },
  { id: 'right', dr: 0, dc: 1, arrow: '→', key: 'ArrowRight' },
  { id: 'down', dr: 1, dc: 0, arrow: '↓', key: 'ArrowDown' },
  { id: 'left', dr: 0, dc: -1, arrow: '←', key: 'ArrowLeft' },
];
export const DIR = Object.fromEntries(DIRS.map((d) => [d.id, d]));
export const rc = (i) => [Math.floor(i / GRID), i % GRID];
export const factionOf = (id) => CHAR[id]?.faction ?? null;

// Every legal move from where Ahsoka stands: a direction + a faction. She moves to the FARTHEST card of that faction
// in that direction (passing empty spaces and other cards) and the mover takes it plus every card of that faction
// she passed. → [{ dir, faction, to, take: [cell indexes in path order], path: [every cell she crosses] }]
export function legalMoves(grid, at) {
  const out = [];
  if (at == null || at < 0) return out;
  const [r0, c0] = rc(at);
  for (const d of DIRS) {
    const seen = new Map(); // faction → cells of it along the line, near → far
    const path = [];
    for (let r = r0 + d.dr, c = c0 + d.dc; r >= 0 && r < GRID && c >= 0 && c < GRID; r += d.dr, c += d.dc) {
      const i = r * GRID + c;
      path.push(i);
      const f = factionOf(grid[i]);
      if (f) seen.set(f, [...(seen.get(f) ?? []), i]);
    }
    for (const f of FACTIONS.map((x) => x.id)) {
      const cells = seen.get(f);
      if (!cells) continue;
      const to = cells.at(-1);
      out.push({ dir: d.id, faction: f, to, take: cells, path: path.slice(0, path.indexOf(to) + 1) });
    }
  }
  return out;
}

export const galaxyCount = (grid, f) => grid.reduce((n, id) => n + (factionOf(id) === f ? 1 : 0), 0);

// how many cards of faction f a player counts: their characters, plus Hondo (2 for his declared faction),
// Omega (2 Bad Batch, only while they hold Hunter) and the Nightsisters (1 Dathomir)
export function countFor(p, f) {
  let n = p.cards.reduce((k, id) => k + (factionOf(id) === f ? 1 : 0), 0);
  for (const k of p.kept) {
    if (k.id === 'hondo' && k.faction === f) n += 2;
    if (k.id === 'omega' && f === 'badbatch' && p.cards.includes('hunter')) n += 2;
    if (k.id === 'nightsisters' && f === 'dathomir') n += 1;
  }
  return n;
}

// After a turn, every faction touched this turn is checked: the player whose turn it is takes the banner if they have
// at least as many as every opponent (ties go to them). Otherwise it goes to whoever has the most; nobody → back to
// the middle. Factions nobody touched keep their holder. → new holder (player id or null)
export function bannerHolder(players, f, active, holder) {
  const counts = players.map((p) => countFor(p, f));
  const top = Math.max(...counts);
  if (top <= 0) return null;
  if (counts[active] === top) return active;
  if (holder != null && counts[holder] === top) return holder;
  return counts.findIndex((c) => c === top);
}

// end of game: most banners wins; a tie goes to the tied player whose best banner is the biggest faction
export function standings(players, banner) {
  const rows = players.map((p) => {
    const mine = Object.keys(banner).filter((f) => banner[f] === p.id).sort((a, b) => FACTION[b].size - FACTION[a].size);
    return { pid: p.id, banners: mine, n: mine.length, best: mine.length ? FACTION[mine[0]].size : 0 };
  });
  return rows.sort((a, b) => b.n - a.n || b.best - a.best);
}
