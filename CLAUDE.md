# Escape Order 66 — digital version

Digital version of **Escape Order 66**, the owner's Star Wars reskin of *Game of Thrones: Hand of the King*: move Ahsoka
around a 6 × 6 Galaxy of character cards, collect factions, hold the most banners when she can't move.
Web app: Vite 7 + React 19, plain CSS, no 3D (top-down board). GitHub `anthonypatryn/escape-order-66` (branch `main`),
Vercel project `escape-order-66` (push `main` → deploy) → https://escape-order-66.vercel.app (**private: password gate**).

**Status (2026-10-12):** LIVE and playable. 2 seats, each a person (pass-and-play on one screen, no hand-off screen) or a
computer (Youngling / Padawan / Jedi Master) — or ONLINE: host a room → 5-letter code / invite link → a friend joins (Long Shot's
system, see `src/net/room.js`). iPhone home-screen icon (`tools/art.py` → `public/apple-touch-icon.png`, passes the password gate). Friends-only game: the owner
uses Star Wars art, music and sound clips (their own files). Open items + ideas: `docs/ROADMAP.md`.

## Working with the owner (same as Long Shot / Guillotine)
- Look and feel follow **Long Shot** (`../Long-shot`, read its CLAUDE.md): dark see-through glass panels, branded controls only
  (no confirm()/alert()/select/checkbox — use `ui.jsx`), big readable text, keyboard keys with little key labels, lots of motion.
- **Test the way the owner uses it** before saying it works: single clicks (not triple-click / scripted selects), real typing,
  phone widths (owner's iPhone is 440 px wide, Chrome on iOS). Owner called out sloppy testing on 2026-10-12 (the time boxes).
- Owner tests by playing; files bugs at `/?view=bugs`. When they paste BUG-n and the fix is pushed, mark it fixed
  (POST `/api/bugs` `{action:'fix', nos:[n], note}` with header `x-bug-pin` — but the site password gate blocks calls from here,
  so ask the owner to tick them in the bug list). BUG-1 (iPhone music volume) + BUG-2 (home screen too wide on iPhone) fixed,
  not yet marked fixed by the owner.
- Commit + push after each chunk of work. Before committing: `npx oxlint src`, `npx vite build`, `node tools/simulate.mjs 200` (must print `errors: 0`).
- After a push: `vercel ls escape-order-66` (the CLI is linked + logged in) until the new deployment is Ready — the live HTML is
  behind the password, so `curl` can't check the JS hash any more. A request can still hit the old deployment for ~1 min.
- Rewriting git history / force-pushing needs the owner's explicit OK.
- `ART/` = the owner's print files (PDFs, InDesign, Illustrator). Gitignored. `python tools/art.py` makes the web copies in `public/art/`
  (cards, encounters, faction hexes, the logo `logo.ai` → `public/art/logo.svg`).
- New sound files the owner sends: copy to `public/sfx/<slot>.mp3`, measure in the browser (decodeAudioData: duration, where the
  sound starts/ends, peak, RMS of the audible part), set `vol` so it lands near −14 dB RMS without the peak passing ~0.9 after ×0.8,
  add to `src/data/sounds.json`. The owner gives timestamps like "1:04-1:08" for long scene files → `start` 64, `len` 4.

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

## The opening (owner said the timing is PERFECT — don't change it without asking)
`Crawl.jsx` is timed to the owner's `public/sfx/crawl.mp3` (constants at the top, seconds after the music starts at OFFSET 22.5 s
of the file): blue "A short time after the Clone Wars…" line in silence → the hit at 28.96 s in the file = the owner's logo
slams in full screen and recedes → the crawl (owner-approved text: their rulebook intro + the game's lines, only the LAST
paragraph ends with "….") rises until the music softens at 111.8 s → **tilt down** (8.4 s, `.panning`): crawl sweeps up, three star
layers + a small moon, a cratered moon and a tan planet with a blue atmosphere (all CSS, original) rise at different speeds, the
Galaxy rises over the planet, cards deal in → **Execute Order 66**: owner's `order66.mp3` + the owner's Palpatine image as a blue
flickering hologram (`public/art/palpatine-holo.png`, head + shoulders, tint baked by a script) + red "EXECUTE ORDER 66" text that
appears ~2.6 s in (after the line is spoken) → first turn starts at ~6 s. Skip (Space / tap) = 3.4 s tilt + the Order 66 moment.
The music player pauses for all of it (`music.hold`).

