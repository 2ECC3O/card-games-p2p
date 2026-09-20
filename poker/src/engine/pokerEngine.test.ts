import assert from 'node:assert/strict';
import pokersolver from 'pokersolver';
import type { Card, GameState } from '../types/poker';
import { handEquity } from './equity';
import {
  addBot, addPlayer, addSpectator, applyAction, buildPots, cleanName, createGame, hostTick, legalActions, maskFor, MAX_QUEUE, MAX_SEATS,
  rejoinQueue, removePlayer, startGame, startHand, TURN_MS,
} from './pokerEngine';

const config = { startingStack: 1000, blindLevels: [{ small: 10, big: 20 }], handsPerLevel: 10 };
const total = (s: GameState) => s.players.reduce((n, p) => n + p.chips + p.committed, 0);

function lobby(n: number, stacks?: number[]) {
  let s = createGame('TEST01', config, 0);
  for (let i = 0; i < n; i++) s = addPlayer(s, `p${i}`, `P${i}`, 0);
  if (stacks) s.players.forEach((p, i) => (p.chips = stacks[i]));
  return s;
}
const table = (n: number) => startGame(lobby(n), 0);
/** Started game with p0 on the button. */
function dealt(stacks: number[]) {
  const s = lobby(stacks.length, stacks);
  s.started = true;
  startHand(s, 0);
  return s;
}
const id = (s: GameState) => s.activeId!;

// A single human starts against an automatically seated bot; extra bots take ordinary seats and act on host ticks.
{
  let s = startGame(lobby(1), 0);
  assert.equal(s.players.length, 2);
  assert.equal(s.players[1].id, 'bot:1');
  assert.equal(s.phase, 'preflop');
  for (let step = 0; step < 90 && s.phase !== 'showdown'; step++) {
    const who = id(s);
    if (who.startsWith('bot:')) s = hostTick(s, step * 500);
    else s = applyAction(s, who, legalActions(s, who).canCheck ? { type: 'check' } : { type: 'call' }, step * 500);
  }
  assert.equal(s.phase, 'showdown', 'bot turns do not stall a solo hand');
  s.players.find((p) => p.id === 'bot:1')!.chips = 0;
  s = hostTick(s, s.nextHandAt! + 1);
  assert.ok((s.players.find((p) => p.id === 'bot:1')?.chips ?? 0) >= 980, 'busted bot rebuys and posts a blind');
  assert.equal(addBot(lobby(2), 1).players.length, 3);
  assert.equal(startGame(createGame('TEST01', config, 0), 1).started, false);
}

// Live odds are exact on a complete board, divide ties, and estimate only missing cards.
{
  const players = [{ id: 'a', hole: ['As', 'Ah'] as Card[] }, { id: 'b', hole: ['Ks', 'Kh'] as Card[] }];
  assert.deepEqual(handEquity(players, ['2c', '3d', '4h', '8s', '9c']), { a: 1, b: 0 });
  assert.deepEqual(handEquity(players, ['2c', '3d', '4h', '5s', '6c']), { a: 0.5, b: 0.5 });
  const odds = handEquity(players, [], 300);
  assert.deepEqual(handEquity(players, [], 300), odds, 'different spectator tabs get the same estimate');
  assert.ok(odds.a > 0.6 && odds.a < 0.95, `aces should be favoured: ${odds.a}`);
  assert.ok(Math.abs(odds.a + odds.b - 1) < 0.001);
}

// Heads-up: the dealer posts the small blind and acts first; the big blind keeps the option.
{
  let s = table(2);
  const dealer = s.players.find((p) => p.seat === s.dealerSeat)!;
  assert.equal(dealer.bet, 10);
  assert.equal(s.activeId, dealer.id);
  s = applyAction(s, id(s), { type: 'call' }, 1);
  assert.equal(s.phase, 'preflop', 'big blind still has the option');
  s = applyAction(s, id(s), { type: 'check' }, 2);
  assert.equal(s.phase, 'flop');
  assert.equal(s.board.length, 3);
  assert.notEqual(s.activeId, dealer.id, 'big blind acts first after the flop');
}

