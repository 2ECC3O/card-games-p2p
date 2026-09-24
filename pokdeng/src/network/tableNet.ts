import * as engine from '../engine/pokDengEngine';
import { str, TableNet as Net, type Identity, type NetEvents, type Rules } from '../../../shared/tableNet';
import type { GameState, PlayerAction } from '../types/pokdeng';

export { randomRoomCode, type Identity, type NetStatus } from '../../../shared/tableNet';

/** Pok Deng's side of the shared room: the engine, the room-id prefix and the shape of a move. */
const rules: Rules<GameState, PlayerAction> = {
  ...engine,
  prefix: 'p2p-pokdeng-v2-',
  validAction: (a): a is PlayerAction => {
    const x = a as PlayerAction | null;
    return !!x && (['draw', 'stay', 'ready', 'clear'].includes(x.type)
      || (x.type === 'bet' && Number.isInteger(x.amount) && str(x.spot, 64) && (x.ready === undefined || typeof x.ready === 'boolean'))
      || (x.type === 'limit' && (x.amount === null || Number.isInteger(x.amount)))
      || (x.type === 'catch' && (x.cards === 2 || x.cards === 3)));
  },
  resume: (s, now) => (s.deadline ? { ...s, deadline: now + engine.TURN_MS } : s),
};

export type TableNet = Net<GameState, PlayerAction>;
export const TableNet = {
  host: (roomCode: string, me: Identity, game: GameState, events: NetEvents<GameState>) => Net.host(rules, roomCode, me, game, events),
  join: (roomCode: string, me: Identity, events: NetEvents<GameState>) => Net.join(rules, roomCode, me, events),
};
