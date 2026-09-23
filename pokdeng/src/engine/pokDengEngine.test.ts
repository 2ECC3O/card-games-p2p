import assert from 'node:assert/strict';
import { addBot, addPlayer, applyAction, compare, createGame, deng, handType, hostTick, maskFor, score, startGame, startRound, TURN_MS } from './pokDengEngine';
import type { Card, GameState, PlayerAction } from '../types/pokdeng';

// ------------------------------------------------ hands
assert.equal(score(['As', 'Kd']), 1);
assert.equal(score(['9s', '9d']), 8);
assert.equal(score(['7s', '5d', 'Tc']), 2);
assert.deepEqual(handType(['9s', 'Kd']), { rank: 5, name: 'Pok 9' });
assert.deepEqual(handType(['4s', '4d', '4c']), { rank: 4, name: 'Tong' });
assert.deepEqual(handType(['5h', '6h', '7h']), { rank: 3, name: 'Straight flush' });
assert.deepEqual(handType(['Qs', 'Kd', 'Ac']), { rank: 2, name: 'Straight' }, 'ace high');
assert.deepEqual(handType(['Ah', '2d', '3c']), { rank: 2, name: 'Straight' }, 'ace low');
assert.equal(handType(['Kh', 'Ad', '2c']).rank, 0, 'no wrap-around');
assert.deepEqual(handType(['Jh', 'Jd', 'Qc']), { rank: 1, name: 'Three faces' });
assert.equal(handType(['9s', '9d', 'Tc']).name, '8', 'three-card 8 is not a pok');
assert.equal(deng(['2h', '5h']), 2, 'two-card flush');
assert.equal(deng(['7s', '7d']), 2, 'pair');
assert.equal(deng(['2c', '5h']), 1);
assert.equal(deng(['2h', '5h', 'Kh']), 3, 'three-card flush');
assert.equal(deng(['4s', '4d', '4c']), 5);
assert.equal(deng(['5h', '6h', '7h']), 5);
assert.equal(deng(['5h', '6d', '7h']), 3);

// Pok beats a three-card 9; pok 9 beats pok 8; a win pays the winner's deng; a tie pays the deng difference.
assert.equal(compare(['4s', '4d'], ['2c', '3d', '4h']), 2, 'pok 8 pair beats 9, paid 2 deng');
assert.equal(compare(['8s', 'Kd'], ['9c', 'Qd']), -1);
assert.equal(compare(['4s', '5d', 'Kc'], ['2h', '7h']), -2, 'dealer 9 two-card flush');
assert.equal(compare(['5s', '6d', '7c'], ['9c', 'Td', 'Kh']), 3, 'straight beats points');
assert.equal(compare(['3s', '3d'], ['2c', '4h']), 1, 'equal 6: pair beats plain by one deng');
assert.equal(compare(['3s', '4d'], ['2c', '5h']), 0, 'exact tie');

// ------------------------------------------------ rounds
const config = { startingStack: 1000, minBet: 10 };
/** Cards in the order dealt (the engine pops from the end): each player, dealer, each player, dealer, then draws. */
const stack = (...cards: Card[]): Card[] => [...cards].reverse();
function table(n: number, deck: Card[]): GameState {
  let s = createGame('ABC123', config, 0);
  for (let i = 0; i < n; i++) s = addPlayer(s, `p${i}`, `P${i}`, 0);
  s = structuredClone(s);
  s.started = true;
  startRound(s, 0, deck);
  return s;
}
const act = (s: GameState, id: string, a: PlayerAction) => applyAction(s, id, a, 1);
const bet = (s: GameState, id: string, amount = 100) => act(s, id, { type: 'bet', amount });
const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

{
  // p0 draws to 9, p1 stays on a 6 flush, dealer 3 draws to 5.
  let s = table(2, stack('As', '4h', 'Tc', '4c', '2h', '3h', '4d', '2d'));
  s = bet(s, 'p0');
  assert.equal(s.phase, 'betting');
  s = bet(s, 'p1');
  assert.equal(s.phase, 'playing');
  assert.equal(s.activeId, 'p0');
  const view = maskFor(s, 'p0');
  assert.deepEqual(view.dealer, ['??', '??']);
  assert.deepEqual(player(view, 'p1').cards, ['??', '??'], "other players' cards stay hidden");
  assert.deepEqual(player(view, 'p0').cards, ['As', '4c']);
  assert.equal(view.deck.length, 0);
  s = act(s, 'p0', { type: 'draw' });
  assert.throws(() => act(s, 'p0', { type: 'draw' }), /Not your turn/);
  s = act(s, 'p1', { type: 'stay' });
  assert.equal(s.phase, 'settled');
  assert.deepEqual(s.dealer, ['Tc', '3h', '2d'], 'dealer draws on 4 or less');
  assert.deepEqual([player(s, 'p0').net, player(s, 'p0').chips], [100, 1100]);
  assert.deepEqual([player(s, 'p1').net, player(s, 'p1').chips], [200, 1200], '6 beats 5, flush pays 2 deng');
}
{
  // Dealer pok 8 (a pair) ends the round before anyone draws.
  let s = table(2, stack('9s', 'Tc', '4d', 'Th', 'Kh', '4s'));
  s = bet(s, 'p0');
  s = bet(s, 'p1');
  assert.equal(s.phase, 'settled');
  assert.equal(player(s, 'p0').outcome, 'win', 'pok 9 beats pok 8');
  assert.equal(player(s, 'p1').net, -200, 'a dealer pair pok takes 2 deng');
}
{
  // A loss is capped at what the player has.
  let s = table(1, stack('2s', '4h', 'Tc', '4d'));
  s.players[0].chips = 150;
  s = bet(s, 'p0');
  assert.deepEqual([s.phase, player(s, 'p0').chips], ['settled', 0]);
}
{
  // Bots bet on host ticks and draw on 4 or less; a timed-out player stays.
  let s = startGame(addBot(addPlayer(createGame('BOT001', config, 0), 'human', 'Human', 0), 0), 0);
  s.deck = stack('2s', '3h', '8c', '2c', '7d', '7h', '9h');
  s = hostTick(s, 1001);
  assert.equal(player(s, 'bot:1').bet, config.minBet);
  s = bet(s, 'human');
  assert.equal(s.activeId, 'human');
  s = hostTick(s, 1 + TURN_MS);
  assert.equal(s.activeId, 'bot:1', 'timeout stays');
  s = hostTick(s, 1 + TURN_MS + 1000);
  assert.equal(player(s, 'bot:1').cards.length, 3, 'bot on 0 draws');
  assert.equal(s.phase, 'settled');
}
console.log('pok deng engine: all checks passed');
