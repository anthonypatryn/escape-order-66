import { useState } from 'react';
import { Logo, CharCard } from './Cards';
import { CpuIcon, PersonIcon, useConfirm, LevelPick, Chips } from './ui';
import { loadSaves, deleteSave } from './resume';
import MusicPlayer from './MusicPlayer';
import { playerColor } from './prefs';
import { RulesDrawer } from './Extras';
import { HostRoom, JoinClient, cleanCode } from '../net/room';

const NAMES = ['Player 1', 'Player 2'];
const CPU_NAMES = ['Kix', 'Tup', 'Hardcase', 'Dogma', 'Boil', 'Waxer', 'Gree', 'Bly'];
const savedName = () => { try { return localStorage.getItem('eo-name') || ''; } catch { return ''; } };
const saveName = (n) => { try { localStorage.setItem('eo-name', n); } catch { /* private window */ } };
const loadSeats = () => { try { const s = JSON.parse(localStorage.getItem('eo-seats') || 'null'); if (Array.isArray(s) && s.length === 2) return s; } catch { /* default */ } return [{ name: 'Player 1', ai: false }, { name: 'Kix', ai: true, level: 'padawan' }]; };

// Home: play on this screen (2 seats, people or computers), host an online game (room code), or join one
export default function Home({ onStart, onResume, onHost, onJoin, joinCode }) {
  const [mode, setMode] = useState(joinCode ? 'join' : 'local');
  const [rules, setRules] = useState(false);
  return (
    <div className="home">
      <div className="home-bg" aria-hidden="true" />
      <div className="stars" aria-hidden="true"><i /><i /><i /></div>
      <div className="home-music"><MusicPlayer /></div>
      <div className="home-card">
        <Logo size="lg" />
        <div className="home-ahsoka"><CharCard id="ahsoka" /></div>
        <p className="home-sub">Move Ahsoka across the Galaxy. Collect characters, win their factions’ banners. Most banners when she can’t move any more wins.</p>
        {!joinCode && <SavedGames onResume={onResume} />}
        <div className="home-modes"><Chips value={mode} onChange={setMode} options={[['local', 'On this screen'], ['host', 'Host online'], ['join', 'Join with a code']]} /></div>
        {mode === 'local' && <LocalSetup onStart={onStart} />}
        {mode === 'host' && <HostSetup onHost={onHost} />}
        {mode === 'join' && <JoinSetup onJoin={onJoin} initialCode={joinCode} />}
        <div className="home-actions left"><button onClick={() => setRules('turn')}>How to play</button></div>
        <div className="home-links"><a className="home-link" href="/?view=bugs">Bug reports</a><a className="home-link" href="/?view=lab">Debug lab</a><a className="home-link" href="/?view=sounds">Sound editor</a><a className="home-link" href="/?view=cards">Card review</a></div>
      </div>
      {rules && <RulesDrawer start={rules} keys onClose={() => setRules(false)} />}
    </div>
  );
}