// Side pots: 100 / 300 / 1000 all-in; short stack has the best hand, middle the second best.
{
  let s = dealt([100, 300, 1000]);
  const hole: Record<string, Card[]> = { p0: ['As', 'Ah'], p1: ['Ks', 'Kh'], p2: ['2c', '7d'] };
  s.players.forEach((p) => (p.hole = hole[p.id]));
  s.deck = ['3h', '4d', '9s', 'Jc', 'Qd'] as Card[]; // board (dealt with pop)
  const before = total(s);
  while (s.phase !== 'showdown') {
    const legal = legalActions(s, id(s));
    s = applyAction(s, id(s), legal.canRaise ? { type: 'raise', amount: legal.maxRaiseTo } : { type: 'call' }, 1);
  }
  const chips = Object.fromEntries(s.players.map((p) => [p.id, p.chips]));
  assert.deepEqual(chips, { p0: 300, p1: 400, p2: 700 });
  assert.equal(s.pots.length, 2);
  assert.equal(s.players.reduce((n, p) => n + p.chips, 0), before);
}

// Four-way pots: two all-ins at different levels plus a folded player's chips.
{
  const pots = buildPots([
    { id: 'a', committed: 100, folded: false }, // all-in
    { id: 'b', committed: 300, folded: false }, // all-in
    { id: 'c', committed: 500, folded: false },
    { id: 'd', committed: 200, folded: true },
    { id: 'e', committed: 500, folded: false },
  ]);
  assert.deepEqual(pots, [
    { amount: 500, eligible: ['a', 'b', 'c', 'e'] }, // 100 from each of the five
    { amount: 700, eligible: ['b', 'c', 'e'] }, // 200 from b, c, e plus d's other 100
    { amount: 400, eligible: ['c', 'e'] },
  ]);
  assert.deepEqual(buildPots([{ id: 'a', committed: 0, folded: false }]), [], 'nothing in the middle yet');
}

// Side pots at showdown: a 4-way hand where the shortest all-in wins the main pot, a mid stack wins the
// first side pot, a big stack the second side pot, and a folded player's chips stay in the pots.
{
  let s = dealt([1000, 150, 400, 1000]); // p0 dealer, p1 SB, p2 BB, p3 first to act
  const hole: Record<string, Card[]> = { p0: ['2c', '7d'], p1: ['As', 'Ah'], p2: ['Ks', 'Kh'], p3: ['Qs', 'Qh'] };
  s.players.forEach((p) => (p.hole = hole[p.id]));
  s.deck = ['3h', '4d', '9s', 'Jc', '8d'] as Card[];
  const before = total(s);
  s = applyAction(s, 'p3', { type: 'raise', amount: 600 }, 1);
  s = applyAction(s, 'p0', { type: 'call' }, 1);
  s = applyAction(s, 'p1', { type: 'call' }, 1); // all-in 150
  s = applyAction(s, 'p2', { type: 'call' }, 1); // all-in 400
  assert.equal(s.phase, 'flop');
  s = applyAction(s, 'p3', { type: 'raise', amount: 100 }, 1);
  s = applyAction(s, 'p0', { type: 'fold' }, 1); // leaves 600 in the pots
  assert.equal(s.phase, 'showdown', 'nobody left to bet against p3, so the board runs out');
  assert.deepEqual(
    s.pots.map((p) => [p.amount, p.eligible, p.winners]),
    [
      [600, ['p1', 'p2', 'p3'], ['p1']], // 150 x 4
      [750, ['p2', 'p3'], ['p2']], // 250 from p2, p3, p0
      [400, ['p3'], ['p3']], // p3's uncalled 100 went back; 200 each from p3 and p0 above 400
    ],
  );
  const chips = Object.fromEntries(s.players.map((p) => [p.id, p.chips]));
  assert.deepEqual(chips, { p0: 400, p1: 600, p2: 750, p3: 800 });
  assert.equal(s.players.reduce((n, p) => n + p.chips, 0), before);
}

// A short all-in raise must be called but does not reopen raising for players who already acted.
{
  let s = dealt([1000, 1000, 45]); // p0 dealer, p1 SB, p2 BB (20 posted, 25 behind)
  s = applyAction(s, 'p0', { type: 'raise', amount: 40 }, 1);
  s = applyAction(s, 'p1', { type: 'call' }, 1);
  s = applyAction(s, 'p2', { type: 'raise', amount: 45 }, 1); // all-in, only 5 more
  assert.equal(s.activeId, 'p0');
  assert.equal(legalActions(s, 'p0').canRaise, false);
  assert.equal(legalActions(s, 'p0').callAmount, 5);
  assert.throws(() => applyAction(s, 'p0', { type: 'raise', amount: 100 }, 1));
}

// Views hide the deck and opponents' cards; timeouts check or fold.
{
  let s = table(3);
  const view = maskFor(s, 'p1');
  assert.equal(view.deck.length, 0);
  assert.ok(view.players.every((p) => (p.id === 'p1') === (p.hole[0] !== '??')));
  const who = id(s);
  s = hostTick(s, s.turnDeadline! + 1);
  assert.equal(s.players.find((p) => p.id === who)!.folded, true);
  assert.equal(hostTick(s, 5), s, 'no-op tick returns the same object');
}

