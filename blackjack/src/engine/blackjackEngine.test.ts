import assert from 'node:assert/strict';
import {
  addPlayer, addSpectator, applyAction, BET_MS, createGame, handValue, hostTick, legalActions, maskFor, rejoinQueue, removePlayer, startRound, TURN_MS,
} from './blackjackEngine';
import type { Card, GameState, PlayerAction } from '../types/blackjack';

// ------------------------------------------------ hand values
assert.deepEqual(handValue(['As', 'Kd']), { total: 21, soft: true });
assert.deepEqual(handValue(['As', '6d']), { total: 17, soft: true });
assert.deepEqual(handValue(['As', '6d', 'Tc']), { total: 17, soft: false });
assert.deepEqual(handValue(['As', 'Ad', '9c']), { total: 21, soft: true });
assert.deepEqual(handValue(['Ks', 'Qd', '2c']), { total: 22, soft: false });
assert.deepEqual(handValue(['Ks', '??']), { total: 10, soft: false });

// ------------------------------------------------ helpers
const config = { startingStack: 1000, minBet: 10, decks: 6 };
/** Cards in the order they are dealt (the engine pops from the end). Deal order: each player, dealer, each player, dealer. */
const stack = (...cards: Card[]): Card[] => [...cards].reverse();

function table(n: number, shoe: Card[]): GameState {
  let s = createGame('ABC123', config, 0);
  for (let i = 0; i < n; i++) s = addPlayer(s, `p${i}`, `P${i}`, 0);
  s = structuredClone(s);
  s.started = true;
  startRound(s, 0, shoe);
  return s;
}
const act = (s: GameState, id: string, a: PlayerAction) => applyAction(s, id, a, 1);
const bet = (s: GameState, id: string, amount = 100) => act(s, id, { type: 'bet', amount });
const chips = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.chips;
const hands = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.hands;

// Betting: every seated player bets, then the cards come out.
let s = table(2, stack('Ts', '9h', '5c', '8s', '7c', 'Kd', '2d', '3d'));
assert.equal(s.phase, 'betting');
assert.throws(() => bet(s, 'p0', 5), /Invalid bet/, 'below the table minimum');
assert.throws(() => bet(s, 'p0', 2000), /Invalid bet/, 'more than the stack');
s = bet(s, 'p0');
assert.equal(s.phase, 'betting');
assert.throws(() => bet(s, 'p0'), /closed/, 'one bet per round');
s = bet(s, 'p1', 50);
assert.equal(s.phase, 'playing');
assert.deepEqual(hands(s, 'p0')[0].cards, ['Ts', '8s']);
assert.deepEqual(hands(s, 'p1')[0].cards, ['9h', '7c']);
assert.deepEqual(s.dealer, ['5c', 'Kd']);
assert.equal(s.activeId, 'p0');
// Viewers don't see the hole card or the shoe.
assert.deepEqual(maskFor(s, 'p0').dealer, ['5c', '??']);
assert.deepEqual(maskFor(s, 'p0').shoe, []);
assert.throws(() => act(s, 'p1', { type: 'hit' }), /Not your turn/);
s = act(s, 'p0', { type: 'stand' });
assert.equal(s.activeId, 'p1');
s = act(s, 'p1', { type: 'hit' }); // 16 + 2 = 18
assert.equal(s.activeId, 'p1');
s = act(s, 'p1', { type: 'stand' });
// Dealer 15 draws a 3: 18. p0 (18) and p1 (18) push.
assert.equal(s.phase, 'settled');
assert.deepEqual(s.dealer, ['5c', 'Kd', '3d']);
assert.deepEqual(maskFor(s, 'p0').dealer, ['5c', 'Kd', '3d'], 'revealed after the round');
assert.equal(hands(s, 'p0')[0].outcome, 'push');
assert.equal(chips(s, 'p0'), 1000);
assert.equal(chips(s, 'p1'), 1000);

// A natural pays 3 to 2 (rounded down); a busted hand loses even if the dealer busts too.
s = table(2, stack('As', '9d', 'Ts', 'Kh', '7c', '6c', 'Qs', 'Tc'));
s = bet(bet(s, 'p0', 25), 'p1', 100);
assert.equal(s.activeId, 'p1', 'the blackjack needs no action');
s = act(s, 'p1', { type: 'hit' }); // 9 + 7 + Q = 26, bust
// Dealer 16 draws a 10 and busts.
assert.equal(s.phase, 'settled');
assert.equal(hands(s, 'p0')[0].outcome, 'blackjack');
assert.equal(chips(s, 'p0'), 1000 + 37);
assert.equal(hands(s, 'p1')[0].outcome, 'bust');
assert.equal(chips(s, 'p1'), 900);

// The dealer peeks: a dealer blackjack ends the round at once. A player natural pushes.
s = table(2, stack('As', '9s', 'Ac', 'Kh', 'Kd', 'Kc'));
s = bet(bet(s, 'p0'), 'p1');
assert.equal(s.phase, 'settled');
assert.equal(hands(s, 'p0')[0].outcome, 'push');
assert.equal(hands(s, 'p1')[0].outcome, 'lose');
assert.equal(chips(s, 'p0'), 1000);
assert.equal(chips(s, 'p1'), 900);

// Double: one card, twice the bet.
s = table(1, stack('6s', 'Tc', '5d', '7h', 'Ts', '9c'));
s = bet(s, 'p0');
s = act(s, 'p0', { type: 'double' }); // 11 + 10 = 21 vs dealer 17 + ... dealer 17 stands
assert.equal(hands(s, 'p0')[0].bet, 200);
assert.equal(hands(s, 'p0')[0].cards.length, 3);
assert.equal(s.phase, 'settled');
assert.equal(hands(s, 'p0')[0].outcome, 'win');
assert.equal(chips(s, 'p0'), 1200);

