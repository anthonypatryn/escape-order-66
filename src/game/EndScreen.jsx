import { useEffect, useState } from 'react';
import { Banner, Logo } from './Cards';
import { FACTION, charArt, CHAR } from '../data/cards';
import { playerColor } from './prefs';
import { play } from './sound';
import { countFor } from './rules';

// The end: each player's banners land one at a time, then the winner is called (with the tiebreak if there was one),
// then the highlights. Rematch / New game; "See the Galaxy" closes it to look at the final board.
export default function EndScreen({ state, onNew, onRematch, onBoard }) {
  const { rows, winner, tiebreak, stats } = state.results;
  const most = Math.max(...rows.map((r) => r.n));
  const [shown, setShown] = useState(0); // how many banners are on the plaques so far (per row, together)
  const [called, setCalled] = useState(false);
  useEffect(() => {
    const ts = [];
    for (let i = 1; i <= most; i++) ts.push(setTimeout(() => { setShown(i); play('banner'); }, 600 + i * 520));
    ts.push(setTimeout(() => { setCalled(true); play('win'); }, 900 + (most + 1) * 520));
    return () => ts.forEach(clearTimeout);
  }, [most]);
  const w = state.players[winner];
  const best = (pid) => [...state.players[pid].cards].sort((a, b) => FACTION[CHAR[b].faction].size - FACTION[CHAR[a].faction].size)[0];
  const hl = [
    ['Cards taken', stats.taken], ['Biggest single haul', stats.longest], ['Encounters', stats.encounters], ['Characters killed', stats.killed],
  ];
  return (
    <div className="end">
      <div className="end-stars" />
      <Logo size="md" />
      <h1 className={`end-title ${called ? 'in' : ''}`} style={{ '--pc': playerColor(winner) }}>{called ? <><b>{w.name}</b> escapes Order 66!</> : 'Counting the banners…'}</h1>
      {called && tiebreak && <p className="end-tie">Tied on banners — {w.name} holds the bigger faction’s banner ({FACTION[rows[0].banners[0]]?.name}, {FACTION[rows[0].banners[0]]?.size} characters).</p>}
      <div className="end-plaques">
        {state.players.map((p) => {
          const r = rows.find((x) => x.pid === p.id);
          const win = called && p.id === winner;
          return (
            <div key={p.id} className={`plaque ${win ? 'winner' : ''} ${called && !win ? 'loser' : ''}`} style={{ '--pc': playerColor(p.id) }}>
              {best(p.id) && <img className="plaque-face" src={charArt(best(p.id))} alt="" />}
              <h2>{p.name}</h2>
              <div className="plaque-n">{Math.min(shown, r.n)}<small>banner{r.n === 1 ? '' : 's'}</small></div>
              <div className="plaque-banners">
                {r.banners.slice(0, shown).map((f) => <span key={f} className="pb-drop"><Banner f={f} size={48} /><small>{countFor(p, f)}</small></span>)}
              </div>
              {win && <span className="plaque-crown">Winner</span>}
            </div>
          );
        })}
      </div>
      {called && (
        <div className="end-stats">
          {hl.map(([label, v]) => <div key={label}><span>{label}</span>{state.players.map((p) => <b key={p.id} style={{ color: playerColor(p.id) }}>{v[p.id]}</b>)}</div>)}
        </div>
      )}
      <div className="end-btns">
        <button onClick={onBoard}>See the Galaxy</button>
        <button onClick={onNew}>New game</button>
        <button className="primary big" onClick={onRematch}>Rematch</button>
      </div>
    </div>
  );
}
