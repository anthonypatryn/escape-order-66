import { useEffect, useMemo, useRef, useState } from 'react';
import SFX_FILES from 'virtual:sfx-files';
import { Logo } from './Cards';
import { SOUND_GROUPS, SOUND_SLOTS } from '../data/soundSlots';
import { builtinSounds, setSoundConfig, playClip, decodeFile, audioNow, isMuted, setMuted, play } from './sound';

// /?view=sounds — the owner's sound editor. Every sound slot in the game with its clips; for each clip: the file's
// waveform with a draggable start/end, a zoomed strip for fine trimming, volume (with a loudness meter + Match level),
// fade-out, play / listen with a playhead, set start/end at the playhead. Save = live for everyone (the bug-list PIN);
// Copy for Claude = the JSON to bake into src/data/sounds.json.
const TARGET_DB = -14; // the loudness the owner's clips were levelled to
const PIN_KEY = 'eo-bug-pin';
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const same = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export default function SoundEditor() {
  const BUILTIN = builtinSounds();
  const [server, setServer] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [sel, setSel] = useState(new URLSearchParams(location.search).get('slot') || 'saber');
  const [pin, setPin] = useState(() => { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMute] = useState(isMuted());
  const [uploads, setUploads] = useState([]); // files uploaded from here (private Vercel Blob store): [{ name, file }]
  const [upBusy, setUpBusy] = useState('');
  const loadUploads = () => fetch('/api/upload').then((r) => (r.ok ? r.json() : { files: [] })).then((j) => setUploads(j.files ?? [])).catch(() => {});
  useEffect(() => { if (!import.meta.env.DEV) loadUploads(); }, []);
  useEffect(() => {
    fetch('/api/sounds').then((r) => r.json()).then((j) => { const s = j.sounds ?? {}; setServer(s); setCfg({ ...BUILTIN, ...s }); })
      .catch(() => { setServer({}); setCfg({ ...BUILTIN }); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cfg) return <div className="sounds"><p className="note" style={{ padding: 20 }}>Loading…</p></div>;

  const live = { ...BUILTIN, ...server };
  const dirty = (id) => !same(cfg[id], live[id]);
  const anyDirty = SOUND_SLOTS.some((s) => dirty(s.id));
  const clips = cfg[sel] ?? [];
  const setClips = (list) => setCfg((c) => ({ ...c, [sel]: list }));
  const slot = SOUND_SLOTS.find((s) => s.id === sel);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  const save = async () => {
    setBusy(true);
    // only what differs from the built-in JSON is stored on the server
    const diff = Object.fromEntries(SOUND_SLOTS.map((s) => s.id).filter((id) => !same(cfg[id], BUILTIN[id])).map((id) => [id, cfg[id] ?? []]));
    try {
      const r = await fetch('/api/sounds', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bug-pin': pin }, body: JSON.stringify({ sounds: diff }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Server said ${r.status}`);
      try { localStorage.setItem(PIN_KEY, pin); } catch { /* ignore */ }
      setServer(j.sounds); setSoundConfig(j.sounds);
      flash('Saved. It’s live in the game now (reload a game page to hear it).');
    } catch (e) { flash(e.message); }
    setBusy(false);
  };
  const copy = async () => {
    const diff = Object.fromEntries(SOUND_SLOTS.map((s) => s.id).filter((id) => !same(cfg[id], BUILTIN[id])).map((id) => [id, cfg[id] ?? []]));
    await navigator.clipboard.writeText(`Sound editor settings for src/data/sounds.json:\n${JSON.stringify(diff, null, 1)}`);
    flash(Object.keys(diff).length ? `Copied ${Object.keys(diff).length} changed sound(s) for Claude.` : 'Nothing differs from the built-in sounds.');
  };
  const hearIt = () => { setSoundConfig(cfg); play(sel); };
  // upload a sound file and add it as a clip on this sound (live: Vercel Blob, needs the PIN; dev: saved into public/sfx)
  const uploadFile = async (f) => {
    if (!f) return;
    if (!pin && !import.meta.env.DEV) { flash('Type your PIN at the bottom first, then upload.'); return; }
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'sound'; // no spaces in stored names
    setUpBusy(`Uploading ${f.name}…`);
    try {
      let file;
      if (import.meta.env.DEV) {
        const r = await fetch(`/api/upload-dev?name=${encodeURIComponent(name)}`, { method: 'POST', body: f });
        if (!r.ok) throw new Error(`Upload failed (${r.status})`);
        file = (await r.json()).file;
      } else {
        // ask the site first, so a problem shows its real reason (the Blob library only says "Failed to retrieve the presigned URL")
        const chk = await fetch('/api/upload?check=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
        if (!chk.ok) throw new Error((await chk.json().catch(() => ({}))).error || `Upload check failed (${chk.status})`);
        const { uploadPresigned } = await import('@vercel/blob/client');
        const blob = await uploadPresigned(`sfx/${name}${(f.name.match(/\.[a-z0-9]+$/i) ?? ['.mp3'])[0].toLowerCase()}`, f, { access: 'private', handleUploadUrl: '/api/upload', clientPayload: pin, contentType: f.type || 'audio/mpeg' });
        file = `blob:${blob.pathname}`;
        loadUploads();
      }
      try { localStorage.setItem(PIN_KEY, pin); } catch { /* ignore */ }
      setClips([...clips, { file, start: 0, len: 4, vol: 1, fade: 0.15 }]);
      flash(`Uploaded ${f.name}. Trim it below, then Save.`);
    } catch (e) {
      flash(/PIN/.test(e.message) ? 'Wrong PIN.' : e.message || 'Upload failed.');
    }
    setUpBusy('');
  };

  return (
    <div className="sounds">
      <header className="game-top">
        <Logo size="sm" />
        <span className="game-turn">Sound editor</span>
        <div className="game-top-r">
          <a className="top-link" href="/?view=lab">Debug lab</a><a className="top-link" href="/">Game</a>
        </div>
      </header>
      {muted && <div className="snd-muted">Sound is muted. <button onClick={() => { setMuted(false); setMute(false); }}>Unmute</button></div>}
      <div className="snd-main">
        <nav className="snd-list">
          {SOUND_GROUPS.map(([g, list]) => (
            <div key={g}>
              <h4>{g}</h4>
              {list.map(([id, what, synth]) => {
                const n = (cfg[id] ?? []).length;
                return (
                  <button key={id} className={`snd-slot ${sel === id ? 'on' : ''}`} onClick={() => setSel(id)} title={what}>
                    <b>{id}</b>
                    <small className={n ? 'has' : synth ? 'synth' : 'none'}>{n ? `${n} clip${n > 1 ? 's' : ''}` : synth ? 'synth' : 'silent'}</small>
                    {dirty(id) && <i className="snd-dot" title="Unsaved change" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <main className="snd-edit">
          <div className="snd-head">
            <div><h2>{sel}</h2><p className="note">{slot?.what}{clips.length > 1 ? ' · the game picks one of these at random each time' : ''}{!clips.length ? (slot?.synth ? ' · no clips: the built-in synthesized sound plays' : ' · no clips: silent') : ''}</p></div>
            <div className="btns">
              <button onClick={hearIt}>▶ Play as in the game</button>
              {!same(cfg[sel], BUILTIN[sel]) && <button onClick={() => setClips(BUILTIN[sel] ?? [])}>Back to built-in</button>}
            </div>
          </div>
          {clips.map((c, i) => (
            <ClipEditor key={`${sel}-${i}-${c.file}`} clip={c} n={i + 1}
              onChange={(nc) => setClips(clips.map((x, k) => (k === i ? nc : x)))}
              onRemove={() => setClips(clips.filter((_, k) => k !== i))} />
          ))}
          <AddClip uploads={uploads} busy={upBusy} onUpload={uploadFile} onAdd={(file) => setClips([...clips, { file, start: 0, len: 3, vol: 1, fade: 0.15 }])} />
        </main>
      </div>
      <footer className="snd-save">
        <span className="note">{anyDirty ? 'You have unsaved changes (the dots).' : 'All saved.'} Upload new sound files with ⬆ (needs the PIN).</span>
        {msg && <span className="snd-msg">{msg}</span>}
        <label className="snd-pin">PIN <input className="pin-input" type="text" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" data-1p-ignore data-lpignore="true" /></label>
        <button onClick={copy}>Copy for Claude</button>
        <button className="primary" disabled={!anyDirty || !pin || busy} onClick={save}>{busy ? 'Saving…' : 'Save (live for everyone)'}</button>
      </footer>
    </div>
  );
}

function AddClip({ onAdd, onUpload, uploads, busy }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const pick = useRef(null);
  const match = (n) => n.toLowerCase().includes(q.toLowerCase());
  return (
    <div className="snd-addrow">
      <button className="primary" disabled={!!busy} onClick={() => pick.current?.click()}>{busy || '⬆ Upload a sound file'}</button>
      <input ref={pick} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
      {!open && <button onClick={() => setOpen(true)}>+ Add a clip from a file already here</button>}
      {open && (
        <div className="snd-picker">
          <input placeholder="Find a file…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="snd-files">
            {uploads.filter((u) => match(u.name)).map((u) => <button key={u.file} className="up" title="Uploaded" onClick={() => { onAdd(u.file); setOpen(false); setQ(''); }}>☁ {u.name}</button>)}
            {SFX_FILES.filter(match).map((f) => <button key={f} onClick={() => { onAdd(f); setOpen(false); setQ(''); }}>{f}</button>)}
          </div>
          <button onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ---------- one clip: waveform, zoom strip, numbers, play ----------
function ClipEditor({ clip, n, onChange, onRemove }) {
  const [buf, setBuf] = useState(null);
  const [err, setErr] = useState('');
  const [head, setHead] = useState(null); // playhead seconds while listening
  const playing = useRef(null);
  useEffect(() => { let live = true; decodeFile(clip.file).then((b) => { if (live) { if (b) setBuf(b); else setErr('Couldn’t load this file.'); } }); return () => { live = false; stop(); }; }, [clip.file]); // eslint-disable-line react-hooks/exhaustive-deps
  const dur = buf?.duration ?? 0;
  const start = Math.min(clip.start, Math.max(0, dur - 0.05)), end = Math.min(dur || clip.start + clip.len, clip.start + clip.len);
  const set = (patch) => onChange({ ...clip, ...patch });
  const setRange = (s, e) => { s = Math.max(0, Math.min(s, dur - 0.05)); e = Math.max(s + 0.05, Math.min(e, dur)); set({ start: +s.toFixed(3), len: +(e - s).toFixed(3) }); };

  // loudness of the selection (RMS of the audible part) and its peak
  const stats = useMemo(() => {
    if (!buf) return null;
    const d = buf.getChannelData(0), sr = buf.sampleRate, a = Math.floor(start * sr), b = Math.floor(end * sr);
    let s = 0, k = 0, peak = 0;
    for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (v > 0.02) { s += v * v; k++; } }
    return { db: k ? 20 * Math.log10(Math.sqrt(s / k)) : -90, peak };
  }, [buf, start, end]);
  const outDb = stats ? stats.db + 20 * Math.log10(Math.max(clip.vol, 0.001)) : null;
  const clipping = stats && stats.peak * clip.vol * 0.8 > 1;

  function stop() { playing.current?.h?.stop(); cancelAnimationFrame(playing.current?.raf); playing.current = null; setHead(null); }
  async function run(from, len, c) {
    stop();
    const h = await playClip({ ...c, start: from, len });
    if (!h) return;
    const tick = () => { const t = from + (audioNow() - h.t0); if (t >= from + len) { stop(); return; } setHead(t); playing.current.raf = requestAnimationFrame(tick); };
    playing.current = { h, raf: requestAnimationFrame(tick) };
  }
  const playSel = () => run(start, end - start, clip);
  const listen = (from) => run(from, dur - from, { ...clip, vol: Math.min(clip.vol, 2), fade: 0.05 });

  return (
    <section className="clip">
      <div className="clip-top">
        <b>Clip {n}</b><span className="clip-file">{clip.file.startsWith('blob:') ? `☁ ${decodeURIComponent(clip.file.split('/').pop()).replace(/-[A-Za-z0-9]{21,}(\.\w+)$/, '$1')}` : `${clip.file}.mp3`}</span>
        <span className="note">{dur ? `file ${fmt(dur)}` : err || 'loading…'}</span>
        <button className="clip-x" onClick={onRemove}>Remove</button>
      </div>
      {buf && (
        <>
          <Wave buf={buf} from={0} to={dur} start={start} end={end} head={head} onRange={setRange} label="Whole file — drag to select, drag the edges to trim" />
          <Wave buf={buf} from={Math.max(0, start - Math.max(0.4, (end - start) * 0.35))} to={Math.min(dur, end + Math.max(0.4, (end - start) * 0.35))}
            start={start} end={end} head={head} onRange={setRange} zoom label="Close-up of the selection — fine-tune the edges" />
          <div className="clip-row">
            <label>Start <TimeInput value={start} onCommit={(t) => setRange(t, Math.max(end, t + 0.05))} /></label>
            <label>End <TimeInput value={end} onCommit={(t) => setRange(Math.min(start, t - 0.05), t)} /></label>
            <span className="clip-len">Length <b>{(end - start).toFixed(2)} s</b></span>
            <label>Fade-out <input type="range" min="0" max="2" step="0.05" value={clip.fade} onChange={(e) => set({ fade: +e.target.value })} /><small>{clip.fade.toFixed(2)} s</small></label>
          </div>
          <div className="clip-row">
            <label className="clip-vol">Volume <input type="range" min="0" max="6" step="0.05" value={clip.vol} onChange={(e) => set({ vol: +e.target.value })} /><small>×{clip.vol.toFixed(2)} ({(20 * Math.log10(Math.max(clip.vol, 0.001))).toFixed(1)} dB)</small></label>
            {stats && (
              <span className={`clip-meter ${clipping ? 'hot' : ''}`} title={`Target ${TARGET_DB} dB (what the other clips were levelled to)`}>
                <i style={{ '--m': `${Math.max(0, Math.min(100, (outDb + 40) * 2.5))}%`, '--t': `${(TARGET_DB + 40) * 2.5}%` }} />
                Loudness <b>{outDb.toFixed(1)} dB</b>{clipping && ' · may distort'}
              </span>
            )}
            {stats && <button onClick={() => set({ vol: +Math.min(6, 10 ** ((TARGET_DB - stats.db) / 20)).toFixed(2) })}>Match level</button>}
          </div>
          <div className="clip-row btns-left">
            <button className="primary" onClick={playSel}>▶ Play clip</button>
            <button onClick={() => listen(Math.max(0, start - 1.5))}>▶ Listen around it</button>
            <button onClick={() => listen(0)}>▶ Listen to whole file</button>
            <button disabled={head == null} onClick={stop}>■ Stop</button>
            <button disabled={head == null} onClick={() => setRange(head, Math.max(end, head + 0.1))}>Set start here</button>
            <button disabled={head == null} onClick={() => setRange(start, head)}>Set end here</button>
            {head != null && <span className="clip-head">{fmt(head)}</span>}
          </div>
        </>
      )}
    </section>
  );
}

// a time box you can type into freely ("1:43.69" or "103.69", applied on Enter / click away) AND nudge: ▲▼ buttons step
// 0.01 s (hold to keep stepping), ↑ / ↓ keys while it's selected do the same, Shift = 0.1 s
function TimeInput({ value, onCommit }) {
  const [text, setText] = useState(null); // null = not editing: show the value
  const cur = useRef(value); cur.current = value;
  const rep = useRef(null);
  const parse = (v) => {
    const m = String(v).trim().match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
    if (!m) return null;
    return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
  };
  const commit = () => { const t = parse(text); setText(null); if (t != null && Number.isFinite(t)) onCommit(t); };
  const nudge = (d) => { const t = Math.max(0, +(cur.current + d).toFixed(3)); cur.current = t; setText(null); onCommit(t); };
  const hold = (d) => { nudge(d); clearTimeout(rep.current); const go = (ms) => { rep.current = setTimeout(() => { nudge(d); go(Math.max(30, ms * 0.8)); }, ms); }; go(380); };
  const stop = () => clearTimeout(rep.current);
  useEffect(() => stop, []);
  const step = (e) => (e.shiftKey ? 0.1 : 0.01);
  return (
    <span className="time-box">
      <input className={`time-in ${text != null && parse(text) == null ? 'bad' : ''}`} inputMode="decimal" value={text ?? fmt(value)}
        onFocus={(e) => { setText(fmt(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setText(e.target.value)} onBlur={() => { if (text != null) commit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { setText(null); e.currentTarget.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = text != null ? parse(text) ?? cur.current : cur.current;
            const t = Math.max(0, +(base + (e.key === 'ArrowUp' ? 1 : -1) * step(e)).toFixed(3));
            cur.current = t; onCommit(t); setText(fmt(t));
          }
        }}
        title="Type a time like 1:43.69 or 103.69 (Enter), or nudge with ↑ ↓ (Shift = 0.1 s)" />
      <span className="time-arrows">
        <button type="button" tabIndex={-1} aria-label="Later by 0.01 s" onPointerDown={(e) => { e.preventDefault(); hold(e.shiftKey ? 0.1 : 0.01); }} onPointerUp={stop} onPointerLeave={stop}>▲</button>
        <button type="button" tabIndex={-1} aria-label="Earlier by 0.01 s" onPointerDown={(e) => { e.preventDefault(); hold(e.shiftKey ? -0.1 : -0.01); }} onPointerUp={stop} onPointerLeave={stop}>▼</button>
      </span>
    </span>
  );
}

// a waveform strip of [from, to] seconds with the selection; drag to make / move / trim it
function Wave({ buf, from, to, start, end, head, onRange, zoom, label }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const W = 1200, H = zoom ? 70 : 56;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext('2d'), d = buf.getChannelData(0), sr = buf.sampleRate;
    g.clearRect(0, 0, W, H);
    const a = Math.floor(from * sr), b = Math.floor(to * sr), per = Math.max(1, Math.floor((b - a) / W));
    const sx = (t) => ((t - from) / (to - from)) * W;
    g.fillStyle = 'rgba(102,204,255,.12)'; g.fillRect(sx(start), 0, sx(end) - sx(start), H);
    for (let x = 0; x < W; x++) {
      let mn = 0, mx = 0;
      for (let i = a + x * per, z = Math.min(b, i + per); i < z; i += Math.max(1, Math.floor(per / 64))) { const v = d[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const t = from + (x / W) * (to - from), inSel = t >= start && t <= end;
      g.fillStyle = inSel ? '#66ccff' : 'rgba(200,215,235,.35)';
      g.fillRect(x, H / 2 + mn * H / 2, 1, Math.max(1, (mx - mn) * H / 2));
    }
    g.fillStyle = '#ffe14d'; g.fillRect(sx(start) - 1, 0, 2, H); g.fillRect(sx(end) - 1, 0, 2, H);
    if (head != null && head >= from && head <= to) { g.fillStyle = '#ff4655'; g.fillRect(sx(head) - 1, 0, 2, H); }
  }, [buf, from, to, start, end, head, H]);
  const tAt = (e) => { const r = ref.current.getBoundingClientRect(); return from + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (to - from); };
  const down = (e) => {
    const r = ref.current.getBoundingClientRect(), px = (to - from) / r.width, t = tAt(e);
    const near = 7 * px;
    drag.current = Math.abs(t - start) < near ? { k: 'start' } : Math.abs(t - end) < near ? { k: 'end' } : t > start && t < end ? { k: 'move', off: t - start, len: end - start } : { k: 'new', at: t };
    ref.current.setPointerCapture(e.pointerId);
    if (drag.current.k === 'new') onRange(t, t + 0.05);
  };
  const move = (e) => {
    const dg = drag.current; if (!dg) return;
    const t = tAt(e);
    if (dg.k === 'start') onRange(Math.min(t, end - 0.05), end);
    else if (dg.k === 'end') onRange(start, Math.max(t, start + 0.05));
    else if (dg.k === 'move') onRange(t - dg.off, t - dg.off + dg.len);
    else onRange(Math.min(dg.at, t), Math.max(dg.at, t, Math.min(dg.at, t) + 0.05));
  };
  return (
    <div className={`wave ${zoom ? 'zoom' : ''}`}>
      <small>{label} <span>{fmt(from)} – {fmt(to)}</span></small>
      <canvas ref={ref} width={W} height={H} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} />
    </div>
  );
}
