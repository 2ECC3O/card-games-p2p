import pokersolver from 'pokersolver';
import {
  BETTING_PHASES,
  type Card,
  type GameState,
  type Player,
  type PlayerAction,
  type TableConfig,
} from '../types/poker';

const { Hand } = pokersolver; // CommonJS package: default import works in Vite and tsx

export const MAX_SEATS = 10;
export const MAX_QUEUE = 20;
export const TURN_MS = 30_000;
export const SHOWDOWN_MS = 6_000;
/** Extra showdown time while the table turns cards over (per player) and deals an all-in runout (per card). */
const REVEAL_MS = 500;
const RUNOUT_MS = 550;
export const IDLE_MS = 5 * 60_000;

// ------------------------------------------------ cards

function newDeck(): Card[] {
  return [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => `${r}${s}` as Card));
}

/** Unbiased crypto-random integer in [0, n). */
function randomInt(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** Fisher-Yates, in place. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ------------------------------------------------ helpers

const update = (state: GameState, fn: (s: GameState) => void): GameState => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);

/** First of `among` strictly clockwise after `seat` (wrapping). */
function nextAfter(among: Player[], seat: number): Player | undefined {
  const bySeat = [...among].sort((a, b) => a.seat - b.seat);
  return bySeat.find((p) => p.seat > seat) ?? bySeat[0];
}

function put(p: Player, amount: number) {
  const a = Math.min(amount, p.chips);
  p.chips -= a;
  p.bet += a;
  p.committed += a;
  if (p.chips === 0) p.allIn = true;
}

function seat(s: GameState, id: string, name: string, chips: number, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  s.players.push({
    id, name, seat: free, chips, hole: [], bet: 0, committed: 0, folded: false, allIn: false,
    acted: false, showCards: false, connected, left: false, lastAction: null,
  });
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
    roomCode, config, started: false, phase: 'waiting', handNumber: 0, blinds: config.blindLevels[0],
    dealerSeat: -1, players: [], queue: [], spectators: [], board: [], deck: [], pots: [], currentBet: 0, minRaise: 0,
    activeId: null, turnDeadline: null, nextHandAt: null, lastActionAt: now,
  };
}

/** Seat before the game starts; afterwards (or when full) join the queue for the next hand. */
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

/** Busted players ask to be dealt back in with a fresh stack. */
export function rejoinQueue(state: GameState, id: string, name: string, now: number): GameState {
  const p = find(state, id);
  if (!state.started || isSpectator(state, id) || state.queue.length >= MAX_QUEUE || state.queue.some((q) => q.id === id)) return state;
  if (p && (p.chips > 0 || BETTING_PHASES.includes(state.phase))) return state; // all-in is not busted
  return update(state, (s) => {
    s.lastActionAt = now;
    s.queue.push({ id, name: cleanName(name), connected: true });
  });
}

export function removePlayer(state: GameState, id: string, now: number): GameState {
  return update(state, (s) => {
    s.queue = s.queue.filter((q) => q.id !== id);
    s.spectators = s.spectators.filter((w) => w.id !== id);
    const p = find(s, id);
    if (!p) return;
    if (!BETTING_PHASES.includes(s.phase)) {
      s.players = s.players.filter((x) => x !== p);
      return;
    }
    p.left = true;
    if (p.folded) return;
    p.folded = true;
    p.lastAction = 'Left';
    advance(s, now, p.seat, s.activeId !== id);
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
  if (state.started || state.players.length < 2) return state;
  return update(state, (s) => {
    s.started = true;
    s.lastActionAt = now;
    startHand(s, now);
  });
}

// ------------------------------------------------ hand flow

/** Mutates. `deck` lets tests stack the deck (cards are dealt with pop()). */
export function startHand(s: GameState, now: number, deck?: Card[]) {
  s.players = s.players.filter((p) => p.chips > 0 && !p.left);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, s.config.startingStack, q.connected);
  }
  for (const p of s.players) {
    Object.assign(p, { hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, showCards: false, lastAction: null });
  }
  Object.assign(s, { board: [], pots: [], nextHandAt: null, activeId: null, turnDeadline: null, currentBet: 0 });
  if (s.players.length < 2) {
    s.phase = 'waiting';
    return;
  }

  s.handNumber++;
  const levels = s.config.blindLevels;
  s.blinds = levels[Math.min(Math.floor((s.handNumber - 1) / s.config.handsPerLevel), levels.length - 1)];
  s.deck = deck ?? shuffle(newDeck());

  const dealer = nextAfter(s.players, s.dealerSeat)!;
  s.dealerSeat = dealer.seat;
  for (let round = 0; round < 2; round++) {
    let p = dealer;
    for (let i = 0; i < s.players.length; i++) {
      p = nextAfter(s.players, p.seat)!;
      p.hole.push(s.deck.pop()!);
    }
  }

  // Heads-up the dealer posts the small blind and acts first preflop.
  const sb = s.players.length === 2 ? dealer : nextAfter(s.players, dealer.seat)!;
  const bb = nextAfter(s.players, sb.seat)!;
  put(sb, s.blinds.small);
  sb.lastAction = 'SB';
  put(bb, s.blinds.big);
  bb.lastAction = 'BB';
  s.currentBet = s.blinds.big;
  s.minRaise = s.blinds.big;
  s.phase = 'preflop';
  advance(s, now, bb.seat);
}

