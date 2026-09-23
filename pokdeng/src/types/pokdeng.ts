export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** "As", "Td"; "??" is a card this viewer can't see yet. */
export type Card = `${Rank}${Suit}` | '??';

/** waiting: not enough players. betting: bets and the dealer's limit. playing: hands, then the dealer, in turn. settled: results on show. */
export type Phase = 'waiting' | 'betting' | 'playing' | 'settled';

export interface TableConfig {
  startingStack: number;
  minBet: number;
  /** House rule: a two-card hand under 4 must draw. */
  mustDraw: boolean;
}

export type Outcome = 'win' | 'push' | 'lose';

/** One hand (ขา). A player may bet on several. */
export interface Hand {
  id: number;
  owner: string;
  /** Where it's dealt: 'seat' (its owner's place), another player's id (cut in before them, ตัดขา) or 'last' (after the dealer, ขาบ๊วย). */
  spot: string;
  cards: Card[];
  bet: number;
  done: boolean;
  outcome: Outcome | null;
  /** Chips won (positive) or lost (negative) beyond the returned stake. */
  net: number;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  lastBet: number;
  /** Done betting this round. */
  ready: boolean;
  connected: boolean;
  /** Left the room; removed at the next round. */
  left: boolean;
}

export interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export type PlayerAction =
  | { type: 'bet'; amount: number; spot: string; ready?: boolean }
  | { type: 'ready' }
  | { type: 'clear' }
  | { type: 'limit'; amount: number | null }
  | { type: 'draw' }
  | { type: 'stay' }
  | { type: 'catch'; cards: 2 | 3 };

export interface GameState {
  roomCode: string;
  config: TableConfig;
  started: boolean;
  /** A bot match ends when only one funded seat remains. */
  botMatch: boolean;
  phase: Phase;
  round: number;
  /** Seated players, sorted by seat. */
  players: Player[];
  queue: QueuedPlayer[];
  /** Watching, not playing. They see every card. */
  spectators: QueuedPlayer[];
  /** This round's dealer, a player; null when one player sits alone and the app deals. */
  bankerId: string | null;
  /** Seat of the last dealer, so the deal passes on clockwise. */
  bankerSeat: number;
  /** The dealer's bet limit (อั้น); null for none. */
  maxBet: number | null;
  /** The dealer's cards. */
  dealer: Card[];
  /** In dealing order once dealt. */
  hands: Hand[];
  /** Host only; stripped from every view. */
  deck: Card[];
  /** Whose turn: a hand's owner, or the dealer. */
  activeId: string | null;
  /** The hand being played; null on the dealer's turn. */
  activeHand: number | null;
  /** Which group of hands the dealer caught (จับ) on two cards. */
  caught: 2 | 3 | null;
  /** End of the betting window or of the current decision. */
  deadline: number | null;
  nextRoundAt: number | null;
  lastActionAt: number;
}