## Code map
| Path | What |
|---|---|
| `src/data/cards.js` | FACTIONS (size = tiebreak, colours), 35 CHARACTERS (id, name, faction), 14 ENCOUNTERS (text, keep), art paths |
| `src/game/rules.js` | Pure helpers: `legalMoves`, `countFor`, `bannerHolder`, `standings`, `galaxyCount` |
| `src/game/engine.js` | `Game` class, Long Shot's shape: async turn loop, every decision through `ask(player, req)` (types `move`, `encounter`, `target` (verb take/kill/swap), `faction`); seeded RNG; `trail` of people's answers → `Game.rewound()` = undo + resume. Log lines carry data for animations (`move` has from/to/path/take/taken, `take`/`kill` have char + from, `banner` has faction/from/to, `encounter` has enc). `hold()` = real-time animation waits, `read()` = encounter shown big (READ_MS, `skipRead`), `pause()` = sped-up waiting |
| `src/game/ai.js` | LEVELS Youngling / Padawan / Jedi Master. Light snapshot + `value()` (locked banners count fully, contested by holder + lead, bigger factions weigh more); Padawan = 1 ply, Master = 3-ply alpha-beta; encounters / targets / Satine swap / Hondo faction scored by the same value. `node tools/simulate.mjs 450 levels` ≈ 7% / 56% / 88% |
| `src/game/GameView.jsx` | Game screen. Desktop: left = Banners rack (counts, galaxy left, 🔒 locked) + Encounters; centre = Galaxy + question docked under it; right = Players (banners, play area by faction, kept encounters) + log; top bar has the music player. Moments from new log ids: Ahsoka glide + saber trail, taken cards fly to the play area, kill = red burn + blaster burst, banner flies + callout, encounter = hologram card (Space dismisses). Crawl → `startPan` / `finishCrawl(panned)` → Order 66 overlay. Keys: arrows = direction (again = cycle), 1–9, Space, Ctrl Z, R, M, F, ?. Touch: first tap previews, second tap moves |
| `src/game/Galaxy.jsx` | The 6 × 6 board: targets glow in faction colour with a direction badge, hover/arrow preview lights the path and lifts the cards you'd take; target picks (take green / kill red / swap cyan); Satine FLIP swap; ghosts (cards leaving); Ahsoka piece (CSS left/top transition) with arrow nubs |
| `src/game/Crawl.jsx` | The opening (see above). `loadMusic`/`playMusic` from sound.js; visuals start when the music does |
| `src/game/EndScreen.jsx` | Banners land one by one per player → winner called + the loser's scream (`lose`, owner's clip, whoever won) + the loser's plaque shakes → fanfare (`win`) 2.4 s later; tiebreak note, stats, Rematch / New game / See the Galaxy |
| `src/game/Home.jsx` | Setup: 2 seats (name · person/computer · difficulty), who goes first, Saved games (Resume / Delete); music player top-right; links to bug list / lab / sound editor |
| `src/game/music.js`, `MusicPlayer.jsx` | **Music player** (Guillotine's): one playlist shared by home + game (TRACKS: the owner's Ahsoka theme `public/sfx/home.mp3`), starts on the first tap, prev / play / next, seek, volume. Volume = a Web Audio gain via `routeMedia` (iPhone ignores `<audio>.volume`, BUG-1). `hold()` pauses it for the crawl / Order 66. Never plays on `/?view=sounds` |
| `src/game/Lab.jsx` | **Debug lab `/?view=lab`** (Long Shot's `/?view=moments` idea): the real game screen on a game that only moves when pushed — play one turn, run normally, fire any encounter for the current player, kill/take/switch/flip-banner/near-end/end-screen/crawl, seed + seat controls, raw state. Plays the game's sounds |
| `src/game/BugReport.jsx`, `BugList.jsx`, `lib/bugs.js`, `api/bugs.js` | Copied from Long Shot. Store = the shared Upstash DB `wiw-forstall-kv` (`KV_REST_API_URL/TOKEN`), keys `escape-66:bugs*`; PIN = Vercel `BUG_PIN` (dev: `.data/bugs.json`, PIN 1234) |
| `src/data/sounds.json`, `src/data/soundSlots.js` | **Every sound slot** (soundSlots: id, what, synth fallback?) and the owner's clips per slot: `{ slot: [{ file, start, len, vol, fade }] }`, one picked at random. `file` = a name in `public/sfx/` or `blob:<pathname>` (uploaded) |
| `src/game/SoundEditor.jsx`, `lib/sounds.js`, `api/sounds.js` | **Sound editor `/?view=sounds`** (linked from Home): pick a slot; per clip: whole-file waveform + zoom strip (drag edges), Start/End boxes (`TimeInput`: one click selects all, type `1:43.69` or `103.69` + Enter, ▲▼ steppers 0.01 s with hold-to-repeat, ↑/↓ keys, Shift = 0.1 s, invalid → red outline, kept), volume + loudness meter (target −14 dB, Match level), fade, listen with playhead, set start/end at the playhead. **Save (live for everyone)** with BUG_PIN → `/api/sounds` (Upstash `escape-66:sounds` = overrides of sounds.json, loaded by every page on start via `loadSoundOverrides`). **Copy for Claude** → owner pastes JSON → bake it into sounds.json. **⬆ Upload a sound file** (below) |
| `api/upload.js`, `api/sfx.js` | **Uploads** to the owner's **private** Vercel Blob store `escape-order-66-sounds` (connected with OIDC: env `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`, no read-write token). Editor: `POST /api/upload?check=1 {pin}` first (shows the real reason on failure), then `uploadPresigned` (`@vercel/blob/client`, `access: 'private'`) with `handleUploadPresigned` + `issueSignedToken` on the server (whole-store token: names get a random suffix). GET `/api/upload` = uploaded files for the picker (☁). Playback: `/api/sfx?p=<pathname>` **streams** the file through the site (a redirect to the store's signed link couldn't be read by the browser). Upload names: spaces → dashes. Dev: uploads save into `public/sfx/` (`/api/upload-dev`) |
| `src/game/sound.js` | `play(slot)`: the slot's clips (sounds.json + editor overrides; `[]` = silent) or the synth kit fallback (take, encounter, banner, click, win). `playClip`, `decodeFile`, `preloadSounds` (face-up encounters' voice lines load 8 s into a game: some files are whole scenes, up to 6.6 MB). `playMusic` (the crawl), `routeMedia` (music player). Sound hooks = `useSounds` in useGame.js: move → saber + take per card + bighaul (3+), kill, swap, encounter + `enc-<id>` voice line, banner / steal / banner-down / lock, last-one, fizzle, extra-turn, ai-turn, game-over; GameView: deal, undo, order66; Extras: turn; EndScreen: lose, win |
| `middleware.js` | **Private site**: password gate on everything (Vercel env `SITE_PASSWORD`, owner set it 2026-10-12; no var = open). Login page, remembered a year (cookie `eo-pass`); friends' links `?key=PASSWORD` sign in and drop the key from the URL |
| `src/game/resume.js` | Saved games in localStorage (`eo-saves`), setup + trail + open request; a hosted game also saves `kind: 'host'` + the room (code, seats) → Resume takes the same code back |
| `src/net/room.js` | **Online** (copied from Long Shot, 2 seats): PeerJS public broker + WebRTC, the host's browser runs the Game. `HostRoom` (peer id `escape66-<code>`; seats host / remote / ai; `first`; `attach(game)` forwards `sanitize(state, seat)` (encounter deck → count, others' question details stripped, last 80 log lines); big messages in parts (`sendMsg`, PeerJS drops ≥16 KB); ping 3 s / 10 s quiet = away; `takeOver(seat)` = computer plays until they're back (their next hello → `game.handBack`), `kick` = for good; spectators when both seats are taken; a reloaded host retries 8× for its old code). `JoinClient` (clientId in localStorage = same seat after a refresh; auto-retries, reconnects when the tab comes back; `dismiss` puts an encounter card away for both). Engine: `takeOver`/`handBack` go in the trail and replay on resume |
| `src/game/Online.jsx` | HostShell → HostLobby (code, invite link (share sheet on phones), seats, "or a computer", who goes first, swap colours) → HostGame (useGame + `room.attach`, saved every change). ClientShell (connecting / lobby / game / error with Try again). GameView online props: `mySeat` (only that seat's questions are clickable), `online` (room badge, away + "Let the computer play" in the question area and Players panel, Remove), no undo online; a friend's crawl jumps to the short tilt when the host's game is already going (`Crawl skipNow`) |
| `api/turn.js` | Relay (TURN) credentials from Cloudflare for friends who can't connect directly (phone data, strict routers). The owner's Cloudflare key is on Long Shot's project (Sensitive: can't be copied), so this asks Long Shot's `/api/turn` for credentials; `CF_TURN_KEY_ID` + `CF_TURN_API_TOKEN` on this project would be used first. Neither works: direct connections only |
| `src/game/prefs.js`, `Settings.jsx` | Text size, calm motion, opening crawl, move hints, mixer (saber / fx / music). Player colours: Jedi blue `#3fb6ff` vs Sith red `#ff4655` (owner's pick) |
| `src/game/Phone.jsx`, `phone.css` | Long Shot's phone layout: ≤760 px → Galaxy fills, banner strip under it, question docked, nav Galaxy / Encounters / Players / Log + sheets, ⋯ menu (has the music player). Home card fits phone widths (BUG-2) |
| `src/game/game.css`, `fx.css`, `src/index.css` | Layout/panels/controls (+ sound editor) · all animations (crawl, tilt, planets, holograms) · tokens + type (Exo 2 titles/numbers, Barlow reading); the logo is the owner's SVG (`Logo` in Cards.jsx) |
| `tools/art.py`, `tools/simulate.mjs` | Art pipeline · headless AI games |

## Vercel setup (all done 2026-10-12)
Env vars on the project: `SITE_PASSWORD` (gate), `BUG_PIN` (bug list + sound editor + uploads; the owner's PIN is in Claude's
memory), Upstash `wiw-forstall-kv` connected (`KV_*`, `REDIS_URL`), Blob store `escape-order-66-sounds` (private) connected
(`BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`). This folder is `vercel link`ed (`.vercel/`, `.env.local` with a dev OIDC token;
both gitignored). Useful: `vercel env ls`, `vercel ls escape-order-66`, `vercel redeploy https://escape-order-66.vercel.app --target production`
(needed after env var changes), `vercel logs --since 30m --no-branch -j` (function errors; api/upload + api/sfx log failures).

## Dev
- `npm run dev` (preview config `escape-66`, port 5191 in `.claude/launch.json`). The dev server sometimes dies between turns:
  `preview_start` again. Editing `vite.config.js` restarts it. (Writing files with Python heredocs: watch for `\0` turning into a
  real NUL byte and `'` breaking bash — use a script file in the scratchpad.)
- Online testing: two tabs in the browser pane (host + `/?join=CODE`); the dev server has no `/api/turn` (direct only). Hot reloads
  leave the old HostRoom alive holding the code, so after editing code do a full reload of the host tab before testing rejoin.
  A friend's tab remembers the room (`eo-joined`, 12 h): reopening `/?join=CODE` goes straight back in.
- Pages: `/` game · `/?view=lab` debug lab · `/?view=bugs` bug list · `/?view=cards` card + banner review · `/?view=sounds` sound editor.
