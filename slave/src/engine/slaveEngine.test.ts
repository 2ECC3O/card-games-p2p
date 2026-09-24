import assert from 'node:assert/strict';
import { addBot, addPlayer, applyAction, beats, botGive, botMove, createGame, EXCHANGE_SHOW_MS, hostTick, maskFor, odds, ranking, startGame, startRound, titles, TURN_MS } from './slaveEngine';
import type { Card, GameState } from '../types/slave';

// ------------------------------------------------ plays
assert.ok(beats(['4c'], ['3s']));
assert.ok(beats(['2c'], ['As']), '2 is the highest card');
assert.ok(beats(['7s'], ['7h']), 'same rank: the higher suit beats');
assert.ok(!beats(['7c'], ['7d']), 'suits go clubs, diamonds, hearts, spades');
assert.ok(beats(['2s'], ['2h']), '2 of spades tops every other 2');
assert.ok(beats(['7s', '7c'], ['7h', '7d']), "a pair with the higher top card beats the same rank's other pair");
assert.deepEqual(botMove(['5c', '7c', '7s', '9d', 'Kd'], ['7h'], [10]), ['9d'], 'keeps its pair rather than split it for the top suit');
assert.deepEqual(botMove(['5c', '7c', '7s', '9c', '9d'], ['7h'], [10]), ['7s'], 'but splits for the top suit when nothing else fits');
assert.ok(beats(['9c', '9d'], ['8s', '8h']));
assert.ok(!beats(['9c', 'Td'], null), 'one rank only');
assert.ok(!beats(['5c', '6c', '7c'], null), 'no straights');
assert.ok(beats(['3c', '3d', '3h'], ['2s']), 'three of a kind beats any single');
assert.ok(beats(['3c', '3d', '3h', '3s'], ['2s', '2h']), 'four of a kind beats any pair');
assert.ok(!beats(['3c', '3d', '3h'], ['4s', '4h']), 'but three of a kind is no answer to a pair');
assert.ok(!beats(['9c', '9d'], ['8s']), 'a pair is no answer to a single');
assert.deepEqual(botMove(['3c', '3d', '5h', '9s'], null), ['3c', '3d'], 'leads its lowest rank, all of it');
assert.deepEqual(botMove(['3c', '3d', '5h', '9s', '9d'], ['4h', '4s']), ['9s', '9d']);
assert.equal(botMove(['3c', '5h'], ['2s']), null);
assert.deepEqual(botMove(['5c', '5d', '7h', '9s', 'Kd'], ['4s'], [10]), ['7h'], "doesn't break a pair when a single fits");
assert.deepEqual(botMove(['5c', '5d', '9c', '9d', 'Jc', 'Jd'], ['8s'], [10]), ['9c'], 'breaks the lowest set that beats when nothing fits');
assert.equal(botMove(['4c', '6d', '8h', 'Tc', '2s'], ['As'], [10]), null, 'holds its 2 back early on');
assert.deepEqual(botMove(['4c', '6d', '8h', 'Tc', '2s'], ['As'], [2]), ['2s'], 'and plays it when someone is nearly out');
assert.equal(botMove(['3c', '3d', '3h', '5s', '6s'], ['Ks'], [10]), null, 'no bomb early on');
assert.deepEqual(botMove(['3c', '3d', '3h', '5s', '6s'], ['Ks'], [2]), ['3c', '3d', '3h'], 'bombs a single near the end');
assert.deepEqual(botMove(['9c', '9d'], ['8s', '8h'], [10]), ['9c', '9d'], 'goes out when it can');
assert.deepEqual(botMove(['5c', '2s'], null, [10]), ['2s'], 'cashes its 2 to lead out the last card');
assert.deepEqual(botMove(['4c', '6d', '6h', '9s', 'Kc'], null, [1, 8]), ['6d', '6h'], 'leads a pair against a player on one card');
assert.deepEqual(botMove(['4c', '6d', '9s', 'Kc'], null, [1, 8]), ['Kc'], 'or its highest single');
assert.deepEqual(botGive(['3c', '3d', '4h', '5s', '9c'], 2), ['4h', '5s'], 'gives back its lowest singles, keeping pairs');

