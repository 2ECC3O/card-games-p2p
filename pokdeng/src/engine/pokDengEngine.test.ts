import assert from 'node:assert/strict';
import {
  addBot, addPlayer, applyAction, compare, createGame, deng, handsOf, handType, hostTick, maskFor, removePlayer, score, startGame, startRound, TURN_MS,
} from './pokDengEngine';
import type { Card, GameState, PlayerAction } from '../types/pokdeng';

// ------------------------------------------------ hands
assert.equal(score(['As', 'Kd']), 1);
assert.equal(score(['9s', '9d']), 8);
assert.deepEqual(handType(['9s', 'Kd']), { rank: 4, name: 'Pok 9' });
assert.deepEqual(handType(['4s', '4d', '4c']), { rank: 3, name: 'Tong' });
assert.deepEqual(handType(['Qs', 'Kd', 'Ac']), { rank: 2, name: 'Straight' }, 'Q-K-A');
assert.deepEqual(handType(['2h', '3d', '4c']), { rank: 2, name: 'Straight' });
assert.equal(handType(['Ah', '2d', '3c']).rank, 0, 'A-2-3 is not a straight: the ace is high');
assert.equal(handType(['Kh', 'Ad', '2c']).rank, 0, 'no wrap-around');
assert.deepEqual(handType(['Jh', 'Jd', 'Qc']), { rank: 1, name: 'Three faces' });
assert.equal(handType(['Jh', 'Qd', 'Kc']).name, 'Straight', 'J-Q-K is a run, so it counts as a straight');
assert.equal(handType(['9s', '9d', 'Tc']).name, '8', 'three-card 8 is not a Pok');
assert.equal(deng(['2h', '5h']), 2, 'two cards of one suit');
assert.equal(deng(['7s', '7d']), 2, 'pair');
assert.equal(deng(['2c', '5h']), 1);
assert.equal(deng(['2h', '5h', 'Kh']), 3, 'three of one suit');
assert.equal(deng(['4s', '4d', '4c']), 5, 'Tong');
assert.equal(deng(['5h', '6h', '7h']), 3, 'a suited straight is just a straight');
assert.equal(deng(['5h', '6d', '7h']), 3);
assert.equal(deng(['Jh', 'Qd', 'Jc']), 3, 'three faces');

assert.equal(compare(['4s', '4d'], ['2c', '3d', '4h']), 2, 'Pok 8 beats a three-card straight, paid 2 deng');
assert.equal(compare(['8s', 'Kd'], ['9c', 'Qd']), -1, 'Pok 9 beats Pok 8');
assert.equal(compare(['8s', 'Kd'], ['8c', '8d', '2h']), 1, 'a three-card 8 loses to Pok 8');
assert.equal(compare(['8h', 'Kh'], ['8c', 'Qd']), 0, 'equal Pok is a tie, deng or not');
assert.equal(compare(['3s', '3d'], ['2c', '4h']), 0, 'equal score is a tie (เจ๊า)');
assert.equal(compare(['4s', '4d', '4c'], ['Qs', 'Kd', 'Ac']), 5, 'Tong over a straight');
assert.equal(compare(['5s', '6d', '7c'], ['Jc', 'Jd', 'Kh']), 3, 'straight over three faces');
assert.equal(compare(['Jc', 'Jd', 'Kh'], ['9c', 'Td', 'Ks']), 3, 'three faces over a plain 9');
assert.equal(compare(['4s', '5d', 'Kc'], ['2h', '7h']), -2, "a loss pays the dealer's deng");

// ------------------------------------------------ rounds
const config = { startingStack: 1000, minBet: 10, mustDraw: false };
/** Cards in the order dealt (the engine pops from the end). */
const stack = (...cards: Card[]): Card[] => [...cards].reverse();
function table(n: number, deck: Card[], mustDraw = false): GameState {
  let s = createGame('ABC123', { ...config, mustDraw }, 0);
  for (let i = 0; i < n; i++) s = addPlayer(s, `p${i}`, `P${i}`, 0);
  s = structuredClone(s);
  s.started = true;
  startRound(s, 0, deck);
  return s;
}
const act = (s: GameState, id: string, a: PlayerAction) => applyAction(s, id, a, 1);
const bet = (s: GameState, id: string, amount = 100, spot = 'seat') => act(s, id, { type: 'bet', amount, spot, ready: true });
const chips = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.chips;
const cards = (s: GameState, id: string) => handsOf(s, id)[0].cards;

