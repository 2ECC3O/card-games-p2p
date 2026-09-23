import assert from 'node:assert/strict';
import { addPlayer, applyAction, BOT_AIM_MS, botAction, createGame, hostTick, removePlayer, SHOT_CLOCK_MS, startGame } from './poolEngine';
import { FRAME_EVERY, preview, R, simulate, type Shot } from './physics';
import type { Ball, GameState } from '../types/pool';

// ------------------------------------------------ physics
const straight = (dirX: number, dirY: number, power: number, tipX = 0, tipY = 0): Shot => ({ dirX, dirY, power, tipX, tipY });
const cueOf = (balls: Ball[]) => balls.find((b) => b.n === 0)!;
const d = Math.SQRT1_2;

assert.deepEqual(simulate([{ n: 0, x: 160, y: 160 }, { n: 1, x: 60, y: 60 }], straight(-d, -d, 25)).pocketed, [{ n: 1, pocket: 0 }], 'corner pot');
assert.deepEqual(simulate([{ n: 0, x: 500, y: 200 }, { n: 1, x: 500, y: 60 }], straight(0, -1, 25)).pocketed, [{ n: 1, pocket: 1 }], 'side pot');
assert.equal(simulate([{ n: 0, x: 300, y: R }], straight(1, 0, 15)).pocketed.length, 0, 'a ball rolling along the rail passes the side pocket');

// Spin, 0.3 s after a full hit from 100 away: a centre hit stops dead, a low hit comes back, a high hit follows.
const spin = (tipY: number) => {
  let x = NaN, steps = 0;
  simulate([{ n: 0, x: 300, y: 250 }, { n: 1, x: 400, y: 250 }], straight(1, 0, 30, 0, tipY), (bodies, hit) => {
    if (hit === null) return;
    x = bodies[0].x;
    return ++steps >= 144;
  }, 1);
  return x;
};
assert.ok(Math.abs(spin(0) - 377) < 25, `stun: nearly stops (${spin(0)})`);
assert.ok(spin(-1) < spin(0) - 25, `draw comes back (${spin(-1)})`);
assert.ok(spin(1) > spin(0) + 25, `follow runs on (${spin(1)})`);
// Side spin bends a rebound: right english off the top rail comes back to the right.
const english = (tipX: number) => cueOf(simulate([{ n: 0, x: 300, y: 400 }], straight(0, -1, 20, tipX)).balls).x;
assert.ok(english(1) > 310 && english(-1) < 290 && Math.abs(english(0) - 300) < 1e-9, 'english');

// A replay (every 8 steps) ends exactly where the host's result does, and the same shot always settles the same way.
const rack: Ball[] = [{ n: 0, x: 245, y: 250 }];
for (let row = 0, n = 1; row < 5; row++) for (let c = 0; c <= row; c++) rack.push({ n: n++, x: 690 + row * (2 * R + 0.2), y: 250 + (c - row / 2) * (2 * R + 0.2) });
const breakShot = straight(1, 0.001, 100);
const result = simulate(rack, breakShot);
let last: Ball[] = [];
simulate(rack, breakShot, (bodies) => void (last = bodies.filter((b) => !b.down).map(({ n, x, y }) => ({ n, x, y }))), FRAME_EVERY);
assert.deepEqual(simulate(rack, breakShot), result, 'deterministic');
assert.deepEqual(last.length, result.balls.length);
assert.ok(result.breakRails >= 4 && result.balls.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)), 'a full break spreads the rack');

const guide = preview([{ n: 0, x: 300, y: 250 }, { n: 1, x: 400, y: 260 }], straight(1, 0, 30));
assert.equal(guide.hit?.n, 1);
assert.ok(guide.ghost && Math.abs(guide.ghost[0] - 380) < 3, 'ghost ball where the cue ball meets the 1');

