// Per-device settings (remembered in localStorage): text size, calm motion, the sound mixer, the opening crawl.
// Plain module + a tiny hook so non-React code (sound.js) can read it too.
import { useEffect, useReducer } from 'react';

const KEY = 'eo-settings';
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS = { text: 'normal', calm: !!reduceMotion, crawl: true, hints: true, music: true, mix: { fx: 1, saber: 1, music: 0.6 } };

let cur = DEFAULTS;
try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); cur = { ...DEFAULTS, ...saved, mix: { ...DEFAULTS.mix, ...saved.mix } }; } catch { /* defaults */ }
const subs = new Set();

export const settings = () => cur;
export function setSettings(patch) {
  cur = { ...cur, ...patch, mix: { ...cur.mix, ...patch.mix } };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* not saved */ }
  subs.forEach((fn) => fn());
}
export function useSettings() {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(bump); return () => subs.delete(bump); }, []);
  return cur;
}

export const TEXT_ZOOM = { normal: 1, large: 1.15, larger: 1.3 };
// the two seats: Jedi blue and Sith red (owner's pick)
export const PLAYER_COLORS = ['#3fb6ff', '#ff4655'];
export const playerColor = (pid) => PLAYER_COLORS[pid % PLAYER_COLORS.length];
