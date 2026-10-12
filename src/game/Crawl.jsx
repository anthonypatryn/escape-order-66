import { useEffect, useRef, useState } from 'react';
import { play } from './sound';

// The start of every game: a blue line of text, the logo flies away, the story crawls up into the stars, then the jump
// to hyperspace drops you at the Galaxy. Space / Enter / Esc / a tap skips straight to the jump. Settings → Opening crawl.
const T_INTRO = 2600, T_LOGO = 3600, T_CRAWL = 17000;

export default function Crawl({ players, onDone }) {
  const [step, setStep] = useState('intro'); // intro → logo → crawl → jump
  const done = useRef(false);
  const jump = () => {
    if (done.current) return;
    done.current = true;
    setStep('jump');
    play('hyper');
    setTimeout(onDone, 1250);
  };
  useEffect(() => {
    const t1 = setTimeout(() => setStep('logo'), T_INTRO);
    const t2 = setTimeout(() => setStep('crawl'), T_INTRO + T_LOGO - 900);
    const t3 = setTimeout(jump, T_INTRO + T_LOGO + T_CRAWL);
    const key = (e) => { if ([' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); jump(); } };
    window.addEventListener('keydown', key, true);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); window.removeEventListener('keydown', key, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [a, b] = players.map((p) => p.name);
  return (
    <div className={`crawl step-${step}`} onClick={jump}>
      <div className="crawl-stars" />
      {step === 'intro' && <p className="crawl-intro">A short time after the Clone Wars,<br />in a galaxy far, far away….</p>}
      {(step === 'logo' || step === 'crawl') && <div className="crawl-logo"><span>Escape</span><b>Order 66</b></div>}
      {step === 'crawl' && (
        <div className="crawl-plane">
          <div className="crawl-text" style={{ '--crawl': `${T_CRAWL}ms` }}>
            <p className="crawl-ep">Episode LXVI</p>
            <h2>The Hunted Padawan</h2>
            <p>The war is over, and a darker order has been given. Across the galaxy the clones have turned their blasters on the Jedi who led them.</p>
            <p>AHSOKA TANO, once the apprentice of Anakin Skywalker, slips between the stars with the Empire close behind. To survive she needs help: friends, rivals, and even old enemies from every faction.</p>
            <p>Two strategists, {a} and {b}, race to guide her escape. Whoever wins the loyalty of the most factions will decide the fate of the last free Jedi….</p>
          </div>
        </div>
      )}
      {step === 'jump' && <div className="hyperspace"><i /><i /><i /><i /></div>}
      {step !== 'jump' && <button className="crawl-skip" onClick={(e) => { e.stopPropagation(); jump(); }}>Skip<kbd className="kh">Space</kbd></button>}
    </div>
  );
}
