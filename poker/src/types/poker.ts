type Suit = 's' | 'h' | 'd' | 'c';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
/** pokersolver notation ("As", "Td"); "??" is a card hidden from this viewer. */
export type Card = `${Rank}${Suit}` | '??';

type HandPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export const BETTING_PHASES: HandPhase[] = ['preflop', 'flop', 'turn', 'river'];

export interface BlindLevel {
  small: number;
  big: number;
}

export interface TableConfig {
  startingStack: number;
  blindLevels: BlindLevel[];
  handsPerLevel: number;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in over the whole hand (drives side pots). */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Acted since the last full raise; false means they may still raise. */
  acted: boolean;
  /** Cards face up at showdown. */
  showCards: boolean;
  connected: boolean;
  /** Left the room; removed at the next hand. */
  left: boolean;
  lastAction: string | null;
  /** Completed hands dealt to this player, including folds. */
  handsPlayed: number;
  /** Completed hands in which this player won at least one pot, including ties. */
  handsWon: number;
}

export interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Keep this player's hand record when they rebuy after busting. */
  handsPlayed?: number;
  handsWon?: number;
}

export interface Pot {
  amount: number;
  eligible: string[];
  winners: string[];
  /** Winning hand description, e.g. "Two Pair, A's & 8's". */
  hand: string | null;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** amount = total bet on this street after raising ("raise to"). */
  | { type: 'raise'; amount: number };

export interface GameState {
  roomCode: string;
  config: TableConfig;
  started: boolean;
  phase: HandPhase;
  handNumber: number;
  blinds: BlindLevel;
  dealerSeat: number;
  /** Seated players, sorted by seat (max 10). */
  players: Player[];
  queue: QueuedPlayer[];
  /** Watching, not playing. They see every card. */
  spectators: QueuedPlayer[];
  board: Card[];
  /** Host only; stripped from every view. */
  deck: Card[];
  /** Filled at showdown. */
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  activeId: string | null;
  turnDeadline: number | null;
  nextHandAt: number | null;
  lastActionAt: number;
}
