import { useEffect, useRef, useState } from 'react';
import { CharCard, EncCard, Banner } from './Cards';
import { CHARACTERS, ENCOUNTERS, FACTIONS } from '../data/cards';
import { play } from './sound';

// ---------- where the current turn is (top bar) ----------
const STEPS = [['move', 'Move Ahsoka'], ['encounter', 'Encounter'], ['banners', 'Banners']];
export function TurnSteps({ phase }) {
  const at = STEPS.findIndex(([k]) => k === (phase === 'moving' ? 'move' : phase));
  if (at < 0) return null;
  return (
    <ol className="turn-steps" aria-label="Turn steps">
      {STEPS.map(([k, l], i) => <li key={k} className={i === at ? 'now' : i < at ? 'done' : ''}><span>{i + 1}</span>{l}</li>)}
    </ol>
  );
}

// ---------- log ----------
const ICONS = {
  move: <path d="M4 12h12M12 6l6 6-6 6" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  take: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 12l2.2 2.2L15.5 10" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  kill: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" strokeWidth="2.2" /></>,
  encounter: <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" />,
  banner: <path d="M7 2.5h10l5 9.5-5 9.5H7l-5-9.5z" />,
  swap: <path d="M4 8h13l-3-3M20 16H7l3 3" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  end: <path d="M5 21V3M5 4h14l-3 4 3 4H5z" />,
  turn: <circle cx="12" cy="12" r="5" />,
};
export function LogIcon({ kind }) {
  return <svg className={`log-icon k-${kind}`} viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">{ICONS[kind] ?? ICONS.turn}</svg>;
}

// undo (one-screen games): { points: Map(log line id → { req, label }), last, onUndo(req, label, quick) }
export function Log({ log, me, Toggle, undo }) {
  const ref = useRef(null);
  const [mine, setMine] = useState(false);
  const shown = mine && me ? log.filter((l) => l.pid === me.id || l.kind === 'turn' || l.text.includes(me.name)) : log;
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }); }, [shown.length]);
  return (
    <>
      <div className="panel-title log-title">Holocron log
        <span className="log-tools">
          {undo?.last && <button className="undo-btn" onClick={() => undo.onUndo(undo.last.req, undo.last.label, true)} title={`Take back: ${undo.last.label}`}><UndoIcon /> Undo<kbd className="kh" aria-hidden="true">Ctrl Z</kbd></button>}
          {me && Toggle && <Toggle checked={mine} onChange={setMine}>Only me</Toggle>}
        </span>
      </div>
      <div className="glog" ref={ref}>
        {shown.map((l) => {
          const u = undo?.points.get(l.id);
          return (
            <div key={l.id} className={`glog-line glog-${l.kind} ${u ? 'can-undo' : ''}`} style={l.pid != null ? { '--pc': `var(--p${l.pid})` } : null}>
              {l.kind !== 'turn' && l.kind !== 'info' && <LogIcon kind={l.kind} />}<span>{l.text}</span>
              {u && <button className="undo-here" onClick={() => undo.onUndo(u.req, u.label)} title={`Go back to here (${u.label})`} aria-label={`Go back to here: ${u.label}`}><UndoIcon /></button>}
            </div>
          );
        })}
      </div>
    </>
  );
}
export const UndoIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;

// ---------- it's your turn: a chime + a banner, once per turn (tab title blinks if you're elsewhere) ----------
export function useYourTurn(mineReqId, { turnKey, name }) {
  const [show, setShow] = useState(false);
  const shown = useRef(new Set());
  useEffect(() => {
    if (mineReqId == null || shown.current.has(turnKey)) return undefined;
    shown.current.add(turnKey);
    play('turn');
    navigator.vibrate?.([60, 40, 60]);
    setShow(true);
    const t = setTimeout(() => setShow(false), 1700);
    if (document.hidden) {
      const title = document.title;
      let on = false;
      const blink = setInterval(() => { on = !on; document.title = on ? 'Your turn! · Order 66' : title; }, 900);
      const stop = () => { clearInterval(blink); document.title = title; document.removeEventListener('visibilitychange', stop); };
      document.addEventListener('visibilitychange', stop);
    }
    return () => clearTimeout(t);
  }, [mineReqId, turnKey]);
  return show ? <div className="your-turn" role="status"><small>{name}</small>Your move</div> : null;
}

