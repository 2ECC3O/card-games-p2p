import type { Ball, GameState, Group, PlayerAction, Pocket, Side } from '../types/pool';
import { cleanName, isBot, update, addSpectator as watch } from '../../../shared/lobby';
export { cleanName, isBot, setConnected } from '../../../shared/lobby';
import { clearPosition, DROPS, R, shotMs, simulate } from './physics';

/** Time for each shot or break decision, counted from when the balls stop. */
export const SHOT_CLOCK_MS = 90_000;
/** How far a bot's cue can stray, in radians either way (0.01 ≈ 0.6°). Raise it for a weaker bot, lower it for a stronger one. */
const BOT_AIM_ERROR = 0.01;
/** How far a bot's power can stray, as a share of the power it meant. */
const BOT_POWER_ERROR = 0.15;
/** How long everyone sees a bot's aim and power before it shoots. */
export const BOT_AIM_MS = 2_500;
/** Visible rack outlook, not a calibrated probability: clearance and next shot only. */
export function rackOutlook(s: GameState, side: Side): number {
  if (s.phase === 'finished') return s.winner === side ? 100 : 0;
  if (!s.started) return 50;
  const cleared = (team: Side) => {
    const group = s.teams[team].group;
    return group ? 7 - s.balls.filter((b) => groupOf(b.n) === group).length : 0;
  };
  const lead = (cleared(side) - cleared(side === 0 ? 1 : 0)) * 5;
  const turn = s.turnTeam === side ? 7 : -7;
  return Math.max(5, Math.min(95, 50 + lead + turn));
}
const other = (side: Side): Side => side === 0 ? 1 : 0;
const groupOf = (n: number): Group => n >= 1 && n <= 7 ? 'solids' : n >= 9 && n <= 15 ? 'stripes' : null;
const members = (s: GameState, side: Side) => s.players.filter((p) => p.team === side);
const shooter = (s: GameState, side: Side) => { const team = members(s, side); return team[s.nextMember[side] % team.length]?.id ?? null; };
const available = (s: GameState) => s.mode === 'singles' ? 2 : 4;
const ready = (s: GameState) => members(s, 0).length === available(s) / 2 && members(s, 1).length === available(s) / 2;
const note = (s: GameState, message: string) => { s.lastEvent = message; s.history = [message, ...s.history].slice(0, 40); };

export function createGame(roomCode: string, mode: GameState['mode'], raceTo: number, now: number): GameState {
  return { roomCode, mode, raceTo, started: false, phase: 'waiting', rack: 0, balls: [], players: [], queue: [], spectators: [],
    teams: [{ group: null, racks: 0, shots: 0 }, { group: null, racks: 0, shots: 0 }], turnTeam: 0, activeId: null,
    nextMember: [0, 0], breakShot: true, ballInHand: null, choice: null, winner: null, lastEvent: '', history: [],
    lastShot: null, botShot: null, turnStartedAt: now, lastActionAt: now };
}

function seat(s: GameState, id: string, name: string) {
  const order: Side[] = [0, 1, 0, 1];
  const team = order[s.players.length];
  s.players.push({ id, name, team, connected: true });
}

export function addPlayer(state: GameState, id: string, rawName: string, now: number): GameState {
  if (isBot(id)) return state;
  return update(state, (s) => {
    s.lastActionAt = now;
    const name = cleanName(rawName);
    const known = s.players.find((p) => p.id === id) ?? s.queue.find((p) => p.id === id);
    s.spectators = s.spectators.filter((p) => p.id !== id);
    if (known) { known.name = name; known.connected = true; }
    else if (s.players.length < available(s) && !s.started) seat(s, id, name);
    else if (s.queue.length < 12) s.queue.push({ id, name, connected: true });
  });
}

/** Join to watch; a seated or queued player coming back this way stays a player. */
export const addSpectator = (state: GameState, id: string, name: string, now: number) => watch(state, id, name, now, addPlayer);

export function addBot(state: GameState, now: number): GameState {
  if (state.started || state.players.length >= available(state)) return state;
  return update(state, (s) => { addBotSeat(s); s.lastActionAt = now; });
}

