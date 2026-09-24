import * as engine from '../engine/slaveEngine';
import { str, TableNet as Net, type Identity, type NetEvents, type Rules } from '../../../shared/tableNet';
import type { GameState, PlayerAction } from '../types/slave';

export { randomRoomCode, type Identity, type NetStatus } from '../../../shared/tableNet';

/** Slave's side of the shared room: the engine, the room-id prefix and the shape of a move. */
const rules: Rules<GameState, PlayerAction> = {
  ...engine,
  prefix: 'p2p-slave-v4-',
  validAction: (a): a is PlayerAction => {
    const x = a as PlayerAction | null;
    return !!x && (x.type === 'pass'
      || ((x.type === 'play' || x.type === 'give') && Array.isArray(x.cards) && x.cards.length <= 4 && x.cards.every((c) => str(c, 2))));
  },
  resume: (s, now) => (s.deadline ? { ...s, deadline: now + engine.TURN_MS } : s),
};

export type TableNet = Net<GameState, PlayerAction>;
export const TableNet = {
  host: (roomCode: string, me: Identity, game: GameState, events: NetEvents<GameState>) => Net.host(rules, roomCode, me, game, events),
  join: (roomCode: string, me: Identity, events: NetEvents<GameState>) => Net.join(rules, roomCode, me, events),
};
