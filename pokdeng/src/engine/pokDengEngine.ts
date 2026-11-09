import type { Card, GameState, Hand, Player, PlayerAction, TableConfig } from '../types/pokdeng';
import { cleanName, isBot, isSpectator, randomInt, update, addSpectator as watch } from '../../../shared/lobby';
export { cleanName, isBot, isSpectator, setConnected } from '../../../shared/lobby';

export const MAX_SEATS = 7;
const MAX_QUEUE = 20;
/** Hands (ขา) one player may bet on in a round. */
export const MAX_LEGS = 3;
/** 16 hands of three cards and the dealer's three fit in one deck. */
const MAX_HANDS = 16;
export const BET_MS = 30_000;
export const TURN_MS = 60_000;
const SETTLE_MS = 6_000;
/** Extra results time while the table turns every hand over and the dealer draws. */
const REVEAL_MS = 1_500;
const BOT_DELAY_MS = 1_000;
/** Bots, the app as dealer and timed-out players draw on 4 or less. */
const DRAW_ON = 4;
/** Bet limits a dealer can set, in minimum bets. */
export const LIMITS = [2, 5, 10, 20] as const;

// ------------------------------------------------ cards

/** One fresh deck per round, Fisher-Yates shuffled. */
function newDeck(): Card[] {
  const d = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => `${r}${s}` as Card));
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** 2 is the lowest card and the ace the highest, so a run can't wrap round (K-A-2 and A-2-3 aren't straights). */
const ORDER = '23456789TJQKA';
const point = (c: Card) => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 0 : Number(c[0]));
const high = (cards: Card[]) => Math.max(...cards.map((c) => ORDER.indexOf(c[0])));

/** Last digit of the card total. Hidden cards count as nothing. */
export const score = (cards: Card[]) => cards.filter((c) => c !== '??').reduce((n, c) => n + point(c), 0) % 10;

const isPok = (cards: Card[]) => cards.length === 2 && !cards.includes('??') && score(cards) >= 8;

function isStraight(cards: Card[]) {
  const i = cards.map((c) => ORDER.indexOf(c[0])).sort((a, b) => a - b);
  return i[1] === i[0] + 1 && i[2] === i[1] + 1;
}

/** Hand class (higher beats lower) and its name: Pok, Tong, straight, three picture cards, then plain scores. */
export function handType(cards: Card[]): { rank: number; name: string } {
  if (cards.includes('??')) return { rank: 0, name: '' };
  if (cards.length === 2) return isPok(cards) ? { rank: 4, name: `Pok ${score(cards)}` } : { rank: 0, name: `${score(cards)}` };
  if (cards.every((c) => c[0] === cards[0][0])) return { rank: 3, name: 'Tong' };
  if (isStraight(cards)) return { rank: 2, name: 'Straight' };
  if (cards.every((c) => 'JQK'.includes(c[0]))) return { rank: 1, name: 'Three faces' };
  return { rank: 0, name: `${score(cards)}` };
}

/** Bet multiplier of a hand: 2 for a pair or one suit on two cards; 3 for one suit, a straight or three faces on three; 5 for Tong. */
export function deng(cards: Card[]): number {
  if (cards.includes('??')) return 1;
  const suited = cards.every((c) => c[1] === cards[0][1]);
  if (cards.length === 2) return suited || cards[0][0] === cards[1][0] ? 2 : 1;
  const { rank } = handType(cards);
  return rank === 3 ? 5 : rank > 0 || suited ? 3 : 1;
}

/** A hand's result against the dealer's, in bets: +its deng for a win, −the dealer's deng for a loss, 0 for a tie (เจ๊า). */
export function compare(hand: Card[], dealer: Card[]): number {
  const h = handType(hand), d = handType(dealer);
  // Pok and plain hands compare scores; Tong, straights and three faces compare their highest card.
  const [a, b] = h.rank !== d.rank ? [h.rank, d.rank] : h.rank === 0 || h.rank === 4 ? [score(hand), score(dealer)] : [high(hand), high(dealer)];
  return a > b ? deng(hand) : a < b ? -deng(dealer) : 0;
}

// ------------------------------------------------ helpers

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);
const draw = (s: GameState) => s.deck.pop()!; // MAX_HANDS × 3 + 3 never runs out of 52
export const handsOf = (s: GameState, id: string) => s.hands.filter((h) => h.owner === id);
/** Chips riding on the current round. */
export const staked = (s: GameState, id: string) => handsOf(s, id).reduce((n, h) => n + h.bet, 0);

