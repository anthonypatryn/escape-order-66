// Online rooms, peer to peer (WebRTC via PeerJS's free public broker — no game server of ours). Copied from Long Shot.
// The HOST's browser runs the Game (engine.js is host-authoritative); the friend connects straight to it with the
// room code, gets the game state, and sends back answers to the questions the engine asks their seat.
//
// Messages, friend → host:  { t:'hello', name, clientId }  { t:'answer', reqId, value }  { t:'pong' }
//           host → friend:  { t:'lobby', code, seats, started, first, you }  { t:'state', state, you }  { t:'ended', reason }
//                           { t:'ping' }  { t:'part', … } (a big message in pieces)
// Spectators: someone joining when both seats are taken watches (you = -1) and gets a seat next game if one is free.
// Dropping out: the friend's browser keeps retrying by itself (phone locked, wifi → data, a refresh: same clientId =
// same seat). The host can let the computer play a quiet seat; the friend gets it back the moment they reconnect.
// A host who reloads mid-game resumes from Saved games: HostRoom takes the same code back and the friend rejoins.
// Both sides ping every few seconds (WebRTC can take ages to notice a closed tab); quiet for 10 s = gone.

import Peer from 'peerjs';
import { MAX_PLAYERS } from '../game/rules.js';

const PREFIX = 'escape66-';
const PING_MS = 3000, LOST_MS = 10000;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const MAX_SEATS = MAX_PLAYERS;
export const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const peerId = (code) => PREFIX + code.toLowerCase();

// a friend's browser keeps the same id across reloads, so a refresh rejoins the same seat
export function clientId() {
  try {
    let id = localStorage.getItem('eo-client-id');
    if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('eo-client-id', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2, 12); }
}

// Relay (TURN) servers for friends whose networks can't reach the host directly (phone data, strict routers):
// short-lived Cloudflare credentials from /api/turn. Fetched as soon as the game opens; without them PeerJS's defaults.
let ice = null; // { servers, at, ready }
export function loadIce() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (ice && Date.now() - ice.at < (ice.servers ? 12 * 3600e3 : 60e3)) return ice.ready;
  const cur = { servers: null, at: Date.now() };
  cur.ready = fetch('/api/turn').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.iceServers?.length) cur.servers = j.iceServers; }).catch(() => {});
  ice = cur;
  return cur.ready;
}
const peerOptions = () => {
  loadIce();
  return ice?.servers ? { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...ice.servers] } } : { debug: 0 };
};

const ERRORS = {
  'peer-unavailable': 'No game with that code. Check the code, and that the host still has the game open.',
  network: 'Lost the connection to the matchmaking server. Check your internet and try again.',
  'server-error': 'The matchmaking server didn’t answer. Try again in a moment.',
  'browser-incompatible': 'This browser can’t do online play. Try Chrome, Safari or Firefox.',
};
function blockedText() {
  const modern = /Chrome\/|Firefox\/|Version\/\d+.*Safari|Edg\/|CriOS\//.test(navigator.userAgent);
  if (!modern) return ERRORS['browser-incompatible'];
  return 'Something in this browser is blocking online play (WebRTC). It’s usually an extension: an ad blocker, a VPN or a privacy tool. '
    + 'Try a private / Incognito window, or turn that extension off for this site.';
}
const errText = (e) => (e?.type === 'browser-incompatible' ? blockedText() : ERRORS[e?.type] || e?.message || String(e));
// PeerJS's JSON channel silently refuses any message of 16,300 bytes or more: big ones go in parts (Long Shot bug)
const PART_CHARS = 5000;
let partNo = 0;
function sendMsg(conn, msg) {
  const str = JSON.stringify(msg);
  if (str.length <= PART_CHARS) { conn.send(msg); return; }
  const id = ++partNo, n = Math.ceil(str.length / PART_CHARS);
  for (let i = 0; i < n; i++) conn.send({ t: 'part', id, i, n, s: str.slice(i * PART_CHARS, (i + 1) * PART_CHARS) });
}

class Emitter {
  constructor() { this.subs = new Set(); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((fn) => fn(this)); }
}

