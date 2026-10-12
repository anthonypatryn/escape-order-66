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