function seat(s: GameState, id: string, name: string, chips: number, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  s.players.push({ id, name, seat: free, chips, lastBet: s.config.minBet, ready: false, connected, left: false });
  s.players.sort((a, b) => a.seat - b.seat);
}

// ------------------------------------------------ lobby

export function createGame(roomCode: string, config: TableConfig, now: number): GameState {
  return {
    roomCode, config, started: false, botMatch: false, phase: 'waiting', round: 0, players: [], queue: [], spectators: [],
    bankerId: null, bankerSeat: -1, maxBet: null, dealer: [], hands: [], deck: [],
    activeId: null, activeHand: null, caught: null, deadline: null, nextRoundAt: null, lastActionAt: now,
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

/** Join to watch; a seated or queued player coming back this way stays a player. */
export const addSpectator = (state: GameState, id: string, name: string, now: number) => watch(state, id, name, now, addPlayer);

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

/** Can't cover the table minimum, and has nothing riding on the current round. */
export const isBroke = (s: GameState, p: Player) => p.chips < s.config.minBet && !(s.phase === 'playing' && (staked(s, p.id) > 0 || s.bankerId === p.id));

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
      s.hands = s.hands.filter((h) => h.owner !== id);
      if (s.phase !== 'betting') return;
      if (s.bankerId !== id) return dealIfReady(s, now);
      // The dealer left before the deal: hand every bet back and open a new round with the next dealer.
      for (const h of s.hands) find(s, h.owner)!.chips += h.bet;
      return startRound(s, now);
    }
    // Mid-round: their hands stand as they are, and a dealer who left plays by the house rule. The seat clears next round.
    p.left = true;
    for (const h of handsOf(s, id)) h.done = true;
    if (s.activeId === id) nextTurn(s, now);
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

/** Mutates: pass the deal clockwise and open the betting window. `deck` lets tests stack the cards (dealt with pop()). */
export function startRound(s: GameState, now: number, deck?: Card[]) {
  s.players = s.players.filter((p) => p.chips >= s.config.minBet && !p.left);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, s.config.startingStack, q.connected);
  }
  for (const p of s.players) p.ready = false;
  Object.assign(s, { dealer: [], hands: [], maxBet: null, activeId: null, activeHand: null, caught: null, deadline: null, nextRoundAt: null });
  if (s.players.length === 0 || (s.botMatch && s.players.length === 1 && !s.queue.length)) {
    s.phase = 'waiting';
    s.bankerId = null;
    return;
  }
  // Alone at the table, the app deals. Otherwise the deal moves to the next seat clockwise.
  const next = s.players.length === 1 ? null : (s.players.find((p) => p.seat > s.bankerSeat) ?? s.players[0]);
  s.bankerId = next?.id ?? null;
  if (next) s.bankerSeat = next.seat;
  s.deck = deck ?? newDeck();
  s.round++;
  s.phase = 'betting';
  s.deadline = now + BET_MS;
}

function dealIfReady(s: GameState, now: number) {
  const bettors = s.players.filter((p) => p.id !== s.bankerId);
  if (bettors.length && bettors.every((p) => p.ready)) deal(s, now);
}

/**
 * Dealing order: clockwise from the dealer's left, a cut-in hand just before the player it cuts, then each
 * player's own hands, the dealer, and the hands that sit last. A cut aimed at someone who has gone plays from
 * its owner's seat.
 */
function dealingOrder(s: GameState): { before: Hand[]; last: Hand[] } {
  const start = s.bankerId ? find(s, s.bankerId)!.seat : -1;
  const around = [...s.players.filter((p) => p.seat > start), ...s.players.filter((p) => p.seat <= start)].filter((p) => p.id !== s.bankerId);
  const cuts = new Set(around.map((p) => p.id));
  const before = around.flatMap((p) => [
    ...s.hands.filter((h) => h.spot === p.id && h.owner !== p.id),
    ...s.hands.filter((h) => h.owner === p.id && (h.spot === 'seat' || (h.spot !== 'last' && !cuts.has(h.spot)))),
  ]);
  return { before, last: s.hands.filter((h) => h.spot === 'last') };
}

/** Two cards each, one at a time, the dealer after the seated hands and before the last ones. */
function deal(s: GameState, now: number) {
  if (!s.hands.length) return startRound(s, now); // nobody bet: next dealer, fresh window
  const { before, last } = dealingOrder(s);
  s.hands = [...before, ...last];
  for (let round = 0; round < 2; round++) {
    for (const h of before) h.cards.push(draw(s));
    s.dealer.push(draw(s));
    for (const h of last) h.cards.push(draw(s));
  }
  s.phase = 'playing';
  for (const h of s.hands) h.done = isPok(h.cards); // a Pok is shown at once and can't draw
  if (isPok(s.dealer)) return settle(s, now); // a dealer Pok settles every hand on two cards
  nextTurn(s, now);
}

