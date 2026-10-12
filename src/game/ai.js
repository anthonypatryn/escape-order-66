// Computer players. Difficulty per seat (players[i].level, picked on Home):
//   Youngling   = easy: often grabs a random move, picks encounters on a whim
//   Padawan     = normal: the move that looks best right now (banners it can hold or lock, encounters it can earn)
//   Jedi Master = hard: looks three moves ahead (its move, your best reply, its answer) and plays encounters to swing banners
// All chance goes through g.rand (the seeded RNG), so undo / resume replays the same choices.
import { FACTIONS, FACTION, GRID } from '../data/cards.js';
import { legalMoves, countFor, factionOf } from './rules.js';

export const LEVELS = [['youngling', 'Youngling'], ['padawan', 'Padawan'], ['master', 'Jedi Master']];
const FIDS = FACTIONS.map((f) => f.id);

// ---------- a light copy of the game for looking ahead: the Galaxy + how many of each faction each player counts ----------
export function snapshot(s) {
  return {
    grid: s.grid, ahsoka: s.ahsoka, row: s.row.length,
    counts: s.players.map((p) => Object.fromEntries(FIDS.map((f) => [f, countFor(p, f)]))),
    banner: { ...s.banner },
  };
}
const galaxyLeft = (grid) => { const g = Object.fromEntries(FIDS.map((f) => [f, 0])); for (const id of grid) { const f = factionOf(id); if (f) g[f]++; } return g; };

function play(sim, m, pid) {
  const grid = sim.grid.map((id, i) => (i === sim.ahsoka ? null : i === m.to ? 'ahsoka' : m.take.includes(i) ? null : id));
  const counts = sim.counts.map((c, k) => (k === pid ? { ...c, [m.faction]: c[m.faction] + m.take.length } : c));
  const banner = { ...sim.banner };
  const mine = counts[pid][m.faction], top = Math.max(...counts.map((c) => c[m.faction]));
  if (mine >= top && mine > 0) banner[m.faction] = pid;
  return { grid, ahsoka: m.to, row: sim.row, counts, banner };
}

// how good the position is for `me` (positive = good). Banners that can no longer change hands count fully;
// banners still in play count by who holds them and by how far ahead they are. Bigger factions weigh a bit more (tiebreak).
function value(sim, me) {
  const left = galaxyLeft(sim.grid);
  let v = 0;
  for (const f of FIDS) {
    const m = sim.counts[me][f], o = Math.max(...sim.counts.map((c, k) => (k === me ? -1 : c[f])));
    const w = 1 + FACTION[f].size / 40;
    if (m > o + left[f]) v += w;
    else if (o > m + left[f]) v -= w;
    else {
      const h = sim.banner[f];
      v += w * ((h === me ? 0.4 : h == null ? 0 : -0.4) + 0.25 * (m - o) / Math.max(1, FACTION[f].size));
    }
  }
  return v;
}
// a move that empties a faction from the Galaxy earns an encounter
const encBonus = (sim, m) => (sim.row > 0 && !sim.grid.some((id, i) => factionOf(id) === m.faction && !m.take.includes(i)) ? 0.55 : 0);
// the game is over when Ahsoka can't move: then only the banners count
function final(sim, me) {
  const n = sim.counts.map((_, k) => FIDS.filter((f) => sim.banner[f] === k));
  const best = (k) => Math.max(0, ...n[k].map((f) => FACTION[f].size));
  const opp = me === 0 ? 1 : 0;
  const d = n[me].length - n[opp].length || Math.sign(best(me) - best(opp)) * 0.5;
  return d > 0 ? 50 : d < 0 ? -50 : 0;
}

