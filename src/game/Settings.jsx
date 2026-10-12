import { useEffect } from 'react';
import { useSettings, setSettings } from './prefs';
import { Chips, Toggle } from './ui';
import { play, setMusicLevel, startMusic, stopMusic } from './sound';

const LEVELS = [[0, 'Off'], [0.35, 'Low'], [0.7, 'Medium'], [1, 'High']];
const CHANNELS = [
  ['saber', 'Lightsaber', 'Ahsoka’s moves and Satine’s switches', 'saber'],
  ['fx', 'Effects', 'Cards, blasters, banners, encounters, your-turn chirp', 'kill'],
  ['music', 'Music', 'The space hum on the home screen, the opening jump and the winner’s fanfare', null],
];

// Settings drawer (remembered on this device)
export default function SettingsDrawer({ onClose }) {
  const s = useSettings();
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer settings" onClick={(e) => e.stopPropagation()} aria-label="Settings">
        <div className="drawer-head"><h2>Settings</h2><button onClick={onClose}>Close</button></div>
        <div className="drawer-body">
          <section>
            <h3>Text size</h3>
            <Chips value={s.text} onChange={(v) => setSettings({ text: v })} options={[['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']]} />
          </section>
          <section>
            <Toggle checked={s.calm} onChange={(v) => setSettings({ calm: v })}>Calm motion</Toggle>
            <p className="note">Fewer animations: no flying cards, saber trails or hyperspace jump; the opening crawl is skipped.</p>
          </section>
          <section>
            <Toggle checked={s.crawl} onChange={(v) => setSettings({ crawl: v })}>Opening crawl</Toggle>
            <p className="note">The scrolling story at the start of every game (Space skips it).</p>
          </section>
          <section>
            <Toggle checked={s.hints} onChange={(v) => setSettings({ hints: v })}>Move hints</Toggle>
            <p className="note">When you point at a move, show which banners it would win or lose.</p>
          </section>
          <section>
            <h3>Sound</h3>
            {CHANNELS.map(([k, label, hint, sample]) => (
              <div key={k} className="mix-row">
                <div><b>{label}</b><small>{hint}</small></div>
                <Chips small value={s.mix[k]} onChange={(v) => {
                  setSettings({ mix: { [k]: v } });
                  if (k === 'music') { if (v > 0) { startMusic(); setTimeout(() => stopMusic(), 2500); } setMusicLevel(v); return; }
                  if (v > 0) setTimeout(() => play(sample), 30);
                }} options={LEVELS} />
              </div>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}