// Split: two hands, each with its own bet; the second gets its card when its turn comes.
s = table(1, stack('8s', 'Tc', '8d', '7h', '3c', 'Ks', '2h', 'Td'));
s = bet(s, 'p0');
s = act(s, 'p0', { type: 'split' });
assert.equal(chips(s, 'p0'), 800);
assert.deepEqual(hands(s, 'p0').map((h) => h.cards), [['8s', '3c'], ['8d']]);
s = act(s, 'p0', { type: 'hit' }); // 8 + 3 + K = 21: done
assert.equal(s.activeHand, 1);
assert.deepEqual(hands(s, 'p0')[1].cards, ['8d', '2h']);
s = act(s, 'p0', { type: 'double' }); // 10 + T = 20
// Dealer 17 stands: 21 wins 200, doubled 20 wins 400.
assert.equal(s.phase, 'settled');
assert.deepEqual(hands(s, 'p0').map((h) => h.outcome), ['win', 'win']);
assert.equal(chips(s, 'p0'), 1000 - 100 - 200 + 200 + 400);

// Split aces: one card each, and 21 there is not a blackjack.
s = table(1, stack('As', '9c', 'Ad', '8h', 'Kc', '5s'));
s = bet(s, 'p0');
s = act(s, 'p0', { type: 'split' });
assert.equal(s.phase, 'settled');
assert.deepEqual(hands(s, 'p0').map((h) => h.outcome), ['win', 'lose']); // 21 and 16 vs 17
assert.equal(chips(s, 'p0'), 1000 - 200 + 200);

// Can't split unlike cards, can't double without the chips.
s = table(1, stack('8s', 'Tc', '9d', '7h'));
s = bet(s, 'p0', 1000);
assert.throws(() => act(s, 'p0', { type: 'split' }), /cannot split/);
assert.throws(() => act(s, 'p0', { type: 'double' }), /cannot double/);
assert.equal(legalActions(s, 'p0').splitBlock, 'Pairs only');

// The Split button explains itself: a pair without the chips, and the four-hand limit.
s = table(1, stack('8s', 'Tc', '8d', '7h'));
s = bet(s, 'p0', 1000);
assert.equal(legalActions(s, 'p0').splitBlock, 'Not enough chips');
s = table(1, stack('8s', 'Tc', '8d', '7h', '8c', '8h', '8s', '2d'));
s = bet(s, 'p0', 10);
assert.equal(legalActions(s, 'p0').splitBlock, null);
s = act(act(act(s, 'p0', { type: 'split' }), 'p0', { type: 'split' }), 'p0', { type: 'split' });
assert.equal(hands(s, 'p0').length, 4);
assert.equal(legalActions(s, 'p0').splitBlock, '4 hands max');

// Timeouts: betting closes without the slow player; a slow turn stands.
s = table(2, stack('Ts', '9c', '8h', '8d'));
s = bet(s, 'p0');
s = hostTick(s, BET_MS);
assert.equal(s.phase, 'playing');
assert.equal(hands(s, 'p1').length, 0, 'sat this round out');
assert.equal(s.activeId, 'p0');
s = hostTick(s, BET_MS + TURN_MS);
assert.equal(s.phase, 'settled', 'auto-stand, dealer 17 stands');
assert.equal(hands(s, 'p0')[0].outcome, 'win'); // 18 vs 17
// Next round after the results are shown.
s = hostTick(s, s.nextRoundAt!);
assert.equal(s.phase, 'betting');
assert.equal(s.round, 2);

// Nobody bets: a fresh betting window.
s = table(1, stack('Ts', '9c', '8h', '7h'));
s = hostTick(s, BET_MS);
assert.equal(s.phase, 'betting');
assert.equal(s.round, 2);

// Leaving mid-turn stands their hands and moves on; leaving during betting can trigger the deal.
s = table(2, stack('Ts', '9s', '8c', '7h', '6h', '5d', '4d'));
s = bet(bet(s, 'p0'), 'p1');
s = removePlayer(s, 'p0', 1);
assert.equal(s.activeId, 'p1');
s = table(2, stack('Ts', '9c', '8h', '7h'));
s = bet(s, 'p0');
s = removePlayer(s, 'p1', 1);
assert.equal(s.phase, 'playing');

// Broke players can queue for a fresh stack and are seated at the next round.
s = table(1, stack('Ts', 'Ac', '8h', 'Kh'));
s = bet(s, 'p0', 1000);
assert.equal(s.phase, 'settled');
assert.equal(chips(s, 'p0'), 0);
s = rejoinQueue(s, 'p0', 'P0', 1);
assert.equal(s.queue.length, 1);
s = hostTick(s, s.nextRoundAt!);
assert.equal(chips(s, 'p0'), 1000);
assert.equal(s.phase, 'betting');

// ------------------------------------------------ spectators
{
  let s = table(1, stack('Ts', '5c', '8s', 'Kd'));
  s = addSpectator(s, 'w', 'Watcher', 0);
  assert.equal(s.players.length, 1, 'watching takes no seat');
  s = bet(s, 'p0');
  assert.equal(s.phase, 'playing');
  assert.deepEqual(maskFor(s, 'w').dealer, ['5c', 'Kd'], 'spectators see the hole card');
  assert.deepEqual(maskFor(s, 'w').shoe, [], 'but never the shoe');
  assert.deepEqual(maskFor(s, 'p0').dealer, ['5c', '??'], 'players still do not');
  assert.throws(() => act(s, 'w', { type: 'hit' }), /not seated/);
  s = removePlayer(s, 'w', 1);
  assert.equal(s.spectators.length, 0);
}

console.log('engine: all checks passed');
