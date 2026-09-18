import type { GameState, Player, PlayerAction, Spot, TableConfig } from '../types/roulette';

export const MAX_SEATS = 10;
export const MAX_QUEUE = 20;
export const BET_MS = 25_000;
/** The wheel spins this long on every screen before the result shows. */
export const SPIN_MS = 6_000;
export const SETTLE_MS = 6_000;
export const IDLE_MS = 5 * 60_000;
const HISTORY = 15;

// ------------------------------------------------ the wheel

/** Single-zero (European) wheel, pockets clockwise from 0. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3'] as const;
export const SPOTS: readonly Spot[] = [...Array.from({ length: 37 }, (_, n) => `n${n}` as Spot), ...OUTSIDE];
const VALID = new Set<string>(SPOTS);

/** Chips returned per chip staked when `n` comes up (stake included): 36 for a number, 3 for a dozen or column, 2 for even money, else 0. */
export function payoutMultiple(spot: Spot, n: number): number {
  if (spot[0] === 'n') return Number(spot.slice(1)) === n ? 36 : 0;
  if (n === 0) return 0; // zero loses every outside bet
  switch (spot) {
    case 'red': return RED.has(n) ? 2 : 0;
    case 'black': return RED.has(n) ? 0 : 2;
    case 'odd': return n % 2 ? 2 : 0;
    case 'even': return n % 2 ? 0 : 2;
    case 'low': return n <= 18 ? 2 : 0;
    case 'high': return n > 18 ? 2 : 0;
    case 'd1': case 'd2': case 'd3': return Math.ceil(n / 12) === Number(spot[1]) ? 3 : 0;
    default: return ((n - 1) % 3) + 1 === Number(spot[1]) ? 3 : 0; // columns
  }
}

/** Unbiased crypto-random integer in [0, n). */
function randomInt(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

// ------------------------------------------------ helpers

const update = (state: GameState, fn: (s: GameState) => void): GameState => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);

export const staked = (bets: Player['bets']) => Object.values(bets).reduce<number>((n, v) => n + (v ?? 0), 0);

function seat(s: GameState, id: string, name: string, chips: number, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  s.players.push({ id, name, seat: free, chips, bets: {}, lastBets: {}, done: false, payout: 0, connected });
  s.players.sort((a, b) => a.seat - b.seat);
}

/**
 * Display names as shown to everyone: invisible and control characters removed (they can reverse or hide
 * text next to the name), whitespace trimmed, at most 20 characters. Zero-width joiners stay, so emoji
 * sequences still render. Empty result: "Player".
 */
