import type { Card, GameState, Hand, Player, PlayerAction, TableConfig } from '../types/blackjack';

export const MAX_SEATS = 7;
export const MAX_QUEUE = 20;
export const MAX_HANDS = 4; // split up to three times
export const BET_MS = 15_000;
export const TURN_MS = 20_000;
export const SETTLE_MS = 6_000;
/** Extra results time while the table turns the hole card over and deals the dealer's draws (per card). */
const REVEAL_MS = 1_000;
const DRAW_MS = 900;
export const IDLE_MS = 5 * 60_000;
/** Reshuffle once less than this share of the shoe is left. */
const CUT = 0.25;

// ------------------------------------------------ cards

function newShoe(decks: number): Card[] {
  const deck = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => `${r}${s}` as Card));
  return shuffle(Array.from({ length: decks }, () => deck).flat());
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

/** Best total, counting one ace as 11 when that doesn't bust. Face-down cards count as nothing. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === '??') continue;
    if (c[0] === 'A') aces++;
    total += c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]);
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
const rankValue = (c: Card) => handValue([c]).total;

// ------------------------------------------------ helpers

const update = (state: GameState, fn: (s: GameState) => void): GameState => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);

function draw(s: GameState): Card {
  if (!s.shoe.length) s.shoe = newShoe(s.config.decks); // only with a huge table on one deck
  return s.shoe.pop()!;
}

const newHand = (bet: number, cards: Card[] = [], split = false): Hand => ({ cards, bet, doubled: false, split, done: false, outcome: null, payout: 0 });

function seat(s: GameState, id: string, name: string, chips: number, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  s.players.push({ id, name, seat: free, chips, hands: [], lastBet: s.config.minBet, connected, left: false });
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
    roomCode, config, started: false, phase: 'waiting', round: 0, players: [], queue: [], spectators: [], dealer: [], shoe: [],
    activeId: null, activeHand: 0, deadline: null, nextRoundAt: null, lastActionAt: now,
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
export const isBroke = (s: GameState, p: Player) => p.chips < s.config.minBet && !(s.phase === 'playing' && p.hands.length > 0);

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
    const p = find(s, id);
    if (!p) return;
    if (s.phase !== 'playing') {
      s.players = s.players.filter((x) => x !== p);
      if (s.phase === 'betting') dealIfAllBet(s, now);
      return;
    }
    // Mid-round: their hands stand as they are; the seat is cleared at the next round.
    p.left = true;
    for (const h of p.hands) h.done = true;
    if (s.activeId === id) nextTurn(s, now);
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

/** Mutates: open the betting window. `shoe` lets tests stack the cards (dealt with pop()). */
export function startRound(s: GameState, now: number, shoe?: Card[]) {
  s.players = s.players.filter((p) => p.chips >= s.config.minBet && !p.left);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, s.config.startingStack, q.connected);
  }
  for (const p of s.players) p.hands = [];
  Object.assign(s, { dealer: [], activeId: null, activeHand: 0, deadline: null, nextRoundAt: null });
  if (s.players.length === 0) {
    s.phase = 'waiting';
    return;
  }
  if (shoe) s.shoe = shoe;
  else if (s.shoe.length < s.config.decks * 52 * CUT) s.shoe = newShoe(s.config.decks);
  s.round++;
  s.phase = 'betting';
  s.deadline = now + BET_MS;
}

function dealIfAllBet(s: GameState, now: number) {
  if (s.players.length && s.players.every((p) => p.hands.length > 0)) deal(s, now);
}

/** Two cards each, dealer included; players who didn't bet sit this round out. */
function deal(s: GameState, now: number) {
  const inPlay = s.players.filter((p) => p.hands.length > 0);
  if (!inPlay.length) return startRound(s, now); // nobody bet: open a fresh window
  for (let round = 0; round < 2; round++) {
    for (const p of inPlay) p.hands[0].cards.push(draw(s));
    s.dealer.push(draw(s));
  }
  s.phase = 'playing';
  // The dealer peeks: with a blackjack the round ends before anyone acts.
  if (isBlackjack(s.dealer)) return settle(s, now);
  nextTurn(s, now);
}

/** Hand the turn to the first unfinished hand in seat order, or let the dealer play. */
function nextTurn(s: GameState, now: number) {
  for (const p of s.players) {
    for (let i = 0; i < p.hands.length; i++) {
      const h = p.hands[i];
      if (h.done) continue;
      if (h.cards.length < 2) h.cards.push(draw(s)); // second card of a split hand
      if (handValue(h.cards).total >= 21) {
        h.done = true;
        continue;
      }
      s.activeId = p.id;
      s.activeHand = i;
      s.deadline = now + TURN_MS;
      return;
    }
  }
  settle(s, now);
}

