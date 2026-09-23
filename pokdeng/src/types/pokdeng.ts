export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** "As", "Td"; "??" is a card this viewer can't see yet. */
export type Card = `${Rank}${Suit}` | '??';

/** waiting: not enough players. betting: everyone places a bet. playing: players draw or stay in seat order. settled: results on show. */
export type Phase = 'waiting' | 'betting' | 'playing' | 'settled';

export interface TableConfig {
  startingStack: number;
  minBet: number;
}

export type Outcome = 'win' | 'push' | 'lose';

export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** Empty until dealt; two or three cards. */
  cards: Card[];
  /** 0 until the player bets this round. */
  bet: number;
  done: boolean;
  outcome: Outcome | null;
  /** Chips won (positive) or lost (negative) at settlement, beyond the returned stake. */
  net: number;
  lastBet: number;
  connected: boolean;
  /** Left the room; removed at the next round. */
  left: boolean;
}

export interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export type PlayerAction = { type: 'bet'; amount: number } | { type: 'draw' } | { type: 'stay' };

export interface GameState {
  roomCode: string;
  config: TableConfig;
  started: boolean;
  /** A bot match ends when only one funded seat remains. */
  botMatch: boolean;
  phase: Phase;
  round: number;
  /** Seated players, sorted by seat. Play goes in seat order. */
  players: Player[];
  queue: QueuedPlayer[];
  /** Watching, not playing. They see every card. */
  spectators: QueuedPlayer[];
  dealer: Card[];
  /** Host only; stripped from every view. */
  deck: Card[];
  activeId: string | null;
  /** End of the betting window or of the active player's turn. */
  deadline: number | null;
  nextRoundAt: number | null;
  lastActionAt: number;
}