// what one seat may see: everything on the table; the face-down encounter deck only as a count, and the
// details of a question only if it's theirs
export function sanitize(s, seat) {
  return {
    ...s,
    deck: Array(s.deck.length).fill(0),
    request: s.request && s.request.player !== seat ? { type: s.request.type, player: s.request.player, id: s.request.id } : s.request,
    log: s.log.slice(-80),
  };
}

// ---------------------------------------------------------------- host
export class HostRoom extends Emitter {
  constructor(hostName, resume = null) {
    super();
    this.status = 'connecting'; // connecting → open → (error)
    this.error = '';
    this.seats = resume ? resume.seats.map((s) => ({ ...s, connected: s.kind !== 'remote' })) : [{ name: hostName, kind: 'host', connected: true }];
    this.first = 'random';
    this.started = !!resume;
    this.game = null;
    this.conns = new Map(); // clientId → conn
    this.watchers = new Map(); // spectators: clientId → { name, conn }
    this.wantCode = resume?.code ?? null; // after a reload: keep trying for the same code so the friend finds us again
    this.codeTries = 0;
    loadIce().finally(() => this.open(this.wantCode ?? randomCode()));
    this.beat = setInterval(() => {
      const now = Date.now();
      for (const c of [...this.conns.values()]) {
        if (now - (c.lastSeen ?? now) > LOST_MS) { this.onClose(c); try { c.close(); } catch { /* gone */ } continue; }
        try { if (c.open) c.send({ t: 'ping' }); } catch { /* closed */ }
      }
    }, PING_MS);
  }

