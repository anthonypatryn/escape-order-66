// Every place the game can make a sound (for the sound editor). synth = a built-in synthesized sound plays when the slot
// has no clips; otherwise the slot is silent until it gets one.
import { ENCOUNTERS } from './cards.js';

export const SOUND_GROUPS = [
  ['Moves & cards', [
    ['saber', 'Ahsoka moves', true],
    ['take', 'Each card landing in a play area (plays a lot: keep it short)', true],
    ['bighaul', 'A big haul: 3+ cards taken in one move'],
    ['last-one', 'Taking the last card of a faction (earns an encounter)'],
    ['deal', 'The cards dealing onto the board at the start'],
    ['click', 'An arrow key pointing where there is no move', true],
  ]],
  ['Encounters', [
    ['encounter', 'Any encounter appears (under its voice line)', true],
    ['kill', 'A character or companion is killed', true],
    ['swap', 'Satine switches two cards', true],
    ['fizzle', 'An encounter that finds nothing to do'],
    ['extra-turn', 'Bo-Katan: the extra turn starts'],
  ]],
  ['Banners', [
    ['banner', 'A banner is claimed', true],
    ['steal', 'A banner is taken from the other player (plays after the banner sound)'],
    ['banner-down', 'A banner goes back to the middle', true],
    ['lock', 'A banner becomes locked (can’t change hands any more)'],
  ]],
  ['Turns & the end', [
    ['turn', 'Your move (people only)', true],
    ['ai-turn', 'A computer player starts its turn'],
    ['undo', 'Undo'],
    ['order66', 'After the opening crawl, with the Emperor’s hologram'],
    ['game-over', 'Ahsoka can’t move: the game ends (before the end screen)'],
    ['lose', 'The end: the loser’s scream as the winner is called'],
    ['win', 'The end: the fanfare, 2.4 s after the scream', true],
  ]],
  ['Encounter voice lines', ENCOUNTERS.map((e) => [`enc-${e.id}`, `${e.name} (as the card appears)`])],
];
export const SOUND_SLOTS = SOUND_GROUPS.flatMap(([, list]) => list.map(([id, what, synth]) => ({ id, what, synth: !!synth })));
