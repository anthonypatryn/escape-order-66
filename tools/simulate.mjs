// Headless games between computer players: checks the engine never breaks, and how the difficulty levels compare.
//   node tools/simulate.mjs 200          → 200 games, must print "errors: 0"
//   node tools/simulate.mjs 300 levels   → every level against every other, win rates
import { Game } from '../src/game/engine.js';
import { LEVELS } from '../src/game/ai.js';

const N = Number(process.argv[2] || 100);
const mode = process.argv[3] || 'check';

function playOne(seed, levels) {
  return new Promise((resolve) => {
    const g = new Game({ seed, players: levels.map((level, i) => ({ name: `P${i + 1}`, ai: true, level })) }, {});
    g.speeds = { human: 1e6, ai: 1e6 };
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = g.state;
      if (s.results || s.log.some((l) => l.kind === 'error') || Date.now() - t0 > 20000) { clearInterval(timer); g.stop(); resolve({ s, slow: Date.now() - t0 > 20000 }); }
    }, 2);
    g.run();
  });
}

let errors = 0, turns = 0, encs = 0, ties = 0;
const wins = {}, games = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  let levels = ['padawan', 'padawan'];
  if (mode === 'levels') { const a = LEVELS[i % 3][0], b = LEVELS[Math.floor(i / 3) % 3][0]; levels = [a, b]; }
  const { s, slow } = await playOne(1000 + i, levels);
  const err = s.log.find((l) => l.kind === 'error');
  if (err || slow || !s.results) { errors++; console.log('seed', 1000 + i, err?.text ?? (slow ? 'too slow / stuck' : 'no result')); continue; }
  // sanity: every character is somewhere exactly once
  const all = [...s.grid.filter((x) => x && x !== 'ahsoka'), ...s.players.flatMap((p) => p.cards), ...s.killed];
  if (all.length !== 35 || new Set(all).size !== 35) { errors++; console.log('seed', 1000 + i, 'cards lost/duplicated', all.length); }
  turns += s.turnNo; encs += s.stats.encounters.reduce((a, b) => a + b, 0);
  if (s.results.tiebreak) ties++;
  if (mode === 'levels' && levels[0] !== levels[1]) {
    for (const k of [0, 1]) { games[levels[k]] = (games[levels[k]] ?? 0) + 1; }
    wins[levels[s.results.winner]] = (wins[levels[s.results.winner]] ?? 0) + 1;
  }
}
console.log(`games: ${N} · avg turns ${(turns / N).toFixed(1)} · avg encounters ${(encs / N).toFixed(1)} · tiebreaks ${ties} · ${((Date.now() - t0) / N).toFixed(0)} ms/game`);
if (mode === 'levels') for (const [k, l] of LEVELS) console.log(`${l}: ${(((wins[k] ?? 0) / (games[k] || 1)) * 100).toFixed(0)}% wins vs other levels (${games[k] ?? 0} games)`);
console.log(`errors: ${errors}`);
process.exit(0);
