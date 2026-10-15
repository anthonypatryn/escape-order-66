// The game's pieces as the owner's art: character cards (square), Ahsoka, encounter cards (portrait), faction banners (hex).
import { CHAR, ENC, FACTION, AHSOKA, charArt, encArt, tokenArt } from '../data/cards';

export function CharCard({ id, className = '', ...rest }) {
  const c = id === AHSOKA ? { name: 'Ahsoka Tano' } : CHAR[id];
  return (
    <div className={`ccard ${id === AHSOKA ? 'ahsoka' : `f-${c?.faction}`} ${className}`} {...rest}>
      <img src={charArt(id)} alt={c?.name ?? ''} draggable={false} />
    </div>
  );
}

export function EncCard({ id, className = '', back = false }) {
  return (
    <div className={`ecard ${className}`}>
      <img src={back ? '/art/enc-back.jpg' : encArt(id)} alt={back ? 'Encounter deck' : ENC[id]?.name} draggable={false} />
    </div>
  );
}

// a faction banner token (the hex), optionally faded when nobody holds it
export function Banner({ f, size = 44, off = false, className = '', title }) {
  return (
    <span className={`banner ${off ? 'off' : ''} ${className}`} style={{ width: size, height: size * 0.877 }} title={title ?? FACTION[f]?.name}>
      <img src={tokenArt(f)} alt={FACTION[f]?.name} draggable={false} />
    </span>
  );
}

// the owner's ESCAPE ORDER 66 logo (ART/…/Links/logo.ai → public/art/logo.svg via tools/art.py)
export function Logo({ size = 'md', className = '' }) {
  return <img className={`logo logo-${size} ${className}`} src="/art/logo.svg" alt="Escape Order 66" draggable={false} />;
}

// the two sides' emblems (owner, BUG-4): player 1 = the Rebel Alliance starbird, player 2 = the Sith emblem. Both are the
// public-domain SVGs on Wikimedia Commons ("Rebel Alliance logo.svg", "Sith Emblem (Star Wars).svg"); drawn in currentColor
export function Emblem({ pid, size = 56, className = '' }) {
  return pid === 0
    ? <svg className={`emblem ${className}`} width={size} height={size} viewBox="0 0 300 300" role="img" aria-label="Rebel Alliance"><path fill="currentColor" d="M7.42,145.986C9.185,99.193,32.899,56.035,76.25,27.516c0.128,0.048,1.251-0.361,0.738,0.61c-3.434,3.184-65.172,76.114-8.344,133.68c0,0,29.858,28.704,53.011,1.468c0,0,22.847-29.577-0.289-74.413c0,0-5.856-14.64-26.955-23.721l16.992-18.748c0,0,14.359,6.161,25.478,22.871c0,0,0.593-17.593-12.884-36.34l26.345-29.89l26.08,29.609c0,0-11.993,16.991-12.876,36.902c0,0,8.191-13.477,25.776-23.151l16.686,18.748c0,0-16.045,5.287-26.794,23.529c-9.242,16.902-16.357,53.05,0.416,75.223c0,0,18.772,26.618,51.792-1.571c0,0,60.712-54.399-6.226-133.048c0,0-3.658-3.233,0.449-1.476c29.586,21.54,65.012,49.946,68.67,120.837c-1.444,85.966-59.012,147.334-143.074,147.334C68.934,295.968,4.95,227.283,7.42,145.986" /></svg>
    : <svg className={`emblem ${className}`} width={size} height={size} viewBox="0 0 900 900" role="img" aria-label="Sith"><path fill="currentColor" fillRule="evenodd" d="M0,0l140.05,238.551L21.797,215.412l140.306,182.876c-6.092,34.162-6.095,69.198,0,103.359L21.797,684.524l118.253-23.14L0,900l238.551-140.049l-23.139,118.252l182.876-140.306c34.184,6.103,69.241,6.104,103.424,0l182.877,140.306l-23.14-118.252L900,900L759.951,661.385l118.252,23.14L737.897,501.647c6.094-34.163,6.1-69.196,0-103.359l140.306-182.876l-118.252,23.139L900,0L661.449,140.049l23.14-118.316L501.647,162.103c-17.071-3.045-34.356-4.601-51.647-4.603c-17.292-0.001-34.576,1.563-51.647,4.603L215.412,21.733l23.139,118.316L0,0z M450,200.454c63.887,0.005,127.772,24.35,176.484,73.062c97.424,97.424,97.412,255.557,0,352.969s-255.544,97.361-352.969-0.064c-97.425-97.424-97.412-255.557,0-352.969C322.222,224.746,386.114,200.451,450,200.454z M450,274.09c-45.034-0.001-90.056,17.124-124.39,51.457c-68.667,68.667-68.676,180.167,0,248.842c68.677,68.676,180.11,68.668,248.778,0c68.668-68.666,68.676-180.166,0-248.842C540.051,291.208,495.035,274.093,450,274.09z" /></svg>;
}
