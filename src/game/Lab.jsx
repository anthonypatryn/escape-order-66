import { useEffect, useMemo, useState } from 'react';
import GameView from './GameView';
import { Game } from './engine';
import { ENCOUNTERS, CHAR, FACTIONS, AHSOKA } from '../data/cards';
import { legalMoves } from './rules';
import { LEVELS } from './ai';
import { useSounds } from './useGame';

// /?view=lab — the debug lab (like Long Shot's /?view=moments): the real game screen on a game that only moves when
// you push it. Play one turn at a time, fire any encounter, kill / take / swap cards, flip banners, jump to the end,
// replay the opening crawl, and read the raw state. Nothing here is saved.
export default function Lab() {
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get('seed')) || 66);
  const [seats, setSeats] = useState([{ name: 'Ahsoka fan', ai: false }, { name: 'Kix', ai: true, level: 'padawan' }]);
  const [n, setN] = useState(0); // remount counter
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [crawl, setCrawl] = useState(false);
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState('');
  const game = useMemo(() => new Game({ seed, players: seats }, { onChange: setState }), [seed, n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setState({ ...game.state }); return () => game.stop(); }, [game]);
  useSounds(state); // the lab plays the game's sounds too (for checking new clips)
  useEffect(() => { setN((x) => x + 1); setMsg(''); }, [seats]);
  if (!state) return null;
  const g = game, s = state, cur = s.players[s.turn];
  const run = async (label, fn) => {
    if (busy) return;
    setBusy(true); setMsg(label);
    try { await fn(); } catch (e) { setMsg(`Error: ${e.message}`); console.error(e); }
    setBusy(false);
  };
  const step = () => run('Playing a turn…', async () => {
    try { await g.playTurn(); } catch { g.finish(); g.emit(); return; }
    if (g.s.extra) g.s.extra = false; else g.s.turn = (g.s.turn + 1) % g.s.players.length;
    g.emit();
  });
  const encounter = (id) => run(`Encounter: ${id}`, async () => {
    const ctx = { touched: new Set(), more: 0 };
    g.s.row = g.s.row.filter((x) => x !== id); g.s.deck = g.s.deck.filter((x) => x !== id);
    await g.playEncounter(g.current(), id, ctx);
    while (ctx.more > 0) { ctx.more--; await g.gainEncounter(g.current(), ctx); }
    await g.settleBanners(g.current(), ctx.touched);
    g.emit();
  });
  const galaxyIds = () => g.s.grid.filter((x) => x && x !== AHSOKA);
  const pickRand = (list) => list[Math.floor(Math.random() * list.length)];
  const killRandom = () => run('Kill', async () => { const id = pickRand(galaxyIds()); if (id) { const ctx = { touched: new Set(), more: 0 }; g.killChar(g.current(), id, ctx); await g.settleBanners(g.current(), ctx.touched); } });
  const takeRandom = (pid) => run('Take', async () => { const id = pickRand(galaxyIds()); if (id) { const ctx = { touched: new Set(), more: 0 }; g.takeChar(g.player(pid), id, ctx); await g.settleBanners(g.player(pid), ctx.touched); } });
  const swapRandom = () => { const ids = galaxyIds(); const a = pickRand(ids), b = pickRand(ids.filter((x) => x !== a)); if (!b) return; const ia = g.s.grid.indexOf(a), ib = g.s.grid.indexOf(b); g.s.grid = g.s.grid.map((x, i) => (i === ia ? b : i === ib ? a : x)); g.log(`Lab: switched ${CHAR[a].name} and ${CHAR[b].name}.`, 'swap', { a: ia, b: ib }); };
  const flipBanner = () => { const f = pickRand(FACTIONS).id, was = g.s.banner[f], to = was == null ? 0 : was === 0 ? 1 : null; g.s.banner = { ...g.s.banner, [f]: to }; g.log(`Lab: ${f} banner → ${to == null ? 'middle' : g.player(to).name}.`, 'banner', { faction: f, from: was, to, pid: to }); };
  const nearEnd = () => { const keep = new Set(legalMoves(g.s.grid, g.s.ahsoka).slice(0, 3).flatMap((m) => m.take)); g.s.grid = g.s.grid.map((x, i) => (x === AHSOKA || keep.has(i) ? x : null)); g.log('Lab: cleared the Galaxy down to a few cards.', 'info'); };
  const endNow = () => { g.finish(); g.emit(); };
  const reset = () => { setN((x) => x + 1); setMsg(''); };
  const toggleAi = (i) => setSeats((ps) => ps.map((p, k) => (k === i ? { ...p, ai: !p.ai } : p)));
  const setLevel = (i, level) => setSeats((ps) => ps.map((p, k) => (k === i ? { ...p, level } : p)));

  const gridNames = Array.from({ length: 6 }, (_, r) => s.grid.slice(r * 6, r * 6 + 6).map((id) => (id === AHSOKA ? '★AHSOKA' : id ? `${CHAR[id].name.split(' ').at(-1)}(${CHAR[id].faction.slice(0, 3)})` : '·').padEnd(16)).join(' ')).join('\n');
  return (
    <>
      <GameView key={`${n}-${crawl}`} state={s} game={g} answer={(v) => g.answer(v)} start={() => {}} seed={seed} lab={{ crawl }}
        onExit={() => { location.href = '/'; }} onRematch={reset} fresh={crawl} />
      <aside className={`lab ${open ? '' : 'closed'}`}>
        <button className="lab-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide lab ▸' : '◂ Lab'}</button>
        {open && (
          <div className="lab-body">
            <h3>Debug lab</h3>
            <p className="note">Turn {s.turnNo} · {cur.name} to move · phase {s.phase}{s.request ? ` · waiting: ${s.request.type}` : ''}</p>
            {msg && <p className="lab-msg">{busy ? '⏳ ' : ''}{msg}</p>}
            <div className="lab-row">
              <label>Seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} /></label>
              <button onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>New deal</button>
              <button onClick={reset}>Reset</button>
            </div>
            {seats.map((p, i) => (
              <div key={i} className="lab-row">
                <b>{p.name}</b>
                <button className={p.ai ? 'on' : ''} onClick={() => toggleAi(i)}>{p.ai ? 'Computer' : 'Person'}</button>
                {p.ai && LEVELS.map(([k, l]) => <button key={k} className={p.level === k ? 'on' : ''} onClick={() => setLevel(i, k)}>{l}</button>)}
              </div>
            ))}
            <h4>Turns</h4>
            <div className="lab-row">
              <button className="primary" disabled={busy || !!s.results} onClick={step}>Play one turn</button>
              <button disabled={busy || g.started} onClick={() => { g.started = true; g.run(); setMsg('Running normally'); setBusy(true); }}>Run the game normally</button>
            </div>
            <h4>Encounters <small>(for {cur.name})</small></h4>
            <div className="lab-grid">{ENCOUNTERS.map((e) => <button key={e.id} disabled={busy} onClick={() => encounter(e.id)}>{e.name}</button>)}</div>
            <h4>Moments</h4>
            <div className="lab-grid">
              <button disabled={busy} onClick={killRandom}>Kill a card</button>
              <button disabled={busy} onClick={() => takeRandom(0)}>{s.players[0].name} takes one</button>
              <button disabled={busy} onClick={() => takeRandom(1)}>{s.players[1].name} takes one</button>
              <button disabled={busy} onClick={swapRandom}>Switch two cards</button>
              <button disabled={busy} onClick={flipBanner}>Flip a banner</button>
              <button disabled={busy} onClick={nearEnd}>Near the end</button>
              <button disabled={busy} onClick={endNow}>End screen</button>
              <button onClick={() => setCrawl((c) => !c)}>{crawl ? 'Crawl: on (reset to see)' : 'Opening crawl'}</button>
            </div>
            <details>
              <summary>State</summary>
              <pre className="lab-pre">{gridNames}</pre>
              <pre className="lab-pre">{JSON.stringify({ banner: s.banner, row: s.row, deck: s.deck, discard: s.discard, killed: s.killed, players: s.players.map((p) => ({ name: p.name, cards: p.cards.length, kept: p.kept })), request: s.request && { type: s.request.type, player: s.request.player, n: s.request.options?.length } }, null, 1)}</pre>
            </details>
          </div>
        )}
      </aside>
    </>
  );
}