  open(code) {
    if (this.closed) return;
    this.code = code;
    this.peer?.destroy();
    const peer = new Peer(peerId(code), peerOptions());
    this.peer = peer;
    peer.on('open', () => { this.status = 'open'; this.emit(); });
    peer.on('connection', (conn) => this.attachConn(conn));
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') {
        // the old tab's code can take a few seconds to free up after a reload
        if (this.wantCode && this.codeTries++ < 8) { setTimeout(() => this.open(this.wantCode), 2500); return; }
        if (this.wantCode) { this.error = 'Couldn’t get the old room code back, so your friend needs the new code.'; this.wantCode = null; }
        return this.open(randomCode()); // code taken: pick another
      }
      if (e.type === 'peer-unavailable') return;
      this.error = errText(e); this.status = this.status === 'open' ? 'open' : 'error'; this.emit();
    });
  }

  attachConn(conn) {
    conn.on('data', (m) => this.onMessage(conn, m));
    conn.on('close', () => this.onClose(conn));
    conn.on('error', (e) => { if (e?.type !== 'message-too-big') this.onClose(conn); });
  }

  onMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    conn.lastSeen = Date.now();
    if (m.t === 'pong') return;
    if (m.t === 'hello') {
      const id = String(m.clientId || '').slice(0, 20), name = String(m.name || 'Friend').trim().slice(0, 14) || 'Friend';
      conn.clientId = id;
      let seat = this.seats.findIndex((s) => s.kind === 'remote' && s.clientId === id);
      // back from another browser (the link opened inside Messages, Safari vs the home-screen icon): a new id, but the
      // same name as a seat whose friend has gone quiet takes that seat back
      if (seat < 0 && this.started) {
        const quiet = (s) => !s.connected || Date.now() - (this.conns.get(s.clientId)?.lastSeen ?? 0) > PING_MS * 2;
        seat = this.seats.findIndex((s) => s.kind === 'remote' && s.name.toLowerCase() === name.toLowerCase() && quiet(s));
        if (seat >= 0) { this.conns.get(this.seats[seat].clientId)?.close?.(); this.conns.delete(this.seats[seat].clientId); this.seats[seat].clientId = id; }
      }
      if (seat < 0 && (this.started || this.seats.length >= MAX_SEATS)) { this.addWatcher(conn, id, name); return; }
      if (seat < 0) {
        this.seats.push({ name: this.uniqueName(name), kind: 'remote', clientId: id, connected: true });
        seat = this.seats.length - 1;
      } else {
        const s = this.seats[seat];
        Object.assign(s, { connected: true, ...(this.started || name === s.name ? {} : { name: this.uniqueName(name) }) });
        if (s.cpu) { s.cpu = false; this.game?.handBack(seat); } // the computer was playing for them: it's theirs again
      }
      this.conns.get(id)?.close?.();
      this.conns.set(id, conn);
      this.broadcastLobby();
      if (this.started && this.game) this.sendState(conn, seat);
      this.emit();
      return;
    }
    if (m.t === 'answer' && this.started && this.game) {
      const seat = this.seatOf(conn);
      if (seat >= 0 && this.game.state.request?.player === seat && !this.game.state.players[seat].ai) this.game.answer(m.value, m.reqId);
    }
    if (m.t === 'dismiss' && this.started && this.game) { if (this.seatOf(conn) >= 0) this.game.skipRead?.(); }
  }

  onClose(conn) {
    if (this.watchers.get(conn.clientId)?.conn === conn) { this.watchers.delete(conn.clientId); this.emit(); return; }
    const seat = this.seatOf(conn);
    if (seat < 0 || this.conns.get(conn.clientId) !== conn) return;
    this.conns.delete(conn.clientId);
    this.seats[seat].connected = false;
    if (!this.started) this.seats.splice(seat, 1); // left the lobby: free the seat
    this.broadcastLobby(); this.emit();
  }

  refuse(conn, reason) {
    const send = () => { conn.send({ t: 'ended', reason }); setTimeout(() => conn.close(), 300); };
    if (conn.open) send(); else conn.on('open', send);
  }

  uniqueName(name) {
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; ; k++) { const n = `${name.slice(0, 11)} ${k}`; if (!taken.has(n.toLowerCase())) return n; }
  }

  seatOf(conn) { return this.seats.findIndex((s) => s.kind === 'remote' && s.clientId === conn.clientId); }

  // lobby controls
  addComputer(name) { if (!this.started && this.seats.length < MAX_SEATS) { this.seats.push({ name: this.uniqueName(name), kind: 'ai', level: 'padawan', connected: true }); this.broadcastLobby(); this.emit(); } }
  removeSeat(i) {
    if (this.started || this.seats[i]?.kind === 'host') return;
    const s = this.seats[i];
    if (s.kind === 'remote') { const c = this.conns.get(s.clientId); this.conns.delete(s.clientId); if (c) this.refuse(c, 'The host removed you from the game.'); }
    this.seats.splice(i, 1); this.broadcastLobby(); this.emit();
  }
  renameHost(name) { const h = this.seats.find((x) => x.kind === 'host'); if (h) h.name = name; this.broadcastLobby(); this.emit(); }
  swapSeats() { if (!this.started && this.seats.length === 2) { this.seats.reverse(); if (this.first !== 'random') this.first = String(1 - Number(this.first)); this.broadcastLobby(); this.emit(); } }
  setFirst(v) { if (!this.started) { this.first = v; this.broadcastLobby(); this.emit(); } }
  renameSeat(i, name) { // a computer's name (people name themselves)
    const s = this.seats[i], n = String(name ?? '').trim().slice(0, 14);
    if (this.started || s?.kind !== 'ai' || !n || n === s.name) return;
    s.name = ''; s.name = this.uniqueName(n); this.broadcastLobby(); this.emit();
  }
  setLevel(i, level) { const s = this.seats[i]; if (!this.started && s?.kind === 'ai') { s.level = level; this.broadcastLobby(); this.emit(); } }
  setup() {
    return { players: this.seats.map((s) => ({ name: s.name, ai: s.kind === 'ai', level: s.level ?? 'padawan' })), seed: Date.now(), first: this.first === 'random' ? undefined : Number(this.first) };
  }

  // mid-game: remove the friend for good (the computer finishes the game for that seat)
  kick(seat) {
    const s = this.seats[seat];
    if (!s || s.kind !== 'remote') return;
    const c = this.conns.get(s.clientId);
    this.conns.delete(s.clientId);
    this.game?.takeOver(seat);
    Object.assign(s, { kind: 'ai', cpu: false });
    this.broadcastLobby(); this.emit();
    if (c) this.refuse(c, 'The host removed you from the game.');
  }
  // the friend dropped out: the computer plays their seat until they come back (their next hello hands it back)
  takeOver(seat) { this.game?.takeOver(seat); this.seats[seat].cpu = true; this.broadcastLobby(); this.emit(); }

  addWatcher(conn, id, name) {
    this.watchers.get(id)?.conn?.close?.();
    this.watchers.set(id, { name: this.uniqueName(name), conn });
    const send = () => { this.sendLobbyTo(conn, -1); if (this.game) this.sendState(conn, -1); };
    if (conn.open) send(); else conn.on('open', send);
    this.emit();
  }
  allConns() { return [...this.conns.values(), ...[...this.watchers.values()].map((w) => w.conn)]; }

  // what the host's tab saves so a reload can pick the game back up
  snapshot() { return { code: this.code, seats: this.seats.map(({ name, kind, clientId, level }) => ({ name, kind, clientId, level })) }; }

  // the Game the host's screen is running: forward every change to the friend (coalesced)
  attach(game) {
    this.game = game; this.started = true;
    const target = game.rewind ?? game; // a resumed game is still replaying: hook the screen's real listener
    const orig = target.onChange;
    let queued = false;
    target.onChange = (s) => {
      orig(s);
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; this.pushState(); }, 30);
    };
    this.broadcastLobby(); this.pushState(); this.emit();
  }
  pushState() {
    if (!this.game) return;
    this.seats.forEach((s, i) => { if (s.kind === 'remote') { const c = this.conns.get(s.clientId); if (c?.open) this.sendState(c, i); } });
    for (const w of this.watchers.values()) if (w.conn.open) this.sendState(w.conn, -1);
  }
  sendState(conn, seat) { try { sendMsg(conn, { t: 'state', state: sanitize(this.game.state, seat), you: seat }); } catch { /* closed */ } }

  // game over / host left the game: back to the lobby (the friend stays connected)
  backToLobby() {
    this.game = null; this.started = false;
    this.seats = this.seats.filter((s) => s.kind !== 'remote' || s.connected);
    this.seats.forEach((s) => { s.cpu = false; });
    for (const [id, w] of [...this.watchers]) {
      if (this.seats.length >= MAX_SEATS) break;
      this.seats.push({ name: w.name, kind: 'remote', clientId: id, connected: true });
      this.conns.set(id, w.conn); this.watchers.delete(id);
    }
    this.broadcastLobby(); this.emit();
  }

  lobbySeats() { return this.seats.map(({ name, kind, connected, level, cpu }) => ({ name, kind, connected, level, cpu: !!cpu })); }
  sendLobbyTo(c, you) { try { if (c?.open) sendMsg(c, { t: 'lobby', code: this.code, seats: this.lobbySeats(), first: this.first, watchers: this.watchers.size, started: this.started, you }); } catch { /* closed */ } }
  broadcastLobby() {
    this.seats.forEach((s, i) => { if (s.kind === 'remote') this.sendLobbyTo(this.conns.get(s.clientId), i); });
    for (const w of this.watchers.values()) this.sendLobbyTo(w.conn, -1);
  }

  close() {
    this.closed = true;
    clearInterval(this.beat);
    for (const c of this.allConns()) { try { c.send({ t: 'ended', reason: 'The host closed the game.' }); } catch { /* gone */ } }
    setTimeout(() => this.peer?.destroy(), 300);
  }
}