function LocalSetup({ onStart }) {
  const [seats, setSeats] = useState(loadSeats);
  const [first, setFirst] = useState('random');
  const set = (i, patch) => setSeats((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const valid = seats.every((p) => p.name.trim());
  const go = () => {
    const players = seats.map((p) => ({ ...p, name: p.name.trim(), level: p.level ?? 'padawan' }));
    try { localStorage.setItem('eo-seats', JSON.stringify(players)); } catch { /* private */ }
    onStart({ players, seed: Date.now(), first: first === 'random' ? undefined : Number(first) });
  };
  return (
    <>
      <h2>Players</h2>
      <ul className="seat-list">
        {seats.map((p, i) => (
          <li key={i} className={p.ai ? 'cpu' : ''} style={{ '--pc': playerColor(i) }}>
            <span className="seat-dot" />
            <input value={p.name} maxLength={14} onChange={(e) => set(i, { name: e.target.value })} aria-label={`Player ${i + 1} name`} />
            <div className="seg seat-kind">
              <button className={!p.ai ? 'on' : ''} onClick={() => set(i, { ai: false, name: CPU_NAMES.includes(p.name) ? NAMES[i] : p.name })} title="Human player" aria-label="Human player"><PersonIcon size={18} /></button>
              <button className={p.ai ? 'on' : ''} onClick={() => set(i, { ai: true, name: NAMES.includes(p.name) ? CPU_NAMES[(Date.now() + i) % CPU_NAMES.length] : p.name })} title="Computer player" aria-label="Computer player"><CpuIcon size={18} /></button>
            </div>
            {p.ai ? <LevelPick level={p.level ?? 'padawan'} onChange={(level) => set(i, { level })} /> : <span className="seat-lvl-none">Human</span>}
          </li>
        ))}
      </ul>
      <div className="first-row"><span>Who moves Ahsoka first</span>
        <Chips small value={first} onChange={setFirst} options={[['random', 'Random'], ['0', seats[0].name || 'Player 1'], ['1', seats[1].name || 'Player 2']]} />
      </div>
      <div className="home-actions"><span /><button className="primary big" disabled={!valid} onClick={go}>Begin the escape</button></div>
    </>
  );
}

function HostSetup({ onHost }) {
  const [name, setName] = useState(savedName());
  const ok = name.trim().length > 0;
  const go = (e) => { e.preventDefault(); if (!ok) return; saveName(name.trim()); onHost(new HostRoom(name.trim())); };
  return (
    <form onSubmit={go} className="home-form">
      <h2>Host a game online</h2>
      <p className="note">You get a room code to send to a friend. They play on their own phone or computer; your screen runs the game, so keep it open.</p>
      <label className="field"><span>Your name</span><input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <div className="home-actions"><span /><button className="primary big" type="submit" disabled={!ok}>Create room</button></div>
    </form>
  );
}

function JoinSetup({ onJoin, initialCode }) {
  const [code, setCode] = useState(cleanCode(initialCode));
  const [name, setName] = useState(savedName());
  const ok = code.length === 5 && name.trim().length > 0;
  const go = (e) => { e.preventDefault(); if (!ok) return; saveName(name.trim()); onJoin(new JoinClient(code, name.trim())); };
  return (
    <form onSubmit={go} className="home-form">
      <h2>Join a friend’s game</h2>
      <label className="field"><span>Room code</span><input className="code-input" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABCDE" autoCapitalize="characters" autoComplete="off" autoFocus={!initialCode} /></label>
      <label className="field"><span>Your name <small>(the same name gets your seat back if you drop out)</small></span><input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} autoFocus={!!initialCode} /></label>
      <div className="home-actions"><span /><button className="primary big" type="submit" disabled={!ok}>Join</button></div>
    </form>
  );
}

const ago = (t) => {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

function SavedGames({ onResume }) {
  const [saves, setSaves] = useState(loadSaves);
  const [confirmIt, dialog] = useConfirm();
  if (!saves.length) return null;
  const remove = async (s) => { if (await confirmIt({ title: 'Delete this game?', body: `${s.setup.players.map((p) => p.name).join(' vs ')} — it can’t be brought back.`, yes: 'Delete', danger: true })) { deleteSave(s.id); setSaves(loadSaves()); } };
  return (
    <div className="saved-games">
      <h2>Saved games</h2>
      {saves.slice(0, 3).map((s) => (
        <div key={s.id} className="resume-card">
          <div className="save-info">
            <b>{s.setup.players.map((p) => p.name).join(' vs ')}</b>
            <small>{s.kind === 'host' && <>Online · room {s.host?.code} · </>}Turn {s.sum?.turnNo ?? 1} · {s.sum?.turn}’s move · banners {s.sum?.banners?.join('–')} · {ago(s.at)}</small>
          </div>
          <div className="btns">
            <button onClick={() => remove(s)}>Delete</button>
            <button className="primary" onClick={() => onResume(s)}>Resume</button>
          </div>
        </div>
      ))}
      {dialog}
    </div>
  );
}
