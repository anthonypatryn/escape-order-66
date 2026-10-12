import { useEffect, useRef, useState } from 'react';
import { Game, MOVE_MS } from './engine';
import { play, hasSound } from './sound';
import { countFor, galaxyCount } from './rules';
import { FACTIONS } from '../data/cards';

// Runs a Game on this screen and mirrors its state into React (as Long Shot).
// resume = { trail, stopAt, speeds }: pick a game back up after a reload (replays it up to the question that was open).
export function useGame(setup, resume = null) {
  const [game, setGame] = useState(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!setup) return undefined;
    if (resume) {
      const g = Game.rewound(setup, resume.trail, resume.stopAt, { onChange: (s) => setState(s), speeds: resume.speeds });
      setGame(g);
      return () => g.stop();
    }
    const g = new Game(setup, { onChange: (s) => setState(s) });
    setGame(g);
    setState({ ...g.state });
    return () => g.stop();
  }, [setup]); // eslint-disable-line react-hooks/exhaustive-deps -- resume only matters on the first run

  // start() runs the game (the screen calls it once the opening crawl is over)
  const start = () => { if (game && !game.started) { game.started = true; game.run(); } };
  const rewind = (reqId) => {
    if (!game) return;
    const g = Game.rewound(game.setup, game.trail, reqId, { onChange: (s) => setState(s), speeds: game.speeds });
    game.stop();
    setGame(g);
  };
  return { state, game, answer: (v) => game?.answer(v), start, rewind };
}

// Sound effects from new log lines: saber swing when Ahsoka moves, pings as cards land, blaster for kills,
// a brass stab for banners, a shimmer for encounters.
// banners nobody can take any more (one player has more than the other could ever reach)
const lockedSet = (s) => new Set(FACTIONS.map((f) => f.id).filter((f) => {
  const [a, b] = s.players.map((p) => countFor(p, f)), left = galaxyCount(s.grid, f);
  return (a > b + left || b > a + left) && s.banner[f] != null;
}));
const FIZZLE = /finds nobody|is already gone|finds nothing|deck is empty|No encounters are left/;

export function useSounds(state) {
  const last = useRef(null);
  const locked = useRef(null);
  useEffect(() => {
    if (!state) { last.current = null; return; } // (online: between games) the next game's log starts again
    if (last.current == null) { last.current = state.log.at(-1)?.id ?? 0; locked.current = lockedSet(state); return; }
    const fresh = state.log.filter((l) => l.id > last.current);
    if (!fresh.length) return;
    last.current = fresh.at(-1).id;
    for (const l of fresh) {
      if (l.kind === 'move') {
        const glide = MOVE_MS(l.path.length);
        play('saber', { len: glide / 1000 + 0.15 });
        l.take.forEach((_, k) => setTimeout(() => play('take'), glide + 80 + k * 140));
        if (l.take.length >= 3) setTimeout(() => play('bighaul'), glide + 120 + l.take.length * 140); // a big haul: after the cards land
      }
      if (l.kind === 'take') play('take');
      if (l.kind === 'kill') play('kill');
      if (l.kind === 'swap') play('swap');
      if (l.kind === 'encounter' && l.enc) { play('encounter'); setTimeout(() => play(`enc-${l.enc}`), 350); } // + its voice line, if it has one
      if (l.kind === 'encounter' && l.text.startsWith('Bo-Katan:')) play('extra-turn');
      if (l.kind === 'banner') {
        if (l.to == null) setTimeout(() => play(hasSound('banner-down') ? 'banner-down' : 'banner', { down: true }), 100);
        else { setTimeout(() => play('banner'), 100); if (l.from != null) setTimeout(() => play('steal'), 700); }
      }
      if (l.kind === 'info' && /took the last of|That was the last of/.test(l.text)) setTimeout(() => play('last-one'), 300);
      if (l.kind === 'info' && FIZZLE.test(l.text)) play('fizzle');
      if (l.kind === 'turn' && l.pid != null && state.players[l.pid]?.ai) play('ai-turn');
      if (l.kind === 'turn' && /nowhere left to go/.test(l.text)) play('game-over');
    }
    // a banner just became locked
    const now = lockedSet(state);
    if ([...now].some((f) => !locked.current.has(f))) setTimeout(() => play('lock'), 1100);
    locked.current = now;
  }, [state]);
}
