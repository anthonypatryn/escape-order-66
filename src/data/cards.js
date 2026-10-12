// Every card in the box: 7 factions, 35 characters, Ahsoka, and the 14-card Encounter deck.
// Art comes from the owner's print files (tools/art.py → public/art).

// size = how many characters the faction has (the number on its cards); also the end-of-game tiebreak (bigger wins).
// c1/c2 = the two colours of the faction's banner, used for glows, chips and fliers.
export const FACTIONS = [
  { id: 'clone', name: 'Clone Troopers', short: 'Clones', size: 8, c1: '#1c4458', c2: '#2d6cf0' },
  { id: 'jedi', name: 'Jedi Council', short: 'Jedi', size: 7, c1: '#3e5d74', c2: '#8d969c' },
  { id: 'empire', name: 'Empire', short: 'Empire', size: 6, c1: '#8a0f22', c2: '#3a3a3c' },
  { id: 'badbatch', name: 'Bad Batch', short: 'Bad Batch', size: 5, c1: '#3a3e42', c2: '#26292c' },
  { id: 'dathomir', name: 'Dathomir', short: 'Dathomir', size: 4, c1: '#e0670f', c2: '#c4102b' },
  { id: 'separatists', name: 'Separatists', short: 'Separatists', size: 3, c1: '#2b521b', c2: '#3c7a1c' },
  { id: 'bounty', name: 'Bounty Hunters', short: 'Bounty', size: 2, c1: '#5c1650', c2: '#2c1b62' },
];
export const FACTION = Object.fromEntries(FACTIONS.map((f) => [f.id, f]));
export const factionIds = FACTIONS.map((f) => f.id);

export const CHARACTERS = [
  ['cad-bane', 'Cad Bane', 'bounty'], ['aurra-sing', 'Aurra Sing', 'bounty'],
  ['dooku', 'Count Dooku', 'separatists'], ['gunray', 'Nute Gunray', 'separatists'], ['grievous', 'General Grievous', 'separatists'],
  ['ventress', 'Asajj Ventress', 'dathomir'], ['maul', 'Darth Maul', 'dathomir'], ['savage', 'Savage Opress', 'dathomir'], ['talzin', 'Mother Talzin', 'dathomir'],
  ['hunter', 'Hunter', 'badbatch'], ['wrecker', 'Wrecker', 'badbatch'], ['tech', 'Tech', 'badbatch'], ['echo', 'Echo', 'badbatch'], ['crosshair', 'Crosshair', 'badbatch'],
  ['amedda', 'Grand Vizier Mas Amedda', 'empire'], ['palpatine', 'Emperor Palpatine', 'empire'], ['anakin', 'Anakin Skywalker', 'empire'],
  ['tarkin', 'Governor Tarkin', 'empire'], ['thrawn', 'Grand Admiral Thrawn', 'empire'], ['krennic', 'Lt. Commander Krennic', 'empire'],
  ['fisto', 'Kit Fisto', 'jedi'], ['plo', 'Plo Koon', 'jedi'], ['yoda', 'Yoda', 'jedi'], ['windu', 'Mace Windu', 'jedi'],
  ['obiwan', 'Obi-Wan Kenobi', 'jedi'], ['shaak', 'Shaak Ti', 'jedi'], ['mundi', 'Ki-Adi-Mundi', 'jedi'],
  ['hevy', 'Hevy', 'clone'], ['cody', 'Cody', 'clone'], ['fives', 'Fives', 'clone'], ['ninety-nine', '99', 'clone'],
  ['gregor', 'Gregor', 'clone'], ['wolffe', 'Wolffe', 'clone'], ['jesse', 'Jesse', 'clone'], ['howzer', 'Howzer', 'clone'],
].map(([id, name, faction]) => ({ id, name, faction }));
export const CHAR = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
export const AHSOKA = 'ahsoka';
export const charArt = (id) => (id === AHSOKA ? '/art/ahsoka.jpg' : `/art/chars/${id}.jpg`);

// keep = stays in your play area (does not get discarded)
export const ENCOUNTERS = [
  { id: 'hondo', name: 'Hondo Ohnaka', keep: true, text: 'Declare a Faction: Hondo counts as two character cards from that Faction.' },
  { id: 'waxer', name: 'Waxer', text: 'Take Fives from the Galaxy or any Play Area.' },
  { id: 'rex', name: 'Captain Rex', text: 'Take Wolffe or Gregor from the Galaxy or any Play Area.' },
  { id: 'saw', name: 'Saw Gerrera', text: 'Kill one character in the Galaxy, one character in any Play Area, and one available companion.' },
  { id: 'fennec', name: 'Fennec Shand', text: 'Take Hunter from the Galaxy or any Play Area, then kill Tech in the Galaxy or any Play Area.' },
  { id: 'omega', name: 'Omega', keep: true, text: 'If you have Hunter in your Play Area, Omega counts as two Bad Batch character cards.' },
  { id: 'krell', name: 'Pong Krell', text: 'Take Asajj Ventress or any Separatist character from the Galaxy or any Play Area.' },
  { id: 'sidious', name: 'Darth Sidious', text: 'Take Anakin Skywalker from the Galaxy or any Play Area.' },
  { id: 'huyang', name: 'Huyang', text: 'Draw two companion cards. Play one and discard the other.' },
  { id: 'nightsisters', name: 'Nightsisters', keep: true, text: 'Nightsisters count as one Dathomir Faction character card.' },
  { id: 'droids', name: 'Battle Droids', text: 'Kill 99 in the Galaxy or any Play Area.' },
  { id: 'satine', name: 'Duchess Satine', text: 'Switch the positions of two character cards in the Galaxy.' },
  { id: 'trench', name: 'Admiral Trench', text: 'Kill any character in the Galaxy.' },
  { id: 'bokatan', name: 'Bo-Katan', text: 'Immediately take another turn.' },
];
export const ENC = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e]));
export const encArt = (id) => `/art/enc/${id}.jpg`;
export const tokenArt = (f) => `/art/tokens/${f}.jpg`;

export const GRID = 6;
export const FACE_UP_ENCOUNTERS = 6;