// ---------- keyboard keys (desktop): the list in the rules drawer; the handling is in GameView ----------
export const KEYS = [
  ['Space', 'The main button: confirm the highlighted move or choice; dismiss an encounter; skip the opening crawl'],
  ['← ↑ → ↓', 'Point Ahsoka in a direction (press again to cycle through that direction’s factions)'],
  ['1 – 9', 'Pick the numbered choice in the question (a faction, an encounter, a target)'],
  ['Ctrl Z', 'Undo the last choice'],
  ['R', 'How to play'],
  ['M', 'Sound on / off'],
  ['F', 'Full screen (Esc leaves)'],
  ['Esc', 'Close whatever is open'],
  ['?', 'This list'],
];
function KeysHelp() {
  return (
    <div className="rules-text keys-help">
      <p>On a computer with a keyboard.</p>
      <dl>{KEYS.map(([k, what]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>)}</dl>
    </div>
  );
}

// ---------- rules drawer ----------
export function RulesDrawer({ onClose, start = 'turn', keys = false }) {
  const [tab, setTab] = useState(start);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const key = (e) => { if (e.key !== 'Escape') return; if (open) setOpen(null); else onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Rules">
        <div className="drawer-head"><h2>How to play</h2><button onClick={onClose} aria-label="Close rules">Close</button></div>
        <div className="seg drawer-tabs">
          {[['turn', 'A turn'], ['win', 'Winning'], ['enc', 'Encounters'], ['factions', 'Factions'], ...(keys ? [['keys', 'Keys']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="drawer-body">
          {tab === 'keys' && <KeysHelp />}
          {tab === 'turn' && (
            <div className="rules-text">
              <p>The Galaxy is a 6 × 6 grid: 35 characters and Ahsoka. On your turn you <b>move Ahsoka</b>:</p>
              <ol>
                <li><b>Pick a direction</b> (up, down, left or right — never diagonally) <b>and a faction</b> that has a card in that line.</li>
                <li>Ahsoka jumps to the <b>farthest</b> card of that faction in that direction, passing over other cards and empty spaces.</li>
                <li>You take that card <b>and every card of the same faction she passed</b>. They go to your play area.</li>
                <li>Took the <b>last</b> card of a faction from the Galaxy? <b>Choose an encounter</b> and resolve it at once.</li>
                <li><b>Banners:</b> for each faction you collected, if you now have at least as many of its cards as your opponent, take its banner.</li>
              </ol>
              <p>The game ends the moment Ahsoka <b>can’t move</b>: no card left in any of the four directions.</p>
            </div>
          )}
          {tab === 'win' && (
            <div className="rules-text">
              <p>The player with the <b>most banners</b> wins.</p>
              <p><b>Tie?</b> The tied player holding the banner of the biggest faction wins (Clone Troopers 8 → Jedi 7 → Empire 6 → Bad Batch 5 → Dathomir 4 → Separatists 3 → Bounty Hunters 2).</p>
              <div className="faction-sizes">{FACTIONS.map((f) => <span key={f.id}><Banner f={f.id} size={34} /><b>{f.size}</b> {f.name}</span>)}</div>
              <p>A banner is <b>locked</b> once one player has more cards of that faction than the other could ever reach — the Banners panel marks those.</p>
              <p>If an encounter causes a tie, the player who used it takes the banner. Killing the last card of a faction does <b>not</b> earn an encounter.</p>
            </div>
          )}
          {tab === 'enc' && (
            <>
              <p className="note">Six encounters are dealt face up; they’re the only ones in play (Huyang draws from the rest). Tap one to read it big. Hondo, Omega and the Nightsisters stay in your play area and can’t be taken or killed.</p>
              <div className="drawer-grid encs">{ENCOUNTERS.map((e) => <button key={e.id} className="card-btn" onClick={() => setOpen({ enc: e.id })}><EncCard id={e.id} /></button>)}</div>
            </>
          )}
          {tab === 'factions' && FACTIONS.map((f) => (
            <section key={f.id} className="faction-row">
              <h3><Banner f={f.id} size={30} /> {f.name} <small>{f.size} characters</small></h3>
              <div className="drawer-grid chars">{CHARACTERS.filter((c) => c.faction === f.id).map((c) => <button key={c.id} className="card-btn" onClick={() => setOpen({ char: c.id })}><CharCard id={c.id} /></button>)}</div>
            </section>
          ))}
        </div>
      </aside>
      {open && (
        <div className="lightbox" onClick={(e) => { e.stopPropagation(); setOpen(null); }}>
          <div className={open.enc ? 'lb-enc' : 'lb-char'}>{open.enc ? <EncCard id={open.enc} /> : <CharCard id={open.char} />}</div>
          <div className="lb-bar"><button onClick={() => setOpen(null)}>Close</button></div>
        </div>
      )}
    </div>
  );
}
