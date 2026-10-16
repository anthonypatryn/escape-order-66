# Escape Order 66 — roadmap

## Open items (as of 2026-10-12)
- **Uploads, end to end:** the owner uploaded "Undo Bad Feeling.mp3" (a ☁ clip on `undo`): uploads succeed; playback went
  through `/api/sfx` streaming after the last fix, but the owner hasn't confirmed it loads yet (their retry hit the old
  deployment). Unknown: whether a big file (several MB scene) streams through a Vercel function (4.5 MB response limit?).
  If big files fail: trim in the browser before upload, or serve via a public store. Check `vercel logs` for `sfx failed:`.
- **BUG-1 … BUG-5** fixed and marked fixed in the bug list (2026-10-16).
- **Satine** voice line (`enc-satine`): placeholder = first 4 s of a 23 s clip; owner to trim in the editor (or give a timestamp).
- **Still synthesized** (owner can replace via the editor): `take`, `encounter`, `banner`, `banner-down`, `click`, `win` (fanfare).
- **Silent, hooked up, waiting for clips:** `deal`, `last-one`, `steal`, `lock`, `fizzle`, `extra-turn`, `ai-turn`, `game-over`,
  and voice lines `enc-hondo`, `enc-waxer`, `enc-rex`, `enc-saw`. Search ideas per slot: `sfx-links.md` (local, gitignored —
  458 Myinstants "star wars" links; the owner downloads, Claude never downloads them).
- **Youngling** might be too weak (7% wins vs the other levels) — soften if the owner says so.
- Desktop at full width hasn't been eyeballed (the browser pane is 800 px); the owner plays on desktop + iPhone.

- **Online play** built 2026-10-12 (tested in two tabs: join, refresh rejoin, host reload → same code, drop → computer plays →
  hand back). Not yet tested on two real devices / phone data. Relay credentials come from Long Shot's `/api/turn`
  (its Cloudflare key is Sensitive in Vercel, can't be copied); if Long Shot goes away, add a TURN key to this project.

## Ideas / not built
- Online extras Long Shot has: chat, quick reactions, cloud save codes.
- 3–4 players, team variant, The Ones (owner: not wanted for now).
- Saved-game cloud codes (Long Shot has them).
- More tracks for the music player (`TRACKS` in `src/game/music.js`).