function settle(s: GameState, now: number) {
  Object.assign(s, { activeId: null, activeHand: 0, deadline: null, phase: 'settled', nextRoundAt: now + SETTLE_MS });
  const hands = s.players.flatMap((p) => p.hands);
  const dealerBJ = isBlackjack(s.dealer);
  const natural = (h: Hand) => !h.split && isBlackjack(h.cards);
  // The dealer only draws if some hand still needs beating. Stands on all 17s.
  if (!dealerBJ && hands.some((h) => handValue(h.cards).total <= 21 && !natural(h))) {
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  }
  s.nextRoundAt! += REVEAL_MS + (s.dealer.length - 2) * DRAW_MS; // time to show it all before the results
  const dealerTotal = handValue(s.dealer).total;
  for (const p of s.players) {
    for (const h of p.hands) {
      const v = handValue(h.cards).total;
      h.done = true;
      if (v > 21) [h.outcome, h.payout] = ['bust', 0];
      else if (dealerBJ) [h.outcome, h.payout] = natural(h) ? ['push', h.bet] : ['lose', 0];
      else if (natural(h)) [h.outcome, h.payout] = ['blackjack', h.bet + Math.floor((h.bet * 3) / 2)]; // pays 3 to 2
      else if (dealerTotal > 21 || v > dealerTotal) [h.outcome, h.payout] = ['win', h.bet * 2];
      else if (v === dealerTotal) [h.outcome, h.payout] = ['push', h.bet];
      else [h.outcome, h.payout] = ['lose', 0];
      p.chips += h.payout;
    }
  }
}

// ------------------------------------------------ actions

export function legalActions(s: GameState, id: string) {
  const p = find(s, id);
  const h = p?.hands[s.activeHand];
  const twoCards = !!h && h.cards.length === 2;
  const affordable = !!p && !!h && p.chips >= h.bet;
  // Why splitting isn't allowed right now, in a few words; null when it is.
  const splitBlock =
    !twoCards || rankValue(h.cards[0]) !== rankValue(h.cards[1])
      ? 'Pairs only'
      : p!.hands.length >= MAX_HANDS
        ? `${MAX_HANDS} hands max`
        : !affordable
          ? 'Not enough chips'
          : null;
  return { canDouble: twoCards && affordable, canSplit: splitBlock === null, splitBlock };
}

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  const p = find(s, id);
  if (!p) throw new Error("You're not seated");

  if (action.type === 'bet') {
    const { amount } = action;
    if (s.phase !== 'betting' || p.hands.length) throw new Error('Betting is closed');
    if (!Number.isInteger(amount) || amount < s.config.minBet || amount > p.chips) throw new Error('Invalid bet');
    p.chips -= amount;
    p.lastBet = amount;
    p.hands = [newHand(amount)];
    return dealIfAllBet(s, now);
  }

  if (s.phase !== 'playing' || s.activeId !== id) throw new Error('Not your turn');
  const h = p.hands[s.activeHand];
  const legal = legalActions(s, id);
  switch (action.type) {
    case 'hit':
      h.cards.push(draw(s));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      if (!legal.canDouble) throw new Error('You cannot double');
      p.chips -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      if (!legal.canSplit) throw new Error('You cannot split');
      p.chips -= h.bet;
      const second = newHand(h.bet, [h.cards.pop()!], true);
      h.split = true;
      h.cards.push(draw(s));
      p.hands.splice(s.activeHand + 1, 0, second);
      // Split aces take one card each and stand.
      if (h.cards[0][0] === 'A') {
        h.done = true;
        second.cards.push(draw(s));
        second.done = true;
      }
      break;
    }
    default:
      throw new Error('Unknown action');
  }
  if (h.done || handValue(h.cards).total >= 21) {
    h.done = true;
    nextTurn(s, now);
  } else {
    s.deadline = now + TURN_MS; // fresh clock for the next decision
  }
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action, now);
    s.lastActionAt = now;
  });
}

/** Host clock: close betting, auto-stand on timeout, deal the next round. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, activeId, deadline } = state;
  if (deadline !== null && now >= deadline) {
    if (phase === 'betting') return update(state, (s) => deal(s, now)); // timeouts don't count as activity
    if (phase === 'playing' && activeId) return update(state, (s) => act(s, activeId, { type: 'stand' }, now));
  }
  const ready = state.players.some((p) => p.chips >= state.config.minBet && !p.left) || state.queue.length > 0;
  if (state.started && ((phase === 'settled' && now >= state.nextRoundAt!) || (phase === 'waiting' && ready))) {
    return update(state, (s) => startRound(s, now));
  }
  return state;
}

/** What one viewer may see: no shoe, and the dealer's hole card stays down until the dealer plays (spectators see it). */
export function maskFor(state: GameState, viewerId: string): GameState {
  return update(state, (s) => {
    s.shoe = [];
    if (s.phase === 'playing' && s.dealer.length > 1 && !isSpectator(s, viewerId)) s.dealer[1] = '??';
  });
}
