import assert from 'node:assert/strict';
import { addBot, addPlayer, applyAction, beats, botMove, createGame, hostTick, maskFor, ranking, startGame, startRound, titles, TURN_MS } from './slaveEngine';
import type { Card, GameState } from '../types/slave';

// ------------------------------------------------ plays
assert.ok(beats(['4c'], ['3s']));
assert.ok(beats(['2c'], ['As']), '2 is the highest card');
assert.ok(!beats(['7c'], ['7s']), 'same rank never beats, whatever the suit');
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

// ------------------------------------------------ exchange
s = table([[], [], [], []]);
s.players.forEach((p, i) => (p.title = (['Slave', 'King', 'Serf', 'Queen'] as const)[i]));
const deck = ['3c', '3d', '3h', '3s', '4c', '4d', '4h', '4s', '5c', '5d', '5h', '5s', '2c', '6d', 'Ah', '6s'] as Card[];
startRound(s, 0, deck);
assert.equal(s.phase, 'exchange');
assert.deepEqual(s.players[0].hand, ['3c', '4c'], "the Slave's two best cards went up");
assert.ok(s.players[1].hand.includes('2c') && s.players[1].hand.includes('5c'), 'to the King');
assert.ok(s.players[3].hand.includes('Ah'), "and the Serf's best to the Queen");
assert.throws(() => applyAction(s, 'p1', { type: 'give', cards: ['3d'] }, 1), /Give 2/);
s = applyAction(s, 'p1', { type: 'give', cards: ['3d', '4d'] }, 1);
s = applyAction(s, 'p3', { type: 'give', cards: ['3s'] }, 1);
assert.equal(s.phase, 'playing');
assert.equal(s.activeId, 'p0', "last round's Slave leads");
assert.equal(s.players.reduce((n, p) => n + p.hand.length, 0), 16, 'no cards lost');

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
