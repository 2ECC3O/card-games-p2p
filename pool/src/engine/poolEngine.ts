import type { Ball, GameState, Group, PlayerAction, Side } from '../types/pool';
import { clearPosition, R, simulate } from './physics';

export const MAX_SEATS = 4;
export const IDLE_MS = 5 * 60_000;
export const isBot = (id: string) => /^bot:\d+$/.test(id);
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
const update = (state: GameState, fn: (s: GameState) => void): GameState => { const s = structuredClone(state); fn(s); return s; };
const members = (s: GameState, side: Side) => s.players.filter((p) => p.team === side);
const shooter = (s: GameState, side: Side) => { const team = members(s, side); return team[s.nextMember[side] % team.length]?.id ?? null; };
const available = (s: GameState) => s.mode === 'singles' ? 2 : 4;
const ready = (s: GameState) => members(s, 0).length === available(s) / 2 && members(s, 1).length === available(s) / 2;
const note = (s: GameState, message: string) => { s.lastEvent = message; s.history = [message, ...s.history].slice(0, 40); };

export function cleanName(raw: unknown): string {
  return [...(typeof raw === 'string' ? raw : '').replace(/(?!\u200D)[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').trim()].slice(0, 20).join('').trim() || 'Player';
}

export function createGame(roomCode: string, mode: GameState['mode'], raceTo: number, now: number): GameState {
  return { roomCode, mode, raceTo, started: false, phase: 'waiting', rack: 0, balls: [], players: [], queue: [], spectators: [],
    teams: [{ group: null, racks: 0, shots: 0 }, { group: null, racks: 0, shots: 0 }], turnTeam: 0, activeId: null,
    nextMember: [0, 0], breakShot: true, ballInHand: null, choice: null, winner: null, lastEvent: '', history: [],
    turnStartedAt: now, lastActionAt: now };
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

export function addBot(state: GameState, now: number): GameState {
  if (state.started || state.players.length >= available(state)) return state;
  return update(state, (s) => { addBotSeat(s); s.lastActionAt = now; });
}

function addBotSeat(s: GameState) {
  const number = Math.max(0, ...s.players.map((p) => Number(/^bot:(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
  seat(s, `bot:${number}`, `Bot ${number}`);
}

export function addSpectator(state: GameState, id: string, rawName: string, now: number): GameState {
  if (state.players.some((p) => p.id === id) || state.queue.some((p) => p.id === id)) return addPlayer(state, id, rawName, now);
  return update(state, (s) => {
    s.lastActionAt = now;
    const p = s.spectators.find((p) => p.id === id);
    if (p) { p.name = cleanName(rawName); p.connected = true; }
    else s.spectators.push({ id, name: cleanName(rawName), connected: true });
  });
}

export function setConnected(state: GameState, id: string, connected: boolean): GameState {
  return update(state, (s) => { const p = [...s.players, ...s.queue, ...s.spectators].find((p) => p.id === id); if (p) p.connected = connected; });
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
  const numbers = [...solids.slice(1), ...stripes.slice(1), solids[0], stripes[0], 8];
  for (let i = numbers.length - 1; i > 0; i--) { const j = random(i + 1); [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; }
  numbers.splice(numbers.indexOf(8), 1); numbers.splice(4, 0, 8);
  numbers.splice(numbers.indexOf(solids[0]), 1); numbers.splice(10, 0, solids[0]);
  numbers.splice(numbers.indexOf(stripes[0]), 1); numbers.splice(14, 0, stripes[0]);
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
  const shot = simulate(s.balls, angle, power, tipX, tipY);
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
  return playShot(s, action, now);
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => { act(s, id, action, now); s.lastActionAt = now; });
}

/** Cheap ghost-ball bot: clear direct pot when possible, otherwise attempt the nearest legal ball. */
export function botAction(s: GameState): PlayerAction {
  const cue = s.balls.find((b) => b.n === 0)!;
  if (s.breakShot) return { type: 'shot', angle: Math.atan2(250 - cue.y, 690 - cue.x), power: 100, tipX: 0, tipY: 0, ball: null, pocket: null, safety: false };
  const group = s.teams[s.turnTeam].group;
  const targets = s.balls.filter((b) => b.n > 0 && (group ? (s.balls.some((x) => groupOf(x.n) === group) ? groupOf(b.n) === group : b.n === 8) : b.n !== 8));
  const pockets = [[0, 0], [500, 0], [1000, 0], [0, 500], [500, 500], [1000, 500]] as const;
  let best: { angle: number; ball: number; pocket: number; cost: number } | null = null;
  for (const target of targets) for (let p = 0; p < 6; p++) {
    const [px, py] = pockets[p], tx = px - target.x, ty = py - target.y, td = Math.hypot(tx, ty);
    const gx = target.x - tx / td * (2 * R + 1), gy = target.y - ty / td * (2 * R + 1);
    const dx = gx - cue.x, dy = gy - cue.y, distance = Math.hypot(dx, dy);
    if (!clearPosition(s.balls.filter((b) => b.n !== target.n), gx, gy, 0)) continue;
    const obstructed = s.balls.some((b) => b.n !== 0 && b.n !== target.n && ((b.x - cue.x) * dx + (b.y - cue.y) * dy) / (distance * distance) > 0
      && ((b.x - cue.x) * dx + (b.y - cue.y) * dy) / (distance * distance) < 1
      && Math.abs((b.x - cue.x) * dy - (b.y - cue.y) * dx) / distance < 2 * R);
    const cost = distance + td * 0.3 + (obstructed ? 500 : 0);
    if (!best || cost < best.cost) best = { angle: Math.atan2(dy, dx), ball: target.n, pocket: p, cost };
  }
  if (best) return { type: 'shot', angle: best.angle, power: Math.min(80, Math.max(35, best.cost / 12)), tipX: 0, tipY: 0,
    ball: best.ball, pocket: best.pocket as 0 | 1 | 2 | 3 | 4 | 5, safety: false };
  const target = targets[0] ?? s.balls.find((b) => b.n === 8)!;
  return { type: 'shot', angle: Math.atan2(target.y - cue.y, target.x - cue.x), power: 55, tipX: 0, tipY: 0,
    ball: target.n, pocket: 0, safety: false };
}

export function hostTick(state: GameState, now: number): GameState {
  if (state.phase === 'between' && now - state.turnStartedAt > 6000 && ready(state)) return update(state, (s) => startRack(s, now));
  if (state.activeId && isBot(state.activeId) && now - state.turnStartedAt > 900) {
    if (state.phase === 'choice') {
      const type = state.choice!.type;
      const option = type === 'illegal' ? 'rebreak-self' : type === 'foul' ? 'head' : 'spot';
      return update(state, (s) => act(s, s.activeId!, { type: 'choice', option }, now));
    }
    if (state.phase === 'aiming') return update(state, (s) => act(s, s.activeId!, botAction(s), now)); // bot ticks do not reset room idle time
  }
  return state;
}