// ---------------------------------------------------------------- friend
export class JoinClient extends Emitter {
  constructor(code, name) {
    super();
    this.code = cleanCode(code);
    this.name = name;
    this.id = clientId();
    this.status = 'connecting'; // connecting → lobby | game → (reconnecting) … | ended | error
    this.error = '';
    this.lobby = null;
    this.state = null;
    this.you = null;
    this.retries = 0;
    loadIce().finally(() => { if (this.status !== 'ended') this.makePeer(); });
    // back on the tab (phone unlocked, app switched back): reconnect straight away
    this.onVisible = () => {
      if (document.visibilityState !== 'visible' || this.status === 'ended' || !this.peer) return;
      if (this.status === 'error' && !this.state) return;
      if (this.conn?.open && Date.now() - this.lastSeen < PING_MS * 2) return;
      this.retries = 0; this.status = 'reconnecting'; this.error = ''; this.emit();
      clearTimeout(this.retryT);
      if (this.peer.destroyed) return;
      if (this.peer.disconnected) this.peer.reconnect();
      else this.connect();
    };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  makePeer() {
    this.peer = new Peer(peerOptions());
    this.peer.on('open', () => this.connect());
    this.peer.on('disconnected', () => { if (!this.peer.destroyed) this.peer.reconnect(); });
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable' && this.status === 'reconnecting') return this.retry();
      // mid-game network hiccups (a phone locking, switching apps, wifi → cell): keep trying instead of giving up
      if (this.state && ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'peer-unavailable'].includes(e.type)) {
        this.status = 'reconnecting'; this.emit(); return this.retry();
      }
      this.fail(errText(e));
    });
  }

  connect() {
    const conn = this.peer.connect(peerId(this.code), { reliable: true, serialization: 'json' });
    this.conn = conn;
    this.attemptAt = Date.now();
    conn.on('open', () => { this.retries = 0; this.lastSeen = Date.now(); conn.send({ t: 'hello', name: this.name, clientId: this.id }); });
    clearInterval(this.beat);
    this.beat = setInterval(() => {
      // an attempt that never opens (the host's tab was mid-reload): give up on it and try again
      if (this.conn === conn && !conn.open && this.status === 'reconnecting' && Date.now() - this.attemptAt > 6000) {
        try { conn.close(); } catch { /* never opened */ }
        this.attemptAt = Date.now(); this.retry(); return;
      }
      if (this.conn !== conn || !conn.open || ['ended', 'error', 'reconnecting'].includes(this.status)) return;
      if (Date.now() - this.lastSeen > LOST_MS) { this.status = 'reconnecting'; this.emit(); try { conn.close(); } catch { /* gone */ } this.retry(); }
    }, PING_MS);
    conn.on('data', (m) => this.onMessage(m));
    conn.on('close', () => { if (this.conn === conn && !['ended', 'error'].includes(this.status)) { this.status = 'reconnecting'; this.emit(); this.retry(); } });
  }
  retry() {
    if (!document.hidden && this.retries++ > 40) return this.fail('Lost the connection to the host.'); // a sleeping phone doesn't use up tries
    if (this.peer.disconnected && !this.peer.destroyed) { try { this.peer.reconnect(); } catch { /* try again below */ } }
    clearTimeout(this.retryT);
    this.retryT = setTimeout(() => { if (!this.peer.destroyed) this.connect(); }, 2000);
  }

  onMessage(m) {
    if (!m || typeof m !== 'object') return;
    this.lastSeen = Date.now();
    if (m.t === 'part') {
      if (this.parts?.id !== m.id) this.parts = { id: m.id, got: [] };
      this.parts.got[m.i] = m.s;
      if (this.parts.got.filter((x) => x != null).length === m.n) { const whole = this.parts.got.join(''); this.parts = null; try { this.onMessage(JSON.parse(whole)); } catch { /* garbled: the next update fixes it */ } }
      return;
    }
    if (m.t === 'ping') { try { this.conn?.send({ t: 'pong' }); } catch { /* closed */ } return; }
    if (m.t === 'lobby') {
      this.lobby = m; this.you = m.you;
      if (!m.started) { this.state = null; this.status = 'lobby'; } else if (this.state) this.status = 'game';
    } else if (m.t === 'state') {
      this.state = m.state; this.you = m.you; this.status = 'game';
    } else if (m.t === 'ended') {
      this.status = 'ended'; this.error = m.reason || 'The game closed.';
      this.peer.destroy();
    }
    this.emit();
  }

  answer(value) {
    const reqId = this.state?.request?.id;
    try { this.conn?.send({ t: 'answer', reqId, value }); } catch { /* reconnecting */ }
    // don't let a second click send another answer while the host catches up
    if (this.state?.request) { this.state = { ...this.state, request: null }; this.emit(); }
  }
  // the friend put an encounter card away: the game carries on now (as on one screen)
  dismiss() { try { this.conn?.send({ t: 'dismiss' }); } catch { /* reconnecting */ } }
  get spectating() { return this.you === -1; }

  fail(msg) { this.status = 'error'; this.error = msg; this.emit(); }
  // the friend's "Try again" after the automatic retries ran out
  rejoin() {
    if (!this.peer || this.peer.destroyed) return;
    clearTimeout(this.retryT); this.retries = 0; this.status = 'reconnecting'; this.error = ''; this.emit();
    if (this.peer.disconnected) this.peer.reconnect(); else this.connect();
  }
  close() { clearTimeout(this.retryT); clearInterval(this.beat); document.removeEventListener('visibilitychange', this.onVisible); this.status = 'ended'; this.peer?.destroy(); }
}
