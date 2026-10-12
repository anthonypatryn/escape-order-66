// Online play screens (Long Shot's): the host's lobby + game (this browser runs the Game and forwards it), and the
// friend's side (connecting → waiting in the lobby → the game, reconnecting by itself when the line drops).
import { useEffect, useReducer, useState } from 'react';
import GameView from './GameView';
import { useGame, useSounds } from './useGame';
import { saveGame } from './resume';
import { MAX_SEATS } from '../net/room';
import { Logo } from './Cards';
import { CpuIcon, PersonIcon, LevelPick, Chips } from './ui';
import { playerColor } from './prefs';
import MusicPlayer from './MusicPlayer';
import BugReport from './BugReport';

const CPU_NAMES = ['Kix', 'Tup', 'Hardcase', 'Dogma', 'Boil', 'Waxer', 'Gree', 'Bly'];

// re-render whenever a HostRoom / JoinClient changes
function useLive(obj) {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => obj?.on(bump), [obj]);
}

function Backdrop({ children }) {
  return (
    <div className="home">
      <div className="home-bg" aria-hidden="true" />
      <div className="stars" aria-hidden="true"><i /><i /><i /></div>
      <div className="home-music"><MusicPlayer /></div>
      <div className="home-card lobby"><Logo size="lg" />{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- host
export function HostShell({ room, onLeave }) {
  useLive(room);
  const [game, setGame] = useState(() => (room.resume ? { setup: room.resume.setup, resume: room.resume } : null));
  const back = () => { room.backToLobby(); setGame(null); };
  if (game) {
    return <HostGame key={game.setup.seed} room={room} setup={game.setup} resume={game.resume} onEnd={back}
      onRematch={() => { room.backToLobby(); setGame(room.seats.length === MAX_SEATS && room.seats.every((s) => s.connected) ? { setup: room.setup() } : null); }} />;
  }
  return <HostLobby room={room} onStart={() => setGame({ setup: room.setup() })} onLeave={() => { room.close(); onLeave(); }} />;
}

function HostGame({ room, setup, resume, onEnd, onRematch }) {
  const [res] = useState(() => { const r = resume ?? null; room.resume = null; return r; });
  const { state, game, answer, start } = useGame(setup, res);
  useSounds(state);
  const me = Math.max(0, room.seats.findIndex((s) => s.kind === 'host'));
  useEffect(() => { if (game) room.attach(game); }, [game, room]);
  // saved after every change: if this tab reloads, the game (and the room code) come back from Saved games
  useEffect(() => { saveGame(game, state, room.snapshot()); }, [state, game, room]);
  if (!state) return null;
  return (
    <GameView state={state} game={game} answer={answer} start={start} seed={setup.seed} fresh={!res} mySeat={me}
      onExit={onEnd} onRematch={onRematch}
      online={{ role: 'host', code: room.code, seats: room.seats, watchers: room.watchers.size, onTakeOver: (i) => room.takeOver(i), onKick: (i) => room.kick(i), notice: room.error }} />
  );
}

function HostLobby({ room, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/?join=${room.code}`;
  const copy = async () => {
    try {
      if (navigator.share && matchMedia('(hover: none)').matches) await navigator.share({ title: 'Escape Order 66', text: `Join my game of Escape Order 66 — room ${room.code}`, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* cancelled / no clipboard */ }
  };
  const ready = room.status === 'open';
  const full = room.seats.length === MAX_SEATS;
  const waiting = room.seats.some((s) => s.kind === 'remote' && !s.connected);
  return (
    <Backdrop>
      {room.status === 'error' ? (
        <><p className="err">{room.error}</p><div className="home-actions"><span /><button onClick={onLeave}>Back</button></div></>
      ) : (
        <>
          <p className="lobby-label">Room code</p>
          <div className="room-code">{ready ? room.code : '·····'}</div>
          <div className="home-actions center"><button className="primary" disabled={!ready} onClick={copy}>{copied ? 'Link copied!' : 'Send the invite link'}</button></div>
          <p className="note">Your friend opens the link (or chooses <b>Join with a code</b>). Keep this screen open: it runs the game.</p>
          <h2>Players</h2>
          <ul className="seat-list">
            {room.seats.map((s, i) => {
              const ai = s.kind === 'ai';
              return (
                <li key={i} className={ai ? 'cpu' : ''} style={{ '--pc': playerColor(i) }}>
                  <span className={`seat-dot ${s.kind === 'remote' && !s.connected ? 'off' : ''}`} />
                  {ai ? <SeatName name={s.name} onCommit={(n) => room.renameSeat(i, n)} label={`Player ${i + 1} name`} /> : <span className="seat-fixed">{s.name}</span>}
                  <span className="seat-kind-icon">{ai ? <CpuIcon size={18} /> : <PersonIcon size={18} />}</span>
                  {ai ? <LevelPick level={s.level} onChange={(level) => room.setLevel(i, level)} />
                    : <span className="seat-lvl-none">{s.kind === 'host' ? 'You · host' : s.connected ? 'Friend' : 'Friend · away'}</span>}
                  {s.kind !== 'host' ? <button className="icon-btn" onClick={() => room.removeSeat(i)} aria-label={`Remove ${s.name}`} title="Remove">✕</button> : <span className="icon-btn-gap" />}
                </li>
              );
            })}
            {!full && (
              <li className="seat-wait" style={{ '--pc': playerColor(room.seats.length) }}>
                <span className="seat-dot off" /><span className="seat-fixed"><span className="dots" /> Waiting for your friend…</span>
                <button onClick={() => room.addComputer(CPU_NAMES[Date.now() % CPU_NAMES.length])} title="Play the computer instead">or a computer</button>
              </li>
            )}
          </ul>
          {full && (
            <div className="first-row"><span>Who moves Ahsoka first</span>
              <Chips small value={room.first} onChange={(v) => room.setFirst(v)} options={[['random', 'Random'], ['0', room.seats[0].name], ['1', room.seats[1].name]]} />
            </div>
          )}
          {room.watchers.size > 0 && <p className="note">{room.watchers.size} watching</p>}
          <div className="home-actions">
            <button disabled={!full} onClick={() => room.swapSeats()} title="Blue (Jedi) is the first seat, red (Sith) the second">Swap colours</button>
            <button className="primary big" disabled={!ready || !full || waiting} onClick={onStart}>Begin the escape</button>
          </div>
          <div className="home-links"><button className="linkish" onClick={onLeave}>Close the room</button><BugLink /></div>
        </>
      )}
    </Backdrop>
  );
}

// a computer's name in the host's lobby: typed freely, sent to the room when you leave the field (or press Enter)
function SeatName({ name, onCommit, label }) {
  const [draft, setDraft] = useState(null);
  const done = () => { if (draft != null) { if (draft.trim()) onCommit(draft); setDraft(null); } };
  return <input value={draft ?? name} maxLength={14} aria-label={label} onFocus={() => setDraft(name)} onChange={(e) => setDraft(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

// report a bug from the lobby / connecting / error screens too (a friend stuck there can't reach the game's menu)
function BugLink() {
  const [open, setOpen] = useState(false);
  return <><button className="linkish" onClick={() => setOpen(true)}>Report a bug</button>{open && <BugReport onClose={() => setOpen(false)} />}</>;
}

// joining: after a while without getting through, say what's usually wrong instead of spinning forever
function Connecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 15000); return () => clearTimeout(t); }, []);
  return (
    <>
      <p className="note"><span className="dots" /> Connecting…</p>
      {slow && <p className="note">This is taking a while. Check that the host still has the game open, then try again. If it keeps happening, one of your networks may be blocking the connection: try Wi-Fi instead of phone data (or the other way round).</p>}
    </>
  );
}

// ---------------------------------------------------------------- friend
export function ClientShell({ client, onLeave }) {
  useLive(client);
  const [dismissed, setDismissed] = useState(null); // results already looked at (wait in the lobby for a rematch)
  const leave = () => { client.close(); onLeave(); };
  const st = client.state;
  useSounds(client.status === 'game' ? st : null);
  if (client.status === 'error' || client.status === 'ended') {
    const keep = client.status === 'error' && client.state;
    return (
      <Backdrop>
        <p className="err">{client.error}</p>
        {keep && <p className="note">Your seat is kept for you: try again, or join again with the same name.</p>}
        <div className="home-actions">
          <button className={keep ? '' : 'primary'} onClick={leave}>Back</button>
          {keep && <button className="primary" onClick={() => client.rejoin()}>Try again</button>}
        </div>
        <div className="home-links"><BugLink /></div>
      </Backdrop>
    );
  }
  if (st && client.status !== 'lobby' && !(st.results && dismissed === st.results)) {
    return (
      <>
        {client.status === 'reconnecting' && <div className="net-banner">Reconnecting to the host…</div>}
        {client.spectating && <div className="net-banner watch">Watching</div>}
        <GameView key={client.lobby?.code} state={st} answer={(v) => client.answer(v)} mySeat={client.you} fresh={st.phase === 'setup'}
          onDismissRead={() => client.dismiss()}
          online={{ role: 'client', code: client.code, seats: client.lobby?.seats, watchers: client.lobby?.watchers, spectator: client.spectating }}
          onExit={() => { if (st.results) setDismissed(st.results); else leave(); }} />
      </>
    );
  }
  const seats = client.lobby?.seats ?? [];
  return (
    <Backdrop>
      <p className="lobby-label">Room code</p>
      <div className="room-code">{client.code}</div>
      {client.status === 'connecting' || (client.status === 'reconnecting' && !client.lobby) ? <Connecting /> : (
        <>
          <p className="note"><span className="dots" /> {client.status === 'reconnecting' ? 'Reconnecting to the host…' : 'Waiting for the host to begin.'}</p>
          <ul className="seat-list">
            {seats.map((s, i) => (
              <li key={i} style={{ '--pc': playerColor(i) }}>
                <span className={`seat-dot ${s.kind === 'remote' && !s.connected ? 'off' : ''}`} />
                <span className="seat-fixed">{s.name}</span>
                {s.kind === 'ai' ? <LevelPick level={s.level} /> : <span className="seat-lvl-none">{i === client.you ? 'You' : s.kind === 'host' ? 'Host' : 'Friend'}</span>}
              </li>
            ))}
          </ul>
          {client.spectating && <p className="note">Both seats are taken: you’ll watch the game.</p>}
        </>
      )}
      <div className="home-links"><button className="linkish" onClick={leave}>Leave the room</button><BugLink /></div>
    </Backdrop>
  );
}
