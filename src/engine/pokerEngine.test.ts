import assert from 'node:assert/strict';
import type { Card, GameState } from '../types/poker';
import {
  addPlayer, applyAction, createGame, hostTick, legalActions, maskFor, rejoinQueue, removePlayer, startGame,
  startHand, TURN_MS,
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

// Random play never creates or destroys chips, and busted players can rejoin.
{
  let s = table(6);
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
}

console.log('pokerEngine: all checks passed');
