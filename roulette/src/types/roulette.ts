/**
 * Where a bet can go: a single number ("n0" to "n36", and "n37" for 00 on a double-zero wheel) or an outside bet. d1-d3 are the dozens (1-12, 13-24,
 * 25-36), c1-c3 the columns (c1 = 1, 4, 7 ... 34).
 */
export type Spot = `n${number}` | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'd1' | 'd2' | 'd3' | 'c1' | 'c2' | 'c3';

/** waiting: nobody seated. betting: everyone places chips. settled: the wheel has spun, results on show. */
type Phase = 'waiting' | 'betting' | 'settled';

export interface TableConfig {
  startingStack: number;
  minBet: number;
  /** American wheel: a 00 pocket (stored as 37) beside the 0, 38 pockets in all. */
  doubleZero?: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  /** Chips on each spot this round (already taken from `chips`). */
  bets: Partial<Record<Spot, number>>;
  /** The bets of the last round this player played, for Repeat. */
  lastBets: Partial<Record<Spot, number>>;
  /** Finished betting this round. */
  done: boolean;
  /** Chips paid back at settlement (stakes included). */
  payout: number;
  connected: boolean;
}

interface QueuedPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export type PlayerAction =
  | { type: 'bet'; spot: Spot; amount: number }
  | { type: 'clear' }
  | { type: 'repeat' }
  | { type: 'done' };

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
  /** The winning number once the wheel has spun this round. */
  result: number | null;
  /** Recent winning numbers, newest first. */
  history: number[];
  /** End of the betting window. */
  deadline: number | null;
  nextRoundAt: number | null;
  lastActionAt: number;
}
