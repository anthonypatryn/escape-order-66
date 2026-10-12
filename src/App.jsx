import { lazy, Suspense, useEffect, useState } from 'react';
import Home from './game/Home';
import GameView from './game/GameView';
import BugList from './game/BugList';
import { useGame, useSounds } from './game/useGame';
import { saveGame, resumePoint } from './game/resume';
import { CharCard, EncCard, Banner, Logo } from './game/Cards';
import { CHARACTERS, ENCOUNTERS, FACTIONS } from './data/cards';
import { HostRoom, JoinClient, loadIce, cleanCode } from './net/room';
import { HostShell, ClientShell } from './game/Online';
const Lab = lazy(() => import('./game/Lab')); // /?view=lab (debug lab)
const SoundEditor = lazy(() => import('./game/SoundEditor')); // /?view=sounds (the owner's sound editor)

// Router: / = Home → game; ?view=bugs (bug list), ?view=lab (debug lab), ?view=cards (card review), ?view=sounds (sound editor)
export default function App() {
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'bugs') return <BugList />;
  if (view === 'lab') return <Suspense fallback={null}><Lab /></Suspense>;
  if (view === 'cards') return <CardReview />;
  if (view === 'sounds') return <Suspense fallback={null}><SoundEditor /></Suspense>;
  return <Main />;
}

// / = Home → a game on this screen, or online: host a room (HostShell) / join one (ClientShell, also /?join=CODE)
// a friend who joined keeps /?join=CODE in the address + who they joined as: a refresh (or iOS reloading the tab in
// the background) goes straight back into the room, same seat
const JOINED = 'eo-joined', JOIN_HOURS = 12;
let autoJoin = null; // made once per page load (React's dev mode runs state setup twice)
const lastJoin = (code) => { try { const j = JSON.parse(localStorage.getItem(JOINED) || 'null'); return j && j.code === cleanCode(code) && Date.now() - j.at < JOIN_HOURS * 3600e3 ? j : null; } catch { return null; } };

function Main() {
  const joinCode = new URLSearchParams(location.search).get('join');
  const [setup, setSetup] = useState(null);
  const [resume, setResume] = useState(null);
  const [net, setNet] = useState(() => { autoJoin ??= (() => { const j = joinCode && lastJoin(joinCode); return j ? new JoinClient(j.code, j.name) : false; })(); return autoJoin ? { kind: 'client', client: autoJoin } : null; }); // { kind: 'host', room } | { kind: 'client', client }
  const [n, setN] = useState(0);
  useEffect(() => { loadIce(); }, []); // relay servers in hand before anyone hosts or joins
  const home = () => { setNet(null); try { localStorage.removeItem(JOINED); } catch { /* private */ } history.replaceState(null, '', '/'); };
  const join = (client) => {
    try { localStorage.setItem(JOINED, JSON.stringify({ code: client.code, name: client.name, at: Date.now() })); } catch { /* private */ }
    history.replaceState(null, '', `/?join=${client.code}`);
    setNet({ kind: 'client', client });
  };
  if (net?.kind === 'host') return <HostShell room={net.room} onLeave={home} />;
  if (net?.kind === 'client') return <ClientShell client={net.client} onLeave={home} />;
  // a game hosted online comes back with its room code: the friend's screen reconnects by itself
  const onResume = (s) => {
    if (s.kind === 'host') { const room = new HostRoom(s.host.seats.find((x) => x.kind === 'host')?.name ?? 'Host', s.host); room.resume = { setup: s.setup, ...resumePoint(s) }; setNet({ kind: 'host', room }); return; }
    setResume(resumePoint(s)); setSetup(s.setup);
  };
  if (!setup) return <Home onStart={(s) => { setResume(null); setSetup(s); }} onResume={onResume} joinCode={joinCode}
    onHost={(room) => setNet({ kind: 'host', room })} onJoin={join} />;
  return <Playing key={n} setup={setup} resume={resume} onExit={() => { setSetup(null); setResume(null); }}
    onRematch={() => { setResume(null); setSetup({ ...setup, seed: Date.now(), first: undefined }); setN((x) => x + 1); }} />;
}

function Playing({ setup, resume, onExit, onRematch }) {
  const { state, game, answer, start, rewind } = useGame(setup, resume);
  useSounds(state);
  useEffect(() => { saveGame(game, state); }, [state, game]);
  return <GameView state={state} game={game} answer={answer} start={start} rewind={rewind} seed={setup.seed} onExit={onExit} onRematch={onRematch} fresh={!resume} />;
}

// /?view=cards — every card and banner from the print files, to check the art pipeline
function CardReview() {
  return (
    <div className="review">
      <header className="game-top"><Logo size="sm" /><span className="game-turn">Card review</span><div className="game-top-r"><a className="top-link" href="/?view=lab">Debug lab</a><a className="top-link" href="/">Game</a></div></header>
      <main>
        <h2>Banners</h2>
        <div className="rv-row">{FACTIONS.map((f) => <figure key={f.id}><Banner f={f.id} size={90} /><figcaption>{f.name} · {f.size}</figcaption></figure>)}</div>
        <h2>Characters <small>35 + Ahsoka</small></h2>
        <div className="rv-grid"><figure><CharCard id="ahsoka" /><figcaption>Ahsoka Tano</figcaption></figure>{CHARACTERS.map((c) => <figure key={c.id}><CharCard id={c.id} /><figcaption>{c.name}</figcaption></figure>)}</div>
        <h2>Encounters <small>14</small></h2>
        <div className="rv-grid encs"><figure><EncCard back /><figcaption>Back</figcaption></figure>{ENCOUNTERS.map((e) => <figure key={e.id}><EncCard id={e.id} /><figcaption>{e.name}{e.keep ? ' · keep' : ''}</figcaption></figure>)}</div>
      </main>
    </div>
  );
}
