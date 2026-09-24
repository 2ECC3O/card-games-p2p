export type Side = 0 | 1;
export type Group = 'solids' | 'stripes' | null;
type Phase = 'waiting' | 'aiming' | 'choice' | 'between' | 'finished';
export type Pocket = 0 | 1 | 2 | 3 | 4 | 5;
export interface Ball { n: number; x: number; y: number }
export interface Player { id: string; name: string; team: Side; connected: boolean }
interface QueuedPlayer { id: string; name: string; connected: boolean }
export interface Team { group: Group; racks: number; shots: number }
/** The last shot's inputs, so every browser can replay it: table before, cue direction (cos, sin), power, tip, run time. */
interface LastShot { id: number; balls: Ball[]; dirX: number; dirY: number; power: number; tipX: number; tipY: number; ms: number }
interface BreakChoice { type: 'illegal' | 'eight' | 'eight-foul' | 'foul'; team: Side }
export interface GameState {
  roomCode: string;
  mode: 'singles' | 'doubles';
  raceTo: number;
  started: boolean;
  phase: Phase;
  rack: number;
  balls: Ball[];
  players: Player[];
  queue: QueuedPlayer[];
  spectators: QueuedPlayer[];
  teams: [Team, Team];
  turnTeam: Side;
  activeId: string | null;
  nextMember: [number, number];
  breakShot: boolean;
  ballInHand: 'head' | 'any' | null;
  choice: BreakChoice | null;
  winner: Side | null;
  lastEvent: string;
  history: string[];
  lastShot: LastShot | null;
  /** A bot's chosen shot, shown to everyone for a moment before it plays. */
  botShot: { by: string; at: number; action: Extract<PlayerAction, { type: 'shot' }> } | null;
  /** When the balls stop and the shot clock starts. */
  turnStartedAt: number;
  lastActionAt: number;
}
export type PlayerAction =
  | { type: 'place'; x: number; y: number }
  | { type: 'shot'; angle: number; power: number; tipX: number; tipY: number; ball: number | null; pocket: Pocket | null; safety: boolean }
  | { type: 'choice'; option: 'accept' | 'head' | 'spot' | 'rebreak-self' | 'rebreak-other' }
  | { type: 'nextRack' };
