# Sounds

Every sound is synthesized in `src/game/sound.js` for now. To use a real recording instead, drop the mp3 in this folder and
list it in `FILES` at the top of `sound.js`:

```js
const FILES = {
  saber: [['saber-swing', 0, 1.2, 1, 0.2]],   // [file (no .mp3), start s, length s, volume, fade-out s]
};
```

Several clips for one sound = one picked at random. A sound with no file stays synthesized.

| Sound | When |
|---|---|
| `saber` | Ahsoka moves — owner's clips `saber-a/b/c.mp3` (random) |
| `take` | a card lands in a play area |
| `kill` | a character or companion is killed — owner's clips `kill-a/b/c.mp3` (random) |
| `banner` | a banner changes hands (`down` = back to the middle) |
| `encounter` | an encounter is played |
| `swap` | Satine switches two cards — owner's clip `swap.mp3` |
| `turn` | your move — owner's clip `turn.mp3` (R2-D2) |
| `crawl.mp3` | the opening crawl music (owner's file; Crawl.jsx times the logo / crawl / tilt-down to it) |
| `hyper` | not used any more (the crawl ends with a tilt down now) |
| `bighaul` | 3+ cards taken in one move — owner's clips `haul-a/b.mp3` (random) |
| `lose` | the winner is called: the loser's scream — owner's clip `lose.mp3` (then `win` 2.4 s later) |
| `enc-<id>` | an encounter's own voice line, on top of `encounter` (ids: hondo waxer rex saw fennec omega krell sidious huyang nightsisters droids satine trench bokatan) — have: `enc-droids.mp3` |
| `win` | the fanfare, 2.4 s after the winner is called |
| `click` | an arrow key with no move that way |
