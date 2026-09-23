import type { Card, GameState, Player, PlayerAction, TableConfig } from '../types/pokdeng';

export const MAX_SEATS = 7;
export const MAX_QUEUE = 20;
export const BET_MS = 30_000;
export const TURN_MS = 60_000;
export const SETTLE_MS = 6_000;
/** Extra results time while the table turns every hand over and the dealer draws. */
const REVEAL_MS = 1_500;
export const IDLE_MS = 5 * 60_000;
export const isBot = (id: string) => /^bot:\d+$/.test(id);
const BOT_DELAY_MS = 1_000;
/** The dealer and bots draw a third card on a score of 4 or less. */
const DRAW_ON = 4;

// ------------------------------------------------ cards

/** Unbiased crypto-random integer in [0, n). */
function randomInt(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** One fresh deck per round, Fisher-Yates shuffled. */
function newDeck(): Card[] {
  const d = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => `${r}${s}` as Card));
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const ORDER = 'A23456789TJQK';
const point = (c: Card) => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 0 : Number(c[0]));

/** Last digit of the card total. Hidden cards count as nothing. */
export const score = (cards: Card[]) => cards.filter((c) => c !== '??').reduce((n, c) => n + point(c), 0) % 10;

export const isPok = (cards: Card[]) => cards.length === 2 && !cards.includes('??') && score(cards) >= 8;

function isStraight(cards: Card[]) {
  const i = cards.map((c) => ORDER.indexOf(c[0])).sort((a, b) => a - b);
  const run = (a: number[]) => a[1] === a[0] + 1 && a[2] === a[1] + 1;
  // Ace plays low (A-2-3) or high (Q-K-A), never round the corner.
  return run(i) || (i[0] === 0 && run([i[1], i[2], 13]));
}

/** Hand class (higher beats lower) and its name. Three-card specials only exist after drawing. */
export function handType(cards: Card[]): { rank: number; name: string } {
  if (cards.length !== 3 || cards.includes('??')) return isPok(cards) ? { rank: 5, name: `Pok ${score(cards)}` } : { rank: 0, name: `${score(cards)}` };
  const flush = cards.every((c) => c[1] === cards[0][1]);
  if (cards.every((c) => c[0] === cards[0][0])) return { rank: 4, name: 'Tong' };
  if (isStraight(cards)) return flush ? { rank: 3, name: 'Straight flush' } : { rank: 2, name: 'Straight' };
  if (cards.every((c) => 'JQK'.includes(c[0]))) return { rank: 1, name: 'Three faces' };
  return { rank: 0, name: `${score(cards)}` };
}

/** Bet multiplier of a hand. */
export function deng(cards: Card[]): number {
  if (cards.includes('??')) return 1;
  const flush = cards.every((c) => c[1] === cards[0][1]);
  if (cards.length === 2) return flush || cards[0][0] === cards[1][0] ? 2 : 1;
  const { rank } = handType(cards);
  return rank >= 3 ? 5 : rank >= 1 || flush ? 3 : 1;
}

/** Player's result against the dealer, in bets: +deng for a win, −deng for a loss, deng difference on a tie. */
export function compare(player: Card[], dealer: Card[]): number {
  const p = handType(player), d = handType(dealer);
  const [ps, ds] = [score(player), score(dealer)];
  if (p.rank !== d.rank) return p.rank > d.rank ? deng(player) : -deng(dealer);
  if (ps !== ds) return ps > ds ? deng(player) : -deng(dealer);
  return deng(player) - deng(dealer);
}

// ------------------------------------------------ helpers

const update = (state: GameState, fn: (s: GameState) => void): GameState => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);
const draw = (s: GameState) => s.deck.pop()!; // 7 seats × 3 + 3 never runs out of 52

function clearHand(p: Player) {
  Object.assign(p, { cards: [], bet: 0, done: false, outcome: null, net: 0 });
}

function seat(s: GameState, id: string, name: string, chips: number, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  const p = { id, name, seat: free, chips, lastBet: s.config.minBet, connected, left: false } as Player;
  clearHand(p);
  s.players.push(p);
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
    roomCode, config, started: false, botMatch: false, phase: 'waiting', round: 0, players: [], queue: [], spectators: [], dealer: [], deck: [],
    activeId: null, deadline: null, nextRoundAt: null, lastActionAt: now,
  };
}