/** Move the turn on, close the street, or finish the hand. Mutates. */
function advance(s: GameState, now: number, afterSeat: number, keepActive = false) {
  const live = s.players.filter((p) => !p.folded);
  if (live.length === 1) return finishHand(s, now);

  const pending = live.filter((p) => !p.allIn && (!p.acted || p.bet < s.currentBet));
  if (pending.length) {
    if (keepActive && pending.some((p) => p.id === s.activeId)) return;
    s.activeId = nextAfter(pending, afterSeat)!.id;
    s.turnDeadline = now + TURN_MS;
    return;
  }

  // Street complete.
  for (const p of s.players) {
    p.bet = 0;
    p.acted = false;
    if (!p.folded && !p.allIn) p.lastAction = null;
  }
  s.currentBet = 0;
  s.minRaise = s.blinds.big;
  if (s.phase === 'river' || live.filter((p) => !p.allIn).length <= 1) return finishHand(s, now);

  const [next, cards] = ({ preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] } as const)[
    s.phase as 'preflop' | 'flop' | 'turn'
  ];
  s.phase = next;
  for (let i = 0; i < cards; i++) s.board.push(s.deck.pop()!);
  advance(s, now, s.dealerSeat);
}

/**
 * Main pot plus side pots: one pot per distinct amount put in by players still in the hand, each
 * open to the players who put in at least that much. The last pot also sweeps up folded players'
 * chips above the top level. Pass `committed` as chips already in the middle.
 */
export function buildPots(players: Pick<Player, 'id' | 'committed' | 'folded'>[]): { amount: number; eligible: string[] }[] {
  const live = players.filter((p) => !p.folded);
  const levels = [...new Set(live.map((p) => p.committed))].filter((l) => l > 0).sort((a, b) => a - b);
  let prev = 0;
  return levels.map((level, i) => {
    const cap = i === levels.length - 1 ? Infinity : level;
    const amount = players.reduce((sum, p) => sum + Math.min(p.committed, cap) - Math.min(p.committed, prev), 0);
    prev = level;
    return { amount, eligible: live.filter((p) => p.committed >= level).map((p) => p.id) };
  });
}

function finishHand(s: GameState, now: number) {
  s.activeId = null;
  s.turnDeadline = null;
  s.phase = 'showdown';
  s.nextHandAt = now + SHOWDOWN_MS;
  for (const p of s.players) p.bet = 0;

  // Uncalled chips go back to whoever put them in.
  const [top, second] = [...s.players].sort((a, b) => b.committed - a.committed);
  const extra = top.committed - (second?.committed ?? 0);
  top.committed -= extra;
  top.chips += extra;

  const live = s.players.filter((p) => !p.folded);
  const total = s.players.reduce((sum, p) => sum + p.committed, 0);
  if (live.length === 1) {
    live[0].chips += total;
    s.pots = [{ amount: total, eligible: [live[0].id], winners: [live[0].id], hand: null }];
    return;
  }

  s.nextHandAt += live.length * REVEAL_MS + (5 - s.board.length) * RUNOUT_MS; // time to show it all before the result
  while (s.board.length < 5) s.board.push(s.deck.pop()!);
  const solved = new Map(live.map((p) => [p.id, Hand.solve([...p.hole, ...s.board])]));
  for (const p of live) p.showCards = true;

  const clockwise = (p: Player) => (p.seat - s.dealerSeat - 1 + MAX_SEATS) % MAX_SEATS; // odd chips go left of the button
  s.pots = buildPots(s.players).map(({ amount, eligible: ids }) => {
    const eligible = live.filter((p) => ids.includes(p.id));
    const best = Hand.winners(eligible.map((p) => solved.get(p.id)!));
    const winners = eligible.filter((p) => best.includes(solved.get(p.id)!)).sort((a, b) => clockwise(a) - clockwise(b));
    const share = Math.floor(amount / winners.length);
    winners.forEach((w, k) => (w.chips += share + (k < amount - share * winners.length ? 1 : 0)));
    return { amount, eligible: eligible.map((p) => p.id), winners: winners.map((p) => p.id), hand: best[0].descr };
  });
}

