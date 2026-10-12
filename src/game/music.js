// The music player (like Guillotine's): one playlist shared by the home screen and the game screen, so the music
// carries on from one to the other. Add tracks: drop the mp3 in public/music/ (or public/sfx/) and list it in TRACKS.
// It starts on the first tap (browsers block sound before that) unless the player was paused; it steps aside for the
// opening crawl and the "Execute Order 66" line (hold / release). Volume = the player's slider × Settings → Music.
import { useEffect, useReducer } from 'react';
import { routeMedia } from './sound';
import { settings } from './prefs';

export const TRACKS = [
  { src: '/sfx/home.mp3', name: 'Ahsoka Tano (cinematic)' },
];

const KEY = 'eo-music';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* defaults */ }
const st = { idx: Math.min(saved.idx ?? 0, TRACKS.length - 1), vol: saved.vol ?? 0.5, on: saved.on ?? true, playing: false, cur: 0, dur: 0, held: false };
const subs = new Set();
const emit = () => { subs.forEach((f) => f()); try { localStorage.setItem(KEY, JSON.stringify({ idx: st.idx, vol: st.vol, on: st.on })); } catch { /* ignore */ } };
let el = null;
let gain = null; // the player's volume (a Web Audio gain: iPhone ignores <audio>.volume, BUG-1)
let level = 0;

function audio() {
  if (el || typeof window === 'undefined') return el;
  el = new Audio(TRACKS[st.idx].src);
  el.preload = 'auto';
  el.addEventListener('timeupdate', () => { st.cur = el.currentTime; emit(); });
  el.addEventListener('loadedmetadata', () => { st.dur = el.duration || 0; emit(); });
  el.addEventListener('ended', () => next(true));
  el.addEventListener('play', () => { st.playing = true; emit(); });
  el.addEventListener('pause', () => { st.playing = false; emit(); });
  gain = routeMedia(el); // through the game's master volume, so Mute (M) silences it too
  applyVolume();
  return el;
}
const target = () => Math.max(0, Math.min(1, st.vol * (settings().mix.music ?? 0.6)));
function setLevel(v) { level = v; if (gain) { gain.gain.value = v; if (el) el.volume = 1; } else if (el) el.volume = Math.max(0, Math.min(1, v)); }
export function applyVolume() { setLevel(target()); }

export function play() {
  if (quietPage()) return;
  const a = audio(); if (!a || st.held) return;
  st.on = true;
  a.play().then(() => { if (st.held) { st.resume = true; a.pause(); } }).catch(() => {}); // a show started while it was starting
  emit();
}
export function pause() { st.on = false; el?.pause(); emit(); }
export function toggle() { if (st.playing) pause(); else play(); }
function load(i, keepPlaying) {
  const a = audio(); if (!a) return;
  st.idx = (i + TRACKS.length) % TRACKS.length; st.cur = 0; st.dur = 0;
  a.src = TRACKS[st.idx].src;
  if (keepPlaying && !st.held) a.play().catch(() => {});
  emit();
}
export function next(auto = false) { load(st.idx + 1, auto || st.playing); }
export function prev() { if (el && el.currentTime > 3) { el.currentTime = 0; return; } load(st.idx - 1, st.playing); }
export function seek(t) { if (el) { el.currentTime = t; st.cur = t; emit(); } }
export function setVol(v) { st.vol = v; applyVolume(); emit(); }

// the crawl / Order 66 take over the sound for a while
export function hold(on) {
  if (on === st.held) return;
  st.held = on;
  if (on) { if (el && !el.paused) { st.resume = true; fade(0, 600, () => el.pause()); } else st.resume = false; }
  else if (st.resume && st.on) { audio(); const to = target(); setLevel(0); el.play().then(() => fade(to, 1500)).catch(() => {}); }
  emit();
}
function fade(to, ms, done) {
  if (!el) return;
  const from = level, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); setLevel(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); else { done?.(); if (to > 0) applyVolume(); } };
  requestAnimationFrame(step);
}

// first tap anywhere starts the music (unless the player was paused on purpose)
// (never on the sound editor page: there only the clips being edited should be heard)
const quietPage = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'sounds';
if (typeof window !== 'undefined' && !quietPage()) {
  const first = () => { if (st.on && !st.held && !st.playing) play(); };
  window.addEventListener('pointerdown', first, { once: true, capture: true });
  window.addEventListener('keydown', first, { once: true, capture: true });
}

export function useMusic() {
  const [, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(bump); return () => subs.delete(bump); }, []);
  return st;
}