/** Seat before the game starts; afterwards (or when full) join the queue for the next round. */
export function addPlayer(state: GameState, id: string, rawName: string, now: number): GameState {
  if (isBot(id)) return state;
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

/** Host-owned seat; queued during play and never replenished after elimination. */
export function addBot(state: GameState, now: number): GameState {
  if (state.players.length + state.queue.length >= MAX_SEATS) return state;
  return update(state, (s) => {
    const number = Math.max(0, ...[...s.players, ...s.queue].map((p) => Number(/^bot:(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
    const id = `bot:${number}`;
    const name = `Bot ${number}`;
    s.botMatch = true;
    if (!s.started) seat(s, id, name, s.config.startingStack, true);
    else s.queue.push({ id, name, connected: true });
    s.lastActionAt = now;
  });
}

export function setConnected(state: GameState, id: string, connected: boolean): GameState {
  return update(state, (s) => {
    const p = find(s, id) ?? s.queue.find((q) => q.id === id) ?? s.spectators.find((w) => w.id === id);
    if (p) p.connected = connected;
  });
}

/** Can't cover the table minimum, and has nothing riding on the current round. */
export const isBroke = (s: GameState, p: Player) => p.chips < s.config.minBet && !(s.phase === 'playing' && p.bet > 0);

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
    // Mid-round: their hand stays as it is; the seat is cleared at the next round.
    p.left = true;
    p.done = true;
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

/** Mutates: open the betting window. `deck` lets tests stack the cards (dealt with pop()). */
export function startRound(s: GameState, now: number, deck?: Card[]) {
  s.players = s.players.filter((p) => p.chips >= s.config.minBet && !p.left);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, s.config.startingStack, q.connected);
  }
  s.players.forEach(clearHand);
  Object.assign(s, { dealer: [], activeId: null, deadline: null, nextRoundAt: null });
  if (s.players.length === 0 || (s.botMatch && s.players.length === 1 && !s.queue.length)) {
    s.phase = 'waiting';
    return;
  }
  s.deck = deck ?? newDeck();
  s.round++;
  s.phase = 'betting';
  s.deadline = now + BET_MS;
}

function dealIfAllBet(s: GameState, now: number) {
  if (s.players.length && s.players.every((p) => p.bet > 0)) deal(s, now);
}

/** Two cards each, dealer last; players who didn't bet sit this round out. */
function deal(s: GameState, now: number) {
  const inPlay = s.players.filter((p) => p.bet > 0);
  if (!inPlay.length) return startRound(s, now); // nobody bet: open a fresh window
  for (let round = 0; round < 2; round++) {
    for (const p of inPlay) p.cards.push(draw(s));
    s.dealer.push(draw(s));
  }
  s.phase = 'playing';
  for (const p of s.players) p.done = p.bet === 0 || isPok(p.cards); // a pok is shown at once and can't draw
  // Dealer pok: everyone is compared on two cards straight away.
  if (isPok(s.dealer)) return settle(s, now);
  nextTurn(s, now);
}

function nextTurn(s: GameState, now: number) {
  const next = s.players.find((p) => !p.done);
  if (!next) return settle(s, now);
  s.activeId = next.id;
  s.deadline = now + TURN_MS;
}

function settle(s: GameState, now: number) {
  Object.assign(s, { activeId: null, deadline: null, phase: 'settled', nextRoundAt: now + SETTLE_MS + REVEAL_MS });
  // ponytail: the dealer draws by a fixed rule instead of choosing per player, as a human banker may.
  if (!isPok(s.dealer) && score(s.dealer) <= DRAW_ON) s.dealer.push(draw(s));
  for (const p of s.players) {
    if (!p.bet) continue;
    p.done = true;
    // A loss can't take more than the player has.
    p.net = Math.max(p.bet * compare(p.cards, s.dealer), -(p.bet + p.chips));
    p.outcome = p.net > 0 ? 'win' : p.net < 0 ? 'lose' : 'push';
    p.chips += p.bet + p.net;
  }
}

// ------------------------------------------------ actions

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  const p = find(s, id);
  if (!p) throw new Error("You're not seated");

  if (action.type === 'bet') {
    const { amount } = action;
    if (s.phase !== 'betting' || p.bet) throw new Error('Betting is closed');
    if (!Number.isInteger(amount) || amount < s.config.minBet || amount > p.chips) throw new Error('Invalid bet');
    p.chips -= amount;
    p.bet = amount;
    p.lastBet = amount;
    return dealIfAllBet(s, now);
  }

  if (s.phase !== 'playing' || s.activeId !== id) throw new Error('Not your turn');
  if (action.type === 'draw') p.cards.push(draw(s));
  else if (action.type !== 'stay') throw new Error('Unknown action');
  p.done = true;
  nextTurn(s, now);
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action, now);
    s.lastActionAt = now;
  });
}

/** Host clock: close betting, auto-stay on timeout, deal the next round. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, activeId, deadline } = state;
  if (phase === 'betting' && deadline !== null && now >= deadline - BET_MS + BOT_DELAY_MS) {
    const bot = state.players.find((p) => isBot(p.id) && !p.bet && p.chips >= state.config.minBet);
    if (bot) return update(state, (s) => act(s, bot.id, { type: 'bet', amount: s.config.minBet }, now));
  }
  if (phase === 'playing' && activeId && isBot(activeId) && deadline !== null && now >= deadline - TURN_MS + BOT_DELAY_MS) {
    const cards = state.players.find((p) => p.id === activeId)!.cards;
    return update(state, (s) => act(s, activeId, { type: score(cards) <= DRAW_ON ? 'draw' : 'stay' }, now));
  }
  if (deadline !== null && now >= deadline) {
    if (phase === 'betting') return update(state, (s) => deal(s, now)); // timeouts don't count as activity
    if (phase === 'playing' && activeId) return update(state, (s) => act(s, activeId, { type: 'stay' }, now));
  }
  const funded = state.players.filter((p) => p.chips >= state.config.minBet && !p.left).length;
  const ready = (funded > 0 || state.queue.length > 0) && (!state.botMatch || funded + state.queue.length > 1);
  if (state.started && ((phase === 'settled' && now >= state.nextRoundAt!) || (phase === 'waiting' && ready))) {
    return update(state, (s) => startRound(s, now));
  }
  return state;
}

/** What one viewer may see: no deck; while playing, other players' cards and the dealer's stay face down unless a pok was shown. Spectators see all. */
export function maskFor(state: GameState, viewerId: string): GameState {
  return update(state, (s) => {
    s.deck = [];
    if (s.phase !== 'playing' || isSpectator(s, viewerId)) return;
    s.dealer = s.dealer.map(() => '??');
    for (const p of s.players) if (p.id !== viewerId && !isPok(p.cards)) p.cards = p.cards.map(() => '??');
  });
}
