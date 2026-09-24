import * as engine from '../engine/rouletteEngine';
import { str, TableNet as Net, type Identity, type NetEvents, type Rules } from '../../../shared/tableNet';
import type { GameState, PlayerAction } from '../types/roulette';

export { randomRoomCode, type Identity, type NetStatus } from '../../../shared/tableNet';

/** Roulette's side of the shared room: the engine, the room-id prefix and the shape of a move. */
const rules: Rules<GameState, PlayerAction> = {
  ...engine,
  prefix: 'p2p-roulette-v4-',
  // The engine checks the spot itself against the board.
  validAction: (a): a is PlayerAction => {
    const x = a as PlayerAction | null;
    return !!x && (['clear', 'repeat', 'done'].includes(x.type) || (x.type === 'bet' && str(x.spot, 8) && Number.isInteger(x.amount)));
  },
  resume: (s, now) => (s.deadline ? { ...s, deadline: now + engine.BET_MS } : s),
};

export type TableNet = Net<GameState, PlayerAction>;
export const TableNet = {
  host: (roomCode: string, me: Identity, game: GameState, events: NetEvents<GameState>) => Net.host(rules, roomCode, me, game, events),
  join: (roomCode: string, me: Identity, events: NetEvents<GameState>) => Net.join(rules, roomCode, me, events),
};