{
  // The first seat deals; the others bet against them. p1 draws to 9, p2 stays on a 6 flush, the dealer (3) draws to 5.
  let s = table(3, stack('As', '4h', 'Tc', '4c', '2h', '3h', '4d', '2d'));
  assert.equal(s.bankerId, 'p0');
  assert.throws(() => bet(s, 'p0'), /doesn't bet/);
  s = bet(s, 'p1');
  s = bet(s, 'p2');
  assert.equal(s.phase, 'playing');
  assert.equal(s.activeId, 'p1');
  const view = maskFor(s, 'p1');
  assert.deepEqual(view.dealer, ['??', '??']);
  assert.deepEqual(cards(view, 'p2'), ['??', '??'], "other players' cards stay hidden");
  assert.deepEqual(cards(view, 'p1'), ['As', '4c']);
  assert.deepEqual(maskFor(s, 'p0').dealer, ['Tc', '3h'], 'the dealer sees their own cards');
  s = act(s, 'p1', { type: 'draw' });
  s = act(s, 'p2', { type: 'stay' });
  assert.equal(s.activeId, 'p0', "then it's the dealer's turn");
  s = act(s, 'p0', { type: 'draw' });
  assert.equal(s.phase, 'settled');
  assert.deepEqual(s.dealer, ['Tc', '3h', '2d']);
  assert.deepEqual(s.hands.map((h) => h.net), [100, 200], '9 and 6 beat 5; the flush pays 2 deng');
  assert.deepEqual([chips(s, 'p0'), chips(s, 'p1'), chips(s, 'p2')], [700, 1100, 1200], 'the dealer pays from their own chips');
  startRound(s, 2);
  assert.equal(s.bankerId, 'p1', 'the deal passes clockwise');
}
{
  // Catching (จับ): the dealer on 7 takes on the hand that drew, then draws against the one that stayed.
  let s = table(3, stack('9s', '5h', 'Tc', '3c', 'Td', '7h', 'Kd', '9c'));
  s = bet(s, 'p1');
  s = bet(s, 'p2');
  s = act(s, 'p1', { type: 'draw' }); // 9 3 K = 2
  s = act(s, 'p2', { type: 'stay' }); // 5 T = 5
  s = act(s, 'p0', { type: 'catch', cards: 3 });
  assert.equal(handsOf(s, 'p1')[0].outcome, 'lose', 'caught on two cards: 7 beats 2');
  assert.equal(handsOf(s, 'p2')[0].outcome, null);
  assert.deepEqual(maskFor(s, 'p2').dealer, ['Tc', '7h'], "a catch shows the dealer's cards");
  assert.throws(() => act(s, 'p0', { type: 'catch', cards: 2 }), /once/);
  s = act(s, 'p0', { type: 'draw' }); // T 7 9 = 6
  assert.equal(handsOf(s, 'p2')[0].outcome, 'lose', '6 beats 5');
  assert.equal(chips(s, 'p0'), 1200);
}
{
  // A dealer Pok settles everything at once; an equal Pok is a push.
  let s = table(3, stack('9s', 'Td', '4d', 'Th', '8h', '4s'));
  s = bet(s, 'p1');
  s = bet(s, 'p2');
  assert.equal(s.phase, 'settled');
  assert.equal(handsOf(s, 'p1')[0].outcome, 'win', 'Pok 9 beats a dealer Pok 8');
  assert.equal(handsOf(s, 'p2')[0].outcome, 'push', 'Pok 8 ties Pok 8');
}
{
  // Extra hands: p2 cuts in before p1 (ตัดขา) and sits one after the dealer (ขาบ๊วย).
  let s = table(3, stack('2s', '3s', '4s', '5s', '6s', '2h', '3h', '4h', '5h', '6h'));
  s = act(s, 'p2', { type: 'bet', amount: 20, spot: 'p1' });
  s = act(s, 'p2', { type: 'bet', amount: 30, spot: 'seat' });
  s = act(s, 'p2', { type: 'bet', amount: 40, spot: 'last' });
  assert.throws(() => act(s, 'p2', { type: 'bet', amount: 10, spot: 'seat' }), /3 hands/);
  assert.throws(() => act(s, 'p1', { type: 'bet', amount: 10, spot: 'p0' }), /cut in/);
  s = bet(s, 'p1');
  assert.equal(s.phase, 'betting', 'waits for p2 to finish');
  s = act(s, 'p2', { type: 'ready' });
  assert.deepEqual(s.hands.map((h) => `${h.owner}:${h.bet}:${h.cards.join('')}`), ['p2:20:2s2h', 'p1:100:3s3h', 'p2:30:4s4h', 'p2:40:6s6h']);
  assert.deepEqual(s.dealer, ['5s', '5h']);
}
{
  // The dealer's limit (อั้น) caps bets, and lowering it hands the excess back.
  let s = table(2, stack());
  s = act(s, 'p1', { type: 'bet', amount: 200, spot: 'seat' });
  s = act(s, 'p0', { type: 'limit', amount: 50 });
  assert.deepEqual([handsOf(s, 'p1')[0].bet, chips(s, 'p1')], [50, 950]);
  assert.throws(() => act(s, 'p1', { type: 'bet', amount: 60, spot: 'seat' }), /limit is 50/);
}
{
  // A dealer who runs dry pays winners in dealing order until the chips run out.
  let s = table(3, stack('7h', '7s', '2c', 'Kc', 'Qd', '3d'));
  s.players[0].chips = 150;
  s = bet(s, 'p1');
  s = bet(s, 'p2');
  s = act(s, 'p1', { type: 'stay' });
  s = act(s, 'p2', { type: 'stay' });
  s = act(s, 'p0', { type: 'stay' });
  assert.deepEqual(s.hands.map((h) => h.net), [100, 50]);
  assert.equal(chips(s, 'p0'), 0);
}
{
  // House rule: under 4 on two cards you must draw.
  let s = table(2, stack('2s', 'Tc', 'Ks', '5d', '9c'), true);
  s = bet(s, 'p1');
  assert.throws(() => act(s, 'p1', { type: 'stay' }), /must draw/);
  s = act(s, 'p1', { type: 'draw' });
  assert.equal(cards(s, 'p1').length, 3);
}
{
  // Alone, the app deals; a loser never pays more than they have.
  let s = table(1, stack('2s', '4h', 'Tc', '4d'));
  assert.equal(s.bankerId, null);
  s.players[0].chips = 250;
  s = bet(s, 'p0', 100);
  assert.equal(s.phase, 'settled', 'dealer Pok 8 ends it');
  assert.equal(chips(s, 'p0'), 50, 'a pair Pok takes 2 deng');
}
{
  // The dealer leaving before the deal hands bets back and passes the deal on.
  let s = table(3, stack());
  s = act(s, 'p1', { type: 'bet', amount: 100, spot: 'seat' });
  s = removePlayer(s, 'p0', 1);
  assert.deepEqual([s.phase, s.bankerId, chips(s, 'p1')], ['betting', 'p1', 1000]);
}
{
  // Bots bet on host ticks and play their hands; a dealer who times out plays by the house rule.
  let s = startGame(addBot(addPlayer(createGame('BOT001', config, 0), 'human', 'Human', 0), 0), 0);
  assert.equal(s.bankerId, 'human');
  s.deck = stack('2s', '8c', '3h', '5d', '9h');
  s = hostTick(s, 1001);
  assert.equal(handsOf(s, 'bot:1')[0].bet, config.minBet);
  assert.equal(s.activeId, 'bot:1');
  s = hostTick(s, 2001);
  assert.deepEqual([cards(s, 'bot:1').length, s.activeId], [2, 'human'], 'the bot stays on 5');
  s = hostTick(s, 2001 + TURN_MS);
  assert.deepEqual([s.phase, s.dealer.length], ['settled', 3], 'the dealer on 3 draws');
}
console.log('pok deng engine: all checks passed');
