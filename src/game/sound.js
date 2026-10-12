// Sound: the owner's recordings (public/sfx/*.mp3, set up in src/data/sounds.json / the sound editor) where there are
// any; everything else is synthesized with Web Audio. See public/sfx/README.md.
import { settings } from './prefs';

// The clips for each sound live in src/data/sounds.json ({ name: [{ file, start, len, vol, fade }] }, one picked at random).
// The sound editor (/?view=sounds) can save changes to the server (/api/sounds); those override the JSON for everyone
// as soon as the page loads (loadSoundOverrides in main.jsx). "Copy for Claude" there gives the JSON to bake in.
import BUILTIN from '../data/sounds.json';
let FILES = { ...BUILTIN };
export const builtinSounds = () => BUILTIN;
export const soundConfig = () => FILES;
export const hasSound = (name) => !!FILES[name]?.length;
export function setSoundConfig(map) { FILES = { ...BUILTIN, ...map }; }
export async function loadSoundOverrides() {
  try { const r = await fetch('/api/sounds'); if (!r.ok) return; const j = await r.json(); if (j?.sounds) setSoundConfig(j.sounds); } catch { /* the built-in clips */ }
}
// mixer channels (Settings → Sound)
const CHANNEL = { bighaul: 'fx', crawl: 'music', order66: 'music', saber: 'saber', swap: 'saber', hum: 'saber', take: 'fx', kill: 'fx', banner: 'fx', encounter: 'fx', turn: 'fx', deal: 'fx', click: 'fx', lose: 'fx', win: 'music', hyper: 'music' };
const level = (name) => settings().mix[CHANNEL[name] ?? 'fx'] ?? 1;