function addBotSeat(s: GameState) {
  const number = Math.max(0, ...s.players.map((p) => Number(/^bot:(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
  seat(s, `bot:${number}`, `Bot ${number}`);
}

export function removePlayer(state: GameState, id: string, now: number): GameState {
  return update(state, (s) => {
    const seatIndex = s.players.findIndex((p) => p.id === id);
    if (seatIndex >= 0 && s.started && s.phase !== 'finished') {
      // ponytail: a bot inherits an abandoned seat so an active match never waits forever.
      const number = Math.max(0, ...s.players.map((p) => Number(/^bot:(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
      s.players[seatIndex] = { ...s.players[seatIndex], id: `bot:${number}`, name: `Bot ${number}`, connected: true };
      if (s.activeId === id) s.activeId = `bot:${number}`;
      note(s, `${s.players[seatIndex].name} takes the open seat.`);
    } else s.players = s.players.filter((p) => p.id !== id);
    s.queue = s.queue.filter((p) => p.id !== id);
    s.spectators = s.spectators.filter((p) => p.id !== id);
    if (s.activeId === id) s.activeId = null;
    s.lastActionAt = now;
  });
}

/** Same state shape as every other game: late players wait for a new match. */
export function rejoinQueue(state: GameState, id: string, name: string, now: number): GameState {
  if (state.players.some((p) => p.id === id) || state.queue.some((p) => p.id === id)) return state;
  return update(state, (s) => { s.queue.push({ id, name: cleanName(name), connected: true }); s.lastActionAt = now; });
}

function rackBalls(): Ball[] {
  const balls: Ball[] = [{ n: 0, x: 245, y: 250 }];
  const random = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
  for (const set of [solids, stripes]) for (let i = set.length - 1; i > 0; i--) { const j = random(i + 1); [set[i], set[j]] = [set[j], set[i]]; }
  const rest = [...solids.slice(1), ...stripes.slice(1)];
  for (let i = rest.length - 1; i > 0; i--) { const j = random(i + 1); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  // The 8 in the middle of the third row, a solid and a stripe in the back corners, the rest shuffled.
  const numbers = Array.from({ length: 15 }, (_, i) => (i === 4 ? 8 : i === 10 ? solids[0] : i === 14 ? stripes[0] : rest.pop()!));
  let index = 0;
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++)
    balls.push({ n: numbers[index++], x: 690 + row * (2 * R + 0.2), y: 250 + (col - row / 2) * (2 * R + 0.2) });
  return balls;
}

function startRack(s: GameState, now: number) {
  s.rack++;
  s.balls = rackBalls();
  s.teams[0].group = s.teams[1].group = null;
  s.turnTeam = ((s.rack - 1) % 2) as Side;
  s.nextMember = [Math.floor((s.rack - 1) / 2), Math.floor((s.rack - 1) / 2)];
  s.activeId = shooter(s, s.turnTeam);
  s.breakShot = true;
  s.ballInHand = 'head';
  s.choice = null;
  s.phase = 'aiming';
  s.turnStartedAt = now;
  note(s, `Rack ${s.rack}: ${s.players.find((p) => p.id === s.activeId)?.name ?? 'Player'} breaks.`);
}

export function startGame(state: GameState, now: number): GameState {
  if (state.started) return state;
  return update(state, (s) => {
    while (s.players.length < available(s)) addBotSeat(s); // ponytail: small built-in bot avoids a downloaded AI library.
    s.started = true;
    s.lastActionAt = now;
    startRack(s, now);
  });
}

function spotEight(s: GameState) {
  for (let x = 690; x >= 300; x -= 2 * R + 2) {
    if (clearPosition(s.balls, x, 250, 8)) { s.balls.push({ n: 8, x, y: 250 }); return; }
  }
  s.balls.push({ n: 8, x: 690, y: 250 });
}

function cueInHand(s: GameState, kind: 'head' | 'any') {
  s.ballInHand = kind;
  s.balls = s.balls.filter((b) => b.n !== 0);
  for (let x = kind === 'head' ? 245 : 500; x > R; x -= 2 * R + 3) {
    if (clearPosition(s.balls, x, 250)) { s.balls.push({ n: 0, x, y: 250 }); return; }
  }
  s.balls.push({ n: 0, x: 120, y: 250 });
}

function turn(s: GameState, side: Side, now: number) {
  s.turnTeam = side;
  s.activeId = shooter(s, side);
  s.phase = s.activeId ? 'aiming' : 'waiting';
  s.turnStartedAt = now;
}

function finishRack(s: GameState, winner: Side, now: number, reason: string) {
  s.teams[winner].racks++;
  note(s, `${members(s, winner).map((p) => p.name).join(' & ')} wins rack ${s.rack}: ${reason}`);
  s.winner = s.teams[winner].racks >= s.raceTo ? winner : null;
  s.phase = s.winner === null ? 'between' : 'finished';
  s.activeId = null;
  s.turnStartedAt = now;
}

function choose(s: GameState, action: Extract<PlayerAction, { type: 'choice' }>, now: number) {
  const choice = s.choice!;
  const { option } = action;
  const options = choice.type === 'illegal' ? ['accept', 'rebreak-self', 'rebreak-other']
    : choice.type === 'eight' ? ['spot', 'rebreak-self']
      : choice.type === 'eight-foul' ? ['spot', 'rebreak-self'] : ['accept', 'head'];
  if (!options.includes(option)) throw new Error('That break choice is unavailable');
  s.choice = null;
  if (option === 'rebreak-self' || option === 'rebreak-other') {
    s.rack--; // replay the same rack number
    startRack(s, now);
    if (option === 'rebreak-self') turn(s, choice.team, now);
    else turn(s, other(choice.team), now);
    s.breakShot = true;
    s.ballInHand = 'head';
    note(s, `${s.players.find((p) => p.id === s.activeId)?.name ?? 'Player'} re-breaks.`);
    return;
  }
  if (choice.type === 'eight' || choice.type === 'eight-foul') spotEight(s);
  turn(s, choice.team, now);
  if (option === 'head' || choice.type === 'eight-foul') cueInHand(s, 'head');
  else s.ballInHand = null;
  note(s, option === 'spot' ? 'The 8-ball is spotted.' : option === 'head' ? 'Cue ball in hand behind the head string.' : 'Table accepted in position.');
}

function playShot(s: GameState, action: Extract<PlayerAction, { type: 'shot' }>, now: number) {
  const { angle, power, tipX, tipY, ball, pocket, safety } = action;
  if (![angle, power, tipX, tipY].every(Number.isFinite) || power < 1 || power > 100 || Math.abs(tipX) > 1 || Math.abs(tipY) > 1)
    throw new Error('Invalid cue settings');
  if (!s.breakShot) {
    if (!safety && (!Number.isInteger(ball) || pocket === null || !Number.isInteger(pocket) || pocket < 0 || pocket > 5)) throw new Error('Call a ball and pocket, or choose Safety');
    if (!safety && !s.balls.some((b) => b.n === ball)) throw new Error('Called ball is no longer on the table');
    const assigned = s.teams[s.turnTeam].group;
    if (!safety && assigned && (s.balls.some((b) => groupOf(b.n) === assigned) ? groupOf(ball!) !== assigned : ball !== 8))
      throw new Error('Call a ball from your group, or the 8 after clearing it');
    if (!safety && !assigned && ball === 8) throw new Error('Choose a group before calling the 8');
  }
  const side = s.turnTeam, opponent = other(side);
  const beforeGroup = s.teams[side].group;
  const groupRemaining = beforeGroup ? s.balls.some((b) => groupOf(b.n) === beforeGroup) : true;
  // The host works out cos/sin once and shares them, so replays use the same numbers.
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  const shot = simulate(s.balls, { dirX, dirY, power, tipX, tipY });
  s.lastShot = { id: (s.lastShot?.id ?? 0) + 1, balls: s.balls, dirX, dirY, power, tipX, tipY, ms: shotMs(shot.steps) };
  s.balls = shot.balls;
  s.teams[side].shots++;
  s.nextMember[side]++;
  s.ballInHand = null;
  const scratch = shot.pocketed.some((p) => p.n === 0);
  const eight = shot.pocketed.find((p) => p.n === 8);
  const objectPocketed = shot.pocketed.some((p) => p.n > 0);
  const wrongFirst = shot.firstHit === null || (!s.breakShot && (beforeGroup
    ? (groupRemaining ? groupOf(shot.firstHit) !== beforeGroup : shot.firstHit !== 8)
    : shot.firstHit === 8));
  const foul = scratch || wrongFirst || (!s.breakShot && !objectPocketed && !shot.railAfter);
  if (s.breakShot) {
    s.breakShot = false;
    if (eight) {
      s.choice = { type: scratch ? 'eight-foul' : 'eight', team: scratch ? opponent : side };
      if (scratch) cueInHand(s, 'head');
      s.phase = 'choice'; s.activeId = shooter(s, s.choice.team); s.turnStartedAt = now;
      note(s, `8-ball pocketed on the break${scratch ? ' with a scratch' : ''}. Choose to spot it or re-break.`);
      return;
    }
    if (!objectPocketed && shot.breakRails < 4) {
      s.choice = { type: 'illegal', team: opponent };
      s.phase = 'choice'; s.activeId = shooter(s, opponent); s.turnStartedAt = now;
      note(s, 'Illegal break: fewer than four balls reached a rail.');
      return;
    }
    if (foul) {
      s.choice = { type: 'foul', team: opponent };
      s.phase = 'choice'; s.activeId = shooter(s, opponent); s.turnStartedAt = now;
      if (scratch) cueInHand(s, 'head');
      note(s, 'Break foul. Incoming team chooses the table or cue ball in hand.');
      return;
    }
    turn(s, objectPocketed ? side : opponent, now);
    note(s, objectPocketed ? 'Legal break. Table remains open.' : 'Legal dry break. Opponent shoots.');
    return;
  }
  if (eight) {
    if (foul || groupRemaining || ball !== 8 || pocket !== eight.pocket || safety) finishRack(s, opponent, now, '8-ball pocketed illegally');
    else finishRack(s, side, now, 'called 8-ball pocketed');
    return;
  }
  if (foul) {
    turn(s, opponent, now);
    cueInHand(s, 'any');
    note(s, scratch ? 'Scratch. Opponent has ball in hand.' : wrongFirst ? 'Wrong ball first. Opponent has ball in hand.' : 'No rail after contact. Opponent has ball in hand.');
    return;
  }
  const madeCall = !safety && shot.pocketed.some((p) => p.n === ball && p.pocket === pocket);
  if (madeCall && !beforeGroup && ball !== null) {
    s.teams[side].group = groupOf(ball);
    s.teams[opponent].group = groupOf(ball) === 'solids' ? 'stripes' : 'solids';
  }
  turn(s, madeCall ? side : opponent, now);
  note(s, safety ? 'Safety. Turn passes.' : madeCall ? `${ball} in the called pocket. Shooter continues.` : 'Called ball missed. Turn passes.');
}

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  if (now < s.turnStartedAt) throw new Error('Wait for the balls to stop');
  if (action.type === 'nextRack') {
    if (s.phase !== 'between' || !s.players.some((p) => p.id === id)) throw new Error('Next rack is unavailable');
    return startRack(s, now);
  }
  if (s.activeId !== id) throw new Error('It is not your turn');
  if (action.type === 'choice') {
    if (s.phase !== 'choice' || !s.choice) throw new Error('No break decision is pending');
    return choose(s, action, now);
  }
  if (s.phase !== 'aiming') throw new Error('Wait for your turn');
  if (action.type === 'place') {
    if (!s.ballInHand || !Number.isFinite(action.x) || !Number.isFinite(action.y)) throw new Error('Cue ball is not in hand');
    if (s.ballInHand === 'head' && action.x > 250 - R) throw new Error('Place behind the head string');
    if (!clearPosition(s.balls, action.x, action.y, 0)) throw new Error('Cue ball overlaps a ball or cushion');
    const cue = s.balls.find((b) => b.n === 0)!;
    cue.x = action.x; cue.y = action.y;
    return;
  }
  playShot(s, action, now);
  s.turnStartedAt = now + s.lastShot!.ms; // the next turn and its shot clock start once the balls stop on screen
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => { act(s, id, action, now); s.lastActionAt = now; });
}

type ShotAction = Extract<PlayerAction, { type: 'shot' }>;

function legalTargets(s: GameState) {
  const group = s.teams[s.turnTeam].group;
  return s.balls.filter((b) => b.n > 0 && (group ? (s.balls.some((x) => groupOf(x.n) === group) ? groupOf(b.n) === group : b.n === 8) : b.n !== 8));
}

/** No ball within a ball's width of the straight line from `from` to `to` (both of those are ignored). */
function clearLine(balls: Ball[], from: Ball, to: Ball) {
  const dx = to.x - from.x, dy = to.y - from.y, d2 = dx * dx + dy * dy;
  return balls.every((b) => {
    if (b.n === from.n || b.n === to.n) return true;
    const t = ((b.x - from.x) * dx + (b.y - from.y) * dy) / d2;
    return t <= 0 || t >= 1 || Math.abs((b.x - from.x) * dy - (b.y - from.y) * dx) / Math.sqrt(d2) >= 2 * R;
  });
}

/**
 * Bot: runs the most promising pots through the simulator and keeps one that goes in and leaves the cue ball a
 * clear next shot. With no pot on, it plays a safety that hides the cue ball. It then misses its line by a hair,
 * so it plays like a steady amateur rather than a machine.
 * ponytail: centre-ball hits only; spin for position would make it stronger.
 */
export function botAction(s: GameState): ShotAction {
  const cue = s.balls.find((b) => b.n === 0)!;
  const wobble = (rad: number) => (Math.random() - 0.5) * 2 * rad;
  const aim = (angle: number, power: number, call: Pick<ShotAction, 'ball' | 'pocket' | 'safety'>): ShotAction =>
    ({ type: 'shot', angle: angle + wobble(BOT_AIM_ERROR), power: Math.max(1, Math.min(100, Math.round(power * (1 + wobble(BOT_POWER_ERROR))))), tipX: 0, tipY: 0, ...call });
  if (s.breakShot) return { type: 'shot', angle: Math.atan2(250 + wobble(3) - cue.y, 690 - cue.x), power: 100, tipX: 0, tipY: 0, ball: null, pocket: null, safety: false };

  const targets = legalTargets(s);
  const legalFirst = (n: number | null) => targets.some((t) => t.n === n);
  const run = (angle: number, power: number) => simulate(s.balls, { dirX: Math.cos(angle), dirY: Math.sin(angle), power, tipX: 0, tipY: 0 });

  const tries: { angle: number; power: number; ball: Ball; pocket: Pocket; cost: number }[] = [];
  for (const ball of targets) for (let p = 0; p < DROPS.length; p++) {
    const [px, py] = DROPS[p];
    const tx = px - ball.x, ty = py - ball.y, td = Math.hypot(tx, ty);
    const ghost = { n: ball.n, x: ball.x - (tx / td) * 2 * R, y: ball.y - (ty / td) * 2 * R };
    const dx = ghost.x - cue.x, dy = ghost.y - cue.y, d = Math.hypot(dx, dy);
    const cut = (dx * tx + dy * ty) / (d * td); // cosine of the cut angle
    if (cut < 0.25 || !clearLine(s.balls, cue, ghost) || !clearLine(s.balls, ball, { n: -1, x: px, y: py })) continue;
    tries.push({ angle: Math.atan2(dy, dx), power: Math.min(85, 12 + (d + td) / 20), ball, pocket: p as Pocket, cost: d + td + (1 - cut) * 400 });
  }
  tries.sort((a, b) => a.cost - b.cost);
  let best: { angle: number; power: number; ball: number; pocket: Pocket; score: number } | null = null;
  for (const t of tries.slice(0, 10)) for (const power of [t.power, Math.min(100, t.power + 15)]) {
    const r = run(t.angle, power);
    if (!legalFirst(r.firstHit) || !r.pocketed.some((p) => p.n === t.ball.n && p.pocket === t.pocket)) continue;
    if (r.pocketed.some((p) => p.n === 0 || (p.n === 8 && t.ball.n !== 8))) continue;
    const group = s.teams[s.turnTeam].group ?? groupOf(t.ball.n);
    const left = r.balls.filter((b) => groupOf(b.n) === group);
    const next = r.balls.find((b) => b.n === 0)!;
    const open = (left.length ? left : r.balls.filter((b) => b.n === 8)).filter((b) => clearLine(r.balls, next, b)).length;
    const score = 10 * open - power / 10;
    if (!best || score > best.score) best = { angle: t.angle, power, ball: t.ball.n, pocket: t.pocket, score };
  }
  if (best) return aim(best.angle, best.power, { ball: best.ball, pocket: best.pocket, safety: false });

  let safe: { angle: number; power: number; score: number } | null = null;
  for (const ball of targets) for (const power of [20, 35]) {
    const angle = Math.atan2(ball.y - cue.y, ball.x - cue.x);
    const r = run(angle, power);
    const next = r.balls.find((b) => b.n === 0);
    const foul = !next || !legalFirst(r.firstHit) || r.pocketed.some((p) => p.n === 8) || (!r.railAfter && !r.pocketed.length);
    const score = (foul ? -100 : 0) - (next ? r.balls.filter((b) => b.n > 0 && clearLine(r.balls, next, b)).length : 0);
    if (!safe || score > safe.score) safe = { angle, power, score };
  }
  const fallback = s.balls.find((b) => b.n > 0)!;
  return safe ? aim(safe.angle, safe.power, { ball: null, pocket: null, safety: true })
    : aim(Math.atan2(fallback.y - cue.y, fallback.x - cue.x), 35, { ball: null, pocket: null, safety: true });
}

/** Shot clock ran out: a break decision takes its default; a shot is a foul, with ball in hand for the other team. */
function timeOut(s: GameState, now: number) {
  const name = s.players.find((p) => p.id === s.activeId)?.name ?? 'Player';
  if (s.phase === 'choice') {
    const type = s.choice!.type;
    choose(s, { type: 'choice', option: type === 'foul' ? 'head' : type === 'illegal' ? 'accept' : 'spot' }, now);
    note(s, `${name} ran out of time. ${s.lastEvent}`);
    return;
  }
  const side = s.turnTeam;
  s.nextMember[side]++;
  turn(s, other(side), now);
  cueInHand(s, s.breakShot ? 'head' : 'any');
  note(s, `${name} ran out of time. The other side has ball in hand${s.breakShot ? ' to break' : ''}.`);
}

export function hostTick(state: GameState, now: number): GameState {
  if (state.phase === 'between' && now - state.turnStartedAt > 6000 && ready(state)) return update(state, (s) => startRack(s, now));
  if (!state.activeId || now < state.turnStartedAt) return state;
  // Bot moves and timeouts don't count as room activity.
  if (isBot(state.activeId) && now - state.turnStartedAt > 900) {
    if (state.phase === 'choice') {
      const type = state.choice!.type;
      const option = type === 'illegal' ? 'rebreak-self' : type === 'foul' ? 'head' : 'spot';
      return update(state, (s) => act(s, s.activeId!, { type: 'choice', option }, now));
    }
    if (state.phase === 'aiming') {
      // First the bot lines up, so everyone can see its aim and power; then it shoots.
      const planned = state.botShot?.by === state.activeId ? state.botShot : null;
      if (!planned) return update(state, (s) => void (s.botShot = { by: s.activeId!, at: now, action: botAction(s) }));
      if (now - planned.at >= BOT_AIM_MS) return update(state, (s) => {
        s.botShot = null;
        act(s, s.activeId!, planned.action, now);
      });
    }
  }
  if (!isBot(state.activeId) && (state.phase === 'aiming' || state.phase === 'choice') && now - state.turnStartedAt > SHOT_CLOCK_MS)
    return update(state, (s) => timeOut(s, now));
  return state;
}
