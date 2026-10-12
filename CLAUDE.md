# Escape Order 66 — digital version

Digital version of **Escape Order 66**, the owner's Star Wars reskin of *Game of Thrones: Hand of the King*: move Ahsoka
around a 6 × 6 Galaxy of character cards, collect factions, hold the most banners when she can't move.
Web app: Vite 7 + React 19, plain CSS, no 3D (top-down board). GitHub `anthonypatryn/escape-order-66` (branch `main`),
Vercel project linked (push `main` → deploy) → https://escape-order-66.vercel.app

**Status (2026-10-12):** first build. Solo + local only: 2 seats, each a person (pass-and-play on one screen, no hand-off
screen) or a computer (Youngling / Padawan / Jedi Master). No online play yet. Private, friends-only game: the owner is fine
with Star Wars art and (later) Star Wars sounds.

## Working with the owner (same as Long Shot / Guillotine)
- Look and feel follow **Long Shot** (`../Long-shot`, read its CLAUDE.md): dark see-through glass panels, branded controls only
  (no confirm()/alert()/select/checkbox — use `ui.jsx`), big readable text, keyboard keys with little key labels, lots of motion.
- Owner tests by playing; files bugs at `/?view=bugs`. When they paste BUG-n and the fix is pushed, mark it fixed
  (POST `/api/bugs` `{action:'fix', nos:[n], note}` with header `x-bug-pin`).
- Commit + push after each chunk of work. Before committing: `npx oxlint src`, `npx vite build`, `node tools/simulate.mjs 200` (must print `errors: 0`).
- After a push, Vercel needs ~1 min: check the live JS/CSS hash changed before saying it's live.
- Rewriting git history / force-pushing needs the owner's explicit OK.
- `ART/` = the owner's print files (PDFs, InDesign, Illustrator). Gitignored. `python tools/art.py` makes the web copies in `public/art/`.

## Rules as implemented (rulebook: `ART/Rulebook.pdf`)
- Setup: 35 characters + Ahsoka shuffled into the 6 × 6 Galaxy. Encounter deck = **14** cards (the JPG folder has Bo-Katan twice:
  `Companion Deck16.jpg` is a duplicate export and is NOT used; `Companion Deck.jpg` is the back). 6 dealt face up; the other 8 are
  only reachable by Huyang. First player: random, or picked on Home.
- Turn: pick a direction + a faction in that line → Ahsoka goes to the FARTHEST card of that faction, you take it + every card of that
  faction she passed (`rules.legalMoves`). Her old cell becomes empty.
- Took the last of a faction from the Galaxy (by moving OR by an encounter taking from the Galaxy) → choose an encounter, resolve it at
  once (chains). Killing the last one earns nothing.
- Banners (`rules.bannerHolder`): only factions touched this turn are checked; the active player takes it with ≥ the opponent's count
  (ties → active player, which also covers "the encounter user decides ties"); otherwise the leader; nobody → back to the middle.
- Counts include Hondo (+2 to his declared faction, declared when gained), Omega (+2 Bad Batch only while holding Hunter),
  Nightsisters (+1 Dathomir). These 3 stay in the play area and can't be taken / killed.
- "Take X from the Galaxy or any Play Area" never takes from your own area. Saw: galaxy kill → any play-area kill → kill an available
  companion (each skipped if impossible). Satine swaps two characters (not Ahsoka). Bo-Katan = another turn after this one.
- End: the moment Ahsoka has no legal move (checked at the start of a turn). Most banners; tie → the tied player whose best banner is
  the biggest faction.
- Not built: 3–4 players, team variant, The Ones (owner: just 2 players).

