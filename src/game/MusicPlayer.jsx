import { useMusic, toggle, next, prev, seek, setVol, TRACKS } from './music';

// the little music player (Guillotine's): ‹‹ ▶ ›› · track name + seek bar · volume. Home screen + game top bar.
const fmt = (t) => (!isFinite(t) || t < 0 ? '0:00' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const Ico = ({ d }) => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d={d} /></svg>;
const PLAY = 'M7 4.5v15l13-7.5z', PAUSE = 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z', NEXT = 'M5 5l9 7-9 7zM15 5h3v14h-3z';

export default function MusicPlayer({ compact = false }) {
  const m = useMusic();
  const pct = m.dur ? (m.cur / m.dur) * 100 : 0;
  return (
    <div className={`music-player ${compact ? 'compact' : ''} ${m.held ? 'held' : ''}`} aria-label="Music player">
      <div className="mp-controls">
        <button className="mp-btn" onClick={prev} title="Previous" aria-label="Previous track"><span className="flip"><Ico d={NEXT} /></span></button>
        <button className={`mp-btn mp-play ${m.playing ? 'on' : ''}`} onClick={toggle} title={m.playing ? 'Pause music' : 'Play music'} aria-label={m.playing ? 'Pause music' : 'Play music'}><Ico d={m.playing ? PAUSE : PLAY} /></button>
        <button className="mp-btn" onClick={() => next()} title="Next" aria-label="Next track" disabled={TRACKS.length < 2}><Ico d={NEXT} /></button>
      </div>
      <div className="mp-main">
        <span className="mp-name">{m.held ? 'Paused for the show…' : TRACKS[m.idx].name}{m.playing && <i className="mp-eq" aria-hidden="true"><b /><b /><b /></i>}</span>
        {!compact && (
          <div className="mp-seekrow">
            <span className="mp-time">{fmt(m.cur)}</span>
            <input className="mp-seek" type="range" min="0" max={m.dur || 0} step="0.1" value={m.cur} onChange={(e) => seek(parseFloat(e.target.value))} style={{ '--pct': `${pct}%` }} aria-label="Seek" />
            <span className="mp-time">{fmt(m.dur)}</span>
          </div>
        )}
      </div>
      <input className="mp-vol" type="range" min="0" max="1" step="0.05" value={m.vol} onChange={(e) => setVol(parseFloat(e.target.value))} style={{ '--pct': `${m.vol * 100}%` }} title="Music volume" aria-label="Music volume" />
    </div>
  );
}
