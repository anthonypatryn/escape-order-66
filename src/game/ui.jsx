import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVELS } from './ai';

// On-brand replacements for the browser's own UI: no confirm()/alert() boxes, no native drop-downs or
// checkboxes anywhere in the game.

// const [confirmIt, dialog] = useConfirm();  …  if (await confirmIt({ title, body, yes, no, danger })) …;  render {dialog}
export function useConfirm() {
  const [ask, setAsk] = useState(null);
  const resolver = useRef(null);
  const confirmIt = useCallback((opts) => new Promise((resolve) => { resolver.current = resolve; setAsk(opts); }), []);
  const done = (v) => { resolver.current?.(v); resolver.current = null; setAsk(null); };
  const dialog = ask ? <ConfirmDialog {...ask} onYes={() => done(true)} onNo={() => done(false)} /> : null;
  return [confirmIt, dialog];
}

function ConfirmDialog({ title, body, yes = 'Yes', no = 'Cancel', danger, onYes, onNo }) {
  const yesRef = useRef(null);
  useEffect(() => {
    yesRef.current?.focus();
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onNo(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onNo]);
  return (
    <div className="modal" onClick={onNo}>
      <div className="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
        <div className="btns"><button onClick={onNo}>{no}</button><button ref={yesRef} className={danger ? 'danger' : 'primary'} onClick={onYes}>{yes}</button></div>
      </div>
    </div>
  );
}

// a switch in place of a checkbox
export function Toggle({ checked, onChange, children, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-track"><span className="toggle-knob" /></span>{children && <span className="toggle-text">{children}</span>}
    </button>
  );
}

// a row of chips in place of a drop-down: options = [value, label][]
export function Chips({ value, onChange, options, small }) {
  return (
    <div className={`chips ${small ? 'small' : ''}`} role="radiogroup">
      {options.map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

// computer players get a little screen icon instead of the word "computer"
export function CpuIcon({ size = 18, title = 'Computer player' }) {
  return (
    <svg className="cpu-icon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2.2" fill="currentColor" />
      <rect x="5" y="6" width="14" height="8" rx="1" fill="#fff" opacity=".9" />
      <circle cx="9.5" cy="10" r="1.3" fill="currentColor" /><circle cx="14.5" cy="10" r="1.3" fill="currentColor" />
      <path d="M9 20.5h6M12 16.5v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon({ size = 18 }) {
  return (
    <svg className="cpu-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="7.5" r="4" fill="currentColor" />
      <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z" fill="currentColor" />
    </svg>
  );
}

// a computer player's difficulty: tap to cycle Youngling (easy) → Padawan → Jedi Master (hard); lit sabers show how tough
export const levelName = (id) => (LEVELS.find(([k]) => k === id) ?? LEVELS[1])[1];
export function LevelPick({ level = 'padawan', onChange }) {
  const i = Math.max(0, LEVELS.findIndex(([k]) => k === level));
  const sabers = (
    <span className="lvl-sabers" aria-hidden="true">
      {LEVELS.map((_, k) => <svg key={k} viewBox="0 0 8 24" width="6" height="16" className={k <= i ? 'on' : ''}><rect x="2.5" y="1" width="3" height="15" rx="1.5" className="blade" /><rect x="1.5" y="16" width="5" height="7" rx="1" fill="#9aa3ad" /></svg>)}
    </span>
  );
  if (!onChange) return <span className={`lvl-pick lvl-${LEVELS[i][0]}`} title="Computer difficulty">{sabers}{LEVELS[i][1]}</span>;
  return (
    <button type="button" className={`lvl-pick lvl-${LEVELS[i][0]}`} onClick={() => onChange(LEVELS[(i + 1) % LEVELS.length][0])}
      title="Computer difficulty: tap to change (Youngling = easy, Padawan = normal, Jedi Master = hard)">{sabers}{LEVELS[i][1]}</button>
  );
}

// desktop full screen: the whole page (so the end screen stays full screen too). F toggles it; Esc leaves (browser)
const fsEl = () => document.fullscreenElement ?? document.webkitFullscreenElement;
export const canFullscreen = () => typeof document !== 'undefined' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
export function toggleFullscreen() {
  const d = document.documentElement;
  if (fsEl()) (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
  else (d.requestFullscreen ?? d.webkitRequestFullscreen)?.call(d)?.catch?.(() => {});
}
export function useFullscreen() {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!fsEl());
  useEffect(() => {
    const sync = () => setOn(!!fsEl());
    const key = (e) => {
      if ((e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return; // typing in chat
      e.preventDefault(); toggleFullscreen();
    };
    document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); window.removeEventListener('keydown', key); };
  }, []);
  return on;
}
export function FullscreenIcon({ on, size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );
}

// a small keyboard-key label next to a control (computers only: hidden on phones and touch screens by CSS)
export const Kbd = ({ k }) => <kbd className="kh" aria-hidden="true">{k}</kbd>;