// ------------------------------------------------ actions

export function legalActions(s: GameState, id: string) {
  const p = find(s, id)!;
  const toCall = Math.max(0, s.currentBet - p.bet);
  const maxTo = p.bet + p.chips;
  const othersCanAct = s.players.some((o) => o !== p && !o.folded && !o.allIn);
  return {
    canCheck: toCall === 0,
    callAmount: Math.min(toCall, p.chips),
    canRaise: !p.acted && maxTo > s.currentBet && othersCanAct,
    minRaiseTo: Math.min(s.currentBet + s.minRaise, maxTo),
    maxRaiseTo: maxTo,
  };
}

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  if (!BETTING_PHASES.includes(s.phase) || s.activeId !== id) throw new Error('Not your turn');
  const p = find(s, id)!;
  const legal = legalActions(s, id);
  switch (action.type) {
    case 'fold':
      p.folded = true;
      p.lastAction = 'Fold';
      break;
    case 'check':
      if (!legal.canCheck) throw new Error('You cannot check');
      p.lastAction = 'Check';
      break;
    case 'call':
      if (legal.canCheck) throw new Error('Nothing to call');
      put(p, legal.callAmount);
      p.lastAction = p.allIn ? 'All-in' : 'Call';
      break;
    case 'raise': {
      const to = action.amount;
      if (!legal.canRaise || !Number.isInteger(to) || to > legal.maxRaiseTo || (to < legal.minRaiseTo && to !== legal.maxRaiseTo))
        throw new Error('Invalid raise');
      const by = to - s.currentBet;
      p.lastAction = s.currentBet === 0 ? `Bet ${to}` : `Raise ${to}`;
      put(p, to - p.bet);
      if (p.allIn) p.lastAction = 'All-in';
      // A full raise reopens the action; a short all-in only has to be called.
      if (by >= s.minRaise) {
        s.minRaise = by;
        for (const o of s.players) if (o !== p) o.acted = false;
      }
      s.currentBet = to;
      break;
    }
    default:
      throw new Error('Unknown action');
  }
  p.acted = true;
  advance(s, now, p.seat);
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action, now);
    s.lastActionAt = now;
  });
}

/** Host clock: auto check/fold on timeout, deal the next hand. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, activeId, turnDeadline } = state;
  if (activeId && turnDeadline !== null && now >= turnDeadline && BETTING_PHASES.includes(phase)) {
    const move: PlayerAction = { type: legalActions(state, activeId).canCheck ? 'check' : 'fold' };
    return update(state, (s) => act(s, activeId, move, now)); // timeouts don't count as activity
  }
  const ready = state.players.filter((p) => p.chips > 0 && !p.left).length + state.queue.length >= 2;
  if (state.started && ((phase === 'showdown' && now >= state.nextHandAt!) || (phase === 'waiting' && ready))) {
    return update(state, (s) => startHand(s, now));
  }
  return state;
}

/** What one viewer may see: no deck, and no opponents' hole cards before showdown unless they are a spectator. */
export function maskFor(state: GameState, viewerId: string): GameState {
  return update(state, (s) => {
    s.deck = [];
    if (isSpectator(s, viewerId)) return; // spectators see every card
    for (const p of s.players) if (p.id !== viewerId && !p.showCards) p.hole = p.hole.map(() => '??');
  });
}
