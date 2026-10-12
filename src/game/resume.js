// Saved games (this device): every game in progress is saved after every change — setup + every person's answer +
// the open question — so it can be replayed exactly. One entry per seed, newest first, 8 kept. A finished game drops out.
const KEY = 'eo-saves', MAX = 8;

export function loadSaves() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* full or private */ } }

export function saveGame(game, state) {
  if (!game || !state || game.rewind) return;
  const id = game.setup.seed;
  if (state.results) { deleteSave(id); return; }
  const banners = state.players.map((p) => Object.values(state.banner).filter((h) => h === p.id).length);
  const entry = {
    id, at: Date.now(), setup: game.setup, trail: game.trail, speeds: game.speeds,
    stopAt: state.request?.id ?? game.reqNo + 1,
    sum: { turn: state.players[state.turn]?.name, turnNo: state.turnNo, banners },
  };
  store([entry, ...loadSaves().filter((s) => s.id !== id)]);
}
export function deleteSave(id) { store(loadSaves().filter((s) => s.id !== id)); }
export const resumePoint = (s) => ({ trail: s.trail, stopAt: s.stopAt, speeds: s.speeds });
