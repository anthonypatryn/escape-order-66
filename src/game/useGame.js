import { useEffect, useRef, useState } from 'react';
import { Game, MOVE_MS } from './engine';
import { play } from './sound';

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
export function useSounds(state) {
  const last = useRef(null);
  useEffect(() => {
    if (!state) return;
    if (last.current == null) { last.current = state.log.at(-1)?.id ?? 0; return; }
    const fresh = state.log.filter((l) => l.id > last.current);
    if (!fresh.length) return;
    last.current = fresh.at(-1).id;
    for (const l of fresh) {
      if (l.kind === 'move') {
        const glide = MOVE_MS(l.path.length);
        play('saber', { len: glide / 1000 + 0.15 });
        l.take.forEach((_, k) => setTimeout(() => play('take'), glide + 80 + k * 140));
      }
      if (l.kind === 'take') play('take');
      if (l.kind === 'kill') play('kill');
      if (l.kind === 'swap') play('swap');
      if (l.kind === 'encounter' && l.enc) play('encounter');
      if (l.kind === 'banner') setTimeout(() => play('banner', { down: l.to == null }), 100);
    }
  }, [state]);
}
