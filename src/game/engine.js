// Escape Order 66 game engine (same shape as Long Shot's).
//
// The engine owns the whole game state and runs the turns as async code. Whenever it needs a decision it calls
// `ask(player, request)`: computer players answer through ai.js, people through the screen (`game.answer(value)`).
// The screen only renders `game.state` and the open `request`. Seeded RNG + every person's answer recorded in
// `trail` = the game can be replayed exactly (undo, resume after a reload).
import { CHARACTERS, CHAR, ENC, ENCOUNTERS, FACTION, FACTIONS, GRID, AHSOKA, FACE_UP_ENCOUNTERS } from '../data/cards.js';
import { legalMoves, galaxyCount, bannerHolder, standings, factionOf, countFor } from './rules.js';
import { aiDecide } from './ai.js';

class GameOver extends Error {}

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const READ_MS = 3500; // an encounter played stays up this long (real time at any speed; dismissable)
export const MOVE_MS = (cells) => 380 + cells * 150; // Ahsoka's glide across the Galaxy (GameView animates the same)
const cname = (id) => CHAR[id]?.name ?? id;
const fname = (f) => FACTION[f]?.name ?? f;

export class Game {
  // setup = { players: [{ name, ai, level }], seed, deal? } — deal (debug lab only) = { grid, row, deck } to start from
  constructor(setup, { onChange, speed = 1 } = {}) {
    const { players, seed = Date.now(), deal } = setup;
    this.setup = setup;
    this.random = mulberry32(seed);
    this.onChange = onChange ?? (() => {});
    this.speeds = { human: speed, ai: speed };
    this.trail = [];
    this.pending = null;
    this.stopped = false;
    this.logNo = 0;
    this.reqNo = 0;
    const grid = deal?.grid ?? this.shuffle([...CHARACTERS.map((c) => c.id), AHSOKA]);
    const encs = this.shuffle(ENCOUNTERS.map((e) => e.id));
    this.s = {
      players: players.map((p, i) => ({ id: i, name: p.name, ai: !!p.ai, level: p.level ?? 'padawan', cards: [], kept: [] })),
      grid,                                   // 36 cells: character id, 'ahsoka', or null (empty space)
      ahsoka: grid.indexOf(AHSOKA),
      row: deal?.row ?? encs.slice(0, FACE_UP_ENCOUNTERS),   // the available encounters, face up
      deck: deal?.deck ?? encs.slice(FACE_UP_ENCOUNTERS),     // the rest (only Huyang draws from it)
      discard: [],                            // encounters used up (and companions Saw killed)
      killed: [],                             // characters removed from the game
      banner: Object.fromEntries(FACTIONS.map((f) => [f.id, null])), // faction → player id holding its banner
      turn: 0, first: 0, round: 1, turnNo: 0,
      phase: 'setup',
      extra: false,                           // Bo-Katan: another turn after this one
      request: null,
      log: [],
      results: null,
      stats: { taken: players.map(() => 0), killed: players.map(() => 0), encounters: players.map(() => 0), longest: players.map(() => 0) },
    };
  }