## Code map
| Path | What |
|---|---|
| `src/data/cards.js` | FACTIONS (size = tiebreak, colours), 35 CHARACTERS (id, name, faction), 14 ENCOUNTERS (text, keep), art paths |
| `src/game/rules.js` | Pure helpers: `legalMoves`, `countFor`, `bannerHolder`, `standings`, `galaxyCount` |
| `src/game/engine.js` | `Game` class, Long Shot's shape: async turn loop, every decision through `ask(player, req)` (types `move`, `encounter`, `target` (verb take/kill/swap), `faction`); seeded RNG; `trail` of people's answers → `Game.rewound()` = undo + resume. Log lines carry data for animations (`move` has from/to/path/take/taken, `take`/`kill` have char + from, `banner` has faction/from/to, `encounter` has enc). `hold()` = real-time animation waits, `read()` = encounter shown big (READ_MS, `skipRead`), `pause()` = sped-up waiting |
| `src/game/ai.js` | LEVELS Youngling / Padawan / Jedi Master. Light snapshot + `value()` (locked banners count fully, contested by holder + lead, bigger factions weigh more); Padawan = 1 ply, Master = 3-ply alpha-beta; encounters / targets / Satine swap / Hondo faction scored by the same value. `node tools/simulate.mjs 450 levels` ≈ 7% / 56% / 88% |
| `src/game/GameView.jsx` | Game screen. Desktop: left = Banners rack (counts, galaxy left, 🔒 locked) + Encounters; centre = Galaxy + question docked under it; right = Players (banners, play area by faction, kept encounters) + log. Moments from new log ids: Ahsoka glide + saber trail, taken cards fly to the play area, kill = red burn + blaster burst, banner flies + callout, encounter = hologram card (Space dismisses). Keys: arrows = direction (again = cycle), 1–9, Space, Ctrl Z, R, M, F, ?. Touch: first tap previews, second tap moves |
| `src/game/Galaxy.jsx` | The 6 × 6 board: targets glow in faction colour with a direction badge, hover/arrow preview lights the path and lifts the cards you'd take; target picks (take green / kill red / swap cyan); Satine FLIP swap; ghosts (cards leaving); Ahsoka piece (CSS left/top transition) with arrow nubs |
| `src/game/Crawl.jsx` | Opening crawl → hyperspace jump → deal. Skippable (Space/tap); Settings → Opening crawl |
| `src/game/EndScreen.jsx` | Banners land one by one per player, winner called + fanfare, tiebreak note, stats, Rematch / New game / See the Galaxy |
| `src/game/Home.jsx` | Setup: 2 seats (name · person/computer · difficulty), who goes first, Saved games (Resume / Delete), space-hum music |
| `src/game/Lab.jsx` | **Debug lab `/?view=lab`** (Long Shot's `/?view=moments` idea): the real game screen on a game that only moves when pushed — play one turn, run normally, fire any encounter for the current player, kill/take/switch/flip-banner/near-end/end-screen/crawl, seed + seat controls, raw state |
| `src/game/BugReport.jsx`, `BugList.jsx`, `lib/bugs.js`, `api/bugs.js` | Copied from Long Shot. Store = the shared Upstash DB (`KV_REST_API_URL/TOKEN`), keys `escape-66:bugs*`; PIN = Vercel `BUG_PIN` (dev: `.data/bugs.json`, PIN 1234) |
| `src/game/sound.js` | All sounds synthesized (saber swing, holo pings, blaster, brass stab, hologram shimmer, droid chirp, hyperspace, fanfare, space-hum music). Real files: add to `FILES` (see `public/sfx/README.md`) |
| `src/game/resume.js` | Saved games in localStorage (`eo-saves`), setup + trail + open request |
| `src/game/prefs.js`, `Settings.jsx` | Text size, calm motion, opening crawl, move hints, mixer (saber / fx / music). Player colours: Jedi blue `#3fb6ff` vs Sith red `#ff4655` |
| `src/game/Phone.jsx`, `phone.css` | Long Shot's phone layout: ≤760 px → Galaxy fills, banner strip under it, question docked, nav Galaxy / Encounters / Players / Log + sheets, ⋯ menu |
| `src/game/game.css`, `fx.css`, `src/index.css` | Layout/panels/controls · all animations · tokens + type (Exo 2 titles/numbers, Barlow reading, Russo One logo) |
| `tools/art.py`, `tools/simulate.mjs` | Art pipeline · headless AI games |

## Dev
- `npm run dev` (preview config `escape-66`, port 5191 in `.claude/launch.json`).
- Pages: `/` game · `/?view=lab` debug lab · `/?view=bugs` bug list · `/?view=cards` card + banner review.
