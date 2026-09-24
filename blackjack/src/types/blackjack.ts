type Suit = 's' | 'h' | 'd' | 'c';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** "As", "Td"; "??" is the dealer's face-down card. */
export type Card = `${Rank}${Suit}` | '??';

/** waiting: not enough players. betting: everyone places a bet. playing: players act in seat order. settled: results on show. */
type Phase = 'waiting' | 'betting' | 'playing' | 'settled';

export interface TableConfig {
  startingStack: number;
  minBet: number;
  decks: number;
}

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Came from a split: two-card 21 is not a blackjack. */
  split: boolean;
  done: boolean;
  outcome: Outcome | null;
  /** Chips paid back at settlement (stake included). */
  payout: number;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** Empty until the player bets this round; more than one after a split. */
  hands: Hand[];
  lastBet: number;
  connected: boolean;
  /** Left the room; removed at the next round. */
  left: boolean;
}

interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export type PlayerAction =
  | { type: 'bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' };

export interface GameState {
  roomCode: string;
  config: TableConfig;
  started: boolean;
  /** A bot match ends when only one funded seat remains. */
  botMatch: boolean;
  phase: Phase;
  round: number;
  /** Seated players, sorted by seat (max 7). Play goes in seat order. */
  players: Player[];
  queue: QueuedPlayer[];
  /** Watching, not playing. They see every card. */
  spectators: QueuedPlayer[];
  dealer: Card[];
  /** Host only; stripped from every view. */
  shoe: Card[];
  activeId: string | null;
  /** Which of the active player's hands is being played. */
  activeHand: number;
  /** End of the betting window or of the active player's turn. */
  deadline: number | null;
  nextRoundAt: number | null;
  lastActionAt: number;
}
