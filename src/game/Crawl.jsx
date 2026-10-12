import { useEffect, useRef, useState } from 'react';
import { loadMusic, playMusic } from './sound';
import { hold as holdMusic } from './music';

// The start of every game, timed to the owner's recording (public/sfx/crawl.mp3) the way the films do it:
// a blue line of text in silence → the opening hit + the logo, which recedes into the stars → the story crawls away →
// the music softens and the camera tilts down past the stars (three parallax layers) onto the Galaxy (GameView .panning).
// Everything is timed from the moment the music starts, in seconds of the timeline below (music file time − OFFSET).
// Space / Enter / Esc / a tap skips straight to a short version of the tilt. Settings → Opening crawl turns it off.
const OFFSET = 22.5;          // where in crawl.mp3 we start (the silence before the hit)
const INTRO = [0.4, 5.0];     // the blue line: fades in / starts fading out
const HIT = 6.46;             // the opening hit (28.96 s in the file): the logo appears
const LOGO_S = 9;             // the logo recedes for this long
const CRAWL_AT = 9.0;         // the story starts rising
const CRAWL_S = 78.5;         // ...and has gone by 87.5
const PAN_AT = 89.3;          // the music softens (111.8 s in the file): tilt down
const PAN_MS = 7200;
const END = PAN_AT + PAN_MS / 1000; // music fades out, the game begins
const SKIP_PAN_MS = 3000;

export default function Crawl({ players, onPan, onDone }) {
  const [step, setStep] = useState('load'); // load → intro → black → title → pan
  const [panMs, setPanMs] = useState(PAN_MS);
  const music = useRef(null);
  const timers = useRef([]);
  const phase = useRef('load');
  const go = (s) => { phase.current = s; setStep(s); };
  const at = (sec, fn) => timers.current.push(setTimeout(fn, sec * 1000));
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const tilt = (ms) => {
    if (phase.current === 'pan') return;
    clear();
    setPanMs(ms);
    go('pan');
    onPan?.(ms);
    at(ms / 1000, () => onDone());
  };
  const skip = () => {
    if (phase.current === 'pan') return;
    music.current?.stop(0.9);
    tilt(SKIP_PAN_MS);
  };

  useEffect(() => {
    let live = true;
    holdMusic(true); // the player steps aside (GameView lets it back in after Order 66)
    // start once the music is decoded (or after 3 s without it: the show runs silent)
    const begin = (buf) => {
      if (!live || phase.current !== 'load') return;
      music.current = playMusic(buf, { offset: OFFSET, dur: END + 0.3, fadeOut: 2.6 });
      go('intro');
      at(INTRO[1] + 1.2, () => go('black'));
      at(HIT, () => go('title'));
      at(PAN_AT, () => tilt(PAN_MS));
    };
    loadMusic('crawl').then(begin);
    const fallback = setTimeout(() => begin(null), 3000);
    const key = (e) => { if ([' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); skip(); } };
    window.addEventListener('keydown', key, true);
    return () => { live = false; clearTimeout(fallback); clear(); music.current?.stop(0.3); window.removeEventListener('keydown', key, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [a, b] = players.map((p) => p.name);
  return (
    <div className={`crawl step-${step}`} onClick={skip} style={{ '--pan': `${panMs}ms`, '--intro-out': `${INTRO[1]}s`, '--intro-in': `${INTRO[0]}s` }}>
      <div className="crawl-black" />
      <div className="crawl-stars" aria-hidden="true"><i className="far" /><i className="mid" /><i className="near" /></div>
      {step === 'intro' && <p className="crawl-intro">A short time after the Clone Wars,<br />in a galaxy far, far away….</p>}
      {step === 'title' && <img className="crawl-logo" src="/art/logo.svg" alt="Escape Order 66" style={{ '--logo': `${LOGO_S}s` }} />}
      {step === 'title' && (
        <div className="crawl-plane">
          <div className="crawl-text" style={{ '--crawl': `${CRAWL_S}s`, '--crawl-delay': `${CRAWL_AT - HIT}s` }}>
            <p className="crawl-ep">Episode LXVI</p>
            <h2>The Hunted Padawan</h2>
            <p>The war is over, and a darker order has been given. Across the galaxy the clones have turned their blasters on the Jedi who led them.</p>
            <p>AHSOKA TANO, once the apprentice of Anakin Skywalker, slips between the stars with the Empire close behind. To survive she needs help: friends, rivals, and even old enemies from every faction.</p>
            <p>Bounty hunters sell her trail to the highest bidder. Sith witches of Dathomir watch from the shadows. Somewhere, a squad of defective clones has refused to follow orders….</p>
            <p>Two strategists, {a} and {b}, race to guide her escape. Whoever wins the loyalty of the most factions will decide the fate of the last free Jedi….</p>
          </div>
        </div>
      )}
      {step === 'load' && <p className="crawl-load"><span className="dots" /></p>}
      {step !== 'pan' && <button className="crawl-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>Skip<kbd className="kh">Space</kbd></button>}
    </div>
  );
}