// ------------------------------------------------ titles and falls
assert.deepEqual(titles(5), ['King', 'Queen', 'Citizen', 'Serf', 'Slave']);
assert.deepEqual(titles(3), ['King', 'Citizen', 'Slave']);
assert.deepEqual(ranking(['a', 'b', 'c', 'd'], 'a', 'b'), ['a', 'b', 'c', 'd'], 'both keep their place');
assert.deepEqual(ranking(['a', 'k', 'b', 'c'], 'k'), ['a', 'b', 'c', 'k'], 'a King not first out becomes Slave');
assert.deepEqual(ranking(['a', 'b', 'q', 'c', 'd'], undefined, 'q'), ['a', 'b', 'c', 'q', 'd'], 'a Queen outside the top two becomes Serf');
assert.deepEqual(ranking(['a', 'b', 'c', 'q'], undefined, 'q'), ['a', 'b', 'c', 'q'], 'a Queen who came last stays Slave');
assert.deepEqual(ranking(['q', 'a', 'b', 'c'], undefined, 'q'), ['q', 'a', 'b', 'c'], 'a Queen who goes out first is King');
assert.deepEqual(ranking(['a', 'k', 'q', 'b', 'c'], 'k', 'q'), ['a', 'q', 'b', 'c', 'k'], "the King's fall lifts the Queen back into the top two");

// ------------------------------------------------ a trick
const table = (hands: Card[][]): GameState => {
  let s = createGame('ROOM01', 0);
  hands.forEach((_, i) => (s = addPlayer(s, `p${i}`, `P${i}`, 0)));
  s = { ...s, started: true, phase: 'playing', round: 1, activeId: 'p0', deadline: TURN_MS };
  s.players.forEach((p, i) => (p.hand = hands[i]));
  return s;
};
let s = table([['5c', '7c', 'Kc'], ['6d', '8d', 'Kd'], ['6h', '9h', 'Kh'], ['4s', '9s', 'Ks']]);
assert.throws(() => applyAction(s, 'p0', { type: 'pass' }, 1), /lead/, 'the leader must play');
assert.throws(() => applyAction(s, 'p1', { type: 'play', cards: ['6d'] }, 1), /turn/);
s = applyAction(s, 'p0', { type: 'play', cards: ['5c'] }, 1);
assert.throws(() => applyAction(s, 'p1', { type: 'play', cards: ['4s'] }, 1), /hold/);
s = applyAction(s, 'p1', { type: 'pass' }, 1);
s = applyAction(s, 'p2', { type: 'play', cards: ['6h'] }, 1);
s = applyAction(s, 'p3', { type: 'pass' }, 1);
s = applyAction(s, 'p0', { type: 'play', cards: ['7c'] }, 1);
assert.equal(s.activeId, 'p2', 'a pass sits you out until the pile clears');
s = applyAction(s, 'p2', { type: 'pass' }, 1);
assert.equal(s.pile, null, 'everyone else passed: the pile clears');
assert.equal(s.activeId, 'p0', 'and whoever played it leads');
s = applyAction(s, 'p0', { type: 'play', cards: ['Kc'] }, 1);
assert.deepEqual(s.out, ['p0'], 'out of cards: finished');
s = applyAction(s, 'p1', { type: 'pass' }, 1);
s = applyAction(s, 'p2', { type: 'pass' }, 1);
s = applyAction(s, 'p3', { type: 'pass' }, 1);
assert.equal(s.activeId, 'p1', 'a player who went out hands the lead to the next seat');

// Masking: your own hand only.
const seen = maskFor(s, 'p1');
assert.deepEqual(seen.players[1].hand, ['6d', '8d', 'Kd']);
assert.deepEqual(seen.players[2].hand, ['??', '??']);

// Odds: every hand visible (a spectator's view), the same numbers every time, one King per playout.
const chance = odds(s, 100);
assert.deepEqual(chance, odds(s, 100), 'seeded by the cards');
assert.ok(Math.abs(Object.values(chance).reduce((n, c) => n + c.king, 0) - 1) < 1e-9);
assert.equal(chance.p0.king, 1, 'p0 is already out first');
assert.deepEqual(odds(seen), {}, "a player's own view hides the other hands");

// Out of time: pass, or lead your lowest card.
let slow = table([['5c', '5d', '9c'], ['6d'], ['7h'], ['8s']]);
slow = hostTick(slow, TURN_MS);
assert.deepEqual(slow.pile?.cards, ['5c'], 'a slow leader plays just their lowest card');
slow = hostTick(slow, 2 * TURN_MS);
assert.deepEqual(slow.passed, ['p1'], 'a slow follower passes');

