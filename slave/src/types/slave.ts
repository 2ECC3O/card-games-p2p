export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A' | '2';
/** "As", "Td"; "??" is a card this viewer can't see. */
export type Card = `${Rank}${Suit}` | '??';

/** Earned by finishing order: King first out, Slave last. Serf (รองสลาฟ) is second from last. */
export type Title = 'King' | 'Queen' | 'Citizen' | 'Serf' | 'Slave';

/** waiting: not enough players. exchange: the King and Queen pick cards to give back. playing: tricks. settled: results on show. */
export type Phase = 'waiting' | 'exchange' | 'playing' | 'settled';

export interface Player {
  id: string;
  name: string;
  seat: number;
  hand: Card[];
  /** From the last finished round; null until then. */
  title: Title | null;
  /** Each round, finishing k-th of n earns n − k. */
  points: number;
  connected: boolean;
  /** Left the room; plays itself out and is removed at the next round. */
  left: boolean;
}

export interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
}

/** Cards passed at the start of a round. Up the ladder it's the giver's best, automatically; down it's the giver's pick. */
export interface Give {
  from: string;
  to: string;
  count: number;
  /** Empty until given. */
  cards: Card[];
}

export type PlayerAction = { type: 'play'; cards: Card[] } | { type: 'pass' } | { type: 'give'; cards: Card[] };

export interface GameState {
  roomCode: string;
  started: boolean;
  phase: Phase;
  round: number;
  /** Seated players, sorted by seat. */
  players: Player[];
  queue: QueuedPlayer[];
  /** Watching, not playing. They see every card. */
  spectators: QueuedPlayer[];
  /** The play to beat; null when the next player leads. */
  pile: { by: string; cards: Card[] } | null;
  /** Passed on this pile; out until it clears. */
  passed: string[];
  /** Finishing order this round. */
  out: string[];
  gives: Give[];
  activeId: string | null;
  /** Turn order this round: 1 clockwise (up the seats), −1 the other way. */
  dir: 1 | -1;
  deadline: number | null;
  nextRoundAt: number | null;
  lastActionAt: number;
}