// A full table seats 10; the 11th player waits in the queue.
{
  const s = addPlayer(lobby(10), 'p10', 'P10', 0);
  assert.equal(s.players.length, 10);
  assert.deepEqual(s.queue.map((q) => q.id), ['p10']);
}

// Random play at a full 10-seat table never creates or destroys chips, and busted players can rejoin.
{
  let s = table(10);
  let now = 0;
  const chipsInPlay = () => s.players.reduce((n, p) => n + p.chips + p.committed, 0);
  let expected = chipsInPlay();
  for (let step = 0; step < 20000 && s.handNumber < 400; step++) {
    now += 100;
    if (s.activeId) {
      const legal = legalActions(s, s.activeId);
      const r = Math.random();
      const action =
        r < 0.15 ? { type: 'fold' as const }
        : r < 0.3 && legal.canRaise ? { type: 'raise' as const, amount: legal.maxRaiseTo }
        : r < 0.5 && legal.canRaise ? { type: 'raise' as const, amount: legal.minRaiseTo }
        : legal.canCheck ? { type: 'check' as const } : { type: 'call' as const };
      s = r > 0.995 ? hostTick(s, now + TURN_MS) : applyAction(s, s.activeId, action, now);
    } else {
      if (s.phase === 'showdown') {
        for (const p of s.players.filter((p) => p.chips === 0)) {
          const next = rejoinQueue(s, p.id, p.name, now);
          if (next !== s) expected += config.startingStack;
          s = next;
        }
      }
      s = hostTick(s, now + 10_000);
    }
    assert.ok(s.players.every((p) => p.chips >= 0));
    if (s.phase !== 'showdown') assert.equal(chipsInPlay(), expected, `hand ${s.handNumber}`);
  }
  assert.ok(s.handNumber >= 100, `played ${s.handNumber} hands`);
}

// Leaving mid-hand folds you; if one player remains they win.
{
  let s = table(2);
  const other = s.players.find((p) => p.id !== s.activeId)!.id;
  s = removePlayer(s, other, 1);
  assert.equal(s.phase, 'showdown');
  assert.deepEqual(s.pots[0].winners, [s.players.find((p) => p.id !== other)!.id]);
  assert.deepEqual(s.players.map((p) => [p.handsPlayed, p.handsWon]), s.players.map((p) => [1, p.id === s.pots[0].winners[0] ? 1 : 0]));
  const winner = s.pots[0].winners[0];
  s.players.find((p) => p.id === winner)!.chips = 0;
  s = rejoinQueue(s, winner, 'Winner', 2);
  startHand(s, 3);
  assert.deepEqual([s.players.find((p) => p.id === winner)?.handsPlayed, s.players.find((p) => p.id === winner)?.handsWon], [1, 1], 'rebuy keeps the hand record');
}

// Names: invisible and text-reversing characters are removed, emoji sequences survive, 20 characters max.
{
  const u = (hex: string) => String.fromCodePoint(parseInt(hex, 16));
  assert.equal(cleanName('  Amara  '), 'Amara');
  assert.equal(cleanName('Ev' + u('202E') + 'il'), 'Evil', 'right-to-left override');
  assert.equal(cleanName('Ze' + u('200B') + 'ro' + u('2066') + u('0000')), 'Zero', 'zero-width, isolate, NUL');
  const family = u('1F468') + u('200D') + u('1F469');
  assert.equal(cleanName('Fam ' + family), 'Fam ' + family, 'zero-width joiner kept');
  assert.equal(cleanName('x'.repeat(40)).length, 20);
  assert.equal(cleanName(u('200B') + u('200E')), 'Player');
  assert.equal(cleanName(42), 'Player');
  const s = addPlayer(createGame('T', config, 0), 'p0', 'Ev' + u('202E') + 'il', 0);
  assert.equal(s.players[0].name, 'Evil', 'the engine cleans names itself');
}

// The waiting queue is capped, so a flood of joins can't grow the game state without limit.
{
  let s = lobby(MAX_SEATS);
  for (let i = 0; i < MAX_QUEUE + 15; i++) s = addPlayer(s, `q${i}`, `Q${i}`, 0);
  assert.equal(s.players.length, MAX_SEATS);
  assert.equal(s.queue.length, MAX_QUEUE);
  assert.equal(addPlayer(s, 'p3', 'Renamed', 1).players[3].name, 'Renamed', 'known players can still reconnect');
}