// ------------------------------------------------ exchange
s = table([[], [], [], []]);
s.players.forEach((p, i) => (p.title = (['Slave', 'King', 'Serf', 'Queen'] as const)[i]));
const deck = ['3c', '3d', '3h', '3s', '4c', '4d', '4h', '4s', '5c', '5d', '5h', '5s', '2c', '6d', 'Ah', '6s'] as Card[];
startRound(s, 0, deck);
assert.equal(s.phase, 'exchange');
assert.deepEqual(s.gives[0].cards, ['5c', '2c'], "the Slave's two best cards are set aside for the King");
assert.deepEqual(s.gives[2].cards, ['Ah'], "and the Serf's best for the Queen");
assert.deepEqual(s.players[0].hand, ['3c', '4c', '5c', '2c'], 'but nothing moves while the King and Queen pick');
assert.throws(() => applyAction(s, 'p1', { type: 'give', cards: ['3d'] }, 1), /Give 2/);
assert.throws(() => applyAction(s, 'p1', { type: 'give', cards: ['5c', '2c'] }, 1), /hold/, "the King picks from his own hand, not the Slave's cards");
s = applyAction(s, 'p1', { type: 'give', cards: ['3d', '4d'] }, 1);
assert.equal(s.swapped, false, 'still waiting for the Queen');
assert.deepEqual(s.players[1].hand, ['3d', '4d', '5d', '6d']);
s = applyAction(s, 'p3', { type: 'give', cards: ['3s'] }, 1);
assert.ok(s.swapped, 'everyone has picked: the cards change hands at once');
assert.deepEqual(s.players[0].hand, ['3c', '3d', '4c', '4d']);
assert.deepEqual(s.players[1].hand, ['5c', '5d', '6d', '2c']);
assert.deepEqual(s.players[2].hand, ['3h', '3s', '4h', '5h']);
assert.deepEqual(s.players[3].hand, ['4s', '5s', '6s', 'Ah']);
assert.equal(s.phase, 'exchange', 'the swap stays on show');
assert.equal(hostTick(s, 1 + EXCHANGE_SHOW_MS - 1), s);
s = hostTick(s, 1 + EXCHANGE_SHOW_MS);
assert.equal(s.phase, 'playing');
assert.equal(s.activeId, 'p0', 'whoever holds 3♣ after the exchange leads (here the Slave kept it)');
assert.equal(s.dir, 1);
assert.equal(s.players.reduce((n, p) => n + p.hand.length, 0), 16, 'no cards lost');

// Turns go the short way round to the Slave: 3♣ at seat 0, the Slave at seat 3 of 5, so seat 4 plays next.
s = table([[], [], [], [], []]);
s.players.forEach((p, i) => (p.title = i === 3 ? 'Slave' : 'Citizen'));
startRound(s, 0, ['3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc'] as Card[]);
assert.equal(s.activeId, 'p0');
assert.equal(s.dir, -1, 'counter-clockwise: two seats to the Slave instead of three');
s = applyAction(s, 'p0', { type: 'play', cards: ['3c'] }, 1);
assert.equal(s.activeId, 'p4');
s = applyAction(s, 'p4', { type: 'play', cards: ['7c'] }, 1);
assert.equal(s.activeId, 'p3');
s.players.forEach((p) => (p.title = p.id === 'p1' ? 'Slave' : 'Citizen'));
startRound(s, 0, ['3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc'] as Card[]);
assert.equal(s.dir, 1, 'clockwise when the Slave is the nearer that way');

// ------------------------------------------------ a bot match plays itself
let b = createGame('BOTS01', 0);
b = addPlayer(b, 'me', 'Me', 0);
b = startGame(b, 0);
assert.equal(b.players.length, 4, 'filled to four with bots');
b = addBot(b, 0);
let now = 0;
for (let i = 0; i < 5000 && b.round < 4; i++) {
  b = hostTick(b, (now += 1_000));
  if (b.phase === 'exchange') assert.equal(b.players.reduce((n, p) => n + p.hand.length, 0), 52, 'the exchange moves cards, never loses them');
}
assert.equal(b.round, 4, 'rounds keep coming, timeouts included');
assert.equal(b.players.length, 5, 'the queued bot is dealt in');
assert.ok(b.players.some((p) => p.title === 'King') && b.players.some((p) => p.title === 'Slave'));

console.log('slave engine: all checks passed');