export function cleanName(name: unknown): string {
  const text = typeof name === 'string' ? name : '';
  return [...text.replace(/(?!\u200D)[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').trim()].slice(0, 20).join('').trim() || 'Player';
}

// ------------------------------------------------ lobby

export function createGame(roomCode: string, config: TableConfig, now: number): GameState {
  return {
    roomCode, config, started: false, phase: 'waiting', round: 0, players: [], queue: [], spectators: [], result: null, history: [],
    deadline: null, nextRoundAt: null, lastActionAt: now,
  };
}

/** Seat before the game starts; afterwards (or when full) join the queue for the next round. */
export function addPlayer(state: GameState, id: string, rawName: string, now: number): GameState {
  const name = cleanName(rawName);
  if (!find(state, id) && !state.queue.some((q) => q.id === id) && state.queue.length >= MAX_QUEUE && (state.started || state.players.length >= MAX_SEATS))
    return state; // table and queue full
  return update(state, (s) => {
    s.lastActionAt = now;
    s.spectators = s.spectators.filter((w) => w.id !== id); // a spectator taking a seat
    const known = find(s, id) ?? s.queue.find((q) => q.id === id);
    if (known) {
      known.name = name;
      known.connected = true;
    } else if (!s.started && s.players.length < MAX_SEATS) {
      seat(s, id, name, s.config.startingStack, true);
    } else {
      s.queue.push({ id, name, connected: true });
    }
  });
}

export function setConnected(state: GameState, id: string, connected: boolean): GameState {
  return update(state, (s) => {
    const p = find(s, id) ?? s.queue.find((q) => q.id === id) ?? s.spectators.find((w) => w.id === id);
    if (p) p.connected = connected;
  });
}

/** Can't cover the table minimum, and has nothing riding on the current round. */
export const isBroke = (s: GameState, p: Player) => p.chips < s.config.minBet && !(s.phase === 'betting' && staked(p.bets) > 0);

/** Broke players ask to be dealt back in with a fresh stack. */
export function rejoinQueue(state: GameState, id: string, name: string, now: number): GameState {
  const p = find(state, id);
  if (!state.started || isSpectator(state, id) || state.queue.length >= MAX_QUEUE || state.queue.some((q) => q.id === id)) return state;
  if (p && !isBroke(state, p)) return state;
  return update(state, (s) => {
    s.lastActionAt = now;
    s.queue.push({ id, name: cleanName(name), connected: true });
  });
}

export function removePlayer(state: GameState, id: string, now: number): GameState {
  return update(state, (s) => {
    s.queue = s.queue.filter((q) => q.id !== id);
    s.spectators = s.spectators.filter((w) => w.id !== id);
    s.players = s.players.filter((p) => p.id !== id); // their chips on the table go with them
    if (s.phase === 'betting') spinIfAllDone(s, now);
  });
}

/** Watching the table, not playing. */
export const isSpectator = (s: GameState, id: string) => s.spectators.some((w) => w.id === id);

/** Join to watch. A seated or queued player who comes back this way stays a player. */
export function addSpectator(state: GameState, id: string, rawName: string, now: number): GameState {
  if (find(state, id) || state.queue.some((q) => q.id === id)) return addPlayer(state, id, rawName, now);
  const name = cleanName(rawName);
  return update(state, (s) => {
    s.lastActionAt = now;
    const known = s.spectators.find((w) => w.id === id);
    if (known) Object.assign(known, { name, connected: true });
    else s.spectators.push({ id, name, connected: true });
  });
}

export function startGame(state: GameState, now: number): GameState {
  if (state.started || state.players.length < 1) return state;
  return update(state, (s) => {
    s.started = true;
    s.lastActionAt = now;
    startRound(s, now);
  });
}

// ------------------------------------------------ round flow

/** Mutates: open the betting window. */
function startRound(s: GameState, now: number) {
  s.players = s.players.filter((p) => p.chips >= s.config.minBet);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, s.config.startingStack, q.connected);
  }
  for (const p of s.players) Object.assign(p, { bets: {}, done: false, payout: 0 });
  Object.assign(s, { result: null, deadline: null, nextRoundAt: null });
  if (s.players.length === 0) {
    s.phase = 'waiting';
    return;
  }
  s.round++;
  s.phase = 'betting';
  s.deadline = now + BET_MS;
}

function spinIfAllDone(s: GameState, now: number) {
  if (s.players.length && s.players.every((p) => p.done)) spin(s, now);
}

/** Mutates: no more bets, spin, pay out. `result` lets tests pick the number. */
export function spin(s: GameState, now: number, result = randomInt(37)) {
  const playing = s.players.filter((p) => staked(p.bets) > 0);
  if (!playing.length) return startRound(s, now); // nobody bet: open a fresh window
  Object.assign(s, { phase: 'settled', result, deadline: null, nextRoundAt: now + SPIN_MS + SETTLE_MS });
  s.history = [result, ...s.history].slice(0, HISTORY);
  for (const p of playing) {
    p.payout = Object.entries(p.bets).reduce((n, [spot, amount]) => n + amount! * payoutMultiple(spot as Spot, result), 0);
    p.chips += p.payout;
    p.lastBets = p.bets;
  }
}

// ------------------------------------------------ actions

function act(s: GameState, id: string, action: PlayerAction) {
  const p = find(s, id);
  if (!p) throw new Error("You're not seated");
  if (s.phase !== 'betting' || p.done) throw new Error('No more bets');
  const refund = () => {
    p.chips += staked(p.bets);
    p.bets = {};
  };
  switch (action.type) {
    case 'bet': {
      const { spot, amount } = action;
      if (!VALID.has(spot)) throw new Error('Invalid bet');
      if (!Number.isInteger(amount) || amount < s.config.minBet || amount > p.chips) throw new Error('Not enough chips');
      p.chips -= amount;
      p.bets[spot] = (p.bets[spot] ?? 0) + amount;
      break;
    }
    case 'clear':
      refund();
      break;
    case 'repeat':
      if (staked(p.lastBets) > p.chips + staked(p.bets)) throw new Error('Not enough chips to repeat');
      refund();
      p.chips -= staked(p.lastBets);
      p.bets = { ...p.lastBets };
      break;
    case 'done':
      p.done = true;
      break;
    default:
      throw new Error('Unknown action');
  }
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action);
    s.lastActionAt = now;
    spinIfAllDone(s, now);
  });
}

/** Host clock: close betting and spin, then open the next round. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, deadline } = state;
  if (phase === 'betting' && deadline !== null && now >= deadline) return update(state, (s) => spin(s, now)); // timeouts don't count as activity
  const ready = state.players.some((p) => p.chips >= state.config.minBet) || state.queue.length > 0;
  if (state.started && ((phase === 'settled' && now >= state.nextRoundAt!) || (phase === 'waiting' && ready))) {
    return update(state, (s) => startRound(s, now));
  }
  return state;
}