let ctx = null;
const AC = () => window.AudioContext || window.webkitAudioContext;
function wakeCtx() {
  ctx ??= new (AC())();
  if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  if (ctx.state === 'closed') ctx = new (AC())();
  return ctx;
}
let muted = false;
try { muted = localStorage.getItem('eo-muted') === '1'; } catch { /* ignore */ }
export const isMuted = () => muted;
let master = null;
function out() {
  if (!master || master.context !== ctx) {
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  return master;
}
export function setMuted(v) {
  muted = v; try { localStorage.setItem('eo-muted', v ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) { const g = master.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v ? 0 : 1, t + 0.08); }
}

// ---------- recordings (when FILES lists one) ----------
const buffers = {};
// a clip's file: a name in public/sfx, or 'blob:<pathname>' = uploaded from the sound editor (private Blob store, via /api/sfx)
export const fileUrl = (file) => (file.startsWith('blob:') ? `/api/sfx?p=${encodeURIComponent(file.slice(5))}` : `/sfx/${file}.mp3`);
const load = (file) => (buffers[file] ??= fetch(fileUrl(file)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null));
async function playFile(clips, mix) {
  const c = clips[Math.floor(Math.random() * clips.length)];
  return !!(await playClip(c, mix));
}
// one clip { file, start, len, vol, fade } at a mixer level → { stop() } (null if the file can't load). The editor uses it too.
export async function playClip({ file, start = 0, len, vol = 1, fade = 0.12 }, mix = 1) {
  if (muted || typeof window === 'undefined') return null;
  wakeCtx();
  const buf = await load(file); if (!buf) return null;
  const l = Math.max(0.05, Math.min(len ?? buf.duration - start, buf.duration - start)), f = Math.min(fade, l / 2);
  const src = ctx.createBufferSource(), gain = ctx.createGain(), t = ctx.currentTime;
  src.buffer = buf; gain.gain.setValueAtTime(vol * 0.8 * mix, t);
  gain.gain.setValueAtTime(vol * 0.8 * mix, t + Math.max(0, l - f));
  gain.gain.linearRampToValueAtTime(0, t + l);
  src.connect(gain).connect(out());
  src.start(0, start, l);
  return { stop() { try { src.stop(); } catch { /* done */ } }, t0: t };
}
// for the editor: the decoded file, and the audio clock
export function decodeFile(file) { wakeCtx(); return load(file); }
// warm the cache for some sounds' files (big encounter voice files: so the line isn't late the first time)
export function preloadSounds(names) { try { wakeCtx(); for (const n of names) for (const c of FILES[n] ?? []) load(c.file); } catch { /* optional */ } }
export function audioNow() { return ctx?.currentTime ?? 0; }

// ---------- synth kit ----------
function noiseBuf(sec) { const sr = ctx.sampleRate, b = ctx.createBuffer(1, Math.floor(sr * sec), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function env(node, t, peak, a, d) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); return g; }
function tone(dest, t, { type = 'sine', f0, f1 = f0, dur = 0.2, peak = 0.3, a = 0.005, filt }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  let n = o;
  if (filt) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); n = f; }
  env(n, t, peak, a, dur).connect(dest); o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(dest, t, { dur = 0.3, peak = 0.3, type = 'bandpass', f0 = 1200, f1 = f0, q = 1, a = 0.01 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(dur + a + 0.05);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(f); env(f, t, peak, a, dur).connect(dest); s.start(t); s.stop(t + dur + a + 0.05);
}
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

const SYNTH = {
  // Ahsoka moves: a lightsaber swing (hum that swells and bends past you) — len = how long she glides
  saber(d, t, { len = 0.8 } = {}) {
    const dur = Math.max(0.45, len);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(92, t); o1.frequency.linearRampToValueAtTime(128, t + dur * 0.45); o1.frequency.linearRampToValueAtTime(84, t + dur);
    o2.frequency.setValueAtTime(93.5, t); o2.frequency.linearRampToValueAtTime(131, t + dur * 0.45); o2.frequency.linearRampToValueAtTime(85, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1500, t + dur * 0.45); f.frequency.linearRampToValueAtTime(380, t + dur);
    o1.connect(f); o2.connect(f);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(d); o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    noise(d, t, { dur, peak: 0.08, f0: 600, f1: 2400, q: 2, a: dur * 0.4 });
  },
  hum(d, t) { tone(d, t, { type: 'sawtooth', f0: 90, f1: 96, dur: 0.6, peak: 0.12, a: 0.08, filt: 600 }); },
  // a card lands in your play area: two holo pings
  take(d, t) { tone(d, t, { f0: NOTE(84), dur: 0.12, peak: 0.16 }); tone(d, t + 0.07, { f0: NOTE(91), dur: 0.18, peak: 0.14 }); noise(d, t, { dur: 0.12, peak: 0.05, f0: 5000, q: 3 }); },
  // a kill: a blaster bolt + a thud
  kill(d, t) {
    tone(d, t, { type: 'square', f0: 2200, f1: 160, dur: 0.22, peak: 0.2, filt: 3200 });
    tone(d, t + 0.01, { type: 'sawtooth', f0: 1300, f1: 120, dur: 0.25, peak: 0.12 });
    noise(d, t + 0.02, { dur: 0.3, peak: 0.25, type: 'lowpass', f0: 900, f1: 120 });
  },
  // a banner changes hands: a short brass stab
  banner(d, t, { down } = {}) {
    const chord = down ? [55, 58, 62] : [55, 59, 62, 67];
    chord.forEach((n, i) => tone(d, t + i * 0.02, { type: 'sawtooth', f0: NOTE(n), dur: 0.55, peak: 0.08, a: 0.03, filt: 1700 }));
    tone(d, t, { type: 'triangle', f0: NOTE(43), dur: 0.6, peak: 0.18, a: 0.02 });
  },
  // an encounter: a hologram shimmer
  encounter(d, t) {
    [72, 76, 79, 84, 88].forEach((n, i) => tone(d, t + i * 0.055, { f0: NOTE(n), dur: 0.35, peak: 0.07 }));
    noise(d, t, { dur: 0.6, peak: 0.05, f0: 3000, f1: 8000, q: 4, a: 0.1 });
  },
  swap(d, t) { noise(d, t, { dur: 0.35, peak: 0.18, f0: 400, f1: 3000, q: 2 }); noise(d, t + 0.3, { dur: 0.35, peak: 0.18, f0: 3000, f1: 400, q: 2 }); },
  // your turn: a little droid chirp
  turn(d, t) {
    tone(d, t, { f0: 1300, f1: 2400, dur: 0.09, peak: 0.12 });
    tone(d, t + 0.11, { f0: 2600, f1: 1500, dur: 0.08, peak: 0.1 });
    tone(d, t + 0.22, { f0: 1700, f1: 2900, dur: 0.12, peak: 0.12 });
  },
  deal(d, t) { noise(d, t, { dur: 0.06, peak: 0.12, f0: 2500, q: 1.5 }); },
  click(d, t) { tone(d, t, { f0: 1800, dur: 0.03, peak: 0.05 }); },
  // the jump to lightspeed (start of a game)
  hyper(d, t) {
    noise(d, t, { dur: 1.6, peak: 0.25, f0: 200, f1: 5000, q: 0.8, a: 1.2 });
    tone(d, t, { type: 'sawtooth', f0: 55, f1: 440, dur: 1.5, peak: 0.12, a: 1.1, filt: 1200 });
  },
  // the winner: a rising brass fanfare (generic, not the film's)
  win(d, t) {
    const seq = [[58, 0, 0.18], [58, 0.2, 0.12], [65, 0.34, 0.5], [70, 0.9, 0.35], [69, 1.28, 0.16], [67, 1.46, 0.16], [77, 1.64, 0.9]];
    for (const [n, at, dur] of seq) { tone(d, t + at, { type: 'sawtooth', f0: NOTE(n), dur, peak: 0.1, a: 0.03, filt: 2200 }); tone(d, t + at, { type: 'triangle', f0: NOTE(n - 12), dur, peak: 0.12, a: 0.02 }); }
    [46, 53, 58].forEach((n) => tone(d, t + 1.64, { type: 'triangle', f0: NOTE(n), dur: 1.2, peak: 0.1, a: 0.05 }));
  },
  lose(d, t) { [[55, 0], [51, 0.35], [48, 0.7]].forEach(([n, at]) => tone(d, t + at, { type: 'sawtooth', f0: NOTE(n), dur: 0.45, peak: 0.1, a: 0.03, filt: 900 })); },
};

export async function play(name, opts = {}) {
  if (muted || typeof window === 'undefined') return;
  const mix = level(name); if (mix <= 0) return;
  try {
    wakeCtx();
    if (FILES[name]?.length && await playFile(FILES[name], mix)) return;
    if (FILES[name] && !SYNTH[name]) return;
    const g = ctx.createGain(); g.gain.value = mix; g.connect(out());
    SYNTH[name]?.(g, ctx.currentTime + 0.01, opts);
  } catch { /* audio is optional */ }
}

// ---------- a piece of music from a file, started at an offset (the opening crawl) ----------
// loadMusic() decodes it ahead of time (so the visuals can start on the same beat); playMusic() returns
// { stop(fade) }. Goes through the Music mixer channel; returns null when muted / turned off (visuals still run).
export function loadMusic(file) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  try { wakeCtx(); return load(file); } catch { return Promise.resolve(null); }
}
export function playMusic(buf, { offset = 0, dur, fadeIn = 0.05, fadeOut = 1.5 } = {}) {
  const lvl = settings().mix.music ?? 0.6;
  if (!buf || muted || lvl <= 0) return null;
  try {
    wakeCtx();
    const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime + 0.02;
    const len = dur ?? buf.duration - offset;
    src.buffer = buf;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9 * lvl, t + fadeIn);
    g.gain.setValueAtTime(0.9 * lvl, t + Math.max(fadeIn, len - fadeOut)); g.gain.linearRampToValueAtTime(0.0001, t + len);
    src.connect(g).connect(out()); src.start(t, offset, len);
    return {
      stop(fade = 0.8) {
        try { const n = ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0.0001, n + fade); src.stop(n + fade + 0.05); } catch { /* already stopped */ }
      },
    };
  } catch { return null; }
}

// the music player's <audio> goes through the master volume too (so Mute silences it), via its own gain node — that
// gain is the player's volume (iPhone ignores <audio>.volume: BUG-1). Once per element; returns the gain (null = no Web Audio)
const routed = new WeakMap();
export function routeMedia(el) {
  if (routed.has(el)) return routed.get(el);
  try { wakeCtx(); const g = ctx.createGain(); ctx.createMediaElementSource(el).connect(g).connect(out()); routed.set(el, g); return g; } catch { return null; }
}

// phones only allow sound after a tap: the first tap wakes the audio up (and later taps revive it after a call / app switch)
export function unlockAudioOnFirstTap() {
  if (typeof window === 'undefined') return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  const wake = () => {
    if (ctx?.state === 'running') return;
    try { wakeCtx(); const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch { /* optional */ }
  };
  ['pointerdown', 'touchend', 'keydown'].forEach((e) => window.addEventListener(e, wake, true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') wakeCtx(); });
}
