import { useLayoutEffect, useRef } from 'react';
import { CharCard } from './Cards';
import { CHAR, FACTION, AHSOKA, GRID } from '../data/cards';
import { DIR, rc } from './rules';

// The Galaxy, top down: a 6 × 6 grid of character cards with Ahsoka on top.
//  moves      = the open move question's options (people only), or null
//  preview    = index of the move being pointed at (hover / arrow keys): its path lights up, the cards it takes lift
//  targets    = Map(cell → { k, verb }) for an encounter's target question (take / kill / swap)
//  glide      = { from, to, ms, id } while Ahsoka is gliding (the saber trail follows her)
//  ghosts     = cards that just left the grid but are still drawn there (until Ahsoka passes them / they finish dying)
export default function Galaxy({ state, moves, preview, onPreview, onPick, targets, onTarget, glide, ghosts = [], dealing, hoverChar, onHoverChar }) {
  const ref = useRef(null);
  const prev = useRef(state.grid);
  // Satine's switch: the two cards slide past each other (FLIP)
  useLayoutEffect(() => {
    const before = prev.current, now = state.grid;
    prev.current = now;
    const el = ref.current;
    if (!el || before === now || el.closest('.calm')) return;
    const moved = [];
    now.forEach((id, i) => { if (id && id !== AHSOKA && before[i] !== id) { const j = before.indexOf(id); if (j >= 0 && j !== i) moved.push([i, j]); } });
    if (moved.length !== 2) return;
    for (const [i, j] of moved) {
      const node = el.querySelector(`[data-cell="${i}"] .ccard`), from = el.querySelector(`[data-cell="${j}"]`), to = el.querySelector(`[data-cell="${i}"]`);
      if (!node || !from || !to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      node.animate([
        { transform: `translate(${dx}px, ${dy}px)`, zIndex: 5 },
        { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.25) rotate(${i < j ? 8 : -8}deg)`, zIndex: 5, filter: 'drop-shadow(0 0 14px #7fd7ff)', offset: 0.5 },
        { transform: 'none', zIndex: 5 },
      ], { duration: 900, easing: 'cubic-bezier(.5,0,.3,1)' });
    }
  }, [state.grid]);

  const pm = preview != null && moves ? moves[preview] : null;
  const onPath = new Set(pm?.path ?? []), willTake = new Set(pm?.take ?? []);
  const byTo = new Map((moves ?? []).map((m, k) => [m.to, k]));
  const ghostAt = new Map(ghosts.map((g) => [g.cell, g]));
  const [ar, ac] = rc(state.ahsoka);
  let trail = null;
  if (glide) {
    const [fr, fc] = rc(glide.from), [tr, tc] = rc(glide.to);
    trail = { r: Math.min(fr, tr), c: Math.min(fc, tc), len: Math.abs(tr - fr) + Math.abs(tc - fc), vert: fc === tc, rev: tr < fr || tc < fc };
  }
  return (
    <div ref={ref} className={`galaxy ${moves ? 'choosing' : ''} ${pm ? 'previewing' : ''} ${targets ? 'targeting' : ''} ${dealing ? 'dealing' : ''}`}
      onMouseLeave={() => onPreview?.(null)}>
      {state.grid.map((id, i) => {
        const g = ghostAt.get(i);
        const k = byTo.get(i), t = targets?.get(i);
        const show = id && id !== AHSOKA ? id : g?.id;
        const f = CHAR[show]?.faction;
        const cls = [
          'cell', !show && 'empty', k != null && 'target', onPath.has(i) && 'on-path', willTake.has(i) && 'will-take', pm?.to === i && 'dest',
          t && `tgt tgt-${t.verb}`, g && `ghost ghost-${g.kind}`, hoverChar && show === hoverChar && 'hl',
        ].filter(Boolean).join(' ');
        const click = k != null ? () => onPick(k) : t ? () => onTarget(t.k) : null;
        return (
          <div key={i} data-cell={i} className={cls} style={{ '--fc': f ? FACTION[f].c2 : null, '--deal': `${(i % GRID + Math.floor(i / GRID)) * 45}ms`, ...(g?.delay != null ? { '--gd': `${g.delay}ms` } : null) }}
            onMouseEnter={() => { if (k != null) onPreview?.(k); if (show) onHoverChar?.(show); }} onMouseLeave={() => onHoverChar?.(null)}
            onClick={click ?? undefined} role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined}
            aria-label={click ? `${k != null ? `Move ${moves[k].dir} to` : t.verb} ${CHAR[show]?.name}` : undefined}>
            {show ? <CharCard id={show} /> : <i className="slot" />}
            {k != null && <b className="dir-badge">{DIR[moves[k].dir].arrow}{moves[k].take.length > 1 && <small>×{moves[k].take.length}</small>}</b>}
            {t && <b className={`tgt-badge ${t.verb}`}>{t.verb === 'kill' ? '✖' : t.verb === 'swap' ? '⇄' : '✚'}</b>}
          </div>
        );
      })}
      {trail && trail.len > 0 && (
        <i key={glide.id} className={`saber-trail ${trail.vert ? 'v' : 'h'} ${trail.rev ? 'rev' : ''}`}
          style={{ '--r': trail.r, '--c': trail.c, '--len': trail.len, '--ms': `${glide.ms}ms` }} aria-hidden="true" />
      )}
      {state.ahsoka >= 0 && (
        <div className={`ahsoka-piece ${glide ? 'gliding' : ''} ${moves ? 'my-turn' : ''}`} style={{ '--r': ar, '--c': ac, '--ms': `${glide?.ms ?? 0}ms` }} aria-label="Ahsoka">
          <CharCard id={AHSOKA} />
          {moves && ['up', 'right', 'down', 'left'].map((d) => {
            const has = moves.some((m) => m.dir === d);
            return <i key={d} className={`ah-arrow ${d} ${has ? 'live' : ''} ${pm?.dir === d ? 'on' : ''}`} aria-hidden="true" />;
          })}
        </div>
      )}
    </div>
  );
}
