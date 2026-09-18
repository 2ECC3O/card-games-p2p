import assert from 'node:assert/strict';
import {
  addPlayer, applyAction, BET_MS, createGame, hostTick, isBroke, payoutMultiple, rejoinQueue, removePlayer, RED, SPIN_MS, SETTLE_MS, spin, startGame, WHEEL,
} from './rouletteEngine';
import type { GameState, PlayerAction, Spot } from '../types/roulette';

// ------------------------------------------------ the wheel
assert.equal(WHEEL.length, 37);
assert.deepEqual([...WHEEL].sort((a, b) => a - b), Array.from({ length: 37 }, (_, i) => i), 'every number once');
assert.equal(RED.size, 18);
// Red and black alternate round the wheel.
for (let i = 1; i < 36; i++) assert.notEqual(RED.has(WHEEL[i]), RED.has(WHEEL[i + 1]), `pockets ${i} and ${i + 1}`);

// ------------------------------------------------ payouts (stake included)
const pays = (spot: Spot, n: number) => payoutMultiple(spot, n);
assert.equal(pays('n17', 17), 36);
assert.equal(pays('n17', 18), 0);
assert.equal(pays('n0', 0), 36);
assert.equal(pays('red', 1), 2);
assert.equal(pays('black', 2), 2);
assert.equal(pays('red', 2), 0);
assert.equal(pays('odd', 35), 2);
assert.equal(pays('even', 36), 2);
assert.equal(pays('low', 18), 2);
assert.equal(pays('high', 19), 2);
assert.equal(pays('d1', 12), 3);
assert.equal(pays('d2', 13), 3);
assert.equal(pays('d3', 24), 0);
assert.equal(pays('c1', 34), 3);
assert.equal(pays('c2', 35), 3);
assert.equal(pays('c3', 36), 3);
assert.equal(pays('c1', 36), 0);
for (const spot of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'c1'] as Spot[]) assert.equal(pays(spot, 0), 0, `zero loses ${spot}`);
// Every bet type returns 36 chips across the 36 non-zero numbers per chip covering them: the house edge is only the zero.
for (const spot of ['red', 'odd', 'low', 'd2', 'c3', 'n5'] as Spot[]) {
  assert.equal(WHEEL.reduce((n, x) => n + pays(spot, x), 0), 36, `${spot} over the whole wheel`);
}

// ------------------------------------------------ a round
const config = { startingStack: 1000, minBet: 10 };
function table(n: number): GameState {
  let s = createGame('ABC123', config, 0);
  for (let i = 0; i < n; i++) s = addPlayer(s, `p${i}`, `P${i}`, 0);
  return startGame(s, 0);
}
const act = (s: GameState, id: string, a: PlayerAction) => applyAction(s, id, a, 1);
const bet = (s: GameState, id: string, spot: Spot, amount: number) => act(s, id, { type: 'bet', spot, amount });
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

let s = table(2);
assert.equal(s.phase, 'betting');
assert.equal(s.deadline, BET_MS);
assert.throws(() => bet(s, 'p0', 'red', 5), /Not enough/, 'below the table minimum');
assert.throws(() => bet(s, 'p0', 'red', 2000), /Not enough/, 'more than the stack');
assert.throws(() => bet(s, 'p0', 'n37' as Spot, 10), /Invalid bet/);
assert.throws(() => bet(s, 'p0', '__proto__' as Spot, 10), /Invalid bet/);
s = bet(s, 'p0', 'n17', 10);
s = bet(s, 'p0', 'n17', 10);
s = bet(s, 'p0', 'red', 100);
assert.deepEqual(player(s, 'p0').bets, { n17: 20, red: 100 });
assert.equal(player(s, 'p0').chips, 880);
s = act(s, 'p0', { type: 'clear' });
assert.equal(player(s, 'p0').chips, 1000, 'clear gives the chips back');
s = bet(s, 'p0', 'n17', 20);
s = bet(s, 'p0', 'red', 100);
s = act(s, 'p0', { type: 'done' });
assert.throws(() => bet(s, 'p0', 'black', 10), /No more bets/, 'done means done');
s = bet(s, 'p1', 'd3', 50);
assert.equal(s.phase, 'betting', 'waits for everyone');

// p1 never presses done: the window closes. 17 is black, first dozen.
s = structuredClone(s);
spin(s, BET_MS, 17);
assert.equal(s.phase, 'settled');
assert.equal(s.result, 17);
assert.deepEqual(s.history, [17]);
assert.equal(player(s, 'p0').payout, 720);
assert.equal(player(s, 'p0').chips, 880 + 720);
assert.equal(player(s, 'p1').payout, 0);
assert.equal(player(s, 'p1').chips, 950);
assert.equal(s.nextRoundAt, BET_MS + SPIN_MS + SETTLE_MS);
assert.throws(() => bet(s, 'p0', 'red', 10), /No more bets/);

// Next round: bets cleared, Repeat puts last round's back.
s = hostTick(s, s.nextRoundAt!);
assert.equal(s.phase, 'betting');
assert.equal(s.round, 2);
assert.deepEqual(player(s, 'p0').bets, {});
s = act(s, 'p0', { type: 'repeat' });
assert.deepEqual(player(s, 'p0').bets, { n17: 20, red: 100 });
assert.equal(player(s, 'p0').chips, 1600 - 120);

// Everyone done: the wheel spins straight away.
s = act(s, 'p0', { type: 'done' });
s = act(s, 'p1', { type: 'done' });
assert.equal(s.phase, 'settled');
assert.deepEqual(player(s, 'p1').lastBets, { d3: 50 }, 'sitting out keeps the last bets');

// Nobody bets: a fresh window opens instead of a spin.
s = table(1);
s = hostTick(s, BET_MS);
assert.equal(s.phase, 'betting');
assert.equal(s.round, 2);
assert.equal(s.history.length, 0);

// Going broke, rejoining, leaving.
s = table(2);
s = bet(s, 'p0', 'n0', 1000);
assert.equal(isBroke(s, player(s, 'p0')), false, 'everything riding on the spin');
s = structuredClone(s);
spin(s, 1, 5);
assert.equal(isBroke(s, player(s, 'p0')), true);
s = rejoinQueue(s, 'p0', 'P0', 2);
assert.equal(s.queue[0].id, 'p0');
s = hostTick(s, s.nextRoundAt!);
assert.equal(player(s, 'p0').chips, 1000, 'dealt back in with a fresh stack');
s = bet(s, 'p0', 'red', 10);
s = act(s, 'p0', { type: 'done' });
s = removePlayer(s, 'p1', 3);
assert.equal(s.phase, 'settled', 'the last player to leave was the one holding up the spin');

// Late joiners queue, and the queue has a limit.
s = table(1);
s = addPlayer(s, 'late', 'Late', 1);
assert.equal(s.queue.length, 1);
for (let i = 0; i < 30; i++) s = addPlayer(s, `q${i}`, 'Q', 1);
assert.equal(s.queue.length, 20);

console.log('engine: all checks passed');
