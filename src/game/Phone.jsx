import { useEffect, useRef, useState } from 'react';

// ---------- phone layout: the board fills the screen, everything else lives in sheets behind a bottom nav ----------
// Portrait: nav along the bottom, sheets slide up. Sideways (landscape): nav down the right edge, sheets slide in from the right.
const PHONE_Q = '(max-width: 760px), (max-height: 500px) and (orientation: landscape)';
const LAND_Q = '(orientation: landscape)';
export function usePhone() {
  const read = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return { phone: false, land: false };
    const phone = window.matchMedia(PHONE_Q).matches;
    return { phone, land: phone && window.matchMedia(LAND_Q).matches };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV((o) => { const n = read(); return n.phone === o.phone && n.land === o.land ? o : n; });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return v;
}

// swipe detection for touch: calls onSwipe('left' | 'right' | 'up' | 'down') after a quick, mostly straight drag
export function useSwipe(onSwipe, { min = 50 } = {}) {
  const start = useRef(null);
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  return {
    onTouchStart: (e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY, at: Date.now() }; },
    onTouchEnd: (e) => {
      const s = start.current; start.current = null;
      if (!s || Date.now() - s.at > 700) return;
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.3) cb.current(dx < 0 ? 'left' : 'right');
      else if (Math.abs(dy) > Math.abs(dx) * 1.3) cb.current(dy < 0 ? 'up' : 'down');
    },
  };
}

const TAB_ICONS = {
  board: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="var(--nav-bg)" strokeWidth="1.4" /></>,
  encounters: <><rect x="3" y="5" width="9" height="14" rx="2" transform="rotate(-12 7.5 12)" opacity=".55" /><rect x="11" y="4" width="9" height="14" rx="2" transform="rotate(8 15.5 11)" /></>,
  players: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" /><circle cx="17" cy="9" r="2.6" opacity=".6" /><path d="M14.5 13.6c3.6-.6 7 1.4 7 5.4h-4.6" opacity=".6" /></>,
  log: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" stroke="var(--nav-bg)" strokeWidth="1.8" strokeLinecap="round" /></>,
};
export const PHONE_TABS = [['board', 'Galaxy'], ['encounters', 'Encounters'], ['players', 'Players'], ['log', 'Log']];

// badges: { hand: '3', log: 2, ... }; dots: { hand: true } = something needs you there
export function PhoneNav({ tab, setTab, badges = {}, dots = {} }) {
  return (
    <nav className="phone-nav" aria-label="Game sections">
      {PHONE_TABS.map(([k, l]) => {
        const on = k === 'board' ? !tab : tab === k;
        return (
          <button key={k} data-tab={k} className={on ? 'on' : ''} aria-pressed={on} onClick={() => setTab(k === 'board' || tab === k ? null : k)}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">{TAB_ICONS[k]}</svg>
            <span>{l}</span>
            {badges[k] != null && badges[k] !== 0 && <b className="nav-badge">{badges[k]}</b>}
            {dots[k] && <i className="nav-dot" />}
          </button>
        );
      })}
    </nav>
  );
}

// a panel that slides over the board; swipe it down (or sideways when the phone is turned) to close
export function Sheet({ title, onClose, land, children, right }) {
  const swipe = useSwipe((d) => { if ((!land && d === 'down') || (land && d === 'right')) onClose(); });
  return (
    <section className={`sheet ${land ? 'side' : ''}`} aria-label={title}>
      <header className="sheet-head" {...swipe}>
        {!land && <i className="sheet-grip" aria-hidden="true" />}
        <h2>{title}</h2>
        {right}
        <button className="sheet-x" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

// keep the screen awake during a game (phones dim and lock otherwise); re-asks when you come back to the tab
export function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return undefined;
    let lock = null, dead = false;
    const ask = async () => { try { if (!dead && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => { dead = true; document.removeEventListener('visibilitychange', ask); lock?.release?.().catch(() => {}); };
  }, [on]);
}

// The game screen never scrolls as a page. iPhone scrolls the window up to make room for the keyboard (the bug
// form, chat) and leaves it there after the keyboard closes: the top bar ends up under the clock / Wi-Fi / battery
// and a pale strip shows at the bottom. Lock the page while the game is up and snap back after every keyboard.
export function useLockPage(on) {
  useEffect(() => {
    if (!on) return undefined;
    const root = document.documentElement;
    root.classList.add('page-lock');
    const snap = () => setTimeout(() => {
      if (document.activeElement?.matches?.('input, textarea, [contenteditable]')) return; // keyboard still up
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    }, 80);
    window.addEventListener('focusout', snap);
    window.visualViewport?.addEventListener('resize', snap);
    snap();
    return () => {
      root.classList.remove('page-lock');
      window.removeEventListener('focusout', snap);
      window.visualViewport?.removeEventListener('resize', snap);
    };
  }, [on]);
}

// Home-screen app on iPhone: the viewport can be reported a status bar shorter than the screen. We once sized the app
// to the full screen height to fill that strip, but the phone then didn't draw the bottom of the app and the nav vanished
// (owner's screenshot). The app stays 100dvh (always fully visible); a leftover strip below it shows the page background,
// which is the nav's colour during a game (html.page-lock), so it reads as part of the nav.