/** The next hand still to play, then the dealer. */
function nextTurn(s: GameState, now: number) {
  const next = s.hands.find((h) => !h.done);
  s.deadline = now + TURN_MS;
  if (next) return void Object.assign(s, { activeId: next.owner, activeHand: next.id });
  s.activeHand = null;
  const banker = s.bankerId ? find(s, s.bankerId) : null;
  if (banker && !banker.left) return void (s.activeId = banker.id);
  houseDraw(s);
  settle(s, now);
}

function houseDraw(s: GameState) {
  if (score(s.dealer) <= DRAW_ON) s.dealer.push(draw(s));
}

/**
 * Settle hands against the dealer. Losers pay first (never more than they have); then the dealer pays winners in
 * dealing order, and a dealer who runs dry pays no more. The app, dealing alone, never runs dry.
 */
function pay(s: GameState, hands: Hand[]) {
  const banker = s.bankerId ? find(s, s.bankerId)! : null;
  const owed = hands.map((h) => h.bet * compare(h.cards, s.dealer));
  hands.forEach((h, i) => {
    if (owed[i] > 0) return;
    const p = find(s, h.owner)!;
    const lost = Math.min(-owed[i], h.bet + p.chips);
    p.chips += h.bet - lost;
    if (banker) banker.chips += lost;
    Object.assign(h, { net: -lost, outcome: lost ? 'lose' : 'push', done: true });
  });
  hands.forEach((h, i) => {
    if (owed[i] <= 0) return;
    const paid = banker ? Math.min(owed[i], banker.chips) : owed[i];
    if (banker) banker.chips -= paid;
    find(s, h.owner)!.chips += h.bet + paid;
    Object.assign(h, { net: paid, outcome: 'win', done: true });
  });
}

function settle(s: GameState, now: number) {
  Object.assign(s, { activeId: null, activeHand: null, deadline: null, phase: 'settled', nextRoundAt: now + SETTLE_MS + REVEAL_MS });
  pay(s, s.hands.filter((h) => !h.outcome));
}

// ------------------------------------------------ actions

/** Hands the dealer could catch (จับ) on two cards: those still open with that many cards. */
export const catchable = (s: GameState, cards: 2 | 3) => s.hands.filter((h) => !h.outcome && h.cards.length === cards);

/** A two-card hand under 4 that the house rule says must draw. */
export const mustDraw = (s: GameState, h: Hand) => s.config.mustDraw && h.cards.length === 2 && score(h.cards) < 4;

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  const p = find(s, id);
  if (!p) throw new Error("You're not seated");

  if (action.type === 'bet' || action.type === 'ready' || action.type === 'clear' || action.type === 'limit') {
    if (s.phase !== 'betting') throw new Error('Betting is closed');
    if (action.type === 'limit') {
      if (id !== s.bankerId) throw new Error('Only the dealer sets the limit');
      const { amount } = action;
      if (amount !== null && (!Number.isInteger(amount) || amount < s.config.minBet)) throw new Error('Invalid limit');
      s.maxBet = amount;
      // Bets over a new limit come down to it; the difference goes back.
      for (const h of s.hands) if (amount !== null && h.bet > amount) {
        find(s, h.owner)!.chips += h.bet - amount;
        h.bet = amount;
      }
      return;
    }
    if (id === s.bankerId) throw new Error("The dealer doesn't bet");
    if (p.ready) throw new Error("You're already in");
    if (action.type === 'clear') {
      for (const h of handsOf(s, id)) p.chips += h.bet;
      s.hands = s.hands.filter((h) => h.owner !== id);
      return;
    }
    if (action.type === 'bet') {
      const { amount, spot } = action;
      if (handsOf(s, id).length >= MAX_LEGS) throw new Error(`${MAX_LEGS} hands at most`);
      if (s.hands.length >= MAX_HANDS) throw new Error('The table is full of hands');
      if (!Number.isInteger(amount) || amount < s.config.minBet || amount > p.chips) throw new Error('Invalid bet');
      if (s.maxBet !== null && amount > s.maxBet) throw new Error(`The dealer's limit is ${s.maxBet}`);
      if (spot !== 'seat' && spot !== 'last' && (spot === id || spot === s.bankerId || !find(s, spot))) throw new Error('You can only cut in before another player');
      p.chips -= amount;
      p.lastBet = amount;
      s.hands.push({ id: Math.max(0, ...s.hands.map((h) => h.id)) + 1, owner: id, spot, cards: [], bet: amount, done: false, outcome: null, net: 0 });
      if (!action.ready) return;
    }
    p.ready = true; // 'ready' with no bet sits the round out
    return dealIfReady(s, now);
  }

  if (s.phase !== 'playing' || s.activeId !== id) throw new Error('Not your turn');
  if (s.activeHand !== null) {
    const h = s.hands.find((x) => x.id === s.activeHand)!;
    if (action.type === 'draw') h.cards.push(draw(s));
    else if (action.type !== 'stay') throw new Error('Draw or stay');
    else if (mustDraw(s, h)) throw new Error('Under 4 you must draw');
    h.done = true;
    return nextTurn(s, now);
  }
  // The dealer's turn: catch a group on two cards (once, before drawing), then draw or stay for the rest.
  if (action.type === 'catch') {
    if (s.caught || s.dealer.length !== 2) throw new Error('You can only catch once, before drawing');
    if (!catchable(s, action.cards).length) throw new Error(`No ${action.cards}-card hands to catch`);
    s.caught = action.cards;
    pay(s, catchable(s, action.cards));
    if (s.hands.every((h) => h.outcome)) return settle(s, now);
    s.deadline = now + TURN_MS;
    return;
  }
  if (action.type === 'draw') s.dealer.push(draw(s));
  else if (action.type !== 'stay') throw new Error('Catch, draw or stay');
  settle(s, now);
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action, now);
    s.lastActionAt = now;
  });
}