  // ---------- plumbing (as in Long Shot) ----------
  get speed() {
    if (this.rewind) return 1e6;
    return this.s?.players[this.s.turn]?.ai ? this.speeds.ai : this.speeds.human;
  }
  setSpeeds(sp) { if (this.rewind) this.rewind.speeds = { ...this.rewind.speeds, ...sp }; else this.speeds = { ...this.speeds, ...sp }; }
  get state() { return this.s; }
  emit() { this.onChange({ ...this.s }); }
  log(text, kind = 'info', extra = {}) { this.s.log = [...this.s.log.slice(-199), { ...extra, text, kind, id: ++this.logNo }]; this.emit(); }
  rand(n) { return Math.floor(this.random() * n); }
  shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = this.rand(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  // animations play in real time (not sped up), so the screen can keep up; skipped flat out during a replay
  hold(ms) { return this.stopped || this.speed >= 1000 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)); }
  // a reading moment (an encounter shown big): real time at any speed; skipRead() ends it early
  read(ms) {
    if (this.stopped || this.speed >= 1000) return Promise.resolve();
    return new Promise((resolve) => {
      const end = () => { clearTimeout(t); if (this.skipRead === end) this.skipRead = null; resolve(); };
      const t = setTimeout(end, ms);
      this.skipRead = end;
    });
  }
  pause(ms) { return this.stopped || this.speed >= 1000 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / this.speed)); }
  player(id) { return this.s.players[id]; }
  current() { return this.s.players[this.s.turn]; }

  ask(player, req) {
    if (this.stopped) return new Promise(() => {});
    const id = ++this.reqNo, at = this.logNo;
    if (this.rewind && id >= this.rewind.stopAt) this.endRewind();
    this.s.request = { ...req, player: player.id, id };
    this.emit();
    return new Promise((resolve) => {
      this.pending = (v) => {
        this.pending = null; this.s.request = null;
        if (!player.ai) this.trail.push({ req: id, log: at, player: player.id, type: req.type, value: v });
        this.emit(); resolve(v);
      };
      if (this.rewind && !player.ai) {
        const rec = this.rewind.trail.find((t) => t.req === id);
        if (rec) { queueMicrotask(() => this.pending?.(rec.value)); return; }
        this.endRewind();
        this.emit();
      }
      if (player.ai) {
        const go = () => this.pending?.(aiDecide(this, player, this.s.request ?? req));
        if (this.speed >= 1000) queueMicrotask(go); else setTimeout(go, (req.type === 'move' ? 900 : 700) / this.speed);
      }
    });
  }
  answer(value, reqId) { if (reqId == null || reqId === this.s.request?.id) this.pending?.(value); }
  stop() { this.stopped = true; }

  static rewound(setup, trail, stopAt, { onChange, speeds = { human: 1, ai: 1 } } = {}) {
    const g = new Game(setup, { onChange: () => {} });
    g.rewind = { trail, stopAt, onChange, speeds };
    g.started = true;
    g.run();
    return g;
  }
  endRewind() {
    const r = this.rewind;
    if (!r) return;
    this.rewind = null;
    this.speeds = r.speeds;
    this.onChange = r.onChange;
  }

  // ---------- where things are ----------
  // a character: { where: 'galaxy', idx } | { where: 'play', pid } | null (killed)
  locate(id) {
    const idx = this.s.grid.indexOf(id);
    if (idx >= 0) return { where: 'galaxy', idx };
    const p = this.s.players.find((x) => x.cards.includes(id));
    return p ? { where: 'play', pid: p.id } : null;
  }
  // targets for "take X from the Galaxy or any Play Area": not in your own play area already
  takeable(p, ids) { return ids.map((id) => ({ id, at: this.locate(id) })).filter((t) => t.at && !(t.at.where === 'play' && t.at.pid === p.id)); }
  killable(ids) { return ids.map((id) => ({ id, at: this.locate(id) })).filter((t) => t.at); }
  galaxyChars() { return this.s.grid.map((id, idx) => ({ id, idx })).filter((c) => c.id && c.id !== AHSOKA).map((c) => ({ id: c.id, at: { where: 'galaxy', idx: c.idx } })); }
  playChars() { return this.s.players.flatMap((p) => p.cards.map((id) => ({ id, at: { where: 'play', pid: p.id } }))); }

  // ---------- changes ----------
  removeChar(id) {
    const at = this.locate(id);
    if (!at) return null;
    if (at.where === 'galaxy') { this.s.grid = this.s.grid.map((x, i) => (i === at.idx ? null : x)); }
    else { const q = this.player(at.pid); q.cards = q.cards.filter((x) => x !== id); }
    return at;
  }
  // an encounter takes a character: from the Galaxy (the last of its faction there earns another encounter) or a play area
  takeChar(p, id, ctx) {
    const at = this.removeChar(id);
    if (!at) return;
    p.cards = [...p.cards, id];
    this.s.stats.taken[p.id]++;
    ctx.touched.add(factionOf(id));
    const from = at.where === 'galaxy' ? 'the Galaxy' : `${this.player(at.pid).name}’s play area`;
    this.log(`${p.name} takes ${cname(id)} from ${from}.`, 'take', { pid: p.id, char: id, from: at });
    if (at.where === 'galaxy' && galaxyCount(this.s.grid, factionOf(id)) === 0) {
      this.log(`That was the last of the ${fname(factionOf(id))} in the Galaxy!`, 'info');
      ctx.more++;
    }
  }
  killChar(p, id, ctx) {
    const at = this.removeChar(id);
    if (!at) return;
    this.s.killed = [...this.s.killed, id];
    this.s.stats.killed[p.id]++;
    ctx.touched.add(factionOf(id));
    const from = at.where === 'galaxy' ? 'in the Galaxy' : `in ${this.player(at.pid).name}’s play area`;
    this.log(`${p.name} kills ${cname(id)} ${from}.`, 'kill', { pid: p.id, char: id, from: at });
  }

  // ---------- the game ----------
  async run() {
    try {
      this.s.phase = 'first';
      this.s.turn = this.s.first = this.setup.first ?? this.rand(this.s.players.length);
      this.log(`The Galaxy is set. ${this.current().name} moves Ahsoka first.`, 'turn');
      await this.pause(500);
      for (;;) {
        await this.playTurn();
        if (this.s.extra) { this.s.extra = false; this.log(`Bo-Katan: ${this.current().name} takes another turn!`, 'encounter', { pid: this.s.turn }); continue; }
        this.s.turn = (this.s.turn + 1) % this.s.players.length;
        if (this.s.turn === this.s.first) this.s.round++;
      }
    } catch (e) {
      if (!(e instanceof GameOver)) { console.error(e); this.log(`Engine error: ${e.message}`, 'error'); return; }
    }
    this.finish();
  }

  async playTurn() {
    const p = this.current();
    this.s.turnNo++;
    const moves = legalMoves(this.s.grid, this.s.ahsoka);
    if (!moves.length) { this.log('Ahsoka has nowhere left to go!', 'turn'); throw new GameOver(); }
    this.s.phase = 'move';
    this.log(`— ${p.name}’s turn —`, 'turn', { pid: p.id });
    const pick = await this.ask(p, { type: 'move', prompt: 'Move Ahsoka: pick a direction and a faction.', options: moves });
    const m = moves[pick] ?? moves[0];
    await this.doMove(p, m);
  }

  async doMove(p, m) {
    const from = this.s.ahsoka, taken = m.take.map((i) => this.s.grid[i]);
    this.s.grid = this.s.grid.map((id, i) => (i === from ? null : i === m.to ? AHSOKA : m.take.includes(i) ? null : id));
    this.s.ahsoka = m.to;
    p.cards = [...p.cards, ...taken];
    this.s.stats.taken[p.id] += taken.length;
    this.s.stats.longest[p.id] = Math.max(this.s.stats.longest[p.id], taken.length);
    this.s.phase = 'moving';
    this.log(`${p.name} moves Ahsoka ${m.dir} and takes ${taken.map(cname).join(', ')} (${fname(m.faction)}).`, 'move',
      { pid: p.id, from, to: m.to, path: m.path, take: m.take, taken, faction: m.faction, dir: m.dir });
    await this.hold(MOVE_MS(m.path.length) + 120 + taken.length * 140);
    const ctx = { touched: new Set([m.faction]), more: 0 };
    if (galaxyCount(this.s.grid, m.faction) === 0) {
      this.log(`${p.name} took the last of the ${fname(m.faction)}!`, 'info', { pid: p.id });
      ctx.more++;
    }
    while (ctx.more > 0) { ctx.more--; await this.gainEncounter(p, ctx); }
    await this.settleBanners(p, ctx.touched);
  }

  // choose one of the available encounters and resolve it
  async gainEncounter(p, ctx) {
    if (!this.s.row.length) { this.log('No encounters are left to choose.', 'info'); return; }
    this.s.phase = 'encounter';
    const pick = await this.ask(p, { type: 'encounter', prompt: 'You emptied a faction! Choose an encounter.', options: [...this.s.row], info: this.encInfo(p) });
    const id = this.s.row.includes(pick) ? pick : this.s.row[0];
    this.s.row = this.s.row.filter((x) => x !== id);
    await this.playEncounter(p, id, ctx);
  }

  // what each encounter would do right now (shown on the card; "why" = it would do nothing)
  encInfo(p) {
    const none = (list, what) => (list.length ? null : `${what} is not in the game any more.`);
    return {
      waxer: { why: none(this.takeable(p, ['fives']), 'Fives (or you already have him)') },
      rex: { why: none(this.takeable(p, ['wolffe', 'gregor']), 'Neither Wolffe nor Gregor') },
      fennec: { why: this.takeable(p, ['hunter']).length || this.killable(['tech']).length ? null : 'Hunter and Tech are both gone.' },
      krell: { why: none(this.takeable(p, ['ventress', 'dooku', 'gunray', 'grievous']), 'No Separatist or Ventress') },
      sidious: { why: none(this.takeable(p, ['anakin']), 'Anakin (or you already have him)') },
      droids: { why: none(this.killable(['ninety-nine']), '99') },
      satine: { why: this.galaxyChars().length >= 2 ? null : 'Fewer than two characters are left in the Galaxy.' },
      trench: { why: this.galaxyChars().length ? null : 'The Galaxy has no characters left.' },
      huyang: { why: this.s.deck.length ? null : 'The encounter deck is empty.' },
      omega: { note: p.cards.includes('hunter') ? 'You have Hunter: counts as 2 Bad Batch.' : 'Needs Hunter in your play area to count.' },
    };
  }

  async playEncounter(p, id, ctx) {
    const e = ENC[id];
    this.s.stats.encounters[p.id]++;
    this.log(`${p.name} meets ${e.name}: ${e.text}`, 'encounter', { pid: p.id, enc: id });
    this.s.phase = 'encounter';
    await this.read(READ_MS);
    const target = (prompt, list, verb) => (list.length ? this.ask(p, { type: 'target', prompt, verb, enc: id, options: list }) : Promise.resolve(-1));
    const takeOne = async (prompt, ids) => {
      const list = this.takeable(p, ids);
      if (!list.length) { this.log(`${e.name} finds nobody to bring back.`, 'info'); return; }
      const k = list.length === 1 ? 0 : await target(prompt, list, 'take');
      this.takeChar(p, (list[k] ?? list[0]).id, ctx);
    };
    const killOne = async (prompt, list) => {
      if (!list.length) return;
      const k = await target(prompt, list, 'kill');
      this.killChar(p, (list[k] ?? list[0]).id, ctx);
      await this.hold(650);
    };
    switch (id) {
      case 'hondo': {
        const f = await this.ask(p, { type: 'faction', prompt: 'Hondo: declare a faction. He counts as two of its characters.', enc: id, options: FACTIONS.map((x) => x.id) });
        const fac = FACTION[f] ? f : 'clone';
        p.kept = [...p.kept, { id, faction: fac }];
        ctx.touched.add(fac);
        this.log(`Hondo counts as two ${fname(fac)} for ${p.name}.`, 'encounter', { pid: p.id });
        return;
      }
      case 'omega': p.kept = [...p.kept, { id }]; ctx.touched.add('badbatch'); return;
      case 'nightsisters': p.kept = [...p.kept, { id }]; ctx.touched.add('dathomir'); return;
      case 'waxer': await takeOne('Take Fives.', ['fives']); break;
      case 'rex': await takeOne('Captain Rex: take Wolffe or Gregor.', ['wolffe', 'gregor']); break;
      case 'sidious': await takeOne('Take Anakin Skywalker.', ['anakin']); break;
      case 'krell': await takeOne('Pong Krell: take Asajj Ventress or any Separatist.', ['ventress', 'dooku', 'gunray', 'grievous']); break;
      case 'fennec': {
        await takeOne('Take Hunter.', ['hunter']);
        const tech = this.killable(['tech']);
        if (tech.length) { this.killChar(p, 'tech', ctx); await this.hold(650); }
        break;
      }
      case 'droids': {
        if (this.killable(['ninety-nine']).length) { this.killChar(p, 'ninety-nine', ctx); await this.hold(650); }
        else this.log('99 is already gone.', 'info');
        break;
      }
      case 'trench': await killOne('Admiral Trench: kill any character in the Galaxy.', this.galaxyChars()); break;
      case 'saw': {
        await killOne('Saw Gerrera: kill a character in the Galaxy.', this.galaxyChars());
        await killOne('Saw Gerrera: kill a character in a play area.', this.playChars());
        if (this.s.row.length) {
          const c = await this.ask(p, { type: 'encounter', prompt: 'Saw Gerrera: kill an available companion.', verb: 'kill', enc: id, options: [...this.s.row], info: {} });
          const gone = this.s.row.includes(c) ? c : this.s.row[0];
          this.s.row = this.s.row.filter((x) => x !== gone);
          this.s.discard = [...this.s.discard, gone];
          this.log(`${p.name} kills ${ENC[gone].name} (an available companion).`, 'kill', { pid: p.id, enc: gone });
          await this.hold(500);
        }
        break;
      }
      case 'satine': {
        const list = this.galaxyChars();
        if (list.length < 2) { this.log('Satine finds nothing to switch.', 'info'); break; }
        const a = list[await target('Duchess Satine: pick the first card to switch.', list, 'swap')] ?? list[0];
        const rest = list.filter((x) => x.id !== a.id);
        const b = rest[await this.ask(p, { type: 'target', prompt: `Switch ${cname(a.id)} with…`, verb: 'swap', enc: id, first: a.id, options: rest })] ?? rest[0];
        const ia = a.at.idx, ib = b.at.idx;
        this.s.grid = this.s.grid.map((x, i) => (i === ia ? b.id : i === ib ? a.id : x));
        this.log(`${p.name} switches ${cname(a.id)} and ${cname(b.id)}.`, 'swap', { pid: p.id, a: ia, b: ib });
        await this.hold(700);
        break;
      }
      case 'huyang': {
        const drawn = this.s.deck.slice(0, 2);
        this.s.deck = this.s.deck.slice(2);
        if (!drawn.length) { this.log('The encounter deck is empty.', 'info'); break; }
        this.log(`Huyang draws ${drawn.map((x) => ENC[x].name).join(' and ')}.`, 'info', { pid: p.id });
        const c = drawn.length === 1 ? drawn[0] : await this.ask(p, { type: 'encounter', prompt: 'Huyang: play one of these, discard the other.', from: 'huyang', options: drawn, info: this.encInfo(p) });
        const play = drawn.includes(c) ? c : drawn[0];
        this.s.discard = [...this.s.discard, 'huyang', ...drawn.filter((x) => x !== play)];
        await this.playEncounter(p, play, ctx);
        return;
      }
      case 'bokatan': this.s.extra = true; break;
      default: break;
    }
    this.s.discard = [...this.s.discard, id];
    this.emit();
  }

  // banners for every faction touched this turn (see rules.bannerHolder)
  async settleBanners(p, touched) {
    this.s.phase = 'banners';
    for (const f of FACTIONS.map((x) => x.id).filter((x) => touched.has(x))) {
      const was = this.s.banner[f];
      const now = bannerHolder(this.s.players, f, p.id, was);
      if (now === was) continue;
      this.s.banner = { ...this.s.banner, [f]: now };
      if (now == null) this.log(`The ${fname(f)} banner goes back to the middle.`, 'banner', { faction: f, from: was, to: null });
      else this.log(`${this.player(now).name} ${was == null ? 'claims' : 'takes'} the ${fname(f)} banner (${countFor(this.player(now), f)} card${countFor(this.player(now), f) === 1 ? '' : 's'}).`, 'banner', { pid: now, faction: f, from: was, to: now });
      await this.hold(900);
    }
  }

  finish() {
    this.s.phase = 'over';
    this.s.request = null;
    const rows = standings(this.s.players, this.s.banner);
    const tie = rows.length > 1 && rows[0].n === rows[1].n;
    this.s.results = { rows, winner: rows[0].pid, tiebreak: tie, stats: this.s.stats };
    this.log(`${this.player(rows[0].pid).name} escapes Order 66 with ${rows[0].n} banner${rows[0].n === 1 ? '' : 's'}${tie ? ' (tiebreak: the biggest faction)' : ''}!`, 'end', { pid: rows[0].pid });
  }
}

export { GRID };