// ------------------------------------------------ rules
const after = (s: GameState) => s.turnStartedAt + 1; // once the balls have stopped
let game = addPlayer(createGame('ABC123', 'doubles', 3, 0), 'alice', 'Alice', 0);
game = addPlayer(game, 'bob', 'Bob', 0);
game = startGame(game, 0);
assert.deepEqual(game.players.map((p) => p.team), [0, 1, 0, 1]);
assert.equal(game.balls.length, 16);
// The 8 always racks in the middle of the third row, whatever the shuffle.
for (let i = 0; i < 50; i++) {
  const rack8 = startGame(addPlayer(createGame('R', 'singles', 1, 0), 'a', 'A', 0), 0).balls.find((b) => b.n === 8)!;
  assert.deepEqual([rack8.x, rack8.y], [690 + 2 * (23 + .2), 250]);
}
assert.equal(game.activeId, 'alice');
assert.equal(game.ballInHand, 'head');
assert.equal(game.players.filter((p) => p.id.startsWith('bot:')).length, 2);
assert.throws(() => applyAction(game, 'bob', { type: 'shot', angle: 0, power: 50, tipX: 0, tipY: 0, ball: null, pocket: null, safety: false }, 1), /not your turn/);
assert.throws(() => applyAction(game, 'alice', { type: 'place', x: 500, y: 250 }, 1), /head string/);
game = applyAction(game, 'alice', { type: 'shot', angle: 0.001, power: 100, tipX: 0, tipY: 0, ball: null, pocket: null, safety: false }, 1);
assert.equal(game.lastShot?.id, 1);
assert.ok(game.turnStartedAt > 1000, 'the next turn waits for the balls to stop');
assert.throws(() => applyAction(game, game.activeId!, { type: 'place', x: 100, y: 100 }, 2), /balls to stop/);
assert.equal(game.activeId, game.balls.length < 16 ? 'alice' : 'bob', 'a dry break passes the turn');
assert.equal(game.teams[0].shots, 1);

// Shot clock: a human who runs out of time fouls; the other side gets ball in hand.
{
  const s = structuredClone(game);
  s.activeId = 'bob';
  s.turnTeam = 1;
  const late = hostTick(s, s.turnStartedAt + SHOT_CLOCK_MS + 1);
  assert.equal(late.turnTeam, 0);
  assert.equal(late.ballInHand, 'any');
  assert.match(late.lastEvent, /ran out of time/);
  assert.equal(late.lastActionAt, s.lastActionAt, "a timeout isn't room activity");
  assert.equal(hostTick(s, s.turnStartedAt + SHOT_CLOCK_MS - 1), s, 'still on the clock');
}

game = removePlayer(game, 'bob', after(game));
assert.equal(game.players.length, 4);
assert.ok(game.players.some((p) => p.team === 1 && p.id.startsWith('bot:')));
// A bot lines up first, so everyone can see its aim and power, and shoots only after BOT_AIM_MS.
{
  const bot = game.activeId!;
  let s = hostTick(game, after(game) + 1000);
  assert.equal(s.botShot?.by, bot, 'the bot shows its shot');
  assert.equal(s.lastShot?.id, game.lastShot?.id, "and hasn't played it yet");
  assert.equal(hostTick(s, after(game) + 1000 + BOT_AIM_MS - 1), s, 'still lining up');
  s = hostTick(s, after(game) + 1000 + BOT_AIM_MS);
  assert.equal(s.lastShot?.id, (game.lastShot?.id ?? 0) + 1, 'then it shoots');
  assert.equal(s.botShot, null);
}
for (let i = 0, time = after(game) + 1000; i < 40 && game.phase !== 'finished'; i++, time = (game.botShot ? game.botShot.at + BOT_AIM_MS : after(game) + 1000)) game = hostTick(game, time);
assert.ok(game.players.length === 4);

// Scotch doubles: a continuing turn passes to the teammate.
let doubles = createGame('DEF456', 'doubles', 3, 0);
for (const id of ['alice', 'bob', 'amy', 'ben']) doubles = addPlayer(doubles, id, id, 0);
doubles = startGame(doubles, 0);
doubles.balls = [{ n: 0, x: 800, y: 15 }, { n: 1, x: 945, y: 15 }, { n: 8, x: 600, y: 300 }];
doubles.breakShot = false;
doubles.ballInHand = null;
doubles.teams[0].group = 'solids';
doubles.teams[1].group = 'stripes';
doubles = applyAction(doubles, 'alice', { type: 'shot', angle: 0, power: 20, tipX: 0, tipY: -1, ball: 1, pocket: 2, safety: false }, 1);
assert.equal(doubles.activeId, 'amy', 'Scotch doubles passes a continuing turn to the teammate');
assert.ok(!doubles.balls.some((b) => b.n === 1));

// The bot finds and makes an easy pot.
{
  const s = structuredClone(doubles);
  s.balls = [{ n: 0, x: 300, y: 300 }, { n: 2, x: 150, y: 150 }, { n: 8, x: 700, y: 400 }, { n: 12, x: 800, y: 100 }];
  const random = Math.random;
  Math.random = () => 0.5; // no wobble: the bot's own choice, played straight
  const shot = botAction(s);
  Math.random = random;
  assert.deepEqual([shot.ball, shot.pocket, shot.safety], [2, 0, false]);
  const played = applyAction(s, 'amy', shot, after(s));
  assert.ok(!played.balls.some((b) => b.n === 2), 'bot pots the 2');
}
console.log('pool engine: all checks passed');