/** What a bot, or anyone who runs out of time, does now. */
function autoAction(s: GameState, bot: boolean): PlayerAction {
  if (s.activeHand !== null) return { type: score(s.hands.find((h) => h.id === s.activeHand)!.cards) <= DRAW_ON ? 'draw' : 'stay' };
  // ponytail: a bot dealer on 5 or more catches the players who drew (they started weak), then stays.
  if (bot && !s.caught && s.dealer.length === 2 && score(s.dealer) >= 5 && catchable(s, 3).length) return { type: 'catch', cards: 3 };
  return { type: s.dealer.length === 2 && score(s.dealer) <= DRAW_ON ? 'draw' : 'stay' };
}

/** Host clock: bots, closing bets, timeouts, the next round. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, activeId, deadline } = state;
  if (phase === 'betting' && deadline !== null && now >= deadline - BET_MS + BOT_DELAY_MS) {
    const bot = state.players.find((p) => isBot(p.id) && p.id !== state.bankerId && !p.ready);
    if (bot) return update(state, (s) => act(s, bot.id, { type: 'bet', amount: s.config.minBet, spot: 'seat', ready: true }, now));
  }
  if (phase === 'playing' && activeId && isBot(activeId) && deadline !== null && now >= deadline - TURN_MS + BOT_DELAY_MS) {
    return update(state, (s) => act(s, activeId, autoAction(s, true), now));
  }
  if (deadline !== null && now >= deadline) {
    if (phase === 'betting') return update(state, (s) => deal(s, now)); // timeouts don't count as activity
    if (phase === 'playing' && activeId) return update(state, (s) => act(s, activeId, autoAction(s, false), now));
  }
  const funded = state.players.filter((p) => p.chips >= state.config.minBet && !p.left).length;
  const ready = (funded > 0 || state.queue.length > 0) && (!state.botMatch || funded + state.queue.length > 1);
  if (state.started && ((phase === 'settled' && now >= state.nextRoundAt!) || (phase === 'waiting' && ready))) {
    return update(state, (s) => startRound(s, now));
  }
  return state;
}

/**
 * What one viewer may see: no deck. While hands are played, each player sees only their own hands and the dealer only
 * the dealer's cards; a Pok, and any hand already settled by a catch, is face up. Spectators see everything.
 */
export function maskFor(state: GameState, viewerId: string): GameState {
  return update(state, (s) => {
    s.deck = [];
    if (s.phase !== 'playing' || isSpectator(s, viewerId)) return;
    if (viewerId !== s.bankerId && !s.caught) s.dealer = s.dealer.map(() => '??');
    for (const h of s.hands) if (h.owner !== viewerId && !isPok(h.cards) && !h.outcome) h.cards = h.cards.map(() => '??');
  });
}
