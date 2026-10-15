import { useEffect, useState } from 'react';
import { Banner, Logo, Emblem } from './Cards';
import { FACTION } from '../data/cards';
import { playerColor } from './prefs';
import { play, stopSounds } from './sound';
import { countFor } from './rules';

// The end: each player's banners land one at a time, then the winner is called (with the tiebreak if there was one),
// then the highlights. Rematch / New game; "See the Galaxy" closes it to look at the final board.
// viewer = the seat this screen plays for (online: your seat; one screen: the only person against a computer), or null
// (two people on one screen, or only computers)
export default function EndScreen({ state, onNew, onRematch, onBoard, newLabel = 'New game', viewer = null }) {
  const { rows, winner, tiebreak, stats } = state.results;
  const most = Math.max(...rows.map((r) => r.n));
  const [shown, setShown] = useState(0); // how many banners are on the plaques so far (per row, together)
  const [called, setCalled] = useState(false);
  useEffect(() => {
    const ts = [];
    for (let i = 1; i <= most; i++) ts.push(setTimeout(() => { setShown(i); play('banner'); }, 600 + i * 520));
    // the winner is called: ONE sound (BUG-3) — the fanfare if you won, the "Nooo!" if you lost (whoever beat you);
    // two people on one screen hear the fanfare. Leaving the end screen stops it (BUG-5: it ran on into the next game)
    const callAt = 900 + (most + 1) * 520;
    ts.push(setTimeout(() => { setCalled(true); play(viewer != null && viewer !== winner ? 'lose' : 'win'); }, callAt));
    return () => { ts.forEach(clearTimeout); stopSounds(['win', 'lose', 'banner'], 0.5); };
  }, [most]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = state.players[winner];
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
              <span className="plaque-face"><Emblem pid={p.id} size={58} /></span>
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
        <button className={onRematch ? '' : 'primary big'} onClick={onNew}>{newLabel}</button>
        {onRematch && <button className="primary big" onClick={onRematch}>Rematch</button>}
      </div>
    </div>
  );
}