function search(sim, mover, me, depth, alpha, beta) {
  const moves = legalMoves(sim.grid, sim.ahsoka);
  if (!moves.length) return final(sim, me);
  if (depth === 0) return value(sim, me);
  const n = sim.counts.length;
  if (mover === me) {
    let best = -Infinity;
    for (const m of moves) {
      const v = search(play(sim, m, mover), (mover + 1) % n, me, depth - 1, alpha, beta) + encBonus(sim, m);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const v = search(play(sim, m, mover), (mover + 1) % n, me, depth - 1, alpha, beta) - encBonus(sim, m);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

// score every move for player p (higher = better for p)
export function rateMoves(g, p, moves, level = p.level) {
  const sim = snapshot(g.state), n = sim.counts.length;
  const depth = level === 'master' ? 3 : 1;
  return moves.map((m) => {
    const after = play(sim, m, p.id);
    const v = depth === 1
      ? (legalMoves(after.grid, after.ahsoka).length ? value(after, p.id) : final(after, p.id))
      : search(after, (p.id + 1) % n, p.id, depth - 1, -Infinity, Infinity);
    return v + encBonus(sim, m);
  });
}

const pickBest = (g, scores, noise = 0) => {
  let best = 0, bv = -Infinity;
  scores.forEach((v, i) => { const x = v + (noise ? (g.random() - 0.5) * noise : 0); if (x > bv) { bv = x; best = i; } });
  return best;
};

// ---------- encounters: how much one would help right now ----------
function encounterValue(g, p, id, info) {
  if (info?.[id]?.why) return -1;
  const s = g.state, sim = snapshot(s), base = value(sim, p.id);
  const opp = s.players.find((x) => x.id !== p.id);
  const gain = (f, k = 1, from = null) => {
    const counts = sim.counts.map((c, i) => (i === p.id ? { ...c, [f]: c[f] + k } : i === from ? { ...c, [f]: c[f] - k } : c));
    return value({ ...sim, counts, banner: { ...sim.banner, [f]: counts[p.id][f] >= Math.max(...counts.map((c) => c[f])) ? p.id : sim.banner[f] } }, p.id) - base;
  };
  const takeVal = (ids) => Math.max(0, ...g.takeable(p, ids).map((t) => gain(factionOf(t.id), 1, t.at.where === 'play' ? t.at.pid : null)));
  switch (id) {
    case 'hondo': return Math.max(...FIDS.map((f) => gain(f, 2))) + 0.1;
    case 'omega': return p.cards.includes('hunter') ? gain('badbatch', 2) : g.takeable(p, ['hunter']).length ? 0.25 : 0.05;
    case 'nightsisters': return gain('dathomir', 1);
    case 'waxer': return takeVal(['fives']);
    case 'rex': return takeVal(['wolffe', 'gregor']);
    case 'sidious': return takeVal(['anakin']);
    case 'krell': return takeVal(['ventress', 'dooku', 'gunray', 'grievous']);
    case 'fennec': return takeVal(['hunter']) + (opp?.cards.includes('tech') ? 0.2 : 0.05);
    case 'droids': return opp?.cards.includes('ninety-nine') ? 0.35 : 0.1;
    case 'trench': return 0.25;
    case 'saw': return 0.45;
    case 'satine': return 0.3;
    case 'huyang': return 0.4;
    case 'bokatan': return 0.7;
    default: return 0;
  }
}

// ---------- targets: take / kill / swap ----------
function rateTarget(g, p, t, verb) {
  const sim = snapshot(g.state), f = factionOf(t.id);
  const from = t.at.where === 'play' ? t.at.pid : null;
  const counts = sim.counts.map((c) => ({ ...c }));
  if (verb === 'take') { counts[p.id][f]++; if (from != null) counts[from][f]--; }
  else if (from != null) counts[from][f]--;
  const grid = t.at.where === 'galaxy' ? sim.grid.map((x, i) => (i === t.at.idx ? null : x)) : sim.grid;
  return value({ ...sim, grid, counts }, p.id);
}

// Satine: the switch that leaves the opponent the worst next move
function bestSwap(g, p) {
  const sim = snapshot(g.state), n = sim.counts.length, opp = (p.id + 1) % n;
  const cells = sim.grid.map((id, i) => [id, i]).filter(([id]) => id && id !== 'ahsoka');
  let best = null, bv = -Infinity;
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const [ia, ib] = [cells[a][1], cells[b][1]];
      if (factionOf(cells[a][0]) === factionOf(cells[b][0])) continue;
      const grid = sim.grid.map((x, i) => (i === ia ? cells[b][0] : i === ib ? cells[a][0] : x));
      const after = { ...sim, grid };
      const replies = legalMoves(grid, sim.ahsoka);
      const worst = replies.length ? Math.min(...replies.map((m) => value(play(after, m, opp), p.id) - encBonus(after, m))) : final(after, p.id);
      if (worst > bv) { bv = worst; best = [cells[a][0], cells[b][0]]; }
    }
  }
  return best;
}

export function aiDecide(g, p, req) {
  const easy = p.level === 'youngling';
  switch (req.type) {
    case 'move': {
      if (easy && g.random() < 0.45) return g.rand(req.options.length);
      return pickBest(g, rateMoves(g, p, req.options, easy ? 'padawan' : p.level), easy ? 0.8 : p.level === 'padawan' ? 0.15 : 0);
    }
    case 'encounter': {
      const opts = req.options;
      if (req.verb === 'kill') { // Saw: kill the companion that would help the opponent most
        const opp = g.state.players.find((x) => x.id !== p.id) ?? p;
        return opts[pickBest(g, opts.map((id) => encounterValue(g, opp, id, {})), easy ? 1 : 0)];
      }
      if (easy && g.random() < 0.5) return opts[g.rand(opts.length)];
      return opts[pickBest(g, opts.map((id) => encounterValue(g, p, id, req.info)), 0.05)];
    }
    case 'faction': {
      const sim = snapshot(g.state), base = value(sim, p.id);
      return req.options[pickBest(g, req.options.map((f) => {
        const counts = sim.counts.map((c, i) => (i === p.id ? { ...c, [f]: c[f] + 2 } : c));
        return value({ ...sim, counts, banner: { ...sim.banner, [f]: p.id } }, p.id) - base;
      }), easy ? 1 : 0)];
    }
    case 'target': {
      const opts = req.options;
      if (req.verb === 'swap') {
        if (easy) return g.rand(opts.length);
        if (req.first == null) { g.aiSwap = bestSwap(g, p); }
        const want = g.aiSwap?.[req.first == null ? 0 : 1];
        const k = opts.findIndex((o) => o.id === want);
        return k >= 0 ? k : g.rand(opts.length);
      }
      if (easy && g.random() < 0.5) return g.rand(opts.length);
      return pickBest(g, opts.map((t) => rateTarget(g, p, t, req.verb)), 0.01);
    }
    default: return 0;
  }
}

export { GRID };
