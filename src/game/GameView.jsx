import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Galaxy from './Galaxy';
import { CharCard, EncCard, Banner, Logo } from './Cards';
import { TurnSteps, Log, useYourTurn, RulesDrawer } from './Extras';
import { CHAR, ENC, FACTION, FACTIONS, AHSOKA, charArt, encArt, tokenArt } from '../data/cards';
import { DIR, DIRS, countFor, galaxyCount } from './rules';
import { MOVE_MS, READ_MS } from './engine';
import { levelName, Toggle, useConfirm, CpuIcon, Kbd, canFullscreen, toggleFullscreen, useFullscreen, FullscreenIcon } from './ui';
import { useSettings, TEXT_ZOOM, playerColor } from './prefs';
import { isMuted, setMuted, play, preloadSounds } from './sound';
import { usePhone, PhoneNav, Sheet, useWakeLock, useLockPage } from './Phone';
import SettingsDrawer from './Settings';
import BugReport from './BugReport';
import EndScreen from './EndScreen';
import Crawl from './Crawl';
import MusicPlayer from './MusicPlayer';
import { hold as holdMusic } from './music';

const SPEEDS = [1, 2, 4];
const COARSE = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;
const fname = (f) => FACTION[f]?.name ?? f;
const cname = (id) => CHAR[id]?.name ?? id;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the game screen. props: { state, game, answer, start, rewind, seed, onExit, onRematch, lab }
export default function GameView({ state, game, answer, start, rewind, seed, onExit, onRematch, lab = null, fresh = true }) {
  const prefs = useSettings();
  const { phone, land } = usePhone();
  const full = useFullscreen();
  useWakeLock(true);
  useLockPage(phone);
  const [confirmIt, confirmDialog] = useConfirm();
  const [muted, setMute] = useState(isMuted());
  const [rules, setRules] = useState(false);
  const [bug, setBug] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState(null); // phone sheet
  const [speeds, setSpeedsState] = useState(game?.speeds ?? { human: 1, ai: 1 });
  const setSpeeds = (sp) => { game?.setSpeeds(sp); setSpeedsState((s) => ({ ...s, ...sp })); };
  const [hover, setHover] = useState(null);     // move index under the pointer
  const [sel, setSel] = useState(null);         // move index picked with the arrow keys
  const [hoverChar, setHoverChar] = useState(null);
  const [encOpen, setEncOpen] = useState(null); // { list, i, pick? } encounter close-up
  const [areaOpen, setAreaOpen] = useState(null); // player id whose play area is open
  const [crawl, setCrawl] = useState(() => (lab ? !!lab.crawl : fresh && !game?.started));
  const [dealing, setDealing] = useState(false);
  // animation state, driven by new log lines
  const [glide, setGlide] = useState(null);
  const [ghosts, setGhosts] = useState([]);
  const [fliers, setFliers] = useState([]);
  const [played, setPlayed] = useState(null);
  const [callout, setCallout] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [showEnd, setShowEnd] = useState(false);
  const seen = useRef(null);
  const keys = useRef(null);
  const timers = useRef([]);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // the face-up encounters' voice lines (some are long files) load in the background once the game is going
  useEffect(() => { const t = setTimeout(() => state && preloadSounds(state.row.map((id) => `enc-${id}`)), 8000); return () => clearTimeout(t); }, [game]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e) => keys.current?.(e); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  // a new Game (undo / resume): everything already in its log counts as seen
  useEffect(() => { seen.current = state?.log.at(-1)?.id ?? 0; setGlide(null); setGhosts([]); setPlayed(null); setShowEnd(!!state?.results); }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- moments from new log lines ----------
  useEffect(() => {
    if (!state || seen.current == null) return;
    const freshLines = state.log.filter((l) => l.id > seen.current);
    if (!freshLines.length) return;
    seen.current = freshLines.at(-1).id;
    const calm = prefs.calm;
    for (const l of freshLines) {
      if (l.kind === 'move') {
        const ms = MOVE_MS(l.path.length);
        setSel(null); setHover(null);
        setGlide({ from: l.from, to: l.to, ms: calm ? 0 : ms, id: l.id });
        const gs = l.take.map((cell, k) => ({ cell, id: l.taken[k], kind: 'take', delay: calm ? 0 : Math.round(ms * (l.path.indexOf(cell) + 1) / l.path.length) }));
        setGhosts((g) => [...g, ...gs]);
        gs.forEach((g) => later(() => {
          flyChar(g.id, cellRect(g.cell), areaRect(l.pid, l.faction), { tint: playerColor(l.pid) });
          setGhosts((x) => x.filter((y) => y !== g));
        }, g.delay));
        later(() => setGlide(null), (calm ? 0 : ms) + 60);
      }
      if (l.kind === 'take') {
        const from = l.from.where === 'galaxy' ? cellRect(l.from.idx) : areaRect(l.from.pid, CHAR[l.char]?.faction);
        flyChar(l.char, from, areaRect(l.pid, CHAR[l.char]?.faction), { tint: playerColor(l.pid), arc: true });
      }
      if (l.kind === 'kill') {
        if (l.char && l.from.where === 'galaxy') {
          const g = { cell: l.from.idx, id: l.char, kind: 'kill' };
          setGhosts((x) => [...x, g]);
          later(() => setGhosts((x) => x.filter((y) => y !== g)), 900);
          burst('blast', cellRect(l.from.idx));
        } else if (l.char) burst('blast', areaRect(l.from.pid, CHAR[l.char]?.faction));
        else if (l.enc) burst('blast', document.querySelector(`[data-enc="${l.enc}"]`)?.getBoundingClientRect());
      }
      if (l.kind === 'encounter' && l.enc) {
        setPlayed({ enc: l.enc, pid: l.pid, id: l.id });
        later(() => setPlayed((p) => (p?.id === l.id ? null : p)), READ_MS);
      }
      if (l.kind === 'banner') {
        setCallout({ id: l.id, f: l.faction, pid: l.to, text: l.to == null ? `The ${fname(l.faction)} banner returns to the middle` : `${state.players[l.to].name} ${l.from == null ? 'claims' : 'seizes'} the ${fname(l.faction)} banner` });
        later(() => setCallout((c) => (c?.id === l.id ? null : c)), 2200);
        if (l.to != null && !calm) {
          const from = l.from == null ? document.querySelector(`[data-rack="${l.faction}"]`)?.getBoundingClientRect() : slotRect(l.from, l.faction);
          fly(<Banner f={l.faction} size={56} />, from, slotRect(l.to, l.faction), { size: 56, spin: true });
        }
      }
      if (l.kind === 'end') { later(() => { setShowEnd(true); }, calm ? 200 : 1600); }
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  function fly(content, from, to, opts = {}) {
    if (!from || !to || prefs.calm) return;
    const id = Math.random();
    setFliers((f) => [...f, { id, content, from, to, ...opts }]);
  }
  const flyChar = (cid, from, to, opts) => fly(<img src={charArt(cid)} alt="" />, from, to, { size: from ? Math.min(110, from.width) : 80, card: true, ...opts });
  function burst(kind, rect) {
    if (!rect || prefs.calm) return;
    const b = { id: Math.random(), kind, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setBursts((x) => [...x, b]);
  }

  // the opening crawl → the camera tilts down onto the Galaxy (pan) → the cards are dealt → the game starts
  const [pan, setPan] = useState(0); // ms of the pan running now (0 = none)
  const startPan = (ms) => {
    setPan(ms);
    if (!prefs.calm) later(() => { setDealing(true); play('deal'); later(() => setDealing(false), 1700); }, ms * 0.72);
    later(() => setPan(0), ms + 50);
  };
  // panned = the crawl ended with the tilt down (the deal already ran during it)
  // after the tilt down: "Execute Order 66" (owner's clip) with a red hologram over the Galaxy, the first turn starts under it
  const [order66, setOrder66] = useState(false);
  const finishCrawl = (panned = false) => {
    setCrawl(false);
    if (panned) {
      later(() => holdMusic(false), 6400);
      play('order66');
      if (!prefs.calm) { setOrder66(true); later(() => setOrder66(false), 6500); }
      later(() => start?.(), prefs.calm ? 400 : 6000);
      return;
    }
    holdMusic(false);
    if (!prefs.calm) { setDealing(true); play('deal'); later(() => setDealing(false), 1700); }
    later(() => start?.(), prefs.calm ? 0 : 1400);
  };
  useEffect(() => { if (!crawl && game && !game.started && !lab) { if (!prefs.crawl || prefs.calm) finishCrawl(); } }, [game]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (crawl && (!prefs.crawl || prefs.calm)) finishCrawl(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r0 = state?.request, a0 = r0 ? state.players[r0.player] : null;
  const yourTurn = useYourTurn(r0?.type === 'move' && a0 && !a0.ai ? r0.id : null, { turnKey: state?.turnNo, name: a0?.name });
  if (!state) return null;
  const req = state.request;
  const asked = req ? state.players[req.player] : null;
  const human = !!(req && asked && !asked.ai);
  const moveReq = human && req.type === 'move' ? req : null;
  const moves = moveReq?.options ?? null;
  const preview = moves ? (hover ?? sel) : null;
  const turnP = state.players[state.turn];
  const targetReq = human && req.type === 'target' ? req : null;
  const targets = targetReq ? new Map(targetReq.options.map((o, k) => [o.at.where === 'galaxy' ? o.at.idx : -1 - k, { k, verb: targetReq.verb }]).filter(([c]) => c >= 0)) : null;
  const pickMove = (k) => { setHover(null); setSel(null); answer(k); };
  // touch screens can't hover: the first tap on a card shows the move, a second tap (or Move) makes it
  const tapMove = (k) => { if (COARSE && preview !== k) { setSel(k); setHover(null); } else pickMove(k); };

  // ---------- keyboard ----------
  let undo = null;
  if (rewind && game && !lab && !state.results) {
    const points = new Map();
    for (const t of game.trail) if (!points.has(t.log)) points.set(t.log, { req: t.req, label: `${state.players[t.player]?.name}’s ${t.type === 'move' ? 'move' : 'choice'}` });
    const lastT = game.trail.at(-1);
    undo = { points, last: lastT ? { req: lastT.req, label: `${state.players[lastT.player]?.name}’s ${lastT.type === 'move' ? 'move' : 'choice'}` } : null,
      onUndo: async (r, label, quick) => {
        if (!quick && !(await confirmIt({ title: 'Go back to here?', body: `The game goes back to ${label}. Everything after it is taken back.`, yes: 'Go back' }))) return;
        setEncOpen(null); setTab(null); play('undo'); rewind(r);
      } };
  }
  const dismissPlayed = () => { setPlayed(null); game?.skipRead?.(); };
  keys.current = (e) => {
    if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
      if (document.querySelector('.modal')) return;
      if (undo?.last) { e.preventDefault(); undo.onUndo(undo.last.req, undo.last.label, true); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (crawl) return; // the crawl has its own keys
    if (played && [' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); dismissPlayed(); return; }
    const open = bug || rules || prefsOpen || encOpen || areaOpen != null || menu || showEnd || !!document.querySelector('.modal');
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) { e.preventDefault(); if (!open) setRules('keys'); return; }
    if (open) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const dir = DIRS.find((d) => d.key === e.key);
    if (dir && moves) {
      e.preventDefault();
      const mine = moves.map((m, i) => [m, i]).filter(([m]) => m.dir === dir.id).map(([, i]) => i);
      if (!mine.length) { play('click'); return; }
      const at = mine.indexOf(sel);
      setSel(mine[(at + 1) % mine.length]); setHover(null);
      return;
    }
    if (k === ' ' || k === 'Enter') {
      if (k === 'Enter' && e.target.closest?.('button, a')) return;
      e.preventDefault(); document.activeElement?.blur?.();
      if (moves && preview != null) { pickMove(preview); return; }
      document.querySelector('.prompt-dock .prompt button.primary:not(:disabled)')?.click();
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const n = Number(k) - 1;
      if (moves) { const mine = sel != null ? moves.map((m, i) => [m, i]).filter(([m]) => m.dir === moves[sel].dir).map(([, i]) => i) : moves.map((_, i) => i); if (mine[n] != null) { e.preventDefault(); setSel(mine[n]); } return; }
      document.querySelectorAll('.prompt-dock .prompt [data-n]')[n]?.click();
      return;
    }
    if (k === 'r') { setRules('turn'); return; }
    if (k === 'm') { setMuted(!muted); setMute(!muted); }
  };

  // ---------- pieces ----------
  const speedRow = (who) => <div className="speed">{SPEEDS.map((s) => <button key={s} className={speeds[who] === s ? 'on' : ''} onClick={() => setSpeeds({ [who]: s })}>{s}×</button>)}</div>;
  const soundBtn = <button onClick={() => { setMuted(!muted); setMute(!muted); }} title="Sound on / off (M)">{muted ? 'Muted' : <>Sound<span className="wide-only"> on</span></>}<Kbd k="M" /></button>;
  const leave = async () => { if (lab || state.results || await confirmIt({ title: 'Take a break?', body: 'The game is saved. Pick it up any time from Saved games on the home screen.', yes: 'Leave' })) onExit(); };
  const banners = <BannersPanel state={state} hoverChar={hoverChar} />;
  const encounters = <EncountersPanel state={state} req={human && req.type === 'encounter' ? req : null} onOpen={setEncOpen} />;
  const players = <PlayersPanel state={state} onOpenArea={setAreaOpen} targetReq={targetReq} onTarget={answer} hoverChar={hoverChar} setHoverChar={setHoverChar} />;
  const log = <Log log={state.log} me={null} Toggle={Toggle} undo={undo} />;
  const promptDock = (
    <div className="prompt-dock">
      {req && <Prompt state={state} req={req} human={human} answer={answer} preview={preview} setHover={setHover} sel={sel} setSel={setSel} onPickMove={pickMove} onTapMove={tapMove} onOpenEnc={setEncOpen} hints={prefs.hints} />}
    </div>
  );
  const unread = 0;

  return (
    <div className={`game ${phone ? 'phone' : ''} ${land ? 'land' : ''} ${prefs.calm ? 'calm' : ''} ${pan ? 'panning' : ''}`} style={{ '--ui': TEXT_ZOOM[prefs.text] ?? 1, '--p0': playerColor(0), '--p1': playerColor(1), '--pan': `${pan}ms` }}>
      <Stars />
      {phone ? (
        <header className="game-top">
          <span className="game-turn"><b style={{ color: playerColor(turnP.id) }}>{turnP.name}</b>’s turn <small>· {state.turnNo || 1}</small></span>
          <span className="top-score">{state.players.map((p) => <b key={p.id} style={{ color: playerColor(p.id) }}>{Object.values(state.banner).filter((h) => h === p.id).length}</b>)}</span>
          <button className="menu-btn" onClick={() => setMenu(true)} aria-label="Menu">⋯</button>
        </header>
      ) : (
        <header className="game-top">
          <Logo size="sm" />
          <span className="game-turn">Turn {state.turnNo || 1} · <b style={{ color: playerColor(turnP.id) }}>{turnP.name}</b>’s move</span>
          <TurnSteps phase={state.phase} />
          <div className="game-top-r">
            {lab && <span className="lab-badge">LAB</span>}
            <MusicPlayer compact />
            {game && <SpeedMenu speeds={speeds} row={speedRow} />}
            <button onClick={() => setRules('turn')} title="How to play (R) · keyboard keys (?)">Rules<Kbd k="R" /></button>
            <button onClick={() => setBug(true)}>Report<span className="wide-only"> a</span> bug</button>
            {soundBtn}
            <button onClick={() => setPrefsOpen(true)}>Settings</button>
            {canFullscreen() && <button className="fs-btn" onClick={(e) => { e.currentTarget.blur(); toggleFullscreen(); }} title={full ? 'Leave full screen (F or Esc)' : 'Full screen (F)'} aria-label="Full screen"><FullscreenIcon on={full} /><Kbd k="F" /></button>}
            <button onClick={leave}>Leave</button>
          </div>
        </header>
      )}
      <div className="game-main">
        {!phone && <aside className="game-left">{banners}{encounters}</aside>}
        <section className="game-board">
          <div className="galaxy-area">
            <Galaxy state={state} moves={moves} preview={preview} onPreview={COARSE ? null : setHover} onPick={tapMove}
              targets={targets} onTarget={(k) => answer(k)} glide={glide} ghosts={ghosts} dealing={dealing} hoverChar={hoverChar ?? targetReq?.first} onHoverChar={setHoverChar} />
            {yourTurn}
            {order66 && (
              <div className="order66" role="status" aria-label="Transmission: Execute Order 66">
                <div className="holo-bust"><img src="/art/palpatine-holo.png" alt="" /><i className="holo-lines" /></div>
                <i className="holo-beam" />
                <div className="order66-text"><small>Transmission</small>Execute Order 66</div>
              </div>
            )}
            {callout && <Callout c={callout} />}
            {phone && <BannerStrip state={state} />}
          </div>
          {(!phone || land) && promptDock}
          {phone && tab && (
            <Sheet title={{ encounters: 'Banners & encounters', players: 'Players', log: 'Holocron log' }[tab]} land={land} onClose={() => setTab(null)}>
              <div className={`sheet-${tab}`}>{tab === 'encounters' ? <>{banners}{encounters}</> : tab === 'players' ? players : log}</div>
            </Sheet>
          )}
        </section>
        {phone && !land && promptDock}
        {phone && (
          <PhoneNav tab={tab} setTab={setTab} badges={{ log: unread }}
            dots={{ encounters: !!(human && req?.type === 'encounter' && tab !== 'encounters'), players: !!(targetReq && !targets?.size && tab !== 'players') }} />
        )}
        {!phone && <aside className="game-side">{players}{log}</aside>}
      </div>
      {phone && menu && (
        <div className="drawer-back" onClick={() => setMenu(false)}>
          <aside className="drawer phone-menu" onClick={(e) => e.stopPropagation()} aria-label="Menu">
            <div className="drawer-head"><h2>Menu</h2><button onClick={() => setMenu(false)}>Close</button></div>
            <div className="drawer-body">
              <MusicPlayer />
              {game && <div className="menu-row"><span>People’s turns</span>{speedRow('human')}</div>}
              {game && <div className="menu-row"><span>Computer turns</span>{speedRow('ai')}</div>}
              <div className="menu-grid">
                <button onClick={() => { setMenu(false); setRules('turn'); }}>Rules</button>
                {soundBtn}
                <button onClick={() => { setMenu(false); setPrefsOpen(true); }}>Settings</button>
                <button onClick={() => { setMenu(false); setBug(true); }}>Report a bug</button>
                {undo?.last && <button onClick={() => { setMenu(false); undo.onUndo(undo.last.req, undo.last.label, true); }}>Undo</button>}
                <button className="danger" onClick={() => { setMenu(false); leave(); }}>Leave game</button>
              </div>
            </div>
          </aside>
        </div>
      )}
      {played && <PlayedEncounter p={played} state={state} onDismiss={dismissPlayed} />}
      {encOpen && <EncLightbox open={encOpen} setOpen={setEncOpen} state={state} req={human && req?.type === 'encounter' ? req : null} answer={answer} />}
      {areaOpen != null && <AreaLightbox state={state} pid={areaOpen} onClose={() => setAreaOpen(null)} />}
      <Fliers fliers={fliers} onDone={(id) => setFliers((f) => f.filter((x) => x.id !== id))} />
      <div className="bursts" aria-hidden="true">
        {bursts.map((b) => <i key={b.id} className={`burst ${b.kind}`} style={{ left: b.x, top: b.y }} onAnimationEnd={() => setBursts((x) => x.filter((y) => y.id !== b.id))} />)}
      </div>
      {crawl && <Crawl players={state.players} onPan={startPan} onDone={() => finishCrawl(true)} />}
      {confirmDialog}
      {rules && <RulesDrawer start={rules === true ? 'turn' : rules} keys={!phone} onClose={() => setRules(false)} />}
      {prefsOpen && <SettingsDrawer onClose={() => setPrefsOpen(false)} />}
      {bug && <BugReport onClose={() => setBug(false)} context={{ round: state.turnNo, turn: turnP.name, seed, players: state.players.map((p) => ({ name: p.name, ai: p.ai })), log: state.log.slice(-15).map((l) => l.text) }} />}
      {showEnd && state.results && <EndScreen state={state} onNew={onExit} onRematch={onRematch} onBoard={() => setShowEnd(false)} />}
      {!showEnd && state.results && <button className="end-reopen" onClick={() => setShowEnd(true)}>Results</button>}
    </div>
  );
}

// ---------- where things are on screen (for fliers) ----------
const cellRect = (i) => document.querySelector(`.galaxy [data-cell="${i}"]`)?.getBoundingClientRect();
const visible = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
const areaRect = (pid, f) => visible(document.querySelector(`[data-pf="${pid}-${f}"]`)) ?? visible(document.querySelector(`[data-player="${pid}"]`)) ?? visible(document.querySelector('.phone-nav [data-tab="players"]'));
const slotRect = (pid, f) => visible(document.querySelector(`[data-pb="${pid}-${f}"]`)) ?? areaRect(pid, f);

// ---------- background: drifting stars ----------
function Stars() { return <div className="stars" aria-hidden="true"><i /><i /><i /></div>; }

// ---------- left panel: the seven banners (who holds each, the counts, locked or not) ----------
function BannersPanel({ state }) {
  const [a, b] = state.players;
  return (
    <div className="banners-panel">
      <div className="panel-title">Banners <small className="pt-score"><b style={{ color: playerColor(0) }}>{a.name}</b> {Object.values(state.banner).filter((h) => h === 0).length} – {Object.values(state.banner).filter((h) => h === 1).length} <b style={{ color: playerColor(1) }}>{b.name}</b></small></div>
      <ul className="rack">
        {FACTIONS.map((f) => {
          const h = state.banner[f.id], ca = countFor(a, f.id), cb = countFor(b, f.id), left = galaxyCount(state.grid, f.id);
          const locked = ca > cb + left ? 0 : cb > ca + left ? 1 : null;
          return (
            <li key={f.id} data-rack={f.id} className={`${h != null ? `held p${h}` : ''} ${locked != null ? 'locked' : ''}`} style={{ '--hc': h != null ? playerColor(h) : 'transparent', '--fc': f.c2 }}
              title={`${f.name}: ${a.name} ${ca}, ${b.name} ${cb}, ${left} left in the Galaxy${locked != null ? ` — locked for ${state.players[locked].name}` : ''}`}>
              <Banner f={f.id} size={38} off={h == null} />
              <span className="rk-name">{f.short}<small>{f.size}</small></span>
              <span className={`rk-n ${ca > cb ? 'lead' : ''}`} style={{ color: playerColor(0) }}>{ca}</span>
              <span className="rk-left" title="Still in the Galaxy">{left ? <>{left}<i>left</i></> : <i>none left</i>}</span>
              <span className={`rk-n ${cb > ca ? 'lead' : ''}`} style={{ color: playerColor(1) }}>{cb}</span>
              {locked != null && <span className="rk-lock" title="Locked: can’t change hands" style={{ color: playerColor(locked) }}>🔒</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// phone: the banners as a slim strip under the Galaxy
function BannerStrip({ state }) {
  return (
    <div className="banner-strip">
      {FACTIONS.map((f) => {
        const h = state.banner[f.id];
        return <span key={f.id} data-rack={f.id} className={h != null ? 'held' : ''} style={{ '--hc': h != null ? playerColor(h) : 'transparent' }}><Banner f={f.id} size={30} off={h == null} /><small>{state.players.map((p) => countFor(p, f.id)).join('·')}</small></span>;
      })}
    </div>
  );
}

// ---------- left panel: the encounters still available ----------
function EncountersPanel({ state, req, onOpen }) {
  const choosing = req && !req.from && req.verb !== 'kill' ? new Set(req.options) : null;
  const killing = req?.verb === 'kill' ? new Set(req.options) : null;
  return (
    <div className="enc-panel">
      <div className="panel-title">Encounters <small>{state.row.length} available</small></div>
      <div className={`enc-grid ${choosing ? 'choosing' : ''}`}>
        {state.row.map((id, i) => (
          <button key={id} data-enc={id} className={`card-btn enc-slot ${choosing?.has(id) ? 'can-pick' : ''} ${killing?.has(id) ? 'can-kill' : ''}`} onClick={() => onOpen({ list: state.row, i })} title={ENC[id].name}>
            <EncCard id={id} />
          </button>
        ))}
      </div>
      <div className="enc-piles">
        <span className="pile"><EncCard back /><b>{state.deck.length}</b><small>in the deck</small></span>
        <span className="pile used">{state.discard.length ? <EncCard id={state.discard.at(-1)} /> : <i className="pile-empty" />}<b>{state.discard.length}</b><small>used</small></span>
      </div>
    </div>
  );
}

// ---------- right panel: the two players ----------
function PlayersPanel({ state, onOpenArea, targetReq, onTarget, hoverChar, setHoverChar }) {
  const tgt = new Map((targetReq?.options ?? []).map((o, k) => [o.id, { k, at: o.at }]).filter(([, v]) => v.at.where === 'play'));
  return (
    <div className="players-panel">
      <div className="panel-title">Players</div>
      {state.players.map((p) => <PlayerCard key={p.id} p={p} state={state} onOpen={() => onOpenArea(p.id)} tgt={tgt} verb={targetReq?.verb} onTarget={onTarget} hoverChar={hoverChar} setHoverChar={setHoverChar} />)}
    </div>
  );
}

function PlayerCard({ p, state, onOpen, tgt, verb, onTarget, hoverChar, setHoverChar }) {
  const turn = state.turn === p.id && !state.results;
  const mine = FACTIONS.filter((f) => state.banner[f.id] === p.id);
  const score = mine.length;
  const groups = FACTIONS.map((f) => ({ f, cards: p.cards.filter((id) => CHAR[id].faction === f.id) }));
  return (
    <div className={`pcard ${turn ? 'is-turn' : ''}`} data-player={p.id} style={{ '--pc': playerColor(p.id) }}>
      <div className="pcard-top">
        <span className="pc-dot" />
        <b className="pc-name">{turn && <span className="turn-flag">Turn</span>}{p.name}</b>
        {p.ai && <span className="pc-cpu"><CpuIcon size={16} />{levelName(p.level)}</span>}
        <span className="pc-score" title="Banners held"><ScorePop n={score} />{score}<small>banner{score === 1 ? '' : 's'}</small></span>
      </div>
      <div className="pc-banners">
        {FACTIONS.map((f) => <span key={f.id} data-pb={`${p.id}-${f.id}`} className={`pc-slot ${state.banner[f.id] === p.id ? 'on' : ''}`}><Banner f={f.id} size={26} off={state.banner[f.id] !== p.id} /></span>)}
      </div>
      <div className="pc-area">
        {groups.map(({ f, cards }) => (
          <div key={f.id} className={`pc-group ${cards.length ? '' : 'none'}`} data-pf={`${p.id}-${f.id}`} style={{ '--fc': f.c2 }}>
            <span className="pc-fn" title={f.name}>{countFor(p, f.id)}</span>
            <span className="pc-thumbs">
              {cards.map((id) => {
                const t = tgt.get(id);
                return (
                  <button key={id} className={`pc-thumb ${t ? `tgt tgt-${verb}` : ''} ${hoverChar === id ? 'hl' : ''}`} title={CHAR[id].name}
                    onMouseEnter={() => setHoverChar(id)} onMouseLeave={() => setHoverChar(null)}
                    onClick={(e) => { e.stopPropagation(); if (t) onTarget(t.k); else onOpen(); }}>
                    <img src={charArt(id)} alt={CHAR[id].name} />
                  </button>
                );
              })}
            </span>
          </div>
        ))}
        {p.kept.length > 0 && (
          <div className="pc-kept">
            {p.kept.map((k) => <span key={k.id} className="kept-chip" title={ENC[k.id].text}><img src={encArt(k.id)} alt="" />{ENC[k.id].name}{k.faction && <small>×2 {FACTION[k.faction].short}</small>}{k.id === 'omega' && <small>{p.cards.includes('hunter') ? '×2 Bad Batch' : 'needs Hunter'}</small>}{k.id === 'nightsisters' && <small>+1 Dathomir</small>}</span>)}
          </div>
        )}
        {!p.cards.length && !p.kept.length && <p className="note pc-empty">No characters yet.</p>}
      </div>
      <button className="pc-open linkish" onClick={onOpen}>See play area</button>
    </div>
  );
}

function ScorePop({ n }) {
  const prev = useRef(n);
  const [d, setD] = useState(null);
  useEffect(() => { if (n !== prev.current) { setD({ v: n - prev.current, k: Math.random() }); prev.current = n; } }, [n]);
  return d ? <i key={d.k} className={`score-pop ${d.v > 0 ? 'up' : 'down'}`}>{d.v > 0 ? `+${d.v}` : d.v}</i> : null;
}

// ---------- the question ----------
function Prompt({ state, req, human, answer, preview, setHover, sel, setSel, onPickMove, onTapMove, onOpenEnc, hints }) {
  const p = state.players[req.player];
  if (!human) {
    return <div className="prompt thinking"><span className="holo-dot" style={{ background: playerColor(p.id) }} /><b>{p.name}</b> is {req.type === 'move' ? 'plotting a course' : 'deciding'} <span className="dots" /></div>;
  }
  if (req.type === 'move') {
    const m = preview != null ? req.options[preview] : null;
    return (
      <div className="prompt move-prompt">
        <div className="mp-head"><b>{p.name}</b>, move Ahsoka<span className="note"> · tap a glowing card, or use the arrow keys</span></div>
        <div className="dir-groups">
          {DIRS.map((d) => {
            const opts = req.options.map((o, k) => [o, k]).filter(([o]) => o.dir === d.id);
            return (
              <div key={d.id} className={`dir-group ${opts.length ? '' : 'none'} ${m?.dir === d.id ? 'on' : ''}`}>
                <span className="dg-arrow">{d.arrow}</span>
                {opts.length ? opts.map(([o, k], n) => (
                  <button key={k} data-k={k} className={`fchip ${preview === k ? 'on' : ''}`} style={{ '--fc': FACTION[o.faction].c2 }}
                    onMouseEnter={() => !COARSE && setHover(k)} onMouseLeave={() => setHover(null)} onFocus={() => setSel(k)} onClick={() => onTapMove(k)}
                    title={`${fname(o.faction)}: take ${plural(o.take.length, 'card')}`}>
                    <img src={tokenArt(o.faction)} alt="" />{o.take.length > 1 && <b>×{o.take.length}</b>}
                    {sel != null && req.options[sel].dir === d.id && <kbd className="kh">{n + 1}</kbd>}
                  </button>
                )) : <small>—</small>}
              </div>
            );
          })}
        </div>
        <div className="mp-foot">
          {m ? <MoveHint state={state} p={p} m={m} hints={hints} /> : <span className="note">Point at a card to see what you’d take.</span>}
          <button className="primary" disabled={preview == null} onClick={() => onPickMove(preview)}>Move<Kbd k="Space" /></button>
        </div>
      </div>
    );
  }
  if (req.type === 'encounter') {
    const kill = req.verb === 'kill';
    return (
      <div className="prompt tall enc-prompt">
        <p><b>{p.name}</b>: {req.prompt}</p>
        <div className="enc-choices">
          {req.options.map((id, n) => {
            const why = !kill ? req.info?.[id]?.why : null, note = !kill ? req.info?.[id]?.note : null;
            return (
              <div key={id} className={`enc-choice ${why ? 'fizzle' : ''}`}>
                <button className="card-btn" onClick={() => onOpenEnc({ list: req.options, i: n, pick: true })}><EncCard id={id} /></button>
                <button data-n={n} className={kill ? 'danger' : why ? '' : 'primary'} onClick={() => answer(id)}>{kill ? 'Kill' : 'Choose'} <kbd className="kh">{n + 1}</kbd></button>
                {(why || note) && <small className={why ? 'why' : 'okay'}>{why ?? note}</small>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (req.type === 'faction') {
    return (
      <div className="prompt">
        <p><b>{p.name}</b>: {req.prompt}</p>
        <div className="faction-pick">
          {req.options.map((f, n) => (
            <button key={f} data-n={n} className="fpick" onClick={() => answer(f)} style={{ '--fc': FACTION[f].c2 }}>
              <Banner f={f} size={36} /><span>{FACTION[f].short}</span><small>{state.players.map((x) => countFor(x, f)).join(' – ')}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (req.type === 'target') {
    return (
      <div className={`prompt target-prompt v-${req.verb}`}>
        <p><b>{p.name}</b>: {req.prompt} <span className="note">{req.options.some((o) => o.at.where === 'galaxy') ? 'Tap a card in the Galaxy' : ''}{req.options.some((o) => o.at.where === 'play') ? `${req.options.some((o) => o.at.where === 'galaxy') ? ' or' : 'Tap one'} in a play area` : ''}.</span></p>
        <div className="target-row">
          {req.options.map((o, n) => (o.at.where === 'galaxy' && req.options.filter((x) => x.at.where === 'galaxy').length > 8 ? null : (
            <button key={`${o.id}-${n}`} data-n={n} className="tchip" onClick={() => answer(n)} title={cname(o.id)}>
              <img src={charArt(o.id)} alt="" />
              <span>{cname(o.id)}<small>{o.at.where === 'galaxy' ? 'Galaxy' : `${state.players[o.at.pid].name}’s area`}</small></span>
              {n < 9 && <kbd className="kh">{n + 1}</kbd>}
            </button>
          )))}
        </div>
      </div>
    );
  }
  return null;
}

// what a move would do: the cards, the banner swing, an encounter
function MoveHint({ state, p, m, hints }) {
  const opp = state.players.find((x) => x.id !== p.id);
  const mine = countFor(p, m.faction) + m.take.length, theirs = countFor(opp, m.faction);
  const empties = galaxyCount(state.grid, m.faction) === m.take.length && state.row.length > 0;
  const holder = state.banner[m.faction];
  return (
    <span className="move-hint">
      <span className="mh-cards">{m.take.map((i) => <img key={i} src={charArt(state.grid[i])} alt={cname(state.grid[i])} title={cname(state.grid[i])} />)}</span>
      <span>
        <b>{DIR[m.dir].arrow} {plural(m.take.length, fname(m.faction).replace(/s$/, '') + ' card').replace('card cards', 'cards')}</b>
        {hints && <> · you’d have <b>{mine}</b> vs {theirs}{mine >= theirs && holder !== p.id ? <em className="gain"> → banner!</em> : holder === p.id ? ' (yours)' : ''}</>}
        {empties && <em className="enc-hint"> · last ones: encounter!</em>}
      </span>
    </span>
  );
}

// ---------- an encounter, big, while it happens ----------
function PlayedEncounter({ p, state, onDismiss }) {
  const e = ENC[p.enc];
  return (
    <div className="played" onClick={onDismiss} role="dialog" aria-label={`${state.players[p.pid]?.name} meets ${e.name}`}>
      <div className="played-who" style={{ '--pc': playerColor(p.pid) }}><b>{state.players[p.pid]?.name}</b> meets <b>{e.name}</b></div>
      <div className="played-card holo-in"><EncCard id={p.enc} /><i className="holo-scan" /></div>
      <button className="played-x">Continue<kbd className="kh">Space</kbd></button>
    </div>
  );
}

function Callout({ c }) {
  return (
    <div className="callout" style={{ '--pc': c.pid != null ? playerColor(c.pid) : '#aaa', '--fc': FACTION[c.f]?.c2 }}>
      <Banner f={c.f} size={64} /><span>{c.text}</span>
    </div>
  );
}

// ---------- close-ups ----------
function useLightboxKeys(onClose, prev, next, main) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') prev?.();
      else if (e.key === 'ArrowRight') next?.();
      else if ((e.key === ' ' || e.key === 'Enter') && main) { e.preventDefault(); main(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose, prev, next, main]);
}

function EncLightbox({ open, setOpen, state, req, answer }) {
  const { list, i } = open;
  const id = list[i];
  const n = list.length;
  const prev = n > 1 ? () => setOpen({ ...open, i: (i + n - 1) % n }) : null;
  const next = n > 1 ? () => setOpen({ ...open, i: (i + 1) % n }) : null;
  const can = req && req.options.includes(id);
  const kill = req?.verb === 'kill';
  const pick = can ? () => { setOpen(null); answer(id); } : null;
  useLightboxKeys(() => setOpen(null), prev, next, pick);
  const why = can && !kill ? req.info?.[id]?.why : null;
  return (
    <div className="lightbox" onClick={() => setOpen(null)}>
      <div className="lb-inner" onClick={(e) => e.stopPropagation()}>
        {prev && <button className="lb-arrow" onClick={prev} aria-label="Previous">‹</button>}
        <div className="lb-enc"><EncCard id={id} /></div>
        {next && <button className="lb-arrow" onClick={next} aria-label="Next">›</button>}
      </div>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lb-info"><b>{ENC[id].name}</b>{ENC[id].keep ? ' · stays in your play area' : ' · discarded after use'}</span>
        {why && <span className="lb-info lb-why">{why} Choosing it does nothing.</span>}
        {can && <button className={kill ? 'danger' : 'primary'} onClick={pick}>{kill ? 'Kill this companion' : 'Choose this encounter'}<Kbd k="Space" /></button>}
        {!can && <span className="lb-info">{state.row.includes(id) ? 'Empty a faction from the Galaxy to choose an encounter.' : ''}</span>}
        <button onClick={() => setOpen(null)}>Close</button>
        {n > 1 && <span className="lb-count">{i + 1} / {n}</span>}
      </div>
    </div>
  );
}

function AreaLightbox({ state, pid, onClose }) {
  const p = state.players[pid];
  useLightboxKeys(onClose);
  return (
    <div className="lightbox area-lb" onClick={onClose}>
      <div className="area-big" onClick={(e) => e.stopPropagation()} style={{ '--pc': playerColor(pid) }}>
        <h2>{p.name}’s play area</h2>
        {FACTIONS.map((f) => {
          const cards = p.cards.filter((id) => CHAR[id].faction === f.id);
          if (!cards.length && !p.kept.some((k) => (k.faction ?? (k.id === 'omega' ? 'badbatch' : k.id === 'nightsisters' ? 'dathomir' : null)) === f.id)) return null;
          return (
            <section key={f.id}>
              <h3><Banner f={f.id} size={28} off={state.banner[f.id] !== pid} /> {f.name} <b>{countFor(p, f.id)}</b>{state.banner[f.id] === pid && <small> · banner</small>}</h3>
              <div className="area-row">{cards.map((id) => <CharCard key={id} id={id} />)}</div>
            </section>
          );
        })}
        {p.kept.length > 0 && <section><h3>Kept encounters</h3><div className="area-row encs">{p.kept.map((k) => <EncCard key={k.id} id={k.id} />)}</div></section>}
        {!p.cards.length && !p.kept.length && <p>Nothing yet.</p>}
        <div className="btns"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// ---------- flying cards / banners (Web Animations; transforms only) ----------
function Fliers({ fliers, onDone }) {
  return <div className="fliers" aria-hidden="true">{fliers.map((f) => <Flier key={f.id} f={f} onDone={() => onDone(f.id)} />)}</div>;
}
function Flier({ f, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const s = f.size ?? 80;
    const x0 = f.from.left + f.from.width / 2 - s / 2, y0 = f.from.top + f.from.height / 2 - s / 2;
    const x1 = f.to.left + f.to.width / 2 - s / 2, y1 = f.to.top + f.to.height / 2 - s / 2;
    const k1 = Math.max(0.28, Math.min(1, (f.to.height || 30) / s));
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - (f.arc ? 120 : 40);
    const a = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${mx}px, ${my}px) scale(${f.card ? 1.12 : 1.4}) rotate(${f.spin ? 180 : -6}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(${k1}) rotate(${f.spin ? 360 : 0}deg)`, opacity: 0.2 },
    ], { duration: f.spin ? 1100 : 760, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
    a.onfinish = onDone;
    return () => a.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className={`flier ${f.card ? 'card' : ''}`} style={{ width: f.size, height: f.card ? f.size : undefined, '--tint': f.tint }}>{f.content}</div>;
}

// top bar: "Speed" opens a small panel (people's turns / computer turns)
function SpeedMenu({ speeds, row }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const label = speeds.human === speeds.ai ? `${speeds.human}×` : `${speeds.human}× / ${speeds.ai}×`;
  return (
    <div className="speed-menu" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>Speed {label}</button>
      {open && <div className="speed-pop"><div className="menu-row"><span>People’s turns</span>{row('human')}</div><div className="menu-row"><span>Computer turns</span>{row('ai')}</div></div>}
    </div>
  );
}

export { AHSOKA };