// Hand ranking (pokersolver has had no release since 2020, so pin down the rankings the game relies on).
{
  const { Hand } = pokersolver;
  const board = (cards: string) => cards.split(' ');
  const winner = (a: string, b: string) => {
    const [ha, hb] = [Hand.solve(board(a)), Hand.solve(board(b))];
    const w = Hand.winners([ha, hb]);
    return w.length === 2 ? 'tie' : w[0] === ha ? 'a' : 'b';
  };
  const ladder = [
    'Ah Kh Qh Jh Th 2c 3d', // royal flush
    '9s 8s 7s 6s 5s Kd 2c', // straight flush
    'Qc Qd Qh Qs 2d 3c 4h', // four of a kind
    'Jc Jd Jh 4s 4d 2c 7h', // full house
    'Ad 9d 7d 4d 2d Kc Qs', // flush
    '9c 8d 7h 6s 5d Ac 2h', // straight
    '7c 7d 7h Ks 2d 4c 9h', // three of a kind
    'Kc Kd 5h 5s 2d 3c 9h', // two pair
    'Ac Ad 9h 6s 2d 3c 8h', // one pair
    'Ac Qd 9h 6s 2d 3c 8h', // high card
  ];
  for (let i = 0; i + 1 < ladder.length; i++) assert.equal(winner(ladder[i], ladder[i + 1]), 'a', `${ladder[i]} beats ${ladder[i + 1]}`);
  assert.equal(winner('5c 4d 3h 2s Ad Kc 9h', '6c 5d 4h 3s 2d Kc 9h'), 'b', 'wheel (5-high straight) loses to 6-high straight');
  assert.equal(winner('Ac Ad Kh 9s 2d 3c 4h', 'As Ah Qh 9c 2c 3d 4s'), 'a', 'pair of aces with king kicker');
  assert.equal(winner('As Kd 9h 8s 7d 7c 7h', 'Ac Kh 9d 8c 7d 7c 7h'), 'tie', 'same best five cards split the pot');
  assert.equal(Hand.solve(board('Ah Kh Qh Jh Th 2c 3d')).descr, 'Royal Flush');
}

// A tied showdown splits the pot, with the odd chip to the first winner left of the button.
{
  let s = dealt([1000, 1000, 1000]); // p0 dealer, p1 SB, p2 BB
  const hole: Record<string, Card[]> = { p0: ['2c', '3d'], p1: ['Ac', 'Kd'], p2: ['As', 'Kh'] };
  s.players.forEach((p) => (p.hole = hole[p.id]));
  s.deck = ['4s', '5h', 'Qc', 'Jd', 'Th'] as Card[]; // board T J Q 5 4: both A-K make a broadway straight
  s = applyAction(s, 'p0', { type: 'raise', amount: 55 }, 1);
  s = applyAction(s, 'p1', { type: 'call' }, 1);
  s = applyAction(s, 'p2', { type: 'call' }, 1);
  while (s.phase !== 'showdown') s = applyAction(s, id(s), { type: 'check' }, 1);
  assert.deepEqual(s.pots.map((p) => [p.amount, p.winners]), [[165, ['p1', 'p2']]]);
  assert.deepEqual(s.players.map((p) => p.chips), [945, 1028, 1027], 'odd chip to p1, first left of the button');
  assert.deepEqual(s.players.map((p) => [p.handsPlayed, p.handsWon]), [[1, 0], [1, 1], [1, 1]], 'a split pot counts as one win for each winner');
}

// ------------------------------------------------ spectators
{
  let s = addSpectator(lobby(2), 'w', 'Watcher', 0);
  assert.equal(s.players.length, 2, 'watching takes no seat');
  assert.deepEqual(s.spectators.map((w) => w.id), ['w']);
  s = startGame(s, 0);
  assert.ok(maskFor(s, 'w').players.every((p) => p.hole.every((c) => c !== '??')), 'spectators see every hole card');
  assert.deepEqual(maskFor(s, 'w').deck, [], 'but never the deck');
  assert.ok(maskFor(s, 'p0').players[1].hole.every((c) => c === '??'), 'players still do not');
  assert.throws(() => applyAction(s, 'w', { type: 'fold' }, 1));
  assert.equal(rejoinQueue(s, 'w', 'Watcher', 1), s, 'spectators do not queue for a seat');
  assert.equal(addSpectator(s, 'p0', 'P0', 1).spectators.length, 1, 'a player who comes back to watch stays a player');
  s = removePlayer(s, 'w', 1);
  assert.equal(s.spectators.length, 0);
}

console.log('pokerEngine: all checks passed');
