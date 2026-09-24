import type { Card, GameState, Player, PlayerAction, Title } from '../types/slave';

export const MAX_SEATS = 8;
/** Starting with fewer players fills the table to this with bots. */
export const MIN_TABLE = 4;
export const MAX_QUEUE = 20;
export const TURN_MS = 30_000;
export const SETTLE_MS = 8_000;
export const IDLE_MS = 5 * 60_000;
export const isBot = (id: string) => /^bot:\d+$/.test(id);
const BOT_DELAY_MS = 900;
/** The exchange is slower, so everyone sees the cards change hands: bots give back after this, */
const BOT_GIVE_MS = 2_500;
/** and the finished exchange stays on show this long before the first lead. */
export const EXCHANGE_SHOW_MS = 4_000;

// ------------------------------------------------ cards

/** 3 is the lowest rank and 2 the highest. Within a rank, suits go ♣ < ♦ < ♥ < ♠, so 2♠ is the top card. */
export const RANKS = '3456789TJQKA2';
export const rank = (c: Card) => RANKS.indexOf(c[0]);
const SUITS = 'cdhs';
/** Low to high, clubs first within a rank. */
export const sortCards = (cards: Card[]) => [...cards].sort((a, b) => rank(a) - rank(b) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));

/** Unbiased crypto-random integer in [0, n). */
function randomInt(n: number): number {
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** One fresh deck per round, Fisher-Yates shuffled. No jokers. */
function newDeck(): Card[] {
  const d = [...RANKS].flatMap((r) => [...SUITS].map((s) => `${r}${s}` as Card));
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const value = (c: Card) => rank(c) * 4 + SUITS.indexOf(c[1]);
const top = (cards: Card[]) => Math.max(...cards.map(value));

/**
 * One to four cards of one rank. Anything goes on an empty pile; otherwise the same count with a higher top card: a
 * higher rank, or the same rank with a higher suit (7♠ on 7♥, 7♠ 7♣ on 7♥ 7♦). Three of a kind (ตอง) also beats
 * any single, and four of a kind any pair.
 */
export function beats(cards: Card[], pile: Card[] | null): boolean {
  if (!cards.length || cards.length > 4 || cards.some((c) => c[0] !== cards[0][0])) return false;
  if (!pile) return true;
  if (cards.length === pile.length) return top(cards) > top(pile);
  return (pile.length === 1 && cards.length === 3) || (pile.length === 2 && cards.length === 4);
}

/** Titles down a final ranking of n players. Queen and Serf need four players. */
export function titles(n: number): Title[] {
  const t: Title[] = Array(n).fill('Citizen');
  if (n >= 4) [t[1], t[n - 2]] = ['Queen', 'Serf'];
  t[0] = 'King';
  t[n - 1] = 'Slave';
  return t;
}

/** Finishing order after the falls: a King who isn't first out drops to Slave; a Queen who then isn't in the top two drops to Serf. */
export function ranking(out: string[], king?: string, queen?: string): string[] {
  const r = [...out];
  const drop = (id: string, fromEnd: number) => {
    r.splice(r.indexOf(id), 1);
    r.splice(r.length + 1 - fromEnd, 0, id);
  };
  if (king && r.includes(king) && r[0] !== king) drop(king, 1);
  const q = queen ? r.indexOf(queen) : -1;
  if (r.length >= 4 && q > 1 && q < r.length - 2) drop(queen!, 2); // already Serf or Slave: stays there
  return r;
}

/** Cards grouped by rank, low to high. `hand` is sorted. */
function groupsOf(hand: Card[]): Card[][] {
  const groups: Card[][] = [];
  for (const c of hand) {
    const last = groups.at(-1);
    if (last && last[0][0] === c[0]) last.push(c);
    else groups.push([c]);
  }
  return groups;
}

/**
 * A bot's play, or null to pass. `hand` is sorted; `others` holds the card counts of the opponents still in.
 * It goes out whenever one play empties its hand. Leading, it plays its lowest rank whole, but cashes its 2s first
 * when they're all that stands between it and going out, and with an opponent on one card it leads a set, or else
 * its highest single. Following, it plays the lowest set that fits, breaking up a bigger set only when nothing fits.
 * It holds back 2s, and three or four of a kind as a bomb, until the end of the round: an opponent on two cards or
 * fewer, or itself on four or fewer.
 */
export function botMove(hand: Card[], pile: Card[] | null, others: number[] = []): Card[] | null {
  const groups = groupsOf(hand);
  if (groups.length === 1 && beats(groups[0], pile)) return groups[0];
  const endgame = Math.min(...others) <= 2 || hand.length <= 4;
  if (!pile) {
    if (groups.length === 2 && groups[1][0][0] === '2') return groups[1];
    if (others.includes(1)) return groups.find((g) => g.length > 1) ?? groups.at(-1)!;
    return groups[0];
  }
  const k = pile.length;
  const pick =
    groups.find((g) => g.length === k && beats(g, pile)) ??
    groups.filter((g) => g.length > k).flatMap((g) => [g.slice(0, k), g.slice(-k)]).find((g) => beats(g, pile)) ?? // lowest suits, or the top suit on the same rank
    (endgame ? groups.find((g) => g.length === k + 2) : undefined); // a bomb: three on a single, four on a pair
  return pick && (endgame || pick[0][0] !== '2') ? pick : null;
}

/** A bot's cards to give back in the exchange: its lowest singles first, keeping its sets together. */
export function botGive(hand: Card[], count: number): Card[] {
  const singles = groupsOf(hand).filter((g) => g.length === 1).flat();
  return [...singles, ...hand.filter((c) => !singles.includes(c))].slice(0, count);
}

// ------------------------------------------------ helpers

const update = (state: GameState, fn: (s: GameState) => void): GameState => {
  const s = structuredClone(state);
  fn(s);
  return s;
};

const find = (s: GameState, id: string) => s.players.find((p) => p.id === id);
/** First of `among` (sorted by seat) after `id`'s seat, going round this round's way. */
const nextAfter = (s: GameState, id: string, among: Player[]) => {
  const seat = find(s, id)?.seat ?? -1;
  const order = s.dir === 1 ? among : [...among].reverse();
  return order.find((p) => (p.seat - seat) * s.dir > 0) ?? order[0];
};

function seat(s: GameState, id: string, name: string, connected: boolean) {
  const taken = new Set(s.players.map((p) => p.seat));
  let free = 0;
  while (taken.has(free)) free++;
  s.players.push({ id, name, seat: free, hand: [], title: null, points: 0, connected, left: false });
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

export function createGame(roomCode: string, now: number): GameState {
  return {
    roomCode, started: false, phase: 'waiting', round: 0, players: [], queue: [], spectators: [],
    pile: null, passed: [], out: [], gives: [], swapped: false, activeId: null, dir: 1, deadline: null, nextRoundAt: null, lastActionAt: now,
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
      seat(s, id, name, true);
    } else {
      s.queue.push({ id, name, connected: true });
    }
  });
}

/** Host-owned seat; queued during play. */
export function addBot(state: GameState, now: number): GameState {
  if (state.players.length + state.queue.length >= MAX_SEATS) return state;
  return update(state, (s) => {
    const number = Math.max(0, ...[...s.players, ...s.queue].map((p) => Number(/^bot:(\d+)$/.exec(p.id)?.[1] ?? 0))) + 1;
    const id = `bot:${number}`;
    const name = `Bot ${number}`;
    if (!s.started) seat(s, id, name, true);
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

/** Between rounds the seat goes at once; mid-round it plays itself out and goes at the next deal. */
export function removePlayer(state: GameState, id: string, now: number): GameState {
  return update(state, (s) => {
    s.lastActionAt = now;
    s.queue = s.queue.filter((q) => q.id !== id);
    s.spectators = s.spectators.filter((w) => w.id !== id);
    const p = find(s, id);
    if (!p) return;
    if (s.phase === 'playing' || s.phase === 'exchange') p.left = true;
    else s.players = s.players.filter((x) => x !== p);
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
  let s = state;
  while (s.players.length < MIN_TABLE) s = addBot(s, now);
  return update(s, (x) => {
    x.started = true;
    x.lastActionAt = now;
    startRound(x, now);
  });
}

// ------------------------------------------------ round flow

/** Mutates: seat the queue, deal the whole deck, then the exchange. `deck` lets tests stack the cards. */
export function startRound(s: GameState, now: number, deck?: Card[]) {
  s.players = s.players.filter((p) => !p.left);
  while (s.players.length < MAX_SEATS && s.queue.length) {
    const q = s.queue.shift()!;
    seat(s, q.id, q.name, q.connected);
  }
  Object.assign(s, { pile: null, passed: [], out: [], gives: [], swapped: false, activeId: null, dir: 1, deadline: null, nextRoundAt: null });
  for (const p of s.players) p.hand = [];
  if (s.players.length < 2) return void (s.phase = 'waiting');
  (deck ?? newDeck()).forEach((c, i) => s.players[i % s.players.length].hand.push(c));
  for (const p of s.players) p.hand = sortCards(p.hand);
  s.round++;
  // Up the ladder the best cards are set aside at once; the King and Queen pick the same number from their own hand
  // to give back. Nothing changes hands until every give is chosen (see swap).
  const titled = (t: Title) => s.players.find((p) => p.title === t);
  for (const [low, high, count] of [['Slave', 'King', 2], ['Serf', 'Queen', 1]] as const) {
    const from = titled(low), to = titled(high);
    if (!from || !to) continue;
    s.gives.push({ from: from.id, to: to.id, count, cards: from.hand.slice(-count) }, { from: to.id, to: from.id, count, cards: [] });
  }
  if (!s.gives.length) return lead(s, now);
  s.phase = 'exchange';
  s.deadline = now + TURN_MS;
}

/**
 * Whoever holds 3♣ (after the exchange) leads. Turns then go whichever way reaches last round's Slave sooner;
 * clockwise on a tie, in the first round, or when the Slave holds 3♣.
 */
function lead(s: GameState, now: number) {
  const n = s.players.length;
  const first = s.players.findIndex((p) => p.hand.includes('3c'));
  const slave = s.players.findIndex((p) => p.title === 'Slave');
  const dir = slave >= 0 && (first - slave + n) % n < (slave - first + n) % n ? -1 : 1;
  Object.assign(s, { phase: 'playing', activeId: s.players[first].id, dir, deadline: now + TURN_MS });
}

/** After a play or a pass: the next player still in on this pile, or a fresh lead once everyone else has passed. */
function next(s: GameState, from: string, now: number) {
  const live = s.players.filter((p) => p.hand.length);
  if (live.length <= 1) return settle(s, live, now);
  const pile = s.pile!;
  const waiting = live.filter((p) => p.id !== pile.by && !s.passed.includes(p.id));
  if (waiting.length) s.activeId = nextAfter(s, from, waiting).id;
  else {
    // Whoever played the pile leads; if they're out, the next player on.
    s.activeId = live.some((p) => p.id === pile.by) ? pile.by : nextAfter(s, pile.by, live).id;
    Object.assign(s, { pile: null, passed: [] });
  }
  s.deadline = now + TURN_MS;
}

/** Every give is chosen: all the cards change hands at once, and the swap stays on show before the first lead. */
function swap(s: GameState, now: number) {
  for (const g of s.gives) {
    const from = find(s, g.from)!;
    from.hand = from.hand.filter((c) => !g.cards.includes(c));
  }
  for (const g of s.gives) {
    const to = find(s, g.to)!;
    to.hand = sortCards([...to.hand, ...g.cards]);
  }
  Object.assign(s, { swapped: true, deadline: now + EXCHANGE_SHOW_MS });
}

function settle(s: GameState, live: Player[], now: number) {
  s.out.push(...live.map((p) => p.id));
  const order = ranking(s.out, s.players.find((p) => p.title === 'King')?.id, s.players.find((p) => p.title === 'Queen')?.id);
  const t = titles(order.length);
  order.forEach((id, i) => {
    const p = find(s, id)!;
    p.title = t[i];
    p.points += order.length - 1 - i;
  });
  // The last play stays on show until the next deal.
  Object.assign(s, { phase: 'settled', activeId: null, deadline: null, passed: [], nextRoundAt: now + SETTLE_MS });
}

// ------------------------------------------------ actions

function own(p: Player, cards: Card[]) {
  if (new Set(cards).size !== cards.length || !cards.every((c) => c !== '??' && p.hand.includes(c))) throw new Error("You don't hold those cards");
  return cards;
}

function act(s: GameState, id: string, action: PlayerAction, now: number) {
  const p = find(s, id);
  if (!p) throw new Error("You're not seated");

  if (action.type === 'give') {
    const g = s.gives.find((x) => x.from === id && !x.cards.length);
    if (s.phase !== 'exchange' || !g) throw new Error('Nothing to give');
    const cards = own(p, action.cards);
    if (cards.length !== g.count) throw new Error(`Give ${g.count} card${g.count > 1 ? 's' : ''}`);
    g.cards = sortCards(cards);
    if (s.gives.every((x) => x.cards.length)) swap(s, now);
    return;
  }

  if (s.phase !== 'playing' || s.activeId !== id) throw new Error('Not your turn');
  if (action.type === 'pass') {
    if (!s.pile) throw new Error('You lead: play something');
    s.passed.push(id);
  } else {
    const cards = own(p, action.cards);
    if (!beats(cards, s.pile?.cards ?? null)) throw new Error(s.pile ? "That doesn't beat the pile" : 'Play one to four cards of one rank');
    p.hand = p.hand.filter((c) => !cards.includes(c));
    s.pile = { by: id, cards: sortCards(cards) };
    if (!p.hand.length) s.out.push(id);
  }
  next(s, id, now);
}

export function applyAction(state: GameState, id: string, action: PlayerAction, now: number): GameState {
  return update(state, (s) => {
    act(s, id, action, now);
    s.lastActionAt = now;
  });
}

/** What a bot does now. A player who runs out of time passes, or leads or gives back their lowest cards. */
function autoAction(s: GameState, id: string, bot: boolean): PlayerAction {
  const p = find(s, id)!;
  const g = s.gives.find((x) => x.from === id && !x.cards.length);
  if (s.phase === 'exchange' && g) return { type: 'give', cards: bot ? botGive(p.hand, g.count) : p.hand.slice(0, g.count) };
  if (!bot) return s.pile ? { type: 'pass' } : { type: 'play', cards: [p.hand[0]] };
  const others = s.players.filter((x) => x.id !== id && x.hand.length).map((x) => x.hand.length);
  const cards = botMove(p.hand, s.pile?.cards ?? null, others);
  return cards ? { type: 'play', cards } : { type: 'pass' };
}

/** Host clock: bots, timeouts, the next round. Returns the same object when nothing changed. */
export function hostTick(state: GameState, now: number): GameState {
  const { phase, deadline } = state;
  // Bots and players who left move after a short pause; everyone else when their time runs out.
  const auto = (id: string) => isBot(id) || !!find(state, id)?.left;
  const pause = phase === 'exchange' ? BOT_GIVE_MS : BOT_DELAY_MS;
  const due = (id: string) => deadline !== null && (now >= deadline || (auto(id) && now >= deadline - TURN_MS + pause));
  const mover = phase === 'exchange' ? state.gives.find((g) => !g.cards.length && due(g.from))?.from : phase === 'playing' && state.activeId && due(state.activeId) ? state.activeId : null;
  if (mover) return update(state, (s) => act(s, mover, autoAction(s, mover, auto(mover)), now));
  if (phase === 'exchange' && state.swapped && now >= deadline!) return update(state, (s) => lead(s, now));
  if (state.started && ((phase === 'settled' && now >= state.nextRoundAt!) || (phase === 'waiting' && state.players.length + state.queue.length >= 2))) {
    return update(state, (s) => startRound(s, now));
  }
  return state;
}

/** What one viewer may see: only their own hand, and only exchanges they're part of. Spectators see everything. */
export function maskFor(state: GameState, viewerId: string): GameState {
  if (isSpectator(state, viewerId)) return state;
  return update(state, (s) => {
    for (const p of s.players) if (p.id !== viewerId) p.hand = p.hand.map(() => '??');
    for (const g of s.gives) if (g.from !== viewerId && g.to !== viewerId) g.cards = g.cards.map(() => '??');
  });
}

// ------------------------------------------------ odds

/** The plays from `hand`: per rank and size, its lowest suits and its highest; and a pass when there's a pile. */
function options(hand: Card[], pile: Card[] | null): PlayerAction[] {
  const all: PlayerAction[] = pile ? [{ type: 'pass' }] : [];
  for (const g of groupsOf(hand)) for (let n = 1; n <= g.length; n++) for (const cards of n < g.length ? [g.slice(0, n), g.slice(-n)] : [g]) if (beats(cards, pile)) all.push({ type: 'play', cards });
  return all;
}

/**
 * Spectators' odds: each seat's chance to end this round as King, and as Slave, from `samples` playouts of the cards
 * on the table. Everyone plays like a bot, with a random legal move three times in ten so the playouts differ.
 * Seeded by the cards, so every screen shows the same numbers. Empty unless every hand is visible.
 */
export function odds(state: GameState, samples = 200): Record<string, { king: number; slave: number }> {
  if (state.phase !== 'playing' || state.players.some((p) => p.hand.includes('??'))) return {};
  let seed = 2166136261;
  for (const ch of JSON.stringify([state.players.map((p) => p.hand), state.pile, state.passed, state.activeId])) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  const tally = Object.fromEntries(state.players.map((p) => [p.id, { king: 0, slave: 0 }]));
  for (let i = 0; i < samples; i++) {
    const s = structuredClone(state);
    while (s.phase === 'playing') {
      const id = s.activeId!;
      const moves = options(find(s, id)!.hand, s.pile?.cards ?? null);
      act(s, id, random() < 0.3 ? moves[Math.floor(random() * moves.length)] : autoAction(s, id, true), 0);
    }
    for (const p of s.players) {
      if (p.title === 'King') tally[p.id].king++;
      if (p.title === 'Slave') tally[p.id].slave++;
    }
  }
  return Object.fromEntries(Object.entries(tally).map(([id, c]) => [id, { king: c.king / samples, slave: c.slave / samples }]));
}
